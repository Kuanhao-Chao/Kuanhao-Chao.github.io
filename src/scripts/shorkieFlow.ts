/**
 * The architecture flow canvas: twenty stages drawn to their real dimensions, with a wavefront
 * that carries the sequence through them and lights the neurons that fire.
 *
 * Canvas rather than SVG for the same reason the neuron raster is: a stage map is up to 384 x 128
 * cells and there are twenty of them, which is ~200k nodes as SVG and one element as canvas.
 *
 * The wavefront moves through the *depth* of a forward pass that has already been computed. It
 * never triggers inference — scrubbing is free, and the activations it reveals are the real ones
 * from the same run that produced the predicted track.
 */

import {
  activationInk,
  BOTTLENECK_LEN,
  N_ATTN_LAYERS,
  flowGeometry,
  stageAt,
  encoderMapOffsets,
  type FlowStage,
} from '../lib/shorkieModel';
import { prefersReducedMotion } from './motion';

/** Reduced per-stage activation maps returned by the ONNX graph, all pooled to 128 positions. */
export interface FlowActivations {
  stemProfile: Float32Array;   // [96, 1024]
  encoderMaps: Float32Array;   // [1536, 128]
  decoderMaps: Float32Array;   // [1152, 128]
  attention: Float32Array;     // [8, 128, 128]
  tracks: Float32Array;        // [896, 4]
}

export interface FlowController {
  setScrub(t: number): void;
  setActivations(a: FlowActivations | null): void;
  setPlaying(on: boolean): void;
  isPlaying(): boolean;
  select(index: number | null): void;
  selected(): FlowStage | null;
  onChange(fn: (t: number, stage: FlowStage, playing: boolean) => void): void;
  onSelect(fn: (stage: FlowStage | null) => void): void;
  resize(): void;
  destroy(): void;
}

const STAGES = flowGeometry();
const ENC_OFFSETS = encoderMapOffsets();
const PAD = { left: 8, right: 8, top: 34, bottom: 46 };
const SWEEP_MS = 9000;

/** Per-stage activation as a [channels][positions] view into the forward pass's own tensors. */
export function stageMap(stage: FlowStage, a: FlowActivations | null): {
  data: Float32Array; channels: number; positions: number;
} | null {
  if (!a) return null;
  if (stage.id === 'stem') return { data: a.stemProfile, channels: 96, positions: 1024 };
  const enc = ENC_OFFSETS.find((o) => o.id === stage.id);
  if (enc) {
    return {
      data: a.encoderMaps.subarray(enc.start * 128, (enc.start + enc.channels) * 128),
      channels: enc.channels,
      positions: 128,
    };
  }
  if (stage.id.startsWith('decoder')) {
    const i = Number(stage.id.slice('decoder'.length)) - 1;
    return { data: a.decoderMaps.subarray(i * 384 * 128, (i + 1) * 384 * 128), channels: 384, positions: 128 };
  }
  if (stage.id.startsWith('attn')) {
    // An attention layer has no channel map; show its own 128x128 map as the "activation".
    const i = Number(stage.id.slice('attn'.length)) - 1;
    return { data: a.attention.subarray(i * 128 * 128, (i + 1) * 128 * 128), channels: 128, positions: 128 };
  }
  if (stage.id === 'head') {
    return { data: a.tracks, channels: 4, positions: 896 };
  }
  return null;
}

export function createFlow(canvas: HTMLCanvasElement, host: HTMLElement): FlowController {
  let scrub = 1;
  let acts: FlowActivations | null = null;
  let selectedIndex: number | null = null;
  let playing = false;
  let raf = 0;
  let startedAt = 0;
  let changeFn: ((t: number, stage: FlowStage, playing: boolean) => void) | null = null;
  let selectFn: ((s: FlowStage | null) => void) | null = null;
  let w = 0;
  let h = 0;

  const css = (name: string, fallback: string) =>
    getComputedStyle(host).getPropertyValue(name).trim() || fallback;

  function layout(): void {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    w = canvas.clientWidth || 960;
    // Narrow viewports get a shorter frame: twenty blocks across 260 px are already thin, and a
    // tall one would just be a column of slivers.
    h = w < 520 ? 220 : w < 900 ? 280 : 340;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    canvas.style.height = `${h}px`;
    const ctx = canvas.getContext('2d');
    ctx?.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  const plotW = () => w - PAD.left - PAD.right;
  const plotH = () => h - PAD.top - PAD.bottom;
  const sx = (x: number) => PAD.left + x * plotW();

  function draw(): void {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, w, h);

    const ink = css('--color-ink', '#141414');
    const muted = css('--color-muted', '#6b7280');
    const rule = css('--color-rule', '#e5e7eb');
    const colour: Record<string, string> = {
      encoder: css('--vp-accent', '#3976a8'),
      bottleneck: css('--vp-orf', '#6f62a8'),
      decoder: css('--vp-track', '#2f8069'),
    };
    const mid = PAD.top + plotH() / 2;
    const front = sx(scrub);
    const at = stageAt(scrub, STAGES);
    const tiny = w < 520;

    const box = (s: FlowStage) => {
      const bw = Math.max(s.width * plotW(), 1.5);
      const bh = Math.max(s.height * plotH(), 4);
      return { x: sx(s.x), y: mid - bh / 2, bw, bh };
    };

    // Skip arcs first, so blocks draw over them. They join stages of equal resolution, which is
    // exactly what a U-Net skip connects -- so on this encoding an arc is always horizontal.
    ctx.save();
    ctx.strokeStyle = colour.decoder;
    ctx.globalAlpha = 0.55;
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 3]);
    for (const s of STAGES) {
      if (!s.skipFrom) continue;
      const from = STAGES.find((x) => x.id === s.skipFrom);
      if (!from) continue;
      const a = box(from);
      const b = box(s);
      const lift = Math.min(a.y, b.y) - 10;
      ctx.beginPath();
      ctx.moveTo(a.x + a.bw / 2, a.y);
      ctx.bezierCurveTo(a.x + a.bw / 2, lift, b.x + b.bw / 2, lift, b.x + b.bw / 2, b.y);
      ctx.stroke();
    }
    ctx.restore();

    STAGES.forEach((s, i) => {
      const { x, y, bw, bh } = box(s);
      const reached = x <= front;
      const map = reached ? stageMap(s, acts) : null;

      if (map) {
        // Paint the real activation: channels across the block's width, positions down its height,
        // matching the axes the block itself encodes.
        const { data, channels, positions } = map;
        let lo = Infinity;
        let hi = -Infinity;
        for (let k = 0; k < data.length; k += 1) {
          if (data[k] < lo) lo = data[k];
          if (data[k] > hi) hi = data[k];
        }
        const cols = Math.min(channels, Math.max(2, Math.round(bw)));
        const rows = Math.min(positions, Math.max(2, Math.round(bh)));
        const cw = bw / cols;
        const rh = bh / rows;
        ctx.fillStyle = colour[s.group];
        for (let c = 0; c < cols; c += 1) {
          const ch = Math.floor((c / cols) * channels);
          for (let r = 0; r < rows; r += 1) {
            const pp = Math.floor((r / rows) * positions);
            const ink = activationInk(data[ch * positions + pp], lo, hi);
            if (ink === 0) continue;
            ctx.globalAlpha = 0.2 + 0.8 * ink;
            ctx.fillRect(x + c * cw, y + r * rh, Math.max(cw, 0.6), Math.max(rh, 0.6));
          }
        }
        ctx.globalAlpha = 1;
      } else {
        ctx.fillStyle = colour[s.group];
        ctx.globalAlpha = reached ? 0.3 : 0.09;
        ctx.fillRect(x, y, bw, bh);
        ctx.globalAlpha = 1;
      }

      const isCurrent = i === at.index;
      ctx.strokeStyle = i === selectedIndex ? ink : isCurrent ? colour[s.group] : rule;
      ctx.lineWidth = i === selectedIndex ? 1.8 : isCurrent ? 1.4 : 0.7;
      ctx.strokeRect(x + 0.5, y + 0.5, Math.max(bw - 1, 0.5), Math.max(bh - 1, 0.5));
    });

    // Wavefront.
    if (scrub < 1) {
      ctx.strokeStyle = css('--vp-fire', '#b0455a');
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(front, PAD.top - 8);
      ctx.lineTo(front, h - PAD.bottom + 6);
      ctx.stroke();
    }

    // Resolution ladder down the left edge, so the height axis is readable as a quantity.
    ctx.font = '9px system-ui, sans-serif';
    ctx.fillStyle = muted;
    ctx.textAlign = 'left';
    if (!tiny) {
      for (const id of ['stem', 'block7', 'attn1', 'head']) {
        const s = STAGES.find((q) => q.id === id);
        if (!s) continue;
        const { x, y } = box(s);
        const label =
          id === 'head' ? `${s.positions} bins` : `${s.positions.toLocaleString()} pos`;
        ctx.fillText(label, Math.min(x, w - 52), y - 4);
      }
    }

    // Group spans across the top.
    ctx.font = '10px system-ui, sans-serif';
    const spanLabel = (group: string, label: string) => {
      const members = STAGES.filter((s) => s.group === group);
      if (!members.length) return;
      const x0 = sx(members[0].x);
      const x1 = sx(members.at(-1)!.x + members.at(-1)!.width);
      ctx.strokeStyle = colour[group];
      ctx.globalAlpha = 0.5;
      ctx.beginPath();
      ctx.moveTo(x0, 15);
      ctx.lineTo(x1, 15);
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.fillStyle = colour[group];
      ctx.textAlign = 'center';
      ctx.fillText(label, (x0 + x1) / 2, 11);
    };
    spanLabel('encoder', tiny ? 'encoder' : 'encoder — 16,384 → 128 positions');
    spanLabel('bottleneck', tiny ? `${N_ATTN_LAYERS}× attn` : `${N_ATTN_LAYERS} × attention @ ${BOTTLENECK_LEN}`);
    spanLabel('decoder', tiny ? 'decoder' : 'decoder → 896 bins');

    // The stage the reader is being told about: the selection if there is one, else the wavefront.
    const cur = STAGES[selectedIndex ?? at.index];
    const which = selectedIndex === null ? 'under the wavefront' : 'selected';
    const title = `${cur.label} · ${which}`;
    const dims =
      `${cur.positions.toLocaleString()} positions × ${cur.channels.toLocaleString()} channels` +
      ` · sees ${cur.receptiveField.toLocaleString()} bp`;
    ctx.textAlign = 'center';
    // Below ~520 px the caption is wider than the canvas and would sit on top of the scale note.
    // The same sentence is already live text under the slider, so drop it from the drawing rather
    // than shrink it into illegibility.
    // The caption points at its block, but the last stages sit at the right edge -- clamp on the
    // measured half-width of the widest line, or the label runs off the canvas.
    ctx.font = '600 11px system-ui, sans-serif';
    const halfTitle = ctx.measureText(title).width / 2;
    ctx.font = '10px system-ui, sans-serif';
    const half = Math.max(halfTitle, ctx.measureText(dims).width / 2) + 4;
    const cx = Math.min(Math.max(sx(cur.x + cur.width / 2), half), Math.max(w - half, half));
    if (!tiny) {
      ctx.fillStyle = ink;
      ctx.font = '600 11px system-ui, sans-serif';
      ctx.fillText(title, cx, h - PAD.bottom + 16);
      ctx.fillStyle = muted;
      ctx.font = '10px system-ui, sans-serif';
      ctx.fillText(dims, cx, h - PAD.bottom + 28);
    }

    // The canvas is an image to assistive tech, so the same sentence has to exist as text.
    canvas.setAttribute(
      'aria-label',
      `Shorkie architecture, ${STAGES.length} stages from a 16,384 bp input to 896 output bins. ` +
        `Currently ${which}: ${cur.label}, ${dims}.`,
    );

    // Right-aligned: the caption tracks its block and lands here whenever an early stage is
    // selected, and two left-aligned lines at the same baseline overlap.
    ctx.textAlign = 'right';
    ctx.font = '9px system-ui, sans-serif';
    ctx.fillStyle = muted;
    ctx.fillText(
      tiny ? 'height = positions, width = channels' : 'height = positions, width = channels; both log-scaled',
      w - PAD.right,
      h - 4,
    );
  }

  function tick(now: number): void {
    if (!playing) return;
    if (!startedAt) startedAt = now;
    const t = ((now - startedAt) % SWEEP_MS) / SWEEP_MS;
    scrub = t;
    draw();
    changeFn?.(scrub, STAGES[stageAt(scrub, STAGES).index], playing);
    raf = requestAnimationFrame(tick);
  }

  /**
   * Nearest stage by centre, not a strict hit test. The blocks are separated by gaps and the
   * narrowest is under 3% of the width, so requiring a click inside one makes a third of the
   * canvas silently deselect.
   */
  function hitTest(ev: MouseEvent): number {
    const box = canvas.getBoundingClientRect();
    const x = ((ev.clientX - box.left) / box.width) * w;
    const frac = (x - PAD.left) / plotW();
    let best = 0;
    let bestD = Infinity;
    STAGES.forEach((s, i) => {
      const d = Math.abs(frac - (s.x + s.width / 2));
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    });
    return best;
  }

  const onClick = (ev: MouseEvent) => {
    const i = hitTest(ev);
    selectedIndex = i === selectedIndex ? null : i;
    draw();
    selectFn?.(selectedIndex === null ? null : STAGES[selectedIndex]);
  };
  const onResize = () => {
    layout();
    draw();
  };

  // Every colour here is read from a CSS custom property at draw time, so a theme change has to
  // force a redraw or the canvas keeps the palette it was painted with. The site ships six themes,
  // and the fallbacks in `css()` are the light ones -- which is what a stale canvas would show.
  const onTheme = () => draw();

  canvas.addEventListener('click', onClick);
  window.addEventListener('resize', onResize);
  document.addEventListener('khc:theme-change', onTheme);
  layout();
  draw();

  return {
    setScrub(t) {
      scrub = Math.min(Math.max(t, 0), 1);
      draw();
      changeFn?.(scrub, STAGES[stageAt(scrub, STAGES).index], playing);
    },
    setActivations(a) {
      acts = a;
      draw();
    },
    setPlaying(on) {
      // Reduced motion gets the finished state, not a sweep.
      if (on && prefersReducedMotion()) {
        playing = false;
        scrub = 1;
        draw();
        changeFn?.(scrub, STAGES[STAGES.length - 1], false);
        return;
      }
      playing = on;
      if (on) {
        startedAt = 0;
        raf = requestAnimationFrame(tick);
      } else {
        cancelAnimationFrame(raf);
        draw();
      }
    },
    isPlaying: () => playing,
    select(i) {
      selectedIndex = i;
      draw();
      selectFn?.(i === null ? null : STAGES[i]);
    },
    selected: () => (selectedIndex === null ? null : STAGES[selectedIndex]),
    onChange(fn) {
      changeFn = fn;
    },
    onSelect(fn) {
      selectFn = fn;
    },
    resize: onResize,
    destroy() {
      cancelAnimationFrame(raf);
      canvas.removeEventListener('click', onClick);
      window.removeEventListener('resize', onResize);
      document.removeEventListener('khc:theme-change', onTheme);
    },
  };
}

export { STAGES as FLOW_STAGES };
export type { FlowStage };
