/**
 * Snake DOM controller — Canvas-2D rendering, input (keyboard + touch), a
 * fixed-timestep game loop, HUD, and lifecycle. All game *rules* live in the
 * pure engine (`src/lib/snake.ts`); this file only draws it, feeds it input, and
 * ticks it on a clock.
 *
 * View-transition safe: `initSnake` is idempotent per canvas and returns a
 * `destroy()` that cancels the loop and removes every listener, so navigating
 * away with the global ClientRouter never leaks a second loop (the failure mode
 * behind the filter-island bug). Colors are read from CSS custom properties and
 * refreshed on the site's `khc:theme-change` event, so it tracks light/dark.
 */
import {
  createGame,
  step as engineStep,
  turn,
  start as engineStart,
  reset,
  mulberry32,
  type GameState,
  type Dir,
  type RNG,
} from '../lib/snake';

interface SnakeTestApi {
  state: () => GameState;
  status: () => GameState['status'];
  score: () => number;
  best: () => number;
  start: () => void;
  restart: () => void;
  turn: (d: Dir) => void;
  tick: () => void;
  pause: () => void;
  resume: () => void;
  isRunning: () => boolean;
}

declare global {
  interface Window {
    __snake?: SnakeTestApi;
    __snakeInstances?: number;
  }
}

const COLS = 17;
const ROWS = 17;
const BASE_INTERVAL = 145; // ms per tick at 0 bases
const MIN_INTERVAL = 70;
const SPEEDUP_PER_BASE = 3; // ms faster per base eaten
const BEST_KEY = 'khc-snake-best';

const readBest = (): number => {
  try {
    return Number(localStorage.getItem(BEST_KEY)) || 0;
  } catch {
    return 0;
  }
};
const writeBest = (n: number): void => {
  try {
    localStorage.setItem(BEST_KEY, String(n));
  } catch {
    /* private mode / disabled storage — best is simply not persisted */
  }
};

const cssVar = (name: string, fallback: string): string =>
  getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;

const KEY_DIRS: Record<string, Dir> = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
  w: 'up',
  s: 'down',
  a: 'left',
  d: 'right',
};

export interface SnakeController {
  destroy: () => void;
}

export function initSnake(root: ParentNode = document): SnakeController | null {
  const canvasEl = root.querySelector<HTMLCanvasElement>('[data-snake-canvas]');
  if (!canvasEl) return null;
  if (canvasEl.dataset.snakeReady === 'true') return null; // idempotent per DOM
  canvasEl.dataset.snakeReady = 'true';

  const ctx = canvasEl.getContext('2d');
  if (!ctx) return null;
  // Non-null alias so the closures below keep a non-nullable `canvas` type.
  const canvas: HTMLCanvasElement = canvasEl;

  const scoreEl = root.querySelector<HTMLElement>('[data-snake-score]');
  const bestEl = root.querySelector<HTMLElement>('[data-snake-best]');
  const statusEl = root.querySelector<HTMLElement>('[data-snake-status]');
  const strandEl = root.querySelector<HTMLElement>('[data-snake-strand]');
  const pauseBtn = root.querySelector<HTMLButtonElement>('[data-snake-pause]');
  const restartBtn = root.querySelector<HTMLButtonElement>('[data-snake-restart]');

  // Deterministic seed via ?seed= (used by e2e); otherwise varied per session.
  const seedParam = new URLSearchParams(location.search).get('seed');
  const freshSeed = (): number =>
    seedParam != null
      ? Number(seedParam) >>> 0
      : ((Date.now() ^ (Math.random() * 0xffffffff)) >>> 0);

  let rng: RNG = mulberry32(freshSeed());
  const state: GameState = createGame({ cols: COLS, rows: ROWS }, rng);
  let best = readBest();
  const strand: string[] = []; // eaten bases, for the little "sequence" readout

  let colors = readColors();
  function readColors() {
    return {
      board: cssVar('--color-surface', '#ffffff'),
      grid: cssVar('--color-rule', '#e5e4df'),
      snake: cssVar('--color-accent', '#2e6e5e'),
      head: cssVar('--color-accent-dark', '#245546'),
      food: cssVar('--color-badge-warm-text', '#8a5a1a'),
      foodBg: cssVar('--color-badge-warm-bg', '#fbf3e4'),
      foodBorder: cssVar('--color-badge-warm-border', '#e3c79a'),
    };
  }

  // ---- rendering ---------------------------------------------------------
  let cell = 20;
  const ro = new ResizeObserver(() => resize());

  function resize() {
    const rect = canvas.getBoundingClientRect();
    const size = Math.max(1, Math.min(rect.width, rect.height));
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(size * dpr);
    canvas.height = Math.round(size * dpr);
    ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
    cell = size / COLS;
    render();
  }

  function roundRect(x: number, y: number, w: number, h: number, r: number) {
    const rr = Math.min(r, w / 2, h / 2);
    ctx!.beginPath();
    ctx!.moveTo(x + rr, y);
    ctx!.arcTo(x + w, y, x + w, y + h, rr);
    ctx!.arcTo(x + w, y + h, x, y + h, rr);
    ctx!.arcTo(x, y + h, x, y, rr);
    ctx!.arcTo(x, y, x + w, y, rr);
    ctx!.closePath();
  }

  function render() {
    const W = COLS * cell;
    const H = ROWS * cell;
    ctx!.clearRect(0, 0, W, H);
    ctx!.fillStyle = colors.board;
    ctx!.fillRect(0, 0, W, H);

    // faint grid
    ctx!.strokeStyle = colors.grid;
    ctx!.globalAlpha = 0.5;
    ctx!.lineWidth = 1;
    ctx!.beginPath();
    for (let i = 1; i < COLS; i++) {
      ctx!.moveTo(Math.round(i * cell) + 0.5, 0);
      ctx!.lineTo(Math.round(i * cell) + 0.5, H);
    }
    for (let j = 1; j < ROWS; j++) {
      ctx!.moveTo(0, Math.round(j * cell) + 0.5);
      ctx!.lineTo(W, Math.round(j * cell) + 0.5);
    }
    ctx!.stroke();
    ctx!.globalAlpha = 1;

    drawFood();

    const pad = Math.max(1, cell * 0.11);
    const r = Math.max(2, cell * 0.22);
    for (let i = 0; i < state.snake.length; i++) {
      const p = state.snake[i];
      ctx!.fillStyle = i === 0 ? colors.head : colors.snake;
      ctx!.globalAlpha = i === 0 ? 1 : Math.max(0.55, 1 - i * 0.018);
      roundRect(p.x * cell + pad, p.y * cell + pad, cell - 2 * pad, cell - 2 * pad, r);
      ctx!.fill();
    }
    ctx!.globalAlpha = 1;
  }

  function drawFood() {
    const pad = Math.max(1, cell * 0.11);
    const s = cell - 2 * pad;
    const x = state.food.x * cell + pad;
    const y = state.food.y * cell + pad;
    ctx!.fillStyle = colors.foodBg;
    ctx!.strokeStyle = colors.foodBorder;
    ctx!.lineWidth = Math.max(1, cell * 0.06);
    roundRect(x, y, s, s, Math.max(2, cell * 0.28));
    ctx!.fill();
    ctx!.stroke();
    ctx!.fillStyle = colors.food;
    ctx!.font = `700 ${Math.round(cell * 0.56)}px ${cssVar('--font-display', 'system-ui')}`;
    ctx!.textAlign = 'center';
    ctx!.textBaseline = 'middle';
    ctx!.fillText(state.food.base, x + s / 2, y + s / 2 + cell * 0.02);
  }

  // ---- HUD ---------------------------------------------------------------
  function statusMessage(): string {
    if (state.status === 'ready') return 'Press an arrow, Space, or tap to start';
    if (state.status === 'won') return `You filled the board — ${state.score} bases! Tap to play again`;
    if (state.status === 'over') return `Game over — ${state.score} bases. Tap or Space to play again`;
    if (paused) return 'Paused — Space or tap to resume';
    // Constant while playing so this polite live region isn't re-announced on
    // every tick; the running score lives in the non-live HUD instead.
    return 'Playing — steer to eat bases';
  }

  function updateHud() {
    if (scoreEl) scoreEl.textContent = String(state.score);
    if (bestEl) bestEl.textContent = String(best);
    if (strandEl) strandEl.textContent = strand.slice(-14).join('');
    if (statusEl) statusEl.textContent = statusMessage();
    if (pauseBtn) {
      pauseBtn.textContent = paused ? 'Resume' : 'Pause';
      pauseBtn.disabled = state.status !== 'playing';
    }
  }

  // ---- loop --------------------------------------------------------------
  let raf = 0;
  let last = 0;
  let acc = 0;
  let paused = false;

  const interval = () => Math.max(MIN_INTERVAL, BASE_INTERVAL - state.score * SPEEDUP_PER_BASE);

  function doTick() {
    const eaten = state.food.base;
    const prev = state.score;
    engineStep(state, rng);
    if (state.score > prev) strand.push(eaten);
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
      return;
    }
    if (!last) last = ts;
    acc += ts - last;
    last = ts;
    let changed = false;
    let guard = 0;
    while (acc >= interval() && state.status === 'playing' && guard++ < 10) {
      acc -= interval();
      doTick();
      changed = true;
    }
    if (changed) {
      render();
      updateHud();
    }
  }

  // ---- state transitions -------------------------------------------------
  function beginPlay() {
    engineStart(state);
    last = 0;
    acc = 0;
    paused = false;
    updateHud();
  }
  function togglePause() {
    if (state.status !== 'playing') return;
    paused = !paused;
    if (!paused) last = 0;
    updateHud();
  }
  function doRestart() {
    rng = mulberry32(freshSeed());
    reset(state, rng);
    strand.length = 0;
    beginPlay();
    render();
  }
  /** Space / Enter / tap / canvas click. */
  function primary() {
    if (state.status === 'ready') beginPlay();
    else if (state.status === 'over' || state.status === 'won') doRestart();
    else togglePause();
  }

  // ---- input -------------------------------------------------------------
  // Never hijack keys aimed at a focused link / button / field — otherwise this
  // window-level handler would swallow Enter/Space/arrows meant for site nav.
  const isInteractive = (t: EventTarget | null) =>
    t instanceof HTMLElement &&
    !!t.closest('a[href], button, input, select, textarea, [contenteditable="true"]');

  function onKey(e: KeyboardEvent) {
    if (isInteractive(e.target)) return;
    const dir = KEY_DIRS[e.key] ?? KEY_DIRS[e.key.toLowerCase()];
    if (dir) {
      e.preventDefault();
      if (state.status === 'ready') beginPlay();
      turn(state, dir);
      updateHud();
      return;
    }
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      primary();
    }
  }

  let touchStart: { x: number; y: number } | null = null;
  function onTouchStart(e: TouchEvent) {
    touchStart = { x: e.changedTouches[0].clientX, y: e.changedTouches[0].clientY };
  }
  function onTouchMove(e: TouchEvent) {
    e.preventDefault(); // stop the page scrolling/bouncing while swiping on the board
  }
  function onTouchEnd(e: TouchEvent) {
    if (!touchStart) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - touchStart.x;
    const dy = t.clientY - touchStart.y;
    const adx = Math.abs(dx);
    const ady = Math.abs(dy);
    e.preventDefault(); // suppress the synthetic click so a tap isn't double-handled
    if (Math.max(adx, ady) < 24) {
      primary();
    } else if (state.status === 'over' || state.status === 'won') {
      primary(); // any swipe on the end screen restarts, like a tap
    } else {
      const dir: Dir = adx > ady ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up';
      if (state.status === 'ready') beginPlay();
      turn(state, dir);
      updateHud();
    }
    touchStart = null;
  }
  const onCanvasClick = () => primary();
  const onPause = () => togglePause();
  const onRestart = () => doRestart();
  const onTheme = () => {
    colors = readColors();
    render();
  };
  const onHide = () => {
    if (document.hidden && state.status === 'playing') {
      paused = true;
      updateHud();
    }
  };
  const onBlur = () => {
    if (state.status === 'playing') {
      paused = true;
      updateHud();
    }
  };

  window.addEventListener('keydown', onKey);
  canvas.addEventListener('touchstart', onTouchStart, { passive: true });
  canvas.addEventListener('touchmove', onTouchMove, { passive: false });
  canvas.addEventListener('touchend', onTouchEnd, { passive: false });
  canvas.addEventListener('click', onCanvasClick);
  pauseBtn?.addEventListener('click', onPause);
  restartBtn?.addEventListener('click', onRestart);
  document.addEventListener('visibilitychange', onHide);
  window.addEventListener('blur', onBlur);
  document.addEventListener('khc:theme-change', onTheme);
  ro.observe(canvas);

  resize();
  updateHud();
  raf = requestAnimationFrame(frame);

  window.__snakeInstances = (window.__snakeInstances ?? 0) + 1;
  window.__snake = {
    state: () => state,
    status: () => state.status,
    score: () => state.score,
    best: () => best,
    start: () => primary(),
    restart: () => doRestart(),
    turn: (d: Dir) => turn(state, d),
    tick: () => {
      if (state.status === 'ready') beginPlay();
      doTick();
      render();
      updateHud();
    },
    pause: () => {
      paused = true;
      updateHud();
    },
    resume: () => {
      paused = false;
      last = 0;
      updateHud();
    },
    isRunning: () => raf !== 0 && state.status === 'playing' && !paused,
  };

  function destroy() {
    cancelAnimationFrame(raf);
    raf = 0;
    ro.disconnect();
    window.removeEventListener('keydown', onKey);
    canvas.removeEventListener('touchstart', onTouchStart);
    canvas.removeEventListener('touchmove', onTouchMove);
    canvas.removeEventListener('touchend', onTouchEnd);
    canvas.removeEventListener('click', onCanvasClick);
    pauseBtn?.removeEventListener('click', onPause);
    restartBtn?.removeEventListener('click', onRestart);
    document.removeEventListener('visibilitychange', onHide);
    window.removeEventListener('blur', onBlur);
    document.removeEventListener('khc:theme-change', onTheme);
    delete canvas.dataset.snakeReady;
    window.__snakeInstances = Math.max(0, (window.__snakeInstances ?? 1) - 1);
    if (window.__snake && window.__snakeInstances === 0) delete window.__snake;
  }

  return { destroy };
}
