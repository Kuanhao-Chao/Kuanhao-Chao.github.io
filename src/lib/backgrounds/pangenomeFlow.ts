/**
 * Pangenome Haplotype Highway Background Renderer.
 *
 * Renders multiple continuous, multi-colored ancestral genomic streams that
 * coalesce into dense consensus highways and diverge into topological bubble
 * loops representing structural variants (SNPs, indels, inversions).
 */

import type { BackgroundRenderer, BackgroundPointer } from './types';

interface HaplotypeStrand {
  name: string;
  colorLight: string;
  colorDark: string;
  baseYOffset: number;
  frequency: number;
  phase: number;
  speed: number;
  amplitude: number;
  bubbleCenter: number;
  bubbleWidth: number;
  bubbleSpread: number;
}

interface MinimizerPulse {
  strandIndex: number;
  t: number; // 0 to 1 along screen width
  speed: number;
  size: number;
  label: string;
}

export class PangenomeFlowRenderer implements BackgroundRenderer {
  id = 'pangenome' as const;
  name = 'Pangenome Haplotype Highway';

  private width = 0;
  private height = 0;
  private dpr = 1;
  private time = 0;
  private strands: HaplotypeStrand[] = [];
  private pulses: MinimizerPulse[] = [];
  private ripples: { x: number; y: number; r: number; maxR: number; alpha: number }[] = [];

  init(_canvas: HTMLCanvasElement, width: number, height: number, dpr: number): void {
    this.width = width;
    this.height = height;
    this.dpr = dpr;
    this.time = 0;
    this.initStrands();
    this.initPulses();
  }

  private initStrands(): void {
    const palette = [
      { name: 'GRCh38', light: 'rgba(46, 110, 94, 0.35)', dark: 'rgba(78, 201, 176, 0.45)' },
      { name: 'CHM13-T2T', light: 'rgba(41, 128, 185, 0.35)', dark: 'rgba(100, 181, 246, 0.45)' },
      { name: 'Han1-Diploid', light: 'rgba(211, 84, 0, 0.32)', dark: 'rgba(255, 167, 38, 0.42)' },
      { name: 'Yoruba-H1', light: 'rgba(142, 68, 173, 0.30)', dark: 'rgba(186, 104, 200, 0.40)' },
      { name: 'HG002-Mat', light: 'rgba(39, 174, 96, 0.32)', dark: 'rgba(129, 199, 132, 0.42)' },
    ];

    this.strands = palette.map((p, idx) => ({
      name: p.name,
      colorLight: p.light,
      colorDark: p.dark,
      baseYOffset: (idx - (palette.length - 1) / 2) * 14,
      frequency: 0.0012 + idx * 0.0003,
      phase: idx * 1.2,
      speed: 0.0006 + (idx % 3) * 0.0002,
      amplitude: 35 + (idx % 2) * 20,
      bubbleCenter: 0.3 + (idx * 0.18) % 0.5,
      bubbleWidth: 0.15 + (idx % 2) * 0.08,
      bubbleSpread: (idx % 2 === 0 ? 1 : -1) * (25 + idx * 8),
    }));
  }

  private initPulses(): void {
    const labels = ['(w,k)', 'AAG', 'LF', 'WFA', 'k27', 'indel', 'C>T', 'donor'];
    this.pulses = Array.from({ length: 12 }, (_, i) => ({
      strandIndex: i % this.strands.length,
      t: Math.random(),
      speed: 0.0008 + Math.random() * 0.0012,
      size: 3 + Math.random() * 2.5,
      label: labels[i % labels.length],
    }));
  }

  resize(width: number, height: number, dpr: number): void {
    this.width = width;
    this.height = height;
    this.dpr = dpr;
  }

  onClick(x: number, y: number): void {
    this.ripples.push({
      x,
      y,
      r: 4,
      maxR: 120,
      alpha: 0.6,
    });
  }

  render(
    ctx: CanvasRenderingContext2D,
    dt: number,
    pointer: BackgroundPointer,
    theme: 'light' | 'dark',
    crtMode: 'off' | 'amber' | 'green'
  ): void {
    this.time += dt * 0.001;

    ctx.clearRect(0, 0, this.width, this.height);

    const isDark = theme === 'dark' || crtMode !== 'off';
    const numPoints = 80;
    const stepX = this.width / (numPoints - 1);
    const midY = this.height * 0.52;

    // 1. Draw flowing haplotype paths
    this.strands.forEach((strand, sIdx) => {
      ctx.beginPath();
      let prevX = 0;
      let prevY = 0;

      for (let i = 0; i < numPoints; i++) {
        const x = i * stepX;
        const normX = x / this.width;

        // Base sine wave modulation
        let y =
          midY +
          strand.baseYOffset +
          Math.sin(x * strand.frequency + this.time * strand.speed * 200 + strand.phase) *
            strand.amplitude +
          Math.cos(x * 0.0008 + this.time * 0.4) * 18;

        // Topological variant bubble divergence
        const distFromBubble = Math.abs(normX - strand.bubbleCenter);
        if (distFromBubble < strand.bubbleWidth) {
          const bubbleFactor = Math.cos((distFromBubble / strand.bubbleWidth) * (Math.PI / 2));
          y += strand.bubbleSpread * bubbleFactor;
        }

        // Pointer magnetic distortion
        if (pointer.active) {
          const dx = x - pointer.x;
          const dy = y - pointer.y;
          const dist = Math.hypot(dx, dy);
          if (dist < 180 && dist > 0) {
            const pull = (1 - dist / 180) * 24;
            y += (dy / dist) * pull;
          }
        }

        if (i === 0) {
          ctx.moveTo(x, y);
        } else {
          const xc = (prevX + x) / 2;
          const yc = (prevY + y) / 2;
          ctx.quadraticCurveTo(prevX, prevY, xc, yc);
        }
        prevX = x;
        prevY = y;
      }
      ctx.lineTo(this.width, prevY);

      // Stroke style with theme adaptation
      if (crtMode === 'amber') {
        ctx.strokeStyle = `rgba(255, 176, 0, ${0.15 + (sIdx % 3) * 0.05})`;
        ctx.lineWidth = 2 * this.dpr;
      } else if (crtMode === 'green') {
        ctx.strokeStyle = `rgba(51, 255, 51, ${0.15 + (sIdx % 3) * 0.05})`;
        ctx.lineWidth = 2 * this.dpr;
      } else {
        ctx.strokeStyle = isDark ? strand.colorDark : strand.colorLight;
        ctx.lineWidth = (2.2 - sIdx * 0.2) * this.dpr;
      }

      ctx.stroke();
    });

    // 2. Draw traveling minimizer pulses and seed nodes
    this.pulses.forEach((pulse) => {
      pulse.t += pulse.speed * (pointer.active ? 1.5 : 1.0);
      if (pulse.t > 1) pulse.t = 0;

      const strand = this.strands[pulse.strandIndex];
      if (!strand) return;

      const x = pulse.t * this.width;
      const normX = pulse.t;

      let y =
        midY +
        strand.baseYOffset +
        Math.sin(x * strand.frequency + this.time * strand.speed * 200 + strand.phase) *
          strand.amplitude +
        Math.cos(x * 0.0008 + this.time * 0.4) * 18;

      const distFromBubble = Math.abs(normX - strand.bubbleCenter);
      if (distFromBubble < strand.bubbleWidth) {
        const bubbleFactor = Math.cos((distFromBubble / strand.bubbleWidth) * (Math.PI / 2));
        y += strand.bubbleSpread * bubbleFactor;
      }

      ctx.beginPath();
      ctx.arc(x, y, pulse.size * this.dpr, 0, Math.PI * 2);

      if (crtMode === 'amber') {
        ctx.fillStyle = 'rgba(255, 200, 50, 0.6)';
        ctx.shadowColor = '#ffb000';
        ctx.shadowBlur = 8;
      } else if (crtMode === 'green') {
        ctx.fillStyle = 'rgba(100, 255, 100, 0.6)';
        ctx.shadowColor = '#33ff33';
        ctx.shadowBlur = 8;
      } else {
        ctx.fillStyle = isDark ? 'rgba(78, 201, 176, 0.55)' : 'rgba(46, 110, 94, 0.45)';
        ctx.shadowColor = isDark ? 'rgba(78, 201, 176, 0.4)' : 'rgba(46, 110, 94, 0.3)';
        ctx.shadowBlur = 6;
      }

      ctx.fill();
      ctx.shadowBlur = 0;
    });

    // 3. Render click ripples
    for (let i = this.ripples.length - 1; i >= 0; i--) {
      const rip = this.ripples[i];
      rip.r += dt * 0.08;
      rip.alpha -= dt * 0.001;

      if (rip.alpha <= 0 || rip.r >= rip.maxR) {
        this.ripples.splice(i, 1);
        continue;
      }

      ctx.beginPath();
      ctx.arc(rip.x, rip.y, rip.r * this.dpr, 0, Math.PI * 2);
      ctx.strokeStyle = isDark
        ? `rgba(78, 201, 176, ${rip.alpha * 0.4})`
        : `rgba(46, 110, 94, ${rip.alpha * 0.3})`;
      ctx.lineWidth = 1.5 * this.dpr;
      ctx.stroke();
    }
  }

  destroy(): void {
    this.strands = [];
    this.pulses = [];
    this.ripples = [];
  }
}
