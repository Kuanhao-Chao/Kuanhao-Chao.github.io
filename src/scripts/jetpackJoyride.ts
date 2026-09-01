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
import { isDarkTheme } from '../lib/theme';

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

const isDark = (): boolean => isDarkTheme();

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

    // 1. Dual-Stage Jetpack Plasma Flame Exhaust
    if (state.flyer.thrusting && state.status === 'playing') {
      const flick = reduced ? 14 : 11 + (state.ticks % 3) * 5;

      // Outer Orange Fire Plume
      ctx.fillStyle = flameColor;
      ctx.globalAlpha = blink ? 0.4 : 0.95;
      ctx.beginPath();
      ctx.moveTo(x - 16, y - 8);
      ctx.lineTo(x - 16, y + 8);
      ctx.lineTo(x - 16 - flick, y);
      ctx.closePath();
      ctx.fill();

      // White-Hot Inner Core Flame
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.moveTo(x - 16, y - 4);
      ctx.lineTo(x - 16, y + 4);
      ctx.lineTo(x - 16 - flick * 0.55, y);
      ctx.closePath();
      ctx.fill();

      // Exhaust Spark Particles
      ctx.fillStyle = '#fef08a';
      ctx.fillRect(x - 18 - flick * 0.8, y - 5, 2.5, 2.5);
      ctx.fillStyle = '#f43f5e';
      ctx.fillRect(x - 16 - flick * 0.9, y + 4, 2, 2);

      ctx.globalAlpha = blink ? 0.45 : 1;
    }

    // 2. Jetpack Thruster Assembly Backpack
    ctx.fillStyle = '#0284c7';
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 1.4;
    roundRect(x - 18, y - 11, 8, 22, 3);
    ctx.fill();
    ctx.stroke();
    // Thruster Nozzle
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(x - 18, y + 9, 6, 4);

    // 3. Enzyme Aviator Body Complex
    ctx.fillStyle = colors.accent;
    ctx.strokeStyle = colors.accentDark;
    ctx.lineWidth = 2;
    roundRect(x - 14, y - 15, 31, 30, 11);
    ctx.fill();
    ctx.stroke();

    // Catalytic Active-Site Notch
    ctx.fillStyle = colors.accentDark;
    ctx.beginPath();
    ctx.arc(x + 16, y, 5.5, -Math.PI / 2, Math.PI / 2);
    ctx.fill();

    // Aviator Pilot Goggles
    ctx.fillStyle = '#38bdf8';
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.2;
    roundRect(x + 2, y - 7, 10, 8, 3);
    ctx.fill();
    ctx.stroke();
    // Goggle reflection gleam
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(x + 8, y - 4, 1.2, 0, Math.PI * 2);
    ctx.fill();

    // 4. Hexagonal Holographic Shield Bubble
    if (state.flyer.shielded) {
      ctx.strokeStyle = colors.accent;
      ctx.globalAlpha = 0.85;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(x, y, 25, 0, Math.PI * 2);
      ctx.stroke();

      // Inner Rotating Hex Ring
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 1.2;
      ctx.setLineDash([6, 4]);
      ctx.beginPath();
      ctx.arc(x, y, 22, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    ctx.restore();
  }

  function drawCoin(coin: Coin) {
    ctx.save();
    const radius = coin.radius;
    const hue = baseHues[coin.base];

    // 1. 3D Outer Coin Bevel
    ctx.fillStyle = hue;
    ctx.strokeStyle = colors.board;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(coin.x, coin.y, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // 2. Inner Ring Inset
    ctx.strokeStyle = '#ffffff';
    ctx.globalAlpha = 0.6;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(coin.x, coin.y, radius * 0.72, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;

    // 3. Nucleotide Letter Center
    ctx.fillStyle = colors.onAccent;
    ctx.font = `bold 13px ${cssVar('--font-mono', 'monospace')}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(coin.base, coin.x, coin.y + 0.5);
    ctx.restore();
  }

  function drawShieldPickup(power: PowerUp) {
    ctx.save();
    // Outer Energy Pulsing Aura
    ctx.strokeStyle = colors.accent;
    ctx.fillStyle = colors.board;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(power.x, power.y, power.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Inner Radiant Shield Crest
    ctx.fillStyle = colors.accent;
    ctx.beginPath();
    ctx.moveTo(power.x, power.y - 8);
    ctx.lineTo(power.x + 7, power.y - 4);
    ctx.lineTo(power.x + 7, power.y + 3);
    ctx.quadraticCurveTo(power.x, power.y + 9, power.x - 7, power.y + 3);
    ctx.lineTo(power.x - 7, power.y - 4);
    ctx.closePath();
    ctx.fill();

    // Shield Emblem Core Sparkle
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(power.x, power.y - 1, 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawZapper(z: Zapper) {
    const { x1, y1, x2, y2 } = zapperEndpoints(z);
    ctx.save();

    // 1. High-Voltage Plasma Lightning Bolt
    ctx.strokeStyle = hazard.bolt;
    ctx.lineWidth = z.thickness + 0.5;
    ctx.lineCap = 'round';
    ctx.globalAlpha = 0.95;
    const nx = -(y2 - y1);
    const ny = x2 - x1;
    const nlen = Math.hypot(nx, ny) || 1;
    const jitter = reduced ? 0 : 6;

    ctx.beginPath();
    ctx.moveTo(x1, y1);
    for (let s = 0.2; s < 1; s += 0.2) {
      const zz = ((Math.floor(z.cx + s * 9) % 2) * 2 - 1) * jitter;
      ctx.lineTo(x1 + (x2 - x1) * s + (nx / nlen) * zz, y1 + (y2 - y1) * s + (ny / nlen) * zz);
    }
    ctx.lineTo(x2, y2);
    ctx.stroke();

    // White-Hot Plasma Core Bolt
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    for (let s = 0.2; s < 1; s += 0.2) {
      const zz = ((Math.floor(z.cx + s * 9) % 2) * 2 - 1) * jitter;
      ctx.lineTo(x1 + (x2 - x1) * s + (nx / nlen) * zz, y1 + (y2 - y1) * s + (ny / nlen) * zz);
    }
    ctx.lineTo(x2, y2);
    ctx.stroke();

    // 2. Metallic Insulator Emitter Nodes
    ctx.globalAlpha = 1;
    ctx.fillStyle = hazard.node;
    for (const [nxp, nyp] of [
      [x1, y1],
      [x2, y2],
    ]) {
      ctx.beginPath();
      ctx.arc(nxp, nyp, z.thickness * 0.75, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(nxp, nyp, z.thickness * 0.35, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = hazard.node;
    }
    ctx.restore();
  }

  function drawLaser(l: Laser) {
    ctx.save();
    if (l.phase === 'warn') {
      // Warning Stage: Red-Dashed Pre-Ionization Target Line
      ctx.strokeStyle = hazard.beam;
      ctx.globalAlpha = reduced ? 0.5 : 0.35 + (Math.floor(state.ticks / 4) % 2) * 0.35;
      ctx.lineWidth = 2;
      ctx.setLineDash([10, 8]);
      ctx.beginPath();
      ctx.moveTo(0, l.y);
      ctx.lineTo(state.width, l.y);
      ctx.stroke();
    } else if (l.phase === 'active') {
      // Active Stage: High-Intensity Synchrotron Laser Core & Bloom
      // Outer Heat Bloom
      ctx.fillStyle = hazard.beam;
      ctx.globalAlpha = 0.35;
      ctx.fillRect(0, l.y - l.thickness / 2 - 4, state.width, l.thickness + 8);
      // Main Plasma Beam
      ctx.globalAlpha = 0.9;
      ctx.fillRect(0, l.y - l.thickness / 2, state.width, l.thickness);
      // White Core Beam
      ctx.fillStyle = '#ffffff';
      ctx.globalAlpha = 0.8;
      ctx.fillRect(0, l.y - 1.5, state.width, 3);
    }

    // Emitter Housing Nubs on Both Walls
    ctx.globalAlpha = 1;
    ctx.fillStyle = hazard.node;
    roundRect(0, l.y - 8, 9, 16, 2);
    ctx.fill();
    roundRect(state.width - 9, l.y - 8, 9, 16, 2);
    ctx.fill();
    ctx.restore();
  }

  function drawMissile(m: Missile) {
    ctx.save();
    if (m.phase === 'warn') {
      // Blinking Warning Reticle on Right Screen Edge
      const on = reduced ? true : Math.floor(state.ticks / 5) % 2 === 0;
      ctx.globalAlpha = on ? 0.95 : 0.4;
      ctx.fillStyle = hazard.missile;
      ctx.beginPath();
      ctx.moveTo(state.width - 6, m.y);
      ctx.lineTo(state.width - 22, m.y - 10);
      ctx.lineTo(state.width - 22, m.y + 10);
      ctx.closePath();
      ctx.fill();

      // Warning exclamation mark
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 11px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('!', state.width - 15, m.y);
    } else {
      // Missile Body, Stabilizer Fins & Rocket Exhaust Tail
      // Rocket Body
      ctx.fillStyle = hazard.missile;
      roundRect(m.x - 14, m.y - 6, 22, 12, 5);
      ctx.fill();

      // Aerodynamic Warhead Nosecone
      ctx.fillStyle = '#ef4444';
      ctx.beginPath();
      ctx.moveTo(m.x + 8, m.y - 6);
      ctx.lineTo(m.x + 19, m.y);
      ctx.lineTo(m.x + 8, m.y + 6);
      ctx.closePath();
      ctx.fill();

      // Rear Stabilizer Fins
      ctx.fillStyle = '#475569';
      ctx.fillRect(m.x - 13, m.y - 9, 4, 18);

      // Multi-stage Thruster Flame
      ctx.globalAlpha = reduced ? 0.6 : 0.5 + (state.ticks % 2) * 0.35;
      ctx.fillStyle = flameColor;
      ctx.beginPath();
      ctx.moveTo(m.x - 14, m.y - 4);
      ctx.lineTo(m.x - 14, m.y + 4);
      ctx.lineTo(m.x - 26, m.y);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.moveTo(m.x - 14, m.y - 2);
      ctx.lineTo(m.x - 14, m.y + 2);
      ctx.lineTo(m.x - 20, m.y);
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
