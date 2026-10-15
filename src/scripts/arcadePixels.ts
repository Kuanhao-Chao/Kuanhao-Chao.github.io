/** Original code-native pixel art. Cosmetic drawing never consumes gameplay RNG. */
import { isDarkTheme } from '../lib/theme';
import {
  bossExposed,
  castRay,
  normalizeAngle,
  type GameState as ProofState,
} from '../lib/proofreader';
import { zapperEndpoints, type GameState as JetState } from '../lib/jetpackJoyride';
import type { GameState as SnakeState, Point } from '../lib/snake';

interface Palette {
  bg: string;
  floor: string;
  wall: string;
  shade: string;
  ink: string;
  muted: string;
  accent: string;
  light: string;
  danger: string;
  gold: string;
  bases: string[];
}
export function pixelPalette(skin = 0): Palette {
  const accents = ['#63d5ad', '#73c9f0', '#efc36d', '#c4a2f0'];
  const dark = isDarkTheme();
  return dark
    ? {
        bg: '#101b26',
        floor: '#1d2c37',
        wall: '#385768',
        shade: '#243d4c',
        ink: '#ecf4e7',
        muted: '#a6c0c7',
        accent: accents[Math.floor(skin)] ?? accents[0],
        light: '#d8f3e4',
        danger: '#fa9b87',
        gold: '#efc36d',
        bases: ['#72d6ad', '#89c7f0', '#efc36d', '#c4a2f0'],
      }
    : {
        bg: '#edf1e6',
        floor: '#d6e1d6',
        wall: '#7e9f9b',
        shade: '#5d807f',
        ink: '#17383e',
        muted: '#446366',
        accent: ['#236e59', '#215d89', '#7a541a', '#69478c'][Math.floor(skin)] ?? '#236e59',
        light: '#f8f9e9',
        danger: '#a74336',
        gold: '#9c681d',
        bases: ['#6fcca0', '#82b6df', '#e5bc68', '#bb98d9'],
      };
}

type SpriteName =
  | 'substitution'
  | 'insertion'
  | 'deletion'
  | 'boss'
  | 'flyer'
  | 'weapon'
  | 'supply'
  | 'relay'
  | 'exit'
  | 'orb';
const SPRITES: Record<SpriteName, string[]> = {
  substitution: [
    '.....222222.....',
    '...2233333322...',
    '..233333333332..',
    '.23343333334332.',
    '.23444333444332.',
    '2334453335443322',
    '2333333333333332',
    '2333113333113332',
    '2333113333113332',
    '.23333333333332.',
    '..233355553332..',
    '...2333333332...',
    '....22222222....',
    '...22......22...',
    '..22........22..',
    '................',
  ],
  insertion: [
    '......2222......',
    '.....233332.....',
    '.....233332.....',
    '.....233332.....',
    '..222233332222..',
    '.23333333333332.',
    '2333333333333332',
    '2333113333113332',
    '2333113333113332',
    '.23333333333332.',
    '..222233332222..',
    '.....233332.....',
    '.....233332.....',
    '......2222......',
    '....22....22....',
    '...22......22...',
  ],
  deletion: [
    '....22222222....',
    '..223333333322..',
    '.23333333333332.',
    '2333444444443332',
    '2334444444444332',
    '2344114444114432',
    '2344114444114432',
    '2344444444444432',
    '2333333333333332',
    '2332222222222332',
    '2332222222222332',
    '.23333333333332.',
    '..222222222222..',
    '...22......22...',
    '..222......222..',
    '................',
  ],
  boss: [
    '...22......22...',
    '..233222222332..',
    '.23333333333332.',
    '2334444444444332',
    '2344554444554432',
    '2344554444554432',
    '2344444444444432',
    '2333441111443332',
    '2333441111443332',
    '2344441111444432',
    '2344444444444432',
    '2333444444443332',
    '.23333333333332.',
    '..222222222222..',
    '.2222......2222.',
    '2222........2222',
  ],
  flyer: [
    '.....222222.....',
    '....23333332....',
    '...2344444432...',
    '...23444111432..',
    '...23444111432..',
    '...2333333332...',
    '.22223333332....',
    '233222222222....',
    '2342233333332...',
    '23422334334332..',
    '23422333333332..',
    '2342233333332...',
    '.22223322332....',
    '....233223332...',
    '...2332..23332..',
    '...222....222...',
  ],
  weapon: [
    '......2222......',
    '.....233332.....',
    '.....234432.....',
    '.....234432.....',
    '.....234432.....',
    '.....234432.....',
    '.....234432.....',
    '.....234432.....',
    '....22344322....',
    '...2333443332...',
    '...2333443332...',
    '...2333333332...',
    '...2333553332...',
    '...2333553332...',
    '....23333332....',
    '....22222222....',
  ],
  supply: [
    '................',
    '.....222222.....',
    '....23333332....',
    '...2334444332...',
    '..233444444332..',
    '.23344444444332.',
    '.23444444444432.',
    '.23444444444432.',
    '.23444444444432.',
    '.23444444444432.',
    '.23344444444332.',
    '..233444444332..',
    '...2334444332...',
    '....23333332....',
    '.....222222.....',
    '................',
  ],
  relay: [
    '......2222......',
    '.....233332.....',
    '.....234432.....',
    '....22344322....',
    '...2333333332...',
    '...2344444432...',
    '...2344114432...',
    '...2344114432...',
    '...2344444432...',
    '...2333333332...',
    '....23333332....',
    '....23333332....',
    '...2333333332...',
    '..233333333332..',
    '..222222222222..',
    '................',
  ],
  exit: [
    '...2222222222...',
    '..233333333332..',
    '..234444444432..',
    '..234444444432..',
    '..234444444432..',
    '..234444444432..',
    '..234444444432..',
    '..234441144432..',
    '..234441144432..',
    '..234444444432..',
    '..234444444432..',
    '..234444444432..',
    '..234444444432..',
    '..233333333332..',
    '..222222222222..',
    '................',
  ],
  orb: [
    '................',
    '................',
    '................',
    '......2222......',
    '.....233332.....',
    '....23344332....',
    '...2334444332...',
    '...2344114432...',
    '...2344114432...',
    '...2334444332...',
    '....23344332....',
    '.....233332.....',
    '......2222......',
    '................',
    '................',
    '................',
  ],
};
const atlas = new Map<string, HTMLCanvasElement>();
function sprite(name: SpriteName, p: Palette, tint = p.accent, frame = 0) {
  const key = `${name}:${p.ink}:${p.light}:${tint}:${frame}`;
  let image = atlas.get(key);
  if (image) return image;
  image = document.createElement('canvas');
  image.width = image.height = 16;
  const ctx = image.getContext('2d')!;
  const colors: Record<string, string> = {
    '1': p.light,
    '2': p.ink,
    '3': tint,
    '4': p.wall,
    '5': p.gold,
  };
  SPRITES[name].forEach((row, y) =>
    [...row].forEach((pixel, x) => {
      if (pixel === '.') return;
      ctx.fillStyle = colors[pixel];
      ctx.fillRect(x, y + (frame && y > 12 ? -1 : 0), 1, 1);
    })
  );
  if (atlas.size >= 192) atlas.clear();
  atlas.set(key, image);
  return image;
}
function text(
  ctx: CanvasRenderingContext2D,
  value: string,
  x: number,
  y: number,
  color: string,
  size = 8
) {
  ctx.fillStyle = color;
  ctx.font = `bold ${size}px monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(value, Math.round(x), Math.round(y));
}
function star(ctx: CanvasRenderingContext2D, x: number, y: number, color: string, scale = 1) {
  ctx.fillStyle = color;
  ctx.fillRect(x - scale, y - 5 * scale, 2 * scale, 10 * scale);
  ctx.fillRect(x - 5 * scale, y - scale, 10 * scale, 2 * scale);
  ctx.fillRect(x - 3 * scale, y - 3 * scale, 6 * scale, 6 * scale);
}

export function drawProofreader(
  ctx: CanvasRenderingContext2D,
  state: ProofState,
  skin: number,
  reduced: boolean
) {
  const p = pixelPalette(skin);
  const w = 320;
  const h = 240;
  const focal = w / 2 / Math.tan(Math.PI / 6);
  ctx.fillStyle = p.bg;
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = p.floor;
  ctx.fillRect(0, 120, w, 120);
  for (let y = 132; y < h; y += Math.max(4, Math.floor((y - 110) / 5))) {
    ctx.fillStyle = p.shade;
    ctx.globalAlpha = 0.18;
    ctx.fillRect(0, y, w, 1);
    for (let x = 0; x < w; x += Math.max(12, y - 100))
      ctx.fillRect(x + ((Math.floor(state.player.x * 9) + y) % 12), y, 2, 2);
  }
  ctx.globalAlpha = 1;
  const depth = new Float32Array(w);
  for (let x = 0; x < w; x += 2) {
    const angle = state.player.angle + Math.atan((x + 1 - w / 2) / focal);
    const hit = castRay(state.map, state.player.x, state.player.y, angle);
    const distance = Math.max(0.03, hit.distance * Math.cos(angle - state.player.angle));
    depth[x] = depth[x + 1] = distance;
    const height = Math.min(2000, (0.92 * focal) / distance);
    const top = Math.round((h - height) / 2);
    ctx.fillStyle = hit.side ? p.shade : p.wall;
    ctx.fillRect(x, top, 2, height);
    ctx.fillStyle = p.ink;
    ctx.globalAlpha = Math.min(0.75, distance / 22);
    ctx.fillRect(x, top, 2, height);
    ctx.globalAlpha = 1;
    if (hit.u < 0.06) {
      ctx.fillStyle = p.ink;
      ctx.globalAlpha = 0.25;
      ctx.fillRect(x, top, 2, height);
      ctx.globalAlpha = 1;
    }
    ctx.fillStyle = hit.wallType === 3 ? p.gold : p.accent;
    ctx.globalAlpha = 0.35;
    ctx.fillRect(x, top + Math.round(height * 0.22), 2, Math.max(1, height * 0.025));
    ctx.fillRect(x, top + Math.round(height * 0.78), 2, Math.max(1, height * 0.02));
    ctx.globalAlpha = 1;
    for (let row = 1; row < 8; row++)
      if ((Math.floor(hit.u * 8) + row) % 4 === 0) {
        ctx.fillStyle = p.ink;
        ctx.globalAlpha = 0.14;
        ctx.fillRect(x, top + Math.round((height * row) / 8), 2, Math.max(1, height / 80));
        ctx.globalAlpha = 1;
      }
  }
  const items: Array<{
    x: number;
    y: number;
    name: SpriteName;
    tint: string;
    size: number;
    label?: string;
    hp?: number;
    warning?: number;
  }> = [];
  state.enemies
    .filter((e) => e.alive)
    .forEach((e) =>
      items.push({
        x: e.x,
        y: e.y,
        name: e.boss ? 'boss' : e.kind,
        tint:
          e.hurtFor > 0
            ? p.light
            : e.kind === 'substitution'
              ? p.danger
              : e.kind === 'insertion'
                ? p.gold
                : p.accent,
        size: e.boss ? 1.5 : 0.85,
        hp: e.hp,
        warning: e.attackWindup,
      })
    );
  state.pickups.forEach((item) =>
    items.push({
      x: item.x,
      y: item.y,
      name: 'supply',
      tint: item.kind === 'health' ? p.danger : p.gold,
      size: 0.42,
      label: item.base,
    })
  );
  state.relays.forEach((item) =>
    items.push({
      x: item.x,
      y: item.y,
      name: 'relay',
      tint: item.active ? p.accent : p.gold,
      size: 0.8,
      label: item.active ? '✓' : '!',
    })
  );
  if (state.run.mode !== 'classic')
    items.push({
      ...state.exit,
      name: 'exit',
      tint: state.exit.open ? p.accent : p.shade,
      size: 1.05,
      label: state.exit.open ? 'EXIT' : undefined,
    });
  state.projectiles.forEach((item) =>
    items.push({ ...item, name: 'orb', tint: p.danger, size: 0.3 })
  );
  const sorted = items
    .map((item) => {
      const dx = item.x - state.player.x;
      const dy = item.y - state.player.y;
      const a = normalizeAngle(Math.atan2(dy, dx) - state.player.angle);
      return { item, angle: a, distance: Math.hypot(dx, dy) * Math.cos(a) };
    })
    .filter((s) => Math.abs(s.angle) < 1.2 && s.distance > 0.1)
    .sort((a, b) => b.distance - a.distance);
  for (const { item, angle, distance } of sorted) {
    const size = Math.min(700, (item.size * focal) / distance);
    const left = Math.round(w / 2 + Math.tan(angle) * focal - size / 2);
    const top = Math.round(h / 2 + (0.38 * focal) / distance - size);
    const frame = reduced || state.status !== 'playing' ? 0 : Math.floor(state.time * 4) % 2;
    const image = sprite(item.name, p, item.tint, frame);
    for (let x = Math.max(0, left); x < Math.min(w, left + size); x++) {
      if (distance >= depth[x]) continue;
      const sx = Math.min(15, Math.floor(((x - left) / size) * 16));
      ctx.drawImage(image, sx, 0, 1, 16, x, top, 1, size);
    }
    const center = Math.round(left + size / 2);
    if (center > 0 && center < w && distance < depth[center]) {
      if (item.label && size > 12) text(ctx, item.label, center, top - 5, p.ink, 8);
      if (item.warning !== undefined) {
        ctx.fillStyle = p.gold;
        ctx.fillRect(center - size / 3, top - 4, (size * 2) / 3, 2);
      }
    }
  }
  const bob =
    reduced || state.status !== 'playing' ? 0 : Math.round(Math.sin(state.time * 6) * 1.5);
  const kick = state.muzzleFor > 0 ? 3 : 0;
  ctx.drawImage(sprite('weapon', p), 136, 191 + bob + kick, 48, 48);
  if (state.muzzleFor > 0) star(ctx, 160, 189 + kick, p.gold, state.pulseCooldown > 1 ? 2 : 1);
  ctx.fillStyle = p.light;
  ctx.fillRect(155, 120, 3, 1);
  ctx.fillRect(163, 120, 3, 1);
  ctx.fillRect(160, 115, 1, 3);
  ctx.fillRect(160, 123, 1, 3);
  if (state.aimAssist) {
    ctx.strokeStyle = p.accent;
    ctx.strokeRect(150, 110, 21, 21);
  }
  if (state.damageFor > 0) {
    const angle = normalizeAngle(state.lastDamageAngle - state.player.angle);
    ctx.fillStyle = p.danger;
    if (Math.abs(angle) < Math.PI / 4) ctx.fillRect(130, 1, 60, 4);
    else if (Math.abs(angle) > (3 * Math.PI) / 4) ctx.fillRect(130, 235, 60, 4);
    else ctx.fillRect(angle > 0 ? 315 : 1, 95, 4, 50);
  }
  // Compact, stable radar. Shape and position supplement every color.
  const mx = 278;
  const my = 6;
  const scale = 2;
  ctx.fillStyle = p.bg;
  ctx.fillRect(mx - 3, my - 3, 40, 40);
  for (let y = 0; y < state.rows; y++)
    for (let x = 0; x < state.cols; x++)
      if (state.map[y][x]) {
        ctx.fillStyle = p.wall;
        ctx.fillRect(mx + x * scale, my + y * scale, 2, 2);
      }
  for (const e of state.enemies)
    if (e.alive) {
      ctx.fillStyle = p.danger;
      ctx.fillRect(mx + Math.floor(e.x) * 2, my + Math.floor(e.y) * 2, 2, 2);
    }
  for (const r of state.relays) {
    ctx.fillStyle = r.active ? p.accent : p.gold;
    ctx.fillRect(mx + Math.floor(r.x) * 2, my + Math.floor(r.y) * 2, 2, 2);
  }
  ctx.fillStyle = p.accent;
  ctx.fillRect(mx + Math.floor(state.player.x) * 2, my + Math.floor(state.player.y) * 2, 2, 2);
  if (state.exit.open) {
    ctx.fillStyle = p.light;
    ctx.fillRect(mx + 30, my + 30, 2, 2);
  }
  const boss = state.enemies.find((e) => e.alive && e.boss);
  if (boss) {
    ctx.fillStyle = p.bg;
    ctx.fillRect(80, 4, 160, 18);
    text(ctx, bossExposed(state) ? 'CORE EXPOSED' : 'CORE GUARDED', 160, 10, p.ink, 7);
    ctx.fillStyle = p.shade;
    ctx.fillRect(82, 17, 156, 4);
    ctx.fillStyle = p.danger;
    ctx.fillRect(82, 17, Math.max(0, (boss.hp / 18) * 156), 4);
  }
}

export function drawSnake(
  ctx: CanvasRenderingContext2D,
  state: SnakeState,
  skin: number,
  reduced: boolean,
  previous: Point[],
  sinceMove: number
) {
  const p = pixelPalette(skin);
  const cell = 16;
  const size = 272;
  ctx.fillStyle = p.bg;
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = p.floor;
  for (let y = 0; y < 17; y++)
    for (let x = 0; x < 17; x++) if ((x + y) % 2 === 0) ctx.fillRect(x * 16, y * 16, 16, 16);
  ctx.fillStyle = p.muted;
  ctx.globalAlpha = 0.2;
  for (let y = 8; y < size; y += cell)
    for (let x = 8; x < size; x += cell) ctx.fillRect(x, y, 1, 1);
  ctx.globalAlpha = 1;
  for (const point of state.obstacles) {
    const x = point.x * cell;
    const y = point.y * cell;
    ctx.fillStyle = p.ink;
    ctx.fillRect(x + 1, y + 1, 14, 14);
    ctx.fillStyle = p.wall;
    ctx.fillRect(x + 2, y + 2, 12, 10);
    ctx.fillStyle = p.light;
    ctx.fillRect(x + 3, y + 3, 3, 1);
    ctx.fillStyle = p.shade;
    ctx.fillRect(x + 3, y + 10, 10, 2);
  }
  if (state.wrap) {
    for (const pos of [40, 136, 232]) {
      text(ctx, '‹', 3, pos, p.accent, 9);
      text(ctx, '›', 269, pos, p.accent, 9);
      text(ctx, '⌃', pos, 4, p.accent, 8);
      text(ctx, '⌄', pos, 268, p.accent, 8);
    }
  } else {
    ctx.strokeStyle = p.wall;
    ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, size - 2, size - 2);
  }
  if (state.bonus) star(ctx, state.bonus.x * cell + 8, state.bonus.y * cell + 8, p.gold);
  for (const food of [state.food, ...state.alternatives]) {
    if (state.status === 'won') continue;
    const index = ['A', 'C', 'G', 'T'].indexOf(food.base);
    const x = food.x * cell;
    const y = food.y * cell;
    ctx.fillStyle = p.ink;
    ctx.fillRect(x + 2, y + 3, 12, 11);
    ctx.fillRect(x + 3, y + 2, 10, 13);
    ctx.fillStyle = p.bases[index];
    ctx.fillRect(x + 3, y + 3, 10, 10);
    text(ctx, food.base, x + 8, y + 8, '#172e35', 12);
  }
  const t = reduced || state.status !== 'playing' ? 1 : Math.min(1, sinceMove / 40);
  for (let i = state.snake.length - 1; i >= 0; i--) {
    const point = state.snake[i];
    const prev = previous[i] ?? point;
    const legal = Math.abs(prev.x - point.x) + Math.abs(prev.y - point.y) <= 1;
    const x = Math.round((legal ? prev.x + (point.x - prev.x) * t : point.x) * cell);
    const y = Math.round((legal ? prev.y + (point.y - prev.y) * t : point.y) * cell);
    const base =
      state.sequence[Math.max(0, state.sequence.length - i)] ?? ['A', 'C', 'G', 'T'][i % 4];
    ctx.fillStyle = p.ink;
    ctx.fillRect(x + 1, y + 2, 14, 12);
    ctx.fillRect(x + 2, y + 1, 12, 14);
    ctx.fillStyle = i === 0 ? p.accent : p.bases[['A', 'C', 'G', 'T'].indexOf(base)];
    ctx.fillRect(x + 2, y + 2, 12, 12);
    ctx.fillStyle = p.light;
    ctx.globalAlpha = 0.45;
    ctx.fillRect(x + 3, y + 3, 9, 1);
    ctx.globalAlpha = 1;
    if (i === 0) {
      const dx = state.dir === 'left' ? -3 : state.dir === 'right' ? 3 : 0;
      const dy = state.dir === 'up' ? -3 : state.dir === 'down' ? 3 : 0;
      ctx.fillStyle = p.ink;
      if (dx) {
        ctx.fillRect(x + 7 + dx, y + 4, 2, 3);
        ctx.fillRect(x + 7 + dx, y + 10, 2, 3);
      } else {
        ctx.fillRect(x + 4, y + 7 + dy, 3, 2);
        ctx.fillRect(x + 10, y + 7 + dy, 3, 2);
      }
    } else text(ctx, base, x + 8, y + 8, '#172e35', 8);
  }
  if (state.collision) {
    const x = Math.max(0, Math.min(16, state.collision.x)) * cell;
    const y = Math.max(0, Math.min(16, state.collision.y)) * cell;
    ctx.strokeStyle = p.danger;
    ctx.lineWidth = 2;
    ctx.strokeRect(x + 1, y + 1, 14, 14);
    text(ctx, '×', x + 8, y + 8, p.danger, 15);
  }
}

export function drawJetpack(
  ctx: CanvasRenderingContext2D,
  state: JetState,
  skin: number,
  reduced: boolean
) {
  const p = pixelPalette(skin);
  const w = 384;
  const h = 256;
  ctx.fillStyle = p.bg;
  ctx.fillRect(0, 0, w, h);
  const scroll = reduced ? 0 : state.distance;
  // Three original tile layers, deliberately quieter than the foreground hazards.
  ctx.fillStyle = p.floor;
  for (let i = -1; i < 10; i++) {
    const x = Math.round(i * 52 - ((scroll * 0.035) % 52));
    ctx.fillRect(x, 40 + (i % 3) * 8, 36, 165);
    ctx.fillStyle = p.shade;
    ctx.globalAlpha = 0.22;
    ctx.fillRect(x + 4, 45, 28, 3);
    ctx.fillRect(x + 4, 188, 28, 7);
    ctx.globalAlpha = 1;
    ctx.fillStyle = p.floor;
  }
  ctx.strokeStyle = p.wall;
  ctx.lineWidth = 1;
  for (let i = -1; i < 8; i++) {
    const x = Math.round(i * 72 - ((scroll * 0.08) % 72));
    ctx.strokeRect(x + 4, 54, 48, 132);
    ctx.fillStyle = p.wall;
    ctx.fillRect(x + 7, 59, 4, 4);
    ctx.fillRect(x + 44, 175, 4, 4);
  }
  ctx.save();
  ctx.scale(w / state.width, h / state.height);
  ctx.fillStyle = p.ink;
  ctx.fillRect(0, state.ceilingY - 12, state.width, 12);
  ctx.fillRect(0, state.groundY, state.width, 22);
  ctx.fillStyle = p.gold;
  for (let x = -40 - (scroll % 80); x < state.width; x += 80) {
    ctx.fillRect(x, state.ceilingY - 6, 26, 4);
    ctx.fillRect(x, state.groundY + 8, 26, 4);
  }
  if (state.run.mode === 'practice') {
    ctx.strokeStyle = p.accent;
    ctx.setLineDash([12, 12]);
    ctx.beginPath();
    ctx.moveTo(0, state.safeY);
    ctx.lineTo(state.width, state.safeY);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  for (const coin of state.coins) {
    ctx.fillStyle = p.ink;
    ctx.fillRect(coin.x - 13, coin.y - 10, 26, 20);
    ctx.fillRect(coin.x - 10, coin.y - 13, 20, 26);
    ctx.fillStyle = p.bases[['A', 'C', 'G', 'T'].indexOf(coin.base)];
    ctx.fillRect(coin.x - 10, coin.y - 10, 20, 20);
    text(ctx, coin.base, coin.x, coin.y + 1, '#172e35', 18);
  }
  for (const power of state.powerUps) {
    ctx.strokeStyle = power.kind === 'shield' ? p.accent : p.gold;
    ctx.lineWidth = 5;
    ctx.strokeRect(power.x - 16, power.y - 16, 32, 32);
    text(ctx, power.kind === 'shield' ? 'S' : 'M', power.x, power.y, p.ink, 20);
  }
  for (const z of state.zappers) {
    const e = zapperEndpoints(z);
    ctx.strokeStyle = p.ink;
    ctx.lineWidth = z.thickness + 8;
    ctx.lineCap = 'square';
    ctx.beginPath();
    ctx.moveTo(e.x1, e.y1);
    ctx.lineTo(e.x2, e.y2);
    ctx.stroke();
    ctx.strokeStyle = p.danger;
    ctx.lineWidth = z.thickness;
    ctx.stroke();
    for (const [x, y] of [
      [e.x1, e.y1],
      [e.x2, e.y2],
    ]) {
      ctx.fillStyle = p.ink;
      ctx.fillRect(x - 14, y - 14, 28, 28);
      ctx.fillStyle = p.gold;
      ctx.fillRect(x - 7, y - 7, 14, 14);
    }
  }
  for (const laser of state.lasers) {
    ctx.fillStyle = p.danger;
    if (laser.phase === 'warn') {
      for (let x = 0; x < state.width; x += 42) ctx.fillRect(x, laser.y - 2, 22, 4);
      text(ctx, 'BEAM', 70, laser.y - 22, p.danger, 16);
      ctx.fillRect(20, laser.y + 12, Math.min(110, (laser.timer / 1400) * 110), 5);
    } else if (laser.phase === 'active') {
      ctx.fillRect(0, laser.y - laser.thickness / 2, state.width, laser.thickness);
      ctx.fillStyle = p.light;
      ctx.fillRect(0, laser.y - 2, state.width, 4);
    }
  }
  for (const m of state.missiles) {
    if (m.phase === 'warn') {
      text(ctx, m.locked ? 'LOCK' : 'AIM', state.width - 66, m.y - 22, p.danger, 17);
      ctx.strokeStyle = p.danger;
      ctx.lineWidth = 4;
      ctx.strokeRect(state.width - 50, m.y - 14, 28, 28);
      ctx.fillStyle = p.danger;
      ctx.fillRect(state.width - 48, m.y + 23, Math.min(28, (m.timer / 1400) * 28), 4);
    } else {
      // Left-facing nose matches travel and the circular collision center.
      ctx.fillStyle = p.ink;
      ctx.fillRect(m.x - 16, m.y - 9, 32, 18);
      ctx.fillStyle = p.danger;
      ctx.fillRect(m.x - 13, m.y - 6, 25, 12);
      ctx.fillRect(m.x - 20, m.y - 3, 7, 6);
      ctx.fillStyle = p.gold;
      ctx.fillRect(m.x + 16, m.y - 4, 10, 8);
    }
  }
  const f = state.flyer;
  if (f.thrusting && state.status === 'playing') {
    const length = reduced ? 20 : 18 + (Math.floor(state.elapsedMs / 90) % 3) * 4;
    ctx.fillStyle = p.gold;
    ctx.fillRect(f.x - 21, f.y + 16, 10, length);
    ctx.fillStyle = p.light;
    ctx.fillRect(f.x - 18, f.y + 17, 4, length - 4);
  }
  ctx.drawImage(sprite('flyer', p), Math.round(f.x - 23), Math.round(f.y - 23), 46, 46);
  if (f.shielded || state.invulnMs > 0) {
    ctx.strokeStyle = p.accent;
    ctx.lineWidth = 3;
    ctx.strokeRect(f.x - 29, f.y - 29, 58, 58);
  }
  if (state.magnetMs > 0) text(ctx, 'M', f.x + 37, f.y, p.gold, 17);
  ctx.restore();
  if (state.chain >= 5)
    text(ctx, `×${Math.min(4, 1 + Math.floor((state.chain - 1) / 5))} CHAIN`, 42, 10, p.ink, 8);
  if (state.run.mode === 'campaign' || state.run.mode === 'practice') {
    const total = [60, 70, 80, 90, 100, 110][state.run.stage - 1];
    ctx.fillStyle = p.shade;
    ctx.fillRect(116, 7, 152, 4);
    ctx.fillStyle = p.accent;
    ctx.fillRect(116, 7, 152 * Math.min(1, state.elapsedMs / 1000 / total), 4);
  }
}
