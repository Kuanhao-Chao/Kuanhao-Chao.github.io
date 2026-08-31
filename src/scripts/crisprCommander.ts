/**
 * CRISPR Commander — Canvas 2D Renderer & Game Loop
 */

import {
  createInitialState,
  updateGameState,
  activatePowerUp,
  type GameState,
  type SliceLine,
  type PowerUpType,
} from '../lib/crisprCommander';

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

const STORAGE_KEY = 'khc_crispr_commander_highscore';

class SoundController {
  private ctx: AudioContext | null = null;
  public enabled = true;

  private init() {
    if (!this.ctx && typeof window !== 'undefined') {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
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
  const canvas = containerEl.querySelector<HTMLCanvasElement>('[data-crispr-canvas]');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const scoreEl = containerEl.querySelector('[data-crispr-score]');
  const bestEl = containerEl.querySelector('[data-crispr-best]');
  const comboEl = containerEl.querySelector('[data-crispr-combo]');
  const atpEl = containerEl.querySelector('[data-crispr-atp]');
  const levelEl = containerEl.querySelector('[data-crispr-level]');
  const integrityBar = containerEl.querySelector<HTMLElement>('[data-crispr-integrity-fill]');
  const integrityText = containerEl.querySelector('[data-crispr-integrity-text]');
  const pauseBtn = containerEl.querySelector<HTMLButtonElement>('[data-crispr-pause]');
  const restartBtn = containerEl.querySelector<HTMLButtonElement>('[data-crispr-restart]');
  const soundBtn = containerEl.querySelector<HTMLButtonElement>('[data-crispr-sound]');
  const powerUpBtns = containerEl.querySelectorAll<HTMLButtonElement>('[data-crispr-powerup]');

  const sound = new SoundController();
  let savedHigh = 0;
  try {
    savedHigh = parseInt(localStorage.getItem(STORAGE_KEY) || '0', 10) || 0;
  } catch {}

  let state: GameState = createInitialState(savedHigh);
  let particles: Particle[] = [];
  let currentSlice: { x: number; y: number }[] = [];
  let isPointerDown = false;
  let lastTimestamp = 0;
  let animationFrameId = 0;

  function resizeCanvas() {
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);
    ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function getCanvasPos(e: MouseEvent | Touch): { x: number; y: number } {
    const rect = canvas!.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
  }

  function createDebris(x: number, y: number, color: string, seq: string) {
    const count = 14;
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 1.5 + Math.random() * 4.5;
      const base = seq[i % seq.length] || 'N';
      particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        size: 8 + Math.random() * 6,
        color,
        alpha: 1,
        life: 0,
        maxLife: 30 + Math.random() * 20,
        text: base,
      });
    }
  }

  function render() {
    if (!canvas || !ctx) return;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;

    ctx.clearRect(0, 0, w, h);

    // 1. Draw cellular background & host genome boundary
    ctx.fillStyle = '#090d16';
    ctx.fillRect(0, 0, w, h);

    // Grid matrix
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.06)';
    ctx.lineWidth = 1;
    const gridSize = 40;
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
    const gradient = ctx.createLinearGradient(0, dangerY - 20, 0, h);
    gradient.addColorStop(0, 'rgba(244, 63, 94, 0.0)');
    gradient.addColorStop(1, 'rgba(244, 63, 94, 0.2)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, dangerY - 20, w, h - dangerY + 20);

    ctx.strokeStyle = '#f43f5e';
    ctx.lineWidth = 2;
    ctx.setLineDash([8, 6]);
    ctx.beginPath();
    ctx.moveTo(0, dangerY);
    ctx.lineTo(w, dangerY);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = 'rgba(244, 63, 94, 0.8)';
    ctx.font = '11px monospace';
    ctx.fillText('HOST GENOME CORE INTEGRATION THRESHOLD', 12, dangerY - 6);

    // 2. Draw viral strands
    for (const strand of state.strands) {
      const px = strand.x * w;
      const py = strand.y * h;

      // Glow backing
      ctx.shadowColor = strand.color;
      ctx.shadowBlur = 12;
      ctx.fillStyle = strand.color;
      ctx.beginPath();
      ctx.arc(px, py, strand.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;

      // Inner nucleotide circle
      ctx.fillStyle = '#090d16';
      ctx.beginPath();
      ctx.arc(px, py, strand.radius - 4, 0, Math.PI * 2);
      ctx.fill();

      // Sequence label
      ctx.fillStyle = strand.color;
      ctx.font = 'bold 12px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(strand.sequence.slice(0, 5), px, py - 2);

      // PAM badge
      ctx.font = '9px monospace';
      ctx.fillStyle = '#f59e0b';
      ctx.fillText(`PAM:${strand.pamSequence}`, px, py + 10);

      // Health bar for boss/armored units
      if (strand.maxHealth > 1) {
        const barW = strand.radius * 2;
        const barH = 4;
        const barX = px - strand.radius;
        const barY = py - strand.radius - 8;
        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        ctx.fillRect(barX, barY, barW, barH);
        ctx.fillStyle = '#f43f5e';
        const fillW = (strand.health / strand.maxHealth) * barW;
        ctx.fillRect(barX, barY, fillW, barH);
      }
    }

    // 3. Draw slicing trails
    if (currentSlice.length >= 2) {
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 4;
      ctx.shadowColor = '#38bdf8';
      ctx.shadowBlur = 16;
      ctx.beginPath();
      ctx.moveTo(currentSlice[0].x, currentSlice[0].y);
      for (let i = 1; i < currentSlice.length; i++) {
        ctx.lineTo(currentSlice[i].x, currentSlice[i].y);
      }
      ctx.stroke();
      ctx.shadowBlur = 0;
    }

    // 4. Update & draw debris particles
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.08; // gravity
      p.life++;
      p.alpha = Math.max(0, 1 - p.life / p.maxLife);

      ctx.save();
      ctx.globalAlpha = p.alpha;
      ctx.fillStyle = p.color;
      if (p.text) {
        ctx.font = `bold ${p.size}px monospace`;
        ctx.textAlign = 'center';
        ctx.fillText(p.text, p.x, p.y);
      } else {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();

      if (p.life >= p.maxLife) {
        particles.splice(i, 1);
      }
    }

    // 5. Active Power-Up Overlay Shields
    const hasShield = state.powerUps.some((p) => p.type === 'dcas9_shield');
    if (hasShield) {
      ctx.strokeStyle = 'rgba(168, 85, 247, 0.4)';
      ctx.lineWidth = 6;
      ctx.strokeRect(4, 4, w - 8, h - 8);
    }

    // 6. Game Over / Paused Overlay
    if (state.isGameOver) {
      ctx.fillStyle = 'rgba(9, 13, 22, 0.85)';
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#f43f5e';
      ctx.font = 'bold 32px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('CELL VIABILITY DEPLETED', w / 2, h / 2 - 30);
      ctx.fillStyle = '#e2e8f0';
      ctx.font = '16px monospace';
      ctx.fillText(`Final Score: ${state.score}  ·  Max Combo: ${state.maxCombo}x`, w / 2, h / 2 + 10);
      ctx.fillStyle = '#94a3b8';
      ctx.font = '14px sans-serif';
      ctx.fillText('Click Restart to initiate Cas9 reboot sequence', w / 2, h / 2 + 45);
    } else if (state.isPaused) {
      ctx.fillStyle = 'rgba(9, 13, 22, 0.7)';
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#38bdf8';
      ctx.font = 'bold 28px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('PAUSED', w / 2, h / 2);
    }
  }

  function updateHUD() {
    if (scoreEl) scoreEl.textContent = state.score.toLocaleString();
    if (bestEl) bestEl.textContent = state.highScore.toLocaleString();
    if (comboEl) comboEl.textContent = `${state.combo}x`;
    if (atpEl) atpEl.textContent = `${state.atp} ATP`;
    if (levelEl) levelEl.textContent = `Lvl ${state.level}`;

    if (integrityBar) {
      const pct = Math.max(0, (state.cellIntegrity / state.maxCellIntegrity) * 100);
      integrityBar.style.width = `${pct}%`;
      integrityBar.style.backgroundColor = pct > 50 ? '#10b981' : pct > 25 ? '#f59e0b' : '#f43f5e';
    }
    if (integrityText) {
      integrityText.textContent = `${state.cellIntegrity}%`;
    }

    powerUpBtns.forEach((btn) => {
      const cost = parseInt(btn.getAttribute('data-cost') || '0', 10);
      btn.disabled = state.atp < cost || state.isGameOver;
    });

    if (pauseBtn) {
      pauseBtn.textContent = state.isPaused ? 'Resume' : 'Pause';
      pauseBtn.disabled = state.isGameOver;
    }
  }

  function gameLoop(timestamp: number) {
    if (!lastTimestamp) lastTimestamp = timestamp;
    const dt = Math.min(0.1, (timestamp - lastTimestamp) / 1000);
    lastTimestamp = timestamp;

    const w = canvas!.clientWidth;
    const h = canvas!.clientHeight;

    // Convert current slice path into segments
    const sliceSegments: SliceLine[] = [];
    if (currentSlice.length >= 2) {
      for (let i = 0; i < currentSlice.length - 1; i++) {
        sliceSegments.push({
          x1: currentSlice[i].x,
          y1: currentSlice[i].y,
          x2: currentSlice[i + 1].x,
          y2: currentSlice[i + 1].y,
          time: timestamp,
        });
      }
    }

    const { state: nextState, cleavedStrands, breaches } = updateGameState(
      state,
      dt,
      sliceSegments,
      w,
      h
    );

    // Audio & particles on events
    if (cleavedStrands.length > 0) {
      cleavedStrands.forEach((s) => {
        const pitch = 1.0 + Math.min(nextState.combo * 0.05, 1.2);
        sound.playCleave(pitch);
        if (s.type === 'acr_boss') sound.playDsbBass();
        createDebris(s.x * w, s.y * h, s.color, s.sequence);
      });
    }

    if (breaches.length > 0) {
      sound.playDamage();
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

  // Event Listeners
  function onPointerDown(e: MouseEvent | TouchEvent) {
    if (state.isGameOver || state.isPaused) return;
    isPointerDown = true;
    const point = 'touches' in e ? getCanvasPos(e.touches[0]) : getCanvasPos(e);
    currentSlice = [point];
  }

  function onPointerMove(e: MouseEvent | TouchEvent) {
    if (!isPointerDown) return;
    const point = 'touches' in e ? getCanvasPos(e.touches[0]) : getCanvasPos(e);
    currentSlice.push(point);
    if (currentSlice.length > 6) currentSlice.shift();
  }

  function onPointerUp() {
    isPointerDown = false;
    currentSlice = [];
  }

  canvas.addEventListener('mousedown', onPointerDown);
  window.addEventListener('mousemove', onPointerMove);
  window.addEventListener('mouseup', onPointerUp);

  canvas.addEventListener('touchstart', onPointerDown, { passive: true });
  window.addEventListener('touchmove', onPointerMove, { passive: true });
  window.addEventListener('touchend', onPointerUp);

  window.addEventListener('resize', resizeCanvas);
  resizeCanvas();

  // Control Buttons
  if (restartBtn) {
    restartBtn.addEventListener('click', () => {
      state = createInitialState(state.highScore);
      particles = [];
      currentSlice = [];
      updateHUD();
    });
  }

  if (pauseBtn) {
    pauseBtn.addEventListener('click', () => {
      state.isPaused = !state.isPaused;
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

  powerUpBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      const type = btn.getAttribute('data-powerup') as PowerUpType;
      if (type) {
        state = activatePowerUp(state, type);
        sound.playPowerUp();
        updateHUD();
      }
    });
  });

  updateHUD();
  animationFrameId = requestAnimationFrame(gameLoop);

  return () => {
    cancelAnimationFrame(animationFrameId);
    window.removeEventListener('resize', resizeCanvas);
    window.removeEventListener('mousemove', onPointerMove);
    window.removeEventListener('mouseup', onPointerUp);
    window.removeEventListener('touchmove', onPointerMove);
    window.removeEventListener('touchend', onPointerUp);
  };
}
