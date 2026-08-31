/**
 * Phage Defense — Canvas 2D Renderer & Game Loop
 */

import {
  createInitialDefenseState,
  startNextWave,
  placeTower,
  upgradeTower,
  canPlaceTower,
  updateDefenseGame,
  TOWER_DEFINITIONS,
  type DefenseGameState,
  type TowerType,
  type ActiveTower,
} from '../lib/phageDefense';

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
}

const STORAGE_KEY = 'khc_phage_defense_highscore';

class DefenseSoundController {
  private ctx: AudioContext | null = null;
  public enabled = true;

  private init() {
    if (!this.ctx && typeof window !== 'undefined') {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) this.ctx = new AudioCtx();
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  playShoot(type: TowerType) {
    if (!this.enabled) return;
    this.init();
    if (!this.ctx) return;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    const now = this.ctx.currentTime;

    if (type === 'crispr_cas9') {
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(320, now);
      osc.frequency.exponentialRampToValueAtTime(80, now + 0.15);
      gain.gain.setValueAtTime(0.18, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(now);
      osc.stop(now + 0.15);
    } else {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(600, now);
      osc.frequency.exponentialRampToValueAtTime(200, now + 0.08);
      gain.gain.setValueAtTime(0.1, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(now);
      osc.stop(now + 0.08);
    }
  }

  playDefeat() {
    if (!this.enabled) return;
    this.init();
    if (!this.ctx) return;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    const now = this.ctx.currentTime;

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(220, now);
    osc.frequency.exponentialRampToValueAtTime(440, now + 0.08);
    gain.gain.setValueAtTime(0.12, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);

    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + 0.09);
  }

  playWaveStart() {
    if (!this.enabled) return;
    this.init();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    [261.63, 329.63, 392.0, 523.25].forEach((freq, i) => {
      const osc = this.ctx!.createOscillator();
      const gain = this.ctx!.createGain();
      const startTime = now + i * 0.06;

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, startTime);
      gain.gain.setValueAtTime(0.15, startTime);
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.12);

      osc.connect(gain);
      gain.connect(this.ctx!.destination);
      osc.start(startTime);
      osc.stop(startTime + 0.12);
    });
  }

  playBreach() {
    if (!this.enabled) return;
    this.init();
    if (!this.ctx) return;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    const now = this.ctx.currentTime;

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(90, now);
    osc.frequency.linearRampToValueAtTime(40, now + 0.3);
    gain.gain.setValueAtTime(0.25, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + 0.35);
  }
}

export function initPhageDefense(containerEl: HTMLElement) {
  const canvas = containerEl.querySelector<HTMLCanvasElement>('[data-phage-canvas]');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const scoreEl = containerEl.querySelector('[data-phage-score]');
  const bestEl = containerEl.querySelector('[data-phage-best]');
  const atpEl = containerEl.querySelector('[data-phage-atp]');
  const waveEl = containerEl.querySelector('[data-phage-wave]');
  const viabilityBar = containerEl.querySelector<HTMLElement>('[data-phage-viability-fill]');
  const viabilityText = containerEl.querySelector('[data-phage-viability-text]');
  const nextWaveBtn = containerEl.querySelector<HTMLButtonElement>('[data-phage-next-wave]');
  const pauseBtn = containerEl.querySelector<HTMLButtonElement>('[data-phage-pause]');
  const restartBtn = containerEl.querySelector<HTMLButtonElement>('[data-phage-restart]');
  const soundBtn = containerEl.querySelector<HTMLButtonElement>('[data-phage-sound]');
  const towerBuildCards = containerEl.querySelectorAll<HTMLButtonElement>('[data-tower-type]');
  const selectedTowerPanel = containerEl.querySelector<HTMLElement>('[data-selected-tower-panel]');
  const upgradeBtn = containerEl.querySelector<HTMLButtonElement>('[data-tower-upgrade-btn]');

  const sound = new DefenseSoundController();
  let savedHigh = 0;
  try {
    savedHigh = parseInt(localStorage.getItem(STORAGE_KEY) || '0', 10) || 0;
  } catch {}

  let state: DefenseGameState = createInitialDefenseState(savedHigh);
  let particles: Particle[] = [];
  let selectedBuildType: TowerType | null = null;
  let selectedTower: ActiveTower | null = null;
  let mousePos = { x: 0, y: 0 };
  let isMouseInside = false;
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

  function createExplosion(x: number, y: number, color: string) {
    for (let i = 0; i < 16; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 1.2 + Math.random() * 3.8;
      particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        size: 2 + Math.random() * 4,
        color,
        alpha: 1,
        life: 0,
        maxLife: 25 + Math.random() * 15,
      });
    }
  }

  function render() {
    if (!canvas || !ctx) return;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;

    ctx.clearRect(0, 0, w, h);

    // 1. Draw Cellular Cytoplasm Map Background
    ctx.fillStyle = '#060a12';
    ctx.fillRect(0, 0, w, h);

    // Membrane outer border
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.2)';
    ctx.lineWidth = 6;
    ctx.strokeRect(3, 3, w - 6, h - 6);

    // 2. Draw Waypoint Cytosolic Pathway
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.12)';
    ctx.lineWidth = 32;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(state.waypoints[0].x, state.waypoints[0].y);
    for (let i = 1; i < state.waypoints.length; i++) {
      ctx.lineTo(state.waypoints[i].x, state.waypoints[i].y);
    }
    ctx.stroke();

    // Central dashed path track
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.4)';
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 6]);
    ctx.stroke();
    ctx.setLineDash([]);

    // 3. Draw Destination Nucleoid (Target Circular Plasmid Core)
    const dest = state.waypoints[state.waypoints.length - 1];
    ctx.shadowColor = '#10b981';
    ctx.shadowBlur = 18;
    ctx.fillStyle = 'rgba(16, 185, 129, 0.2)';
    ctx.beginPath();
    ctx.arc(dest.x, dest.y, 42, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = '#10b981';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(dest.x, dest.y, 36, 0, Math.PI * 2);
    ctx.stroke();
    ctx.shadowBlur = 0;

    ctx.fillStyle = '#10b981';
    ctx.font = 'bold 10px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('NUCLEOID', dest.x, dest.y - 6);
    ctx.fillText('CORE', dest.x, dest.y + 7);

    // 4. Draw Towers
    for (const t of state.towers) {
      const def = TOWER_DEFINITIONS[t.type];
      const isSelected = selectedTower?.id === t.id;

      // Range indicator if selected
      if (isSelected) {
        ctx.strokeStyle = 'rgba(56, 189, 248, 0.35)';
        ctx.fillStyle = 'rgba(56, 189, 248, 0.06)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        const range = def.range * (1 + (t.level - 1) * 0.15);
        ctx.arc(t.x, t.y, range, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }

      // Base circle
      ctx.shadowColor = def.color;
      ctx.shadowBlur = 10;
      ctx.fillStyle = '#1e293b';
      ctx.strokeStyle = def.color;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(t.x, t.y, 18, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.shadowBlur = 0;

      // Level stars / dots
      ctx.fillStyle = def.color;
      ctx.font = 'bold 10px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(`L${t.level}`, t.x, t.y);

      // Targeting line to active target
      if (t.targetId) {
        const target = state.phages.find((p) => p.id === t.targetId);
        if (target) {
          ctx.strokeStyle = def.color;
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.moveTo(t.x, t.y);
          ctx.lineTo(target.x, target.y);
          ctx.stroke();
        }
      }
    }

    // 5. Draw Phages
    for (const p of state.phages) {
      ctx.shadowColor = p.color;
      ctx.shadowBlur = 12;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;

      // Health bar above phage
      const barW = p.radius * 2 + 4;
      const barH = 3;
      const barX = p.x - barW / 2;
      const barY = p.y - p.radius - 6;
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(barX, barY, barW, barH);
      ctx.fillStyle = '#10b981';
      const fillW = Math.max(0, (p.health / p.maxHealth) * barW);
      ctx.fillRect(barX, barY, fillW, barH);
    }

    // 6. Draw Tower Build Placement Preview
    if (selectedBuildType && isMouseInside) {
      const def = TOWER_DEFINITIONS[selectedBuildType];
      const valid = canPlaceTower(state.towers, mousePos.x, mousePos.y, state.waypoints) && state.atp >= def.cost;

      ctx.strokeStyle = valid ? 'rgba(16, 185, 129, 0.7)' : 'rgba(244, 63, 94, 0.7)';
      ctx.fillStyle = valid ? 'rgba(16, 185, 129, 0.12)' : 'rgba(244, 63, 94, 0.12)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(mousePos.x, mousePos.y, def.range, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = valid ? def.color : '#f43f5e';
      ctx.beginPath();
      ctx.arc(mousePos.x, mousePos.y, 18, 0, Math.PI * 2);
      ctx.fill();
    }

    // 7. Update & Draw Particles
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

      if (p.life >= p.maxLife) particles.splice(i, 1);
    }

    // 8. Game Over / Victory / Pause Overlays
    if (state.isGameOver) {
      ctx.fillStyle = 'rgba(6, 10, 18, 0.88)';
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#f43f5e';
      ctx.font = 'bold 32px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('CELL LYSIS — NUCLEOID DESTROYED', w / 2, h / 2 - 25);
      ctx.fillStyle = '#e2e8f0';
      ctx.font = '16px monospace';
      ctx.fillText(`Final Score: ${state.score}  ·  Waves Survived: ${state.currentWave}`, w / 2, h / 2 + 15);
    } else if (state.isVictory) {
      ctx.fillStyle = 'rgba(6, 10, 18, 0.88)';
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#10b981';
      ctx.font = 'bold 32px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('CELL SURVIVAL VICTORY!', w / 2, h / 2 - 25);
      ctx.fillStyle = '#e2e8f0';
      ctx.font = '16px monospace';
      ctx.fillText(`All 15 Phage Waves Repelled! Score: ${state.score}`, w / 2, h / 2 + 15);
    } else if (state.isPaused) {
      ctx.fillStyle = 'rgba(6, 10, 18, 0.7)';
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
    if (atpEl) atpEl.textContent = `${state.atp} ATP`;
    if (waveEl) waveEl.textContent = `Wave ${state.currentWave} / ${state.totalWaves}`;

    if (viabilityBar) {
      const pct = Math.max(0, (state.cellViability / state.maxViability) * 100);
      viabilityBar.style.width = `${pct}%`;
      viabilityBar.style.backgroundColor = pct > 50 ? '#10b981' : pct > 25 ? '#f59e0b' : '#f43f5e';
    }
    if (viabilityText) viabilityText.textContent = `${state.cellViability}%`;

    if (nextWaveBtn) {
      nextWaveBtn.disabled = state.isWaveActive || state.isGameOver || state.isVictory;
      nextWaveBtn.textContent = state.isWaveActive ? 'Wave in Progress…' : 'Start Next Wave';
    }

    if (pauseBtn) {
      pauseBtn.textContent = state.isPaused ? 'Resume' : 'Pause';
      pauseBtn.disabled = state.isGameOver || state.isVictory;
    }

    towerBuildCards.forEach((card) => {
      const type = card.getAttribute('data-tower-type') as TowerType;
      const def = TOWER_DEFINITIONS[type];
      card.disabled = state.atp < def.cost || state.isGameOver;
      if (selectedBuildType === type) card.classList.add('selected');
      else card.classList.remove('selected');
    });

    if (selectedTowerPanel) {
      if (selectedTower) {
        selectedTowerPanel.style.display = 'block';
        const def = TOWER_DEFINITIONS[selectedTower.type];
        const cost = Math.round(def.cost * (selectedTower.level * 0.85));
        const nameEl = selectedTowerPanel.querySelector('[data-tower-info-name]');
        const lvlEl = selectedTowerPanel.querySelector('[data-tower-info-lvl]');
        if (nameEl) nameEl.textContent = def.name;
        if (lvlEl) lvlEl.textContent = `Level ${selectedTower.level}`;
        if (upgradeBtn) {
          upgradeBtn.disabled = selectedTower.level >= 3 || state.atp < cost;
          upgradeBtn.textContent = selectedTower.level >= 3 ? 'Max Level' : `Upgrade (${cost} ATP)`;
        }
      } else {
        selectedTowerPanel.style.display = 'none';
      }
    }
  }

  function gameLoop(timestamp: number) {
    if (!lastTimestamp) lastTimestamp = timestamp;
    const dt = Math.min(0.1, (timestamp - lastTimestamp) / 1000);
    lastTimestamp = timestamp;

    const { state: nextState, defeatedPhages, breachedPhages } = updateDefenseGame(state, dt);

    if (defeatedPhages.length > 0) {
      defeatedPhages.forEach((p) => {
        sound.playDefeat();
        createExplosion(p.x, p.y, p.color);
      });
    }

    if (breachedPhages.length > 0) {
      sound.playBreach();
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

  // Click & Interaction handlers
  canvas.addEventListener('mousemove', (e) => {
    isMouseInside = true;
    mousePos = getCanvasPos(e);
  });
  canvas.addEventListener('mouseleave', () => {
    isMouseInside = false;
  });

  canvas.addEventListener('click', (e) => {
    const pos = getCanvasPos(e);

    // If build mode active:
    if (selectedBuildType) {
      const { state: nextState, success } = placeTower(state, selectedBuildType, pos.x, pos.y);
      if (success) {
        state = nextState;
        sound.playShoot(selectedBuildType);
        selectedBuildType = null;
        updateHUD();
      }
      return;
    }

    // Check if clicked an existing tower
    let clickedTower: ActiveTower | null = null;
    for (const t of state.towers) {
      if (Math.hypot(t.x - pos.x, t.y - pos.y) <= 22) {
        clickedTower = t;
        break;
      }
    }
    selectedTower = clickedTower;
    updateHUD();
  });

  towerBuildCards.forEach((card) => {
    card.addEventListener('click', () => {
      const type = card.getAttribute('data-tower-type') as TowerType;
      if (selectedBuildType === type) {
        selectedBuildType = null;
      } else {
        selectedBuildType = type;
        selectedTower = null;
      }
      updateHUD();
    });
  });

  if (upgradeBtn) {
    upgradeBtn.addEventListener('click', () => {
      if (!selectedTower) return;
      const { state: nextState, success } = upgradeTower(state, selectedTower.id);
      if (success) {
        state = nextState;
        selectedTower = state.towers.find((t) => t.id === selectedTower!.id) || null;
        updateHUD();
      }
    });
  }

  if (nextWaveBtn) {
    nextWaveBtn.addEventListener('click', () => {
      state = startNextWave(state);
      sound.playWaveStart();
      updateHUD();
    });
  }

  if (restartBtn) {
    restartBtn.addEventListener('click', () => {
      state = createInitialDefenseState(state.highScore);
      selectedBuildType = null;
      selectedTower = null;
      particles = [];
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

  window.addEventListener('resize', resizeCanvas);
  resizeCanvas();
  updateHUD();

  animationFrameId = requestAnimationFrame(gameLoop);

  return () => {
    cancelAnimationFrame(animationFrameId);
    window.removeEventListener('resize', resizeCanvas);
  };
}
