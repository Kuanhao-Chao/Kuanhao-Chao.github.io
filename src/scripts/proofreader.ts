/**
 * Browser controller for Proofreader: a Canvas-2D raycasting first-person shooter.
 *
 * Owns everything the pure engine (`src/lib/proofreader.ts`) does not: the DDA wall
 * renderer, billboard sprites with depth occlusion, the HUD overlays, the fixed-timestep
 * loop, audio, storage, theming, and the desktop (keyboard + pointer-lock mouse-look)
 * and mobile (dual-zone touch + Fire button) input schemes. The engine is deterministic
 * and DOM-free; this file is where pixels, pointers, and wall-clock time live.
 */
import {
  TUNING,
  castRay,
  createGame,
  fire as engineFire,
  normalizeAngle,
  pause as enginePause,
  reset,
  setAimAssist,
  start as engineStart,
  step as engineStep,
  turnBy,
  type Enemy,
  type EnemyKind,
  type GameState,
  type Pickup,
  type StepInput,
} from '../lib/proofreader';

interface ProofreaderTestApi {
  state: () => GameState;
  start: () => void;
  restart: () => void;
  tick: (frames?: number) => void;
  setInput: (partial: Partial<StepInput>) => void;
  turn: (rad: number) => void;
  fire: () => boolean;
  pause: () => void;
  resume: () => void;
  endRun: () => void;
  share: () => Promise<void>;
}

declare global {
  interface Window {
    __proofreader?: ProofreaderTestApi;
    __proofreaderInstances?: number;
  }
}

export interface ProofreaderController {
  destroy: () => void;
}

interface Palette {
  background: string;
  surface: string;
  ink: string;
  muted: string;
  rule: string;
  accent: string;
  accentDark: string;
  warm: string;
  warmBg: string;
  warmBorder: string;
}

type RGB = [number, number, number];

const FIXED_STEP = 1 / 120;
const FOG_LEVELS = 12;
const WALL_SCALE = 0.92; // vertical apparent height of a 1-cell wall
const BEST_KEY = 'khc-proofreader-best';
const SOUND_KEY = 'khc-proofreader-sound';

const cssVar = (name: string, fallback: string): string =>
  getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;

const readNumber = (key: string): number => {
  try {
    return Math.max(0, Number(localStorage.getItem(key)) || 0);
  } catch {
    return 0;
  }
};

const writeStorage = (key: string, value: string): void => {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Private-mode storage failures are non-fatal; the current run still works.
  }
};

function readSoundPreference(): boolean {
  try {
    return localStorage.getItem(SOUND_KEY) !== 'off';
  } catch {
    return true;
  }
}

function readPalette(): Palette {
  return {
    background: cssVar('--color-bg', '#fafaf8'),
    surface: cssVar('--color-surface', '#ffffff'),
    ink: cssVar('--color-ink', '#141414'),
    muted: cssVar('--color-muted', '#6b6b6b'),
    rule: cssVar('--color-rule', '#e5e4df'),
    accent: cssVar('--color-accent', '#2e6e5e'),
    accentDark: cssVar('--color-accent-dark', '#245546'),
    warm: cssVar('--color-badge-warm-text', '#8a5a1a'),
    warmBg: cssVar('--color-badge-warm-bg', '#fbf3e4'),
    warmBorder: cssVar('--color-badge-warm-border', '#e3c79a'),
  };
}

// Canvas fillStyle cannot use color-mix(); precompute palette blends in JS instead.
function hexToRgb(hex: string): RGB {
  let h = hex.trim();
  if (h.startsWith('#')) h = h.slice(1);
  if (h.length === 3)
    h = h
      .split('')
      .map((c) => c + c)
      .join('');
  const n = Number.parseInt(h, 16);
  if (h.length !== 6 || Number.isNaN(n)) return [128, 128, 128];
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function mix(a: RGB, b: RGB, t: number): RGB {
  return [
    Math.round(a[0] + (b[0] - a[0]) * t),
    Math.round(a[1] + (b[1] - a[1]) * t),
    Math.round(a[2] + (b[2] - a[2]) * t),
  ];
}

const rgbStr = (c: RGB): string => `rgb(${c[0]}, ${c[1]}, ${c[2]})`;

function hexToRgba(hex: string, alpha: number): string {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

const isInteractive = (target: EventTarget | null): boolean =>
  target instanceof HTMLElement &&
  Boolean(target.closest('a[href], button, input, select, textarea, [contenteditable="true"]'));

export function initProofreader(root: ParentNode = document): ProofreaderController | null {
  const canvasEl = root.querySelector<HTMLCanvasElement>('[data-proof-canvas]');
  if (!canvasEl || canvasEl.dataset.proofReady === 'true') return null;
  const context = canvasEl.getContext('2d');
  if (!context) return null;
  canvasEl.dataset.proofReady = 'true';
  const canvas = canvasEl;
  const ctx = context;

  const healthEl = root.querySelector<HTMLElement>('[data-proof-health]');
  const ammoEl = root.querySelector<HTMLElement>('[data-proof-ammo]');
  const waveEl = root.querySelector<HTMLElement>('[data-proof-wave]');
  const scoreEl = root.querySelector<HTMLElement>('[data-proof-score]');
  const bestEl = root.querySelector<HTMLElement>('[data-proof-best]');
  const sequenceEl = root.querySelector<HTMLElement>('[data-proof-sequence]');
  const statusEl = root.querySelector<HTMLElement>('[data-proof-status]');
  const pauseBtn = root.querySelector<HTMLButtonElement>('[data-proof-pause]');
  const restartBtn = root.querySelector<HTMLButtonElement>('[data-proof-restart]');
  const soundBtn = root.querySelector<HTMLButtonElement>('[data-proof-sound]');
  const fireBtn = root.querySelector<HTMLButtonElement>('[data-proof-fire]');
  const shareBtn = root.querySelector<HTMLButtonElement>('[data-proof-share]');

  const seedValue = new URLSearchParams(location.search).get('seed');
  const fixedSeed = seedValue === null ? null : Number(seedValue) >>> 0;
  const freshSeed = () => fixedSeed ?? (Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0;

  const state = createGame(freshSeed());
  let best = readNumber(BEST_KEY);
  let palette = readPalette();
  let soundEnabled = readSoundPreference();
  let shareMessage = '';
  const motionQuery = matchMedia('(prefers-reduced-motion: reduce)');
  let reducedMotion = motionQuery.matches;
  const coarsePointer = matchMedia('(pointer: coarse)').matches;
  let aimAssistOn = coarsePointer;

  const held: StepInput = { forward: 0, strafe: 0, turn: 0, fire: false };
  const moving = () => Math.abs(held.forward) > 0.1 || Math.abs(held.strafe) > 0.1;

  // Render buffers (all in CSS pixels; the backing store is DPR-scaled).
  let width = 640;
  let height = 400;
  let dpr = 1;
  let focal = 1;
  let colStep = 4;
  let numCols = 1;
  let depth = new Float32Array(1);
  let bobPhase = 0;
  let hitMarkerUntil = -1;
  let hitMarkerKind: 'hit' | 'kill' = 'hit';
  let joystick: { originX: number; originY: number; curX: number; curY: number } | null = null;

  let shadeLUT: string[][][] = [];
  let floorColor = '#000';
  let ceilingColor = '#000';
  let radarCanvas: HTMLCanvasElement | null = null;
  let radarCell = 5;

  const resizeObserver = new ResizeObserver(resize);

  function buildColors() {
    const bg = hexToRgb(palette.background);
    const surf = hexToRgb(palette.surface);
    const ink = hexToRgb(palette.ink);
    const rule = hexToRgb(palette.rule);
    ceilingColor = rgbStr(mix(bg, ink, 0.05));
    floorColor = rgbStr(mix(surf, rule, 0.5));
    const tints = [palette.accent, palette.warm, palette.muted, palette.accentDark].map(hexToRgb);
    shadeLUT = tints.map((tint) => {
      const base = mix(surf, tint, 0.3);
      return [0, 1].map((side) => {
        const sideBase = side === 1 ? mix(base, ink, 0.16) : base;
        const levels: string[] = [];
        for (let level = 0; level < FOG_LEVELS; level++) {
          const fogT = (level / (FOG_LEVELS - 1)) * 0.82;
          levels.push(rgbStr(mix(sideBase, bg, fogT)));
        }
        return levels;
      });
    });
  }

  function buildRadar() {
    const cell = Math.max(2, Math.floor(84 / Math.max(state.cols, state.rows)));
    radarCell = cell;
    const rc = document.createElement('canvas');
    rc.width = state.cols * cell;
    rc.height = state.rows * cell;
    const rctx = rc.getContext('2d');
    if (!rctx) {
      radarCanvas = null;
      return;
    }
    rctx.fillStyle = hexToRgba(palette.ink, 0.16);
    rctx.fillRect(0, 0, rc.width, rc.height);
    rctx.fillStyle = palette.rule;
    for (let y = 0; y < state.rows; y++) {
      for (let x = 0; x < state.cols; x++) {
        if (state.map[y][x] > 0) rctx.fillRect(x * cell, y * cell, cell, cell);
      }
    }
    radarCanvas = rc;
  }

  function resize() {
    const rect = canvas.getBoundingClientRect();
    width = Math.max(1, Math.round(rect.width));
    height = Math.max(1, Math.round(rect.height));
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    focal = width / 2 / Math.tan(TUNING.fov / 2);
    const coarse = coarsePointer || width < 520;
    const rayBudget = coarse ? 160 : 240;
    colStep = Math.max(2, Math.ceil(width / rayBudget));
    numCols = Math.ceil(width / colStep);
    depth = new Float32Array(numCols);
    render();
  }

  function roundedRect(x: number, y: number, w: number, h: number, radius: number) {
    const r = Math.min(radius, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  // ---- renderer ---------------------------------------------------------
  function renderWalls() {
    const half = height / 2;
    const px = state.player.x;
    const py = state.player.y;
    const angle = state.player.angle;
    for (let ci = 0; ci < numCols; ci++) {
      const x = ci * colStep;
      const rayAngle = angle + Math.atan((x + colStep / 2 - width / 2) / focal);
      const hit = castRay(state.map, px, py, rayAngle);
      const perp = Math.max(0.02, hit.distance * Math.cos(rayAngle - angle));
      depth[ci] = perp;
      if (hit.wallType === 0) continue;
      const sliceH = (WALL_SCALE * focal) / perp;
      const top = half - sliceH / 2;
      const t = hit.wallType - 1;
      const level = Math.min(FOG_LEVELS - 1, Math.max(0, Math.floor(perp)));
      const seam = hit.u < 0.04 || hit.u > 0.96;
      ctx.fillStyle =
        shadeLUT[t][seam ? 1 : hit.side][seam ? Math.min(FOG_LEVELS - 1, level + 3) : level];
      ctx.fillRect(x, top, colStep + 1, sliceH);
    }
  }

  interface SpriteItem {
    kind: 'enemy' | 'pickup';
    enemy?: Enemy;
    pickup?: Pickup;
    perp: number;
    screenX: number;
  }

  function renderSprites() {
    const items: SpriteItem[] = [];
    const px = state.player.x;
    const py = state.player.y;
    const angle = state.player.angle;
    const consider = (ox: number, oy: number): { perp: number; screenX: number } | null => {
      const dx = ox - px;
      const dy = oy - py;
      const dist = Math.hypot(dx, dy);
      if (dist < 0.15) return null;
      const dAng = normalizeAngle(Math.atan2(dy, dx) - angle);
      if (Math.abs(dAng) > TUNING.fov / 2 + 0.35) return null;
      const perp = dist * Math.cos(dAng);
      if (perp < 0.1) return null;
      return { perp, screenX: width / 2 + Math.tan(dAng) * focal };
    };
    for (const enemy of state.enemies) {
      if (!enemy.alive) continue;
      const p = consider(enemy.x, enemy.y);
      if (p) items.push({ kind: 'enemy', enemy, perp: p.perp, screenX: p.screenX });
    }
    for (const pickup of state.pickups) {
      if (pickup.taken) continue;
      const p = consider(pickup.x, pickup.y);
      if (p) items.push({ kind: 'pickup', pickup, perp: p.perp, screenX: p.screenX });
    }
    items.sort((a, b) => b.perp - a.perp);
    for (const item of items) drawSprite(item);
  }

  function enemyColor(kind: EnemyKind): string {
    if (kind === 'substitution') return palette.accent;
    if (kind === 'insertion') return palette.warm;
    return palette.accentDark;
  }

  function drawSprite(item: SpriteItem) {
    const worldH = item.kind === 'enemy' ? 0.95 : 0.55;
    const spriteH = (WALL_SCALE * focal * worldH) / item.perp;
    const spriteW = spriteH;
    const bottom = height / 2 + (WALL_SCALE * focal * 0.5) / item.perp;
    const centerY = bottom - spriteH / 2;
    const x0 = item.screenX - spriteW / 2;
    const x1 = item.screenX + spriteW / 2;
    const ciStart = Math.max(0, Math.floor(x0 / colStep));
    const ciEnd = Math.min(numCols - 1, Math.floor(x1 / colStep));
    // Draw the sprite only across contiguous column runs where it is nearer than the wall.
    let runStart = -1;
    for (let ci = ciStart; ci <= ciEnd + 1; ci++) {
      const visible = ci <= ciEnd && depth[ci] > item.perp - 0.05;
      if (visible && runStart < 0) {
        runStart = ci;
      } else if (!visible && runStart >= 0) {
        const rx0 = Math.max(x0, runStart * colStep);
        const rx1 = Math.min(x1, ci * colStep);
        if (rx1 > rx0) {
          ctx.save();
          ctx.beginPath();
          ctx.rect(rx0, centerY - spriteH / 2 - 2, rx1 - rx0, spriteH + 4);
          ctx.clip();
          drawSpriteShape(item, item.screenX, centerY, spriteH);
          ctx.restore();
        }
        runStart = -1;
      }
    }
  }

  function drawSpriteShape(item: SpriteItem, cx: number, cy: number, size: number) {
    ctx.save();
    ctx.globalAlpha = Math.max(0.3, Math.min(1, 1.25 - item.perp / 16));
    ctx.translate(cx, cy);
    const r = size * 0.42;
    if (item.kind === 'enemy' && item.enemy) {
      const enemy = item.enemy;
      const flash = enemy.hurtFor > 0;
      ctx.fillStyle = flash ? palette.surface : enemyColor(enemy.kind);
      ctx.strokeStyle = flash ? enemyColor(enemy.kind) : palette.ink;
      ctx.lineWidth = Math.max(1, size * 0.03);
      ctx.beginPath();
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * Math.PI * 2;
        const rr = i % 2 === 0 ? r * 1.22 : r * 0.86;
        const ex = Math.cos(a) * rr;
        const ey = Math.sin(a) * rr;
        if (i === 0) ctx.moveTo(ex, ey);
        else ctx.lineTo(ex, ey);
      }
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = palette.surface;
      const eye = Math.max(1.5, r * 0.16);
      ctx.beginPath();
      ctx.arc(-r * 0.32, -r * 0.08, eye, 0, Math.PI * 2);
      ctx.arc(r * 0.32, -r * 0.08, eye, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = palette.ink;
      const pupil = Math.max(0.8, r * 0.07);
      ctx.beginPath();
      ctx.arc(-r * 0.32, -r * 0.08, pupil, 0, Math.PI * 2);
      ctx.arc(r * 0.32, -r * 0.08, pupil, 0, Math.PI * 2);
      ctx.fill();
    } else if (item.pickup) {
      const pickup = item.pickup;
      ctx.fillStyle = palette.warmBg;
      ctx.strokeStyle = palette.warmBorder;
      ctx.lineWidth = Math.max(1, size * 0.03);
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = pickup.kind === 'health' ? palette.accent : palette.warm;
      ctx.font = `600 ${Math.round(r * 1.05)}px ${cssVar('--font-display', 'system-ui')}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(pickup.base, 0, 1);
    }
    ctx.restore();
  }

  function renderWeapon() {
    const bob = reducedMotion ? 0 : Math.sin(bobPhase) * 5;
    const cx = width * 0.5;
    const w = Math.max(28, width * 0.085);
    const h = Math.max(60, height * 0.4);
    const baseY = height + 8 + Math.abs(bob) * 0.4;
    ctx.save();
    ctx.translate(cx + bob * 0.6, baseY);
    ctx.fillStyle = palette.ink;
    ctx.strokeStyle = palette.accent;
    ctx.lineWidth = 2;
    roundedRect(-w / 2, -h, w, h, 6);
    ctx.fill();
    ctx.stroke();
    // Double-helix motif down the barrel — genomic without an asset.
    ctx.strokeStyle = palette.accent;
    ctx.globalAlpha = 0.85;
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i <= 10; i++) {
      const yy = -h + 8 + (i / 10) * (h - 16);
      const off = Math.sin((i / 10) * Math.PI * 3) * (w * 0.22);
      if (i === 0) ctx.moveTo(off, yy);
      else ctx.lineTo(off, yy);
    }
    ctx.stroke();
    ctx.beginPath();
    for (let i = 0; i <= 10; i++) {
      const yy = -h + 8 + (i / 10) * (h - 16);
      const off = -Math.sin((i / 10) * Math.PI * 3) * (w * 0.22);
      if (i === 0) ctx.moveTo(off, yy);
      else ctx.lineTo(off, yy);
    }
    ctx.stroke();
    ctx.globalAlpha = 1;
    if (state.muzzleFor > 0) {
      ctx.globalAlpha = Math.min(1, state.muzzleFor / 0.09);
      ctx.fillStyle = palette.accent;
      ctx.beginPath();
      ctx.arc(0, -h, w * 0.6, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    ctx.restore();
  }

  function renderCrosshair() {
    const cx = width / 2;
    const cy = height / 2;
    ctx.save();
    ctx.strokeStyle = palette.accent;
    ctx.globalAlpha = 0.85;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(cx - 9, cy);
    ctx.lineTo(cx - 3, cy);
    ctx.moveTo(cx + 3, cy);
    ctx.lineTo(cx + 9, cy);
    ctx.moveTo(cx, cy - 9);
    ctx.lineTo(cx, cy - 3);
    ctx.moveTo(cx, cy + 3);
    ctx.lineTo(cx, cy + 9);
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.fillStyle = palette.accent;
    ctx.beginPath();
    ctx.arc(cx, cy, 1.4, 0, Math.PI * 2);
    ctx.fill();
    if (state.time < hitMarkerUntil) {
      ctx.strokeStyle = hitMarkerKind === 'kill' ? palette.warm : palette.accent;
      ctx.lineWidth = 2;
      for (const [sx, sy] of [
        [-1, -1],
        [1, -1],
        [-1, 1],
        [1, 1],
      ]) {
        ctx.beginPath();
        ctx.moveTo(cx + sx * 6, cy + sy * 6);
        ctx.lineTo(cx + sx * 11, cy + sy * 11);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  function renderVignette() {
    if (state.damageFor <= 0) return;
    const alpha = Math.min(0.5, (state.damageFor / 0.4) * 0.5);
    const grad = ctx.createRadialGradient(
      width / 2,
      height / 2,
      Math.min(width, height) * 0.3,
      width / 2,
      height / 2,
      Math.max(width, height) * 0.72
    );
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(1, hexToRgba(palette.warm, alpha));
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, width, height);
  }

  function renderRadar() {
    if (!radarCanvas) return;
    const pad = 8;
    const rw = radarCanvas.width;
    const rh = radarCanvas.height;
    const ox = width - rw - pad;
    const oy = pad;
    ctx.save();
    ctx.globalAlpha = 0.85;
    ctx.drawImage(radarCanvas, ox, oy);
    ctx.globalAlpha = 1;
    ctx.fillStyle = palette.warm;
    for (const enemy of state.enemies) {
      if (!enemy.alive) continue;
      ctx.beginPath();
      ctx.arc(
        ox + enemy.x * radarCell,
        oy + enemy.y * radarCell,
        Math.max(1.5, radarCell * 0.4),
        0,
        Math.PI * 2
      );
      ctx.fill();
    }
    ctx.save();
    ctx.translate(ox + state.player.x * radarCell, oy + state.player.y * radarCell);
    ctx.rotate(state.player.angle);
    ctx.fillStyle = palette.accent;
    ctx.beginPath();
    ctx.moveTo(radarCell * 0.9, 0);
    ctx.lineTo(-radarCell * 0.5, radarCell * 0.5);
    ctx.lineTo(-radarCell * 0.5, -radarCell * 0.5);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    ctx.strokeStyle = palette.rule;
    ctx.lineWidth = 1;
    ctx.strokeRect(ox - 0.5, oy - 0.5, rw + 1, rh + 1);
    ctx.restore();
  }

  function renderJoystick() {
    if (!joystick) return;
    ctx.save();
    ctx.globalAlpha = 0.5;
    ctx.strokeStyle = palette.accent;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(joystick.originX, joystick.originY, 44, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 0.7;
    ctx.fillStyle = palette.accent;
    ctx.beginPath();
    ctx.arc(joystick.curX, joystick.curY, 18, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function renderOverlayPanel() {
    if (state.status === 'playing') return;
    ctx.save();
    ctx.fillStyle = hexToRgba(palette.background, 0.82);
    roundedRect(width * 0.1, height * 0.34, width * 0.8, height * 0.32, 8);
    ctx.fill();
    ctx.fillStyle = palette.ink;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `600 ${Math.max(18, Math.round(width * 0.045))}px ${cssVar('--font-display', 'system-ui')}`;
    const title =
      state.status === 'ready'
        ? 'Proofreader'
        : state.status === 'paused'
          ? 'Paused'
          : 'Genome overwhelmed';
    ctx.fillText(title, width / 2, height * 0.44);
    ctx.fillStyle = palette.muted;
    ctx.font = `500 ${Math.max(12, Math.round(width * 0.026))}px ${cssVar('--font-body', 'system-ui')}`;
    const hint =
      state.status === 'ready'
        ? coarsePointer
          ? 'Tap to enter the maze'
          : 'Click to enter · move with W A S D'
        : state.status === 'paused'
          ? 'Press P or Pause to resume'
          : `Wave ${state.wave} · ${state.score.toLocaleString('en-US')} points · Enter to retry`;
    ctx.fillText(hint, width / 2, height * 0.52);
    ctx.restore();
  }

  function render() {
    ctx.fillStyle = ceilingColor;
    ctx.fillRect(0, 0, width, height / 2);
    ctx.fillStyle = floorColor;
    ctx.fillRect(0, height / 2, width, height - height / 2);
    renderWalls();
    renderSprites();
    renderVignette();
    renderWeapon();
    renderCrosshair();
    renderRadar();
    renderJoystick();
    renderOverlayPanel();
  }

  // ---- audio ------------------------------------------------------------
  let audioContext: AudioContext | null = null;

  function ensureAudio(): AudioContext | null {
    if (!soundEnabled) return null;
    try {
      audioContext ??= new AudioContext();
      if (audioContext.state === 'suspended') void audioContext.resume();
      return audioContext;
    } catch {
      return null;
    }
  }

  function tone(frequency: number, duration: number, volume = 0.03, endFrequency = frequency) {
    const audio = ensureAudio();
    if (!audio) return;
    const now = audio.currentTime;
    const oscillator = audio.createOscillator();
    const gain = audio.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(frequency, now);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(20, endFrequency), now + duration);
    gain.gain.setValueAtTime(volume, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    oscillator.connect(gain).connect(audio.destination);
    oscillator.start(now);
    oscillator.stop(now + duration);
  }

  function soundForEvent(event: GameState['lastEvent']) {
    if (!soundEnabled) return;
    if (event === 'fire') tone(520, 0.06, 0.02, 180);
    else if (event === 'empty') tone(200, 0.05, 0.015, 150);
    else if (event === 'hit') tone(700, 0.05, 0.02, 900);
    else if (event === 'kill') tone(300, 0.16, 0.03, 90);
    else if (event === 'hurt') tone(180, 0.2, 0.035, 70);
    else if (event === 'pickup') tone(520, 0.1, 0.03, 760);
    else if (event === 'wave') tone(330, 0.25, 0.03, 660);
    else if (event === 'over') tone(240, 0.5, 0.035, 70);
  }

  // ---- HUD --------------------------------------------------------------
  function statusMessage(): string {
    if (shareMessage) return shareMessage;
    if (state.status === 'ready') return 'Click or tap the view — or press Enter — to start';
    if (state.status === 'paused') return 'Paused — press P or Pause to resume';
    if (state.status === 'over')
      return `Overrun on wave ${state.wave} — ${state.score.toLocaleString('en-US')} points`;
    if (state.player.ammo === 0) return 'Out of charges — grab nucleotide pickups to reload';
    return `Wave ${state.wave} — clear the mutations`;
  }

  function updateHud() {
    if (healthEl) healthEl.textContent = String(Math.max(0, Math.round(state.player.health)));
    if (ammoEl) ammoEl.textContent = `${state.player.ammo} / ${TUNING.maxAmmo}`;
    if (waveEl) waveEl.textContent = String(state.wave);
    if (scoreEl) scoreEl.textContent = state.score.toLocaleString('en-US');
    if (bestEl) bestEl.textContent = best.toLocaleString('en-US');
    if (sequenceEl) sequenceEl.textContent = state.sequence.join('') || '—';
    if (statusEl) statusEl.textContent = statusMessage();
    if (pauseBtn) {
      pauseBtn.disabled = state.status === 'ready' || state.status === 'over';
      pauseBtn.textContent = state.status === 'paused' ? 'Resume' : 'Pause';
    }
    if (fireBtn) fireBtn.disabled = state.status !== 'playing';
    if (shareBtn) shareBtn.disabled = state.status !== 'over';
    if (soundBtn) {
      soundBtn.textContent = soundEnabled ? 'Sound on' : 'Sound off';
      soundBtn.setAttribute('aria-pressed', String(soundEnabled));
      soundBtn.setAttribute('aria-label', soundEnabled ? 'Mute game sounds' : 'Enable game sounds');
    }
  }

  function recordBest() {
    if (state.score <= best) return;
    best = state.score;
    writeStorage(BEST_KEY, String(best));
  }

  // ---- lifecycle --------------------------------------------------------
  function begin() {
    shareMessage = '';
    ensureAudio();
    setAimAssist(state, aimAssistOn);
    engineStart(state);
    accumulator = 0;
    lastFrame = 0;
    updateHud();
    render();
  }

  function restart() {
    shareMessage = '';
    reset(state, freshSeed());
    buildRadar();
    begin();
  }

  function togglePause() {
    shareMessage = '';
    if (state.status === 'playing') enginePause(state);
    else if (state.status === 'paused') begin();
    updateHud();
    render();
  }

  function shoot(): boolean {
    ensureAudio();
    const res = engineFire(state);
    if (res.fired || state.lastEvent === 'empty') {
      soundForEvent(state.lastEvent);
      if (res.hitId !== null) {
        hitMarkerUntil = state.time + 0.12;
        hitMarkerKind = res.killed ? 'kill' : 'hit';
      }
      updateHud();
      render();
    }
    return res.fired;
  }

  async function shareResult() {
    if (state.status !== 'over') return;
    const url = new URL('/games/proofreader/', location.origin).href;
    const text = `I cleared ${state.wave} waves and scored ${state.score.toLocaleString('en-US')} points in Proofreader, a first-person genome shooter.`;
    try {
      if (navigator.share) {
        await navigator.share({ title: 'Proofreader', text, url });
        shareMessage = 'Result shared';
      } else {
        await navigator.clipboard.writeText(`${text} ${url}`);
        shareMessage = 'Result copied to clipboard';
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      shareMessage = 'Sharing is unavailable in this browser';
    }
    updateHud();
  }

  // ---- fixed-timestep loop ---------------------------------------------
  let animationFrame = 0;
  let lastFrame = 0;
  let accumulator = 0;

  function simulationTick() {
    engineStep(state, FIXED_STEP, held);
    const event = state.lastEvent;
    if (event !== 'none') soundForEvent(event);
    if (event === 'hit' || event === 'kill') {
      hitMarkerUntil = state.time + 0.12;
      hitMarkerKind = event;
    }
    if (moving()) bobPhase += 9 * FIXED_STEP;
    recordBest();
  }

  function frame(timestamp: number) {
    animationFrame = requestAnimationFrame(frame);
    if (!lastFrame) lastFrame = timestamp;
    const elapsed = Math.min(0.1, Math.max(0, (timestamp - lastFrame) / 1000));
    lastFrame = timestamp;
    if (state.status === 'playing') {
      accumulator += elapsed;
      let guard = 0;
      while (accumulator >= FIXED_STEP && guard++ < 15) {
        accumulator -= FIXED_STEP;
        simulationTick();
      }
      render();
      updateHud();
    }
  }

  // ---- input ------------------------------------------------------------
  const pressed = new Set<string>();
  const MOVE_KEYS = new Set([
    'w',
    'a',
    's',
    'd',
    'q',
    'e',
    'ArrowUp',
    'ArrowDown',
    'ArrowLeft',
    'ArrowRight',
  ]);

  function syncKeyboard() {
    const forward =
      (pressed.has('w') || pressed.has('ArrowUp') ? 1 : 0) -
      (pressed.has('s') || pressed.has('ArrowDown') ? 1 : 0);
    const strafe = (pressed.has('d') ? 1 : 0) - (pressed.has('a') ? 1 : 0);
    const turn =
      (pressed.has('ArrowRight') || pressed.has('e') ? 1 : 0) -
      (pressed.has('ArrowLeft') || pressed.has('q') ? 1 : 0);
    held.forward = forward;
    held.strafe = strafe;
    held.turn = turn;
  }

  function onKeyDown(event: KeyboardEvent) {
    if (isInteractive(event.target)) return;
    const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
    if (MOVE_KEYS.has(key)) {
      event.preventDefault();
      pressed.add(key);
      if (state.status === 'ready') begin();
      syncKeyboard();
      return;
    }
    if (key === ' ') {
      event.preventDefault();
      if (state.status === 'ready') begin();
      else if (state.status === 'playing') held.fire = true;
      return;
    }
    if (key === 'Enter') {
      event.preventDefault();
      if (state.status === 'over') restart();
      else if (state.status !== 'playing') begin();
      return;
    }
    if (key === 'p') {
      event.preventDefault();
      togglePause();
      return;
    }
    if (key === 'Escape' && !pointerLocked) {
      event.preventDefault();
      togglePause();
    }
  }

  function onKeyUp(event: KeyboardEvent) {
    const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
    if (key === ' ') {
      held.fire = false;
      return;
    }
    if (pressed.has(key)) {
      pressed.delete(key);
      syncKeyboard();
    }
  }

  const pointers = new Map<
    number,
    { side: 'move' | 'look'; originX: number; originY: number; lastX: number }
  >();
  let movePointerId: number | null = null;

  function resumeFromState(): boolean {
    // Returns true if the tap consumed by (re)starting and should not steer.
    if (state.status === 'ready') {
      begin();
      return false;
    }
    if (state.status === 'over') {
      restart();
      return true;
    }
    if (state.status === 'paused') {
      begin();
      return false;
    }
    return false;
  }

  function onPointerDown(event: PointerEvent) {
    if (event.pointerType === 'mouse') {
      if (resumeFromState()) return;
      if (state.status === 'playing') {
        held.fire = true;
        ensureAudio();
        requestLock();
      }
      return;
    }
    if (!aimAssistOn) {
      aimAssistOn = true;
      setAimAssist(state, true);
    }
    const consumed = resumeFromState();
    try {
      canvas.setPointerCapture(event.pointerId);
    } catch {
      // Some embedded browsers reject setPointerCapture; gameplay is unaffected.
    }
    if (consumed) return;
    const rect = canvas.getBoundingClientRect();
    const side: 'move' | 'look' = event.clientX - rect.left < rect.width / 2 ? 'move' : 'look';
    pointers.set(event.pointerId, {
      side,
      originX: event.clientX,
      originY: event.clientY,
      lastX: event.clientX,
    });
    if (side === 'move') movePointerId = event.pointerId;
  }

  function onPointerMove(event: PointerEvent) {
    if (event.pointerType === 'mouse') {
      if (pointerLocked && state.status === 'playing') {
        const mx = Math.max(-60, Math.min(60, event.movementX || 0));
        turnBy(state, mx * 0.0025);
      }
      return;
    }
    const pointer = pointers.get(event.pointerId);
    if (!pointer || state.status !== 'playing') return;
    if (pointer.side === 'look') {
      turnBy(state, (event.clientX - pointer.lastX) * 0.0075);
      pointer.lastX = event.clientX;
      return;
    }
    const rect = canvas.getBoundingClientRect();
    const dx = event.clientX - pointer.originX;
    const dy = event.clientY - pointer.originY;
    const radius = 56;
    if (Math.hypot(dx, dy) < 8) {
      held.forward = 0;
      held.strafe = 0;
    } else {
      held.strafe = Math.max(-1, Math.min(1, dx / radius));
      held.forward = Math.max(-1, Math.min(1, -dy / radius));
    }
    joystick = {
      originX: pointer.originX - rect.left,
      originY: pointer.originY - rect.top,
      curX: event.clientX - rect.left,
      curY: event.clientY - rect.top,
    };
  }

  function onPointerEnd(event: PointerEvent) {
    if (event.pointerType === 'mouse') {
      held.fire = false;
      return;
    }
    const pointer = pointers.get(event.pointerId);
    if (!pointer) return;
    try {
      if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
    } catch {
      // Mirror the pointerdown guard.
    }
    pointers.delete(event.pointerId);
    if (event.pointerId === movePointerId || pointer.side === 'move') {
      movePointerId = null;
      held.forward = 0;
      held.strafe = 0;
      joystick = null;
    }
  }

  // ---- pointer lock -----------------------------------------------------
  let pointerLocked = false;

  function requestLock() {
    if (pointerLocked) return;
    try {
      const result = canvas.requestPointerLock() as unknown as Promise<void> | undefined;
      if (result && typeof result.catch === 'function') result.catch(() => {});
    } catch {
      // Pointer Lock may be unavailable; keyboard turning keeps the game playable.
    }
  }

  function onLockChange() {
    pointerLocked = document.pointerLockElement === canvas;
    updateHud();
  }

  function onLockError() {
    pointerLocked = false;
  }

  // ---- button + system listeners ---------------------------------------
  let lastFirePointerAt = 0;

  const onFireDown = () => {
    lastFirePointerAt = Date.now();
    if (state.status === 'ready') begin();
    ensureAudio();
    if (state.status === 'playing') {
      shoot();
      held.fire = true;
    }
  };
  const onFireUp = () => {
    held.fire = false;
  };
  const onFireClick = () => {
    if (Date.now() - lastFirePointerAt < 700) return; // keyboard/AT activation only
    if (state.status === 'ready') begin();
    else if (state.status === 'playing') shoot();
  };

  const onPause = () => togglePause();
  const onRestart = () => restart();
  const onSound = () => {
    soundEnabled = !soundEnabled;
    writeStorage(SOUND_KEY, soundEnabled ? 'on' : 'off');
    if (!soundEnabled && audioContext) void audioContext.suspend();
    else ensureAudio();
    updateHud();
  };
  const onShare = () => void shareResult();

  const onTheme = () => {
    palette = readPalette();
    buildColors();
    buildRadar();
    render();
  };
  const onMotion = () => {
    reducedMotion = motionQuery.matches;
  };

  function releaseControls() {
    pressed.clear();
    pointers.clear();
    movePointerId = null;
    joystick = null;
    held.forward = 0;
    held.strafe = 0;
    held.turn = 0;
    held.fire = false;
  }

  const onBlur = () => {
    if (state.status === 'playing') {
      enginePause(state);
      releaseControls();
      if (pointerLocked && document.exitPointerLock) document.exitPointerLock();
      updateHud();
      render();
    }
  };
  const onVisibility = () => {
    if (document.hidden && state.status === 'playing') {
      enginePause(state);
      releaseControls();
      updateHud();
      render();
    }
  };

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', onBlur);
  document.addEventListener('visibilitychange', onVisibility);
  document.addEventListener('khc:theme-change', onTheme);
  document.addEventListener('pointerlockchange', onLockChange);
  document.addEventListener('pointerlockerror', onLockError);
  motionQuery.addEventListener('change', onMotion);
  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerup', onPointerEnd);
  canvas.addEventListener('pointercancel', onPointerEnd);
  fireBtn?.addEventListener('pointerdown', onFireDown);
  fireBtn?.addEventListener('pointerup', onFireUp);
  fireBtn?.addEventListener('pointerleave', onFireUp);
  fireBtn?.addEventListener('pointercancel', onFireUp);
  fireBtn?.addEventListener('click', onFireClick);
  pauseBtn?.addEventListener('click', onPause);
  restartBtn?.addEventListener('click', onRestart);
  soundBtn?.addEventListener('click', onSound);
  shareBtn?.addEventListener('click', onShare);

  buildColors();
  buildRadar();
  resizeObserver.observe(canvas);
  resize();
  updateHud();
  animationFrame = requestAnimationFrame(frame);

  window.__proofreaderInstances = (window.__proofreaderInstances ?? 0) + 1;
  window.__proofreader = {
    state: () => state,
    start: () => begin(),
    restart,
    tick: (frames = 1) => {
      for (let i = 0; i < Math.max(1, frames); i++) simulationTick();
      render();
      updateHud();
    },
    setInput: (partial) => Object.assign(held, partial),
    turn: (rad) => {
      turnBy(state, rad);
      render();
    },
    fire: shoot,
    pause: () => {
      enginePause(state);
      updateHud();
      render();
    },
    resume: begin,
    endRun: () => {
      state.player.health = 0;
      if (state.status === 'playing') {
        simulationTick();
      } else {
        state.status = 'over';
        state.lastEvent = 'over';
        recordBest();
      }
      updateHud();
      render();
    },
    share: shareResult,
  };

  function destroy() {
    cancelAnimationFrame(animationFrame);
    animationFrame = 0;
    resizeObserver.disconnect();
    window.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('keyup', onKeyUp);
    window.removeEventListener('blur', onBlur);
    document.removeEventListener('visibilitychange', onVisibility);
    document.removeEventListener('khc:theme-change', onTheme);
    document.removeEventListener('pointerlockchange', onLockChange);
    document.removeEventListener('pointerlockerror', onLockError);
    motionQuery.removeEventListener('change', onMotion);
    canvas.removeEventListener('pointerdown', onPointerDown);
    canvas.removeEventListener('pointermove', onPointerMove);
    canvas.removeEventListener('pointerup', onPointerEnd);
    canvas.removeEventListener('pointercancel', onPointerEnd);
    fireBtn?.removeEventListener('pointerdown', onFireDown);
    fireBtn?.removeEventListener('pointerup', onFireUp);
    fireBtn?.removeEventListener('pointerleave', onFireUp);
    fireBtn?.removeEventListener('pointercancel', onFireUp);
    fireBtn?.removeEventListener('click', onFireClick);
    pauseBtn?.removeEventListener('click', onPause);
    restartBtn?.removeEventListener('click', onRestart);
    soundBtn?.removeEventListener('click', onSound);
    shareBtn?.removeEventListener('click', onShare);
    if (pointerLocked && document.exitPointerLock) document.exitPointerLock();
    if (audioContext) void audioContext.close();
    delete canvas.dataset.proofReady;
    window.__proofreaderInstances = Math.max(0, (window.__proofreaderInstances ?? 1) - 1);
    if (window.__proofreaderInstances === 0) delete window.__proofreader;
  }

  return { destroy };
}
