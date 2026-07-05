/**
 * Jetpack Joyride DOM controller: Canvas-2D rendering, hold-to-thrust input,
 * HUD updates, and the fixed-timestep loop. All game rules live in
 * `src/lib/jetpackJoyride.ts`.
 */
import {
  createGame,
  reset,
  start,
  setThrust,
  step as engineStep,
  zapperEndpoints,
  flyerBounds,
  type GameState,
  type Base,
  type Zapper,
  type Laser,
  type Missile,
  type Coin,
  type PowerUp,
} from '../lib/jetpackJoyride';

interface JetpackTestApi {
  state: () => GameState;
  status: () => GameState['status'];
  bases: () => number;
  coins: () => number;
  best: () => number;
  start: () => void;
  restart: () => void;
  pause: () => void;
  resume: () => void;
  setThrust: (on: boolean) => void;
  tick: (frames?: number) => void;
  spawnHazard: (kind?: 'zapper' | 'laser' | 'missile', y?: number) => void;
  spawnCoin: (base?: Base, y?: number) => void;
  spawnShield: (y?: number) => void;
  endRun: () => void;
  isRunning: () => boolean;
}

declare global {
  interface Window {
    __jetpackJoyride?: JetpackTestApi;
    __jetpackJoyrideInstances?: number;
  }
}

export interface JetpackJoyrideController {
  destroy: () => void;
}

const BEST_KEY = 'khc-jetpack-joyride-best';
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

// Nucleotide coin hues + danger (terracotta/red) hazard hues, per theme.
const BASE_HUES_LIGHT: Record<Base, string> = {
  A: '#2f7d6a',
  C: '#c7a24b',
  G: '#8d6a9e',
  T: '#c06b5a',
};
const BASE_HUES_DARK: Record<Base, string> = {
  A: '#5fb39a',
  C: '#e3c07a',
  G: '#b491c6',
  T: '#db8f7e',
};
const HAZARD_LIGHT = { bolt: '#d1524a', node: '#9c3a31', beam: '#d1524a', missile: '#c05a45' };
const HAZARD_DARK = { bolt: '#ef938a', node: '#f0aaa0', beam: '#ef938a', missile: '#e0a08a' };
const FLAME_LIGHT = '#e79a3a';
const FLAME_DARK = '#f0c069';

const isDark = (): boolean => document.documentElement.dataset.theme === 'dark';

export function initJetpackJoyride(root: ParentNode = document): JetpackJoyrideController | null {
  const canvasEl = root.querySelector<HTMLCanvasElement>('[data-jetpack-canvas]');
  if (!canvasEl) return null;
  if (canvasEl.dataset.jetpackReady === 'true') return null;
  canvasEl.dataset.jetpackReady = 'true';

  const maybeCtx = canvasEl.getContext('2d');
  if (!maybeCtx) {
    delete canvasEl.dataset.jetpackReady;
    return null;
  }
  const canvas: HTMLCanvasElement = canvasEl;
  const ctx: CanvasRenderingContext2D = maybeCtx;

  const basesEl = root.querySelector<HTMLElement>('[data-jetpack-bases]');
  const coinsEl = root.querySelector<HTMLElement>('[data-jetpack-coins]');
  const bestEl = root.querySelector<HTMLElement>('[data-jetpack-best]');
  const statusEl = root.querySelector<HTMLElement>('[data-jetpack-status]');
  const pauseBtn = root.querySelector<HTMLButtonElement>('[data-jetpack-pause]');
  const restartBtn = root.querySelector<HTMLButtonElement>('[data-jetpack-restart]');
  const thrustBtn = root.querySelector<HTMLButtonElement>('[data-jetpack-thrust]');

  const seedParam = new URLSearchParams(location.search).get('seed');
  const freshSeed = (): number =>
    seedParam != null ? Number(seedParam) >>> 0 : (Date.now() ^ (Math.random() * 0xffffffff)) >>> 0;

  const state = createGame(freshSeed());
  let best = readBest();
  let colors = readColors();
  let baseHues = isDark() ? BASE_HUES_DARK : BASE_HUES_LIGHT;
  let hazard = isDark() ? HAZARD_DARK : HAZARD_LIGHT;
  let flameColor = isDark() ? FLAME_DARK : FLAME_LIGHT;

  const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  let reduced = motionQuery.matches;

  function readColors() {
    return {
      board: cssVar('--color-surface', '#ffffff'),
      bg: cssVar('--color-bg', '#fafaf8'),
      ink: cssVar('--color-ink', '#141414'),
      muted: cssVar('--color-muted', '#6b6b6b'),
      rule: cssVar('--color-rule', '#e5e4df'),
      accent: cssVar('--color-accent', '#2e6e5e'),
      accentDark: cssVar('--color-accent-dark', '#245546'),
      onAccent: cssVar('--color-on-accent', '#ffffff'),
    };
  }

  function refreshTheme() {
    colors = readColors();
    baseHues = isDark() ? BASE_HUES_DARK : BASE_HUES_LIGHT;
    hazard = isDark() ? HAZARD_DARK : HAZARD_LIGHT;
    flameColor = isDark() ? FLAME_DARK : FLAME_LIGHT;
  }

  let raf = 0;
  let last = 0;
  let acc = 0;
  let paused = false;
  let pulseTimer = 0;
  const held = { key: false, pointer: false, button: false };
  // Transient thrust from a keyboard/AT click on the Thrust button. Tracked
  // separately from `held.button` (the pointer hold) so restart() can clear it
  // without ever stranding a real hold, and vice versa.
  let buttonPulse = false;

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

  // --- Rendering ------------------------------------------------------------

  function render() {
    ctx.clearRect(0, 0, state.width, state.height);
    ctx.fillStyle = colors.board;
    ctx.fillRect(0, 0, state.width, state.height);
    drawBackground();
    for (const coin of state.coins) drawCoin(coin);
    for (const power of state.powerUps) drawShieldPickup(power);
    for (const z of state.zappers) drawZapper(z);
    for (const l of state.lasers) drawLaser(l);
    for (const m of state.missiles) drawMissile(m);
    drawFlyer();
  }

  function drawBackground() {
    const { top, bottom } = flyerBounds(state);
    ctx.save();
    // Ceiling and floor rails.
    ctx.strokeStyle = colors.rule;
    ctx.lineWidth = 2;
    ctx.globalAlpha = 0.9;
    ctx.beginPath();
    ctx.moveTo(0, state.ceilingY + 0.5);
    ctx.lineTo(state.width, state.ceilingY + 0.5);
    ctx.moveTo(0, state.groundY + 0.5);
    ctx.lineTo(state.width, state.groundY + 0.5);
    ctx.stroke();

    // Scrolling nucleotide ticks along the floor rail (the "strand").
    const spacing = 78;
    const offset = -((state.distance * 0.9) % spacing);
    ctx.font = `600 13px ${cssVar('--font-display', 'system-ui')}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    const bases = ['A', 'C', 'G', 'T'];
    for (let x = offset; x < state.width + spacing; x += spacing) {
      const label = bases[Math.abs(Math.floor((x + state.distance) / spacing)) % 4];
      ctx.globalAlpha = 0.5;
      ctx.strokeStyle = colors.rule;
      ctx.beginPath();
      ctx.moveTo(x, state.groundY + 6);
      ctx.lineTo(x, state.groundY + 18);
      ctx.stroke();
      ctx.globalAlpha = 0.55;
      ctx.fillStyle = colors.muted;
      ctx.fillText(label, x, state.groundY + 24);
    }

    // A faint parallax helix strand across the play area.
    ctx.globalAlpha = 0.12;
    ctx.strokeStyle = colors.accent;
    ctx.lineWidth = 2;
    const wave = (state.distance * 0.05) % 60;
    const midY = (top + bottom) / 2;
    for (const phase of [0, Math.PI]) {
      ctx.beginPath();
      for (let x = -60; x <= state.width + 60; x += 14) {
        const y = midY + Math.sin((x + wave) / 46 + phase) * (bottom - top) * 0.32;
        if (x === -60) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawFlyer() {
    const { x, y } = state.flyer;
    const blink = state.invulnMs > 0 && (!reduced ? Math.floor(state.ticks / 4) % 2 === 0 : false);
    ctx.save();
    if (blink) ctx.globalAlpha = 0.45;

    // Jetpack flame while thrusting.
    if (state.flyer.thrusting && state.status === 'playing') {
      const flick = reduced ? 12 : 9 + (state.ticks % 3) * 4;
      ctx.fillStyle = flameColor;
      ctx.globalAlpha = blink ? 0.4 : 0.9;
      ctx.beginPath();
      ctx.moveTo(x - 15, y - 7);
      ctx.lineTo(x - 15, y + 7);
      ctx.lineTo(x - 15 - flick, y);
      ctx.closePath();
      ctx.fill();
      ctx.globalAlpha = blink ? 0.45 : 1;
    }

    // Enzyme body.
    ctx.fillStyle = colors.accent;
    ctx.strokeStyle = colors.accentDark;
    ctx.lineWidth = 2;
    roundRect(x - 16, y - 15, 33, 30, 11);
    ctx.fill();
    ctx.stroke();
    // Active-site notch.
    ctx.fillStyle = colors.accentDark;
    ctx.beginPath();
    ctx.arc(x + 15, y, 5.5, -Math.PI / 2, Math.PI / 2);
    ctx.fill();
    // Eye.
    ctx.fillStyle = colors.onAccent;
    ctx.beginPath();
    ctx.arc(x + 6, y - 4, 2.6, 0, Math.PI * 2);
    ctx.fill();

    // Shield bubble.
    if (state.flyer.shielded) {
      ctx.strokeStyle = colors.accent;
      ctx.globalAlpha = 0.7;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(x, y, 24, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawCoin(coin: Coin) {
    ctx.save();
    ctx.fillStyle = baseHues[coin.base];
    ctx.strokeStyle = colors.board;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(coin.x, coin.y, coin.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = colors.onAccent;
    ctx.font = `700 14px ${cssVar('--font-display', 'system-ui')}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(coin.base, coin.x, coin.y + 0.5);
    ctx.restore();
  }

  function drawShieldPickup(power: PowerUp) {
    ctx.save();
    ctx.strokeStyle = colors.accent;
    ctx.fillStyle = colors.board;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(power.x, power.y, power.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    // Shield glyph.
    ctx.fillStyle = colors.accent;
    ctx.beginPath();
    ctx.moveTo(power.x, power.y - 8);
    ctx.lineTo(power.x + 7, power.y - 4);
    ctx.lineTo(power.x + 7, power.y + 3);
    ctx.quadraticCurveTo(power.x, power.y + 9, power.x - 7, power.y + 3);
    ctx.lineTo(power.x - 7, power.y - 4);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  function drawZapper(z: Zapper) {
    const { x1, y1, x2, y2 } = zapperEndpoints(z);
    ctx.save();
    // Bolt: a slightly jagged line between the two nodes.
    ctx.strokeStyle = hazard.bolt;
    ctx.lineWidth = z.thickness;
    ctx.lineCap = 'round';
    ctx.globalAlpha = 0.95;
    const nx = -(y2 - y1);
    const ny = x2 - x1;
    const nlen = Math.hypot(nx, ny) || 1;
    const jitter = reduced ? 0 : 5;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    for (let s = 0.25; s < 1; s += 0.25) {
      const zz = ((Math.floor(z.cx + s * 8) % 2) * 2 - 1) * jitter;
      ctx.lineTo(x1 + (x2 - x1) * s + (nx / nlen) * zz, y1 + (y2 - y1) * s + (ny / nlen) * zz);
    }
    ctx.lineTo(x2, y2);
    ctx.stroke();
    // Emitter nodes.
    ctx.globalAlpha = 1;
    ctx.fillStyle = hazard.node;
    for (const [nxp, nyp] of [
      [x1, y1],
      [x2, y2],
    ]) {
      ctx.beginPath();
      ctx.arc(nxp, nyp, z.thickness * 0.7, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawLaser(l: Laser) {
    ctx.save();
    if (l.phase === 'warn') {
      ctx.strokeStyle = hazard.beam;
      ctx.globalAlpha = reduced ? 0.5 : 0.35 + (Math.floor(state.ticks / 4) % 2) * 0.35;
      ctx.lineWidth = 2;
      ctx.setLineDash([10, 8]);
      ctx.beginPath();
      ctx.moveTo(0, l.y);
      ctx.lineTo(state.width, l.y);
      ctx.stroke();
    } else if (l.phase === 'active') {
      ctx.fillStyle = hazard.beam;
      ctx.globalAlpha = 0.85;
      ctx.fillRect(0, l.y - l.thickness / 2, state.width, l.thickness);
      ctx.globalAlpha = 0.35;
      ctx.fillRect(0, l.y - l.thickness / 2 - 3, state.width, l.thickness + 6);
    }
    // Emitter nubs on both walls.
    ctx.globalAlpha = 1;
    ctx.fillStyle = hazard.node;
    ctx.fillRect(0, l.y - 7, 8, 14);
    ctx.fillRect(state.width - 8, l.y - 7, 8, 14);
    ctx.restore();
  }

  function drawMissile(m: Missile) {
    ctx.save();
    if (m.phase === 'warn') {
      // Blinking warning arrow pinned at the right edge.
      const on = reduced ? true : Math.floor(state.ticks / 5) % 2 === 0;
      ctx.globalAlpha = on ? 0.95 : 0.4;
      ctx.fillStyle = hazard.missile;
      ctx.beginPath();
      ctx.moveTo(state.width - 6, m.y);
      ctx.lineTo(state.width - 22, m.y - 10);
      ctx.lineTo(state.width - 22, m.y + 10);
      ctx.closePath();
      ctx.fill();
    } else {
      // Missile body + exhaust tail.
      ctx.fillStyle = hazard.missile;
      roundRect(m.x - 12, m.y - 6, 20, 12, 5);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(m.x + 8, m.y - 6);
      ctx.lineTo(m.x + 18, m.y);
      ctx.lineTo(m.x + 8, m.y + 6);
      ctx.closePath();
      ctx.fill();
      ctx.globalAlpha = reduced ? 0.5 : 0.4 + (state.ticks % 2) * 0.25;
      ctx.fillStyle = flameColor;
      ctx.beginPath();
      ctx.moveTo(m.x - 12, m.y - 4);
      ctx.lineTo(m.x - 12, m.y + 4);
      ctx.lineTo(m.x - 22, m.y);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }

  // --- HUD ------------------------------------------------------------------

  function statusMessage(): string {
    if (state.status === 'ready') return 'Hold Space, click, or tap to fly';
    if (state.status === 'over')
      return `Run over — ${state.bases} bases, ${state.coinCount} coins. Tap or Space to fly again`;
    if (paused) return 'Paused — press P or the button to resume';
    if (state.flyer.shielded) return 'Flying — shield active';
    return 'Flying — dodge the mutagens, grab the bases';
  }

  let lastStatus = '';
  let lastPauseLabel = '';
  function updateHud() {
    if (basesEl) basesEl.textContent = String(state.bases);
    if (coinsEl) coinsEl.textContent = String(state.coinCount);
    if (bestEl) bestEl.textContent = String(best);
    // Only mutate the aria-live region on a real change, or it re-announces
    // ~60x/s and floods screen readers.
    const msg = statusMessage();
    if (statusEl && msg !== lastStatus) {
      statusEl.textContent = msg;
      lastStatus = msg;
    }
    if (pauseBtn) {
      pauseBtn.disabled = state.status !== 'playing';
      pauseBtn.dataset.active = paused ? 'true' : 'false';
      const label = paused ? 'Resume' : 'Pause';
      if (label !== lastPauseLabel) {
        pauseBtn.setAttribute('aria-label', label);
        const text = pauseBtn.querySelector('[data-button-label]');
        if (text) text.textContent = label;
        lastPauseLabel = label;
      }
    }
  }

  function tickOnce() {
    engineStep(state, STEP_MS);
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

  // --- Control flow ---------------------------------------------------------

  function syncThrust() {
    setThrust(state, held.key || held.pointer || held.button || buttonPulse);
  }

  function restart(startNow = true) {
    window.clearTimeout(pulseTimer);
    pulseTimer = 0;
    buttonPulse = false;
    reset(state, freshSeed());
    paused = false;
    last = 0;
    acc = 0;
    if (startNow) start(state);
    syncThrust();
    render();
    updateHud();
  }

  function engageThrust(source: 'key' | 'pointer' | 'button') {
    held[source] = true;
    if (state.status === 'over') {
      restart(true);
      return;
    }
    if (state.status === 'ready') start(state);
    if (paused) {
      paused = false;
      last = 0;
    }
    syncThrust();
    render();
    updateHud();
  }

  function disengageThrust(source: 'key' | 'pointer' | 'button') {
    held[source] = false;
    syncThrust();
  }

  function togglePause() {
    if (state.status !== 'playing') return;
    paused = !paused;
    if (!paused) last = 0;
    updateHud();
  }

  // --- Keyboard -------------------------------------------------------------

  function onKeyDown(event: KeyboardEvent) {
    if (isInteractive(event.target)) return;
    const key = event.key.toLowerCase();
    if (event.key === ' ' || event.key === 'ArrowUp' || key === 'w') {
      event.preventDefault();
      if (!event.repeat) engageThrust('key');
    } else if (event.key === 'Enter') {
      event.preventDefault();
      if (state.status === 'playing') togglePause();
      else restart(true);
    } else if (key === 'p' || event.key === 'Escape') {
      event.preventDefault();
      togglePause();
    }
  }

  function onKeyUp(event: KeyboardEvent) {
    const key = event.key.toLowerCase();
    if (event.key === ' ' || event.key === 'ArrowUp' || key === 'w') {
      // Always release the key thrust, even if focus moved to a control between
      // keydown and keyup — otherwise held.key strands and thrust sticks on.
      if (held.key) disengageThrust('key');
      if (!isInteractive(event.target)) event.preventDefault();
    }
  }

  // --- Pointer on the board (hold anywhere to fly) --------------------------

  let activePointer: number | null = null;
  function onPointerDown(event: PointerEvent) {
    if (activePointer !== null) return;
    activePointer = event.pointerId;
    try {
      canvas.setPointerCapture(event.pointerId);
    } catch {
      /* capture is best-effort */
    }
    engageThrust('pointer');
  }
  function onPointerUp(event: PointerEvent) {
    if (activePointer !== event.pointerId) return;
    activePointer = null;
    disengageThrust('pointer');
  }

  // --- On-screen Thrust button (hold), with keyboard/AT click fallback ------

  let lastPointerAt = 0;
  function onThrustDown(event: Event) {
    event.preventDefault();
    lastPointerAt = Date.now();
    engageThrust('button');
  }
  function onThrustUp() {
    // Stamp on release too: the synthetic click fires at pointer-up, so a hold
    // longer than 700ms must still suppress the click fallback (no extra pulse).
    lastPointerAt = Date.now();
    disengageThrust('button');
  }
  function onThrustClick() {
    if (Date.now() - lastPointerAt < 700) return; // a pointer sequence already handled it
    // Keyboard / assistive-tech activation: start/restart/resume as needed, then a
    // short transient thrust pulse (buttonPulse, not the pointer-hold flag).
    if (state.status === 'over') {
      restart(true);
    } else if (state.status === 'ready') {
      start(state);
    }
    if (paused) {
      paused = false;
      last = 0;
    }
    buttonPulse = true;
    syncThrust();
    render();
    updateHud();
    window.clearTimeout(pulseTimer);
    pulseTimer = window.setTimeout(() => {
      buttonPulse = false;
      pulseTimer = 0;
      syncThrust();
    }, 260);
  }

  function onRestart() {
    restart(true);
  }
  function onTheme() {
    refreshTheme();
    render();
  }
  function onMotion() {
    reduced = motionQuery.matches;
  }
  function onHide() {
    if (document.hidden && state.status === 'playing') {
      paused = true;
      updateHud();
    }
  }
  function onBlur() {
    held.key = false;
    held.pointer = false;
    held.button = false;
    buttonPulse = false;
    window.clearTimeout(pulseTimer);
    pulseTimer = 0;
    activePointer = null;
    syncThrust();
    if (state.status === 'playing') {
      paused = true;
      updateHud();
    }
  }

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointerup', onPointerUp);
  canvas.addEventListener('pointercancel', onPointerUp);
  canvas.addEventListener('pointerleave', onPointerUp);
  thrustBtn?.addEventListener('pointerdown', onThrustDown);
  thrustBtn?.addEventListener('pointerup', onThrustUp);
  thrustBtn?.addEventListener('pointercancel', onThrustUp);
  thrustBtn?.addEventListener('pointerleave', onThrustUp);
  thrustBtn?.addEventListener('click', onThrustClick);
  pauseBtn?.addEventListener('click', togglePause);
  restartBtn?.addEventListener('click', onRestart);
  document.addEventListener('visibilitychange', onHide);
  window.addEventListener('blur', onBlur);
  document.addEventListener('khc:theme-change', onTheme);
  motionQuery.addEventListener('change', onMotion);
  ro.observe(canvas);

  resize();
  updateHud();
  raf = requestAnimationFrame(frame);

  // --- Test / audit API -----------------------------------------------------

  const placeZapper = (y: number): Zapper => ({
    id: state.nextId++,
    kind: 'zapper',
    cx: state.flyer.x,
    cy: y,
    halfLen: 60,
    angle: Math.PI / 2,
    spin: 0,
    thickness: 12,
  });

  window.__jetpackJoyrideInstances = (window.__jetpackJoyrideInstances ?? 0) + 1;
  window.__jetpackJoyride = {
    state: () => state,
    status: () => state.status,
    bases: () => state.bases,
    coins: () => state.coinCount,
    best: () => best,
    start: () => start(state),
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
    setThrust: (on: boolean) => {
      held.key = on;
      syncThrust();
    },
    tick: (frames = 1) => {
      if (state.status === 'ready') start(state);
      for (let i = 0; i < frames && state.status === 'playing'; i++) tickOnce();
      render();
      updateHud();
    },
    spawnHazard: (kind = 'zapper', y = state.flyer.y) => {
      if (kind === 'laser') {
        state.lasers.push({
          id: state.nextId++,
          kind: 'laser',
          y,
          thickness: 26,
          phase: 'active',
          timer: 620,
        });
      } else if (kind === 'missile') {
        state.missiles.push({
          id: state.nextId++,
          kind: 'missile',
          x: state.flyer.x,
          y,
          vx: 0,
          vy: 0,
          radius: 14,
          phase: 'active',
          timer: 0,
        });
      } else {
        state.zappers.push(placeZapper(y));
      }
    },
    spawnCoin: (base = 'A', y = state.flyer.y) => {
      state.coins.push({ id: state.nextId++, x: state.flyer.x, y, radius: 12, base });
    },
    spawnShield: (y = state.flyer.y) => {
      state.powerUps.push({ id: state.nextId++, x: state.flyer.x, y, radius: 16, kind: 'shield' });
    },
    endRun: () => {
      if (state.status === 'ready') start(state);
      state.flyer.shielded = false;
      state.invulnMs = 0;
      state.zappers.push(placeZapper(state.flyer.y));
      tickOnce();
      render();
      updateHud();
    },
    isRunning: () => raf !== 0 && state.status === 'playing' && !paused,
  };

  function destroy() {
    cancelAnimationFrame(raf);
    raf = 0;
    window.clearTimeout(pulseTimer);
    ro.disconnect();
    window.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('keyup', onKeyUp);
    canvas.removeEventListener('pointerdown', onPointerDown);
    canvas.removeEventListener('pointerup', onPointerUp);
    canvas.removeEventListener('pointercancel', onPointerUp);
    canvas.removeEventListener('pointerleave', onPointerUp);
    thrustBtn?.removeEventListener('pointerdown', onThrustDown);
    thrustBtn?.removeEventListener('pointerup', onThrustUp);
    thrustBtn?.removeEventListener('pointercancel', onThrustUp);
    thrustBtn?.removeEventListener('pointerleave', onThrustUp);
    thrustBtn?.removeEventListener('click', onThrustClick);
    pauseBtn?.removeEventListener('click', togglePause);
    restartBtn?.removeEventListener('click', onRestart);
    document.removeEventListener('visibilitychange', onHide);
    window.removeEventListener('blur', onBlur);
    document.removeEventListener('khc:theme-change', onTheme);
    motionQuery.removeEventListener('change', onMotion);
    delete canvas.dataset.jetpackReady;
    window.__jetpackJoyrideInstances = Math.max(0, (window.__jetpackJoyrideInstances ?? 1) - 1);
    if (window.__jetpackJoyride && window.__jetpackJoyrideInstances === 0)
      delete window.__jetpackJoyride;
  }

  return { destroy };
}
