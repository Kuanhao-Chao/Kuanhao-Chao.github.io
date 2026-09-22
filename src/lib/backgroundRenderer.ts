import {
  createTrajectory,
  flowVelocity,
  landscapeContours,
  landscapeLoss,
  seededBackgroundRandom,
  stepTrajectory,
  type BackgroundMotion,
  type Point,
  type Trajectory,
} from './backgroundModel';

export interface SceneRenderer {
  resize(): void;
  refreshPalette(): void;
  setMotion(motion: BackgroundMotion): void;
  setRunning(running: boolean): void;
  setMask(mask: HTMLCanvasElement | null): void;
  reset(): void;
  step(): void;
  configure(options: { strength?: number; rate?: number; method?: string; start?: Point }): void;
  interact(x: number, y: number): void;
  status(): string;
  dispose(): void;
}

type Strand = { point: Point; tail: Point[]; age: number; life: number; sampleTime: number };

export function createSceneRenderer(
  canvas: HTMLCanvasElement,
  scene: 'flow' | 'landscape',
  demo = false
): SceneRenderer {
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D unavailable');
  const context = ctx;
  const coarse = matchMedia('(pointer: coarse)').matches;
  let width = 1,
    height = 1,
    dpr = 1;
  let accent = '#2e6e5e',
    ink = '#141414';
  let motion: BackgroundMotion = 'ambient';
  let mask: HTMLCanvasElement | null = null;
  let running = false,
    disposed = false,
    raf = 0,
    last = 0,
    accumulator = 0,
    time = 0;
  let fps = coarse ? 20 : 24;
  let quality = 1,
    costlyFrames = 0,
    slowFrames = 0;
  let strength = 1,
    rate = 0.035,
    method = 'both';
  let start: Point = { x: 0.45, y: 1.65 };
  let trajectories: Trajectory[] = [];
  let dwell = 0,
    runAge = 0,
    sequence = 0;
  let strands: Strand[] = [];
  const vortices: Array<Point & { age: number }> = [];
  let random = seededBackgroundRandom();
  const segments = scene === 'landscape' ? landscapeContours() : [];
  let contourPath = new Path2D();

  function project(p: Point): Point {
    const size = demo
      ? Math.min(width - 48, height - 56)
      : Math.min(width * (coarse ? 1.3 : 0.7), height * 0.92);
    return {
      x: (demo ? width * 0.5 : width * (coarse ? 0.84 : 0.77)) + (p.x * size) / 4,
      y: (demo ? height * 0.5 : height * (coarse ? 0.27 : 0.47)) - (p.y * size) / 4,
    };
  }
  function unproject(x: number, y: number): Point {
    const origin = project({ x: 0, y: 0 });
    const scale = project({ x: 1, y: 0 }).x - origin.x;
    return {
      x: Math.max(-2, Math.min(2, (x - origin.x) / scale)),
      y: Math.max(-2, Math.min(2, (origin.y - y) / scale)),
    };
  }
  function newStrand(): Strand {
    const point = { x: random() * width, y: random() * height };
    const tail: Point[] = [];
    let p = { ...point };
    for (let i = 0; i < 64; i++) {
      tail.unshift({ ...p });
      const v = flowVelocity(p.x / 210, p.y / 210, time);
      p = { x: p.x - v.x * 1.98, y: p.y - v.y * 1.98 };
    }
    return { point, tail, age: random() * 14 + 2, life: 26 + random() * 18, sampleTime: 0 };
  }
  function reset() {
    random = seededBackgroundRandom();
    time = 0;
    vortices.length = 0;
    strands = Array.from({ length: coarse ? 28 : 90 }, newStrand);
    trajectories = [createTrajectory(start), createTrajectory(start, true)];
    dwell = 0;
    runAge = 0;
    accumulator = 0;
    draw();
  }
  function update(dt: number) {
    time += dt;
    if (scene === 'flow') {
      const speed = (motion === 'calm' ? 0.35 : 1) * strength;
      vortices.forEach((v) => {
        v.age += dt;
      });
      while (vortices[0]?.age > 5) vortices.shift();
      const count = Math.ceil(strands.length * quality * (motion === 'calm' ? 0.65 : 1));
      for (let i = 0; i < count; i++) {
        let s = strands[i];
        const v = flowVelocity(s.point.x / 210, s.point.y / 210, time);
        for (const vortex of vortices) {
          const dx = s.point.x - vortex.x,
            dy = s.point.y - vortex.y;
          const influence = Math.exp(-(dx * dx + dy * dy) / 18000) * (1 - vortex.age / 5);
          v.x -= dy * influence * 0.065;
          v.y += dx * influence * 0.065;
        }
        s.point = { x: s.point.x + v.x * dt * 22 * speed, y: s.point.y + v.y * dt * 22 * speed };
        s.age += dt;
        if (
          s.age > s.life ||
          s.point.x < -100 ||
          s.point.x > width + 100 ||
          s.point.y < -100 ||
          s.point.y > height + 100
        ) {
          s = strands[i] = newStrand();
          s.age = 0;
        }
        s.sampleTime += dt;
        if (s.sampleTime >= 0.09) {
          s.sampleTime %= 0.09;
          s.tail.push({ ...s.point });
          if (s.tail.length > 64) s.tail.shift();
        }
      }
    } else {
      runAge += dt;
      accumulator += dt;
      const interval = demo ? 0.075 : motion === 'calm' ? 0.5 : 0.2;
      while (accumulator >= interval) {
        trajectories.forEach((t) => stepTrajectory(t, rate));
        accumulator -= interval;
      }
      if (!demo && (trajectories.every((t) => t.status !== 'running') || runAge > 45)) {
        dwell += dt;
        if (dwell > 5) {
          sequence++;
          start = { x: sequence % 2 ? -0.45 : 0.45, y: sequence % 3 ? 1.65 : -1.65 };
          trajectories = [createTrajectory(start), createTrajectory(start, true)];
          dwell = 0;
          runAge = 0;
        }
      }
    }
  }
  function draw(interpolation = 1) {
    if (disposed) return;
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    context.clearRect(0, 0, width, height);
    context.lineCap = 'round';
    if (scene === 'flow') {
      const count = Math.ceil(strands.length * quality * (motion === 'calm' ? 0.65 : 1));
      for (let i = 0; i < count; i++) {
        const s = strands[i];
        const fade = Math.min(1, s.age / 2, (s.life - s.age) / 3);
        context.strokeStyle = i % 4 === 0 ? ink : accent;
        context.lineWidth = demo ? 1.35 : 1.1;
        for (let section = 0; section < 4; section++) {
          context.globalAlpha =
            (Math.max(0, fade) * (demo ? 0.64 : motion === 'calm' ? 0.08 : 0.16) * (section + 1)) /
            4;
          const from = Math.floor((section * (s.tail.length - 1)) / 4);
          const to = Math.floor(((section + 1) * (s.tail.length - 1)) / 4);
          context.beginPath();
          context.moveTo(s.tail[from].x, s.tail[from].y);
          for (let j = from + 1; j <= to; j++) context.lineTo(s.tail[j].x, s.tail[j].y);
          if (section === 3) context.lineTo(s.point.x, s.point.y);
          context.stroke();
        }
      }
    } else {
      context.strokeStyle = accent;
      context.lineWidth = demo ? 1 : 0.85;
      context.globalAlpha = demo ? 0.35 : motion === 'calm' ? 0.075 : 0.14;
      context.stroke(contourPath);
      for (const t of trajectories) {
        if ((method === 'gd' && t.momentum) || (method === 'momentum' && !t.momentum)) continue;
        const fade = demo ? 1 : Math.min(1, (runAge + 0.3) / 2, Math.max(0, (5 - dwell) / 2));
        context.globalAlpha = (demo ? 0.92 : 0.38) * fade;
        context.strokeStyle = t.momentum ? ink : accent;
        context.fillStyle = t.momentum ? ink : accent;
        context.lineWidth = demo ? 2 : 1.4;
        context.setLineDash(t.momentum ? [4, 5] : []);
        const previous = t.path[Math.max(0, t.path.length - 2)];
        const progress = t.status === 'running' ? interpolation : 1;
        const head = {
          x: previous.x + (t.point.x - previous.x) * progress,
          y: previous.y + (t.point.y - previous.y) * progress,
        };
        context.beginPath();
        t.path.forEach((p, i) => {
          const q = project(i === t.path.length - 1 ? head : p);
          if (i === 0) context.moveTo(q.x, q.y);
          else context.lineTo(q.x, q.y);
        });
        context.stroke();
        context.setLineDash([]);
        const p = project(head);
        context.beginPath();
        context.arc(p.x, p.y, demo ? 4 : 2.4, 0, Math.PI * 2);
        context.fill();
      }
      if (demo) {
        context.globalAlpha = 0.7;
        context.fillStyle = ink;
        context.font = '12px system-ui';
        context.textAlign = 'center';
        for (const x of [-2, -1, 0, 1, 2]) {
          const p = project({ x, y: -2 });
          context.fillText(String(x), p.x, p.y + 18);
        }
        for (const y of [-2, -1, 0, 1, 2]) {
          const p = project({ x: -2, y });
          context.fillText(String(y), p.x - 15, p.y + 4);
        }
        const xLabel = project({ x: 0, y: -2 });
        const yLabel = project({ x: -2, y: 0 });
        context.fillText('x', xLabel.x + 12, xLabel.y + 18);
        context.fillText('y', yLabel.x - 15, yLabel.y - 12);
      }
    }
    context.globalAlpha = 1;
    if (mask) {
      context.globalCompositeOperation = 'destination-out';
      context.drawImage(mask, 0, 0, width, height);
      context.globalCompositeOperation = 'source-over';
    }
    canvas.dataset.bgFrames = String(Number(canvas.dataset.bgFrames || 0) + 1);
  }
  function frame(now: number) {
    if (!running || disposed) return;
    raf = requestAnimationFrame(frame);
    const elapsed = last ? now - last : 1000 / fps;
    if (elapsed < 1000 / fps) return;
    last = now;
    const began = performance.now();
    const dt = Math.min(0.1, elapsed / 1000);
    const steps = Math.max(1, Math.ceil(dt / (1 / 60)));
    for (let i = 0; i < steps; i++) update(dt / steps);
    draw(
      scene === 'landscape'
        ? Math.min(1, accumulator / (demo ? 0.075 : motion === 'calm' ? 0.5 : 0.2))
        : 1
    );
    canvas.dataset.bgTicks = String(Number(canvas.dataset.bgTicks || 0) + 1);
    const cost = performance.now() - began;
    costlyFrames = cost > 10 ? costlyFrames + 1 : Math.max(0, costlyFrames - 1);
    if (costlyFrames > 20) {
      quality = Math.max(0.35, quality * 0.7);
      fps = Math.max(12, fps - 4);
      costlyFrames = 0;
    }
    slowFrames = cost > 24 && fps === 12 ? slowFrames + 1 : Math.max(0, slowFrames - 1);
    if (slowFrames > 30) {
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
    contourPath = new Path2D();
    segments.forEach((s) => {
      const a = project(s.a),
        b = project(s.b);
      contourPath.moveTo(a.x, a.y);
      contourPath.lineTo(b.x, b.y);
    });
    if (scene === 'flow') strands = Array.from({ length: coarse ? 28 : 90 }, newStrand);
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
  reset();
  resize();
  refreshPalette();
  return {
    resize,
    refreshPalette,
    setRunning,
    reset,
    setMotion(value) {
      motion = value;
      if (value === 'paused') setRunning(false);
      draw();
    },
    setMask(value) {
      mask = value;
      draw();
    },
    step() {
      if (scene === 'landscape') trajectories.forEach((t) => stepTrajectory(t, rate));
      else update(1 / 20);
      draw();
    },
    configure(options) {
      if (options.strength !== undefined) strength = Math.max(0.2, Math.min(2, options.strength));
      if (options.rate !== undefined) rate = Math.max(0.005, Math.min(0.3, options.rate));
      if (options.method) method = options.method;
      if (options.start) {
        start = { ...options.start };
        reset();
      }
      draw();
    },
    interact(x, y) {
      if (scene === 'flow') {
        if (vortices.length >= 5) vortices.shift();
        vortices.push({ x, y, age: 0 });
      } else {
        start = unproject(x, y);
        reset();
      }
    },
    status() {
      if (scene === 'flow')
        return vortices.length
          ? `${vortices.length} temporary ${vortices.length === 1 ? 'vortex' : 'vortices'}. Each fades after five simulation seconds.`
          : 'Move across the canvas or add a vortex to bend the flow.';
      return trajectories
        .filter((t) => method === 'both' || (method === 'momentum') === t.momentum)
        .map(
          (t) =>
            `${t.momentum ? 'Momentum' : 'Gradient descent'}: ${t.status}, loss ${landscapeLoss(t.point).toFixed(4)}, ${t.iterations} steps${t.status === 'diverged' ? ' — non-finite update; reduce the step size' : t.status === 'outside plot' ? ' — stopped at the plot boundary, not necessarily divergent; try a smaller step size' : ''}`
        )
        .join(' · ');
    },
    dispose() {
      setRunning(false);
      disposed = true;
      strands = [];
      trajectories = [];
      mask = null;
    },
  };
}
