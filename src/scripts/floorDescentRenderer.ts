import type { GameState, Platform } from '../lib/floorDescent';
import { noise } from '../lib/floorDescentCourse';
import type { TextKey } from '../lib/floorDescentText';

type Palette = { sky: string; deep: string; wall: string; stone: string; accent: string };
const palettes: Palette[] = [
  { sky: '#142733', deep: '#2d474c', wall: '#3c5355', stone: '#9dada3', accent: '#e5ba79' },
  { sky: '#0e292b', deep: '#20463c', wall: '#365747', stone: '#a3bb99', accent: '#b0d69a' },
  { sky: '#181f39', deep: '#30365a', wall: '#424e6a', stone: '#a4bbd1', accent: '#9bdfec' },
  { sky: '#202b33', deep: '#3e3c38', wall: '#56544c', stone: '#b8b3a0', accent: '#e6bd7a' },
  { sky: '#2e202a', deep: '#4e343c', wall: '#63474b', stone: '#c19b8b', accent: '#efbb88' },
];
const mix = (a: string, b: string, t: number) => {
  const c = [1, 3, 5].map((i) =>
    Math.round(parseInt(a.slice(i, i + 2), 16) * (1 - t) + parseInt(b.slice(i, i + 2), 16) * t)
  );
  return `#${c.map((n) => n.toString(16).padStart(2, '0')).join('')}`;
};
const clamp = (n: number, a: number, b: number) => Math.max(a, Math.min(b, n));

/** Original vector-painted cave, rendered at a bounded device pixel ratio.
 * The simulation owns every meaningful coordinate. Artwork never changes physics. */
export function createDescentRenderer(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) throw new Error('Canvas unavailable');
  const c = ctx;
  let frames = 0,
    lastDrawMs = 0,
    dpr = 1,
    visiblePlatforms = 0;
  const path = (points: number[][], fill: string, stroke?: string) => {
    c.beginPath();
    points.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y)));
    c.closePath();
    c.fillStyle = fill;
    c.fill();
    if (stroke) {
      c.strokeStyle = stroke;
      c.stroke();
    }
  };
  const round = (x: number, y: number, w: number, h: number, r: number, fill: string) => {
    c.beginPath();
    c.roundRect(x, y, w, h, r);
    c.fillStyle = fill;
    c.fill();
  };
  const line = (points: number[][], color: string, width = 1) => {
    c.beginPath();
    points.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y)));
    c.strokeStyle = color;
    c.lineWidth = width;
    c.stroke();
  };
  const ellipse = (x: number, y: number, rx: number, ry: number, color: string) => {
    c.beginPath();
    c.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
    c.fillStyle = color;
    c.fill();
  };
  function glow(x: number, y: number, r: number, color: string) {
    const g = c.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, color);
    g.addColorStop(1, '#00000000');
    c.fillStyle = g;
    c.fillRect(x - r, y - r, r * 2, r * 2);
  }
  function resize() {
    const box = canvas.getBoundingClientRect();
    dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.max(1, Math.round(box.width * dpr)),
      h = Math.max(1, Math.round(box.height * dpr));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
  }
  function scenery(s: GameState, camera: number, p: Palette, region: number, quiet: boolean) {
    const bg = c.createLinearGradient(0, 0, 420, 600);
    bg.addColorStop(0, p.sky);
    bg.addColorStop(1, p.deep);
    c.fillStyle = bg;
    c.fillRect(0, 0, 420, 600);
    glow(215, 300, 260, p.accent + '0f');
    // Distant arches and geological seams, not a grid or a noisy star field.
    const offset = quiet ? 0 : camera * 0.24;
    for (let row = Math.floor(offset / 190) - 1; row < Math.floor(offset / 190) + 5; row++) {
      const y = row * 190 - offset;
      c.strokeStyle = p.wall + '70';
      c.lineWidth = 13;
      c.beginPath();
      c.ellipse(210, y, 156, 110, 0, Math.PI, Math.PI * 2);
      c.stroke();
      line(
        [
          [58, y],
          [58, y + 120],
        ],
        p.wall + '55',
        8
      );
      line(
        [
          [362, y],
          [362, y + 120],
        ],
        p.wall + '55',
        8
      );
    }
    if (region === 1) {
      for (const side of [0, 1])
        for (let i = 0; i < 5; i++) {
          const x = side ? 392 - i * 6 : 28 + i * 6,
            y = ((((i * 157 - offset * 0.7) % 720) + 720) % 720) - 60;
          line(
            [
              [x, y - 120],
              [x + (side ? -14 : 14), y - 20],
              [x, y + 90],
            ],
            '#80a97b55',
            2
          );
          for (let j = 0; j < 4; j++) {
            c.save();
            c.translate(x + (side ? -6 : 6), y + j * 23);
            c.rotate(side ? -0.6 : 0.6);
            ellipse(0, 0, 8, 3, '#88aa7455');
            c.restore();
          }
        }
    }
    if (region === 2)
      for (const side of [0, 1])
        for (let i = 0; i < 5; i++) {
          const x = side ? 390 : 30,
            y = i * 165 - (offset % 165);
          path(
            [
              [x, y + 35],
              [x + (side ? -18 : 18), y - 16],
              [x + (side ? -35 : 35), y + 30],
            ],
            '#7db5d539',
            '#a8e0e34d'
          );
          line(
            [
              [x + (side ? -18 : 18), y - 16],
              [x + (side ? -16 : 16), y + 29],
            ],
            '#b4e3f044',
            1
          );
        }
    if (region === 3)
      for (const [x, y, r] of [
        [65, 170, 65],
        [360, 450, 87],
      ]) {
        c.save();
        c.translate(x, y);
        c.rotate(quiet ? 0.2 : s.worldTime * 0.04 * (x === 65 ? 1 : -1));
        c.strokeStyle = '#dbb78319';
        c.lineWidth = 9;
        c.beginPath();
        c.arc(0, 0, r, 0, Math.PI * 2);
        c.stroke();
        for (let i = 0; i < 12; i++) {
          c.rotate(Math.PI / 6);
          round(r - 6, -8, 17, 16, 2, '#dbb78319');
        }
        c.restore();
      }
    for (const side of [0, 1]) {
      const x = side ? 396 : 0;
      c.fillStyle = '#07192177';
      c.fillRect(x, 0, 24, 600);
      for (let row = Math.floor(camera / 80) - 1; row < Math.floor(camera / 80) + 9; row++) {
        const y = row * 80 - camera,
          n = noise(s.options.seed, row, side + 41);
        const edge = side ? 398 - n * 7 : 22 + n * 7;
        path(
          side
            ? [
                [420, y - 5],
                [edge, y + 4],
                [edge + 3, y + 58],
                [420, y + 75],
              ]
            : [
                [0, y - 5],
                [edge, y + 4],
                [edge - 3, y + 58],
                [0, y + 75],
              ],
          p.wall,
          '#0a202b70'
        );
        line(
          side
            ? [
                [edge + 1, y + 5],
                [edge + 3, y + 46],
              ]
            : [
                [edge - 1, y + 5],
                [edge - 3, y + 46],
              ],
          p.stone + '35',
          1
        );
      }
    }
    // Warm wayfinding lamps light the shaft without flooding the playing area.
    for (let row = Math.floor(camera / 350); row < Math.floor(camera / 350) + 3; row++) {
      const y = 330 + row * 350 - camera,
        x = row % 2 ? 386 : 34;
      glow(x, y - 35, 90, p.accent + '22');
      line(
        [
          [x, y - 50],
          [x, y - 25],
        ],
        '#283b43',
        5
      );
      round(x - 4, y - 42, 8, 14, 3, p.accent);
      round(x - 2, y - 41, 3, 8, 1, '#fff0c3');
      c.fillStyle = p.stone + '90';
      c.font = '9px ui-monospace,monospace';
      c.textAlign = row % 2 ? 'right' : 'left';
      c.fillText(String(Math.max(0, row)).padStart(2, '0'), row % 2 ? 389 : 30, y + 16);
    }
    if (!quiet)
      for (let i = 0; i < 16; i++) {
        const x = 40 + noise(s.options.seed, i, 91) * 340,
          y =
            ((noise(s.options.seed, i, 92) * 700 + s.worldTime * (region === 4 ? -8 : 3) + 70000) %
              700) -
            50;
        ellipse(
          x,
          y,
          i % 4 === 0 ? 1.4 : 0.7,
          i % 4 === 0 ? 1.4 : 0.7,
          p.accent + (region === 4 ? '77' : '39')
        );
      }
  }
  function platform(f: Platform, camera: number, p: Palette, s: GameState, quiet: boolean) {
    const x = f.x,
      y = f.y - camera,
      w = f.width,
      age = f.touched === null ? -1 : s.worldTime - f.touched;
    if (f.broken) {
      const t = age - 0.45;
      if (t < 0 || t > 0.55 || quiet) return;
      c.save();
      c.globalAlpha = 1 - t / 0.55;
      for (let j = 0; j < 6; j++) {
        const dx = (j - 2.5) * 12 * t,
          dy = 180 * t * t;
        path(
          [
            [x + (j * w) / 6 + dx, y + dy],
            [x + ((j + 1) * w) / 6 - 4 + dx, y + dy + 3],
            [x + (j * w) / 6 + 9 + dx, y + dy + 13],
          ],
          '#caa66e'
        );
      }
      c.restore();
      return;
    }
    const crumble = f.kind === 'crumble';
    const stone = crumble ? '#d1b184' : f.kind === 'spikes' ? '#aa7372' : p.stone;
    const warning = crumble && age >= 0 ? clamp(age / 0.45, 0, 1) : 0;
    c.save();
    if (warning > 0 && !quiet) c.translate(Math.sin(s.worldTime * 65) * warning * 1.2, warning * 2);
    round(x - 1, y + 3, w + 2, 13, 5, '#071a2380');
    if (f.kind === 'spring') {
      const press = age >= 0 && age < 0.12 ? (age / 0.12) * 5 : 0;
      for (const px of [x + 18, x + w - 18]) {
        line(
          [
            [px, y + 3 + press],
            [px - 5, y + 6 + press],
            [px + 5, y + 9 + press],
            [px - 5, y + 12],
            [px + 5, y + 15],
            [px, y + 18],
          ],
          '#cabf8f',
          2
        );
      }
      round(x + 8, y + 16, w - 16, 4, 2, '#486b67');
      round(x, y + press, w, 6, 3, '#b2ceaa');
      line(
        [
          [x + 4, y + 1 + press],
          [x + w - 4, y + 1 + press],
        ],
        '#e3efd2',
        1.5
      );
      return c.restore();
    }
    round(x, y, w, 11, 4, stone);
    round(x + 3, y + 8, w - 6, 5, 2, crumble ? '#8d7054' : p.wall);
    line(
      [
        [x + 5, y + 1.5],
        [x + w - 5, y + 1.5],
      ],
      '#f7f4dc70',
      1.5
    );
    for (const px of [x + 7, x + w - 7]) ellipse(px, y + 6, 1.3, 1.3, '#1c333e88');
    if (crumble) {
      for (let j = 0; j < 3; j++) {
        const px = x + 18 + (j * (w - 35)) / 3;
        line(
          [
            [px - 3, y],
            [px + 2, y + 4],
            [px - 2, y + 8],
            [px + 3, y + 12],
          ],
          warning > 0 ? '#604839' : '#a78561',
          warning > 0 ? 1.8 : 1
        );
      }
      line(
        [
          [x + 8, y + 10],
          [x + 15, y + 10],
        ],
        '#eed4a3',
        2
      );
    }
    if (f.kind === 'spikes') {
      for (let px = x + 3; px < x + w - 8; px += 13)
        path(
          [
            [px, y + 1],
            [px + 5, y - 9],
            [px + 11, y + 1],
          ],
          '#db8b80',
          '#f2b2a3'
        );
      line(
        [
          [x + 3, y + 5],
          [x + w - 3, y + 5],
        ],
        '#6d414a',
        2
      );
    }
    if (f.kind === 'left' || f.kind === 'right') {
      round(x + 10, y + 2, w - 20, 7, 2, '#385c73');
      c.save();
      c.beginPath();
      c.rect(x + 11, y + 2, w - 22, 7);
      c.clip();
      const dir = f.kind === 'left' ? -1 : 1,
        shift = quiet ? 0 : (s.worldTime * 30 * dir) % 16;
      for (let px = x - 20 + shift; px < x + w + 20; px += 16)
        line(
          [
            [px - dir * 3, y + 3],
            [px, y + 5.5],
            [px - dir * 3, y + 8],
          ],
          '#c6e3e5',
          1.2
        );
      c.restore();
    }
    if (age >= 0 && age < 0.22 && !quiet && f.kind !== 'spikes') {
      const t = age / 0.22;
      for (let i = 0; i < 4; i++)
        ellipse(
          clamp(s.player.previousX, x, x + w) + (i - 1.5) * t * 20,
          y - 2 - Math.sin(t * Math.PI) * 5,
          0.8,
          0.8,
          p.accent +
            Math.round((1 - t) * 100)
              .toString(16)
              .padStart(2, '0')
        );
    }
    c.restore();
  }
  function explorer(s: GameState, camera: number, alpha: number, quiet: boolean) {
    const p = s.player,
      x = p.previousX + (p.x - p.previousX) * alpha,
      y = p.previousY + (p.y - p.previousY) * alpha - camera;
    if (p.standing !== null) ellipse(x, y + 3, 17, 3, '#091c2950');
    if (p.dashFor > 0 && !quiet)
      for (let j = 1; j < 4; j++) {
        c.save();
        c.globalAlpha = 0.12 * (4 - j);
        round(x - p.facing * j * 12 - 9, y - 30, 18, 25, 7, '#7acdc5');
        c.restore();
      }
    if (p.shield) {
      c.strokeStyle = '#a2e2dc88';
      c.lineWidth = 1.5;
      c.beginPath();
      c.ellipse(x, y - 20, 24, 28, 0, 0, Math.PI * 2);
      c.stroke();
    }
    c.save();
    c.translate(x, y);
    c.rotate(quiet ? 0 : clamp(p.vx / 300, -1, 1) * 0.075);
    const f = s.platforms.find((f) => f.id === p.standing),
      land = f?.touched === null || !f ? 1 : clamp((s.worldTime - f.touched) / 0.16, 0, 1);
    if (!quiet && land < 1) {
      const squash = Math.sin(land * Math.PI) * 0.1;
      c.scale(1 + squash, 1 - squash);
    }
    c.lineCap = 'round';
    c.lineJoin = 'round';
    const run = p.standing !== null && Math.abs(p.vx) > 20 ? Math.sin(s.worldTime * 26) * 4 : 0;
    line(
      [
        [-4, -10],
        [-5 - run, -2],
        [-8 - run, -1],
      ],
      '#152f40',
      5
    );
    line(
      [
        [4, -10],
        [5 + run, -3],
        [8 + run, -1],
      ],
      '#152f40',
      5
    );
    round(-10 - run, -3, 8, 4, 2, '#0a2231');
    round(4 + run, -3, 8, 4, 2, '#0a2231');
    round(-9, -27, 18, 18, 5, '#205360');
    round(-8, -26, 16, 16, 4, s.damageFor > 0 ? '#e4e7cc' : '#4aa8a2');
    round(-7, -25, 4, 14, 2, '#76c8b5');
    round(-7, -12, 14, 3, 1, '#c3a475');
    const arm = p.standing === null ? -27 : -15 + run * 0.5;
    line(
      [
        [-8, -23],
        [-13, arm],
        [-14, arm + 3],
      ],
      '#69b6ab',
      4
    );
    line(
      [
        [8, -23],
        [13, arm - run],
        [14, arm - run + 3],
      ],
      '#69b6ab',
      4
    );
    ellipse(-14, arm + 3, 2.8, 2.8, '#e2c293');
    ellipse(14, arm - run + 3, 2.8, 2.8, '#e2c293');
    round(-6, -36, 13, 12, 5, '#ddb98d');
    // Small scarf and backpack keep the silhouette readable while falling.
    path(
      [
        [-5, -26],
        [-11 - p.facing * 2, -23],
        [-16 - p.facing * 3, -26],
      ],
      '#d48a68'
    );
    round(p.facing > 0 ? -11 : 7, -24, 5, 13, 2, '#244c54');
    c.fillStyle = '#f0bf6e';
    c.beginPath();
    c.ellipse(0, -36, 11, 8, 0, Math.PI, Math.PI * 2);
    c.fill();
    round(-12, -37, 24, 4, 2, '#efc57d');
    round(-8, -42, 5, 4, 2, '#ffd28a');
    ellipse(p.facing * 6, -39, 3.4, 3.4, '#6e7062');
    ellipse(p.facing * 6, -39, 2, 2, '#fff3c6');
    ellipse(p.facing * 4, -31, 1.1, 1.3, '#25333b');
    line(
      [
        [p.facing * 2, -27],
        [p.facing * 5, -27],
      ],
      '#a7785e',
      0.8
    );
    c.restore();
  }
  function draw(s: GameState, alpha: number, quiet: boolean, text: Record<TextKey, string>) {
    const started = performance.now();
    c.setTransform(canvas.width / 420, 0, 0, canvas.height / 600, 0, 0);
    c.lineCap = 'round';
    c.lineJoin = 'round';
    const camera = s.previousCamera + (s.camera - s.previousCamera) * alpha,
      region = Math.min(4, Math.floor(s.floor / 20));
    const base = palettes[region],
      previous = palettes[Math.max(0, region - 1)];
    const atPracticeStart =
      s.options.mode === 'practice' && region === Math.floor((s.options.startFloor ?? 0) / 20);
    const depth = Math.max(
      s.floor,
      (s.player.previousY + (s.player.y - s.player.previousY) * alpha - 330) / 350
    );
    const blend = region && !atPracticeStart ? clamp((depth - region * 20) / 2, 0, 1) : 1;
    const palette = Object.fromEntries(
      Object.keys(base).map((k) => [
        k,
        mix(previous[k as keyof Palette], base[k as keyof Palette], blend),
      ])
    ) as Palette;
    scenery(s, camera, palette, region, quiet);
    const finish = s.platforms.find((f) => s.options.mode === 'trial' && f.row === 500);
    if (finish && finish.y - camera < 720) {
      const y = finish.y - camera;
      glow(210, y - 45, 115, '#f2d29a44');
      round(158, y - 90, 104, 90, 48, '#ffe2a91a');
      line(
        [
          [161, y - 3],
          [161, y - 48],
          [168, y - 75],
          [187, y - 89],
          [210, y - 94],
          [233, y - 89],
          [252, y - 75],
          [259, y - 48],
          [259, y - 3],
        ],
        '#e1bf84',
        3
      );
      c.font = '10px system-ui,sans-serif';
      c.textAlign = 'center';
      c.fillStyle = '#f3dba9';
      c.fillText(text.sanctuary, 210, y - 46);
    }
    visiblePlatforms = 0;
    for (const f of s.platforms)
      if (f.y - camera > -60 && f.y - camera < 650) {
        platform(f, camera, palette, s, quiet);
        visiblePlatforms++;
      }
    for (const item of s.pickups) {
      const y = item.y - camera + (quiet ? 0 : Math.sin(s.worldTime * 3 + item.id) * 2);
      if (y < 0 || y > 620) continue;
      glow(item.x, y, 24, '#c8e8d72a');
      ellipse(item.x, y, 12, 12, '#15343feb');
      if (item.kind === 'shield') {
        c.lineWidth = 1.5;
        path(
          [
            [item.x, y - 7],
            [item.x + 6, y - 4],
            [item.x + 5, y + 3],
            [item.x, y + 8],
            [item.x - 5, y + 3],
            [item.x - 6, y - 4],
          ],
          '#7fb3ad',
          '#c3e8dc'
        );
      } else {
        line(
          [
            [item.x - 5, y - 7],
            [item.x + 5, y - 7],
            [item.x + 4, y - 3],
            [item.x - 4, y + 3],
            [item.x - 5, y + 7],
            [item.x + 5, y + 7],
            [item.x + 4, y + 3],
            [item.x - 4, y - 3],
            [item.x - 5, y - 7],
          ],
          '#f0d299',
          1.5
        );
      }
    }
    explorer(s, camera, alpha, quiet);
    // Fixed ceiling teeth and a quiet bottom fade clearly mark both failure edges.
    c.fillStyle = '#112330';
    c.fillRect(0, 0, 420, 15);
    for (let x = 20; x < 400; x += 18)
      path(
        [
          [x, 14],
          [x + 7, 31],
          [x + 14, 14],
        ],
        '#bb8e84',
        '#dfb6a080'
      );
    line(
      [
        [22, 14],
        [398, 14],
      ],
      '#efc29188',
      2
    );
    const fade = c.createLinearGradient(0, 553, 0, 600);
    fade.addColorStop(0, '#08172500');
    fade.addColorStop(1, '#081725b0');
    c.fillStyle = fade;
    c.fillRect(0, 553, 420, 47);
    line(
      [
        [34, 596],
        [386, 596],
      ],
      '#dba29360',
      1
    );
    frames++;
    lastDrawMs = performance.now() - started;
  }
  return {
    resize,
    draw,
    stats: () => ({
      frames,
      lastDrawMs,
      dpr,
      width: canvas.width,
      height: canvas.height,
      visiblePlatforms,
    }),
  };
}
