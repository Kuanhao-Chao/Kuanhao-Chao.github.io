/**
 * 3D Chromatin Loop Conformation Background Renderer.
 *
 * Simulates loop extrusion of chromatin fiber polymer chains with cohesin rings,
 * CTCF boundary anchors, and 3D depth-of-field perspective projection.
 */

import type { BackgroundRenderer, BackgroundPointer } from './types';

interface PolymerPoint3D {
  x: number;
  y: number;
  z: number;
  isCtcfAnchor?: boolean;
}

interface CohesinRing {
  pointIndex: number;
  speed: number;
  size: number;
}

export class ChromatinLoopsRenderer implements BackgroundRenderer {
  id = 'chromatin' as const;
  name = '3D Chromatin Loop Conformation';

  private width = 0;
  private height = 0;
  private dpr = 1;
  private time = 0;
  private points: PolymerPoint3D[] = [];
  private cohesinRings: CohesinRing[] = [];
  private rotX = 0.2;
  private rotY = 0;
  private targetRotY = 0;

  init(_canvas: HTMLCanvasElement, width: number, height: number, dpr: number): void {
    this.width = width;
    this.height = height;
    this.dpr = dpr;
    this.time = 0;
    this.initPolymerChain();
  }

  private initPolymerChain(): void {
    const count = 70;
    this.points = [];

    // Construct a multi-loop helical polymer chain
    for (let i = 0; i < count; i++) {
      const u = (i / count) * Math.PI * 6;
      const loopFactor = Math.sin(u * 0.5) * 120;

      const x = (i - count / 2) * 16 + Math.sin(u) * 40;
      const y = Math.cos(u) * (50 + loopFactor);
      const z = Math.sin(u * 2) * 80;

      this.points.push({
        x,
        y,
        z,
        isCtcfAnchor: i % 18 === 0,
      });
    }

    this.cohesinRings = [
      { pointIndex: 12, speed: 0.05, size: 6 },
      { pointIndex: 32, speed: -0.04, size: 6 },
      { pointIndex: 50, speed: 0.06, size: 6 },
    ];
  }

  resize(width: number, height: number, dpr: number): void {
    this.width = width;
    this.height = height;
    this.dpr = dpr;
  }

  onClick(_x: number, _y: number): void {
    // Accelerate rotation on click
    this.targetRotY += 0.6;
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

    // Interactive rotation easing
    if (pointer.active) {
      const normX = (pointer.x / this.width - 0.5) * 0.8;
      this.targetRotY = normX;
    } else {
      this.targetRotY += dt * 0.00015;
    }

    this.rotY += (this.targetRotY - this.rotY) * 0.05;
    this.rotX = 0.25 + Math.sin(this.time * 0.3) * 0.08;

    const cosY = Math.cos(this.rotY);
    const sinY = Math.sin(this.rotY);
    const cosX = Math.cos(this.rotX);
    const sinX = Math.sin(this.rotX);

    const cx = this.width * 0.5;
    const cy = this.height * 0.52;
    const fov = 400;

    // 1. Project 3D points to 2D screen coordinates
    const projected = this.points.map((p, idx) => {
      // Internal polymer breathing movement
      const breathe = Math.sin(this.time * 1.5 + idx * 0.2) * 8;
      const px = p.x;
      const py = p.y + breathe;
      const pz = p.z;

      // 3D rotation (Y-axis then X-axis)
      const x1 = px * cosY - pz * sinY;
      const z1 = px * sinY + pz * cosY;

      const y2 = py * cosX - z1 * sinX;
      const z2 = py * sinX + z1 * cosX + 300;

      const scale = fov / Math.max(10, z2);
      const sx = cx + x1 * scale;
      const sy = cy + y2 * scale;
      const depthAlpha = Math.max(0.15, Math.min(0.85, (scale - 0.5) * 1.2));

      return { sx, sy, z2, scale, depthAlpha, isCtcfAnchor: p.isCtcfAnchor };
    });

    // 2. Draw continuous chromatin polymer chain
    ctx.beginPath();
    for (let i = 0; i < projected.length; i++) {
      const pt = projected[i];
      if (i === 0) ctx.moveTo(pt.sx, pt.sy);
      else {
        const prev = projected[i - 1];
        const mx = (prev.sx + pt.sx) / 2;
        const my = (prev.sy + pt.sy) / 2;
        ctx.quadraticCurveTo(prev.sx, prev.sy, mx, my);
      }
    }

    if (crtMode === 'amber') {
      ctx.strokeStyle = 'rgba(255, 176, 0, 0.22)';
    } else if (crtMode === 'green') {
      ctx.strokeStyle = 'rgba(51, 255, 51, 0.22)';
    } else {
      ctx.strokeStyle = isDark ? 'rgba(78, 201, 176, 0.28)' : 'rgba(46, 110, 94, 0.22)';
    }

    ctx.lineWidth = 2.2 * this.dpr;
    ctx.stroke();

    // 3. Draw CTCF insulator boundary complexes and cohesin rings
    projected.forEach((pt) => {
      if (pt.isCtcfAnchor) {
        ctx.beginPath();
        ctx.arc(pt.sx, pt.sy, 5 * pt.scale * this.dpr, 0, Math.PI * 2);

        if (crtMode === 'amber') {
          ctx.fillStyle = 'rgba(255, 176, 0, 0.6)';
        } else if (crtMode === 'green') {
          ctx.fillStyle = 'rgba(51, 255, 51, 0.6)';
        } else {
          ctx.fillStyle = isDark
            ? `rgba(244, 162, 97, ${pt.depthAlpha * 0.8})`
            : `rgba(225, 112, 85, ${pt.depthAlpha * 0.7})`;
        }
        ctx.fill();
      }
    });

    // 4. Cohesin extrusion rings sliding along polymer
    this.cohesinRings.forEach((ring) => {
      ring.pointIndex += ring.speed;
      if (ring.pointIndex >= projected.length - 1) ring.pointIndex = 0;
      if (ring.pointIndex < 0) ring.pointIndex = projected.length - 1;

      const idx = Math.floor(ring.pointIndex);
      const pt = projected[idx];
      if (!pt) return;

      ctx.beginPath();
      ctx.ellipse(
        pt.sx,
        pt.sy,
        ring.size * pt.scale * this.dpr,
        (ring.size * 0.5) * pt.scale * this.dpr,
        this.rotY,
        0,
        Math.PI * 2
      );

      ctx.strokeStyle = isDark
        ? `rgba(78, 201, 176, ${pt.depthAlpha * 0.7})`
        : `rgba(46, 110, 94, ${pt.depthAlpha * 0.6})`;
      ctx.lineWidth = 1.8 * this.dpr;
      ctx.stroke();
    });
  }

  destroy(): void {
    this.points = [];
    this.cohesinRings = [];
  }
}
