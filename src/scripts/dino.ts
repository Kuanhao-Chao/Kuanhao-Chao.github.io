/**
 * Dino Run DOM controller: Canvas-2D rendering, input, HUD updates, and the
 * fixed-timestep loop. All runner rules live in `src/lib/dino.ts`.
 */
import {
  createGame,
  duck,
  jump,
  releaseDuck,
  reset,
  start,
  step as engineStep,
  mulberry32,
  type DinoState,
  type Obstacle,
  type RNG,
} from '../lib/dino';

interface DinoRunTestApi {
  state: () => DinoState;
  status: () => DinoState['status'];
  score: () => number;
  best: () => number;
  jump: () => void;
  duck: () => void;
  releaseDuck: () => void;
  restart: () => void;
  pause: () => void;
  resume: () => void;
  tick: (frames?: number) => void;
  isRunning: () => boolean;
}

declare global {
  interface Window {
    __dinoRun?: DinoRunTestApi;
    __dinoRunInstances?: number;
  }
}

export interface DinoRunController {
  destroy: () => void;
}

const BEST_KEY = 'khc-dino-run-best';
const STEP_MS = 1000 / 60;

const readBest = (): number => {
  try {
    return Number(localStorage.getItem(BEST_KEY)) || 0;
  } catch {
    return 0;
  }
};

const writeBest = (score: number): void => {
  try {
    localStorage.setItem(BEST_KEY, String(score));
  } catch {
    /* Best score simply does not persist when storage is unavailable. */
  }
};

const cssVar = (name: string, fallback: string): string =>
  getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;

const isInteractive = (target: EventTarget | null): boolean =>
  target instanceof HTMLElement &&
  !!target.closest('a[href], button, input, select, textarea, [contenteditable="true"]');

export function initDinoRun(root: ParentNode = document): DinoRunController | null {
  const canvasEl = root.querySelector<HTMLCanvasElement>('[data-dino-canvas]');
  if (!canvasEl) return null;
  if (canvasEl.dataset.dinoReady === 'true') return null;
  canvasEl.dataset.dinoReady = 'true';

  const maybeCtx = canvasEl.getContext('2d');
  if (!maybeCtx) {
    delete canvasEl.dataset.dinoReady;
    return null;
  }
  const canvas: HTMLCanvasElement = canvasEl;
  const ctx: CanvasRenderingContext2D = maybeCtx;

  const scoreEl = root.querySelector<HTMLElement>('[data-dino-score]');
  const bestEl = root.querySelector<HTMLElement>('[data-dino-best]');
  const speedEl = root.querySelector<HTMLElement>('[data-dino-speed]');
  const statusEl = root.querySelector<HTMLElement>('[data-dino-status]');
  const pauseBtn = root.querySelector<HTMLButtonElement>('[data-dino-pause]');
  const restartBtn = root.querySelector<HTMLButtonElement>('[data-dino-restart]');
  const jumpBtn = root.querySelector<HTMLButtonElement>('[data-dino-jump]');
  const duckBtn = root.querySelector<HTMLButtonElement>('[data-dino-duck]');

  const seedParam = new URLSearchParams(location.search).get('seed');
  const freshSeed = (): number =>
    seedParam != null ? Number(seedParam) >>> 0 : (Date.now() ^ (Math.random() * 0xffffffff)) >>> 0;

  let rng: RNG = mulberry32(freshSeed());
  const state = createGame({}, rng);
  let best = readBest();
  let colors = readColors();

  function readColors() {
    return {
      board: cssVar('--color-surface', '#ffffff'),
      ink: cssVar('--color-ink', '#141414'),
      muted: cssVar('--color-muted', '#6b6b6b'),
      rule: cssVar('--color-rule', '#e5e4df'),
      accent: cssVar('--color-accent', '#2e6e5e'),
      accentDark: cssVar('--color-accent-dark', '#245546'),
      warmText: cssVar('--color-badge-warm-text', '#8a5a1a'),
      warmBg: cssVar('--color-badge-warm-bg', '#fbf3e4'),
      warmBorder: cssVar('--color-badge-warm-border', '#e3c79a'),
      onAccent: cssVar('--color-on-accent', '#ffffff'),
    };
  }

  let raf = 0;
  let last = 0;
  let acc = 0;
  let paused = false;
  let duckReleaseTimer = 0;

  const ro = new ResizeObserver(() => resize());

  function resize() {
    const rect = canvas.getBoundingClientRect();
    const w = Math.max(1, rect.width);
    const h = Math.max(1, rect.height);
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.setTransform((w * dpr) / state.width, 0, 0, (h * dpr) / state.height, 0, 0);
    render();
  }

  function roundRect(x: number, y: number, w: number, h: number, r: number) {
    const rr = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.arcTo(x + w, y, x + w, y + h, rr);
    ctx.arcTo(x + w, y + h, x, y + h, rr);
    ctx.arcTo(x, y + h, x, y, rr);
    ctx.arcTo(x, y, x + w, y, rr);
    ctx.closePath();
  }

  function render() {
    ctx.clearRect(0, 0, state.width, state.height);
    ctx.fillStyle = colors.board;
    ctx.fillRect(0, 0, state.width, state.height);
    drawBackground();
    for (const obstacle of state.obstacles) drawObstacle(obstacle);
    drawRunner();
  }

  function drawBackground() {
    const ground = state.groundY;
    ctx.save();
    ctx.strokeStyle = colors.rule;
    ctx.lineWidth = 1.5;
    ctx.globalAlpha = 0.85;
    ctx.beginPath();
    ctx.moveTo(0, ground + 0.5);
    ctx.lineTo(state.width, ground + 0.5);
    ctx.stroke();

    const tickSpacing = 74;
    const offset = -((state.distance * 0.72) % tickSpacing);
    ctx.font = `600 13px ${cssVar('--font-display', 'system-ui')}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    const bases = ['A', 'C', 'G', 'T'];
    for (let x = offset; x < state.width + tickSpacing; x += tickSpacing) {
      ctx.globalAlpha = 0.55;
      ctx.strokeStyle = colors.rule;
      ctx.beginPath();
      ctx.moveTo(x, ground + 8);
      ctx.lineTo(x, ground + 21);
      ctx.stroke();
      ctx.fillStyle = colors.muted;
      ctx.fillText(
        bases[Math.abs(Math.floor((x + state.distance) / tickSpacing)) % 4],
        x,
        ground + 29
      );
    }

    ctx.globalAlpha = 0.18;
    ctx.strokeStyle = colors.accent;
    ctx.beginPath();
    const waveOffset = (state.distance * 0.035) % 48;
    for (let x = -48; x <= state.width + 48; x += 12) {
      const y = 74 + Math.sin((x + waveOffset) / 24) * 10;
      if (x === -48) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.restore();
  }

  function drawRunner() {
    const ducking = state.runner.ducking && state.runner.grounded;
    const x = state.runner.x;
    const bottom = state.runner.y;

    ctx.save();
    ctx.fillStyle = colors.accent;
    ctx.strokeStyle = colors.accentDark;
    ctx.lineWidth = 2;

    if (ducking) {
      roundRect(x + 5, bottom - 36, 58, 29, 9);
      ctx.fill();
      ctx.stroke();
      roundRect(x + 48, bottom - 50, 28, 25, 8);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = colors.onAccent;
      ctx.beginPath();
      ctx.arc(x + 67, bottom - 39, 2.6, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = colors.accentDark;
      ctx.fillRect(x + 15, bottom - 7, 10, 7);
      ctx.fillRect(x + 43, bottom - 7, 10, 7);
    } else {
      roundRect(x + 8, bottom - 51, 34, 42, 10);
      ctx.fill();
      ctx.stroke();
      roundRect(x + 34, bottom - 66, 27, 27, 8);
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x + 9, bottom - 41);
      ctx.lineTo(x - 9, bottom - 31);
      ctx.lineTo(x + 11, bottom - 28);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = colors.onAccent;
      ctx.beginPath();
      ctx.arc(x + 53, bottom - 56, 2.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = colors.accentDark;
      ctx.fillRect(x + 17, bottom - 9, 9, 9);
      ctx.fillRect(x + 35, bottom - 9, 9, 9);
      ctx.fillStyle = colors.onAccent;
      ctx.globalAlpha = 0.55;
      ctx.fillRect(x + 17, bottom - 37, 19, 3);
      ctx.globalAlpha = 1;
    }
    ctx.restore();
  }

  function drawObstacle(obstacle: Obstacle) {
    if (obstacle.kind === 'splice-arch') {
      ctx.save();
      ctx.fillStyle = colors.ink;
      ctx.globalAlpha = 0.85;
      roundRect(obstacle.x, obstacle.y, obstacle.width, obstacle.height, 8);
      ctx.fill();
      ctx.fillRect(obstacle.x + 8, obstacle.y + obstacle.height - 2, 6, 34);
      ctx.fillRect(obstacle.x + obstacle.width - 14, obstacle.y + obstacle.height - 2, 6, 34);
      ctx.fillStyle = colors.board;
      ctx.globalAlpha = 0.65;
      ctx.fillRect(obstacle.x + 14, obstacle.y + 9, obstacle.width - 28, 3);
      ctx.restore();
      return;
    }

    ctx.save();
    ctx.fillStyle = obstacle.kind === 'repeat-stack' ? colors.warmBg : colors.accentDark;
    ctx.strokeStyle = obstacle.kind === 'repeat-stack' ? colors.warmBorder : colors.accentDark;
    ctx.lineWidth = 2;
    roundRect(obstacle.x, obstacle.y, obstacle.width, obstacle.height, 6);
    ctx.fill();
    ctx.stroke();

    if (obstacle.kind === 'repeat-stack') {
      ctx.fillStyle = colors.warmText;
      for (let y = obstacle.y + 9; y < obstacle.y + obstacle.height - 6; y += 13) {
        ctx.fillRect(obstacle.x + 8, y, obstacle.width - 16, 3);
      }
    } else {
      ctx.fillStyle = colors.onAccent;
      ctx.globalAlpha = 0.72;
      ctx.fillRect(obstacle.x + 8, obstacle.y + 10, obstacle.width - 16, 3);
      ctx.fillRect(obstacle.x + 8, obstacle.y + obstacle.height - 13, obstacle.width - 16, 3);
    }
    ctx.restore();
  }

  function statusMessage(): string {
    if (state.status === 'ready') return 'Ready - tap, Space, or Jump to start';
    if (state.status === 'over') return `Run over - ${state.score} bp. Tap or Space to restart`;
    if (paused) return 'Paused';
    return 'Running';
  }

  function updateHud() {
    if (scoreEl) scoreEl.textContent = String(state.score);
    if (bestEl) bestEl.textContent = String(best);
    if (speedEl) speedEl.textContent = String(Math.round(state.speed));
    if (statusEl) statusEl.textContent = statusMessage();
    if (pauseBtn) {
      pauseBtn.disabled = state.status !== 'playing';
      pauseBtn.dataset.active = paused ? 'true' : 'false';
      const label = paused ? 'Resume' : 'Pause';
      pauseBtn.setAttribute('aria-label', label);
      const text = pauseBtn.querySelector('[data-button-label]');
      if (text) text.textContent = label;
    }
  }

  function tickOnce() {
    engineStep(state, rng, STEP_MS);
    if (state.score > best) {
      best = state.score;
      writeBest(best);
    }
    if (state.status !== 'playing') paused = false;
  }

  function frame(ts: number) {
    raf = requestAnimationFrame(frame);
    if (state.status !== 'playing' || paused) {
      last = ts;
      render();
      updateHud();
      return;
    }
    if (!last) last = ts;
    acc += Math.min(250, ts - last);
    last = ts;
    let guard = 0;
    while (acc >= STEP_MS && state.status === 'playing' && guard++ < 12) {
      acc -= STEP_MS;
      tickOnce();
    }
    render();
    updateHud();
  }

  function restart(startNow = true) {
    window.clearTimeout(duckReleaseTimer);
    duckReleaseTimer = 0;
    rng = mulberry32(freshSeed());
    reset(state, rng);
    paused = false;
    last = 0;
    acc = 0;
    if (startNow) start(state);
    render();
    updateHud();
  }

  function doJump() {
    if (state.status === 'over') {
      restart(true);
      return;
    }
    if (paused) paused = false;
    jump(state);
    render();
    updateHud();
  }

  function doDuck() {
    if (state.status === 'over') {
      restart(true);
      return;
    }
    if (paused) paused = false;
    duck(state);
    render();
    updateHud();
  }

  function doReleaseDuck() {
    releaseDuck(state);
    render();
    updateHud();
  }

  function togglePause() {
    if (state.status !== 'playing') return;
    paused = !paused;
    if (!paused) last = 0;
    updateHud();
  }

  function pulseDuck() {
    doDuck();
    window.clearTimeout(duckReleaseTimer);
    duckReleaseTimer = window.setTimeout(() => {
      doReleaseDuck();
      duckReleaseTimer = 0;
    }, 420);
  }

  function onKeyDown(event: KeyboardEvent) {
    if (isInteractive(event.target)) return;
    const key = event.key.toLowerCase();
    if (event.key === 'ArrowUp' || key === 'w' || event.key === ' ') {
      event.preventDefault();
      doJump();
    } else if (event.key === 'ArrowDown' || key === 's') {
      event.preventDefault();
      doDuck();
    } else if (event.key === 'Enter') {
      event.preventDefault();
      if (state.status === 'playing') togglePause();
      else restart(true);
    } else if (key === 'p') {
      event.preventDefault();
      togglePause();
    }
  }

  function onKeyUp(event: KeyboardEvent) {
    if (isInteractive(event.target)) return;
    const key = event.key.toLowerCase();
    if (event.key === 'ArrowDown' || key === 's') {
      event.preventDefault();
      doReleaseDuck();
    }
  }

  let touchStart: { x: number; y: number } | null = null;
  function onTouchStart(event: TouchEvent) {
    const touch = event.changedTouches[0];
    touchStart = { x: touch.clientX, y: touch.clientY };
  }

  function onTouchMove(event: TouchEvent) {
    event.preventDefault();
  }

  function onTouchEnd(event: TouchEvent) {
    if (!touchStart) return;
    event.preventDefault();
    const touch = event.changedTouches[0];
    const dx = touch.clientX - touchStart.x;
    const dy = touch.clientY - touchStart.y;
    const adx = Math.abs(dx);
    const ady = Math.abs(dy);
    touchStart = null;
    if (state.status === 'over') {
      restart(true);
    } else if (Math.max(adx, ady) < 22 || dy < -24) {
      doJump();
    } else if (dy > 24 && ady > adx) {
      pulseDuck();
    }
  }

  function onCanvasClick() {
    if (state.status === 'over') restart(true);
    else doJump();
  }

  function onRestart() {
    restart(true);
  }

  function onDuckPointerDown(event: PointerEvent) {
    event.preventDefault();
    duckBtn?.setPointerCapture(event.pointerId);
    doDuck();
  }

  function onDuckPointerUp(event: PointerEvent) {
    if (duckBtn?.hasPointerCapture(event.pointerId)) duckBtn.releasePointerCapture(event.pointerId);
    doReleaseDuck();
  }

  function onDuckButtonKeyDown(event: KeyboardEvent) {
    if (event.key !== ' ' && event.key !== 'Enter') return;
    event.preventDefault();
    doDuck();
  }

  function onDuckButtonKeyUp(event: KeyboardEvent) {
    if (event.key !== ' ' && event.key !== 'Enter') return;
    event.preventDefault();
    doReleaseDuck();
  }

  function onTheme() {
    colors = readColors();
    render();
  }

  function onHide() {
    if (document.hidden && state.status === 'playing') {
      paused = true;
      updateHud();
    }
  }

  function onBlur() {
    if (state.status === 'playing') {
      paused = true;
      updateHud();
    }
  }

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  canvas.addEventListener('touchstart', onTouchStart, { passive: true });
  canvas.addEventListener('touchmove', onTouchMove, { passive: false });
  canvas.addEventListener('touchend', onTouchEnd, { passive: false });
  canvas.addEventListener('click', onCanvasClick);
  pauseBtn?.addEventListener('click', togglePause);
  restartBtn?.addEventListener('click', onRestart);
  jumpBtn?.addEventListener('click', doJump);
  duckBtn?.addEventListener('pointerdown', onDuckPointerDown);
  duckBtn?.addEventListener('pointerup', onDuckPointerUp);
  duckBtn?.addEventListener('pointercancel', onDuckPointerUp);
  duckBtn?.addEventListener('pointerleave', onDuckPointerUp);
  duckBtn?.addEventListener('keydown', onDuckButtonKeyDown);
  duckBtn?.addEventListener('keyup', onDuckButtonKeyUp);
  document.addEventListener('visibilitychange', onHide);
  window.addEventListener('blur', onBlur);
  document.addEventListener('khc:theme-change', onTheme);
  ro.observe(canvas);

  resize();
  updateHud();
  raf = requestAnimationFrame(frame);

  window.__dinoRunInstances = (window.__dinoRunInstances ?? 0) + 1;
  window.__dinoRun = {
    state: () => state,
    status: () => state.status,
    score: () => state.score,
    best: () => best,
    jump: () => doJump(),
    duck: () => doDuck(),
    releaseDuck: () => doReleaseDuck(),
    restart: () => restart(true),
    pause: () => {
      paused = true;
      updateHud();
    },
    resume: () => {
      paused = false;
      last = 0;
      updateHud();
    },
    tick: (frames = 1) => {
      if (state.status === 'ready') start(state);
      for (let i = 0; i < frames && state.status === 'playing'; i++) tickOnce();
      render();
      updateHud();
    },
    isRunning: () => raf !== 0 && state.status === 'playing' && !paused,
  };

  function destroy() {
    cancelAnimationFrame(raf);
    raf = 0;
    window.clearTimeout(duckReleaseTimer);
    ro.disconnect();
    window.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('keyup', onKeyUp);
    canvas.removeEventListener('touchstart', onTouchStart);
    canvas.removeEventListener('touchmove', onTouchMove);
    canvas.removeEventListener('touchend', onTouchEnd);
    canvas.removeEventListener('click', onCanvasClick);
    pauseBtn?.removeEventListener('click', togglePause);
    restartBtn?.removeEventListener('click', onRestart);
    jumpBtn?.removeEventListener('click', doJump);
    duckBtn?.removeEventListener('pointerdown', onDuckPointerDown);
    duckBtn?.removeEventListener('pointerup', onDuckPointerUp);
    duckBtn?.removeEventListener('pointercancel', onDuckPointerUp);
    duckBtn?.removeEventListener('pointerleave', onDuckPointerUp);
    duckBtn?.removeEventListener('keydown', onDuckButtonKeyDown);
    duckBtn?.removeEventListener('keyup', onDuckButtonKeyUp);
    document.removeEventListener('visibilitychange', onHide);
    window.removeEventListener('blur', onBlur);
    document.removeEventListener('khc:theme-change', onTheme);
    delete canvas.dataset.dinoReady;
    window.__dinoRunInstances = Math.max(0, (window.__dinoRunInstances ?? 1) - 1);
    if (window.__dinoRun && window.__dinoRunInstances === 0) delete window.__dinoRun;
  }

  return { destroy };
}
