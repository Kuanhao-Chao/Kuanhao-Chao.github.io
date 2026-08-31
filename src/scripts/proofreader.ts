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
  onAccent: string;
  warm: string;
  warmBg: string;
  warmBorder: string;
}

type RGB = [number, number, number];

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  color: string;
  size: number;
}

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
    onAccent: cssVar('--color-on-accent', '#ffffff'),
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
  let idlePhase = 0;
  let recoilFor = 0; // seconds of weapon recoil left (renderer-only, set on fire)
  let hitMarkerUntil = -1;
  let hitMarkerKind: 'hit' | 'kill' = 'hit';
  let enemyNearCenter = false; // set during renderSprites, read by the crosshair
  let joystick: { originX: number; originY: number; curX: number; curY: number } | null = null;
  const particles: Particle[] = [];

  let shadeLUT: string[][][] = [];
  let trimColor = '#000';
  let horizonColor = 'rgba(0,0,0,0)';
  let ceilingGrad: CanvasGradient | string = '#000';
  let floorGrad: CanvasGradient | string = '#000';
  let floorGridCanvas: HTMLCanvasElement | null = null;
  let shadeStripCanvas: HTMLCanvasElement | null = null;
  let wallStrips: Array<HTMLCanvasElement | null> = [];
  let radarCanvas: HTMLCanvasElement | null = null;
  let radarCell = 5;
  let themedWave = -1; // last wave the visual caches were tinted for

  const resizeObserver = new ResizeObserver(resize);

  // Per-wave zone tint — a subtle, token-derived drift as you push deeper. Capped so the
  // muted palette is preserved (both themes recolor because inputs are tokens).
  function zoneTint(): RGB {
    const hues = [hexToRgb(palette.accent), hexToRgb(palette.warm), hexToRgb(palette.muted)];
    return hues[(((state.wave % 3) + 3) % 3) as 0 | 1 | 2];
  }
  function zoneAmount(): number {
    return Math.min(0.12, Math.max(0, (state.wave - 1) * 0.03));
  }

  function buildColors() {
    const bg0 = hexToRgb(palette.background);
    const surf = hexToRgb(palette.surface);
    const ink = hexToRgb(palette.ink);
    const accent = hexToRgb(palette.accent);
    const amt = zoneAmount();
    const tint = zoneTint();
    const bg = mix(bg0, tint, amt); // fog target drifts toward the zone hue
    // Wall styles 1–4 → materials: base-pair rungs / panel courses / data-stripe / membrane.
    const tints = [palette.accent, palette.warm, palette.muted, palette.accentDark].map(hexToRgb);
    shadeLUT = tints.map((mtint) => {
      const base = mix(mix(surf, mtint, 0.3), tint, amt * 0.5);
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
    trimColor = rgbStr(mix(accent, surf, 0.35));
    horizonColor = hexToRgba(palette.accent, 0.14);
  }

  // A 1×64 vertical lighting overlay stretched over each wall slice: a bright top trim,
  // a highlight fading down, and a shadow pooling at the base — top-vs-bottom depth for 1 op.
  function buildShadeStrip() {
    const c = document.createElement('canvas');
    c.width = 1;
    c.height = 64;
    const cx = c.getContext('2d');
    if (!cx) {
      shadeStripCanvas = null;
      return;
    }
    const g = cx.createLinearGradient(0, 0, 0, 64);
    g.addColorStop(0, hexToRgba(palette.surface, 0.18));
    g.addColorStop(0.18, 'rgba(0,0,0,0)');
    g.addColorStop(0.72, 'rgba(0,0,0,0)');
    g.addColorStop(1, hexToRgba(palette.ink, 0.28));
    cx.fillStyle = g;
    cx.fillRect(0, 0, 1, 64);
    cx.fillStyle = hexToRgba(palette.surface, 0.5); // emissive top trim
    cx.fillRect(0, 0, 1, 2);
    shadeStripCanvas = c;
  }

  // A 1×64 material-detail strip per wall style, stretched over the (one-cell-tall) slice
  // so ticks line up horizontally across every column of a wall.
  function buildWallStrips() {
    const dark = hexToRgba(palette.ink, 0.16);
    const faint = hexToRgba(palette.ink, 0.1);
    const light = hexToRgba(palette.surface, 0.14);
    wallStrips = [0, 1, 2, 3].map((i) => {
      const c = document.createElement('canvas');
      c.width = 1;
      c.height = 64;
      const cx = c.getContext('2d');
      if (!cx) return null;
      if (i === 0) {
        cx.fillStyle = dark; // base-pair rungs
        for (let y = 6; y < 64; y += 9) cx.fillRect(0, y, 1, 1);
      } else if (i === 1) {
        for (let y = 12; y < 64; y += 20) {
          cx.fillStyle = dark; // panel courses
          cx.fillRect(0, y, 1, 2);
          cx.fillStyle = light;
          cx.fillRect(0, y + 2, 1, 1);
        }
      } else if (i === 2) {
        cx.fillStyle = faint; // dense data ticks
        for (let y = 3; y < 64; y += 4) cx.fillRect(0, y, 1, 1);
      } else {
        cx.fillStyle = light; // smooth membrane — one soft highlight
        cx.fillRect(0, 30, 1, 2);
      }
      return c;
    });
  }

  // Ceiling/floor gradients + a baked perspective depth grid over the lower half. The grid
  // is view-locked (an instrument measurement field), so it never slides uncannily.
  function buildBackdrops() {
    const half = height / 2;
    const bg = hexToRgb(palette.background);
    const surf = hexToRgb(palette.surface);
    const ink = hexToRgb(palette.ink);
    const rule = hexToRgb(palette.rule);
    const tint = zoneTint();
    const amt = zoneAmount();
    const cg = ctx.createLinearGradient(0, 0, 0, half);
    cg.addColorStop(0, rgbStr(mix(mix(bg, ink, 0.08), tint, amt)));
    cg.addColorStop(1, rgbStr(mix(mix(bg, ink, 0.01), tint, amt)));
    ceilingGrad = cg;
    const fg = ctx.createLinearGradient(0, half, 0, height);
    fg.addColorStop(0, rgbStr(mix(mix(surf, rule, 0.45), tint, amt)));
    fg.addColorStop(1, rgbStr(mix(mix(surf, ink, 0.14), tint, amt)));
    floorGrad = fg;

    const fc = document.createElement('canvas');
    fc.width = Math.max(1, width);
    fc.height = Math.max(1, Math.ceil(half) + 1);
    const fx = fc.getContext('2d');
    if (!fx) {
      floorGridCanvas = null;
      return;
    }
    fx.strokeStyle = hexToRgba(palette.rule, 0.55);
    fx.lineWidth = 1;
    // Depth bands where a wall foot at distance d projects (matches the wall base formula).
    for (const d of [1, 1.5, 2, 3, 4, 6, 9]) {
      const yy = (WALL_SCALE * focal * 0.5) / d;
      if (yy < fc.height) {
        fx.globalAlpha = Math.max(0.12, 1 - d / 10);
        fx.beginPath();
        fx.moveTo(0, yy);
        fx.lineTo(width, yy);
        fx.stroke();
      }
    }
    // Vanishing verticals converging to the horizon centre.
    fx.globalAlpha = 0.14;
    for (let i = -4; i <= 4; i++) {
      if (i === 0) continue;
      fx.beginPath();
      fx.moveTo(width / 2, 0);
      fx.lineTo(width / 2 + i * (width / 8), fc.height);
      fx.stroke();
    }
    floorGridCanvas = fc;
  }

  // Single rebuild entry point — everything derived from tokens + wave, so light/dark-safe.
  function rebuildVisuals() {
    buildColors();
    buildShadeStrip();
    buildWallStrips();
    buildBackdrops();
    themedWave = state.wave;
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
    rebuildVisuals();
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
    const full = !(coarsePointer || width < 520); // desktop gets the extra passes
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
      // Style 3 (data-stripe) gets vertical banding by nudging fog on alternating u-bands.
      const stripe = t === 2 && (((hit.u * 6) | 0) & 1) === 1;
      const bump = seam ? 3 : stripe ? 2 : 0;
      ctx.fillStyle = shadeLUT[t][seam ? 1 : hit.side][Math.min(FOG_LEVELS - 1, level + bump)];
      ctx.fillRect(x, top, colStep + 1, sliceH);
      const strip = wallStrips[t];
      if (strip) ctx.drawImage(strip, x, top, colStep + 1, sliceH);
      if (full) {
        if (shadeStripCanvas) ctx.drawImage(shadeStripCanvas, x, top, colStep + 1, sliceH);
        ctx.globalAlpha = Math.max(0.15, 1 - level / 9);
        ctx.fillStyle = trimColor; // trim line at the wall foot
        ctx.fillRect(x, top + sliceH - 1, colStep + 1, 1);
        ctx.globalAlpha = 1;
        if (hit.wallType === 4) {
          const cellX = Math.floor(hit.hitX);
          const cellY = Math.floor(hit.hitY);
          if ((cellX * 3 + cellY) % 7 === 0) {
            ctx.fillStyle = horizonColor; // occasional lit membrane panel
            ctx.fillRect(x, top + sliceH * 0.4, colStep + 1, sliceH * 0.2);
          }
        }
      }
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
    enemyNearCenter = false;
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
      if (p) {
        items.push({ kind: 'enemy', enemy, perp: p.perp, screenX: p.screenX });
        if (Math.abs(p.screenX - width / 2) < width * 0.06 && p.perp < 12) enemyNearCenter = true;
      }
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

  const ENEMY_MAX_HP: Record<EnemyKind, number> = {
    substitution: 1,
    insertion: 2,
    deletion: 3,
  };

  function drawSpriteShadow(size: number) {
    ctx.save();
    ctx.globalAlpha *= 0.32;
    ctx.fillStyle = palette.ink;
    ctx.beginPath();
    ctx.ellipse(0, size * 0.48, size * 0.34, size * 0.1, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawEnemyEyes(r: number, ey = -r * 0.05) {
    ctx.fillStyle = palette.surface;
    const eye = Math.max(1.5, r * 0.15);
    ctx.beginPath();
    ctx.arc(-r * 0.3, ey, eye, 0, Math.PI * 2);
    ctx.arc(r * 0.3, ey, eye, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = palette.ink;
    const pupil = Math.max(0.8, r * 0.07);
    ctx.beginPath();
    ctx.arc(-r * 0.3, ey, pupil, 0, Math.PI * 2);
    ctx.arc(r * 0.3, ey, pupil, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawEnemyCracks(r: number, count: number, seed: number) {
    ctx.save();
    ctx.strokeStyle = palette.ink;
    ctx.globalAlpha *= 0.55;
    ctx.lineWidth = Math.max(1, r * 0.06);
    for (let i = 0; i < count; i++) {
      const a = (seed * 1.7 + i * 2.3) % (Math.PI * 2);
      const ox = Math.cos(a) * r * 0.2;
      const oy = Math.sin(a) * r * 0.2;
      ctx.beginPath();
      ctx.moveTo(ox, oy);
      ctx.lineTo(ox + Math.cos(a + 0.5) * r * 0.7, oy + Math.sin(a + 0.5) * r * 0.7);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawEnemyTell(r: number, wob: number) {
    ctx.save();
    ctx.strokeStyle = palette.warm;
    ctx.globalAlpha *= 0.6;
    ctx.lineWidth = Math.max(1, r * 0.06);
    ctx.beginPath();
    ctx.arc(0, 0, r * (1.28 + wob * 0.08), 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  function drawHitSpark(r: number, seed: number) {
    ctx.save();
    ctx.strokeStyle = palette.surface;
    ctx.lineWidth = Math.max(1, r * 0.07);
    for (let i = 0; i < 6; i++) {
      const a = (seed + i) * 1.1;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * r * 0.9, Math.sin(a) * r * 0.9);
      ctx.lineTo(Math.cos(a) * r * 1.45, Math.sin(a) * r * 1.45);
      ctx.stroke();
    }
    ctx.restore();
  }

  // Substitution — a base-swap: a diamond split into two tones with a divider.
  function drawEnemySubstitution(r: number, wob: number, body: string, line: string) {
    ctx.save();
    ctx.rotate(wob * 0.12);
    const d = r * 1.15;
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.moveTo(0, -d);
    ctx.lineTo(d, 0);
    ctx.lineTo(0, d);
    ctx.lineTo(-d, 0);
    ctx.closePath();
    ctx.fill();
    ctx.save(); // darken the right half to read as a swap
    ctx.beginPath();
    ctx.moveTo(0, -d);
    ctx.lineTo(d, 0);
    ctx.lineTo(0, d);
    ctx.closePath();
    ctx.clip();
    ctx.fillStyle = rgbStr(mix(hexToRgb(body), hexToRgb(palette.ink), 0.32));
    ctx.fillRect(-d, -d, 2 * d, 2 * d);
    ctx.restore();
    ctx.strokeStyle = line;
    ctx.lineWidth = Math.max(1, r * 0.08);
    ctx.beginPath();
    ctx.moveTo(0, -d);
    ctx.lineTo(d, 0);
    ctx.lineTo(0, d);
    ctx.lineTo(-d, 0);
    ctx.closePath();
    ctx.moveTo(0, -d);
    ctx.lineTo(0, d);
    ctx.stroke();
    ctx.restore();
  }

  // Insertion — an extra pulsing segment plus a caret (insertion mark).
  function drawEnemyInsertion(r: number, wob: number, body: string, line: string) {
    ctx.save();
    ctx.fillStyle = body;
    ctx.strokeStyle = line;
    ctx.lineWidth = Math.max(1, r * 0.08);
    const w = r * 1.05;
    const h = r * 1.55;
    roundedRect(-w / 2, -h / 2, w, h, r * 0.5);
    ctx.fill();
    ctx.stroke();
    const bulge = r * (0.42 + 0.08 * wob);
    ctx.beginPath();
    ctx.arc(w / 2, 0, bulge, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath(); // caret above
    ctx.moveTo(-r * 0.35, -h / 2 - r * 0.12);
    ctx.lineTo(0, -h / 2 - r * 0.52);
    ctx.lineTo(r * 0.35, -h / 2 - r * 0.12);
    ctx.stroke();
    ctx.restore();
  }

  // Deletion — a thick ring with a missing wedge (the deletion gap).
  function drawEnemyDeletion(r: number, wob: number, body: string, line: string) {
    ctx.save();
    ctx.fillStyle = body;
    ctx.strokeStyle = line;
    ctx.lineWidth = Math.max(1, r * 0.1);
    const gap = 0.62;
    const start = -Math.PI / 2 + gap / 2 + wob * 0.05;
    const end = -Math.PI / 2 - gap / 2 + Math.PI * 2;
    ctx.beginPath();
    ctx.arc(0, 0, r * 1.15, start, end);
    ctx.arc(0, 0, r * 0.55, end, start, true);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
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
      const body = flash ? palette.surface : enemyColor(enemy.kind);
      const line = flash ? enemyColor(enemy.kind) : palette.ink;
      const wob = reducedMotion ? 0 : Math.sin(state.time * 3 + enemy.id * 0.7);
      const dmg = ENEMY_MAX_HP[enemy.kind] - enemy.hp;
      const ready = enemy.attackIn <= 0.15;
      drawSpriteShadow(size);
      if (enemy.kind === 'substitution') {
        drawEnemySubstitution(r, wob, body, line);
        drawEnemyEyes(r);
      } else if (enemy.kind === 'insertion') {
        drawEnemyInsertion(r, wob, body, line);
        drawEnemyEyes(r);
      } else {
        drawEnemyDeletion(r, wob, body, line);
        drawEnemyEyes(r, r * 0.82); // eyes on the lower ring (centre is a gap)
      }
      if (dmg > 0) drawEnemyCracks(r, dmg, enemy.id);
      if (ready) drawEnemyTell(r, wob);
      if (enemy.hurtFor > 0.08) drawHitSpark(r, enemy.id);
    } else if (item.pickup) {
      const pickup = item.pickup;
      drawSpriteShadow(size);
      ctx.lineWidth = Math.max(1, size * 0.035);
      if (pickup.kind === 'health') {
        ctx.fillStyle = palette.warmBg;
        ctx.strokeStyle = palette.accent;
        ctx.beginPath();
        ctx.arc(0, 0, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = palette.accent;
      } else {
        ctx.fillStyle = palette.warmBg;
        ctx.strokeStyle = palette.warmBorder;
        roundedRect(-r * 0.72, -r, r * 1.44, r * 2, r * 0.72); // nucleotide capsule
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = palette.warm;
      }
      ctx.font = `600 ${Math.round(r)}px ${cssVar('--font-display', 'system-ui')}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(pickup.base, 0, 1);
    }
    ctx.restore();
  }

  function drawChargeIndicator(w: number, h: number, frac: number, empty: boolean) {
    const segs = 6;
    const lit = Math.round(frac * segs);
    const sw = (w * 0.5) / segs;
    const y = -h * 0.06;
    for (let i = 0; i < segs; i++) {
      const x = -w * 0.25 + i * sw + 1;
      ctx.fillStyle = i < lit ? (empty ? palette.warm : palette.accent) : palette.rule;
      ctx.fillRect(x, y, sw - 2, h * 0.055);
    }
  }

  // A procedural "polymerase proofreader" instrument: receiver + barrel + helix coil +
  // emitter ring + charge indicator, with recoil kick, muzzle star, and correction pulse.
  function renderWeapon() {
    const recoil = reducedMotion ? 0 : recoilFor / 0.18; // 1 → 0
    const move = moving();
    const bx = reducedMotion ? 0 : move ? Math.sin(bobPhase) * 5 : Math.sin(idlePhase) * 2;
    const by = reducedMotion ? 0 : move ? Math.abs(Math.sin(bobPhase * 2)) * 4 : 0;
    const cx = width * 0.5;
    const w = Math.max(30, width * 0.09);
    const h = Math.max(64, height * 0.42);
    const ammoFrac = state.player.ammo / TUNING.maxAmmo;
    const empty = state.player.ammo === 0;
    ctx.save();
    ctx.translate(cx + bx, height + 10 + by + recoil * 12);
    ctx.rotate(-recoil * 0.03);

    // receiver body
    ctx.fillStyle = palette.ink;
    ctx.strokeStyle = palette.rule;
    ctx.lineWidth = 2;
    roundedRect(-w * 0.34, -h * 0.28, w * 0.68, h * 0.5, 6);
    ctx.fill();
    ctx.stroke();
    // barrel
    ctx.strokeStyle = palette.accent;
    roundedRect(-w * 0.2, -h, w * 0.4, h * 0.78, 5);
    ctx.fill();
    ctx.stroke();
    // twin helix coil down the barrel
    ctx.globalAlpha = 0.9;
    for (const dir of [1, -1]) {
      ctx.beginPath();
      for (let i = 0; i <= 12; i++) {
        const yy = -h + 6 + (i / 12) * (h * 0.72);
        const off = dir * Math.sin((i / 12) * Math.PI * 3) * (w * 0.15);
        if (i === 0) ctx.moveTo(off, yy);
        else ctx.lineTo(off, yy);
      }
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    // emitter ring
    ctx.strokeStyle = empty ? palette.warm : palette.accent;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(0, -h, w * 0.16, 0, Math.PI * 2);
    ctx.stroke();
    // empty / recharge tell
    if (empty) {
      ctx.strokeStyle = palette.warm;
      ctx.globalAlpha = reducedMotion ? 0.6 : 0.4 + 0.3 * Math.abs(Math.sin(idlePhase * 2));
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, -h, w * 0.3, 0.6, Math.PI - 0.6);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    drawChargeIndicator(w, h, ammoFrac, empty);

    // muzzle flash (star) + expanding correction pulse
    if (state.muzzleFor > 0) {
      const f = Math.min(1, state.muzzleFor / 0.09);
      ctx.globalAlpha = f;
      ctx.fillStyle = palette.accent;
      ctx.beginPath();
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        const rr = i % 2 === 0 ? w * 0.55 : w * 0.22;
        const ex = Math.cos(a) * rr;
        const ey = -h + Math.sin(a) * rr;
        if (i === 0) ctx.moveTo(ex, ey);
        else ctx.lineTo(ex, ey);
      }
      ctx.closePath();
      ctx.fill();
      ctx.globalAlpha = 1;
      if (!reducedMotion) {
        const t = (0.09 - state.muzzleFor) / 0.09; // 0 → 1
        ctx.strokeStyle = palette.accent;
        ctx.globalAlpha = Math.max(0, 1 - t);
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(0, -h, w * (0.3 + t * 1.4), 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
    }
    ctx.restore();
  }

  function renderCrosshair() {
    const cx = width / 2;
    const cy = height / 2;
    const spread = reducedMotion ? 0 : (recoilFor / 0.18) * 4;
    const aimed = enemyNearCenter;
    const col = aimed ? palette.warm : palette.accent;
    const g = 3 + spread; // inner gap
    const a = 9 + spread; // arm length
    ctx.save();
    ctx.strokeStyle = col;
    ctx.globalAlpha = aimed ? 1 : 0.85;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(cx - a, cy);
    ctx.lineTo(cx - g, cy);
    ctx.moveTo(cx + g, cy);
    ctx.lineTo(cx + a, cy);
    ctx.moveTo(cx, cy - a);
    ctx.lineTo(cx, cy - g);
    ctx.moveTo(cx, cy + g);
    ctx.lineTo(cx, cy + a);
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.arc(cx, cy, aimed ? 2 : 1.4, 0, Math.PI * 2);
    ctx.fill();
    if (aimed) {
      ctx.strokeStyle = palette.warm;
      ctx.globalAlpha = 0.5;
      ctx.beginPath();
      ctx.arc(cx, cy, a + 3, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
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
    const px = width * 0.1;
    const py = height * 0.3;
    const pw = width * 0.8;
    const ph = height * 0.4;
    ctx.fillStyle = hexToRgba(palette.background, 0.86);
    roundedRect(px, py, pw, ph, 10);
    ctx.fill();
    ctx.strokeStyle = hexToRgba(palette.accent, 0.5);
    ctx.lineWidth = 1;
    roundedRect(px, py, pw, ph, 10);
    ctx.stroke();
    // Small target glyph above the title.
    const gx = width / 2;
    const gy = height * 0.4;
    const gr = Math.max(9, width * 0.02);
    ctx.strokeStyle = palette.accent;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(gx, gy, gr, 0, Math.PI * 2);
    ctx.moveTo(gx - gr * 1.4, gy);
    ctx.lineTo(gx - gr * 0.5, gy);
    ctx.moveTo(gx + gr * 0.5, gy);
    ctx.lineTo(gx + gr * 1.4, gy);
    ctx.moveTo(gx, gy - gr * 1.4);
    ctx.lineTo(gx, gy - gr * 0.5);
    ctx.moveTo(gx, gy + gr * 0.5);
    ctx.lineTo(gx, gy + gr * 1.4);
    ctx.stroke();
    ctx.fillStyle = palette.accent;
    ctx.beginPath();
    ctx.arc(gx, gy, 1.6, 0, Math.PI * 2);
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
    ctx.fillText(title, width / 2, height * 0.5);
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
    ctx.fillText(hint, width / 2, height * 0.57);
    ctx.restore();
  }

  function render() {
    // Backdrop fills the whole canvas first, so a screen-shake translate never bares an edge.
    ctx.fillStyle = ceilingGrad;
    ctx.fillRect(0, 0, width, height / 2);
    ctx.fillStyle = floorGrad;
    ctx.fillRect(0, height / 2, width, height - height / 2);
    const shakeAmt = reducedMotion ? 0 : Math.min(1, state.damageFor / 0.4);
    ctx.save();
    if (shakeAmt) {
      ctx.translate((Math.random() * 2 - 1) * shakeAmt * 6, (Math.random() * 2 - 1) * shakeAmt * 6);
    }
    if (floorGridCanvas) ctx.drawImage(floorGridCanvas, 0, height / 2);
    renderWalls();
    ctx.fillStyle = horizonColor;
    ctx.fillRect(0, height / 2 - 0.5, width, 1);
    renderSprites();
    renderParticles();
    ctx.restore();
    // HUD layers stay stable (outside the shake) so sprite math is unaffected.
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
    if (sequenceEl) {
      if (state.sequence.length === 0) {
        sequenceEl.textContent = '—';
      } else {
        sequenceEl.textContent = '';
        state.sequence.forEach((b) => {
          const pill = document.createElement('span');
          pill.className = `nucleotide-pill ${b === 'A' ? 'pill-a' : b === 'C' ? 'pill-c' : b === 'G' ? 'pill-g' : 'pill-t'}`;
          pill.textContent = b;
          sequenceEl.appendChild(pill);
        });
      }
    }
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
    particles.length = 0;
    ensureAudio();
    setAimAssist(state, aimAssistOn);
    engineStart(state);
    rebuildVisuals(); // wave is now set → correct zone tint before the first frame
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
      if (res.fired) recoilFor = 0.18;
      if (res.hitId !== null) {
        hitMarkerUntil = state.time + 0.12;
        hitMarkerKind = res.killed ? 'kill' : 'hit';
        spawnBurst(res.killed ? 'kill' : 'hit');
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

  // ---- particles (bounded, reduced-motion-gated) -----------------------
  function spawnBurst(event: GameState['lastEvent']) {
    if (reducedMotion) return;
    let n = 0;
    let color = palette.accent;
    if (event === 'kill') {
      n = 12;
      color = palette.warm;
    } else if (event === 'hit') {
      n = 6;
      color = palette.accent;
    } else if (event === 'hurt') {
      n = 8;
      color = palette.warm;
    }
    if (n === 0) return;
    const cx = width / 2;
    const cy = height / 2;
    for (let i = 0; i < n; i++) {
      if (particles.length >= 40) particles.shift();
      const a = Math.random() * Math.PI * 2;
      const sp = 40 + Math.random() * 130;
      const life = 0.3 + Math.random() * 0.35;
      particles.push({
        x: cx,
        y: cy,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp - 30,
        life,
        max: life,
        color,
        size: 1.5 + Math.random() * 1.8,
      });
    }
  }

  function updateParticles(dt: number) {
    for (const p of particles) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 220 * dt;
      p.life -= dt;
    }
    for (let i = particles.length - 1; i >= 0; i--) {
      if (particles[i].life <= 0) particles.splice(i, 1);
    }
  }

  function renderParticles() {
    if (!particles.length) return;
    for (const p of particles) {
      ctx.globalAlpha = Math.max(0, p.life / p.max);
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    }
    ctx.globalAlpha = 1;
  }

  // ---- fixed-timestep loop ---------------------------------------------
  let animationFrame = 0;
  let lastFrame = 0;
  let accumulator = 0;

  function simulationTick() {
    engineStep(state, FIXED_STEP, held);
    if (state.wave !== themedWave) rebuildVisuals();
    const event = state.lastEvent;
    if (event !== 'none') soundForEvent(event);
    if (event === 'fire' || event === 'hit' || event === 'kill') recoilFor = 0.18;
    if (event === 'hit' || event === 'kill') {
      hitMarkerUntil = state.time + 0.12;
      hitMarkerKind = event;
    }
    if (event === 'hit' || event === 'kill' || event === 'hurt') spawnBurst(event);
    if (moving()) bobPhase += 9 * FIXED_STEP;
    else idlePhase += 6 * FIXED_STEP;
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
      recoilFor = Math.max(0, recoilFor - elapsed);
      updateParticles(elapsed);
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
    rebuildVisuals();
    buildRadar();
    render();
  };
  const onMotion = () => {
    reducedMotion = motionQuery.matches;
    recoilFor = 0;
    if (reducedMotion) particles.length = 0;
    render();
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

  buildRadar();
  resizeObserver.observe(canvas);
  resize(); // computes dims + focal, then rebuildVisuals() + first render()
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
