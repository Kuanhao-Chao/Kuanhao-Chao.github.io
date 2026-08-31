/**
 * Browser controller for Genome Jumper: rendering, input, timing, audio, storage, and sharing.
 * Features dynamic Light/Dark theme palette synchronization and biological RNA Polymerase II / chromatin graphics.
 */
import {
  PHYSICS,
  VIEW_HEIGHT,
  WORLD_WIDTH,
  createGame,
  fire as engineFire,
  isJetpackActive,
  pause as enginePause,
  reset,
  setSteering,
  start as engineStart,
  step as engineStep,
  type GameState,
} from '../lib/genomeJumper';

interface GenomeJumperTestApi {
  state: () => GameState;
  start: () => void;
  restart: () => void;
  tick: (frames?: number) => void;
  steer: (direction: -1 | 0 | 1) => void;
  fire: () => boolean;
  pause: () => void;
  resume: () => void;
  endRun: () => void;
  share: () => Promise<void>;
}

declare global {
  interface Window {
    __genomeJumper?: GenomeJumperTestApi;
    __genomeJumperInstances?: number;
  }
}

export interface GenomeJumperController {
  destroy: () => void;
}

interface Palette {
  isDark: boolean;
  background: string;
  surface: string;
  ladderRail: string;
  ladderRung: string;
  ink: string;
  muted: string;
  rule: string;
  accent: string;
  accentDark: string;
  gemA: string;
  gemC: string;
  gemG: string;
  gemT: string;
  platformStaticBg: string;
  platformStaticBorder: string;
  platformMovingBg: string;
  platformMovingBorder: string;
  platformBreakBg: string;
  platformBreakBorder: string;
  platformDisappearBg: string;
  platformDisappearBorder: string;
  springCoil: string;
  enemyBg: string;
  enemyBorder: string;
  overlayBg: string;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  color: string;
  size: number;
}

const FIXED_STEP = 1 / 120;
const BEST_KEY = 'khc-genome-jumper-best';
const SOUND_KEY = 'khc-genome-jumper-sound';

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
    // Storage can be unavailable in private contexts.
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
  const isDark =
    typeof document !== 'undefined' &&
    document.documentElement.getAttribute('data-theme') === 'dark';

  if (isDark) {
    return {
      isDark: true,
      background: '#060d16',
      surface: '#0f172a',
      ladderRail: 'rgba(56, 189, 248, 0.15)',
      ladderRung: 'rgba(56, 189, 248, 0.08)',
      ink: '#f8fafc',
      muted: '#94a3b8',
      rule: '#1e293b',
      accent: '#10b981',
      accentDark: '#059669',
      gemA: '#10b981',
      gemC: '#38bdf8',
      gemG: '#f59e0b',
      gemT: '#a855f7',
      platformStaticBg: 'rgba(16, 185, 129, 0.12)',
      platformStaticBorder: '#10b981',
      platformMovingBg: 'rgba(56, 189, 248, 0.14)',
      platformMovingBorder: '#38bdf8',
      platformBreakBg: 'rgba(245, 158, 11, 0.14)',
      platformBreakBorder: '#f59e0b',
      platformDisappearBg: 'rgba(148, 163, 184, 0.12)',
      platformDisappearBorder: '#94a3b8',
      springCoil: '#fbbf24',
      enemyBg: 'rgba(244, 63, 94, 0.22)',
      enemyBorder: '#f43f5e',
      overlayBg: 'rgba(6, 13, 22, 0.90)',
    };
  }

  return {
    isDark: false,
    background: '#fafaf8',
    surface: '#ffffff',
    ladderRail: 'rgba(15, 23, 42, 0.09)',
    ladderRung: 'rgba(15, 23, 42, 0.06)',
    ink: '#0f172a',
    muted: '#64748b',
    rule: '#e5e4df',
    accent: '#059669',
    accentDark: '#047857',
    gemA: '#059669',
    gemC: '#0284c7',
    gemG: '#d97706',
    gemT: '#7c3aed',
    platformStaticBg: 'rgba(255, 255, 255, 0.95)',
    platformStaticBorder: '#059669',
    platformMovingBg: 'rgba(2, 132, 199, 0.12)',
    platformMovingBorder: '#0284c7',
    platformBreakBg: 'rgba(217, 119, 6, 0.12)',
    platformBreakBorder: '#d97706',
    platformDisappearBg: 'rgba(100, 116, 139, 0.12)',
    platformDisappearBorder: '#64748b',
    springCoil: '#d97706',
    enemyBg: 'rgba(225, 29, 72, 0.12)',
    enemyBorder: '#e11d48',
    overlayBg: 'rgba(250, 250, 248, 0.92)',
  };
}

export function initGenomeJumper(root: ParentNode = document): GenomeJumperController | null {
  const canvasEl = root.querySelector<HTMLCanvasElement>('[data-jumper-canvas]');
  if (!canvasEl || canvasEl.dataset.jumperReady === 'true') return null;
  const context = canvasEl.getContext('2d');
  if (!context) return null;
  canvasEl.dataset.jumperReady = 'true';
  const canvas = canvasEl;
  const ctx = context;

  const scoreEl = root.querySelector<HTMLElement>('[data-jumper-score]');
  const heightEl = root.querySelector<HTMLElement>('[data-jumper-height]');
  const bestEl = root.querySelector<HTMLElement>('[data-jumper-best]');
  const sequenceEl = root.querySelector<HTMLElement>('[data-jumper-sequence]');
  const statusEl = root.querySelector<HTMLElement>('[data-jumper-status]');
  const boostEl = root.querySelector<HTMLElement>('[data-jumper-boost]');
  const pauseBtn = root.querySelector<HTMLButtonElement>('[data-jumper-pause]');
  const restartBtn = root.querySelector<HTMLButtonElement>('[data-jumper-restart]');
  const fireBtn = root.querySelector<HTMLButtonElement>('[data-jumper-fire]');
  const soundBtn = root.querySelector<HTMLButtonElement>('[data-jumper-sound]');
  const shareBtn = root.querySelector<HTMLButtonElement>('[data-jumper-share]');

  const seedValue = new URLSearchParams(location.search).get('seed');
  const fixedSeed = seedValue === null ? null : Number(seedValue) >>> 0;
  const freshSeed = () => fixedSeed ?? (Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0;
  const state = createGame(freshSeed());
  let best = readNumber(BEST_KEY);
  let palette = readPalette();
  let soundEnabled = readSoundPreference();
  let shareMessage = '';
  let reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const particles: Particle[] = [];
  let animTick = 0;

  // Audio Context synthesis
  let audioContext: AudioContext | null = null;
  function ensureAudio() {
    if (!soundEnabled) return;
    if (!audioContext && typeof window !== 'undefined') {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) audioContext = new AudioCtx();
    }
    if (audioContext && audioContext.state === 'suspended') {
      void audioContext.resume();
    }
  }

  function soundForEvent(event: GameState['lastEvent']) {
    if (!soundEnabled || !audioContext) return;
    const now = audioContext.currentTime;

    if (event === 'jump') {
      const osc = audioContext.createOscillator();
      const gain = audioContext.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(260, now);
      osc.frequency.exponentialRampToValueAtTime(520, now + 0.08);
      gain.gain.setValueAtTime(0.12, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);
      osc.connect(gain);
      gain.connect(audioContext.destination);
      osc.start(now);
      osc.stop(now + 0.09);
    } else if (event === 'spring') {
      const osc = audioContext.createOscillator();
      const gain = audioContext.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(320, now);
      osc.frequency.exponentialRampToValueAtTime(880, now + 0.15);
      gain.gain.setValueAtTime(0.15, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);
      osc.connect(gain);
      gain.connect(audioContext.destination);
      osc.start(now);
      osc.stop(now + 0.16);
    } else if (event === 'jetpack') {
      const osc = audioContext.createOscillator();
      const gain = audioContext.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(440, now);
      osc.frequency.linearRampToValueAtTime(880, now + 0.2);
      gain.gain.setValueAtTime(0.18, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
      osc.connect(gain);
      gain.connect(audioContext.destination);
      osc.start(now);
      osc.stop(now + 0.22);
    } else if (event === 'collect') {
      const notes = [523.25, 659.25, 783.99];
      const freq = notes[state.sequence.length % notes.length];
      const osc = audioContext.createOscillator();
      const gain = audioContext.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now);
      gain.gain.setValueAtTime(0.12, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
      osc.connect(gain);
      gain.connect(audioContext.destination);
      osc.start(now);
      osc.stop(now + 0.1);
    } else if (event === 'shot') {
      const osc = audioContext.createOscillator();
      const gain = audioContext.createGain();
      osc.type = 'square';
      osc.frequency.setValueAtTime(780, now);
      osc.frequency.exponentialRampToValueAtTime(220, now + 0.08);
      gain.gain.setValueAtTime(0.1, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
      osc.connect(gain);
      gain.connect(audioContext.destination);
      osc.start(now);
      osc.stop(now + 0.08);
    } else if (event === 'enemy') {
      const osc = audioContext.createOscillator();
      const gain = audioContext.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(220, now);
      osc.frequency.exponentialRampToValueAtTime(110, now + 0.15);
      gain.gain.setValueAtTime(0.18, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);
      osc.connect(gain);
      gain.connect(audioContext.destination);
      osc.start(now);
      osc.stop(now + 0.16);
    } else if (event === 'over') {
      const osc = audioContext.createOscillator();
      const gain = audioContext.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(140, now);
      osc.frequency.linearRampToValueAtTime(40, now + 0.35);
      gain.gain.setValueAtTime(0.2, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.38);
      osc.connect(gain);
      gain.connect(audioContext.destination);
      osc.start(now);
      osc.stop(now + 0.38);
    }
  }

  // Canvas dimensions are CSS pixels; the backing store is scaled for sharpness.
  let width = 420;
  let height = 600;
  let dpr = 1;
  const resizeObserver = new ResizeObserver(resize);

  function resize() {
    const rect = canvas.getBoundingClientRect();
    width = Math.max(1, rect.width);
    height = Math.max(1, rect.height);
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    render();
  }

  const sx = (worldX: number) => (worldX / WORLD_WIDTH) * width;
  const sy = (worldY: number) => height - ((worldY - state.cameraY) / VIEW_HEIGHT) * height;
  const scaleX = () => width / WORLD_WIDTH;
  const scaleY = () => height / VIEW_HEIGHT;

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

  function drawBackground() {
    ctx.fillStyle = palette.background;
    ctx.fillRect(0, 0, width, height);

    // Dynamic procedural chromatin double helix rails climbing both edges
    ctx.save();
    const phase = (((state.cameraY * scaleY()) % 60) + 60) % 60;
    const railLeft = width * 0.07;
    const railRight = width * 0.93;

    // Outer double-helix backbone rails
    ctx.strokeStyle = palette.ladderRail;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(railLeft, 0);
    ctx.lineTo(railLeft, height);
    ctx.moveTo(railRight, 0);
    ctx.lineTo(railRight, height);
    ctx.stroke();

    // Base pair ladder rungs with subtle sine wave oscillation
    ctx.strokeStyle = palette.ladderRung;
    ctx.lineWidth = 1.2;
    for (let y = phase - 60; y < height + 60; y += 30) {
      const wave = Math.sin((y + animTick * 12) * 0.05) * 8;
      ctx.beginPath();
      ctx.moveTo(railLeft, y);
      ctx.lineTo(railLeft + 24 + wave, y);
      ctx.moveTo(railRight - 24 - wave, y);
      ctx.lineTo(railRight, y);
      ctx.stroke();

      // Histone octamer beads along rails
      if (Math.round(y / 30) % 3 === 0) {
        ctx.fillStyle = palette.ladderRail;
        ctx.beginPath();
        ctx.arc(railLeft, y, 3, 0, Math.PI * 2);
        ctx.arc(railRight, y, 3, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  function drawPlatform(platform: GameState['platforms'][number]) {
    if (platform.removed) return;
    if (platform.disappearAt !== null && state.time >= platform.disappearAt) return;
    const x = sx(platform.x);
    const y = sy(platform.y);
    const w = platform.width * scaleX();
    const h = Math.max(8, 10 * scaleY());
    if (y < -30 || y > height + 30) return;

    ctx.save();
    if (platform.disappearAt !== null) {
      ctx.globalAlpha = Math.max(0.12, (platform.disappearAt - state.time) / 0.48);
    }

    if (platform.kind === 'static') {
      // 1. Stable Euchromatin Platform: Double-banded DNA phosphodiester backbone
      ctx.fillStyle = palette.platformStaticBg;
      ctx.strokeStyle = palette.platformStaticBorder;
      ctx.lineWidth = 2;
      roundedRect(x, y - h / 2, w, h, 4);
      ctx.fill();
      ctx.stroke();

      // Watson-Crick hydrogen bonding notches
      ctx.strokeStyle = palette.platformStaticBorder;
      ctx.lineWidth = 1;
      const notchStep = 12;
      for (let nx = x + 10; nx < x + w - 8; nx += notchStep) {
        ctx.beginPath();
        ctx.moveTo(nx, y - h / 2 + 2);
        ctx.lineTo(nx, y + h / 2 - 2);
        ctx.stroke();
      }
    } else if (platform.kind === 'moving') {
      // 2. Moving Heterochromatin Platform: Sliding rail with directional kinetic chevrons
      ctx.fillStyle = palette.platformMovingBg;
      ctx.strokeStyle = palette.platformMovingBorder;
      ctx.lineWidth = 2;
      roundedRect(x, y - h / 2, w, h, 4);
      ctx.fill();
      ctx.stroke();

      // Kinetic directional thruster chevrons
      ctx.fillStyle = palette.platformMovingBorder;
      const dir = platform.vx >= 0 ? 1 : -1;
      const cx = x + w / 2;
      ctx.beginPath();
      ctx.moveTo(cx + dir * 10, y);
      ctx.lineTo(cx - dir * 2, y - 4);
      ctx.lineTo(cx - dir * 2, y + 4);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(cx + dir * 2, y);
      ctx.lineTo(cx - dir * 10, y - 4);
      ctx.lineTo(cx - dir * 10, y + 4);
      ctx.closePath();
      ctx.fill();
    } else if (platform.kind === 'breakable') {
      // 3. Breakable Fragile Site Platform: Fractured crystal lattice
      ctx.fillStyle = palette.platformBreakBg;
      ctx.strokeStyle = palette.platformBreakBorder;
      ctx.lineWidth = 1.8;
      roundedRect(x, y - h / 2, w, h, 4);
      ctx.fill();
      ctx.stroke();

      // Jagged fracture stress lines
      ctx.strokeStyle = palette.platformBreakBorder;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(x + w * 0.3, y - h / 2);
      ctx.lineTo(x + w * 0.45, y + 1);
      ctx.lineTo(x + w * 0.38, y + h / 2);
      ctx.moveTo(x + w * 0.65, y - h / 2);
      ctx.lineTo(x + w * 0.58, y);
      ctx.lineTo(x + w * 0.72, y + h / 2);
      ctx.stroke();
    } else if (platform.kind === 'disappearing') {
      // 4. Disappearing Transcription Bubble: Phase-dash translucent contour
      ctx.fillStyle = palette.platformDisappearBg;
      ctx.strokeStyle = palette.platformDisappearBorder;
      ctx.lineWidth = 1.8;
      ctx.setLineDash([5, 4]);
      roundedRect(x, y - h / 2, w, h, 4);
      ctx.fill();
      ctx.stroke();
      ctx.setLineDash([]);
    }

    if (platform.spring) drawSpring(x + w / 2, y - h / 2);
    ctx.restore();
  }

  function drawSpring(x: number, platformY: number) {
    ctx.save();
    // 3D Topoisomerase Unwinding Spring
    ctx.strokeStyle = palette.springCoil;
    ctx.lineWidth = 2.4;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // Base bracket
    ctx.fillStyle = palette.springCoil;
    ctx.fillRect(x - 8, platformY - 2, 16, 2);

    // Coiling spring tiers
    ctx.beginPath();
    ctx.moveTo(x - 6, platformY - 2);
    ctx.lineTo(x + 6, platformY - 6);
    ctx.lineTo(x - 6, platformY - 11);
    ctx.lineTo(x + 6, platformY - 16);
    ctx.lineTo(x - 6, platformY - 21);
    ctx.lineTo(x + 6, platformY - 25);
    ctx.stroke();

    // Top kinetic cap
    ctx.beginPath();
    ctx.arc(x, platformY - 26, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawCollectible(item: GameState['collectibles'][number]) {
    if (item.collected) return;
    const x = sx(item.x);
    const y = sy(item.y);
    if (y < -30 || y > height + 30) return;
    const radius = Math.max(11, 14 * scaleX());

    const gemColor =
      item.base === 'A'
        ? palette.gemA
        : item.base === 'C'
          ? palette.gemC
          : item.base === 'G'
            ? palette.gemG
            : palette.gemT;

    ctx.save();
    // Ambient gem glow
    ctx.shadowColor = gemColor;
    ctx.shadowBlur = palette.isDark ? 12 : 5;

    // Diamond gem polygon
    ctx.fillStyle = gemColor;
    ctx.beginPath();
    ctx.moveTo(x, y - radius);
    ctx.lineTo(x + radius * 0.9, y);
    ctx.lineTo(x, y + radius);
    ctx.lineTo(x - radius * 0.9, y);
    ctx.closePath();
    ctx.fill();

    // Inner bright facet
    ctx.fillStyle = palette.surface;
    ctx.beginPath();
    ctx.moveTo(x, y - radius * 0.7);
    ctx.lineTo(x + radius * 0.6, y);
    ctx.lineTo(x, y + radius * 0.7);
    ctx.lineTo(x - radius * 0.6, y);
    ctx.closePath();
    ctx.fill();

    ctx.shadowBlur = 0;

    // Base nucleotide letter
    ctx.fillStyle = gemColor;
    ctx.font = `bold ${Math.round(radius * 1.15)}px monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(item.base, x, y);
    ctx.restore();
  }

  function drawPowerUp(item: GameState['powerUps'][number]) {
    if (item.collected) return;
    const x = sx(item.x);
    const y = sy(item.y);
    if (y < -35 || y > height + 35) return;

    ctx.save();
    ctx.translate(x, y);

    // P-TEFb Elongation Jetpack: High-tech dual-cylinder booster
    ctx.fillStyle = '#0284c7';
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 1.5;

    // Left & Right Cylinders
    roundedRect(-12, -14, 10, 22, 4);
    ctx.fill();
    ctx.stroke();
    roundedRect(2, -14, 10, 22, 4);
    ctx.fill();
    ctx.stroke();

    // Center bridge
    ctx.fillStyle = '#f59e0b';
    ctx.fillRect(-4, -6, 8, 8);

    // Exhaust nozzles
    ctx.fillStyle = '#64748b';
    ctx.fillRect(-10, 8, 6, 4);
    ctx.fillRect(4, 8, 6, 4);

    // Animated idle thruster flame
    const flameY = Math.sin(animTick * 8) * 3;
    ctx.fillStyle = '#fbbf24';
    ctx.beginPath();
    ctx.moveTo(-9, 12);
    ctx.lineTo(-7, 18 + flameY);
    ctx.lineTo(-5, 12);
    ctx.moveTo(5, 12);
    ctx.lineTo(7, 18 + flameY);
    ctx.lineTo(9, 12);
    ctx.fill();

    ctx.restore();
  }

  function drawEnemy(enemy: GameState['enemies'][number]) {
    if (!enemy.alive) return;
    const x = sx(enemy.x);
    const y = sy(enemy.y);
    if (y < -40 || y > height + 40) return;
    const radius = enemy.width * scaleX() * 0.44;

    ctx.save();
    ctx.translate(x, y);

    // Spiked Retrotransposon Mutation Core
    ctx.shadowColor = palette.enemyBorder;
    ctx.shadowBlur = palette.isDark ? 14 : 6;
    ctx.fillStyle = palette.enemyBg;
    ctx.strokeStyle = palette.enemyBorder;
    ctx.lineWidth = 2;

    ctx.beginPath();
    const spikes = 12;
    for (let i = 0; i < spikes * 2; i++) {
      const angle = (i / (spikes * 2)) * Math.PI * 2;
      const r = i % 2 === 0 ? radius * 1.3 : radius * 0.75;
      const px = Math.cos(angle) * r;
      const py = Math.sin(angle) * r;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Glowing nucleolytic eye cores
    ctx.fillStyle = palette.enemyBorder;
    ctx.beginPath();
    ctx.arc(-radius * 0.35, -1, 2.5, 0, Math.PI * 2);
    ctx.arc(radius * 0.35, -1, 2.5, 0, Math.PI * 2);
    ctx.fill();

    // Central mutation lesion symbol
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 9px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('Δ', 0, 1);

    ctx.restore();
  }

  function drawProjectile(projectile: GameState['projectiles'][number]) {
    if (!projectile.alive) return;
    const x = sx(projectile.x);
    const y = sy(projectile.y);

    ctx.save();
    // Luminous laser cleavage bolt
    ctx.strokeStyle = palette.accent;
    ctx.shadowColor = palette.accent;
    ctx.shadowBlur = palette.isDark ? 12 : 5;
    ctx.lineWidth = Math.max(3, 4 * scaleX());
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x, y + 9);
    ctx.lineTo(x, y - 9);
    ctx.stroke();

    // White core laser
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x, y + 5);
    ctx.lineTo(x, y - 5);
    ctx.stroke();
    ctx.restore();
  }

  function drawPlayerAt(worldX: number) {
    const x = sx(worldX);
    const feet = sy(state.player.y);
    const w = state.player.width * scaleX();
    const h = state.player.height * scaleY();
    ctx.save();
    ctx.translate(x, feet - h / 2);
    const tilt = Math.max(-0.14, Math.min(0.14, state.player.vx / 1400));
    ctx.rotate(tilt);

    // Squash and stretch based on vertical velocity
    const vy = state.player.vy;
    const stretchY = Math.max(0.85, Math.min(1.2, 1 + vy * 0.00025));
    const stretchX = 1 / stretchY;
    ctx.scale(stretchX, stretchY);

    const hasJetpack = isJetpackActive(state);

    // 1. Protective Transcription Bubble Aura during Jetpack
    if (hasJetpack) {
      ctx.shadowColor = palette.accent;
      ctx.shadowBlur = 18;
      ctx.fillStyle = 'rgba(16, 185, 129, 0.16)';
      ctx.strokeStyle = '#10b981';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 3]);
      ctx.beginPath();
      ctx.arc(0, 0, w * 0.95, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.shadowBlur = 0;

      // Jetpack Thruster Flame Emitters
      const flameH = 16 + Math.sin(animTick * 12) * 6;
      ctx.fillStyle = '#fbbf24';
      ctx.beginPath();
      ctx.moveTo(-w * 0.35, h * 0.35);
      ctx.lineTo(-w * 0.25, h * 0.35 + flameH);
      ctx.lineTo(-w * 0.15, h * 0.35);
      ctx.moveTo(w * 0.15, h * 0.35);
      ctx.lineTo(w * 0.25, h * 0.35 + flameH);
      ctx.lineTo(w * 0.35, h * 0.35);
      ctx.fill();
    }

    // 2. RNA Polymerase II Main Subunit Body
    ctx.shadowColor = palette.accent;
    ctx.shadowBlur = palette.isDark ? 12 : 4;
    ctx.fillStyle = palette.accent;
    ctx.strokeStyle = palette.accentDark;
    ctx.lineWidth = 1.8;
    roundedRect(-w / 2, -h / 2, w, h, w * 0.32);
    ctx.fill();
    ctx.stroke();
    ctx.shadowBlur = 0;

    // 3. Catalytic Active Site / Transcription Cleft
    ctx.fillStyle = '#fef08a';
    ctx.beginPath();
    ctx.arc(0, -h * 0.05, 3.5, 0, Math.PI * 2);
    ctx.fill();

    // 4. Double-helix emblem on Polymerase Body
    ctx.strokeStyle = palette.surface;
    ctx.globalAlpha = 0.9;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(-w * 0.22, h * 0.18);
    ctx.bezierCurveTo(w * 0.24, 0, -w * 0.24, -h * 0.12, w * 0.22, -h * 0.26);
    ctx.moveTo(w * 0.22, h * 0.18);
    ctx.bezierCurveTo(-w * 0.24, 0, w * 0.24, -h * 0.12, -w * 0.22, -h * 0.26);
    ctx.stroke();
    ctx.globalAlpha = 1;

    // 5. Friendly Arcade Eye Subunits
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(-w * 0.18, -h * 0.24, 2.8, 0, Math.PI * 2);
    ctx.arc(w * 0.18, -h * 0.24, 2.8, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = palette.accentDark;
    ctx.beginPath();
    const lookX = state.steering * 1.2;
    ctx.arc(-w * 0.18 + lookX, -h * 0.24, 1.4, 0, Math.PI * 2);
    ctx.arc(w * 0.18 + lookX, -h * 0.24, 1.4, 0, Math.PI * 2);
    ctx.fill();

    // 6. Trailing Nascent mRNA Transcript Tail (5'-to-3')
    if (state.sequence.length > 0) {
      ctx.strokeStyle = '#f59e0b';
      ctx.lineWidth = 2;
      ctx.beginPath();
      const wave = Math.sin(animTick * 6) * 4;
      ctx.moveTo(-w * 0.25, h * 0.2);
      ctx.quadraticCurveTo(-w * 0.65, h * 0.35 + wave, -w * 0.85, h * 0.5);
      ctx.stroke();

      ctx.fillStyle = '#f59e0b';
      ctx.beginPath();
      ctx.arc(-w * 0.85, h * 0.5, 2.2, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }

  function drawPlayer() {
    drawPlayerAt(state.player.x);
    const half = state.player.width / 2;
    if (state.player.x < half) drawPlayerAt(state.player.x + WORLD_WIDTH);
    if (state.player.x > WORLD_WIDTH - half) drawPlayerAt(state.player.x - WORLD_WIDTH);
  }

  function drawParticles() {
    for (const particle of particles) {
      const alpha = Math.max(0, particle.life / particle.maxLife);
      ctx.globalAlpha = alpha;
      ctx.fillStyle = particle.color;
      ctx.beginPath();
      ctx.arc(sx(particle.x), sy(particle.y), particle.size || 2.2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function drawOverlay() {
    if (state.status === 'playing') return;
    ctx.save();
    ctx.fillStyle = palette.overlayBg;
    roundedRect(width * 0.08, height * 0.34, width * 0.84, height * 0.28, 10);
    ctx.fill();

    ctx.strokeStyle = palette.rule;
    ctx.lineWidth = 1;
    roundedRect(width * 0.08, height * 0.34, width * 0.84, height * 0.28, 10);
    ctx.stroke();

    ctx.fillStyle = palette.ink;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `bold ${Math.max(20, Math.round(width * 0.062))}px sans-serif`;
    const title =
      state.status === 'ready'
        ? 'Ready to Transcribe?'
        : state.status === 'paused'
          ? 'PAUSED'
          : 'RUN COMPLETE';
    ctx.fillText(title, width / 2, height * 0.42);

    ctx.fillStyle = palette.muted;
    ctx.font = `500 ${Math.max(13, Math.round(width * 0.036))}px monospace`;
    const hint =
      state.status === 'over'
        ? `Height: ${state.height}m · Score: ${state.score}`
        : state.status === 'paused'
          ? 'Press P or Pause to resume'
          : 'Tap board or press Enter / Space to jump';
    ctx.fillText(hint, width / 2, height * 0.49);

    if (state.status === 'over') {
      ctx.fillStyle = palette.accent;
      ctx.font = 'bold 12px monospace';
      ctx.fillText('Press Enter or Restart to climb again', width / 2, height * 0.55);
    }
    ctx.restore();
  }

  function render() {
    animTick += 0.04;
    drawBackground();
    for (const platform of state.platforms) drawPlatform(platform);
    for (const item of state.collectibles) drawCollectible(item);
    for (const item of state.powerUps) drawPowerUp(item);
    for (const enemy of state.enemies) drawEnemy(enemy);
    for (const projectile of state.projectiles) drawProjectile(projectile);
    drawPlayer();
    drawParticles();
    drawOverlay();
  }

  function spawnParticles(event: GameState['lastEvent']) {
    if (reducedMotion || event === 'none' || event === 'shot') return;
    const count = event === 'jetpack' ? 16 : event === 'enemy' ? 14 : event === 'collect' ? 9 : 6;
    const color =
      event === 'collect'
        ? palette.gemG
        : event === 'enemy'
          ? palette.enemyBorder
          : event === 'spring'
            ? palette.springCoil
            : palette.accent;

    for (let i = 0; i < count; i++) {
      const life = 0.3 + Math.random() * 0.35;
      particles.push({
        x: state.player.x,
        y: state.player.y + state.player.height * 0.25,
        vx: (Math.random() * 2 - 1) * 85,
        vy: (Math.random() * 2 - 0.4) * 110,
        life,
        maxLife: life,
        color,
        size: 1.8 + Math.random() * 2.4,
      });
    }
  }

  function updateParticles(dt: number) {
    for (const particle of particles) {
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
      particle.vy += PHYSICS.gravity * 0.12 * dt;
      particle.life -= dt;
    }
    for (let i = particles.length - 1; i >= 0; i--) {
      if (particles[i].life <= 0) particles.splice(i, 1);
    }
  }

  // ---- HUD and state ----------------------------------------------------
  function statusMessage(): string {
    if (shareMessage) return shareMessage;
    if (state.status === 'ready') return 'Tap the board or press Enter to start';
    if (state.status === 'paused') return 'Paused — press P, Escape, or Pause to resume';
    if (state.status === 'over') return `Run complete — ${state.height} m, ${state.score} points`;
    if (isJetpackActive(state)) return 'P-TEFb Jetpack active — mutation contact is safe';
    return 'Climbing chromatin — steer, synthesize mRNA sequence, clear mutations';
  }

  function updateHud() {
    if (scoreEl) scoreEl.textContent = state.score.toLocaleString('en-US');
    if (heightEl) heightEl.textContent = `${state.height} m`;
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
    if (boostEl) {
      boostEl.textContent = isJetpackActive(state)
        ? `P-TEFb Boost ${Math.max(0, state.jetpackUntil - state.time).toFixed(1)} s`
        : '';
    }
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

  function begin() {
    shareMessage = '';
    ensureAudio();
    engineStart(state);
    accumulator = 0;
    lastFrame = 0;
    updateHud();
    render();
  }

  function restart() {
    shareMessage = '';
    particles.length = 0;
    reset(state, freshSeed());
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
    const fired = engineFire(state);
    if (fired) {
      soundForEvent('shot');
      updateHud();
      render();
    }
    return fired;
  }

  async function shareResult() {
    if (state.status !== 'over') return;
    const url = new URL('/games/genome-jumper/', location.origin).href;
    const text = `I climbed ${state.height} m and scored ${state.score.toLocaleString('en-US')} points in Genome Jumper.`;
    try {
      if (navigator.share) {
        await navigator.share({ title: 'Genome Jumper', text, url });
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
    engineStep(state, FIXED_STEP);
    updateParticles(FIXED_STEP);
    if (state.lastEvent !== 'none') {
      soundForEvent(state.lastEvent);
      spawnParticles(state.lastEvent);
    }
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
  const isInteractive = (target: EventTarget | null) =>
    target instanceof HTMLElement &&
    Boolean(target.closest('a[href], button, input, select, textarea, [contenteditable="true"]'));

  function syncKeyboardSteering() {
    const left = pressed.has('ArrowLeft') || pressed.has('a');
    const right = pressed.has('ArrowRight') || pressed.has('d');
    setSteering(state, left === right ? 0 : left ? -1 : 1);
  }

  function onKeyDown(event: KeyboardEvent) {
    if (isInteractive(event.target)) return;
    const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
    if (key === 'ArrowLeft' || key === 'ArrowRight' || key === 'a' || key === 'd') {
      event.preventDefault();
      pressed.add(key);
      if (state.status === 'ready') begin();
      syncKeyboardSteering();
      return;
    }
    if (key === 'Enter') {
      event.preventDefault();
      if (state.status === 'over') restart();
      else if (state.status === 'ready') begin();
      return;
    }
    if (key === ' ' || key === 'f') {
      event.preventDefault();
      if (state.status === 'ready') begin();
      else if (state.status === 'playing') shoot();
      return;
    }
    if (key === 'p' || key === 'Escape') {
      event.preventDefault();
      togglePause();
    }
  }

  function onKeyUp(event: KeyboardEvent) {
    const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
    if (!pressed.has(key)) return;
    pressed.delete(key);
    syncKeyboardSteering();
  }

  let activePointer: number | null = null;

  function steerFromPointer(clientX: number) {
    const rect = canvas.getBoundingClientRect();
    const normalized = (clientX - rect.left) / rect.width;
    setSteering(state, normalized < 0.46 ? -1 : normalized > 0.54 ? 1 : 0);
  }

  function onPointerDown(event: PointerEvent) {
    if (activePointer !== null) return;
    activePointer = event.pointerId;
    try {
      canvas.setPointerCapture(event.pointerId);
    } catch {
      // Synthetic events guard
    }
    if (state.status === 'ready') begin();
    else if (state.status === 'over') restart();
    else if (state.status === 'paused') begin();
    steerFromPointer(event.clientX);
  }

  function onPointerMove(event: PointerEvent) {
    if (event.pointerId !== activePointer) return;
    steerFromPointer(event.clientX);
  }

  function onPointerEnd(event: PointerEvent) {
    if (event.pointerId !== activePointer) return;
    try {
      if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
    } catch {
      // Guard
    }
    activePointer = null;
    setSteering(state, 0);
  }

  const onPause = () => togglePause();
  const onRestart = () => restart();
  const onFire = () => shoot();
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
    render();
    updateHud();
  };
  const onVisibility = () => {
    if (document.hidden && state.status === 'playing') {
      enginePause(state);
      updateHud();
      render();
    }
  };
  const onBlur = () => {
    if (state.status === 'playing') {
      enginePause(state);
      pressed.clear();
      setSteering(state, 0);
      updateHud();
      render();
    }
  };
  const motionQuery = matchMedia('(prefers-reduced-motion: reduce)');
  const onMotion = () => {
    reducedMotion = motionQuery.matches;
    if (reducedMotion) particles.length = 0;
  };

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', onBlur);
  document.addEventListener('visibilitychange', onVisibility);
  document.addEventListener('khc:theme-change', onTheme);
  motionQuery.addEventListener('change', onMotion);
  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerup', onPointerEnd);
  canvas.addEventListener('pointercancel', onPointerEnd);
  pauseBtn?.addEventListener('click', onPause);
  restartBtn?.addEventListener('click', onRestart);
  fireBtn?.addEventListener('click', onFire);
  soundBtn?.addEventListener('click', onSound);
  shareBtn?.addEventListener('click', onShare);
  resizeObserver.observe(canvas);

  resize();
  updateHud();
  animationFrame = requestAnimationFrame(frame);

  window.__genomeJumperInstances = (window.__genomeJumperInstances ?? 0) + 1;
  window.__genomeJumper = {
    state: () => state,
    start: () => begin(),
    restart,
    tick: (frames = 1) => {
      for (let i = 0; i < Math.max(1, frames); i++) simulationTick();
      render();
      updateHud();
    },
    steer: (direction) => setSteering(state, direction),
    fire: shoot,
    pause: () => {
      enginePause(state);
      updateHud();
      render();
    },
    resume: begin,
    endRun: () => {
      state.jetpackUntil = 0;
      state.cameraY = Math.max(500, state.cameraY);
      state.player.y = state.cameraY - state.player.height - 40;
      state.player.vy = PHYSICS.terminalVelocity;
      simulationTick();
      if (state.status !== 'over') {
        state.status = 'over';
        state.steering = 0;
        state.lastEvent = 'over';
      }
      recordBest();
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
    motionQuery.removeEventListener('change', onMotion);
    canvas.removeEventListener('pointerdown', onPointerDown);
    canvas.removeEventListener('pointermove', onPointerMove);
    canvas.removeEventListener('pointerup', onPointerEnd);
    canvas.removeEventListener('pointercancel', onPointerEnd);
    pauseBtn?.removeEventListener('click', onPause);
    restartBtn?.removeEventListener('click', onRestart);
    fireBtn?.removeEventListener('click', onFire);
    soundBtn?.removeEventListener('click', onSound);
    shareBtn?.removeEventListener('click', onShare);
    if (audioContext) void audioContext.close();
    delete canvas.dataset.jumperReady;
    window.__genomeJumperInstances = Math.max(0, (window.__genomeJumperInstances ?? 1) - 1);
    if (window.__genomeJumperInstances === 0) delete window.__genomeJumper;
  }

  return { destroy };
}
