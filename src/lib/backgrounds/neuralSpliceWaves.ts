/**
 * Neural Splice Waves Background Renderer.
 *
 * Generative harmonic resonance ribbons modeled on deep residual dilated
 * convolutions in OpenSpliceAI and Splam, with traveling splice donor / acceptor
 * activation energy pulses.
 */

import type { BackgroundRenderer, BackgroundPointer } from './types';

interface SpliceWave {
  frequency: number;
  speed: number;
  amplitude: number;
  phase: number;
  layerIndex: number;
  colorLight: string;
  colorDark: string;
}

interface SpliceActivation {
  type: 'donor' | 'acceptor';
  x: number;
  waveIndex: number;
  speed: number;
  size: number;
  sparkPhase: number;
}

export class NeuralSpliceWavesRenderer implements BackgroundRenderer {
  id = 'neural' as const;
  name = 'Neural Splice Waves';

  private width = 0;
  private height = 0;
  private dpr = 1;
  private time = 0;
  private waves: SpliceWave[] = [];
  private activations: SpliceActivation[] = [];

  init(_canvas: HTMLCanvasElement, width: number, height: number, dpr: number): void {
    this.width = width;
    this.height = height;
    this.dpr = dpr;
    this.time = 0;
    this.initWaves();
    this.initActivations();
  }

  private initWaves(): void {
    const layers = [
      { f: 0.0014, amp: 45, spd: 0.0008, light: 'rgba(46, 110, 94, 0.32)', dark: 'rgba(78, 201, 176, 0.40)' },
      { f: 0.0022, amp: 35, spd: 0.0012, light: 'rgba(41, 128, 185, 0.28)', dark: 'rgba(100, 181, 246, 0.38)' },
      { f: 0.0009, amp: 60, spd: 0.0006, light: 'rgba(142, 68, 173, 0.25)', dark: 'rgba(186, 104, 200, 0.35)' },
      { f: 0.0031, amp: 25, spd: 0.0015, light: 'rgba(39, 174, 96, 0.30)', dark: 'rgba(129, 199, 132, 0.38)' },
    ];

    this.waves = layers.map((l, i) => ({
      frequency: l.f,
      speed: l.spd,
      amplitude: l.amp,
      phase: i * 1.5,
      layerIndex: i,
      colorLight: l.light,
      colorDark: l.dark,
    }));
  }

  private initActivations(): void {
    this.activations = Array.from({ length: 14 }, (_, i) => ({
      type: i % 2 === 0 ? 'donor' : 'acceptor',
      x: Math.random() * this.width,
      waveIndex: i % this.waves.length,
      speed: 0.8 + Math.random() * 1.4,
      size: 3 + Math.random() * 2.5,
      sparkPhase: Math.random() * Math.PI * 2,
    }));
  }

  resize(width: number, height: number, dpr: number): void {
    this.width = width;
    this.height = height;
    this.dpr = dpr;
  }

  onClick(x: number, _y: number): void {
    // Spawn a pair of donor and acceptor activation pulses radiating from click
    this.activations.push(
      {
        type: 'donor',
        x,
        waveIndex: 0,
        speed: 2.2,
        size: 5,
        sparkPhase: 0,
      },
      {
        type: 'acceptor',
        x,
        waveIndex: 1,
        speed: -2.2,
        size: 5,
        sparkPhase: Math.PI,
      }
    );
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
    const midY = this.height * 0.5;

    // 1. Draw continuous harmonic convolution waves
    this.waves.forEach((w, wIdx) => {
      ctx.beginPath();
      let prevX = 0;
      let prevY = 0;

      for (let i = 0; i < numPoints; i++) {
        const x = i * stepX;
        let y =
          midY +
          Math.sin(x * w.frequency + this.time * w.speed * 200 + w.phase) * w.amplitude +
          Math.cos(x * 0.0006 + this.time * 0.3) * (w.amplitude * 0.5);

        // Dilated receptive field modulation
        const dilation = Math.sin(x * 0.0003 + this.time * 0.2) * 15;
        y += dilation;

        // Pointer resonance attraction
        if (pointer.active) {
          const dx = x - pointer.x;
          const dy = y - pointer.y;
          const dist = Math.hypot(dx, dy);
          if (dist < 160 && dist > 0) {
            const pull = (1 - dist / 160) * 20;
            y += (dy / dist) * pull;
          }
        }

        if (i === 0) ctx.moveTo(x, y);
        else {
          const xc = (prevX + x) / 2;
          const yc = (prevY + y) / 2;
          ctx.quadraticCurveTo(prevX, prevY, xc, yc);
        }
        prevX = x;
        prevY = y;
      }

      if (crtMode === 'amber') {
        ctx.strokeStyle = `rgba(255, 176, 0, ${0.14 + (wIdx % 2) * 0.08})`;
      } else if (crtMode === 'green') {
        ctx.strokeStyle = `rgba(51, 255, 51, ${0.14 + (wIdx % 2) * 0.08})`;
      } else {
        ctx.strokeStyle = isDark ? w.colorDark : w.colorLight;
      }

      ctx.lineWidth = (2.0 - wIdx * 0.25) * this.dpr;
      ctx.stroke();
    });

    // 2. Render traveling 5' Donor (GT) & 3' Acceptor (AG) activation pulses
    for (let i = this.activations.length - 1; i >= 0; i--) {
      const act = this.activations[i];
      act.x += act.speed;
      act.sparkPhase += dt * 0.004;

      if (act.x > this.width + 50) act.x = -50;
      if (act.x < -50) act.x = this.width + 50;

      const w = this.waves[act.waveIndex] || this.waves[0];
      const y =
        midY +
        Math.sin(act.x * w.frequency + this.time * w.speed * 200 + w.phase) * w.amplitude +
        Math.cos(act.x * 0.0006 + this.time * 0.3) * (w.amplitude * 0.5);

      ctx.beginPath();
      ctx.arc(act.x, y, act.size * this.dpr, 0, Math.PI * 2);

      if (crtMode === 'amber') {
        ctx.fillStyle = act.type === 'donor' ? 'rgba(255, 200, 50, 0.7)' : 'rgba(255, 150, 0, 0.7)';
        ctx.shadowColor = '#ffb000';
        ctx.shadowBlur = 10;
      } else if (crtMode === 'green') {
        ctx.fillStyle = act.type === 'donor' ? 'rgba(100, 255, 100, 0.7)' : 'rgba(50, 200, 50, 0.7)';
        ctx.shadowColor = '#33ff33';
        ctx.shadowBlur = 10;
      } else {
        ctx.fillStyle =
          act.type === 'donor'
            ? isDark
              ? 'rgba(78, 201, 176, 0.7)'
              : 'rgba(46, 110, 94, 0.6)'
            : isDark
            ? 'rgba(244, 162, 97, 0.7)'
            : 'rgba(225, 112, 85, 0.6)';
        ctx.shadowColor = act.type === 'donor' ? '#2e6e5e' : '#e17055';
        ctx.shadowBlur = 8;
      }

      ctx.fill();
      ctx.shadowBlur = 0;
    }
  }

  destroy(): void {
    this.waves = [];
    this.activations = [];
  }
}
