import type { BackgroundMotion, Point } from './backgroundModel';
import { createMorphTargets, morphPoint, smoothstep, type MorphTargets } from './morphModel';
import type { SceneRenderer } from './sceneRenderer';

/** Particle artwork, not a simulation of transcription or cell physiology. */
export function createMorphRenderer(
  canvas: HTMLCanvasElement,
  demo = false,
  home = false,
  intro = false
): SceneRenderer {
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D unavailable');
  const context: CanvasRenderingContext2D = ctx;
  const coarse = matchMedia('(pointer: coarse)').matches;
  const count = demo ? (coarse ? 340 : 760) : coarse ? 300 : 820;
  const targets: MorphTargets = createMorphTargets(count);
  const positions = new Float32Array(count * 2);
  const velocities = new Float32Array(count * 2);
  let width = 1,
    height = 1,
    dpr = 1;
  let accent = '#2e6e5e',
    ink = '#141414';
  let motion: BackgroundMotion = 'ambient';
  let mask: HTMLCanvasElement | null = null;
  let progress = 0,
    direction = 1,
    introAge = intro ? 0 : 2;
  let clock = 0,
    last = 0,
    raf = 0,
    fps = coarse ? 20 : 24;
  let running = false,
    disposed = false,
    quality = 1,
    costly = 0,
    slow = 0;
  let origin: Point = { x: 0, y: 0 },
    scale = 1;

  function layout() {
    if (demo) {
      origin = { x: width * 0.5, y: height * 0.5 };
      scale = Math.min(width * 0.42, height * 0.4);
    } else if (home) {
      const shift = smoothstep(progress * 2);
      const startX = coarse ? 0.77 : 0.79;
      const startY = coarse ? 0.24 : 0.48;
      origin = {
        x: width * (startX + (0.5 - startX) * shift),
        y: height * (startY + (0.5 - startY) * shift),
      };
      const startScale = Math.min(width * (coarse ? 0.42 : 0.28), height * (coarse ? 0.25 : 0.36));
      const chapterScale = Math.min(
        width * (coarse ? 0.42 : 0.24),
        height * (coarse ? 0.16 : 0.21)
      );
      scale = startScale + (chapterScale - startScale) * shift;
    } else {
      origin = { x: width * (coarse ? 0.77 : 0.79), y: height * (coarse ? 0.24 : 0.48) };
      scale = Math.min(width * (coarse ? 0.42 : 0.28), height * (coarse ? 0.25 : 0.36));
    }
  }
  function place(point: Point): Point {
    return { x: origin.x + point.x * scale, y: origin.y + point.y * scale };
  }
  function target(index: number): Point {
    if (introAge < 1.5 && progress < 0.02) {
      const start = targets.scatter[index];
      const end = targets.dna[index];
      const amount = smoothstep(introAge / 1.5);
      return { x: start.x + (end.x - start.x) * amount, y: start.y + (end.y - start.y) * amount };
    }
    return morphPoint(targets, index, progress);
  }
  function snap() {
    for (let i = 0; i < count; i++) {
      const point = place(target(i));
      positions[i * 2] = point.x;
      positions[i * 2 + 1] = point.y;
      velocities[i * 2] = velocities[i * 2 + 1] = 0;
    }
  }
  function update(dt: number) {
    clock += dt;
    if (introAge < 1.5) introAge = Math.min(1.5, introAge + dt);
    if (demo) {
      progress += direction * dt * (motion === 'calm' ? 0.065 : 0.12);
      if (progress >= 1 || progress <= 0) {
        progress = Math.max(0, Math.min(1, progress));
        direction *= -1;
      }
    }
    const omega = motion === 'calm' ? 3.5 : 5.2;
    const spring = omega * omega;
    for (let i = 0; i < count; i++) {
      const goal = place(target(i));
      const idle = !demo && !home ? Math.sin(clock * 0.42 + i * 0.07) * scale * 0.006 : 0;
      const index = i * 2;
      const ax = (goal.x + idle - positions[index]) * spring - 2 * omega * velocities[index];
      const ay =
        (goal.y + idle - positions[index + 1]) * spring - 2 * omega * velocities[index + 1];
      velocities[index] += ax * dt;
      velocities[index + 1] += ay * dt;
      positions[index] += velocities[index] * dt;
      positions[index + 1] += velocities[index + 1] * dt;
    }
  }
  function draw() {
    if (disposed) return;
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    context.clearRect(0, 0, width, height);
    const baseAlpha = demo ? 0.78 : motion === 'calm' ? 0.13 : coarse ? 0.27 : 0.22;
    const cellWeight = Math.max(0, 1 - Math.abs(progress - 0.5) * 4);
    const dnaWeight = 1 - smoothstep(progress * 3);
    const signalWeight = smoothstep((progress - 0.7) / 0.3);
    const strokeShape = (from: number, to: number, stride: number, weight: number) => {
      if (weight <= 0.01) return;
      context.globalAlpha = baseAlpha * weight * (demo ? 0.35 : 0.18);
      context.strokeStyle = accent;
      context.lineWidth = demo ? 1.1 : 0.75;
      context.beginPath();
      for (let i = from; i < to; i += stride) {
        const x = positions[i * 2],
          y = positions[i * 2 + 1];
        if (i === from) context.moveTo(x, y);
        else context.lineTo(x, y);
      }
      context.stroke();
    };
    const membrane = Math.floor(count * 0.57);
    if (dnaWeight > 0.01) {
      strokeShape(0, membrane, 2, dnaWeight);
      strokeShape(1, membrane, 2, dnaWeight);
    }
    if (cellWeight > 0.01) strokeShape(0, membrane, 1, cellWeight);
    if (signalWeight > 0.01) strokeShape(0, Math.floor(count * 0.76), 1, signalWeight);
    const visible = Math.ceil(count * quality);
    const radius = demo ? 1.75 : coarse ? 1.4 : 1.25;
    for (let i = 0; i < visible; i++) {
      context.globalAlpha = baseAlpha * (i % 7 === 0 ? 0.62 : 1);
      context.fillStyle = i < membrane || i % 5 === 0 ? accent : ink;
      const r = radius * (i % 11 === 0 ? 1.35 : 1);
      context.beginPath();
      context.arc(positions[i * 2], positions[i * 2 + 1], r, 0, Math.PI * 2);
      context.fill();
    }
    context.globalAlpha = 1;
    if (mask) {
      context.globalCompositeOperation = 'destination-out';
      context.drawImage(mask, 0, 0, width, height);
      context.globalCompositeOperation = 'source-over';
    }
    canvas.dataset.bgProgress = progress.toFixed(3);
    canvas.dataset.bgFrames = String(Number(canvas.dataset.bgFrames || 0) + 1);
  }
  function frame(now: number) {
    if (!running || disposed) return;
    raf = requestAnimationFrame(frame);
    const elapsed = last ? now - last : 1000 / fps;
    if (elapsed < 1000 / fps) return;
    last = now;
    const began = performance.now();
    const dt = Math.min(0.08, elapsed / 1000);
    const steps = Math.max(1, Math.ceil(dt / (1 / 60)));
    for (let i = 0; i < steps; i++) update(dt / steps);
    draw();
    canvas.dataset.bgTicks = String(Number(canvas.dataset.bgTicks || 0) + 1);
    const cost = performance.now() - began;
    costly = cost > 10 ? costly + 1 : Math.max(0, costly - 1);
    if (costly > 20) {
      quality = Math.max(0.45, quality * 0.75);
      fps = Math.max(12, fps - 4);
      costly = 0;
    }
    slow = cost > 24 && fps === 12 ? slow + 1 : Math.max(0, slow - 1);
    if (slow > 30) {
      setRunning(false);
      canvas.dataset.bgFallback = 'static';
    }
  }
  function setRunning(value: boolean) {
    running = value && !disposed && motion !== 'paused';
    cancelAnimationFrame(raf);
    raf = 0;
    last = 0;
    if (running && canvas.dataset.bgFallback !== 'static') raf = requestAnimationFrame(frame);
  }
  function resize() {
    const nextWidth = Math.max(1, canvas.clientWidth);
    const nextHeight = Math.max(1, canvas.clientHeight);
    const nextDpr = Math.min(devicePixelRatio || 1, coarse ? 1.5 : 2);
    if (width === nextWidth && height === nextHeight && dpr === nextDpr) return;
    width = nextWidth;
    height = nextHeight;
    dpr = nextDpr;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    layout();
    snap();
    draw();
  }
  function refreshPalette() {
    const style = getComputedStyle(document.documentElement);
    accent = style.getPropertyValue('--color-accent').trim() || '#2e6e5e';
    ink = style.getPropertyValue('--color-ink').trim() || '#141414';
    const crt = document.documentElement.dataset.crtMode;
    if (crt && crt !== 'off')
      accent = ink = crt === 'amber' ? '#ffb000' : crt === 'green' ? '#33ff33' : '#38fdf8';
    draw();
  }
  function setProgress(value: number) {
    progress = Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
    layout();
    if (progress > 0.02) introAge = 1.5;
    if (
      (demo && !running) ||
      motion === 'paused' ||
      matchMedia('(prefers-reduced-motion: reduce)').matches
    )
      snap();
    if (!running) draw();
  }
  function reset() {
    progress = 0;
    direction = 1;
    introAge = 1.5;
    snap();
    draw();
  }
  resize();
  refreshPalette();
  if (intro) {
    introAge = 0;
    snap();
    draw();
  }
  return {
    resize,
    refreshPalette,
    setRunning,
    reset,
    setProgress,
    getProgress: () => progress,
    setMotion(value) {
      motion = value;
      if (value === 'paused') {
        setRunning(false);
        introAge = 1.5;
        snap();
      }
      draw();
    },
    setMask(value) {
      mask = value;
      draw();
    },
    step() {
      setProgress(Math.min(1, progress + 0.05));
    },
    configure() {},
    interact(x, y) {
      const radius = Math.min(width, height) * 0.2;
      for (let i = 0; i < count; i++) {
        const dx = positions[i * 2] - x,
          dy = positions[i * 2 + 1] - y;
        const distance = Math.hypot(dx, dy);
        if (distance > radius || distance < 1) continue;
        const push = (1 - distance / radius) * (demo ? 85 : 35);
        velocities[i * 2] += (dx / distance) * push;
        velocities[i * 2 + 1] += (dy / distance) * push;
      }
      if (!running) update(1 / 30);
      draw();
    },
    status() {
      const label =
        progress < 0.25
          ? 'DNA and regulatory motifs'
          : progress < 0.75
            ? 'Cell membrane, nucleus, and organelles'
            : 'Illustrative expression signal';
      return `${label}. Particle artwork, not measured genomic data or a biological simulation.`;
    },
    dispose() {
      setRunning(false);
      disposed = true;
      mask = null;
    },
  };
}
