/**
 * Client-side controller for Shorkie Receptive Field & Attention Flow Studio.
 *
 * Implements:
 * 1. Precomputed attention matrix pack loading and decoding from /vp-data/${locusId}.
 * 2. Interactive dual-probe sequence track (Enhancer/Source vs. TSS/Target).
 * 3. Layer-by-layer receptive field expansion ladder with theoretical cone visualization.
 * 4. 128x128 multi-head attention matrix heatmap and bezier flow arcs.
 * 5. Empirical context convergence curve plot (Altschul-Erikson shuffle data).
 * 6. Cross-architecture comparison sandbox (Transformers vs. Dilated CNNs vs. SSM/Mamba).
 */

import {
  SEQ_LEN,
  BOTTLENECK_LEN,
  SHORKIE_LAYERS,
  bpToBottleneckToken,
  bottleneckTokenToBpSpan,
  checkReceptiveFeasibility,
  computeAttentionRollout,
  getTopAttentionConnections,
  simulateSignalTransmission,
} from '../lib/shorkieAttention';
import type {
  ArchitectureParadigm,
} from '../lib/shorkieAttention';

import { decodePackedRows, type PackedPlaneSpec } from '../lib/shorkieModel';
import lociData from '../data/shorkieLoci.json';
import receptiveData from '../data/shorkieReceptive.json';

export interface LocusFeature {
  name: string;
  type?: string;
  strand?: string;
  txStart?: number;
  txEnd?: number;
  cdsStart?: number;
  cdsEnd?: number;
  exons?: number[][];
  start?: number;
  end?: number;
}

export interface LocusInfo {
  id: string;
  gene: string;
  sequence: string;
  chrom?: string;
  strand?: string;
  tss?: number;
  features?: LocusFeature[];
}

export interface ReceptiveData {
  radii: number[];
  toleranceFraction: number;
  loci: Record<
    string,
    {
      gene: string;
      full: number;
      radii: number[];
      curve: number[];
      spread: number[];
      convergenceBp: number | null;
      geneBins: [number, number];
    }
  >;
}

export interface AttentionStudioState {
  locusId: string;
  layerIdx: number; // 0..19 from SHORKIE_LAYERS
  activeTab: 'tracer' | 'matrix' | 'convergence' | 'compare';
  attnMode: 'layer' | 'rollout';
  attnLayer: number; // 0..7
  probeA: number; // base pair coordinate (0..16383), e.g. Distal Enhancer
  probeB: number; // base pair coordinate (0..16383), e.g. TSS
  compareDistance: number; // bp (100..20000)
}

export class ShorkieAttentionStudio {
  private host: HTMLElement;
  private loci: LocusInfo[] = [];
  private receptiveData: ReceptiveData | null = null;
  private state: AttentionStudioState;

  // Cached decoded attention matrices for current locus: Float32Array of length 8 * 128 * 128
  private attentionData: Float32Array | null = null;
  private rolloutMatrix: Float64Array | null = null;
  private isAttentionLoading = false;

  public get isLoading(): boolean {
    return this.isAttentionLoading;
  }

  constructor(host: HTMLElement, loci: LocusInfo[], receptive: ReceptiveData) {
    this.host = host;
    this.loci = loci;
    this.receptiveData = receptive;

    // Default to GAL1 (YBR020W) or first locus
    const defaultLocus = loci.find((l) => l.gene === 'GAL1') || loci[0];
    const defaultTss = defaultLocus.tss ?? 8100;
    const defaultEnhancer = Math.max(0, defaultTss - 6000); // 6 kb upstream

    this.state = {
      locusId: defaultLocus.id,
      layerIdx: 8, // Start at Transformer Layer 1
      activeTab: 'tracer',
      attnMode: 'layer',
      attnLayer: 0,
      probeA: defaultEnhancer,
      probeB: defaultTss,
      compareDistance: 6000,
    };

    this.init();
  }

  private async init(): Promise<void> {
    this.bindEvents();
    await this.loadCurrentLocusAttention();
    this.render();
  }

  private getCurrentLocus(): LocusInfo {
    return this.loci.find((l) => l.id === this.state.locusId) || this.loci[0];
  }

  private async loadCurrentLocusAttention(): Promise<void> {
    const locus = this.getCurrentLocus();
    this.isAttentionLoading = true;
    this.updateStatus('Loading attention matrices...');

    try {
      const base = `${import.meta.env.BASE_URL.replace(/\/$/, '')}/vp-data`;
      const meta = await fetch(`${base}/${locus.id}.json`).then((r) => (r.ok ? r.json() : null));
      if (!meta || !meta.attn) {
        throw new Error(`Attention metadata not found for ${locus.id}`);
      }

      const blob = await fetch(`${base}/${locus.id}-attn.png`).then((r) => (r.ok ? r.blob() : null));
      if (!blob) {
        throw new Error(`Attention PNG not found for ${locus.id}`);
      }

      const bitmap = await createImageBitmap(blob);
      const cv = document.createElement('canvas');
      cv.width = meta.attn.cols;
      cv.height = meta.attn.rows;
      const cx = cv.getContext('2d', { willReadFrequently: true });
      if (!cx) throw new Error('Could not get 2D canvas context');
      cx.drawImage(bitmap, 0, 0);
      bitmap.close();

      const px = cx.getImageData(0, 0, meta.attn.cols, meta.attn.rows).data;
      this.attentionData = decodePackedRows(px, meta.attn as PackedPlaneSpec, 'linear');

      // Compute rollout matrix across all 8 layers
      this.rolloutMatrix = computeAttentionRollout(this.attentionData, BOTTLENECK_LEN, 8);
      this.updateStatus(`${locus.gene} attention matrices ready.`);
    } catch (err) {
      console.warn('Could not load precomputed attention matrix:', err);
      this.updateStatus(`Attention data unavailable (${err instanceof Error ? err.message : err})`);
      // Fallback synthetic attention matrix centered on diagonal
      this.attentionData = this.generateFallbackAttention();
      this.rolloutMatrix = computeAttentionRollout(this.attentionData, BOTTLENECK_LEN, 8);
    } finally {
      this.isAttentionLoading = false;
      this.render();
    }
  }

  private generateFallbackAttention(): Float32Array {
    const total = 8 * BOTTLENECK_LEN * BOTTLENECK_LEN;
    const out = new Float32Array(total);
    for (let l = 0; l < 8; l++) {
      const base = l * BOTTLENECK_LEN * BOTTLENECK_LEN;
      for (let i = 0; i < BOTTLENECK_LEN; i++) {
        let sum = 0;
        for (let j = 0; j < BOTTLENECK_LEN; j++) {
          const dist = Math.abs(i - j);
          const weight = Math.exp(-dist / (4 + l * 2)) + 0.005;
          out[base + i * BOTTLENECK_LEN + j] = weight;
          sum += weight;
        }
        for (let j = 0; j < BOTTLENECK_LEN; j++) {
          out[base + i * BOTTLENECK_LEN + j] /= sum;
        }
      }
    }
    return out;
  }

  private updateStatus(msg: string): void {
    const el = this.host.querySelector('[data-studio-status]');
    if (el) el.textContent = msg;
  }

  private bindEvents(): void {
    // Locus picker
    const locusSel = this.host.querySelector<HTMLSelectElement>('[data-locus-select]');
    locusSel?.addEventListener('change', async (e) => {
      this.state.locusId = (e.target as HTMLSelectElement).value;
      const locus = this.getCurrentLocus();
      this.state.probeB = locus.tss ?? 8100;
      this.state.probeA = Math.max(0, this.state.probeB - 6000);
      await this.loadCurrentLocusAttention();
    });

    // View tabs
    const tabBtns = this.host.querySelectorAll<HTMLButtonElement>('[data-studio-tab]');
    tabBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        const tab = btn.dataset.studioTab as AttentionStudioState['activeTab'];
        if (tab) {
          this.state.activeTab = tab;
          tabBtns.forEach((b) => {
            const active = b === btn;
            b.setAttribute('aria-selected', String(active));
            b.classList.toggle('is-active', active);
          });
          this.render();
        }
      });
    });

    // Layer Ladder selector
    const ladderBtns = this.host.querySelectorAll<HTMLButtonElement>('[data-layer-select]');
    ladderBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        const idx = Number(btn.dataset.layerSelect);
        if (!isNaN(idx) && idx >= 0 && idx < SHORKIE_LAYERS.length) {
          this.state.layerIdx = idx;
          if (idx >= 8 && idx < 16) {
            this.state.attnLayer = idx - 8;
            this.state.attnMode = 'layer';
          }
          this.render();
        }
      });
    });

    // Attention Mode (Layer vs Rollout)
    const modeBtns = this.host.querySelectorAll<HTMLButtonElement>('[data-attn-mode]');
    modeBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        const mode = btn.dataset.attnMode as 'layer' | 'rollout';
        if (mode) {
          this.state.attnMode = mode;
          this.render();
        }
      });
    });

    // Attention Layer buttons (1 to 8)
    const attnLayerBtns = this.host.querySelectorAll<HTMLButtonElement>('[data-attn-layer]');
    attnLayerBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        const l = Number(btn.dataset.attnLayer);
        if (!isNaN(l) && l >= 0 && l < 8) {
          this.state.attnLayer = l;
          this.state.attnMode = 'layer';
          this.state.layerIdx = 8 + l;
          this.render();
        }
      });
    });

    // Compare Distance Slider
    const distInput = this.host.querySelector<HTMLInputElement>('[data-compare-distance]');
    distInput?.addEventListener('input', (e) => {
      this.state.compareDistance = Number((e.target as HTMLInputElement).value);
      this.renderComparison();
    });

    // Sequence track click for Probes
    const seqCanvas = this.host.querySelector<HTMLCanvasElement>('[data-track-canvas]');
    if (seqCanvas) {
      let isDragging: 'A' | 'B' | null = null;

      const handlePointer = (e: MouseEvent | TouchEvent) => {
        const rect = seqCanvas.getBoundingClientRect();
        const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
        const normX = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
        const bp = Math.round(normX * SEQ_LEN);

        if (isDragging === 'A') {
          this.state.probeA = bp;
        } else if (isDragging === 'B') {
          this.state.probeB = bp;
        } else {
          // If close to A or B, drag; otherwise snap whichever is closest
          const distA = Math.abs(bp - this.state.probeA);
          const distB = Math.abs(bp - this.state.probeB);
          if (distA < distB) {
            this.state.probeA = bp;
            isDragging = 'A';
          } else {
            this.state.probeB = bp;
            isDragging = 'B';
          }
        }
        this.render();
      };

      seqCanvas.addEventListener('mousedown', (e) => {
        handlePointer(e);
        const onMove = (ev: MouseEvent) => handlePointer(ev);
        const onUp = () => {
          isDragging = null;
          window.removeEventListener('mousemove', onMove);
          window.removeEventListener('mouseup', onUp);
        };
        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp);
      });

      seqCanvas.addEventListener('touchstart', (e) => {
        handlePointer(e);
        const onTouchMove = (ev: TouchEvent) => handlePointer(ev);
        const onTouchEnd = () => {
          isDragging = null;
          window.removeEventListener('touchmove', onTouchMove);
          window.removeEventListener('touchend', onTouchEnd);
        };
        window.addEventListener('touchmove', onTouchMove, { passive: false });
        window.addEventListener('touchend', onTouchEnd);
      });
    }

    // Matrix Hover & Click
    const matrixCanvas = this.host.querySelector<HTMLCanvasElement>('[data-matrix-canvas]');
    if (matrixCanvas) {
      matrixCanvas.addEventListener('mousemove', (e) => {
        const rect = matrixCanvas.getBoundingClientRect();
        const x = Math.max(0, Math.min(rect.width - 1, e.clientX - rect.left));
        const y = Math.max(0, Math.min(rect.height - 1, e.clientY - rect.top));
        const col = Math.floor((x / rect.width) * BOTTLENECK_LEN);
        const row = Math.floor((y / rect.height) * BOTTLENECK_LEN);
        this.inspectMatrixCell(row, col);
      });

      matrixCanvas.addEventListener('click', (e) => {
        const rect = matrixCanvas.getBoundingClientRect();
        const x = Math.max(0, Math.min(rect.width - 1, e.clientX - rect.left));
        const y = Math.max(0, Math.min(rect.height - 1, e.clientY - rect.top));
        const col = Math.floor((x / rect.width) * BOTTLENECK_LEN);
        const row = Math.floor((y / rect.height) * BOTTLENECK_LEN);
        // Col -> Source (Probe A), Row -> Target (Probe B)
        this.state.probeA = Math.round((col + 0.5) * (SEQ_LEN / BOTTLENECK_LEN));
        this.state.probeB = Math.round((row + 0.5) * (SEQ_LEN / BOTTLENECK_LEN));
        this.render();
      });
    }
  }

  private inspectMatrixCell(row: number, col: number): void {
    const tooltip = this.host.querySelector('[data-matrix-tooltip]');
    if (!tooltip) return;

    const currentMatrix = this.getActiveMatrix();
    const weight = currentMatrix ? currentMatrix[row * BOTTLENECK_LEN + col] : 0;
    const [rowStart, rowEnd] = bottleneckTokenToBpSpan(row);
    const [colStart, colEnd] = bottleneckTokenToBpSpan(col);
    const uniform = 1 / BOTTLENECK_LEN;
    const ratio = (weight / uniform).toFixed(2);

    tooltip.innerHTML = `
      <strong>Target (Row ${row}):</strong> ${rowStart.toLocaleString()}–${rowEnd.toLocaleString()} bp<br>
      <strong>Source (Col ${col}):</strong> ${colStart.toLocaleString()}–${colEnd.toLocaleString()} bp<br>
      <strong>Attention Weight:</strong> ${(weight * 100).toFixed(2)}% (${ratio}× uniform chance)
    `;
  }

  private getActiveMatrix(): Float64Array | null {
    if (this.state.attnMode === 'rollout') {
      return this.rolloutMatrix;
    }
    if (!this.attentionData) return null;
    const layer = Math.max(0, Math.min(7, this.state.attnLayer));
    const offset = layer * BOTTLENECK_LEN * BOTTLENECK_LEN;
    const out = new Float64Array(BOTTLENECK_LEN * BOTTLENECK_LEN);
    for (let i = 0; i < out.length; i++) {
      out[i] = this.attentionData[offset + i];
    }
    return out;
  }

  public render(): void {
    this.updateControls();
    this.renderTrackCanvas();
    this.renderReceptiveCone();
    this.renderMatrixCanvas();
    this.renderConvergencePlot();
    this.renderComparison();
  }

  private updateControls(): void {
    const locus = this.getCurrentLocus();

    // Locus select
    const locusSel = this.host.querySelector<HTMLSelectElement>('[data-locus-select]');
    if (locusSel && locusSel.value !== locus.id) locusSel.value = locus.id;

    // Locus details badge
    const badge = this.host.querySelector('[data-locus-badge]');
    if (badge) {
      const conv = this.receptiveData?.loci[locus.id]?.convergenceBp;
      badge.innerHTML = `
        <span class="badge-gene">${locus.gene}</span>
        <span class="badge-id">${locus.id}</span>
        <span class="badge-tss">TSS: ~${(locus.tss ?? 8100).toLocaleString()} bp</span>
        <span class="badge-conv">Effective Context: ${conv ? conv.toLocaleString() + ' bp' : 'Full window'}</span>
      `;
    }

    // Active layer name and description
    const currentLayer = SHORKIE_LAYERS[this.state.layerIdx] || SHORKIE_LAYERS[8];
    const layerTitle = this.host.querySelector('[data-active-layer-title]');
    const layerDesc = this.host.querySelector('[data-active-layer-desc]');
    const layerRf = this.host.querySelector('[data-active-layer-rf]');
    if (layerTitle) layerTitle.textContent = currentLayer.name;
    if (layerDesc) layerDesc.textContent = currentLayer.description;
    if (layerRf) {
      layerRf.textContent = currentLayer.isGlobal
        ? 'Receptive Field: Global (16,384 bp / 100%)'
        : `Receptive Field: ~${currentLayer.theoreticalRfBp.toLocaleString()} bp`;
    }

    // Highlight active layer button
    this.host.querySelectorAll<HTMLButtonElement>('[data-layer-select]').forEach((btn) => {
      const idx = Number(btn.dataset.layerSelect);
      const isActive = idx === this.state.layerIdx;
      btn.classList.toggle('is-active', isActive);
      btn.setAttribute('aria-pressed', String(isActive));
    });

    // Highlight attention mode
    this.host.querySelectorAll<HTMLButtonElement>('[data-attn-mode]').forEach((btn) => {
      const isActive = btn.dataset.attnMode === this.state.attnMode;
      btn.classList.toggle('is-active', isActive);
      btn.setAttribute('aria-pressed', String(isActive));
    });

    // Highlight attention layer buttons
    this.host.querySelectorAll<HTMLButtonElement>('[data-attn-layer]').forEach((btn) => {
      const idx = Number(btn.dataset.attnLayer);
      const isActive = this.state.attnMode === 'layer' && idx === this.state.attnLayer;
      btn.classList.toggle('is-active', isActive);
      btn.setAttribute('aria-pressed', String(isActive));
    });

    // Readout metrics
    const distBp = Math.abs(this.state.probeA - this.state.probeB);
    const tokenA = bpToBottleneckToken(this.state.probeA);
    const tokenB = bpToBottleneckToken(this.state.probeB);

    const distEl = this.host.querySelector('[data-metric-distance]');
    const feasibilityEl = this.host.querySelector('[data-metric-feasibility]');
    const weightEl = this.host.querySelector('[data-metric-weight]');

    if (distEl) {
      distEl.textContent = `${distBp.toLocaleString()} bp (${Math.abs(tokenA - tokenB)} tokens)`;
    }

    const feas = checkReceptiveFeasibility(this.state.probeA, this.state.probeB, currentLayer);
    if (feasibilityEl) {
      feasibilityEl.textContent = feas.isInReceptiveField ? 'Connected' : 'Disconnected';
      feasibilityEl.className = feas.isInReceptiveField
        ? 'metric-val text-success'
        : 'metric-val text-danger';
    }

    const matrix = this.getActiveMatrix();
    if (weightEl && matrix) {
      const w = matrix[tokenB * BOTTLENECK_LEN + tokenA];
      const ratio = (w / (1 / BOTTLENECK_LEN)).toFixed(1);
      weightEl.textContent = `${(w * 100).toFixed(2)}% (${ratio}× uniform)`;
    }
  }

  private renderTrackCanvas(): void {
    const canvas = this.host.querySelector<HTMLCanvasElement>('[data-track-canvas]');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = (canvas.width = canvas.parentElement?.clientWidth || 800);
    const h = (canvas.height = 130);
    ctx.clearRect(0, 0, w, h);

    const locus = this.getCurrentLocus();
    const bpToX = (bp: number) => (bp / SEQ_LEN) * w;

    // Draw background grid lines (every 2 kb)
    ctx.strokeStyle = 'rgba(150, 150, 150, 0.15)';
    ctx.lineWidth = 1;
    for (let bp = 0; bp <= SEQ_LEN; bp += 2048) {
      const x = bpToX(bp);
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();

      ctx.fillStyle = 'rgba(150, 150, 150, 0.5)';
      ctx.font = '10px monospace';
      ctx.fillText(`${(bp / 1000).toFixed(1)}k`, x + 3, h - 6);
    }

    // Draw sequence track line
    const axisY = 65;
    ctx.strokeStyle = 'var(--color-rule, #444)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, axisY);
    ctx.lineTo(w, axisY);
    ctx.stroke();

    // Draw gene body / features
    if (locus.features) {
      for (const feat of locus.features) {
        const startBp = feat.txStart ?? (feat.start !== undefined ? feat.start * 16 + 1024 : undefined);
        const endBp = feat.txEnd ?? (feat.end !== undefined ? feat.end * 16 + 1024 : undefined);
        if (startBp === undefined || endBp === undefined) continue;

        const x1 = bpToX(startBp);
        const x2 = bpToX(endBp);
        const fw = Math.max(3, x2 - x1);

        if (feat.name === locus.id || feat.name === locus.gene) {
          // Gene body
          ctx.fillStyle = 'rgba(230, 126, 34, 0.35)';
          ctx.fillRect(x1, axisY - 14, fw, 28);
          ctx.strokeStyle = '#e67e22';
          ctx.lineWidth = 1.5;
          ctx.strokeRect(x1, axisY - 14, fw, 28);

          ctx.fillStyle = '#e67e22';
          ctx.font = 'bold 11px sans-serif';
          ctx.fillText(feat.name, x1 + 5, axisY + 4);
        } else {
          // Regulatory motif / TF binding site
          ctx.fillStyle = 'rgba(52, 152, 219, 0.4)';
          ctx.fillRect(x1, axisY - 8, fw, 16);
          ctx.strokeStyle = '#3498db';
          ctx.lineWidth = 1;
          ctx.strokeRect(x1, axisY - 8, fw, 16);

          ctx.fillStyle = '#3498db';
          ctx.font = '10px sans-serif';
          ctx.fillText(feat.name, x1, axisY - 12);
        }
      }
    }

    // Draw Attention Arcs from Probe B (Target TSS) to top sources
    const matrix = this.getActiveMatrix();
    if (matrix) {
      const targetToken = bpToBottleneckToken(this.state.probeB);
      const topConnections = getTopAttentionConnections(matrix, targetToken, 6);
      const targetX = bpToX(this.state.probeB);

      for (const conn of topConnections) {
        const sourceBp = (conn.sourceToken + 0.5) * (SEQ_LEN / BOTTLENECK_LEN);
        const sourceX = bpToX(sourceBp);
        const dist = Math.abs(targetX - sourceX);
        if (dist < 5) continue; // skip immediate self loop for arc

        const arcHeight = Math.min(50, 15 + dist * 0.12);
        const isSelectedEnhancer = Math.abs(sourceBp - this.state.probeA) < 250;

        ctx.strokeStyle = isSelectedEnhancer
          ? 'rgba(46, 204, 113, 0.95)'
          : `rgba(41, 128, 185, ${Math.min(0.85, conn.weight * 5 + 0.15)})`;
        ctx.lineWidth = isSelectedEnhancer ? 3 : Math.max(1, conn.weight * 18);

        ctx.beginPath();
        ctx.moveTo(sourceX, axisY - 4);
        ctx.quadraticCurveTo((sourceX + targetX) / 2, axisY - 4 - arcHeight, targetX, axisY - 4);
        ctx.stroke();
      }
    }

    // Draw Probe A (Source / Enhancer - Cyan)
    const xA = bpToX(this.state.probeA);
    ctx.fillStyle = '#1abc9c';
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(xA, axisY, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#1abc9c';
    ctx.font = 'bold 11px monospace';
    ctx.fillText(`Probe A: ${this.state.probeA} bp`, Math.max(5, xA - 40), axisY + 28);

    // Draw Probe B (Target / TSS - Amber/Orange)
    const xB = bpToX(this.state.probeB);
    ctx.fillStyle = '#e67e22';
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(xB, axisY, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#e67e22';
    ctx.font = 'bold 11px monospace';
    ctx.fillText(`Probe B: ${this.state.probeB} bp`, Math.max(5, xB - 40), axisY + 44);
  }

  private renderReceptiveCone(): void {
    const canvas = this.host.querySelector<HTMLCanvasElement>('[data-cone-canvas]');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = (canvas.width = canvas.parentElement?.clientWidth || 800);
    const h = (canvas.height = 140);
    ctx.clearRect(0, 0, w, h);

    const bpToX = (bp: number) => (bp / SEQ_LEN) * w;
    const layer = SHORKIE_LAYERS[this.state.layerIdx] || SHORKIE_LAYERS[8];
    const tssX = bpToX(this.state.probeB);

    // Calculate theoretical receptive cone bounds at the bottom (input sequence level)
    let leftBp = this.state.probeB - layer.theoreticalRfBp / 2;
    let rightBp = this.state.probeB + layer.theoreticalRfBp / 2;
    if (layer.isGlobal) {
      leftBp = 0;
      rightBp = SEQ_LEN;
    }

    const leftX = Math.max(0, bpToX(leftBp));
    const rightX = Math.min(w, bpToX(rightBp));

    // Draw cone polygon from top center (layer representation) down to input base pairs
    const topY = 15;
    const bottomY = h - 20;

    const grad = ctx.createLinearGradient(0, topY, 0, bottomY);
    if (layer.isGlobal) {
      grad.addColorStop(0, 'rgba(46, 204, 113, 0.45)');
      grad.addColorStop(1, 'rgba(46, 204, 113, 0.1)');
    } else {
      grad.addColorStop(0, 'rgba(52, 152, 219, 0.45)');
      grad.addColorStop(1, 'rgba(52, 152, 219, 0.08)');
    }

    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(tssX, topY);
    ctx.lineTo(rightX, bottomY);
    ctx.lineTo(leftX, bottomY);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = layer.isGlobal ? '#2ecc71' : '#3498db';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Draw probe positions at bottom line
    ctx.strokeStyle = 'rgba(150, 150, 150, 0.3)';
    ctx.beginPath();
    ctx.moveTo(0, bottomY);
    ctx.lineTo(w, bottomY);
    ctx.stroke();

    // Draw Probe A pin
    const probeAX = bpToX(this.state.probeA);
    const inRf = checkReceptiveFeasibility(this.state.probeA, this.state.probeB, layer).isInReceptiveField;

    ctx.fillStyle = inRf ? '#2ecc71' : '#e74c3c';
    ctx.beginPath();
    ctx.arc(probeAX, bottomY, 6, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = inRf ? '#2ecc71' : '#e74c3c';
    ctx.font = 'bold 11px sans-serif';
    ctx.fillText(
      inRf ? 'Probe A (Inside Cone)' : 'Probe A (Outside Cone)',
      Math.max(5, probeAX - 45),
      bottomY + 16
    );

    // Label apex
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 11px monospace';
    ctx.fillText(`Layer ${layer.layerIndex}: ${layer.name}`, tssX - 60, topY - 3);
  }

  private renderMatrixCanvas(): void {
    const canvas = this.host.querySelector<HTMLCanvasElement>('[data-matrix-canvas]');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const size = (canvas.width = canvas.height = Math.min(canvas.parentElement?.clientWidth || 450, 480));
    ctx.clearRect(0, 0, size, size);

    const matrix = this.getActiveMatrix();
    if (!matrix) return;

    const step = size / BOTTLENECK_LEN;

    // Render 128x128 grid
    for (let r = 0; r < BOTTLENECK_LEN; r++) {
      for (let c = 0; c < BOTTLENECK_LEN; c++) {
        const val = matrix[r * BOTTLENECK_LEN + c];
        // Colormap: near zero -> dark slate, uniform (0.0078) -> cyan, peak (>0.05) -> bright amber/white
        const norm = Math.min(1.0, Math.pow(val / 0.05, 0.6));
        const red = Math.round(norm > 0.6 ? 255 * (norm - 0.6) / 0.4 : 20);
        const green = Math.round(norm * 210);
        const blue = Math.round((1 - norm) * 160 + norm * 80);

        ctx.fillStyle = `rgb(${red}, ${green}, ${blue})`;
        ctx.fillRect(c * step, r * step, step + 0.5, step + 0.5);
      }
    }

    // Highlight target row and source column for Probe B and Probe A
    const tokenA = bpToBottleneckToken(this.state.probeA);
    const tokenB = bpToBottleneckToken(this.state.probeB);

    ctx.strokeStyle = '#e67e22'; // Probe B row
    ctx.lineWidth = 1.5;
    ctx.strokeRect(0, tokenB * step, size, step);

    ctx.strokeStyle = '#1abc9c'; // Probe A col
    ctx.lineWidth = 1.5;
    ctx.strokeRect(tokenA * step, 0, step, size);

    // Cross point
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.strokeRect(tokenA * step, tokenB * step, step, step);
  }

  private renderConvergencePlot(): void {
    const canvas = this.host.querySelector<HTMLCanvasElement>('[data-conv-canvas]');
    if (!canvas || !this.receptiveData) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = (canvas.width = canvas.parentElement?.clientWidth || 500);
    const h = (canvas.height = 220);
    ctx.clearRect(0, 0, w, h);

    const locus = this.getCurrentLocus();
    const locusEntry = this.receptiveData.loci[locus.id];
    if (!locusEntry) return;

    const pad = { top: 25, right: 30, bottom: 40, left: 50 };
    const plotW = w - pad.left - pad.right;
    const plotH = h - pad.top - pad.bottom;

    const radii = locusEntry.radii;
    const curve = locusEntry.curve;
    const full = locusEntry.full;

    const minVal = Math.min(...curve, full * 0.85);
    const maxVal = Math.max(...curve, full * 1.15);

    const xToPx = (idx: number) => pad.left + (idx / (radii.length - 1)) * plotW;
    const yToPx = (val: number) => pad.top + plotH - ((val - minVal) / Math.max(0.1, maxVal - minVal)) * plotH;

    // Draw full-context baseline & 5% tolerance band
    const fullY = yToPx(full);
    const tolTop = yToPx(full * 1.05);
    const tolBot = yToPx(full * 0.95);

    ctx.fillStyle = 'rgba(46, 204, 113, 0.12)';
    ctx.fillRect(pad.left, tolTop, plotW, tolBot - tolTop);

    ctx.strokeStyle = '#2ecc71';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(pad.left, fullY);
    ctx.lineTo(pad.left + plotW, fullY);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = '#2ecc71';
    ctx.font = '10px monospace';
    ctx.fillText(`Full Context: ${full.toFixed(2)} log2`, pad.left + 5, fullY - 5);

    // Draw curve
    ctx.strokeStyle = '#3498db';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    for (let i = 0; i < radii.length; i++) {
      const px = xToPx(i);
      const py = yToPx(curve[i]);
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.stroke();

    // Draw points
    for (let i = 0; i < radii.length; i++) {
      const px = xToPx(i);
      const py = yToPx(curve[i]);
      const isConv = radii[i] === locusEntry.convergenceBp;

      ctx.fillStyle = isConv ? '#e67e22' : '#3498db';
      ctx.beginPath();
      ctx.arc(px, py, isConv ? 6 : 4, 0, Math.PI * 2);
      ctx.fill();

      // X-axis ticks
      ctx.fillStyle = 'var(--color-muted, #888)';
      ctx.font = '10px monospace';
      ctx.fillText(`${radii[i]}`, px - 10, h - pad.bottom + 16);
    }

    // Axes
    ctx.strokeStyle = 'var(--color-rule, #555)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(pad.left, pad.top);
    ctx.lineTo(pad.left, pad.top + plotH);
    ctx.lineTo(pad.left + plotW, pad.top + plotH);
    ctx.stroke();

    // Axis labels
    ctx.fillStyle = 'var(--color-muted, #888)';
    ctx.font = '10px sans-serif';
    ctx.fillText('Real Radius (bp)', pad.left + plotW / 2 - 40, h - 5);
  }

  private renderComparison(): void {
    const dist = this.state.compareDistance;

    // Update distance label
    const label = this.host.querySelector('[data-compare-dist-label]');
    if (label) label.textContent = `${dist.toLocaleString()} bp`;

    const paradigms: ArchitectureParadigm[] = ['shorkie_hybrid', 'dilated_convnet', 'state_space_model'];
    for (const p of paradigms) {
      const res = simulateSignalTransmission(dist, p);
      const card = this.host.querySelector(`[data-card-paradigm="${p}"]`);
      if (card) {
        const signalEl = card.querySelector('[data-metric-signal]');
        const barEl = card.querySelector<HTMLElement>('[data-signal-bar]');
        const hopEl = card.querySelector('[data-metric-hop]');
        const compEl = card.querySelector('[data-metric-complexity]');
        const descEl = card.querySelector('[data-metric-desc]');

        if (signalEl) signalEl.textContent = `${(res.signalTransmission * 100).toFixed(1)}%`;
        if (barEl) barEl.style.width = `${Math.round(res.signalTransmission * 100)}%`;
        if (hopEl) hopEl.textContent = `${res.effectiveHopCount} hop${res.effectiveHopCount > 1 ? 's' : ''}`;
        if (compEl) compEl.textContent = res.memoryComplexity;
        if (descEl) descEl.textContent = res.mechanisticDescription;
      }
    }
  }
}

export function initShorkieAttentionStudio(host: HTMLElement): ShorkieAttentionStudio {
  return new ShorkieAttentionStudio(
    host,
    (lociData as unknown as { loci: LocusInfo[] }).loci,
    receptiveData as unknown as ReceptiveData
  );
}

let activeStudio: ShorkieAttentionStudio | null = null;
export function getActiveStudio(): ShorkieAttentionStudio | null {
  return activeStudio;
}

function mount(): void {
  const host = document.querySelector<HTMLElement>('[data-attention-studio]');
  if (!host) {
    activeStudio = null;
    return;
  }
  if (host.dataset.attentionStudioReady === 'true') return;
  host.dataset.attentionStudioReady = 'true';
  activeStudio = initShorkieAttentionStudio(host);
}

document.addEventListener('astro:page-load', mount);
document.addEventListener('astro:before-swap', () => {
  activeStudio = null;
});
if (document.readyState !== 'loading') mount();
