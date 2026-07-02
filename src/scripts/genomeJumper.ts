/** Browser controller for Genome Jumper: rendering, input, timing, audio, storage, and sharing. */
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

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  color: string;
}

const FIXED_STEP = 1 / 120;
const BEST_KEY = 'khc-genome-jumper-best';
const SOUND_KEY = 'khc-genome-jumper-sound';

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
    // Storage can be unavailable in private contexts. The current run still works.
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
    ctx.fillStyle = palette.surface;
    ctx.fillRect(0, 0, width, height);

    // Restrained genomic ladder: it anchors the game in the site's visual language
    // without turning the playfield into a high-contrast grid.
    ctx.save();
    ctx.strokeStyle = palette.rule;
    ctx.fillStyle = palette.rule;
    ctx.globalAlpha = 0.42;
    ctx.lineWidth = 1;
    const phase = (((state.cameraY * scaleY()) % 48) + 48) % 48;
    for (let y = phase - 48; y < height + 48; y += 48) {
      ctx.beginPath();
      ctx.moveTo(width * 0.08, y);
      ctx.lineTo(width * 0.92, y);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(width * 0.08, y, 1.6, 0, Math.PI * 2);
      ctx.arc(width * 0.92, y, 1.6, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawPlatform(platform: GameState['platforms'][number]) {
    if (platform.removed) return;
    if (platform.disappearAt !== null && state.time >= platform.disappearAt) return;
    const x = sx(platform.x);
    const y = sy(platform.y);
    const w = platform.width * scaleX();
    const h = Math.max(7, 9 * scaleY());
    if (y < -30 || y > height + 30) return;
    ctx.save();
    if (platform.disappearAt !== null) {
      ctx.globalAlpha = Math.max(0.12, (platform.disappearAt - state.time) / 0.48);
    }
    ctx.fillStyle = platform.kind === 'breakable' ? palette.warmBg : palette.background;
    ctx.strokeStyle = platform.kind === 'breakable' ? palette.warmBorder : palette.accent;
    ctx.lineWidth = Math.max(1.2, scaleX() * 1.5);
    roundedRect(x, y - h / 2, w, h, 3);
    ctx.fill();
    ctx.stroke();

    if (platform.kind === 'moving') {
      ctx.fillStyle = palette.accent;
      ctx.globalAlpha *= 0.65;
      const direction = platform.vx >= 0 ? 1 : -1;
      ctx.beginPath();
      ctx.moveTo(x + w / 2 + direction * 8, y);
      ctx.lineTo(x + w / 2 - direction * 2, y - 4);
      ctx.lineTo(x + w / 2 - direction * 2, y + 4);
      ctx.closePath();
      ctx.fill();
    } else if (platform.kind === 'breakable') {
      ctx.strokeStyle = palette.warm;
      ctx.beginPath();
      ctx.moveTo(x + w * 0.42, y - h / 2);
      ctx.lineTo(x + w * 0.48, y + h / 2);
      ctx.lineTo(x + w * 0.56, y - h / 2);
      ctx.stroke();
    } else if (platform.kind === 'disappearing') {
      ctx.setLineDash([5, 4]);
      ctx.strokeStyle = palette.muted;
      ctx.strokeRect(x + 4, y - h / 2 + 2, Math.max(0, w - 8), Math.max(0, h - 4));
    }

    if (platform.spring) drawSpring(x + w / 2, y - h / 2);
    ctx.restore();
  }

  function drawSpring(x: number, platformY: number) {
    ctx.save();
    ctx.strokeStyle = palette.warm;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x - 10, platformY);
    ctx.lineTo(x + 8, platformY - 5);
    ctx.lineTo(x - 8, platformY - 10);
    ctx.lineTo(x + 7, platformY - 15);
    ctx.lineTo(x - 6, platformY - 20);
    ctx.stroke();
    ctx.restore();
  }

  function drawCollectible(item: GameState['collectibles'][number]) {
    if (item.collected) return;
    const x = sx(item.x);
    const y = sy(item.y);
    if (y < -30 || y > height + 30) return;
    const radius = Math.max(10, 13 * scaleX());
    ctx.fillStyle = palette.warmBg;
    ctx.strokeStyle = palette.warmBorder;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = palette.warm;
    ctx.font = `600 ${Math.round(radius * 1.15)}px ${cssVar('--font-display', 'system-ui')}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(item.base, x, y + 0.5);
  }

  function drawPowerUp(item: GameState['powerUps'][number]) {
    if (item.collected) return;
    const x = sx(item.x);
    const y = sy(item.y);
    if (y < -35 || y > height + 35) return;
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = palette.accent;
    ctx.strokeStyle = palette.accentDark;
    ctx.lineWidth = 1.5;
    roundedRect(-10, -15, 20, 25, 5);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = palette.warm;
    ctx.beginPath();
    ctx.moveTo(-7, 10);
    ctx.lineTo(-2, 20);
    ctx.lineTo(1, 10);
    ctx.moveTo(3, 10);
    ctx.lineTo(8, 20);
    ctx.lineTo(9, 10);
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
    ctx.fillStyle = palette.warmBg;
    ctx.strokeStyle = palette.warm;
    ctx.lineWidth = 1.7;
    ctx.beginPath();
    for (let i = 0; i < 16; i++) {
      const angle = (i / 16) * Math.PI * 2;
      const r = i % 2 === 0 ? radius * 1.25 : radius;
      const px = Math.cos(angle) * r;
      const py = Math.sin(angle) * r;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = palette.warm;
    ctx.beginPath();
    ctx.arc(-radius * 0.32, -1, 2, 0, Math.PI * 2);
    ctx.arc(radius * 0.32, -1, 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawProjectile(projectile: GameState['projectiles'][number]) {
    if (!projectile.alive) return;
    const x = sx(projectile.x);
    const y = sy(projectile.y);
    ctx.strokeStyle = palette.accent;
    ctx.lineWidth = Math.max(2, 3 * scaleX());
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x, y + 7);
    ctx.lineTo(x, y - 7);
    ctx.stroke();
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

    if (isJetpackActive(state)) {
      ctx.globalAlpha = 0.2;
      ctx.fillStyle = palette.accent;
      ctx.beginPath();
      ctx.arc(0, 0, w * 0.85, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    ctx.fillStyle = palette.accent;
    ctx.strokeStyle = palette.accentDark;
    ctx.lineWidth = 1.5;
    roundedRect(-w / 2, -h / 2, w, h, w * 0.3);
    ctx.fill();
    ctx.stroke();

    // A tiny double-helix badge makes the character genomic without needing an asset.
    ctx.strokeStyle = palette.surface;
    ctx.globalAlpha = 0.9;
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    ctx.moveTo(-w * 0.2, h * 0.15);
    ctx.bezierCurveTo(w * 0.24, 0, -w * 0.24, -h * 0.13, w * 0.2, -h * 0.27);
    ctx.moveTo(w * 0.2, h * 0.15);
    ctx.bezierCurveTo(-w * 0.24, 0, w * 0.24, -h * 0.13, -w * 0.2, -h * 0.27);
    ctx.stroke();
    ctx.globalAlpha = 1;

    ctx.fillStyle = palette.surface;
    ctx.beginPath();
    ctx.arc(-w * 0.17, -h * 0.24, 2.2, 0, Math.PI * 2);
    ctx.arc(w * 0.17, -h * 0.24, 2.2, 0, Math.PI * 2);
    ctx.fill();
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
      ctx.arc(sx(particle.x), sy(particle.y), 2.2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function drawOverlay() {
    if (state.status === 'playing') return;
    ctx.save();
    ctx.fillStyle = palette.background;
    ctx.globalAlpha = 0.82;
    roundedRect(width * 0.12, height * 0.37, width * 0.76, height * 0.2, 6);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.fillStyle = palette.ink;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `600 ${Math.max(18, Math.round(width * 0.055))}px ${cssVar('--font-display', 'system-ui')}`;
    const title =
      state.status === 'ready'
        ? 'Ready to jump?'
        : state.status === 'paused'
          ? 'Paused'
          : 'Run complete';
    ctx.fillText(title, width / 2, height * 0.445);
    ctx.fillStyle = palette.muted;
    ctx.font = `500 ${Math.max(12, Math.round(width * 0.034))}px ${cssVar('--font-body', 'system-ui')}`;
    const hint =
      state.status === 'over'
        ? 'Enter or Restart to go again'
        : state.status === 'paused'
          ? 'P or Pause to resume'
          : 'Tap the board or press Enter';
    ctx.fillText(hint, width / 2, height * 0.5);
    ctx.restore();
  }

  function render() {
    drawBackground();
    for (const platform of state.platforms) drawPlatform(platform);
    for (const item of state.collectibles) drawCollectible(item);
    for (const item of state.powerUps) drawPowerUp(item);
    for (const enemy of state.enemies) drawEnemy(enemy);
    for (const projectile of state.projectiles) drawProjectile(projectile);
    drawParticles();
    drawPlayer();
    drawOverlay();
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

  function tone(frequency: number, duration: number, volume = 0.035, endFrequency = frequency) {
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
    if (event === 'jump') tone(190, 0.07, 0.018, 230);
    else if (event === 'spring') tone(210, 0.16, 0.035, 620);
    else if (event === 'collect') tone(520, 0.11, 0.03, 740);
    else if (event === 'jetpack') tone(150, 0.32, 0.04, 520);
    else if (event === 'shot') tone(480, 0.055, 0.02, 290);
    else if (event === 'enemy') tone(220, 0.14, 0.035, 80);
    else if (event === 'over') tone(240, 0.42, 0.035, 70);
  }

  function spawnParticles(event: GameState['lastEvent']) {
    if (reducedMotion || event === 'none' || event === 'shot') return;
    const count = event === 'jetpack' ? 12 : event === 'enemy' ? 10 : event === 'collect' ? 7 : 4;
    const color = event === 'collect' || event === 'enemy' ? palette.warm : palette.accent;
    for (let i = 0; i < count; i++) {
      const life = 0.25 + Math.random() * 0.28;
      particles.push({
        x: state.player.x,
        y: state.player.y + state.player.height * 0.25,
        vx: (Math.random() * 2 - 1) * 65,
        vy: (Math.random() * 2 - 0.4) * 90,
        life,
        maxLife: life,
        color,
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
    if (isJetpackActive(state)) return 'Jetpack active — mutation contact is safe';
    return 'Climbing — steer, collect bases, and clear mutations';
  }

  function updateHud() {
    if (scoreEl) scoreEl.textContent = state.score.toLocaleString('en-US');
    if (heightEl) heightEl.textContent = `${state.height} m`;
    if (bestEl) bestEl.textContent = best.toLocaleString('en-US');
    if (sequenceEl) sequenceEl.textContent = state.sequence.join('') || '—';
    if (statusEl) statusEl.textContent = statusMessage();
    if (boostEl) {
      boostEl.textContent = isJetpackActive(state)
        ? `Jetpack ${Math.max(0, state.jetpackUntil - state.time).toFixed(1)} s`
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
      // Synthetic events and a few embedded browsers do not expose an active
      // pointer to setPointerCapture; window-level gameplay remains unaffected.
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
      // See the pointerdown guard above.
    }
    activePointer = null;
    setSteering(state, 0);
    // A stationary tap is intentionally only start/resume; combat remains on the
    // dedicated Fire control so steering gestures never fire accidentally.
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
      state.cameraY = Math.max(500, state.cameraY);
      state.player.y = state.cameraY - state.player.height - 40;
      state.player.vy = PHYSICS.terminalVelocity;
      simulationTick();
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
