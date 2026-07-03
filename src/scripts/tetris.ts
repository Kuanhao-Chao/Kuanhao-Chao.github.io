/**
 * Tetris DOM controller — Canvas-2D rendering (playfield + ghost + hold + next),
 * a gravity loop with lock delay, keyboard (DAS/ARR) and touch (gestures + an
 * on-screen control bar) input, HUD, and a view-transition-safe lifecycle.
 *
 * All rules live in the pure engine (`src/lib/tetris.ts`); this file only draws,
 * feeds input, and clocks it. `initTetris` is idempotent per canvas and returns a
 * `destroy()` that cancels the loop and removes every listener, so navigating away
 * under the global ClientRouter never leaks a second loop. Colours come from CSS
 * custom properties + a curated 7-hue piece palette, refreshed on `khc:theme-change`.
 */
import {
  COLS,
  ROWS,
  PIECES,
  createGame,
  start as engineStart,
  reset,
  tryMove,
  tryRotate,
  softDrop as engineSoftDrop,
  hardDrop as engineHardDrop,
  hold as engineHold,
  lockPiece,
  ghostY,
  collides,
  gravityMs,
  type GameState,
} from '../lib/tetris';

interface TetrisTestApi {
  state: () => GameState;
  status: () => GameState['status'];
  score: () => number;
  lines: () => number;
  level: () => number;
  best: () => number;
  start: () => void;
  restart: () => void;
  pause: () => void;
  resume: () => void;
  move: (dir: number) => void;
  rotate: (dir: 1 | -1) => void;
  softDrop: () => void;
  hardDrop: () => void;
  hold: () => void;
  setupLineClear: () => void;
  isRunning: () => boolean;
}
declare global {
  interface Window {
    __tetris?: TetrisTestApi;
    __tetrisInstances?: number;
  }
}

const BEST_KEY = 'khc-tetris-best';
const DAS = 130; // ms before horizontal auto-repeat
const ARR = 32; // ms between auto-repeats
const SOFT_MS = 28; // gravity interval while soft-dropping
const LOCK_DELAY = 500; // ms grounded before a piece locks
const MAX_LOCK_RESETS = 15; // move/rotate resets of the lock delay before forcing a lock

// Curated muted, on-brand piece palette (I O T S Z J L), per theme.
const PALETTE_LIGHT = ['#2f7d6a', '#c7a24b', '#8d6a9e', '#6f9a5e', '#c06b5a', '#4d7690', '#c98b3f'];
const PALETTE_DARK = ['#5fb39a', '#e3c07a', '#b491c6', '#93c07f', '#db8f7e', '#7aa6c4', '#e0b46a'];

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
    /* storage disabled */
  }
};
const cssVar = (name: string, fallback: string): string =>
  getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;

const KEY_ACTIONS: Record<string, string> = {
  ArrowLeft: 'left',
  a: 'left',
  ArrowRight: 'right',
  d: 'right',
  ArrowDown: 'soft',
  s: 'soft',
  ArrowUp: 'cw',
  x: 'cw',
  z: 'ccw',
  Control: 'ccw',
  ' ': 'hard',
  Shift: 'hold',
  c: 'hold',
  p: 'pause',
  Escape: 'pause',
  Enter: 'primary',
};

export interface TetrisController {
  destroy: () => void;
}

export function initTetris(root: ParentNode = document): TetrisController | null {
  const canvasEl = root.querySelector<HTMLCanvasElement>('[data-tetris-canvas]');
  if (!canvasEl) return null;
  if (canvasEl.dataset.tetrisReady === 'true') return null;
  canvasEl.dataset.tetrisReady = 'true';
  const boardCtx = canvasEl.getContext('2d');
  if (!boardCtx) return null;
  const canvas: HTMLCanvasElement = canvasEl;
  const g: CanvasRenderingContext2D = boardCtx;

  const holdCanvas = root.querySelector<HTMLCanvasElement>('[data-tetris-hold]');
  const nextCanvas = root.querySelector<HTMLCanvasElement>('[data-tetris-next]');
  const holdCtx = holdCanvas?.getContext('2d') ?? null;
  const nextCtx = nextCanvas?.getContext('2d') ?? null;
  const scoreEl = root.querySelector<HTMLElement>('[data-tetris-score]');
  const linesEl = root.querySelector<HTMLElement>('[data-tetris-lines]');
  const levelEl = root.querySelector<HTMLElement>('[data-tetris-level]');
  const bestEl = root.querySelector<HTMLElement>('[data-tetris-best]');
  const statusEl = root.querySelector<HTMLElement>('[data-tetris-status]');
  const pauseBtn = root.querySelector<HTMLButtonElement>('[data-tetris-pause]');
  const restartBtn = root.querySelector<HTMLButtonElement>('[data-tetris-restart]');
  const controlBtns = Array.from(root.querySelectorAll<HTMLElement>('[data-tetris-btn]'));

  const seedParam = new URLSearchParams(location.search).get('seed');
  const freshSeed = (): number =>
    seedParam != null ? Number(seedParam) >>> 0 : ((Date.now() ^ (Math.random() * 0xffffffff)) >>> 0);

  let state: GameState = createGame(freshSeed());
  let best = readBest();

  let palette = readPalette();
  function readPalette(): string[] {
    return document.documentElement.dataset.theme === 'dark' ? PALETTE_DARK : PALETTE_LIGHT;
  }
  const boardBg = () => cssVar('--color-surface', '#ffffff');
  const gridColor = () => cssVar('--color-rule', '#e5e4df');

  // ---- rendering ---------------------------------------------------------
  let cell = 20;
  const ro = new ResizeObserver(() => resize());

  function fitCanvas(c: HTMLCanvasElement, ctx: CanvasRenderingContext2D, cw: number, ch: number) {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    c.width = Math.round(cw * dpr);
    c.height = Math.round(ch * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function resize() {
    const rect = canvas.getBoundingClientRect();
    cell = Math.max(1, Math.min(rect.width / COLS, rect.height / ROWS));
    fitCanvas(canvas, g, cell * COLS, cell * ROWS);
    if (holdCanvas && holdCtx) fitCanvas(holdCanvas, holdCtx, holdCanvas.getBoundingClientRect().width, holdCanvas.getBoundingClientRect().height);
    if (nextCanvas && nextCtx) fitCanvas(nextCanvas, nextCtx, nextCanvas.getBoundingClientRect().width, nextCanvas.getBoundingClientRect().height);
    render();
  }

  function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
    const rr = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.arcTo(x + w, y, x + w, y + h, rr);
    ctx.arcTo(x + w, y + h, x, y + h, rr);
    ctx.arcTo(x, y + h, x, y, rr);
    ctx.arcTo(x, y, x + w, y, rr);
    ctx.closePath();
  }

  function drawCell(ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number, color: string, alpha = 1, ghost = false) {
    const pad = Math.max(1, size * 0.07);
    ctx.globalAlpha = alpha;
    if (ghost) {
      ctx.strokeStyle = color;
      ctx.lineWidth = Math.max(1, size * 0.08);
      roundRect(ctx, cx + pad, cy + pad, size - 2 * pad, size - 2 * pad, size * 0.18);
      ctx.stroke();
    } else {
      ctx.fillStyle = color;
      roundRect(ctx, cx + pad, cy + pad, size - 2 * pad, size - 2 * pad, size * 0.18);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function render() {
    const W = COLS * cell;
    const H = ROWS * cell;
    g.clearRect(0, 0, W, H);
    g.fillStyle = boardBg();
    g.fillRect(0, 0, W, H);
    // grid
    g.strokeStyle = gridColor();
    g.globalAlpha = 0.45;
    g.lineWidth = 1;
    g.beginPath();
    for (let x = 1; x < COLS; x++) {
      g.moveTo(Math.round(x * cell) + 0.5, 0);
      g.lineTo(Math.round(x * cell) + 0.5, H);
    }
    for (let y = 1; y < ROWS; y++) {
      g.moveTo(0, Math.round(y * cell) + 0.5);
      g.lineTo(W, Math.round(y * cell) + 0.5);
    }
    g.stroke();
    g.globalAlpha = 1;

    // locked cells
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        const v = state.board[y][x];
        if (v !== 0) drawCell(g, x * cell, y * cell, cell, palette[v - 1]);
      }
    }

    if (state.status === 'playing' || state.status === 'paused') {
      // ghost
      const gy = ghostY(state);
      const color = palette[state.current.type];
      for (const [ox, oy] of PIECES[state.current.type].cells[state.current.rotation]) {
        const y = gy + oy;
        if (y >= 0) drawCell(g, (state.current.x + ox) * cell, y * cell, cell, color, 0.9, true);
      }
      // current piece
      for (const [ox, oy] of PIECES[state.current.type].cells[state.current.rotation]) {
        const y = state.current.y + oy;
        if (y >= 0) drawCell(g, (state.current.x + ox) * cell, y * cell, cell, color);
      }
    }

    renderMini(holdCtx, holdCanvas, state.hold);
    renderMini(nextCtx, nextCanvas, state.queue.slice(0, 3));
  }

  function renderMini(ctx: CanvasRenderingContext2D | null, c: HTMLCanvasElement | null, types: number | null | number[]) {
    if (!ctx || !c) return;
    const w = c.getBoundingClientRect().width;
    const h = c.getBoundingClientRect().height;
    ctx.clearRect(0, 0, w, h);
    const list = types === null ? [] : Array.isArray(types) ? types : [types];
    if (!list.length) return;
    const slotH = h / Math.max(1, list.length);
    const mc = Math.min(w / 4.5, slotH / 3.5); // mini cell size
    list.forEach((type, i) => {
      const cells = PIECES[type].cells[0];
      const xs = cells.map((p) => p[0]);
      const ys = cells.map((p) => p[1]);
      const bw = (Math.max(...xs) - Math.min(...xs) + 1) * mc;
      const bh = (Math.max(...ys) - Math.min(...ys) + 1) * mc;
      const ox = (w - bw) / 2 - Math.min(...xs) * mc;
      const oy = i * slotH + (slotH - bh) / 2 - Math.min(...ys) * mc;
      for (const [px, py] of cells) drawCell(ctx, ox + px * mc, oy + py * mc, mc, palette[type]);
    });
  }

  // ---- HUD ---------------------------------------------------------------
  function statusMessage(): string {
    if (state.status === 'ready') return 'Press an arrow, Space, or tap to start';
    if (state.status === 'over') return `Game over — ${state.lines} lines, ${state.score} pts. Tap or Enter to play again`;
    if (paused) return 'Paused — press P or tap to resume';
    return 'Playing — clear lines to level up';
  }
  function updateHud() {
    if (scoreEl) scoreEl.textContent = String(state.score);
    if (linesEl) linesEl.textContent = String(state.lines);
    if (levelEl) levelEl.textContent = String(state.level);
    if (bestEl) bestEl.textContent = String(best);
    if (statusEl) statusEl.textContent = statusMessage();
    if (pauseBtn) {
      pauseBtn.textContent = paused ? 'Resume' : 'Pause';
      pauseBtn.disabled = state.status !== 'playing';
    }
  }
  function syncBest() {
    if (state.score > best) {
      best = state.score;
      writeBest(best);
    }
  }

  // ---- loop --------------------------------------------------------------
  let raf = 0;
  let lastTs = 0;
  let paused = false;
  let gravAcc = 0;
  let lockTimer = 0;
  let lockResets = 0;
  const held = { left: false, right: false, soft: false };
  let dasTimer = 0;
  let arrTimer = 0;

  const grounded = () => collides(state.board, { ...state.current, y: state.current.y + 1 });

  function resetLock() {
    if (grounded() && lockResets < MAX_LOCK_RESETS) {
      lockTimer = 0;
      lockResets++;
    }
  }
  function lockNow() {
    lockPiece(state);
    syncBest();
    gravAcc = 0;
    lockTimer = 0;
    lockResets = 0;
    render();
    updateHud();
  }

  function frame(ts: number) {
    raf = requestAnimationFrame(frame);
    if (state.status !== 'playing' || paused) {
      lastTs = ts;
      return;
    }
    const dt = lastTs ? ts - lastTs : 0;
    lastTs = ts;

    // horizontal DAS / ARR
    const dir = held.left && !held.right ? -1 : held.right && !held.left ? 1 : 0;
    if (dir !== 0) {
      dasTimer += dt;
      if (dasTimer >= DAS) {
        arrTimer += dt;
        while (arrTimer >= ARR) {
          arrTimer -= ARR;
          if (tryMove(state, dir, 0)) resetLock();
        }
      }
    } else {
      dasTimer = 0;
      arrTimer = 0;
    }

    // gravity / lock delay
    if (grounded()) {
      lockTimer += dt;
      if (lockTimer >= LOCK_DELAY || lockResets >= MAX_LOCK_RESETS) lockNow();
    } else {
      lockTimer = 0;
      lockResets = 0;
      const interval = held.soft ? Math.min(SOFT_MS, gravityMs(state.level)) : gravityMs(state.level);
      gravAcc += dt;
      let moved = false;
      let guard = 0;
      while (gravAcc >= interval && !grounded() && guard++ < 30) {
        gravAcc -= interval;
        if (held.soft) engineSoftDrop(state);
        else tryMove(state, 0, 1);
        moved = true;
      }
      if (moved) {
        render();
        updateHud();
      }
    }
  }

  // ---- actions -----------------------------------------------------------
  function beginPlay() {
    engineStart(state);
    lastTs = 0;
    gravAcc = 0;
    lockTimer = 0;
    lockResets = 0;
    paused = false;
    updateHud();
  }
  function togglePause() {
    if (state.status !== 'playing') return;
    paused = !paused;
    if (!paused) lastTs = 0;
    render();
    updateHud();
  }
  function doRestart() {
    reset(state, freshSeed());
    beginPlay();
    render();
  }
  function primary() {
    if (state.status === 'ready') beginPlay();
    else if (state.status === 'over') doRestart();
    else togglePause();
  }
  function act(action: string) {
    if (state.status === 'ready' && action !== 'pause' && action !== 'primary') beginPlay();
    switch (action) {
      case 'left':
        if (tryMove(state, -1, 0)) resetLock();
        break;
      case 'right':
        if (tryMove(state, 1, 0)) resetLock();
        break;
      case 'soft':
        engineSoftDrop(state);
        break;
      case 'cw':
        if (tryRotate(state, 1)) resetLock();
        break;
      case 'ccw':
        if (tryRotate(state, -1)) resetLock();
        break;
      case 'hard':
        engineHardDrop(state);
        syncBest();
        break;
      case 'hold':
        engineHold(state);
        break;
      case 'pause':
        togglePause();
        return;
      case 'primary':
        primary();
        return;
    }
    render();
    updateHud();
  }

  // ---- input -------------------------------------------------------------
  const isInteractive = (t: EventTarget | null) =>
    t instanceof HTMLElement && !!t.closest('a[href], button, input, select, textarea, [contenteditable="true"]');

  function onKeyDown(e: KeyboardEvent) {
    if (isInteractive(e.target)) return;
    const action = KEY_ACTIONS[e.key] ?? KEY_ACTIONS[e.key.toLowerCase?.() ?? e.key];
    if (!action) return;
    e.preventDefault();
    if (e.repeat && (action === 'cw' || action === 'ccw' || action === 'hard' || action === 'hold')) return;
    if (action === 'left') {
      held.left = true;
      dasTimer = 0;
      arrTimer = 0;
    } else if (action === 'right') {
      held.right = true;
      dasTimer = 0;
      arrTimer = 0;
    } else if (action === 'soft') {
      held.soft = true;
    }
    act(action);
  }
  function onKeyUp(e: KeyboardEvent) {
    const action = KEY_ACTIONS[e.key] ?? KEY_ACTIONS[e.key.toLowerCase?.() ?? e.key];
    if (action === 'left') held.left = false;
    else if (action === 'right') held.right = false;
    else if (action === 'soft') held.soft = false;
  }

  // Touch gestures on the board.
  let touch: { id: number; x: number; y: number; t: number; moved: number } | null = null;
  const activeTouch = (e: TouchEvent): Touch | null =>
    touch ? (Array.from(e.changedTouches).find((t) => t.identifier === touch!.id) ?? null) : null;
  function onTouchStart(e: TouchEvent) {
    if (touch) return; // a gesture is already tracked; ignore extra fingers
    const t = e.changedTouches[0];
    touch = { id: t.identifier, x: t.clientX, y: t.clientY, t: Date.now(), moved: 0 };
  }
  function onTouchMove(e: TouchEvent) {
    e.preventDefault();
    const t = activeTouch(e);
    if (!t || !touch) return;
    const dx = t.clientX - touch.x;
    // step-move horizontally as the finger crosses cell widths
    const steps = Math.trunc(dx / Math.max(18, cell));
    if (steps !== 0) {
      if (state.status === 'ready') beginPlay();
      const s = Math.sign(steps);
      for (let i = 0; i < Math.abs(steps); i++) if (tryMove(state, s, 0)) resetLock();
      touch.x += steps * Math.max(18, cell);
      touch.moved += Math.abs(steps);
      render();
      updateHud();
    }
  }
  function onTouchEnd(e: TouchEvent) {
    const t = activeTouch(e);
    if (!t || !touch) return;
    e.preventDefault();
    const dx = t.clientX - touch.x;
    const dy = t.clientY - touch.y;
    const dt = Date.now() - touch.t;
    const moved = touch.moved;
    touch = null;
    if (state.status !== 'playing') {
      primary();
      return;
    }
    if (moved === 0 && Math.abs(dx) < 16 && Math.abs(dy) < 16 && dt < 250) {
      act('cw'); // tap → rotate
    } else if (moved === 0 && Math.abs(dy) > 40 && Math.abs(dy) > Math.abs(dx)) {
      act(dy > 0 ? 'hard' : 'hold'); // vertical flick (no horizontal steps) → hard drop / hold
    }
  }

  // On-screen control bar. Pointer events drive touch/mouse (with hold-to-repeat
  // for left/right/soft); `click` covers keyboard, assistive tech (VoiceOver /
  // TalkBack double-tap), and switch activation — deduped so a touch tap that
  // already fired via pointerdown doesn't run the action twice.
  const btnHandlers: Array<{
    el: HTMLElement;
    down: (e: Event) => void;
    onClick: () => void;
    up?: () => void;
  }> = [];
  let lastPointerAt = 0;
  for (const el of controlBtns) {
    const action = el.dataset.tetrisBtn!;
    const repeatable = action === 'left' || action === 'right' || action === 'soft';
    const down = (e: Event) => {
      e.preventDefault();
      lastPointerAt = Date.now();
      if (action === 'left') {
        held.left = true;
        dasTimer = 0;
      } else if (action === 'right') {
        held.right = true;
        dasTimer = 0;
      } else if (action === 'soft') {
        held.soft = true;
      }
      act(action);
    };
    const onClick = () => {
      if (Date.now() - lastPointerAt < 700) return; // a pointer sequence already handled it
      act(action);
    };
    const up = () => {
      if (action === 'left') held.left = false;
      else if (action === 'right') held.right = false;
      else if (action === 'soft') held.soft = false;
    };
    el.addEventListener('pointerdown', down);
    el.addEventListener('click', onClick);
    if (repeatable) {
      el.addEventListener('pointerup', up);
      el.addEventListener('pointerleave', up);
      el.addEventListener('pointercancel', up);
    }
    btnHandlers.push({ el, down, onClick, up: repeatable ? up : undefined });
  }

  const onPause = () => togglePause();
  const onRestart = () => doRestart();
  const onTheme = () => {
    palette = readPalette();
    render();
  };
  const onHide = () => {
    if (document.hidden && state.status === 'playing') {
      paused = true;
      render();
      updateHud();
    }
  };
  const onBlur = () => {
    held.left = held.right = held.soft = false;
    if (state.status === 'playing') {
      paused = true;
      render();
      updateHud();
    }
  };

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  canvas.addEventListener('touchstart', onTouchStart, { passive: true });
  canvas.addEventListener('touchmove', onTouchMove, { passive: false });
  canvas.addEventListener('touchend', onTouchEnd, { passive: false });
  pauseBtn?.addEventListener('click', onPause);
  restartBtn?.addEventListener('click', onRestart);
  document.addEventListener('visibilitychange', onHide);
  window.addEventListener('blur', onBlur);
  document.addEventListener('khc:theme-change', onTheme);
  ro.observe(canvas);

  resize();
  updateHud();
  raf = requestAnimationFrame(frame);

  window.__tetrisInstances = (window.__tetrisInstances ?? 0) + 1;
  window.__tetris = {
    state: () => state,
    status: () => state.status,
    score: () => state.score,
    lines: () => state.lines,
    level: () => state.level,
    best: () => best,
    start: () => primary(),
    restart: () => doRestart(),
    pause: () => {
      paused = true;
      updateHud();
    },
    resume: () => {
      paused = false;
      lastTs = 0;
      updateHud();
    },
    move: (dir: number) => act(dir < 0 ? 'left' : 'right'),
    rotate: (dir: 1 | -1) => act(dir === 1 ? 'cw' : 'ccw'),
    softDrop: () => act('soft'),
    hardDrop: () => act('hard'),
    hold: () => act('hold'),
    setupLineClear: () => {
      if (state.status === 'ready') beginPlay();
      state.board[ROWS - 1] = new Array(COLS).fill(0).map((_, x) => (x === 4 || x === 5 ? 0 : 1));
      state.current = { type: 1, rotation: 0, x: 4, y: ROWS - 2 }; // O piece over the gap
      render();
      updateHud();
    },
    isRunning: () => raf !== 0 && state.status === 'playing' && !paused,
  };

  function destroy() {
    cancelAnimationFrame(raf);
    raf = 0;
    ro.disconnect();
    window.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('keyup', onKeyUp);
    canvas.removeEventListener('touchstart', onTouchStart);
    canvas.removeEventListener('touchmove', onTouchMove);
    canvas.removeEventListener('touchend', onTouchEnd);
    pauseBtn?.removeEventListener('click', onPause);
    restartBtn?.removeEventListener('click', onRestart);
    document.removeEventListener('visibilitychange', onHide);
    window.removeEventListener('blur', onBlur);
    document.removeEventListener('khc:theme-change', onTheme);
    for (const { el, down, onClick, up } of btnHandlers) {
      el.removeEventListener('pointerdown', down);
      el.removeEventListener('click', onClick);
      if (up) {
        el.removeEventListener('pointerup', up);
        el.removeEventListener('pointerleave', up);
        el.removeEventListener('pointercancel', up);
      }
    }
    delete canvas.dataset.tetrisReady;
    window.__tetrisInstances = Math.max(0, (window.__tetrisInstances ?? 1) - 1);
    if (window.__tetris && window.__tetrisInstances === 0) delete window.__tetris;
  }

  return { destroy };
}
