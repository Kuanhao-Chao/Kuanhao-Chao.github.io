/**
 * Dino Run DOM controller: Canvas-2D rendering, input, HUD updates, and the
 * fixed-timestep loop. All runner rules live in `src/lib/dino.ts`.
 */
import {
  createGame,
  duck,
  jump,
  releaseDuck,
  reset,
  start,
  step as engineStep,
  mulberry32,
  type DinoState,
  type Obstacle,
  type RNG,
} from '../lib/dino';

interface DinoRunTestApi {
  state: () => DinoState;
  status: () => DinoState['status'];
  score: () => number;
  best: () => number;
  jump: () => void;
  duck: () => void;
  releaseDuck: () => void;
  restart: () => void;
  pause: () => void;
  resume: () => void;
  tick: (frames?: number) => void;
  isRunning: () => boolean;
}

declare global {
  interface Window {
    __dinoRun?: DinoRunTestApi;
    __dinoRunInstances?: number;
  }
}

export interface DinoRunController {
  destroy: () => void;
}

const BEST_KEY = 'khc-dino-run-best';
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

export function initDinoRun(root: ParentNode = document): DinoRunController | null {
  const canvasEl = root.querySelector<HTMLCanvasElement>('[data-dino-canvas]');
  if (!canvasEl) return null;
  if (canvasEl.dataset.dinoReady === 'true') return null;
  canvasEl.dataset.dinoReady = 'true';

  const maybeCtx = canvasEl.getContext('2d');
  if (!maybeCtx) {
    delete canvasEl.dataset.dinoReady;
    return null;
  }
  const canvas: HTMLCanvasElement = canvasEl;
  const ctx: CanvasRenderingContext2D = maybeCtx;

  const scoreEl = root.querySelector<HTMLElement>('[data-dino-score]');
  const bestEl = root.querySelector<HTMLElement>('[data-dino-best]');
  const speedEl = root.querySelector<HTMLElement>('[data-dino-speed]');
  const statusEl = root.querySelector<HTMLElement>('[data-dino-status]');
  const pauseBtn = root.querySelector<HTMLButtonElement>('[data-dino-pause]');
  const restartBtn = root.querySelector<HTMLButtonElement>('[data-dino-restart]');
  const jumpBtn = root.querySelector<HTMLButtonElement>('[data-dino-jump]');
  const duckBtn = root.querySelector<HTMLButtonElement>('[data-dino-duck]');

  const seedParam = new URLSearchParams(location.search).get('seed');
  const freshSeed = (): number =>
    seedParam != null ? Number(seedParam) >>> 0 : (Date.now() ^ (Math.random() * 0xffffffff)) >>> 0;

  let rng: RNG = mulberry32(freshSeed());
  const state = createGame({}, rng);
  let best = readBest();
  let colors = readColors();

  function readColors() {
    return {
      board: cssVar('--color-surface', '#ffffff'),
      ink: cssVar('--color-ink', '#141414'),
      muted: cssVar('--color-muted', '#6b6b6b'),
      rule: cssVar('--color-rule', '#e5e4df'),
      accent: cssVar('--color-accent', '#2e6e5e'),
      accentDark: cssVar('--color-accent-dark', '#245546'),
      warmText: cssVar('--color-badge-warm-text', '#8a5a1a'),
      warmBg: cssVar('--color-badge-warm-bg', '#fbf3e4'),
      warmBorder: cssVar('--color-badge-warm-border', '#e3c79a'),
      onAccent: cssVar('--color-on-accent', '#ffffff'),
    };
  }

  let raf = 0;
  let last = 0;
  let acc = 0;
  let paused = false;
  let duckReleaseTimer = 0;

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

  interface DinoParticle {
    x: number;
    y: number;
    vx: number;
    vy: number;
    color: string;
    size: number;
    life: number;
    maxLife: number;
  }

  interface DinoPopup {
    x: number;
    y: number;
    text: string;
    color: string;
    life: number;
    maxLife: number;
  }

  const particles: DinoParticle[] = [];
  const popups: DinoPopup[] = [];
  let lastMilestone = 0;

  function render() {
    ctx.clearRect(0, 0, state.width, state.height);
    ctx.fillStyle = colors.board;
    ctx.fillRect(0, 0, state.width, state.height);
    drawBackground();
    for (const obstacle of state.obstacles) drawObstacle(obstacle);
    drawRunner();
    drawParticles();
    drawPopups();
  }

  function drawParticles() {
    for (const p of particles) {
      const alpha = Math.max(0, p.life / p.maxLife);
      ctx.globalAlpha = alpha;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function drawPopups() {
    ctx.save();
    for (const p of popups) {
      const alpha = Math.max(0, p.life / p.maxLife);
      ctx.globalAlpha = alpha;
      ctx.fillStyle = p.color;
      ctx.font = `bold 14px ${cssVar('--font-mono', 'monospace')}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(p.text, p.x, p.y);
    }
    ctx.restore();
  }

  function drawBackground() {
    const ground = state.groundY;
    ctx.save();

    // 1. High-Tech Genomic Double-Helix Track
    // Upper Rail (Phosphodiester Backbone)
    ctx.strokeStyle = colors.accent;
    ctx.lineWidth = 2.5;
    ctx.globalAlpha = 0.9;
    ctx.beginPath();
    ctx.moveTo(0, ground + 0.5);
    ctx.lineTo(state.width, ground + 0.5);
    ctx.stroke();

    // Lower Rail
    ctx.strokeStyle = colors.rule;
    ctx.lineWidth = 1.6;
    ctx.globalAlpha = 0.75;
    ctx.beginPath();
    ctx.moveTo(0, ground + 16.5);
    ctx.lineTo(state.width, ground + 16.5);
    ctx.stroke();

    // Scrolling Watson-Crick Base Pair Rungs & Letters
    const tickSpacing = 72;
    const offset = -((state.distance * 0.75) % tickSpacing);
    ctx.font = `bold 12px ${cssVar('--font-mono', 'monospace')}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const bases = ['A', 'C', 'G', 'T'];
    const baseColors = ['#10b981', '#38bdf8', '#f59e0b', '#a855f7'];

    for (let x = offset; x < state.width + tickSpacing; x += tickSpacing) {
      const idx = Math.abs(Math.floor((x + state.distance) / tickSpacing)) % 4;
      const bColor = baseColors[idx];

      // Vertical hydrogen bond rung
      ctx.globalAlpha = 0.7;
      ctx.strokeStyle = bColor;
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(x, ground + 2);
      ctx.lineTo(x, ground + 15);
      ctx.stroke();

      // Nucleotide marker node
      ctx.fillStyle = bColor;
      ctx.beginPath();
      ctx.arc(x, ground + 8.5, 2.5, 0, Math.PI * 2);
      ctx.fill();

      // Base letter below rail
      ctx.globalAlpha = 0.85;
      ctx.fillStyle = bColor;
      ctx.fillText(bases[idx], x, ground + 28);
    }

    // 2. Parallax Gene Expression Wave in Deep Background
    ctx.globalAlpha = 0.15;
    ctx.strokeStyle = colors.accent;
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    const waveOffset = (state.distance * 0.04) % 48;
    for (let x = -48; x <= state.width + 48; x += 12) {
      const y = 68 + Math.sin((x + waveOffset) / 28) * 12;
      if (x === -48) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.restore();
  }

  function drawRunner() {
    const ducking = state.runner.ducking && state.runner.grounded;
    const airborne = !state.runner.grounded;
    const x = state.runner.x;
    const bottom = state.runner.y;

    ctx.save();
    ctx.fillStyle = colors.accent;
    ctx.strokeStyle = colors.accentDark;
    ctx.lineWidth = 2;

    // Running animation phase
    const runPhase = (state.distance * 0.12) % (Math.PI * 2);
    const legSwing = Math.sin(runPhase) * 7;

    if (ducking) {
      // 1. Ducking Low-Profile Slide
      // Streamlined elongated body
      roundRect(x + 4, bottom - 32, 60, 24, 8);
      ctx.fill();
      ctx.stroke();

      // Low-profile elongated head & jaws
      roundRect(x + 48, bottom - 42, 30, 20, 7);
      ctx.fill();
      ctx.stroke();

      // Cybernetic gold visor eye
      ctx.fillStyle = '#f59e0b';
      ctx.fillRect(x + 64, bottom - 36, 9, 4);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(x + 69, bottom - 35, 3, 2);

      // Low tucked limbs & ground friction sparks
      ctx.fillStyle = colors.accentDark;
      ctx.fillRect(x + 16, bottom - 8, 14, 6);
      ctx.fillRect(x + 44, bottom - 8, 14, 6);

      // Slide friction sparks
      ctx.fillStyle = '#fbbf24';
      ctx.fillRect(x + 8, bottom - 4, 3, 2);
      ctx.fillRect(x + 24, bottom - 3, 2, 2);
      ctx.fillRect(x + 40, bottom - 5, 3, 2);
    } else {
      // 2. Upright Running & Leaping Cybernetic Velociraptor
      // Counter-balancing tail with flexible curve
      const tailTilt = airborne ? -4 : Math.sin(runPhase) * 3;
      ctx.beginPath();
      ctx.moveTo(x + 10, bottom - 38);
      ctx.quadraticCurveTo(x - 6, bottom - 42 + tailTilt, x - 18, bottom - 36 + tailTilt * 1.5);
      ctx.lineTo(x - 16, bottom - 30 + tailTilt * 1.5);
      ctx.quadraticCurveTo(x - 4, bottom - 34 + tailTilt, x + 10, bottom - 26);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // Main Torso Body
      roundRect(x + 8, bottom - 48, 36, 38, 10);
      ctx.fill();
      ctx.stroke();

      // Dorsal neural spine plates along back
      ctx.fillStyle = '#f59e0b';
      ctx.beginPath();
      ctx.moveTo(x + 14, bottom - 48);
      ctx.lineTo(x + 18, bottom - 55);
      ctx.lineTo(x + 22, bottom - 48);
      ctx.moveTo(x + 24, bottom - 48);
      ctx.lineTo(x + 28, bottom - 56);
      ctx.lineTo(x + 32, bottom - 48);
      ctx.fill();

      // Aerodynamic Neck & Raptor Head
      ctx.fillStyle = colors.accent;
      roundRect(x + 34, bottom - 66, 30, 26, 8);
      ctx.fill();
      ctx.stroke();

      // Snout jawline
      ctx.beginPath();
      ctx.moveTo(x + 52, bottom - 50);
      ctx.lineTo(x + 64, bottom - 50);
      ctx.stroke();

      // Cybernetic Visor Eye (Glowing arcade gold)
      ctx.fillStyle = '#f59e0b';
      ctx.fillRect(x + 50, bottom - 58, 8, 4);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(x + 54, bottom - 57, 3, 2);

      // Forward articulated arm / claw
      ctx.strokeStyle = colors.accentDark;
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.moveTo(x + 30, bottom - 36);
      ctx.lineTo(x + 38, bottom - 30);
      ctx.lineTo(x + 36, bottom - 24);
      ctx.stroke();

      // Articulated Running Legs (2-Phase Cycle or Jump Tuck)
      ctx.lineWidth = 3;
      if (airborne) {
        // Back leg extended leaping
        ctx.beginPath();
        ctx.moveTo(x + 16, bottom - 22);
        ctx.lineTo(x + 8, bottom - 12);
        ctx.lineTo(x + 2, bottom - 6);
        ctx.stroke();
        // Front leg bent forward
        ctx.beginPath();
        ctx.moveTo(x + 32, bottom - 22);
        ctx.lineTo(x + 40, bottom - 14);
        ctx.lineTo(x + 46, bottom - 4);
        ctx.stroke();
      } else {
        // Leg 1
        ctx.beginPath();
        ctx.moveTo(x + 18, bottom - 22);
        ctx.lineTo(x + 16 + legSwing, bottom - 12);
        ctx.lineTo(x + 18 + legSwing * 1.5, bottom - 2);
        ctx.stroke();
        // Leg 2
        ctx.beginPath();
        ctx.moveTo(x + 32, bottom - 22);
        ctx.lineTo(x + 34 - legSwing, bottom - 12);
        ctx.lineTo(x + 32 - legSwing * 1.5, bottom - 2);
        ctx.stroke();
      }

      // Speed velocity trail accent lines
      ctx.fillStyle = colors.onAccent;
      ctx.globalAlpha = 0.6;
      ctx.fillRect(x + 18, bottom - 36, 18, 2.5);
      ctx.globalAlpha = 1;
    }
    ctx.restore();
  }

  function drawObstacle(obstacle: Obstacle) {
    if (obstacle.kind === 'splice-arch') {
      // 1. Holographic GT-AG Splice-Junction Gateway Obstacle
      ctx.save();
      ctx.fillStyle = colors.ink;
      ctx.globalAlpha = 0.88;
      roundRect(obstacle.x, obstacle.y, obstacle.width, obstacle.height, 8);
      ctx.fill();

      // Splice gate pillar posts
      ctx.fillStyle = colors.accentDark;
      ctx.fillRect(obstacle.x + 6, obstacle.y + obstacle.height - 2, 7, 34);
      ctx.fillRect(obstacle.x + obstacle.width - 13, obstacle.y + obstacle.height - 2, 7, 34);

      // Glowing Intron Portal Bar (Amber-Gold)
      ctx.fillStyle = '#f59e0b';
      ctx.fillRect(obstacle.x + 10, obstacle.y + 7, obstacle.width - 20, 4);

      // Consensus base labels: 5' GT and 3' AG
      ctx.font = `bold 9px ${cssVar('--font-mono', 'monospace')}`;
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('GT', obstacle.x + 14, obstacle.y + 20);
      ctx.fillText('AG', obstacle.x + obstacle.width - 14, obstacle.y + 20);
      ctx.restore();
      return;
    }

    ctx.save();
    if (obstacle.kind === 'repeat-stack') {
      // 2. Tandem Repeat Microsatellite Monolith Obstacle
      ctx.fillStyle = colors.warmBg;
      ctx.strokeStyle = colors.warmBorder;
      ctx.lineWidth = 2;
      roundRect(obstacle.x, obstacle.y, obstacle.width, obstacle.height, 6);
      ctx.fill();
      ctx.stroke();

      // Horizontal STR base-pair bands
      ctx.fillStyle = colors.warmText;
      for (let y = obstacle.y + 8; y < obstacle.y + obstacle.height - 6; y += 12) {
        ctx.fillRect(obstacle.x + 6, y, obstacle.width - 12, 3.5);
      }
    } else {
      // 3. Genomic Variant Mutagen Block Obstacle
      ctx.fillStyle = colors.accentDark;
      ctx.strokeStyle = colors.accent;
      ctx.lineWidth = 2;
      roundRect(obstacle.x, obstacle.y, obstacle.width, obstacle.height, 6);
      ctx.fill();
      ctx.stroke();

      // Warning hazard stripes & core
      ctx.fillStyle = colors.onAccent;
      ctx.globalAlpha = 0.75;
      ctx.fillRect(obstacle.x + 6, obstacle.y + 8, obstacle.width - 12, 3.5);
      ctx.fillRect(obstacle.x + 6, obstacle.y + obstacle.height - 12, obstacle.width - 12, 3.5);

      // Central variant delta symbol
      ctx.font = `bold 10px ${cssVar('--font-mono', 'monospace')}`;
      ctx.fillStyle = '#fef08a';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('VAR', obstacle.x + obstacle.width / 2, obstacle.y + obstacle.height / 2);
    }
    ctx.restore();
  }

  function statusMessage(): string {
    if (state.status === 'ready') return 'Ready - tap, Space, or Jump to start';
    if (state.status === 'over') return `Run over - ${state.score} bp. Tap or Space to restart`;
    if (paused) return 'Paused';
    return 'Running';
  }

  function updateHud() {
    if (scoreEl) scoreEl.textContent = String(state.score);
    if (bestEl) bestEl.textContent = String(best);
    if (speedEl) speedEl.textContent = String(Math.round(state.speed));
    if (statusEl) statusEl.textContent = statusMessage();
    if (pauseBtn) {
      pauseBtn.disabled = state.status !== 'playing';
      pauseBtn.dataset.active = paused ? 'true' : 'false';
      const label = paused ? 'Resume' : 'Pause';
      pauseBtn.setAttribute('aria-label', label);
      const text = pauseBtn.querySelector('[data-button-label]');
      if (text) text.textContent = label;
    }
  }

  function tickOnce() {
    engineStep(state, rng, STEP_MS);
    if (state.score > best) {
      best = state.score;
      writeBest(best);
    }
    if (state.status !== 'playing') paused = false;

    const dt = STEP_MS / 1000;
    // Ground slide friction sparks while ducking
    if (state.status === 'playing' && state.runner.grounded && state.runner.ducking) {
      if (Math.random() < 0.45) {
        particles.push({
          x: state.runner.x + 25 + Math.random() * 25,
          y: state.runner.y - 2,
          vx: -(state.speed * 0.35 + Math.random() * 40),
          vy: -(Math.random() * 30 + 10),
          color: Math.random() < 0.5 ? '#fbbf24' : '#f59e0b',
          size: 1.5 + Math.random() * 1.5,
          life: 0.25,
          maxLife: 0.25,
        });
      }
    }

    // Milestone celebration every 100 bp
    const milestone = Math.floor(state.score / 100);
    if (milestone > lastMilestone && state.status === 'playing') {
      lastMilestone = milestone;
      popups.push({
        x: state.runner.x + 35,
        y: state.runner.y - 80,
        text: `${milestone * 100} BP MILESTONE!`,
        color: '#f59e0b',
        life: 1.2,
        maxLife: 1.2,
      });
      // Starburst particles
      const milestoneColors = ['#10b981', '#38bdf8', '#f59e0b', '#a855f7', '#fbbf24'];
      for (let i = 0; i < 18; i++) {
        const a = (i / 18) * Math.PI * 2;
        const sp = 40 + Math.random() * 80;
        particles.push({
          x: state.runner.x + 30,
          y: state.runner.y - 40,
          vx: Math.cos(a) * sp,
          vy: Math.sin(a) * sp - 30,
          color: milestoneColors[i % milestoneColors.length],
          size: 2 + Math.random() * 2,
          life: 0.6,
          maxLife: 0.6,
        });
      }
    }

    // Update particles and popups
    for (const p of particles) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 200 * dt;
      p.life -= dt;
    }
    for (let i = particles.length - 1; i >= 0; i--) {
      if (particles[i].life <= 0) particles.splice(i, 1);
    }
    for (const p of popups) {
      p.y -= 25 * dt;
      p.life -= dt;
    }
    for (let i = popups.length - 1; i >= 0; i--) {
      if (popups[i].life <= 0) popups.splice(i, 1);
    }
  }

  function frame(ts: number) {
    raf = requestAnimationFrame(frame);
    if (paused) {
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

  function restart(startNow = true) {
    window.clearTimeout(duckReleaseTimer);
    duckReleaseTimer = 0;
    particles.length = 0;
    popups.length = 0;
    lastMilestone = 0;
    rng = mulberry32(freshSeed());
    reset(state, rng);
    paused = false;
    last = 0;
    acc = 0;
    if (startNow) start(state);
    render();
    updateHud();
  }

  function doJump() {
    if (state.status === 'over') {
      restart(true);
      return;
    }
    if (paused) paused = false;
    jump(state);
    render();
    updateHud();
  }

  function doDuck() {
    if (state.status === 'over') {
      restart(true);
      return;
    }
    if (paused) paused = false;
    duck(state);
    render();
    updateHud();
  }

  function doReleaseDuck() {
    releaseDuck(state);
    render();
    updateHud();
  }

  function togglePause() {
    if (state.status !== 'playing') return;
    paused = !paused;
    if (!paused) last = 0;
    updateHud();
  }

  function pulseDuck() {
    doDuck();
    window.clearTimeout(duckReleaseTimer);
    duckReleaseTimer = window.setTimeout(() => {
      doReleaseDuck();
      duckReleaseTimer = 0;
    }, 420);
  }

  function onKeyDown(event: KeyboardEvent) {
    if (isInteractive(event.target)) return;
    const key = event.key.toLowerCase();
    if (event.key === 'ArrowUp' || key === 'w' || event.key === ' ') {
      event.preventDefault();
      doJump();
    } else if (event.key === 'ArrowDown' || key === 's') {
      event.preventDefault();
      doDuck();
    } else if (event.key === 'Enter') {
      event.preventDefault();
      if (state.status === 'playing') togglePause();
      else restart(true);
    } else if (key === 'p') {
      event.preventDefault();
      togglePause();
    }
  }

  function onKeyUp(event: KeyboardEvent) {
    if (isInteractive(event.target)) return;
    const key = event.key.toLowerCase();
    if (event.key === 'ArrowDown' || key === 's') {
      event.preventDefault();
      doReleaseDuck();
    }
  }

  let touchStart: { x: number; y: number } | null = null;
  function onTouchStart(event: TouchEvent) {
    const touch = event.changedTouches[0];
    touchStart = { x: touch.clientX, y: touch.clientY };
  }

  function onTouchMove(event: TouchEvent) {
    event.preventDefault();
  }

  function onTouchEnd(event: TouchEvent) {
    if (!touchStart) return;
    event.preventDefault();
    const touch = event.changedTouches[0];
    const dx = touch.clientX - touchStart.x;
    const dy = touch.clientY - touchStart.y;
    const adx = Math.abs(dx);
    const ady = Math.abs(dy);
    touchStart = null;
    if (state.status === 'over') {
      restart(true);
    } else if (Math.max(adx, ady) < 22 || dy < -24) {
      doJump();
    } else if (dy > 24 && ady > adx) {
      pulseDuck();
    }
  }

  function onCanvasClick() {
    if (state.status === 'over') restart(true);
    else doJump();
  }

  function onRestart() {
    restart(true);
  }

  function onDuckPointerDown(event: PointerEvent) {
    event.preventDefault();
    duckBtn?.setPointerCapture(event.pointerId);
    doDuck();
  }

  function onDuckPointerUp(event: PointerEvent) {
    if (duckBtn?.hasPointerCapture(event.pointerId)) duckBtn.releasePointerCapture(event.pointerId);
    doReleaseDuck();
  }

  function onDuckButtonKeyDown(event: KeyboardEvent) {
    if (event.key !== ' ' && event.key !== 'Enter') return;
    event.preventDefault();
    doDuck();
  }

  function onDuckButtonKeyUp(event: KeyboardEvent) {
    if (event.key !== ' ' && event.key !== 'Enter') return;
    event.preventDefault();
    doReleaseDuck();
  }

  function onTheme() {
    colors = readColors();
    render();
  }

  function onHide() {
    if (document.hidden && state.status === 'playing') {
      paused = true;
      updateHud();
    }
  }

  function onBlur() {
    if (state.status === 'playing') {
      paused = true;
      updateHud();
    }
  }

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  canvas.addEventListener('touchstart', onTouchStart, { passive: true });
  canvas.addEventListener('touchmove', onTouchMove, { passive: false });
  canvas.addEventListener('touchend', onTouchEnd, { passive: false });
  canvas.addEventListener('click', onCanvasClick);
  pauseBtn?.addEventListener('click', togglePause);
  restartBtn?.addEventListener('click', onRestart);
  jumpBtn?.addEventListener('click', doJump);
  duckBtn?.addEventListener('pointerdown', onDuckPointerDown);
  duckBtn?.addEventListener('pointerup', onDuckPointerUp);
  duckBtn?.addEventListener('pointercancel', onDuckPointerUp);
  duckBtn?.addEventListener('pointerleave', onDuckPointerUp);
  duckBtn?.addEventListener('keydown', onDuckButtonKeyDown);
  duckBtn?.addEventListener('keyup', onDuckButtonKeyUp);
  document.addEventListener('visibilitychange', onHide);
  window.addEventListener('blur', onBlur);
  document.addEventListener('khc:theme-change', onTheme);
  ro.observe(canvas);

  resize();
  updateHud();
  raf = requestAnimationFrame(frame);

  window.__dinoRunInstances = (window.__dinoRunInstances ?? 0) + 1;
  window.__dinoRun = {
    state: () => state,
    status: () => state.status,
    score: () => state.score,
    best: () => best,
    jump: () => doJump(),
    duck: () => doDuck(),
    releaseDuck: () => doReleaseDuck(),
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
    tick: (frames = 1) => {
      if (state.status === 'ready') start(state);
      for (let i = 0; i < frames && state.status === 'playing'; i++) tickOnce();
      render();
      updateHud();
    },
    isRunning: () => raf !== 0 && state.status === 'playing' && !paused,
  };

  function destroy() {
    cancelAnimationFrame(raf);
    raf = 0;
    window.clearTimeout(duckReleaseTimer);
    ro.disconnect();
    window.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('keyup', onKeyUp);
    canvas.removeEventListener('touchstart', onTouchStart);
    canvas.removeEventListener('touchmove', onTouchMove);
    canvas.removeEventListener('touchend', onTouchEnd);
    canvas.removeEventListener('click', onCanvasClick);
    pauseBtn?.removeEventListener('click', togglePause);
    restartBtn?.removeEventListener('click', onRestart);
    jumpBtn?.removeEventListener('click', doJump);
    duckBtn?.removeEventListener('pointerdown', onDuckPointerDown);
    duckBtn?.removeEventListener('pointerup', onDuckPointerUp);
    duckBtn?.removeEventListener('pointercancel', onDuckPointerUp);
    duckBtn?.removeEventListener('pointerleave', onDuckPointerUp);
    duckBtn?.removeEventListener('keydown', onDuckButtonKeyDown);
    duckBtn?.removeEventListener('keyup', onDuckButtonKeyUp);
    document.removeEventListener('visibilitychange', onHide);
    window.removeEventListener('blur', onBlur);
    document.removeEventListener('khc:theme-change', onTheme);
    delete canvas.dataset.dinoReady;
    window.__dinoRunInstances = Math.max(0, (window.__dinoRunInstances ?? 1) - 1);
    if (window.__dinoRun && window.__dinoRunInstances === 0) delete window.__dinoRun;
  }

  return { destroy };
}
