/**
 * CRISPR Commander — Canvas 2D Renderer & Game Loop
 * Features dynamic Light/Dark theme palette synchronization and molecular Cas9 visual FX
 */

import {
  createInitialState,
  updateGameState,
  activatePowerUp,
  switchCasEnzyme,
  type GameState,
  type SliceLine,
  type PowerUpType,
  type CasType,
} from '../lib/crisprCommander';
import { isDarkTheme } from '../lib/theme';

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  color: string;
  alpha: number;
  life: number;
  maxLife: number;
  text?: string;
}

interface FloatingText {
  x: number;
  y: number;
  text: string;
  color: string;
  alpha: number;
  life: number;
  maxLife: number;
}

const STORAGE_KEY = 'khc_crispr_commander_highscore';

interface ThemePalette {
  isDark: boolean;
  bg: string;
  grid: string;
  ink: string;
  muted: string;
  dangerBg: string;
  dangerLine: string;
  overlayBg: string;
  reticleCas9: string;
  reticleCas12: string;
}

function getThemePalette(): ThemePalette {
  const isDark = isDarkTheme();

  if (isDark) {
    return {
      isDark: true,
      bg: '#070b14',
      grid: 'rgba(56, 189, 248, 0.07)',
      ink: '#f8fafc',
      muted: '#94a3b8',
      dangerBg: 'rgba(244, 63, 94, 0.22)',
      dangerLine: '#f43f5e',
      overlayBg: 'rgba(7, 11, 20, 0.90)',
      reticleCas9: '#38bdf8',
      reticleCas12: '#a855f7',
    };
  }

  return {
    isDark: false,
    bg: '#f8fafc',
    grid: 'rgba(15, 23, 42, 0.06)',
    ink: '#0f172a',
    muted: '#64748b',
    dangerBg: 'rgba(225, 29, 72, 0.12)',
    dangerLine: '#e11d48',
    overlayBg: 'rgba(248, 250, 252, 0.92)',
    reticleCas9: '#0284c7',
    reticleCas12: '#7c3aed',
  };
}

class SoundController {
  private ctx: AudioContext | null = null;
  public enabled = true;

  private init() {
    if (!this.ctx && typeof window !== 'undefined') {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  playCleave(pitch = 1.0) {
    if (!this.enabled) return;
    this.init();
    if (!this.ctx) return;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    const now = this.ctx.currentTime;

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(440 * pitch, now);
    osc.frequency.exponentialRampToValueAtTime(880 * pitch, now + 0.08);

    gain.gain.setValueAtTime(0.15, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(now);
    osc.stop(now + 0.12);
  }

  playDsbBass() {
    if (!this.enabled) return;
    this.init();
    if (!this.ctx) return;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    const now = this.ctx.currentTime;

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(140, now);
    osc.frequency.exponentialRampToValueAtTime(35, now + 0.25);

    gain.gain.setValueAtTime(0.3, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(now);
    osc.stop(now + 0.3);
  }

  playPowerUp() {
    if (!this.enabled) return;
    this.init();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    [523.25, 659.25, 783.99, 1046.5].forEach((freq, i) => {
      const osc = this.ctx!.createOscillator();
      const gain = this.ctx!.createGain();
      const startTime = now + i * 0.05;

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, startTime);

      gain.gain.setValueAtTime(0.12, startTime);
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.15);

      osc.connect(gain);
      gain.connect(this.ctx!.destination);

      osc.start(startTime);
      osc.stop(startTime + 0.15);
    });
  }

  playDamage() {
    if (!this.enabled) return;
    this.init();
    if (!this.ctx) return;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    const now = this.ctx.currentTime;

    osc.type = 'square';
    osc.frequency.setValueAtTime(110, now);
    osc.frequency.linearRampToValueAtTime(55, now + 0.2);

    gain.gain.setValueAtTime(0.2, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(now);
    osc.stop(now + 0.25);
  }
}

export function initCrisprCommander(containerEl: HTMLElement) {
  // Global instance tracking for single-instance SPA safety
  const win = window as unknown as {
    __crisprCommander?: { state: () => GameState; restart: () => void; destroy: () => void };
    __crisprCommanderInstances?: number;
  };
  win.__crisprCommanderInstances = (win.__crisprCommanderInstances || 0) + 1;

  const canvas = containerEl.querySelector<HTMLCanvasElement>('[data-crispr-canvas]');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const scoreEl = containerEl.querySelector('[data-crispr-score]');
  const bestEl = containerEl.querySelector('[data-crispr-best]');
  const energyEl = containerEl.querySelector('[data-crispr-energy]');
  const comboEl = containerEl.querySelector('[data-crispr-combo]');
  const integrityBar = containerEl.querySelector<HTMLElement>('[data-crispr-integrity-fill]');
  const integrityText = containerEl.querySelector('[data-crispr-integrity-text]');
  const pauseBtn = containerEl.querySelector<HTMLButtonElement>('[data-crispr-pause]');
  const restartBtn = containerEl.querySelector<HTMLButtonElement>('[data-crispr-restart]');
  const soundBtn = containerEl.querySelector<HTMLButtonElement>('[data-crispr-sound]');
  const enzymeBtns = containerEl.querySelectorAll<HTMLButtonElement>('[data-enzyme]');
  const powerupBtns = containerEl.querySelectorAll<HTMLButtonElement>('[data-powerup]');

  const sound = new SoundController();
  let savedHigh = 0;
  try {
    savedHigh = parseInt(localStorage.getItem(STORAGE_KEY) || '0', 10) || 0;
  } catch {}

  let state: GameState = createInitialState(savedHigh);
  let palette: ThemePalette = getThemePalette();
  let particles: Particle[] = [];
  let floatingTexts: FloatingText[] = [];
  let slicePoints: { x: number; y: number }[] = [];
  let pendingSlices: SliceLine[] = [];
  let isPointerDown = false;
  let isPointerInside = false;
  let pointerPos = { x: 0, y: 0 };
  let animTick = 0;
  let lastTimestamp = 0;
  let animationFrameId = 0;

  function resizeCanvas() {
    if (!canvas || !ctx) return;
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;

    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function getCanvasPos(e: MouseEvent | Touch): { x: number; y: number } {
    const rect = canvas!.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
  }

  function createSparks(x: number, y: number, color: string, count = 16) {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 1.5 + Math.random() * 4.5;
      particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        size: 1.5 + Math.random() * 3.5,
        color,
        alpha: 1,
        life: 0,
        maxLife: 20 + Math.random() * 15,
      });
    }
  }

  function addFloatingText(x: number, y: number, text: string, color = '#38bdf8') {
    floatingTexts.push({
      x,
      y,
      text,
      color,
      alpha: 1.0,
      life: 0,
      maxLife: 40,
    });
  }

  function render() {
    if (!canvas || !ctx) return;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    animTick += 0.04;

    ctx.clearRect(0, 0, w, h);

    // 1. Draw cellular background & host genome boundary
    ctx.fillStyle = palette.bg;
    ctx.fillRect(0, 0, w, h);

    // Grid matrix
    ctx.strokeStyle = palette.grid;
    ctx.lineWidth = 1;
    const gridSize = 36;
    for (let x = 0; x < w; x += gridSize) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }
    for (let y = 0; y < h; y += gridSize) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }

    // Host Genome Integration Danger Zone Line
    const dangerY = h * 0.92;
    const gradient = ctx.createLinearGradient(0, dangerY - 30, 0, h);
    gradient.addColorStop(0, 'rgba(244, 63, 94, 0.0)');
    gradient.addColorStop(1, palette.dangerBg);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, dangerY - 30, w, h - dangerY + 30);

    ctx.strokeStyle = palette.dangerLine;
    ctx.lineWidth = 2;
    ctx.setLineDash([8, 6]);
    ctx.beginPath();
    ctx.moveTo(0, dangerY);
    ctx.lineTo(w, dangerY);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = palette.dangerLine;
    ctx.font = 'bold 10px monospace';
    ctx.fillText('HOST GENOME CORE INTEGRATION THRESHOLD', 14, dangerY - 7);

    // 2. Draw Cleaved DNA Fragments (Double-Strand Break Physics)
    for (const frag of state.fragments) {
      ctx.save();
      ctx.globalAlpha = frag.alpha;
      ctx.translate(frag.x, frag.y);
      ctx.rotate(frag.angle);

      ctx.fillStyle = frag.color;
      ctx.font = 'bold 11px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(frag.sequence, 0, 0);

      // Glow outline
      ctx.strokeStyle = frag.color;
      ctx.lineWidth = 1;
      ctx.strokeRect(-24, -8, 48, 16);
      ctx.restore();
    }

    // 3. Draw viral strands with high-contrast biological graphics
    for (const strand of state.strands) {
      const px = strand.x * w;
      const py = strand.y * h;

      // Glow backing
      ctx.shadowColor = strand.color;
      ctx.shadowBlur = palette.isDark ? 16 : 8;
      ctx.fillStyle = strand.color;
      ctx.beginPath();
      ctx.arc(px, py, strand.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;

      // Inner nucleotide circle
      ctx.fillStyle = palette.bg;
      ctx.beginPath();
      ctx.arc(px, py, strand.radius - 3.5, 0, Math.PI * 2);
      ctx.fill();

      // Sequence label
      ctx.fillStyle = palette.ink;
      ctx.font = 'bold 12px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(strand.sequence.slice(0, 5), px, py - 3);

      // PAM badge
      ctx.font = 'bold 9px monospace';
      ctx.fillStyle = '#f59e0b';
      ctx.fillText(`PAM:${strand.pamSequence}`, px, py + 10);

      // Health bar for armored/boss units
      if (strand.maxHealth > 1) {
        const barW = strand.radius * 2 + 4;
        const barH = 4;
        const barX = px - barW / 2;
        const barY = py - strand.radius - 8;
        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        ctx.fillRect(barX, barY, barW, barH);
        ctx.fillStyle = '#f43f5e';
        const fillW = Math.max(0, (strand.health / strand.maxHealth) * barW);
        ctx.fillRect(barX, barY, fillW, barH);
      }
    }

    // 4. Draw Slicing Trails (Laser Cleave Ribbon)
    if (slicePoints.length >= 2) {
      const enzymeColor =
        state.activeCas === 'SpCas9' ? palette.reticleCas9 : palette.reticleCas12;

      ctx.strokeStyle = enzymeColor;
      ctx.lineWidth = 4;
      ctx.shadowColor = enzymeColor;
      ctx.shadowBlur = 18;
      ctx.beginPath();
      ctx.moveTo(slicePoints[0].x, slicePoints[0].y);
      for (let i = 1; i < slicePoints.length; i++) {
        ctx.lineTo(slicePoints[i].x, slicePoints[i].y);
      }
      ctx.stroke();
      ctx.shadowBlur = 0;
    }

    // 5. Draw Interactive Cas Enzyme Reticle with sgRNA loop
    if (isPointerInside && !state.isGameOver) {
      const rx = pointerPos.x;
      const ry = pointerPos.y;
      const enzymeColor =
        state.activeCas === 'SpCas9' ? palette.reticleCas9 : palette.reticleCas12;

      ctx.strokeStyle = enzymeColor;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(rx, ry, 22, 0, Math.PI * 2);
      ctx.stroke();

      // Crosshairs
      ctx.beginPath();
      ctx.moveTo(rx - 28, ry);
      ctx.lineTo(rx - 14, ry);
      ctx.moveTo(rx + 14, ry);
      ctx.lineTo(rx + 28, ry);
      ctx.moveTo(rx, ry - 28);
      ctx.lineTo(rx, ry - 14);
      ctx.moveTo(rx, ry + 14);
      ctx.lineTo(rx, ry + 28);
      ctx.stroke();

      // Rotating sgRNA hairpin indicator
      ctx.save();
      ctx.translate(rx, ry);
      ctx.rotate(animTick * 1.8);
      ctx.strokeStyle = '#10b981';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(0, -14, 4, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();

      // Enzyme Label
      ctx.fillStyle = enzymeColor;
      ctx.font = 'bold 10px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(state.activeCas, rx, ry - 32);
    }

    // 6. Draw Particle Sparks
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.x += p.vx;
      p.y += p.vy;
      p.life++;
      p.alpha = Math.max(0, 1 - p.life / p.maxLife);

      ctx.save();
      ctx.globalAlpha = p.alpha;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      if (p.life >= p.maxLife) {
        particles.splice(i, 1);
      }
    }

    // 7. Draw Floating Combat Texts
    for (let i = floatingTexts.length - 1; i >= 0; i--) {
      const ft = floatingTexts[i];
      ft.y -= 1.2;
      ft.life++;
      ft.alpha = Math.max(0, 1 - ft.life / ft.maxLife);

      ctx.save();
      ctx.globalAlpha = ft.alpha;
      ctx.fillStyle = ft.color;
      ctx.font = 'bold 14px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(ft.text, ft.x, ft.y);
      ctx.restore();

      if (ft.life >= ft.maxLife) {
        floatingTexts.splice(i, 1);
      }
    }

    // 8. Game Over / Victory / Pause Overlays
    if (state.isGameOver) {
      ctx.fillStyle = palette.overlayBg;
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#f43f5e';
      ctx.font = 'bold 32px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('CELL LYSIS — GENOME INTEGRATED', w / 2, h / 2 - 20);
      ctx.fillStyle = palette.ink;
      ctx.font = '16px monospace';
      ctx.fillText(`Final Score: ${state.score}  ·  High Score: ${state.highScore}`, w / 2, h / 2 + 20);
    } else if (state.isPaused) {
      ctx.fillStyle = palette.overlayBg;
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = palette.reticleCas9;
      ctx.font = 'bold 28px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('PAUSED', w / 2, h / 2);
    }
  }

  function updateHUD() {
    if (scoreEl) scoreEl.textContent = state.score.toLocaleString();
    if (bestEl) bestEl.textContent = state.highScore.toLocaleString();
    if (energyEl) energyEl.textContent = `${Math.round(state.atp)} ATP`;

    if (comboEl) {
      if (state.combo > 1) {
        comboEl.textContent = `${state.combo}x COMBO (+${Math.min(500, state.combo * 15)}%)`;
        comboEl.classList.add('active');
      } else {
        comboEl.textContent = '1x NORMAL';
        comboEl.classList.remove('active');
      }
    }

    if (integrityBar) {
      const pct = Math.max(0, (state.cellIntegrity / state.maxCellIntegrity) * 100);
      integrityBar.style.width = `${pct}%`;
      integrityBar.style.backgroundColor = pct > 50 ? '#10b981' : pct > 25 ? '#f59e0b' : '#f43f5e';
    }
    if (integrityText) integrityText.textContent = `${state.cellIntegrity}%`;

    if (pauseBtn) {
      pauseBtn.textContent = state.isPaused ? 'Resume' : 'Pause';
      pauseBtn.disabled = state.isGameOver;
    }

    enzymeBtns.forEach((btn) => {
      const enzyme = btn.getAttribute('data-enzyme') as CasType;
      if (enzyme === state.activeCas) btn.classList.add('active');
      else btn.classList.remove('active');
    });

    powerupBtns.forEach((btn) => {
      const powerup = btn.getAttribute('data-powerup') as PowerUpType;
      const cost = powerup === 'dcas9_shield' ? 40 : powerup === 'prime_editor' ? 50 : powerup === 'base_editor' ? 35 : 75;
      btn.disabled = state.atp < cost || state.isGameOver;
      const active = state.powerUps.find((p) => p.type === powerup);
      if (active) {
        btn.classList.add('active');
        btn.textContent = `${powerup.toUpperCase()} (${Math.ceil(active.remainingMs / 1000)}s)`;
      } else {
        btn.classList.remove('active');
        const name = powerup === 'dcas9_shield' ? 'dCas9 Shield' : powerup === 'prime_editor' ? 'Prime Edit (+40)' : powerup === 'base_editor' ? 'Base Edit (C→T)' : 'Hyper-Drive';
        btn.textContent = `${name} (${cost} ATP)`;
      }
    });
  }

  function gameLoop(timestamp: number) {
    if (!lastTimestamp) lastTimestamp = timestamp;
    const dt = Math.min(0.1, (timestamp - lastTimestamp) / 1000);
    lastTimestamp = timestamp;

    const { state: nextState, cleavedStrands, breaches } = updateGameState(
      state,
      dt,
      pendingSlices,
      canvas!.clientWidth,
      canvas!.clientHeight
    );
    pendingSlices = [];

    if (cleavedStrands.length > 0) {
      cleavedStrands.forEach((cleaved) => {
        sound.playCleave(1.0 + Math.min(1.5, state.combo * 0.1));
        if (cleaved.health <= 0) sound.playDsbBass();
        createSparks(cleaved.x * canvas!.clientWidth, cleaved.y * canvas!.clientHeight, cleaved.color, 24);
        addFloatingText(
          cleaved.x * canvas!.clientWidth,
          cleaved.y * canvas!.clientHeight,
          `+${cleaved.points} DSB`,
          cleaved.color
        );
      });
    }

    if (breaches.length > 0) {
      sound.playDamage();
      breaches.forEach((b) => {
        addFloatingText(b.x * canvas!.clientWidth, canvas!.clientHeight * 0.9, '-15% INTEGRITY', '#f43f5e');
      });
    }

    if (nextState.isGameOver && !state.isGameOver) {
      try {
        localStorage.setItem(STORAGE_KEY, String(nextState.highScore));
      } catch {}
    }

    state = nextState;

    render();
    updateHUD();

    animationFrameId = requestAnimationFrame(gameLoop);
  }

  function onThemeChange() {
    palette = getThemePalette();
    render();
    updateHUD();
  }

  // Pointer / Touch slicing handlers
  function handlePointerDown(e: MouseEvent | TouchEvent) {
    if (state.isGameOver || state.isPaused) return;
    isPointerDown = true;
    const pt = 'touches' in e ? e.touches[0] : e;
    pointerPos = getCanvasPos(pt);
    slicePoints = [pointerPos];
  }

  function handlePointerMove(e: MouseEvent | TouchEvent) {
    const pt = 'touches' in e ? e.touches[0] : e;
    const newPos = getCanvasPos(pt);
    pointerPos = newPos;
    isPointerInside = true;
    if (!isPointerDown) return;

    if (slicePoints.length > 0) {
      const prev = slicePoints[slicePoints.length - 1];
      pendingSlices.push({
        x1: prev.x,
        y1: prev.y,
        x2: newPos.x,
        y2: newPos.y,
        time: Date.now(),
      });
    }

    slicePoints.push(newPos);
    if (slicePoints.length > 8) slicePoints.shift();
  }

  function handlePointerUp() {
    isPointerDown = false;
    slicePoints = [];
  }

  canvas.addEventListener('mousedown', handlePointerDown);
  window.addEventListener('mousemove', handlePointerMove);
  window.addEventListener('mouseup', handlePointerUp);

  canvas.addEventListener('touchstart', (e) => {
    e.preventDefault();
    handlePointerDown(e);
  }, { passive: false });
  canvas.addEventListener('touchmove', (e) => {
    e.preventDefault();
    handlePointerMove(e);
  }, { passive: false });
  canvas.addEventListener('touchend', handlePointerUp);

  canvas.addEventListener('mouseenter', () => {
    isPointerInside = true;
  });
  canvas.addEventListener('mouseleave', () => {
    isPointerInside = false;
  });

  // Enzyme switcher buttons
  enzymeBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      const enzyme = btn.getAttribute('data-enzyme') as CasType;
      if (enzyme) {
        state = switchCasEnzyme(state, enzyme);
        addFloatingText(pointerPos.x || 100, pointerPos.y || 100, enzyme, '#38bdf8');
        updateHUD();
      }
    });
  });

  // Powerup buttons
  powerupBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      const powerup = btn.getAttribute('data-powerup') as PowerUpType;
      if (powerup) {
        state = activatePowerUp(state, powerup);
        sound.playPowerUp();
        addFloatingText(canvas!.clientWidth / 2, canvas!.clientHeight / 2, powerup.toUpperCase(), '#f59e0b');
        updateHUD();
      }
    });
  });

  // Controls
  if (restartBtn) {
    restartBtn.addEventListener('click', () => {
      state = createInitialState(state.highScore);
      particles = [];
      floatingTexts = [];
      slicePoints = [];
      pendingSlices = [];
      updateHUD();
    });
  }

  if (pauseBtn) {
    pauseBtn.addEventListener('click', () => {
      state = state.isPaused ? { ...state, isPaused: false } : { ...state, isPaused: true };
      updateHUD();
    });
  }

  if (soundBtn) {
    soundBtn.addEventListener('click', () => {
      sound.enabled = !sound.enabled;
      soundBtn.setAttribute('aria-pressed', String(sound.enabled));
      soundBtn.textContent = sound.enabled ? 'Sound on' : 'Sound off';
    });
  }

  // Keyboard enzyme hotkeys (1, 2)
  function handleKeyDown(e: KeyboardEvent) {
    if (e.key === '1') state = switchCasEnzyme(state, 'SpCas9');
    else if (e.key === '2') state = switchCasEnzyme(state, 'AsCas12a');
    else if (e.key.toLowerCase() === 'p') {
      state = state.isPaused ? { ...state, isPaused: false } : { ...state, isPaused: true };
    }
    updateHUD();
  }
  window.addEventListener('keydown', handleKeyDown);

  window.addEventListener('resize', resizeCanvas);
  document.addEventListener('khc:theme-change', onThemeChange);
  resizeCanvas();
  updateHUD();

  animationFrameId = requestAnimationFrame(gameLoop);

  const controller = {
    state: () => state,
    restart: () => {
      state = createInitialState(state.highScore);
    },
    destroy: () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener('resize', resizeCanvas);
      window.removeEventListener('mousemove', handlePointerMove);
      window.removeEventListener('mouseup', handlePointerUp);
      window.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('khc:theme-change', onThemeChange);
      if (win.__crisprCommander === controller) {
        delete win.__crisprCommander;
      }
      win.__crisprCommanderInstances = Math.max(0, (win.__crisprCommanderInstances || 1) - 1);
    },
  };

  win.__crisprCommander = controller;
  return controller.destroy;
}
