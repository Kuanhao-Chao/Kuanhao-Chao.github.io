/**
 * Phage Defense — Canvas 2D Renderer & Game Loop
 * Features dynamic Light/Dark theme palette synchronization and biological viral morphology
 */

import {
  createInitialDefenseState,
  startNextWave,
  placeTower,
  upgradeTower,
  sellTower,
  setTowerPriority,
  activateEmergencyAbility,
  canPlaceTower,
  updateDefenseGame,
  TOWER_DEFINITIONS,
  EMERGENCY_ABILITIES,
  generateWaveQueue,
  VIRTUAL_WIDTH,
  VIRTUAL_HEIGHT,
  type DefenseGameState,
  type TowerType,
  type ActiveTower,
  type TargetPriority,
  type EmergencyAbilityType,
} from '../lib/phageDefense';
import { isDarkTheme } from '../lib/theme';
import { createGameClock } from '../lib/gameClock';

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

interface Organelle {
  x: number;
  y: number;
  radius: number;
  vx: number;
  vy: number;
  type: 'ribosome' | 'protein';
  color: string;
}

const STORAGE_KEY = 'khc_phage_defense_highscore';

interface DefenseThemePalette {
  isDark: boolean;
  bg: string;
  membrane: string;
  pathTrack: string;
  pathLine: string;
  nucleoidFill: string;
  nucleoidStroke: string;
  nucleoidText: string;
  towerBody: string;
  ink: string;
  muted: string;
  overlayBg: string;
}

function getDefenseThemePalette(): DefenseThemePalette {
  const isDark = isDarkTheme();

  if (isDark) {
    return {
      isDark: true,
      bg: '#050811',
      membrane: 'rgba(56, 189, 248, 0.25)',
      pathTrack: 'rgba(56, 189, 248, 0.12)',
      pathLine: 'rgba(56, 189, 248, 0.45)',
      nucleoidFill: 'rgba(16, 185, 129, 0.18)',
      nucleoidStroke: '#10b981',
      nucleoidText: '#10b981',
      towerBody: '#1e293b',
      ink: '#f8fafc',
      muted: '#94a3b8',
      overlayBg: 'rgba(5, 8, 17, 0.90)',
    };
  }

  return {
    isDark: false,
    bg: '#f8fafc',
    membrane: 'rgba(2, 132, 199, 0.25)',
    pathTrack: 'rgba(226, 232, 240, 0.85)',
    pathLine: 'rgba(2, 132, 199, 0.65)',
    nucleoidFill: 'rgba(16, 185, 129, 0.12)',
    nucleoidStroke: '#059669',
    nucleoidText: '#047857',
    towerBody: '#ffffff',
    ink: '#0f172a',
    muted: '#64748b',
    overlayBg: 'rgba(248, 250, 252, 0.92)',
  };
}

class DefenseSoundController {
  private ctx: AudioContext | null = null;
  public enabled = false;
  destroy() { void this.ctx?.close().catch(() => {}); this.ctx = null; }

  private init() {
    if (!this.ctx && typeof window !== 'undefined') {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
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
      osc.frequency.setValueAtTime(420, now);
      osc.frequency.exponentialRampToValueAtTime(70, now + 0.18);
      gain.gain.setValueAtTime(0.18, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(now);
      osc.stop(now + 0.18);
    } else {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(580, now);
      osc.frequency.exponentialRampToValueAtTime(180, now + 0.08);
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
    osc.frequency.exponentialRampToValueAtTime(480, now + 0.1);
    gain.gain.setValueAtTime(0.14, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.11);

    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + 0.11);
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

  playAbility() {
    if (!this.enabled) return;
    this.init();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    [349.23, 440.0, 554.37, 659.25, 880.0].forEach((freq, i) => {
      const osc = this.ctx!.createOscillator();
      const gain = this.ctx!.createGain();
      const startTime = now + i * 0.04;

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(freq, startTime);
      gain.gain.setValueAtTime(0.12, startTime);
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
  // Global instance tracking for single-instance SPA safety
  const win = window as unknown as {
    __phageDefense?: { state: () => DefenseGameState; restart: () => void; destroy: () => void };
    __phageDefenseInstances?: number;
  };
  win.__phageDefenseInstances = (win.__phageDefenseInstances || 0) + 1;

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
  const emergencyBtns = containerEl.querySelectorAll<HTMLButtonElement>('[data-emergency-ability]');
  const selectedTowerPanel = containerEl.querySelector<HTMLElement>('[data-selected-tower-panel]');
  const upgradeBtn = containerEl.querySelector<HTMLButtonElement>('[data-tower-upgrade-btn]');
  const sellBtn = containerEl.querySelector<HTMLButtonElement>('[data-tower-sell-btn]');
  const priorityBtns = containerEl.querySelectorAll<HTMLButtonElement>('[data-tower-priority]');

  const sound = new DefenseSoundController();
  try { sound.enabled = localStorage.getItem('khc_phage_sound') === 'true'; } catch {}
  const abort = new AbortController();
  const { signal } = abort;
  const clock = createGameClock();
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const previewEl = containerEl.querySelector<HTMLElement>('[data-phage-preview]');
  const confirmBtn = containerEl.querySelector<HTMLButtonElement>('[data-phage-confirm]');
  const cancelBtn = containerEl.querySelector<HTMLButtonElement>('[data-phage-cancel]');
  const speedBtn = containerEl.querySelector<HTMLButtonElement>('[data-phage-speed]');
  const towerSelect = containerEl.querySelector<HTMLSelectElement>('[data-phage-tower-select]');
  let towerList = '';
  let speed = 1;
  let touchPlacement = false;
  let savedHigh = 0;
  try {
    savedHigh = parseInt(localStorage.getItem(STORAGE_KEY) || '0', 10) || 0;
  } catch {}

  let state: DefenseGameState = createInitialDefenseState(savedHigh);
  let palette: DefenseThemePalette = getDefenseThemePalette();
  let particles: Particle[] = [];
  let floatingTexts: FloatingText[] = [];
  let organelles: Organelle[] = [];
  let selectedBuildType: TowerType | null = null;
  let selectedTower: ActiveTower | null = null;
  let mousePos = { x: 0, y: 0 };
  let isMouseInside = false;
  let animTick = 0;
  let lastTimestamp = 0;
  let animationFrameId = 0;

  // Initialize decorative cytoplasmic organelles
  for (let i = 0; i < 18; i++) {
    organelles.push({
      x: Math.random() * VIRTUAL_WIDTH,
      y: Math.random() * VIRTUAL_HEIGHT,
      radius: 4 + Math.random() * 8,
      vx: (Math.random() - 0.5) * 6,
      vy: (Math.random() - 0.5) * 6,
      type: i % 3 === 0 ? 'protein' : 'ribosome',
      color:
        i % 3 === 0
          ? 'rgba(56, 189, 248, 0.08)'
          : i % 3 === 1
            ? 'rgba(168, 85, 247, 0.08)'
            : 'rgba(16, 185, 129, 0.08)',
    });
  }

  function resizeCanvas() {
    if (!canvas || !ctx) return;
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);

    // Transform virtual 800x500 space to device pixels
    const scaleX = (rect.width * dpr) / VIRTUAL_WIDTH;
    const scaleY = (rect.height * dpr) / VIRTUAL_HEIGHT;
    ctx.setTransform(scaleX, 0, 0, scaleY, 0, 0);
  }

  function getCanvasPos(e: MouseEvent | Touch): { x: number; y: number } {
    const rect = canvas!.getBoundingClientRect();
    const clientX = e.clientX - rect.left;
    const clientY = e.clientY - rect.top;
    return {
      x: (clientX / rect.width) * VIRTUAL_WIDTH,
      y: (clientY / rect.height) * VIRTUAL_HEIGHT,
    };
  }

  function createExplosion(x: number, y: number, color: string, isBoss = false) {
    if (reducedMotion) return;
    const count = isBoss ? 45 : 20;
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 1.2 + Math.random() * (isBoss ? 6.5 : 4.2);
      particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        size: 2 + Math.random() * (isBoss ? 6 : 4),
        color,
        alpha: 1,
        life: 0,
        maxLife: 25 + Math.random() * 18,
      });
    }
    particles = particles.slice(-180);
  }

  function addFloatingText(x: number, y: number, text: string, color = '#38bdf8') {
    floatingTexts.push({
      x,
      y,
      text,
      color,
      alpha: 1.0,
      life: 0,
      maxLife: 35,
    });
    floatingTexts = floatingTexts.slice(-16);
  }

  function render() {
    if (!canvas || !ctx) return;
    const w = VIRTUAL_WIDTH;
    const h = VIRTUAL_HEIGHT;

    ctx.clearRect(0, 0, w, h);

    // 1. Draw Cellular Cytoplasm Map Background
    ctx.fillStyle = palette.bg;
    ctx.fillRect(0, 0, w, h);
    const cytoplasm = ctx.createRadialGradient(400, 220, 40, 400, 220, 430);
    cytoplasm.addColorStop(0, palette.isDark ? '#142c29' : '#e7f3e8');
    cytoplasm.addColorStop(1, palette.bg);
    ctx.fillStyle = cytoplasm; ctx.fillRect(0, 0, w, h);

    // Drifting cellular organelles
    for (const org of organelles) {
      ctx.fillStyle = org.color;
      ctx.beginPath();
      ctx.ellipse(org.x, org.y, org.radius * 1.2, org.radius * .65, .4, 0, Math.PI * 2);
      ctx.fill();
      if (org.type === 'ribosome') { ctx.beginPath(); ctx.ellipse(org.x + 3, org.y + 5, org.radius * .8, org.radius * .55, .4, 0, Math.PI * 2); ctx.fill(); }
    }

    // Membrane outer lipid bilayer
    ctx.strokeStyle = palette.membrane;
    ctx.lineWidth = 4;
    ctx.beginPath(); ctx.roundRect(22, 8, w - 32, h - 16, 64); ctx.stroke();
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.roundRect(30, 16, w - 48, h - 32, 60); ctx.stroke();
    // An attached outside capsid injects DNA; moving units inside are genomes, not walking phages.
    ctx.strokeStyle = palette.ink; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(10, 100); ctx.lineTo(42, 100); ctx.stroke();
    ctx.beginPath();
    for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3; const x = 10 + Math.cos(a) * 14; const y = 76 + Math.sin(a) * 14; if (!i) ctx.moveTo(x, y); else ctx.lineTo(x, y); }
    ctx.closePath(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(10, 90); ctx.lineTo(10, 100); ctx.stroke();
    ctx.font = '10px monospace'; ctx.fillStyle = palette.ink; ctx.textAlign = 'left'; ctx.fillText('DNA injection → schematic infection lane', 45, 78);

    // 2. Draw Waypoint Cytosolic Pathway
    ctx.strokeStyle = palette.pathTrack;
    ctx.lineWidth = 36;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(state.waypoints[0].x, state.waypoints[0].y);
    for (let i = 1; i < state.waypoints.length; i++) {
      ctx.lineTo(state.waypoints[i].x, state.waypoints[i].y);
    }
    ctx.stroke();

    // Central dashed path track with animated flow offset
    ctx.strokeStyle = palette.pathLine;
    ctx.lineWidth = 2;
    ctx.setLineDash([8, 8]);
    ctx.lineDashOffset = -animTick * 18;
    ctx.stroke();
    ctx.setLineDash([]);

    // 3. Draw Destination Nucleoid Core (Circular Genome Plasmid)
    const dest = state.waypoints[state.waypoints.length - 1];
    ctx.shadowColor = palette.nucleoidStroke;
    ctx.shadowBlur = palette.isDark ? 18 : 8;
    ctx.fillStyle = palette.nucleoidFill;
    ctx.beginPath();
    ctx.arc(dest.x, dest.y, 44, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = palette.nucleoidStroke;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(dest.x, dest.y, 38, 0, Math.PI * 2);
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = palette.nucleoidStroke; ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let i = 0; i <= 80; i++) { const a = i / 80 * Math.PI * 2; const r = 25 + Math.sin(a * 7) * 6; const x = dest.x + Math.cos(a) * r; const y = dest.y + Math.sin(a) * r; if (!i) ctx.moveTo(x, y); else ctx.lineTo(x, y); }
    ctx.stroke();

    ctx.fillStyle = palette.nucleoidText;
    ctx.font = 'bold 11px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('NUCLEOID', dest.x, dest.y - 6);
    ctx.fillText('CORE', dest.x, dest.y + 7);

    // 4. Draw Towers with active rotation animations
    for (const t of state.towers) {
      const def = TOWER_DEFINITIONS[t.type];
      const isSelected = selectedTower?.id === t.id;

      if (isSelected) {
        ctx.strokeStyle = 'rgba(56, 189, 248, 0.4)';
        ctx.fillStyle = 'rgba(56, 189, 248, 0.08)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        const range = def.range * (1 + (t.level - 1) * 0.15);
        ctx.arc(t.x, t.y, range, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }

      // Base circle
      ctx.shadowColor = def.color;
      ctx.shadowBlur = palette.isDark ? 12 : 6;
      ctx.fillStyle = palette.towerBody;
      ctx.strokeStyle = def.color;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(t.x, t.y, 19, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.shadowBlur = 0;

      // Rotating catalytic active site scissors
      ctx.save();
      ctx.translate(t.x, t.y);
      ctx.rotate(reducedMotion ? 0 : Math.sin(animTick * .5) * .1);
      ctx.strokeStyle = def.color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      if (t.type === 'restriction_enzyme') {
        ctx.moveTo(-12, -11); ctx.lineTo(12, 11); ctx.moveTo(-12, 11); ctx.lineTo(12, -11);
        ctx.moveTo(-7, -7); ctx.arc(-10, -10, 5, 0, Math.PI * 2); ctx.moveTo(-7, 13); ctx.arc(-10, 10, 5, 0, Math.PI * 2);
      } else if (t.type === 'crispr_cas9') {
        ctx.roundRect(-13, -10, 16, 20, 6); ctx.roundRect(-1, -8, 13, 16, 5);
        ctx.moveTo(-15, 0); ctx.lineTo(15, 0);
      } else if (t.type === 'rnase_interceptor') {
        for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; const x = Math.cos(a) * 13; const y = Math.sin(a) * 13; if (!i) ctx.moveTo(x, y); else ctx.lineTo(x, y); }
        ctx.closePath(); ctx.moveTo(-8, 0); ctx.lineTo(-4, -5); ctx.lineTo(0, 5); ctx.lineTo(4, -5); ctx.lineTo(8, 0);
      } else { ctx.arc(-6, 0, 7, -.8, Math.PI * 1.7); ctx.moveTo(12, 0); ctx.arc(6, 0, 7, 0, Math.PI * 2); }
      ctx.stroke();
      if (t.level >= 2) {
        ctx.rotate(Math.PI / 4);
        ctx.strokeStyle = palette.isDark ? '#ffffff' : '#0f172a';
        ctx.stroke();
      }
      ctx.restore();

      // Level text
      ctx.fillStyle = palette.isDark ? '#ffffff' : '#0f172a';
      ctx.font = 'bold 10px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(`${({ restriction_enzyme: 'ECO', crispr_cas9: 'CAS', rnase_interceptor: 'RNA', ligase_drone: 'LIG' })[t.type]} · ${t.level}`, t.x, t.y + 30);

      // Targeting laser beam line for CRISPR Cas9
      if (t.targetId && t.type === 'crispr_cas9') {
        const target = state.phages.find((p) => p.id === t.targetId);
        if (target) {
          ctx.strokeStyle = 'rgba(168, 85, 247, 0.8)';
          ctx.lineWidth = 3;
          ctx.shadowColor = '#a855f7';
          ctx.shadowBlur = 10;
          ctx.beginPath();
          ctx.moveTo(t.x, t.y);
          ctx.lineTo(target.x, target.y);
          ctx.stroke();
          ctx.shadowBlur = 0;
        }
      }

      // RNase pulse wave expanding circle
      if (t.type === 'rnase_interceptor' && t.targetId) {
        const pulseR = 20 + ((animTick * 35) % 70);
        ctx.strokeStyle = 'rgba(245, 158, 11, 0.35)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(t.x, t.y, pulseR, 0, Math.PI * 2);
        ctx.stroke();
      }
    }

    // 5. Draw Projectiles in flight
    for (const proj of state.projectiles) {
      ctx.save();
      ctx.shadowColor = proj.color;
      ctx.shadowBlur = palette.isDark ? 14 : 6;
      ctx.fillStyle = proj.color;

      // Draw projectile sphere with glowing energy core
      ctx.beginPath();
      ctx.arc(proj.x, proj.y, proj.speed > 500 ? 5 : 4, 0, Math.PI * 2);
      ctx.fill();

      // Motion streak tail
      const dx = proj.targetX - proj.x;
      const dy = proj.targetY - proj.y;
      const dist = Math.hypot(dx, dy);
      if (dist > 1) {
        ctx.strokeStyle = proj.color;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(proj.x, proj.y);
        ctx.lineTo(proj.x - (dx / dist) * 12, proj.y - (dy / dist) * 12);
        ctx.stroke();
      }
      ctx.restore();
    }

    // 6. Draw Phages with authentic morphology & crawling animations
    for (const p of state.phages) {
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.shadowColor = p.color;
      ctx.shadowBlur = palette.isDark ? 14 : 6;

      if (p.x >= 30 || p.waypointIndex > 0) {
        ctx.strokeStyle = p.color; ctx.lineWidth = 2.5;
        const half = p.radius;
        for (const sign of p.type === 'm13_filamentous' ? [1] : [-1, 1]) {
          ctx.beginPath();
          for (let i = 0; i <= 18; i++) { const x = -half + i / 18 * half * 2; const y = Math.sin(i / 18 * Math.PI * 3 + (reducedMotion ? 0 : animTick)) * 7 * sign; if (!i) ctx.moveTo(x, y); else ctx.lineTo(x, y); }
          ctx.stroke();
        }
        if (p.type !== 'm13_filamentous') for (let i = 1; i < 8; i++) { const x = -half + i / 8 * half * 2; const y = Math.sin(i / 8 * Math.PI * 3 + (reducedMotion ? 0 : animTick)) * 7; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, -y); ctx.stroke(); }
        if (p.shieldHealth > 0) { ctx.setLineDash([4, 4]); ctx.beginPath(); ctx.arc(0, 0, p.radius + 8, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]); }
      } else if (p.type === 't4_myoviridae') {
        // Icosahedral head
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.moveTo(0, -p.radius);
        ctx.lineTo(p.radius * 0.8, -p.radius * 0.4);
        ctx.lineTo(p.radius * 0.8, p.radius * 0.4);
        ctx.lineTo(0, p.radius);
        ctx.lineTo(-p.radius * 0.8, p.radius * 0.4);
        ctx.lineTo(-p.radius * 0.8, -p.radius * 0.4);
        ctx.closePath();
        ctx.fill();

        // Contractile tail sheath & articulated walking fibers
        const legSwing = Math.sin(animTick * 6) * 4;
        ctx.strokeStyle = p.color;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(-6, p.radius * 0.6);
        ctx.lineTo(-12 + legSwing, p.radius * 1.3);
        ctx.moveTo(6, p.radius * 0.6);
        ctx.lineTo(12 - legSwing, p.radius * 1.3);
        ctx.stroke();
      } else if (p.type === 'm13_filamentous') {
        // Helical rod filament
        const wave = Math.sin(animTick * 5) * 3;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.ellipse(wave, 0, p.radius * 1.5, p.radius * 0.6, 0.2, 0, Math.PI * 2);
        ctx.fill();
      } else if (p.type === 'giant_megaphage') {
        // Boss megaphage with anti-CRISPR hex shield
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(0, 0, p.radius, 0, Math.PI * 2);
        ctx.fill();

        if (p.shieldHealth > 0) {
          ctx.strokeStyle = 'rgba(236, 72, 153, 0.8)';
          ctx.lineWidth = 3;
          ctx.setLineDash([6, 4]);
          ctx.beginPath();
          ctx.arc(0, 0, p.radius + 6, 0, Math.PI * 2);
          ctx.stroke();
          ctx.setLineDash([]);
        }
      } else {
        // Lambda Siphophage
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(0, 0, p.radius, 0, Math.PI * 2);
        ctx.fill();

        // Wavy tail
        ctx.strokeStyle = p.color;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(0, p.radius);
        ctx.quadraticCurveTo(Math.sin(animTick * 5) * 6, p.radius + 8, 0, p.radius + 14);
        ctx.stroke();
      }

      ctx.shadowBlur = 0;
      ctx.restore();

      // Health & Shield bar above phage
      const barW = p.radius * 2 + 6;
      const barH = 4;
      const barX = p.x - barW / 2;
      const barY = p.y - p.radius - 9;
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(barX, barY, barW, barH);
      ctx.fillStyle = p.shieldHealth > 0 ? '#ec4899' : '#10b981';
      const fillW = Math.max(0, (p.health / p.maxHealth) * barW);
      ctx.fillRect(barX, barY, fillW, barH);
    }

    // 7. Draw Tower Build Placement Preview
    if (selectedBuildType && isMouseInside) {
      const def = TOWER_DEFINITIONS[selectedBuildType];
      const valid =
        canPlaceTower(state.towers, mousePos.x, mousePos.y, state.waypoints) &&
        state.atp >= def.cost;

      ctx.strokeStyle = valid ? 'rgba(16, 185, 129, 0.7)' : 'rgba(244, 63, 94, 0.7)';
      ctx.fillStyle = valid ? 'rgba(16, 185, 129, 0.12)' : 'rgba(244, 63, 94, 0.12)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(mousePos.x, mousePos.y, def.range, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = valid ? def.color : '#f43f5e';
      ctx.beginPath();
      ctx.arc(mousePos.x, mousePos.y, 19, 0, Math.PI * 2);
      ctx.fill();
    }

    // 8. Update & Draw Particles
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];

      ctx.save();
      ctx.globalAlpha = p.alpha;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

    }

    // 9. Update & Draw Floating Tactical Texts
    for (let i = floatingTexts.length - 1; i >= 0; i--) {
      const ft = floatingTexts[i];

      ctx.save();
      ctx.globalAlpha = ft.alpha;
      ctx.fillStyle = ft.color;
      ctx.font = 'bold 12px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(ft.text, ft.x, ft.y);
      ctx.restore();

    }

    // 10. Active Emergency Ability Overlays
    const isCrispri = state.activeEmergencies.some((e) => e.type === 'crispri');
    const isOvercharge = state.activeEmergencies.some((e) => e.type === 'overcharge');

    if (isCrispri) {
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.6)';
      ctx.lineWidth = 6;
      ctx.strokeRect(3, 3, w - 6, h - 6);
    }
    if (isOvercharge) {
      ctx.strokeStyle = 'rgba(245, 158, 11, 0.7)';
      ctx.lineWidth = 6;
      ctx.strokeRect(3, 3, w - 6, h - 6);
    }

    // 11. Game Over / Victory / Pause Overlays
    if (state.isGameOver) {
      ctx.fillStyle = palette.overlayBg;
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#f43f5e';
      ctx.font = 'bold 32px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('CELL LYSIS — NUCLEOID DESTROYED', w / 2, h / 2 - 25);
      ctx.fillStyle = palette.ink;
      ctx.font = '16px monospace';
      ctx.fillText(
        `Final Score: ${state.score}  ·  Waves Survived: ${state.currentWave}`,
        w / 2,
        h / 2 + 15
      );
    } else if (state.isVictory) {
      ctx.fillStyle = palette.overlayBg;
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#10b981';
      ctx.font = 'bold 32px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('CELL SURVIVAL VICTORY!', w / 2, h / 2 - 25);
      ctx.fillStyle = palette.ink;
      ctx.font = '16px monospace';
      ctx.fillText(`All 15 Phage Waves Repelled! Score: ${state.score}`, w / 2, h / 2 + 15);
    } else if (state.isPaused) {
      ctx.fillStyle = palette.overlayBg;
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = palette.nucleoidStroke;
      ctx.font = 'bold 28px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('PAUSED', w / 2, h / 2);
    }
  }

  function updateHUD() {
    const list = state.towers.map((tower) => `${tower.id}:${tower.level}`).join(',');
    if (towerSelect && list !== towerList) {
      towerList = list;
      towerSelect.replaceChildren(new Option('Inspect a defense…', ''), ...state.towers.map((tower, index) => new Option(`${index + 1}. ${TOWER_DEFINITIONS[tower.type].name} · L${tower.level}`, tower.id)));
    }
    if (towerSelect) towerSelect.value = selectedTower?.id ?? '';
    if (soundBtn) { soundBtn.textContent = sound.enabled ? 'Sound on' : 'Sound off'; soundBtn.setAttribute('aria-pressed', String(sound.enabled)); }
    if (previewEl) {
      const queue = generateWaveQueue(Math.min(15, state.currentWave + 1));
      const preview = selectedBuildType ? `${TOWER_DEFINITIONS[selectedBuildType].name} · ${TOWER_DEFINITIONS[selectedBuildType].cost} ATP · range ${TOWER_DEFINITIONS[selectedBuildType].range} · ${TOWER_DEFINITIONS[selectedBuildType].damage} damage · ${TOWER_DEFINITIONS[selectedBuildType].fireRate}/s. Tap to preview; Confirm to place. Green = valid, red = blocked.` : state.isWaveActive ? `Wave ${state.currentWave}: ${state.phages.length} active, ${state.waveSpawnQueue.length} incoming. ${state.currentWave >= 12 ? 'Boss resistance blocks Cas9 only — mix your defenses.' : 'Inspect a tower to upgrade or change priority.'}` : `Next wave ${Math.min(15, state.currentWave + 1)} · ${queue.length} genomes${queue.includes('giant_megaphage') ? ' · boss warning: anti-Cas9 resistance' : ''}. Build defenses before starting.`;
      if (previewEl.textContent !== preview) previewEl.textContent = preview;
    }
    if (confirmBtn) { confirmBtn.hidden = !selectedBuildType; confirmBtn.disabled = !selectedBuildType || !canPlaceTower(state.towers, mousePos.x, mousePos.y, state.waypoints); }
    if (cancelBtn) cancelBtn.hidden = !selectedBuildType;
    if (scoreEl) scoreEl.textContent = state.score.toLocaleString();
    if (bestEl) bestEl.textContent = state.highScore.toLocaleString();
    if (atpEl) atpEl.textContent = `${state.atp} ATP`;
    if (waveEl) waveEl.textContent = `Wave ${state.currentWave} / ${state.totalWaves}`;

    if (viabilityBar) {
      const pct = Math.max(0, (state.cellViability / state.maxViability) * 100);
      viabilityBar.style.width = `${pct}%`;
      viabilityBar.style.backgroundColor = pct > 50 ? '#10b981' : pct > 25 ? '#f59e0b' : '#f43f5e';
    }
    if (viabilityText) viabilityText.textContent = `${Math.round(state.cellViability)}%`;

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

    emergencyBtns.forEach((btn) => {
      const type = btn.getAttribute('data-emergency-ability') as EmergencyAbilityType;
      const def = EMERGENCY_ABILITIES[type];
      const active = state.activeEmergencies.find((e) => e.type === type);
      btn.disabled = state.atp < def.cost || state.isGameOver || Boolean(active);
      if (active) {
        btn.classList.add('active');
        btn.textContent = `${def.name} (${Math.ceil(active.timerSec)}s)`;
      } else {
        btn.classList.remove('active');
        btn.textContent = `${def.name} (${def.cost} ATP)`;
      }
    });

    if (selectedTowerPanel) {
      if (selectedTower) {
        selectedTowerPanel.style.display = 'block';
        const def = TOWER_DEFINITIONS[selectedTower.type];
        const cost = Math.round(def.cost * (selectedTower.level * 0.85));
        const totalInvested =
          def.cost +
          (selectedTower.level > 1 ? def.cost * 0.85 : 0) +
          (selectedTower.level > 2 ? def.cost * 1.7 : 0);
        const refund = Math.round(totalInvested * 0.7);

        const nameEl = selectedTowerPanel.querySelector('[data-tower-info-name]');
        const lvlEl = selectedTowerPanel.querySelector('[data-tower-info-lvl]');
        const dpsEl = selectedTowerPanel.querySelector('[data-tower-info-dps]');
        if (nameEl) nameEl.textContent = def.name;
        if (lvlEl) lvlEl.textContent = `Level ${selectedTower.level}`;
        if (dpsEl)
          dpsEl.textContent = `Hit: ${Math.round(def.damage * (1 + (selectedTower.level - 1) * 0.45))} · Base rate: ${(def.fireRate * (1 + (selectedTower.level - 1) * .2)).toFixed(2)}/s · Range: ${Math.round(def.range * (1 + (selectedTower.level - 1) * .15))} · Landed: ${Math.round(selectedTower.totalDamage)} · Kills: ${selectedTower.kills}`;

        if (upgradeBtn) {
          upgradeBtn.disabled = selectedTower.level >= 3 || state.atp < cost;
          upgradeBtn.textContent =
            selectedTower.level >= 3 ? 'Max Level' : `Upgrade (${cost} ATP)`;
        }
        if (sellBtn) {
          sellBtn.textContent = `Recycle (+${refund} ATP)`;
        }

        priorityBtns.forEach((btn) => {
          const prio = btn.getAttribute('data-tower-priority') as TargetPriority;
          if (prio === selectedTower?.targetPriority) btn.classList.add('active');
          else btn.classList.remove('active');
        });
      } else {
        selectedTowerPanel.style.display = 'none';
      }
    }
  }

  function gameLoop(timestamp: number) {
    if (!lastTimestamp) lastTimestamp = timestamp;
    const dt = Math.min(0.1, (timestamp - lastTimestamp) / 1000);
    lastTimestamp = timestamp;

    clock.advance(!state.isPaused && !state.isGameOver && !state.isVictory ? dt * speed : 0, simulate);
    render(); updateHUD();
    animationFrameId = requestAnimationFrame(gameLoop);
  }
  function simulate(dt: number) {
    if (!reducedMotion) {
      animTick += dt * 2.4;
      for (const org of organelles) { org.x = (org.x + org.vx * dt + VIRTUAL_WIDTH) % VIRTUAL_WIDTH; org.y = (org.y + org.vy * dt + VIRTUAL_HEIGHT) % VIRTUAL_HEIGHT; }
    }
    for (const p of particles) { p.x += p.vx * dt * 60; p.y += p.vy * dt * 60; p.life += dt * 60; p.alpha = Math.max(0, 1 - p.life / p.maxLife); }
    particles = particles.filter((p) => p.life < p.maxLife);
    for (const ft of floatingTexts) { ft.y -= dt * 66; ft.life += dt * 60; ft.alpha = Math.max(0, 1 - ft.life / ft.maxLife); }
    floatingTexts = floatingTexts.filter((ft) => ft.life < ft.maxLife);
    const { state: nextState, defeatedPhages, breachedPhages } = updateDefenseGame(state, dt);

    if (defeatedPhages.length > 0) {
      defeatedPhages.forEach((p) => {
        sound.playDefeat();
        createExplosion(p.x, p.y, p.color, p.type === 'giant_megaphage');
        addFloatingText(p.x, p.y, `+${p.atpReward} ATP`, '#f59e0b');
      });
    }

    if (breachedPhages.length > 0) {
      sound.playBreach();
      breachedPhages.forEach((b) => {
        addFloatingText(b.x, b.y, `-${b.type === 'giant_megaphage' ? 40 : 10}%`, '#f43f5e');
      });
    }

    if ((nextState.isGameOver && !state.isGameOver) || (nextState.isVictory && !state.isVictory)) {
      try {
        localStorage.setItem(STORAGE_KEY, String(nextState.highScore));
      } catch {}
    }

    state = nextState;
    if (selectedTower) selectedTower = state.towers.find((t) => t.id === selectedTower!.id) ?? null;
  }

  function onThemeChange() {
    palette = getDefenseThemePalette();
    render();
    updateHUD();
  }

  // Click & Interaction handlers
  canvas.addEventListener('pointermove', (e) => {
    isMouseInside = true;
    mousePos = getCanvasPos(e);
  }, { signal });
  canvas.addEventListener('pointerdown', (e) => { touchPlacement = e.pointerType === 'touch'; mousePos = getCanvasPos(e); isMouseInside = true; }, { signal });
  canvas.addEventListener('pointercancel', () => { selectedBuildType = null; isMouseInside = false; updateHUD(); }, { signal });
  canvas.addEventListener('mouseleave', () => {
    isMouseInside = false;
  }, { signal });

  function deploy() {
    if (!selectedBuildType) return;
    const { state: nextState, success } = placeTower(state, selectedBuildType, mousePos.x, mousePos.y);
    if (success) {
      state = nextState; sound.playShoot(selectedBuildType);
      addFloatingText(mousePos.x, mousePos.y, 'DEPLOYED', '#10b981');
      selectedBuildType = null;
    } else addFloatingText(mousePos.x, mousePos.y, 'BLOCKED · CHOOSE GREEN SPACE', '#f43f5e');
    updateHUD();
  }

  canvas.addEventListener('click', (e) => {
    const pos = getCanvasPos(e);
    mousePos = pos;

    if (selectedBuildType) {
      if (!touchPlacement) deploy();
      else updateHUD();
      return;
    }

    let clickedTower: ActiveTower | null = null;
    for (const t of state.towers) {
      if (Math.hypot(t.x - pos.x, t.y - pos.y) <= 24) {
        clickedTower = t;
        break;
      }
    }
    selectedTower = clickedTower;
    updateHUD();
  }, { signal });
  confirmBtn?.addEventListener('click', deploy, { signal });
  cancelBtn?.addEventListener('click', () => { selectedBuildType = null; updateHUD(); }, { signal });
  speedBtn?.addEventListener('click', () => { speed = speed === 1 ? 2 : 1; speedBtn.textContent = `${speed}× speed`; clock.reset(); }, { signal });
  towerSelect?.addEventListener('change', () => { selectedTower = state.towers.find((tower) => tower.id === towerSelect.value) ?? null; selectedBuildType = null; updateHUD(); }, { signal });
  containerEl.addEventListener('keydown', (e) => {
    if (e.target instanceof Element && e.target.closest('input,select,textarea')) return;
    if (selectedBuildType && /^Arrow/.test(e.key)) {
      e.preventDefault(); isMouseInside = true;
      mousePos.x = Math.max(30, Math.min(770, mousePos.x + (e.key === 'ArrowLeft' ? -20 : e.key === 'ArrowRight' ? 20 : 0)));
      mousePos.y = Math.max(30, Math.min(470, mousePos.y + (e.key === 'ArrowUp' ? -20 : e.key === 'ArrowDown' ? 20 : 0)));
      updateHUD();
    } else if (e.key === 'Enter' && e.target === containerEl) deploy();
    else if (e.key === 'Escape') { selectedBuildType = null; updateHUD(); }
  }, { signal });

  towerBuildCards.forEach((card) => {
    card.addEventListener('click', () => {
      const type = card.getAttribute('data-tower-type') as TowerType;
      if (selectedBuildType === type) {
        selectedBuildType = null;
      } else {
        selectedBuildType = type;
        selectedTower = null;
        mousePos = { x: 200, y: 380 }; isMouseInside = true;
      }
      updateHUD();
    }, { signal });
  });

  emergencyBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      const type = btn.getAttribute('data-emergency-ability') as EmergencyAbilityType;
      if (type) {
        const { state: nextState, success } = activateEmergencyAbility(state, type);
        if (success) {
          state = nextState;
          sound.playAbility();
          addFloatingText(VIRTUAL_WIDTH / 2, VIRTUAL_HEIGHT / 2, type.toUpperCase(), '#38bdf8');
          updateHUD();
        }
      }
    }, { signal });
  });

  if (upgradeBtn) {
    upgradeBtn.addEventListener('click', () => {
      if (!selectedTower) return;
      const { state: nextState, success } = upgradeTower(state, selectedTower.id);
      if (success) {
        state = nextState;
        selectedTower = state.towers.find((t) => t.id === selectedTower!.id) || null;
        addFloatingText(selectedTower?.x || 100, selectedTower?.y || 100, 'UPGRADED', '#38bdf8');
        updateHUD();
      }
    }, { signal });
  }

  if (sellBtn) {
    sellBtn.addEventListener('click', () => {
      if (!selectedTower) return;
      const { state: nextState, refundAtp } = sellTower(state, selectedTower.id);
      addFloatingText(selectedTower.x, selectedTower.y, `+${refundAtp} ATP`, '#f59e0b');
      state = nextState;
      selectedTower = null;
      updateHUD();
    }, { signal });
  }

  priorityBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      if (!selectedTower) return;
      const priority = btn.getAttribute('data-tower-priority') as TargetPriority;
      if (priority) {
        state = setTowerPriority(state, selectedTower.id, priority);
        selectedTower = state.towers.find((t) => t.id === selectedTower!.id) || null;
        updateHUD();
      }
    }, { signal });
  });

  if (nextWaveBtn) {
    nextWaveBtn.addEventListener('click', () => {
      state = startNextWave(state);
      sound.playWaveStart();
      updateHUD();
    }, { signal });
  }

  if (restartBtn) {
    restartBtn.addEventListener('click', () => {
      state = createInitialDefenseState(state.highScore);
      selectedBuildType = null;
      selectedTower = null;
      particles = [];
      floatingTexts = [];
      clock.reset();
      updateHUD();
    }, { signal });
  }

  if (pauseBtn) {
    pauseBtn.addEventListener('click', () => {
      state = state.isPaused ? { ...state, isPaused: false } : { ...state, isPaused: true };
      clock.reset();
      updateHUD();
    }, { signal });
  }

  if (soundBtn) {
    soundBtn.addEventListener('click', () => {
      sound.enabled = !sound.enabled;
      try { localStorage.setItem('khc_phage_sound', String(sound.enabled)); } catch {}
      soundBtn.setAttribute('aria-pressed', String(sound.enabled));
      soundBtn.textContent = sound.enabled ? 'Sound on' : 'Sound off';
    }, { signal });
  }
  function suspend() { state = { ...state, isPaused: true }; clock.reset(); updateHUD(); }
  window.addEventListener('blur', suspend, { signal });
  document.addEventListener('visibilitychange', () => { if (document.hidden) suspend(); }, { signal });

  window.addEventListener('resize', resizeCanvas);
  document.addEventListener('khc:theme-change', onThemeChange);
  resizeCanvas();
  updateHUD();

  animationFrameId = requestAnimationFrame(gameLoop);

  const controller = {
    state: () => state,
    restart: () => {
      state = createInitialDefenseState(state.highScore);
    },
    destroy: () => {
      cancelAnimationFrame(animationFrameId);
      abort.abort(); sound.destroy();
      window.removeEventListener('resize', resizeCanvas);
      document.removeEventListener('khc:theme-change', onThemeChange);
      if (win.__phageDefense === controller) {
        delete win.__phageDefense;
      }
      win.__phageDefenseInstances = Math.max(0, (win.__phageDefenseInstances || 1) - 1);
    },
  };

  win.__phageDefense = controller;
  return controller.destroy;
}
