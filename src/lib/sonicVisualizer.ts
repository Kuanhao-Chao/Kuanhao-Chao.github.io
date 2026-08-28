import type { GenomicNoteEvent } from './sonicGenome';

export type VisualizerMode = 'helix' | 'oscilloscope' | 'matrix';

export interface VisualizerState {
  currentEvent: GenomicNoteEvent | null;
  events: GenomicNoteEvent[];
  currentIndex: number;
  mode: VisualizerMode;
  isPlaying: boolean;
  theme: 'dark' | 'light' | 'nord' | 'parchment' | 'monokai';
}

export class SonicVisualizer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private animId: number | null = null;
  private getAudioData: () => { timeData: Uint8Array; freqData: Uint8Array };
  private state: VisualizerState;

  private angle = 0;
  private glowIntensity = 0;
  private strikeParticles: Array<{
    x: number;
    y: number;
    vx: number;
    vy: number;
    alpha: number;
    color: string;
    size: number;
  }> = [];

  constructor(
    canvas: HTMLCanvasElement,
    getAudioData: () => { timeData: Uint8Array; freqData: Uint8Array }
  ) {
    this.canvas = canvas;
    const context = canvas.getContext('2d', { alpha: true });
    if (!context) throw new Error('Could not get 2D context from canvas');
    this.ctx = context;
    this.getAudioData = getAudioData;

    this.state = {
      currentEvent: null,
      events: [],
      currentIndex: 0,
      mode: 'helix',
      isPlaying: false,
      theme: 'dark'
    };

    this.resize();
    window.addEventListener('resize', this.handleResize);
  }

  private handleResize = () => {
    this.resize();
  };

  public resize(): void {
    const dpr = window.devicePixelRatio || 1;
    const rect = this.canvas.getBoundingClientRect();
    this.canvas.width = Math.floor(rect.width * dpr);
    this.canvas.height = Math.floor(rect.height * dpr);
    this.ctx.scale(dpr, dpr);
  }

  public updateState(partial: Partial<VisualizerState>): void {
    const prevIndex = this.state.currentIndex;
    this.state = { ...this.state, ...partial };

    // If active note changed, spawn radiant strike particles
    if (partial.currentIndex !== undefined && partial.currentIndex !== prevIndex) {
      this.glowIntensity = 1.0;
      this.spawnParticles();
    }
  }

  public setMode(mode: VisualizerMode): void {
    this.state.mode = mode;
  }

  private spawnParticles(): void {
    const rect = this.canvas.getBoundingClientRect();
    const cx = rect.width / 2;
    const cy = rect.height / 2;
    const base = this.state.currentEvent?.base || 'A';
    const color = this.getBaseColor(base);

    for (let i = 0; i < 12; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 1.5 + Math.random() * 3.5;
      this.strikeParticles.push({
        x: cx,
        y: cy,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        alpha: 1.0,
        color,
        size: 2 + Math.random() * 3
      });
    }
  }

  private getBaseColor(base: string): string {
    switch (base) {
      case 'A':
        return '#38bdf8'; // Sky Blue
      case 'T':
        return '#f43f5e'; // Rose
      case 'C':
        return '#fbbf24'; // Amber
      case 'G':
        return '#10b981'; // Emerald
      default:
        return '#a855f7'; // Purple
    }
  }

  public start(): void {
    if (this.animId !== null) return;
    const loop = () => {
      this.render();
      this.animId = requestAnimationFrame(loop);
    };
    this.animId = requestAnimationFrame(loop);
  }

  public stop(): void {
    if (this.animId !== null) {
      cancelAnimationFrame(this.animId);
      this.animId = null;
    }
  }

  public destroy(): void {
    this.stop();
    window.removeEventListener('resize', this.handleResize);
  }

  private render(): void {
    const rect = this.canvas.getBoundingClientRect();
    const w = rect.width;
    const h = rect.height;
    if (w === 0 || h === 0) return;

    this.ctx.clearRect(0, 0, w, h);

    const { timeData, freqData } = this.getAudioData();

    // Fade glow intensity smoothly
    this.glowIntensity *= 0.92;
    this.angle += 0.015;

    switch (this.state.mode) {
      case 'helix':
        this.render3DHelix(w, h, freqData);
        break;
      case 'oscilloscope':
        this.renderOscilloscope(w, h, timeData, freqData);
        break;
      case 'matrix':
        this.renderMatrix(w, h, freqData);
        break;
    }

    this.renderParticles();
  }

  /**
   * Mode A: 3D Rotating Luminescent DNA Double Helix
   */
  private render3DHelix(w: number, h: number, freqData: Uint8Array): void {
    const cx = w / 2;
    const cy = h / 2;
    const numRungs = 36;
    const radius = Math.min(w, h) * 0.28;
    const heightSpan = Math.min(w, h) * 0.75;
    const rungSpacing = heightSpan / numRungs;

    let avgEnergy = 0;
    if (freqData.length > 0) {
      for (let i = 0; i < 32; i++) avgEnergy += freqData[i];
      avgEnergy = avgEnergy / (32 * 255);
    }

    const dynamicRadius = radius * (1.0 + avgEnergy * 0.35);

    this.ctx.save();
    this.ctx.translate(cx, cy);

    // Draw back rungs & strands
    for (let pass = 0; pass < 2; pass++) {
      for (let i = 0; i < numRungs; i++) {
        const y = (i - numRungs / 2) * rungSpacing;
        const phase = i * 0.22 + this.angle;
        const z = Math.cos(phase);

        // Pass 0 = back (z < 0), Pass 1 = front (z >= 0)
        if ((pass === 0 && z >= 0) || (pass === 1 && z < 0)) continue;

        const x1 = Math.sin(phase) * dynamicRadius;
        const x2 = -x1;
        const depthAlpha = 0.25 + (z + 1) * 0.35;

        // Current active rung highlight
        const isActiveRung = Math.abs(i - (this.state.currentIndex % numRungs)) < 1.5;
        const rungGlow = isActiveRung ? this.glowIntensity : 0;

        // Draw base pair connecting bridge
        this.ctx.beginPath();
        this.ctx.moveTo(x1, y);
        this.ctx.lineTo(x2, y);
        this.ctx.lineWidth = isActiveRung ? 3.5 : 1.5;
        this.ctx.strokeStyle = isActiveRung
          ? `rgba(255, 255, 255, ${Math.min(1, depthAlpha + rungGlow)})`
          : `rgba(140, 160, 200, ${depthAlpha * 0.4})`;
        this.ctx.stroke();

        // Left Strand Base Node
        const color1 = this.getBaseColor(i % 2 === 0 ? 'A' : 'G');
        this.ctx.beginPath();
        this.ctx.arc(x1, y, isActiveRung ? 5.5 : 3.5, 0, Math.PI * 2);
        this.ctx.fillStyle = color1;
        this.ctx.shadowColor = color1;
        this.ctx.shadowBlur = isActiveRung ? 18 : 6 * depthAlpha;
        this.ctx.fill();

        // Right Strand Complement Node
        const color2 = this.getBaseColor(i % 2 === 0 ? 'T' : 'C');
        this.ctx.beginPath();
        this.ctx.arc(x2, y, isActiveRung ? 5.5 : 3.5, 0, Math.PI * 2);
        this.ctx.fillStyle = color2;
        this.ctx.shadowColor = color2;
        this.ctx.shadowBlur = isActiveRung ? 18 : 6 * depthAlpha;
        this.ctx.fill();
        this.ctx.shadowBlur = 0;
      }
    }

    // Active Nucleotide HUD in center
    if (this.state.currentEvent) {
      const ev = this.state.currentEvent;
      const baseColor = this.getBaseColor(ev.base);

      this.ctx.textAlign = 'center';
      this.ctx.textBaseline = 'middle';

      // Outer glowing ring
      this.ctx.beginPath();
      this.ctx.arc(0, 0, 38 + this.glowIntensity * 8, 0, Math.PI * 2);
      this.ctx.strokeStyle = baseColor;
      this.ctx.lineWidth = 2 + this.glowIntensity * 2;
      this.ctx.shadowColor = baseColor;
      this.ctx.shadowBlur = 15 * this.glowIntensity;
      this.ctx.stroke();
      this.ctx.shadowBlur = 0;

      // Base Letter
      this.ctx.font = 'bold 32px ui-monospace, monospace';
      this.ctx.fillStyle = '#ffffff';
      this.ctx.fillText(ev.base, 0, -4);

      // Amino Acid / Codon Tag
      if (ev.codon) {
        this.ctx.font = '600 11px system-ui, sans-serif';
        this.ctx.fillStyle = baseColor;
        this.ctx.fillText(`${ev.codon} → ${ev.aminoAcid || ''}`, 0, 20);
      }
    }

    this.ctx.restore();
  }

  /**
   * Mode B: Holographic Circular & Horizontal Oscilloscope
   */
  private renderOscilloscope(
    w: number,
    h: number,
    timeData: Uint8Array,
    freqData: Uint8Array
  ): void {
    const cx = w / 2;
    const cy = h / 2;
    const radius = Math.min(w, h) * 0.32;

    this.ctx.save();
    this.ctx.translate(cx, cy);

    // 1. Frequency Circular Aura
    if (freqData.length > 0) {
      const bars = 64;
      const step = (Math.PI * 2) / bars;
      for (let i = 0; i < bars; i++) {
        const val = freqData[i * 2] || 0;
        const barHeight = (val / 255) * 45;
        const a = i * step;

        const x1 = Math.cos(a) * radius;
        const y1 = Math.sin(a) * radius;
        const x2 = Math.cos(a) * (radius + barHeight);
        const y2 = Math.sin(a) * (radius + barHeight);

        this.ctx.beginPath();
        this.ctx.moveTo(x1, y1);
        this.ctx.lineTo(x2, y2);
        this.ctx.lineWidth = 2.5;
        this.ctx.strokeStyle = `hsla(${(i / bars) * 280 + 160}, 85%, 65%, 0.7)`;
        this.ctx.stroke();
      }
    }

    // 2. Circular Time-Domain Wave
    if (timeData.length > 0) {
      this.ctx.beginPath();
      const count = timeData.length;
      for (let i = 0; i < count; i++) {
        const v = (timeData[i] - 128) / 128; // -1 to 1
        const r = radius + v * 35;
        const a = (i / count) * Math.PI * 2;
        const x = Math.cos(a) * r;
        const y = Math.sin(a) * r;
        if (i === 0) this.ctx.moveTo(x, y);
        else this.ctx.lineTo(x, y);
      }
      this.ctx.closePath();
      this.ctx.lineWidth = 2.5;
      this.ctx.strokeStyle = '#38bdf8';
      this.ctx.shadowColor = '#38bdf8';
      this.ctx.shadowBlur = 12;
      this.ctx.stroke();
      this.ctx.shadowBlur = 0;
    }

    this.ctx.restore();
  }

  /**
   * Mode C: Cyberpunk Genomic Matrix Track
   */
  private renderMatrix(w: number, h: number, _freqData: Uint8Array): void {
    const evs = this.state.events;
    if (!evs || evs.length === 0) return;

    const visibleCount = 24;
    const cellWidth = w / visibleCount;
    const startIdx = Math.max(0, this.state.currentIndex - Math.floor(visibleCount / 2));
    const cy = h / 2;

    this.ctx.save();

    for (let i = 0; i < visibleCount; i++) {
      const idx = startIdx + i;
      if (idx >= evs.length) break;
      const ev = evs[idx];
      const x = i * cellWidth;
      const isActive = idx === this.state.currentIndex;
      const baseColor = this.getBaseColor(ev.base);

      // GC Height Column
      const gcHeight = ev.gcRatio * (h * 0.4);
      this.ctx.fillStyle = `rgba(16, 185, 129, 0.18)`;
      this.ctx.fillRect(x + 2, h - gcHeight, cellWidth - 4, gcHeight);

      // Active Box
      if (isActive) {
        this.ctx.fillStyle = `rgba(255, 255, 255, 0.12)`;
        this.ctx.fillRect(x, 0, cellWidth, h);

        this.ctx.strokeStyle = baseColor;
        this.ctx.lineWidth = 2;
        this.ctx.strokeRect(x, cy - 25, cellWidth, 50);
      }

      // Base Letter
      this.ctx.font = isActive ? 'bold 20px ui-monospace, monospace' : '15px ui-monospace, monospace';
      this.ctx.textAlign = 'center';
      this.ctx.textBaseline = 'middle';
      this.ctx.fillStyle = isActive ? '#ffffff' : baseColor;
      this.ctx.fillText(ev.base, x + cellWidth / 2, cy);

      // Motif Flag
      if (ev.motif) {
        this.ctx.fillStyle = '#f43f5e';
        this.ctx.beginPath();
        this.ctx.arc(x + cellWidth / 2, cy - 35, 4, 0, Math.PI * 2);
        this.ctx.fill();
      }
    }

    this.ctx.restore();
  }

  private renderParticles(): void {
    for (let i = this.strikeParticles.length - 1; i >= 0; i--) {
      const p = this.strikeParticles[i];
      p.x += p.vx;
      p.y += p.vy;
      p.alpha -= 0.025;

      if (p.alpha <= 0) {
        this.strikeParticles.splice(i, 1);
        continue;
      }

      this.ctx.beginPath();
      this.ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      this.ctx.fillStyle = p.color;
      this.ctx.globalAlpha = p.alpha;
      this.ctx.fill();
      this.ctx.globalAlpha = 1.0;
    }
  }
}
