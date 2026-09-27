import type { BackgroundMotion } from './backgroundModel';
import {
  clamp01,
  createMorphParticles,
  playbackProgress,
  playbackTime,
  particleVisibility,
  sampleMito,
  sampleMorph,
  sampleStructureMorph,
  signalHeight,
  smoothstep,
  TAU,
  type MorphAnchor,
  type MorphPoint,
  type MorphRole,
} from './morphModel';
import type { SceneRenderer } from './sceneRenderer';

/** Layered Canvas2D illustration; anatomy and particle geometry share one sampler. */
export function createMorphRenderer(
  canvas: HTMLCanvasElement,
  demo = false,
  home = false,
  intro = false
): SceneRenderer {
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D unavailable');
  const context: CanvasRenderingContext2D = ctx;
  // A reopened explorer owns a fresh renderer, even if its last instance fell back.
  delete canvas.dataset.bgFallback;
  const coarse = matchMedia('(pointer: coarse)').matches;
  const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  const particles = createMorphParticles(demo ? (coarse ? 1600 : 5000) : coarse ? 1000 : 3200);
  // Screen coordinates/depth/opacity and normalized interaction displacements.
  const positions = new Float32Array(particles.length * 4);
  const offsets = new Float32Array(particles.length * 4);
  // Linked buckets: six depth bands × two inks × three sizes × twelve opacities.
  // Build once per frame without sorting, allocating arrays, or drawing each dot separately.
  const bucketHeads = new Int32Array(6 * 2 * 3 * 12);
  const nextParticle = new Int32Array(particles.length);
  const point: MorphPoint = { x: 0, y: 0, z: 0, alpha: 1 };
  const scratch: MorphPoint = { ...point },
    other: MorphPoint = { ...point };
  const pathParticle: MorphAnchor = { role: 'membrane', t: 0, variant: 0, rank: 0 };
  let width = 1,
    height = 1,
    dpr = 1,
    originX = 0,
    originY = 0,
    scale = 1;
  let chapterHeight = 220,
    accent = '#2e6e5e',
    ink = '#141414',
    surface = '#fafaf8';
  let motion: BackgroundMotion = 'ambient';
  let mask: HTMLCanvasElement | null = null;
  let progress = 0,
    displayed = 0,
    clock = 0,
    playbackAge = 0,
    introAge = intro ? 0 : 2;
  let running = false,
    disposed = false,
    raf = 0,
    last = 0,
    labels = false;
  let quality = 1,
    previousQuality = 1,
    qualityAge = 0.4,
    costly = 0,
    slow = 0,
    fps = demo ? (coarse ? 30 : 60) : coarse ? 20 : 24;
  let kickAge = 0;
  let drawingCell = false;
  let tween: { from: number; age: number } | null = null;
  const canAnimate = () =>
    !disposed &&
    !document.hidden &&
    !reduced() &&
    motion !== 'paused' &&
    canvas.dataset.bgFallback !== 'static';

  function layout() {
    if (demo) {
      originX = width * 0.5;
      originY = height * 0.51;
      scale = Math.min(width * (labels ? 0.36 : 0.43), height * 0.59);
    } else if (home) {
      const shift = smoothstep(displayed * 2);
      originX = width * ((coarse ? 0.74 : 0.79) * (1 - shift) + 0.5 * shift);
      originY = height * ((coarse ? 0.25 : 0.48) * (1 - shift) + 0.5 * shift);
      const start = Math.min(width * (coarse ? 0.36 : 0.25), height * (coarse ? 0.22 : 0.33));
      const end = Math.min(width * 0.4, (chapterHeight - 32) / 1.5);
      scale = start + (end - start) * shift;
    } else {
      originX = width * (coarse ? 0.74 : 0.8);
      originY = height * (coarse ? 0.27 : 0.46);
      scale = Math.min(width * (coarse ? 0.38 : 0.23), height * 0.27);
    }
  }
  function project(p: MorphPoint) {
    const depth = 1 + p.z * 0.22;
    p.x = originX + p.x * scale * depth;
    p.y = originY + (p.y - p.z * 0.18) * scale * depth;
  }
  function sample(role: MorphRole, t: number, variant = 0) {
    pathParticle.role = role;
    pathParticle.t = t;
    pathParticle.variant = variant;
    sampleStructureMorph(
      pathParticle,
      drawingCell ? Math.min(0.5, displayed) : displayed,
      clock,
      point,
      scratch
    );
    project(point);
  }
  function path(role: MorphRole, variant = 0, closed = false, inset = 1) {
    context.beginPath();
    const steps = coarse ? 64 : 96;
    for (let i = 0; i <= steps; i++) {
      sample(role, i / steps, variant);
      const x = originX + (point.x - originX) * inset;
      const y = originY + (point.y - originY) * inset;
      if (!i) context.moveTo(x, y);
      else context.lineTo(x, y);
    }
    if (closed) context.closePath();
  }
  function opacity() {
    return demo ? 0.94 : motion === 'calm' ? 0.23 : home ? (coarse ? 0.5 : 0.48) : 0.32;
  }
  function shape(role: MorphRole, variant: number, fill: number, line: number, inset = 1) {
    sample(role, 0, variant);
    const alpha = point.alpha * opacity();
    if (alpha < 0.005) return;
    path(role, variant, true, inset);
    if (fill) {
      context.globalAlpha = alpha * fill * 0.45;
      context.fillStyle = accent;
      context.fill();
    }
    context.globalAlpha = alpha * line * 0.22;
    context.strokeStyle = accent;
    context.lineWidth = demo ? 1.25 : 1;
    context.stroke();
  }
  function drawDna(back: boolean) {
    const weight = (1 - smoothstep(displayed / 0.4)) * smoothstep(introAge / 1.5);
    if (weight < 0.005) return;
    // Draw rungs in two depth passes around the nearer backbone segments.
    for (let rung = 0; rung <= 26; rung++) {
      const t = rung / 26;
      sample('chromatin', t, 1);
      other.x = point.x;
      other.y = point.y;
      other.z = point.z;
      sample('chromatin', t, 0);
      if (point.z < 0 !== back) continue;
      context.globalAlpha = opacity() * weight * (t > 0.39 && t < 0.54 ? 0.13 : 0.05);
      context.strokeStyle = t > 0.39 && t < 0.54 ? ink : accent;
      context.lineWidth = demo ? 1.6 : 1;
      context.beginPath();
      context.moveTo(point.x, point.y);
      context.lineTo(other.x, other.y);
      context.stroke();
    }
    for (let strand = 0; strand < 2; strand++) {
      let previousX = 0,
        previousY = 0;
      for (let i = 0; i <= 96; i++) {
        sample('chromatin', i / 96, strand);
        if (i && point.z < 0 === back) {
          context.globalAlpha = opacity() * weight * (back ? 0.07 : 0.16);
          context.strokeStyle = accent;
          context.lineWidth = demo ? (back ? 1.6 : 2.6) : back ? 1 : 1.5;
          context.beginPath();
          context.moveTo(previousX, previousY);
          context.lineTo(point.x, point.y);
          context.stroke();
        }
        previousX = point.x;
        previousY = point.y;
      }
    }
  }
  function drawCell() {
    const leave = 1 - smoothstep((displayed - 0.5) / 0.25);
    if (leave < 0.005 || displayed < 0.1) return;
    drawingCell = true;
    // Soft volume inside a closed outline, followed by organelles and front rim.
    sample('membrane', 0);
    const alpha = point.alpha * opacity() * leave;
    path('membrane', 0, true);
    const glow = context.createRadialGradient(
      originX - scale * 0.25,
      originY - scale * 0.28,
      0,
      originX,
      originY,
      scale * 0.9
    );
    glow.addColorStop(0, accent);
    glow.addColorStop(0.7, surface);
    glow.addColorStop(1, accent);
    context.fillStyle = glow;
    context.globalAlpha = alpha * 0.07;
    context.fill();
    // Keep anatomy intact; fade structures while their particles form the ribbon.
    context.save();
    shape('membrane', 0, 0, 0.9 * leave);
    shape('membrane', 0, 0, 0.22 * leave, 0.984);
    shape('nucleus', 0, 0.09 * leave, 0.65 * leave);
    shape('nucleus', 0, 0, 0.2 * leave, 0.97);
    shape('nucleolus', 0, 0.25 * leave, 0.35 * leave);
    const cellWeight = smoothstep(displayed / 0.5) * leave;
    for (let strand = 0; strand < 2; strand++) {
      path('chromatin', strand);
      context.globalAlpha = opacity() * cellWeight * 0.07;
      context.lineWidth = demo ? 1.1 : 0.8;
      context.strokeStyle = accent;
      context.stroke();
    }
    sample('er', 0);
    const erAlpha = point.alpha * opacity() * leave;
    path('er');
    context.strokeStyle = accent;
    context.lineWidth = demo ? 2.4 : 1.4;
    context.globalAlpha = erAlpha * 0.12;
    context.stroke();
    for (const t of [0, 1]) {
      sample('nucleus', (-1.4 + t * 3.1) / TAU);
      context.beginPath();
      context.moveTo(point.x, point.y);
      sample('er', t);
      context.lineTo(point.x, point.y);
      context.stroke();
    }
    for (let variant = 0; variant < 3; variant++) {
      shape('mitochondria', variant, 0.12 * leave, 0.85 * leave);
      context.beginPath();
      // Cristae share their organelle's translation and rotation.
      const zoom = displayed <= 0.5 ? 0.65 + 0.35 * smoothstep(displayed * 2) : 1;
      for (let i = 0; i <= 64; i++) {
        sampleMito(i / 64, variant, clock, true, point);
        point.x *= zoom;
        point.y *= zoom;
        point.z *= zoom;
        project(point);
        if (!i) context.moveTo(point.x, point.y);
        else context.lineTo(point.x, point.y);
      }
      sample('mitochondria', 0, variant);
      context.globalAlpha = point.alpha * opacity() * leave * 0.14;
      context.lineWidth = demo ? 1.1 : 0.8;
      context.stroke();
    }
    context.restore();
    drawingCell = false;
  }
  function drawSignal() {
    const weight = smoothstep((displayed - 0.7) / 0.3);
    if (weight < 0.005) return;
    context.beginPath();
    for (let i = 0; i <= 160; i++) {
      const t = i / 160;
      const x = originX + (-1 + 2 * t) * scale,
        y = originY + (0.33 - signalHeight(t)) * scale;
      if (!i) context.moveTo(x, y);
      else context.lineTo(x, y);
    }
    context.strokeStyle = accent;
    context.lineWidth = demo ? 2.1 : 1.3;
    context.globalAlpha = opacity() * weight * 0.18;
    context.stroke();
    context.lineTo(originX + scale, originY + 0.33 * scale);
    context.lineTo(originX - scale, originY + 0.33 * scale);
    context.closePath();
    context.fillStyle = accent;
    context.globalAlpha = opacity() * weight * 0.025;
    context.fill();
    context.beginPath();
    context.moveTo(originX - scale, originY + scale * 0.33);
    context.lineTo(originX + scale, originY + scale * 0.33);
    context.globalAlpha = opacity() * weight * 0.35;
    context.lineWidth = 0.8;
    context.stroke();
    const t = (clock / 12) % 1;
    context.beginPath();
    context.arc(
      originX + (-1 + 2 * t) * scale,
      originY + (0.33 - signalHeight(t)) * scale,
      demo ? 3 : 2,
      0,
      TAU
    );
    context.globalAlpha = opacity() * weight * 0.7;
    context.fill();
  }
  function drawLabels() {
    if (!demo || !labels) return;
    context.font = '11px system-ui';
    context.lineWidth = 0.7;
    const cell = displayed > 0.43 && displayed < 0.57;
    const items: Array<[string, number, number, number, number]> = cell
      ? [
          ['Membrane', -0.73, -0.34, -0.95, -0.62],
          ['Nucleus', -0.26, -0.22, -0.9, -0.36],
          ['Mitochondrion', 0.48, -0.23, 0.95, -0.55],
          ['ER', 0.23, 0.03, 0.96, 0.1],
        ]
      : displayed < 0.12
        ? [['DNA · paired strands', 0, -0.2, 0, -0.58]]
        : displayed > 0.88
          ? [
              ['Illustrative expression profile', 0, -0.3, 0, -0.62],
              ['Genomic position →', 0, 0.33, 0, 0.63],
            ]
          : [];
    for (const [label, x, y, tx, ty] of items) {
      const labelX = Math.max(80, Math.min(width - 80, originX + tx * scale));
      const labelY = originY + ty * scale;
      context.globalAlpha = 0.35;
      context.strokeStyle = ink;
      context.beginPath();
      context.moveTo(originX + x * scale, originY + y * scale);
      context.lineTo(labelX, labelY + 4);
      context.stroke();
      context.globalAlpha = 0.9;
      context.fillStyle = ink;
      context.textAlign = 'center';
      context.fillText(label, labelX, labelY);
    }
  }
  function draw() {
    if (disposed) return;
    layout();
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    context.clearRect(0, 0, width, height);
    context.lineCap = 'round';
    context.lineJoin = 'round';
    const introBlend = smoothstep(introAge / 1.5);
    bucketHeads.fill(-1);
    let visible = 0;
    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];
      const visibility = particleVisibility(p, previousQuality, quality, qualityAge / 0.4);
      positions[i * 4 + 3] = 0;
      if (visibility <= 0) continue;
      sampleMorph(p, displayed, clock, point, scratch);
      if (introBlend < 1 && displayed < 0.02) {
        point.x += Math.sin(i * 2.39) * (1 - introBlend) * 0.55;
        point.y += Math.cos(i * 1.73) * (1 - introBlend) * 0.5;
      }
      point.x += offsets[i * 4];
      point.y += offsets[i * 4 + 1];
      project(point);
      positions[i * 4] = point.x;
      positions[i * 4 + 1] = point.y;
      positions[i * 4 + 2] = point.z;
      positions[i * 4 + 3] = point.alpha * visibility;
      const depth = Math.max(0, Math.min(5, Math.floor(((point.z + 0.55) / 1.1) * 6)));
      const alpha = point.alpha * visibility * (0.65 + depth * 0.07);
      if (alpha < 0.015) continue;
      visible++;
      const shade = Math.max(0, Math.min(11, Math.round(alpha * 12) - 1));
      const size = Math.max(0, Math.min(2, Math.floor((p.size - 0.6) / 0.3)));
      const color = p.role === 'nucleolus' ? 1 : 0;
      const bucket = ((depth * 2 + color) * 3 + size) * 12 + shade;
      nextParticle[i] = bucketHeads[bucket];
      bucketHeads[bucket] = i;
    }
    drawDna(true);
    drawCell();
    drawSignal();
    const dotScale = demo ? Math.max(0.85, Math.min(1.35, scale / 220)) : 0.9;
    for (let bucket = 0; bucket < bucketHeads.length; bucket++) {
      if (bucket === bucketHeads.length / 2) drawDna(false);
      if (bucketHeads[bucket] < 0) continue;
      const shade = bucket % 12;
      const size = Math.floor(bucket / 12) % 3;
      const color = Math.floor(bucket / 36) % 2;
      const depth = Math.floor(bucket / 72);
      const radius = (0.65 + size * 0.3) * dotScale * (0.85 + depth * 0.06);
      context.globalAlpha = opacity() * ((shade + 1) / 12);
      context.fillStyle = color ? ink : accent;
      context.beginPath();
      for (let i = bucketHeads[bucket]; i >= 0; i = nextParticle[i]) {
        const x = positions[i * 4],
          y = positions[i * 4 + 1];
        context.moveTo(x + radius, y);
        context.arc(x, y, radius, 0, TAU);
      }
      context.fill();
    }
    drawLabels();
    context.globalAlpha = 1;
    if (mask) {
      context.globalCompositeOperation = 'destination-out';
      context.drawImage(mask, 0, 0, width, height);
      context.globalCompositeOperation = 'source-over';
    }
    canvas.dataset.bgProgress = progress.toFixed(3);
    canvas.dataset.bgDisplayedProgress = displayed.toFixed(3);
    canvas.dataset.bgTransitioning = String(!!tween);
    canvas.dataset.bgQuality = quality.toFixed(2);
    canvas.dataset.bgVisible = String(visible);
    canvas.dataset.bgAllocated = String(particles.length);
    canvas.dataset.bgFrames = String(Number(canvas.dataset.bgFrames || 0) + 1);
  }
  function update(dt: number) {
    qualityAge = Math.min(0.4, qualityAge + dt);
    if (running) {
      const speed = motion === 'calm' ? 0.45 : 1;
      clock += dt * speed;
      introAge = Math.min(1.5, introAge + dt);
      if (demo) {
        playbackAge += dt * speed;
        progress = displayed = playbackProgress(playbackAge);
      } else {
        displayed += (progress - displayed) * (1 - Math.exp(-dt * 9));
        if (Math.abs(progress - displayed) < 0.0001) displayed = progress;
      }
    }
    if (tween) {
      tween.age += dt;
      displayed = tween.from + (progress - tween.from) * smoothstep(tween.age / 0.9);
      if (tween.age >= 0.9) {
        displayed = progress;
        tween = null;
      }
    }
    if (kickAge > 0) {
      kickAge = Math.max(0, kickAge - dt);
      const decay = Math.exp(-7 * dt);
      for (let i = 0; i < particles.length; i++) {
        if (!positions[i * 4 + 3]) continue;
        const index = i * 4;
        // Same exact spring as the model, applied in-place without per-dot tuples.
        for (let axis = 0; axis < 2; axis++) {
          const position = offsets[index + axis],
            velocity = offsets[index + axis + 2];
          const b = velocity + 7 * position;
          offsets[index + axis] = (position + b * dt) * decay;
          offsets[index + axis + 2] = (velocity - 7 * b * dt) * decay;
        }
      }
      if (!kickAge) offsets.fill(0);
    }
  }
  function frame(now: number) {
    raf = 0;
    if (!canAnimate() || (!running && !tween && !kickAge)) return;
    const elapsed = last ? now - last : 1000 / fps;
    if (elapsed >= 1000 / fps - 0.5) {
      last = now;
      const began = performance.now();
      update(Math.min(0.08, elapsed / 1000));
      draw();
      const cost = performance.now() - began;
      canvas.dataset.bgRenderMs = cost.toFixed(2);
      canvas.dataset.bgTicks = String(Number(canvas.dataset.bgTicks || 0) + 1);
      costly = cost > 10 ? costly + 1 : Math.max(0, costly - 1);
      if (costly > 20) {
        previousQuality = quality;
        quality = Math.max(0.35, quality * 0.75);
        qualityAge = 0;
        fps = Math.max(12, fps - 6);
        costly = 0;
      }
      slow = cost > 24 && fps === 12 ? slow + 1 : Math.max(0, slow - 1);
      if (slow > 30) {
        setRunning(false);
        canvas.dataset.bgFallback = 'static';
        displayed = progress;
        introAge = 1.5;
        draw();
        return;
      }
    }
    schedule();
  }
  function schedule() {
    if (!raf && canAnimate() && (running || tween || kickAge)) raf = requestAnimationFrame(frame);
  }
  function setRunning(value: boolean) {
    const next = value && canAnimate();
    if (next === running && next) return;
    running = next;
    cancelAnimationFrame(raf);
    raf = 0;
    last = 0;
    if (!running) {
      if (demo && tween) {
        progress = displayed;
        playbackAge = playbackTime(displayed);
      }
      tween = null;
      kickAge = 0;
      offsets.fill(0);
      if (reduced()) {
        introAge = 1.5;
        displayed = progress;
        draw();
      }
    } else if (demo) {
      if (tween) playbackAge = playbackTime(displayed);
      tween = null;
      progress = displayed;
    }
    schedule();
  }
  function setProgress(value: number, options?: { transition?: 'immediate' | 'smooth' }) {
    progress = clamp01(Number.isFinite(value) ? value : 0);
    if (progress > 0.02) introAge = 1.5;
    playbackAge = playbackTime(progress);
    if (options?.transition === 'smooth' && canAnimate() && !running) {
      tween = { from: displayed, age: 0 };
      last = 0;
      schedule();
    } else if (options?.transition === 'immediate' || demo || !running || !canAnimate()) {
      tween = null;
      displayed = progress;
    }
    draw();
  }
  function resize() {
    width = Math.max(1, canvas.clientWidth);
    height = Math.max(1, canvas.clientHeight);
    dpr = Math.min(devicePixelRatio || 1, coarse ? 1.5 : 2);
    const chapter = home
      ? document.querySelector<HTMLElement>('[data-background-stage="cell"]')
      : null;
    chapterHeight = chapter?.clientHeight || (coarse ? 220 : 280);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    draw();
  }
  function refreshPalette() {
    const style = getComputedStyle(document.documentElement);
    accent = style.getPropertyValue('--color-accent').trim() || '#2e6e5e';
    ink = style.getPropertyValue('--color-ink').trim() || '#141414';
    surface = style.getPropertyValue('--color-surface').trim() || '#fafaf8';
    const crt = document.documentElement.dataset.crtMode;
    if (crt && crt !== 'off')
      accent = ink = crt === 'amber' ? '#ffb000' : crt === 'green' ? '#33ff33' : '#38fdf8';
    draw();
  }
  resize();
  refreshPalette();
  return {
    resize,
    refreshPalette,
    setRunning,
    setProgress,
    getProgress: () => progress,
    reset() {
      tween = null;
      offsets.fill(0);
      kickAge = 0;
      clock = playbackAge = progress = displayed = 0;
      introAge = 1.5;
      draw();
    },
    setMotion(value) {
      motion = value;
      if (value === 'paused') {
        setRunning(false);
        introAge = 1.5;
      }
      draw();
    },
    setMask(value) {
      mask = value;
      draw();
    },
    step() {
      setProgress(Math.min(1, displayed + 0.05), { transition: 'immediate' });
    },
    configure(options) {
      if (options.labels !== undefined) {
        labels = options.labels;
        draw();
      }
    },
    interact(x, y) {
      if (!demo || !canAnimate()) return;
      const radius = Math.min(width, height) * 0.22;
      for (let i = 0; i < particles.length; i++) {
        if (!positions[i * 4 + 3]) continue;
        const dx = positions[i * 4] - x,
          dy = positions[i * 4 + 1] - y,
          distance = Math.hypot(dx, dy);
        if (distance > radius || distance < 1) continue;
        const push = (1 - distance / radius) * 0.23;
        offsets[i * 4 + 2] += (dx / distance) * push;
        offsets[i * 4 + 3] += (dy / distance) * push;
      }
      kickAge = 1.5;
      schedule();
    },
    status() {
      const label =
        progress < 0.25
          ? 'DNA: paired strands and a regulatory motif'
          : progress < 0.75
            ? 'Cell membrane, nucleus, chromatin, mitochondria, and endoplasmic reticulum'
            : 'Illustrative expression signal along genomic position';
      return `${label}. ${labels ? 'Structure labels enabled. ' : ''}Representative anatomy; relative scales are illustrative.`;
    },
    dispose() {
      setRunning(false);
      disposed = true;
      mask = null;
    },
  };
}
