/** Original v2 raycaster artwork, preserved from de01fa48; cosmetic RNG stays separate. */
import {
  bossExposed,
  castRay,
  normalizeAngle,
  type GameState as ProofState,
} from '../lib/proofreaderClassic';
import { pixelPalette } from './arcadePixels';
type Palette = ReturnType<typeof pixelPalette>;

type SpriteName =
  | 'substitution'
  | 'insertion'
  | 'deletion'
  | 'boss'
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

export function drawProofreaderClassic(
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
