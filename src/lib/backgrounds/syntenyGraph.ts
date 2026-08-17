/**
 * Synteny Constellation & Graph Renderer.
 *
 * An ambient, non-distracting pangenomic network visualization:
 * - Conserved chromosomal loci drifting calmly like stars in deep space
 * - Translucent synteny filaments connecting homologous loci via delicate Bezier curves
 * - Multi-scale clustering (syntenic blocks & homology k-mers)
 * - Cursor gravitational field that softly illuminates local syntenic paths
 * - Ultra-low alpha transparency ensuring 100% foreground readability
 */
import type { BackgroundPointer, BackgroundRenderer } from './types';

interface SyntenyNode {
  x: number;
  y: number;
  vx: number;
  vy: number;
  baseRadius: number;
  type: 'anchor' | 'gene' | 'kmer';
  label?: string;
  pulsePhase: number;
  pulseSpeed: number;
  illumination: number; // 0..1
}

interface SyntenyRipple {
  x: number;
  y: number;
  radius: number;
  maxRadius: number;
  alpha: number;
}

const TAU = Math.PI * 2;
const rand = (min: number, max: number) => min + Math.random() * (max - min);

export class SyntenyGraphRenderer implements BackgroundRenderer {
  readonly mode = 'synteny' as const;

  private nodes: SyntenyNode[] = [];
  private ripples: SyntenyRipple[] = [];
  private width = 0;
  private height = 0;
  private maxConnectionDist = 180;
  private tick = 0;

  init(_canvas: HTMLCanvasElement, _ctx: CanvasRenderingContext2D, _dpr: number): void {
    this.seed();
  }

  resize(width: number, height: number, _dpr: number): void {
    this.width = width;
    this.height = height;
    const isCoarse = typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches;
    const targetCount = Math.round((width * height) / (isCoarse ? 28000 : 22000));
    const nodeCount = Math.max(isCoarse ? 20 : 28, Math.min(isCoarse ? 40 : 65, targetCount));
    this.maxConnectionDist = Math.min(width, height) * 0.24;

    if (this.nodes.length === 0) {
      this.seed(nodeCount);
    } else {
      this.adjustNodeCount(nodeCount);
    }
  }

  private seed(count = 38): void {
    this.nodes = Array.from({ length: count }, () => this.createNode());
  }

  private adjustNodeCount(target: number): void {
    while (this.nodes.length < target) {
      this.nodes.push(this.createNode());
    }
    if (this.nodes.length > target) {
      this.nodes.splice(target);
    }
  }

  private createNode(): SyntenyNode {
    const rType = Math.random();
    let type: SyntenyNode['type'] = 'kmer';
    let baseRadius = rand(1.4, 2.2);

    if (rType < 0.15) {
      type = 'anchor';
      baseRadius = rand(3.5, 5.0);
    } else if (rType < 0.5) {
      type = 'gene';
      baseRadius = rand(2.2, 3.2);
    }

    return {
      x: rand(0, this.width || 800),
      y: rand(0, this.height || 600),
      vx: rand(-0.16, 0.16),
      vy: rand(-0.16, 0.16),
      baseRadius,
      type,
      pulsePhase: rand(0, TAU),
      pulseSpeed: rand(0.012, 0.028),
      illumination: 0,
    };
  }

  onPointerMove(_x: number, _y: number): void {}

  onClick(x: number, y: number): void {
    // Trigger radial syntenic pulse
    this.ripples.push({
      x,
      y,
      radius: 5,
      maxRadius: 260,
      alpha: 1,
    });

    // Illuminate nearby nodes
    for (const node of this.nodes) {
      const d = Math.hypot(node.x - x, node.y - y);
      if (d < 240) {
        node.illumination = Math.max(node.illumination, 1 - d / 240);
      }
    }
  }

  render(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    pointer: BackgroundPointer,
    isDark: boolean,
    isCrt: boolean
  ): void {
    this.width = width;
    this.height = height;
    this.tick++;

    const accentRgb = isCrt ? '51, 255, 51' : isDark ? '90, 210, 190' : '46, 110, 94';
    const inkRgb = isCrt ? '51, 255, 51' : isDark ? '220, 220, 220' : '30, 30, 30';
    const linkRgb = isCrt ? '51, 255, 51' : isDark ? '110, 225, 205' : '55, 125, 110';

    // 1. Update Ripples
    for (let i = this.ripples.length - 1; i >= 0; i--) {
      const rip = this.ripples[i];
      rip.radius += 3.2;
      rip.alpha = 1 - rip.radius / rip.maxRadius;

      if (rip.alpha <= 0) {
        this.ripples.splice(i, 1);
        continue;
      }

      ctx.beginPath();
      ctx.arc(rip.x, rip.y, rip.radius, 0, TAU);
      ctx.lineWidth = 1;
      ctx.strokeStyle = `rgba(${linkRgb}, ${rip.alpha * (isDark ? 0.12 : 0.08)})`;
      ctx.stroke();
    }

    // 2. Update Nodes
    for (const node of this.nodes) {
      node.x += node.vx;
      node.y += node.vy;
      node.pulsePhase += node.pulseSpeed;
      node.illumination = Math.max(0, node.illumination - 0.01);

      // Smooth wrap around viewport
      const margin = 20;
      if (node.x < -margin) node.x = width + margin;
      else if (node.x > width + margin) node.x = -margin;
      if (node.y < -margin) node.y = height + margin;
      else if (node.y > height + margin) node.y = -margin;

      // Pointer proximity illumination & gentle attraction
      if (pointer.isActive) {
        const dx = pointer.x - node.x;
        const dy = pointer.y - node.y;
        const dist = Math.hypot(dx, dy) || 1;
        const R = 200;
        if (dist < R) {
          const factor = 1 - dist / R;
          node.illumination = Math.max(node.illumination, factor * 0.9);
          // Gentle deflection / gravitational curve
          node.x += (dx / dist) * factor * 0.35;
          node.y += (dy / dist) * factor * 0.35;
        }
      }
    }

    // 3. Render Synteny Bezier Filaments (Edges)
    const maxDist = this.maxConnectionDist;
    ctx.lineWidth = 0.75;

    for (let i = 0; i < this.nodes.length; i++) {
      const a = this.nodes[i];
      for (let j = i + 1; j < this.nodes.length; j++) {
        const b = this.nodes[j];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const dist = Math.hypot(dx, dy);

        if (dist < maxDist) {
          const baseAlpha = (1 - dist / maxDist) * 0.07;
          const boost = (a.illumination + b.illumination) * 0.12;
          const totalAlpha = Math.min(0.22, baseAlpha + boost);

          if (totalAlpha > 0.005) {
            // Synteny quadratic bezier curve with slight curvature
            const midX = (a.x + b.x) * 0.5;
            const midY = (a.y + b.y) * 0.5;
            // Orthogonal curve displacement
            const offset = Math.sin(this.tick * 0.01 + (i + j)) * 6;
            const ctrlX = midX - (dy / (dist || 1)) * offset;
            const ctrlY = midY + (dx / (dist || 1)) * offset;

            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.quadraticCurveTo(ctrlX, ctrlY, b.x, b.y);
            ctx.strokeStyle = `rgba(${linkRgb}, ${isDark ? totalAlpha * 1.3 : totalAlpha * 0.9})`;
            ctx.stroke();
          }
        }
      }
    }

    // 4. Render Nodes (Conserved Loci)
    for (const node of this.nodes) {
      const pulse = 0.85 + 0.15 * Math.sin(node.pulsePhase);
      const rad = node.baseRadius * pulse;
      const illum = node.illumination;

      // Anchor nodes have a soft outer orbit halo
      if (node.type === 'anchor') {
        const haloR = rad * (1.8 + 0.3 * Math.sin(node.pulsePhase * 0.8));
        ctx.beginPath();
        ctx.arc(node.x, node.y, haloR, 0, TAU);
        ctx.lineWidth = 0.8;
        ctx.strokeStyle = `rgba(${accentRgb}, ${(0.035 + illum * 0.08) * (isDark ? 1.2 : 0.8)})`;
        ctx.stroke();

        // Inner glowing core
        ctx.beginPath();
        ctx.arc(node.x, node.y, rad, 0, TAU);
        ctx.fillStyle = `rgba(${accentRgb}, ${(0.09 + illum * 0.25) * (isDark ? 1.3 : 0.9)})`;
        ctx.fill();

        ctx.beginPath();
        ctx.arc(node.x, node.y, rad * 0.45, 0, TAU);
        ctx.fillStyle = `rgba(${inkRgb}, ${(0.12 + illum * 0.3) * (isDark ? 1.3 : 0.9)})`;
        ctx.fill();
      } else if (node.type === 'gene') {
        ctx.beginPath();
        ctx.arc(node.x, node.y, rad, 0, TAU);
        ctx.fillStyle = `rgba(${accentRgb}, ${(0.07 + illum * 0.2) * (isDark ? 1.2 : 0.8)})`;
        ctx.fill();

        ctx.beginPath();
        ctx.arc(node.x, node.y, rad * 0.4, 0, TAU);
        ctx.fillStyle = `rgba(${inkRgb}, ${(0.08 + illum * 0.2) * (isDark ? 1.2 : 0.8)})`;
        ctx.fill();
      } else {
        // Small k-mer node
        ctx.beginPath();
        ctx.arc(node.x, node.y, rad, 0, TAU);
        ctx.fillStyle = `rgba(${inkRgb}, ${(0.045 + illum * 0.15) * (isDark ? 1.2 : 0.7)})`;
        ctx.fill();
      }
    }
  }

  destroy(): void {
    this.nodes = [];
    this.ripples = [];
  }
}
