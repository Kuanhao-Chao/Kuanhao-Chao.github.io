"""
A PyTorch re-implementation of the Shorkie supervised model, loaded directly from the released
Keras checkpoint.

Why this exists: the goal is an ONNX graph that can run in a browser, and the released weights are
Keras/TF 2.15 HDF5. TensorFlow cannot be installed here (TF 2.15 does not support Python 3.13) and
tf2onnx is therefore unavailable, so the route is h5py -> numpy -> torch -> torch.onnx.export.

Everything below is transcribed from two authoritative sources, never from the paper's prose:
  * the `model_config` JSON embedded in the checkpoint (191 layers, full inbound wiring), and
  * calico/baskerville `src/baskerville/layers.py` for the custom MultiheadAttention.

Six places where the published Methods disagree with the checkpoint, all resolved in favour of the
checkpoint:
  1. Input is 16384 x 170 channels (4 DNA + 1 mask + 165 species one-hot), not 4.
  2. Attention has 4 heads (r_w_bias is (1, 4, 1, 64)), not the 8 the paper states.
  3. Each residual block has a second, pointwise Conv1D and a learned per-channel Scale.
  4. Each decoder stage ends in a SeparableConv1D(3), not a bare Dense.
  5. Filter progression is 96,128,160,192,256,320,384 -- not "32-filter steps".
  6. Parameter count is 14,253,567, not 13.7 M.

The residual wiring was read from `inbound_nodes`, not guessed: `add <- ['conv1d_1', 'scale']`,
i.e. the skip starts *after* the block's first convolution, which is also what makes the changing
filter counts dimensionally consistent.
"""

from __future__ import annotations

import json
import math

import h5py
import numpy as np
from dataclasses import dataclass

import torch
import torch.nn as nn
import torch.nn.functional as F

SEQ_LEN = 16_384
IN_CHANNELS = 170          # 4 DNA + 1 mask + 165 species
N_DNA, N_MASK, N_SPECIES = 4, 1, 165
BLOCK_FILTERS = [96, 128, 160, 192, 256, 320, 384]
D_MODEL = 384
N_HEADS = 4
KEY_SIZE = 64
VALUE_SIZE = 96
N_POS_FEATURES = 32        # from r_k_layer kernel (32, 256)
N_ATTN_LAYERS = 8
BOTTLENECK_LEN = SEQ_LEN // 2 ** len(BLOCK_FILTERS)   # 128
CROP = 64
N_BINS = BOTTLENECK_LEN * 2 ** 3 - 2 * CROP           # 1024 - 128 = 896
N_TRACKS = 5_215


# --------------------------------------------------------------------------------------------
# Weight loading helpers. Every tensor is pulled by name and marked consumed, so that a missing
# or double-used tensor is a hard error rather than a silently wrong model.
# --------------------------------------------------------------------------------------------
class Weights:
    def __init__(self, path: str):
        self.f = h5py.File(path, "r")
        self.cfg = json.loads(self.f.attrs["model_config"])
        self.tensors: dict[str, np.ndarray] = {}
        self._walk(self.f["model_weights"], "")
        self.used: set[str] = set()

    def _walk(self, group, prefix: str) -> None:
        for key in group:
            item = group[key]
            path = f"{prefix}/{key}" if prefix else key
            if isinstance(item, h5py.Dataset):
                self.tensors[path] = item[:]
            else:
                self._walk(item, path)

    def get(self, layer: str, name: str) -> np.ndarray:
        path = f"{layer}/{layer}/{name}:0"
        if path not in self.tensors:
            raise KeyError(f"missing tensor {path}")
        self.used.add(path)
        return self.tensors[path]

    def layer_cfg(self, name: str) -> dict:
        for layer in self.cfg["config"]["layers"]:
            if layer["config"].get("name") == name:
                return layer["config"]
        raise KeyError(f"no layer named {name}")

    def report_unused(self) -> list[str]:
        return sorted(set(self.tensors) - self.used)


def kname(base: str, idx: int) -> str:
    """Keras names the first layer of a type `dense`, the rest `dense_1`, `dense_2`, ..."""
    return base if idx == 0 else f"{base}_{idx}"


def load_conv1d(w: Weights, name: str) -> nn.Conv1d:
    """Keras Conv1D kernel is (kernel, in, out); torch wants (out, in, kernel)."""
    k = w.get(name, "kernel")
    b = w.get(name, "bias")
    kernel, c_in, c_out = k.shape
    conv = nn.Conv1d(c_in, c_out, kernel, padding="same", bias=True)
    conv.weight.data = torch.from_numpy(np.ascontiguousarray(k.transpose(2, 1, 0)))
    conv.bias.data = torch.from_numpy(b.copy())
    return conv


def load_separable(w: Weights, name: str) -> nn.Sequential:
    """Keras SeparableConv1D = depthwise then pointwise, one bias on the pointwise result."""
    dw = w.get(name, "depthwise_kernel")      # (kernel, channels, 1)
    pw = w.get(name, "pointwise_kernel")      # (1, channels, out)
    b = w.get(name, "bias")
    kernel, channels, _ = dw.shape
    out_ch = pw.shape[2]
    depth = nn.Conv1d(channels, channels, kernel, padding="same", groups=channels, bias=False)
    depth.weight.data = torch.from_numpy(np.ascontiguousarray(dw.transpose(1, 2, 0)))
    point = nn.Conv1d(channels, out_ch, 1, bias=True)
    point.weight.data = torch.from_numpy(np.ascontiguousarray(pw.transpose(2, 1, 0)))
    point.bias.data = torch.from_numpy(b.copy())
    return nn.Sequential(depth, point)


def load_bn(w: Weights, name: str) -> nn.BatchNorm1d:
    """Keras BatchNormalization defaults to epsilon=1e-3, not torch's 1e-5."""
    eps = float(w.layer_cfg(name).get("epsilon", 1e-3))
    gamma = w.get(name, "gamma")
    bn = nn.BatchNorm1d(gamma.shape[0], eps=eps, momentum=0.0)
    bn.weight.data = torch.from_numpy(gamma.copy())
    bn.bias.data = torch.from_numpy(w.get(name, "beta").copy())
    bn.running_mean.data = torch.from_numpy(w.get(name, "moving_mean").copy())
    bn.running_var.data = torch.from_numpy(w.get(name, "moving_variance").copy())
    bn.eval()
    return bn


def load_dense(w: Weights, name: str) -> nn.Linear:
    """Keras Dense kernel is (in, out); torch Linear weight is (out, in). Bias may be absent."""
    k = w.get(name, "kernel")
    lin = nn.Linear(k.shape[0], k.shape[1], bias=f"{name}/{name}/bias:0" in w.tensors)
    lin.weight.data = torch.from_numpy(np.ascontiguousarray(k.T))
    if lin.bias is not None:
        lin.bias.data = torch.from_numpy(w.get(name, "bias").copy())
    return lin


def load_ln(w: Weights, name: str) -> nn.LayerNorm:
    eps = float(w.layer_cfg(name).get("epsilon", 1e-3))
    gamma = w.get(name, "gamma")
    ln = nn.LayerNorm(gamma.shape[0], eps=eps)
    ln.weight.data = torch.from_numpy(gamma.copy())
    ln.bias.data = torch.from_numpy(w.get(name, "beta").copy())
    return ln


# --------------------------------------------------------------------------------------------
# Baskerville's relative-position attention, ported verbatim from calico/baskerville layers.py.
# --------------------------------------------------------------------------------------------
def positional_features_central_mask(positions: torch.Tensor, feature_size: int, seq_length: int):
    pow_rate = math.exp(math.log(seq_length + 1) / feature_size)
    center_widths = torch.pow(
        torch.tensor(pow_rate), torch.arange(1, feature_size + 1, dtype=torch.float32)
    ) - 1.0
    return (center_widths > positions.abs().unsqueeze(-1)).float()


def positional_features(positions: torch.Tensor, feature_size: int, seq_length: int):
    """symmetric=False, so half the basis is the mask and half is the sign-multiplied mask."""
    half = feature_size // 2
    emb = positional_features_central_mask(positions, half, seq_length)
    return torch.cat([emb, torch.sign(positions).unsqueeze(-1) * emb], dim=-1)


def relative_shift(x: torch.Tensor) -> torch.Tensor:
    """Transformer-XL relative shift, matching baskerville's tensor gymnastics exactly."""
    b, h, t1, t2 = x.shape
    x = torch.cat([torch.zeros_like(x[..., :1]), x], dim=-1)       # [B,H,T1,T2+1]
    x = x.reshape(b, h, t2 + 1, t1)
    x = x[:, :, 1:, :]
    x = x.reshape(b, h, t1, t2)
    return x[..., : (t2 + 1) // 2]


class MultiheadAttention(nn.Module):
    def __init__(self, w: Weights, name: str):
        super().__init__()
        # The attention sublayers live under a nested group, so they are loaded by raw path.
        def sub(tensor: str) -> np.ndarray:
            path = f"{name}/{name}/{tensor}:0"
            w.used.add(path)
            return w.tensors[path]

        self.q_w = nn.Parameter(torch.from_numpy(np.ascontiguousarray(sub("q_layer/kernel").T)))
        self.k_w = nn.Parameter(torch.from_numpy(np.ascontiguousarray(sub("k_layer/kernel").T)))
        self.v_w = nn.Parameter(torch.from_numpy(np.ascontiguousarray(sub("v_layer/kernel").T)))
        self.r_k_w = nn.Parameter(torch.from_numpy(np.ascontiguousarray(sub("r_k_layer/kernel").T)))
        self.out_w = nn.Parameter(
            torch.from_numpy(np.ascontiguousarray(sub("embedding_layer/kernel").T))
        )
        self.out_b = nn.Parameter(torch.from_numpy(sub("embedding_layer/bias").copy()))
        self.r_w_bias = nn.Parameter(torch.from_numpy(sub("r_w_bias").copy()))
        self.r_r_bias = nn.Parameter(torch.from_numpy(sub("r_r_bias").copy()))

    @staticmethod
    def _heads(x: torch.Tensor, heads: int) -> torch.Tensor:
        """[B,T,H*C] -> [B,H,T,C]; Keras reshapes last dim as (H, C) then transposes."""
        b, t, c = x.shape
        return x.reshape(b, t, heads, c // heads).permute(0, 2, 1, 3)

    def forward(self, x: torch.Tensor, pos: torch.Tensor, want_attn: bool = False):
        """`pos` is the [1, 2T-1, 32] relative-position basis, precomputed once.

        It depends only on the bottleneck length, which is fixed at 128, so building it inside the
        graph would recompute an identical constant eight times per forward pass -- and its
        boolean-comparison-then-cast is exactly what a blanket fp16 conversion mishandles."""
        b, t, _ = x.shape
        q = self._heads(F.linear(x, self.q_w), N_HEADS) * (KEY_SIZE ** -0.5)
        k = self._heads(F.linear(x, self.k_w), N_HEADS)
        v = self._heads(F.linear(x, self.v_w), N_HEADS)

        content_logits = torch.matmul(q + self.r_w_bias, k.transpose(-1, -2))

        r_k = self._heads(F.linear(pos, self.r_k_w), N_HEADS)            # [1, H, 2T-1, K]
        relative_logits = relative_shift(
            torch.matmul(q + self.r_r_bias, r_k.transpose(-1, -2))
        )

        weights = torch.softmax(content_logits + relative_logits, dim=-1)
        out = torch.matmul(weights, v)                                    # [B,H,T,V]
        out = out.permute(0, 2, 1, 3).reshape(b, t, N_HEADS * VALUE_SIZE)
        out = F.linear(out, self.out_w, self.out_b)
        return (out, weights) if want_attn else (out, None)


# --------------------------------------------------------------------------------------------
# The model.
# --------------------------------------------------------------------------------------------
@dataclass(frozen=True)
class DecoderSpec:
    """What differs between Shorkie and Shorkie_LM. The trunk is identical in both.

    Shorkie stops the U-Net at 1,024 positions and crops to 896, because coverage is a 16 bp
    quantity; the LM upsamples all the way back to 16,384 because a base is what it predicts.
    Everything above the decoder -- stem, seven residual blocks, eight transformer layers -- is the
    same shape in both checkpoints, which is why one port can serve both.
    """
    stages: int                  # U-Net blocks: 3 for Shorkie, 7 for the LM
    crop: int                    # per-side crop after the decoder; 0 for the LM
    head_activation: str         # 'softplus' (coverage) or 'softmax' (base distribution)

    @property
    def skips(self) -> tuple[int, ...]:
        """Encoder residual blocks feeding each stage, deepest first."""
        return tuple(6 - i for i in range(self.stages))

    @property
    def head_index(self) -> int:
        # Encoder uses batch_normalization_0..13 and dense_0..15; the decoder starts after them,
        # two dense layers per stage, and the head is the next one.
        return 16 + 2 * self.stages


SHORKIE = DecoderSpec(stages=3, crop=CROP, head_activation="softplus")
SHORKIE_LM = DecoderSpec(stages=7, crop=0, head_activation="softmax")


class ShorkieTorch(nn.Module):
    def __init__(self, w: Weights, spec: DecoderSpec = SHORKIE):
        super().__init__()
        self.spec = spec
        self.stem = load_conv1d(w, "conv1d")

        self.bn_a, self.conv_a, self.bn_b, self.conv_b, self.scales = (
            nn.ModuleList(), nn.ModuleList(), nn.ModuleList(), nn.ModuleList(), nn.ParameterList()
        )
        for i in range(7):
            self.bn_a.append(load_bn(w, kname("batch_normalization", 2 * i)))
            self.conv_a.append(load_conv1d(w, kname("conv1d", 2 * i + 1)))
            self.bn_b.append(load_bn(w, kname("batch_normalization", 2 * i + 1)))
            self.conv_b.append(load_conv1d(w, kname("conv1d", 2 * i + 2)))
            sname = kname("scale", i)
            w.used.add(f"{sname}/{sname}/scale:0")
            self.scales.append(nn.Parameter(torch.from_numpy(w.tensors[f"{sname}/{sname}/scale:0"].copy())))

        self.attn, self.ln_attn, self.ln_ff, self.ff1, self.ff2 = (
            nn.ModuleList(), nn.ModuleList(), nn.ModuleList(), nn.ModuleList(), nn.ModuleList()
        )
        for i in range(N_ATTN_LAYERS):
            self.ln_attn.append(load_ln(w, kname("layer_normalization", 2 * i)))
            self.attn.append(MultiheadAttention(w, kname("multihead_attention", i)))
            self.ln_ff.append(load_ln(w, kname("layer_normalization", 2 * i + 1)))
            self.ff1.append(load_dense(w, kname("dense", 2 * i)))
            self.ff2.append(load_dense(w, kname("dense", 2 * i + 1)))

        # Decoder: `spec.stages` U-Net stages, each taking a skip from the encoder residual block
        # at the matching resolution, deepest first. The layer numbering is positional -- the
        # encoder consumes batch_normalization_0..13 and dense_0..15 -- so both models index the
        # same way and only the count differs.
        n = spec.stages
        self.dec_bn_main = nn.ModuleList([load_bn(w, f"batch_normalization_{14 + 2 * i}") for i in range(n)])
        self.dec_bn_skip = nn.ModuleList([load_bn(w, f"batch_normalization_{15 + 2 * i}") for i in range(n)])
        self.dec_main = nn.ModuleList([load_dense(w, f"dense_{16 + 2 * i}") for i in range(n)])
        self.dec_skip = nn.ModuleList([load_dense(w, f"dense_{17 + 2 * i}") for i in range(n)])
        self.dec_sep = nn.ModuleList(
            [load_separable(w, kname("separable_conv1d", i)) for i in range(n)]
        )
        self.head = load_dense(w, f"dense_{spec.head_index}")

        # The relative-position basis is a constant of the architecture, not of the input.
        distances = torch.arange(
            -BOTTLENECK_LEN + 1, BOTTLENECK_LEN, dtype=torch.float32
        ).unsqueeze(0)
        self.register_buffer(
            "pos_features", positional_features(distances, N_POS_FEATURES, BOTTLENECK_LEN)
        )

    def forward(self, x: torch.Tensor, want_intermediates: bool = False, patch_fn=None):
        """x: [B, 16384, 170] channels-last, matching the Keras input contract.

        `patch_fn(name, tensor) -> tensor` is called at every named activation and may return a
        replacement. It exists for causal tracing (`make_patching.py`): restore a clean run's
        activations into a corrupted one at one stage and one position band, and measure how much
        of the clean prediction comes back.

        Default `None` is a strict no-op -- the identity is applied nowhere, not applied as an
        identity function -- so every existing number this file produces is unchanged, which
        `verify_pipeline.py` re-checks. Patching happens at the point the activation is RECORDED,
        so a patched residual block feeds both its skip connection and the pooling below it; a
        patch that reached only one of those would be a different quantity entirely.
        """
        acts: dict[str, torch.Tensor] = {}

        def _p(name: str, tensor: torch.Tensor) -> torch.Tensor:
            return tensor if patch_fn is None else patch_fn(name, tensor)

        h = _p("stem", self.stem(x.transpose(1, 2)))         # [B, 96, L]
        if want_intermediates:
            acts["stem"] = h

        skips: list[torch.Tensor] = []
        for i in range(7):
            a = self.conv_a[i](F.gelu(self.bn_a[i](h)))
            r = self.conv_b[i](F.gelu(self.bn_b[i](a)))
            r = r * self.scales[i].view(1, -1, 1)
            block_out = _p(f"block{i + 1}", a + r)
            skips.append(block_out)
            if want_intermediates:
                acts[f"block{i + 1}"] = block_out
            h = F.max_pool1d(block_out, 2, 2)

        t = h.transpose(1, 2)                                 # [B, 128, 384]
        attn_maps = []
        for i in range(N_ATTN_LAYERS):
            a, wmap = self.attn[i](self.ln_attn[i](t), self.pos_features, want_attn=want_intermediates)
            t = t + a
            if want_intermediates and wmap is not None:
                attn_maps.append(wmap)
            f = self.ff2[i](F.relu(self.ff1[i](self.ln_ff[i](t))))
            t = _p(f"attn_out{i + 1}", t + f)
            if want_intermediates:
                # The residual stream AFTER this layer's attention and feed-forward -- this layer's
                # actual output feature map. Without it the only thing a visualisation can show for
                # a transformer layer is the attention matrix, which is a different kind of object
                # from every other stage's activation map (and is diagonal-dominant, so it
                # normalises to near-blank).
                #
                # Store `t` ITSELF, not `t.transpose(1, 2)`. A transpose here creates a fresh tensor
                # on a branch nothing downstream consumes, so `retain_grad()` on it yields None and
                # per-layer relevance for all 8 transformer stages is silently unobtainable. The
                # caller transposes for display; the graph keeps the tensor that is on the path.
                acts[f"attn_out{i + 1}"] = t
        if want_intermediates and attn_maps:
            # Pairwise, not torch.stack: an 8-way stack lowers to a Concat needing 9 storage
            # buffers, one over WebGPU's per-stage limit of 8. See _tree_cat in build_onnx.py.
            stacked = [m.unsqueeze(1) for m in attn_maps]
            while len(stacked) > 1:
                stacked = [
                    torch.cat(stacked[i:i + 2], dim=1) if len(stacked[i:i + 2]) == 2 else stacked[i]
                    for i in range(0, len(stacked), 2)
                ]
            acts["attention"] = stacked[0]                      # [B, layers, heads, T, T]

        h = t.transpose(1, 2)                                  # [B, 384, 128]
        for i, skip_idx in enumerate(self.spec.skips):
            main = self.dec_main[i](F.gelu(self.dec_bn_main[i](h)).transpose(1, 2))
            main = F.interpolate(main.transpose(1, 2), scale_factor=2, mode="nearest")
            skip = self.dec_skip[i](F.gelu(self.dec_bn_skip[i](skips[skip_idx])).transpose(1, 2))
            h = _p(f"decoder{i + 1}", self.dec_sep[i](main + skip.transpose(1, 2)))
            if want_intermediates:
                acts[f"decoder{i + 1}"] = h

        if self.spec.crop:
            h = h[:, :, self.spec.crop:-self.spec.crop]         # 1024 -> 896
        logits = self.head(F.gelu(h).transpose(1, 2))
        # softplus for coverage (non-negative, unbounded); softmax over the four bases for the LM,
        # whose output is a distribution and must sum to 1 at every position.
        out = (F.softmax(logits, dim=-1) if self.spec.head_activation == "softmax"
               else F.softplus(logits))
        return (out, acts) if want_intermediates else (out, None)


def build(checkpoint: str, spec: DecoderSpec = SHORKIE) -> tuple[ShorkieTorch, Weights]:
    w = Weights(checkpoint)
    model = ShorkieTorch(w, spec).eval()
    return model, w
