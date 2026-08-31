/**
 * Phage Defense — Pure Game Logic Engine
 *
 * Simulates microbial path & cytoplasm tower defense where players deploy
 * molecular biology defense units (Restriction Endonucleases, CRISPR-Cas9,
 * RNases, DNA Ligase) to protect a bacterial cell nucleoid from bacteriophages.
 */

export interface Point {
  x: number;
  y: number;
}

export type TowerType = 'restriction_enzyme' | 'crispr_cas9' | 'rnase_interceptor' | 'ligase_drone';

export interface TowerStats {
  type: TowerType;
  name: string;
  cost: number;
  range: number; // in pixels
  damage: number;
  fireRate: number; // shots per second
  aoeRadius?: number; // area of effect
  slowRatio?: number; // speed multiplier (e.g. 0.6 = 40% slow)
  description: string;
  color: string;
}

export const TOWER_DEFINITIONS: Record<TowerType, TowerStats> = {
  restriction_enzyme: {
    type: 'restriction_enzyme',
    name: 'EcoRI Cleaver',
    cost: 100,
    range: 100,
    damage: 25,
    fireRate: 1.6,
    description: 'Fast-acting endonuclease that cleaves palindromic viral DNA motifs (GAATTC).',
    color: '#38bdf8', // cyan
  },
  crispr_cas9: {
    type: 'crispr_cas9',
    name: 'CRISPR-Cas9 Array',
    cost: 175,
    range: 190,
    damage: 90,
    fireRate: 0.75,
    description: 'Long-range precision ribonucleoprotein delivering devastating double-strand breaks.',
    color: '#a855f7', // purple
  },
  rnase_interceptor: {
    type: 'rnase_interceptor',
    name: 'RNase / Translation Jammer',
    cost: 125,
    range: 120,
    damage: 8,
    fireRate: 2.0,
    aoeRadius: 80,
    slowRatio: 0.55,
    description: 'Degrades viral messenger RNA and slows phage migration velocity by 45%.',
    color: '#f59e0b', // amber
  },
  ligase_drone: {
    type: 'ligase_drone',
    name: 'DNA Ligase Booster',
    cost: 150,
    range: 130,
    damage: 0,
    fireRate: 0.5,
    description: 'Support beacon that enhances adjacent enzyme turnover rate by +30% and heals cell wall.',
    color: '#10b981', // emerald
  },
};

export type PhageType = 'lambda_phage' | 't4_myoviridae' | 'm13_filamentous' | 'giant_megaphage';

export interface PhageStats {
  type: PhageType;
  name: string;
  maxHealth: number;
  speed: number; // pixels per second
  atpReward: number;
  radius: number;
  color: string;
}

export const PHAGE_DEFINITIONS: Record<PhageType, PhageStats> = {
  lambda_phage: {
    type: 'lambda_phage',
    name: 'Lambda Siphophage',
    maxHealth: 50,
    speed: 85,
    atpReward: 15,
    radius: 12,
    color: '#38bdf8',
  },
  t4_myoviridae: {
    type: 't4_myoviridae',
    name: 'T4 Myoviridae Phage',
    maxHealth: 140,
    speed: 55,
    atpReward: 25,
    radius: 16,
    color: '#f43f5e',
  },
  m13_filamentous: {
    type: 'm13_filamentous',
    name: 'M13 Inovirus',
    maxHealth: 90,
    speed: 70,
    atpReward: 20,
    radius: 14,
    color: '#eab308',
  },
  giant_megaphage: {
    type: 'giant_megaphage',
    name: 'Giant Jumbo Megaphage',
    maxHealth: 750,
    speed: 35,
    atpReward: 120,
    radius: 24,
    color: '#ec4899',
  },
};

export interface ActiveTower {
  id: string;
  type: TowerType;
  x: number;
  y: number;
  level: number;
  cooldownSec: number;
  targetId: string | null;
}

export interface ActivePhage {
  id: string;
  type: PhageType;
  x: number;
  y: number;
  health: number;
  maxHealth: number;
  speed: number;
  baseSpeed: number;
  slowTimerSec: number;
  waypointIndex: number;
  progressRatio: number; // 0 to 1
  atpReward: number;
  radius: number;
  color: string;
}

export interface Projectile {
  id: string;
  sourceTowerId: string;
  targetPhageId: string;
  x: number;
  y: number;
  targetX: number;
  targetY: number;
  damage: number;
  speed: number;
  color: string;
  aoeRadius?: number;
  slowRatio?: number;
}

export interface DefenseGameState {
  atp: number;
  score: number;
  highScore: number;
  cellViability: number; // 0 to 100
  maxViability: number;
  currentWave: number;
  totalWaves: number;
  isWaveActive: boolean;
  waveSpawnQueue: PhageType[];
  spawnIntervalSec: number;
  spawnTimerSec: number;
  towers: ActiveTower[];
  phages: ActivePhage[];
  projectiles: Projectile[];
  isGameOver: boolean;
  isVictory: boolean;
  isPaused: boolean;
  waypoints: Point[];
}

export function getDefaultWaypoints(canvasW: number = 800, canvasH: number = 550): Point[] {
  // S-curved path simulating ingress through cell wall, across cytoplasm, toward central nucleoid
  return [
    { x: 0, y: canvasH * 0.2 },
    { x: canvasW * 0.25, y: canvasH * 0.2 },
    { x: canvasW * 0.35, y: canvasH * 0.55 },
    { x: canvasW * 0.65, y: canvasH * 0.55 },
    { x: canvasW * 0.75, y: canvasH * 0.25 },
    { x: canvasW * 0.9, y: canvasH * 0.25 },
    { x: canvasW * 0.9, y: canvasH * 0.8 },
    { x: canvasW * 0.5, y: canvasH * 0.8 },
  ];
}

export function createInitialDefenseState(
  savedHighScore: number = 0,
  canvasW: number = 800,
  canvasH: number = 550
): DefenseGameState {
  return {
    atp: 350,
    score: 0,
    highScore: savedHighScore,
    cellViability: 100,
    maxViability: 100,
    currentWave: 0,
    totalWaves: 15,
    isWaveActive: false,
    waveSpawnQueue: [],
    spawnIntervalSec: 1.1,
    spawnTimerSec: 0,
    towers: [],
    phages: [],
    projectiles: [],
    isGameOver: false,
    isVictory: false,
    isPaused: false,
    waypoints: getDefaultWaypoints(canvasW, canvasH),
  };
}

export function generateWaveQueue(waveNumber: number): PhageType[] {
  const queue: PhageType[] = [];
  if (waveNumber <= 3) {
    const count = 6 + waveNumber * 3;
    for (let i = 0; i < count; i++) queue.push('lambda_phage');
  } else if (waveNumber <= 7) {
    const t4Count = waveNumber * 2;
    const lambdaCount = 6 + waveNumber;
    for (let i = 0; i < t4Count; i++) queue.push('t4_myoviridae');
    for (let i = 0; i < lambdaCount; i++) queue.push('lambda_phage');
  } else if (waveNumber <= 11) {
    const m13Count = 4 + waveNumber;
    const t4Count = 6 + waveNumber;
    for (let i = 0; i < m13Count; i++) queue.push('m13_filamentous');
    for (let i = 0; i < t4Count; i++) queue.push('t4_myoviridae');
  } else {
    // Late & Boss waves
    const bossCount = Math.max(1, Math.floor((waveNumber - 10) / 2));
    const m13Count = 8;
    const t4Count = 10;
    for (let i = 0; i < bossCount; i++) queue.push('giant_megaphage');
    for (let i = 0; i < m13Count; i++) queue.push('m13_filamentous');
    for (let i = 0; i < t4Count; i++) queue.push('t4_myoviridae');
  }
  return queue;
}

export function startNextWave(state: DefenseGameState): DefenseGameState {
  if (state.isWaveActive || state.isGameOver) return state;
  const nextWaveNum = state.currentWave + 1;
  const queue = generateWaveQueue(nextWaveNum);
  return {
    ...state,
    currentWave: nextWaveNum,
    isWaveActive: true,
    waveSpawnQueue: queue,
    spawnTimerSec: 0,
  };
}

export function canPlaceTower(
  towers: ActiveTower[],
  x: number,
  y: number,
  waypoints: Point[],
  pathBuffer: number = 36,
  minTowerDist: number = 44
): boolean {
  // 1. Check distance from other towers
  for (const t of towers) {
    if (Math.hypot(t.x - x, t.y - y) < minTowerDist) return false;
  }

  // 2. Check distance from waypoint path segments
  for (let i = 0; i < waypoints.length - 1; i++) {
    const p1 = waypoints[i];
    const p2 = waypoints[i + 1];
    const l2 = (p2.x - p1.x) ** 2 + (p2.y - p1.y) ** 2;
    let dist = 0;
    if (l2 === 0) {
      dist = Math.hypot(x - p1.x, y - p1.y);
    } else {
      let t = ((x - p1.x) * (p2.x - p1.x) + (y - p1.y) * (p2.y - p1.y)) / l2;
      t = Math.max(0, Math.min(1, t));
      const projX = p1.x + t * (p2.x - p1.x);
      const projY = p1.y + t * (p2.y - p1.y);
      dist = Math.hypot(x - projX, y - projY);
    }
    if (dist < pathBuffer) return false;
  }

  return true;
}

export function placeTower(
  state: DefenseGameState,
  type: TowerType,
  x: number,
  y: number
): { state: DefenseGameState; success: boolean } {
  const def = TOWER_DEFINITIONS[type];
  if (state.atp < def.cost || state.isGameOver) {
    return { state, success: false };
  }

  if (!canPlaceTower(state.towers, x, y, state.waypoints)) {
    return { state, success: false };
  }

  const newTower: ActiveTower = {
    id: `tower-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    type,
    x,
    y,
    level: 1,
    cooldownSec: 0,
    targetId: null,
  };

  return {
    state: {
      ...state,
      atp: state.atp - def.cost,
      towers: [...state.towers, newTower],
    },
    success: true,
  };
}

export function upgradeTower(
  state: DefenseGameState,
  towerId: string
): { state: DefenseGameState; success: boolean } {
  const tower = state.towers.find((t) => t.id === towerId);
  if (!tower || tower.level >= 3) return { state, success: false };

  const def = TOWER_DEFINITIONS[tower.type];
  const upgradeCost = Math.round(def.cost * (tower.level * 0.85));
  if (state.atp < upgradeCost) return { state, success: false };

  const updatedTowers = state.towers.map((t) =>
    t.id === towerId ? { ...t, level: t.level + 1 } : t
  );

  return {
    state: {
      ...state,
      atp: state.atp - upgradeCost,
      towers: updatedTowers,
    },
    success: true,
  };
}

export function updateDefenseGame(
  state: DefenseGameState,
  dt: number
): { state: DefenseGameState; defeatedPhages: ActivePhage[]; breachedPhages: ActivePhage[] } {
  if (state.isGameOver || state.isVictory || state.isPaused) {
    return { state, defeatedPhages: [], breachedPhages: [] };
  }

  let nextAtp = state.atp;
  let nextScore = state.score;
  let nextViability = state.cellViability;
  let nextQueue = [...state.waveSpawnQueue];
  let nextSpawnTimer = state.spawnTimerSec + dt;
  const nextPhages: ActivePhage[] = [];
  const defeatedPhages: ActivePhage[] = [];
  const breachedPhages: ActivePhage[] = [];

  // 1. Spawn phages from queue
  if (state.isWaveActive && nextQueue.length > 0 && nextSpawnTimer >= state.spawnIntervalSec) {
    nextSpawnTimer -= state.spawnIntervalSec;
    const type = nextQueue.shift()!;
    const def = PHAGE_DEFINITIONS[type];
    const startPt = state.waypoints[0];
    nextPhages.push({
      id: `phage-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      type,
      x: startPt.x,
      y: startPt.y,
      health: def.maxHealth,
      maxHealth: def.maxHealth,
      speed: def.speed,
      baseSpeed: def.speed,
      slowTimerSec: 0,
      waypointIndex: 0,
      progressRatio: 0,
      atpReward: def.atpReward,
      radius: def.radius,
      color: def.color,
    });
  }

  // 2. Advance existing phages
  for (const phage of state.phages) {
    let p = { ...phage };

    // Handle slow effect recovery
    if (p.slowTimerSec > 0) {
      p.slowTimerSec -= dt;
      if (p.slowTimerSec <= 0) p.speed = p.baseSpeed;
    }

    // Move towards next waypoint
    const targetWpIndex = p.waypointIndex + 1;
    if (targetWpIndex < state.waypoints.length) {
      const targetWp = state.waypoints[targetWpIndex];
      const dx = targetWp.x - p.x;
      const dy = targetWp.y - p.y;
      const dist = Math.hypot(dx, dy);
      const step = p.speed * dt;

      if (dist <= step) {
        p.x = targetWp.x;
        p.y = targetWp.y;
        p.waypointIndex = targetWpIndex;
      } else {
        p.x += (dx / dist) * step;
        p.y += (dy / dist) * step;
      }
      p.progressRatio = p.waypointIndex / (state.waypoints.length - 1);
      nextPhages.push(p);
    } else {
      // Reached final waypoint (Nucleoid Breach)
      breachedPhages.push(p);
      const damage = p.type === 'giant_megaphage' ? 40 : 10;
      nextViability = Math.max(0, nextViability - damage);
    }
  }

  // 3. Update towers, targeting & firing projectiles
  const nextProjectiles: Projectile[] = [];
  const updatedTowers: ActiveTower[] = [];

  for (const tower of state.towers) {
    let t = { ...tower };
    const def = TOWER_DEFINITIONS[t.type];
    const range = def.range * (1 + (t.level - 1) * 0.15);
    const damage = def.damage * (1 + (t.level - 1) * 0.45);
    const rate = def.fireRate * (1 + (t.level - 1) * 0.2);

    if (t.cooldownSec > 0) {
      t.cooldownSec = Math.max(0, t.cooldownSec - dt);
    }

    // Find furthest progress phage within range
    let bestTarget: ActivePhage | null = null;
    let maxProgress = -1;

    for (const p of nextPhages) {
      const dist = Math.hypot(p.x - t.x, p.y - t.y);
      if (dist <= range && p.progressRatio > maxProgress) {
        maxProgress = p.progressRatio;
        bestTarget = p;
      }
    }

    t.targetId = bestTarget ? bestTarget.id : null;

    if (bestTarget && t.cooldownSec <= 0 && def.damage > 0) {
      t.cooldownSec = 1 / rate;
      nextProjectiles.push({
        id: `proj-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        sourceTowerId: t.id,
        targetPhageId: bestTarget.id,
        x: t.x,
        y: t.y,
        targetX: bestTarget.x,
        targetY: bestTarget.y,
        damage,
        speed: 380,
        color: def.color,
        aoeRadius: def.aoeRadius,
        slowRatio: def.slowRatio,
      });
    }

    updatedTowers.push(t);
  }

  // 4. Update projectiles & apply hits
  for (const proj of [...state.projectiles, ...nextProjectiles]) {
    const target = nextPhages.find((p) => p.id === proj.targetPhageId);
    const destX = target ? target.x : proj.targetX;
    const destY = target ? target.y : proj.targetY;

    const dx = destX - proj.x;
    const dy = destY - proj.y;
    const dist = Math.hypot(dx, dy);
    const step = proj.speed * dt;

    if (dist <= step) {
      // Hit target!
      if (proj.aoeRadius && proj.aoeRadius > 0) {
        for (const p of nextPhages) {
          if (Math.hypot(p.x - destX, p.y - destY) <= proj.aoeRadius) {
            p.health -= proj.damage;
            if (proj.slowRatio) {
              p.speed = p.baseSpeed * proj.slowRatio;
              p.slowTimerSec = 2.5;
            }
          }
        }
      } else if (target) {
        target.health -= proj.damage;
      }
    } else {
      proj.x += (dx / dist) * step;
      proj.y += (dy / dist) * step;
      // Keep moving
    }
  }

  // 5. Clean up defeated phages
  const survivingPhages: ActivePhage[] = [];
  for (const p of nextPhages) {
    if (p.health <= 0) {
      defeatedPhages.push(p);
      nextAtp += p.atpReward;
      nextScore += p.atpReward * 10;
    } else {
      survivingPhages.push(p);
    }
  }

  // Check Wave Completion / Victory
  let isWaveActive: boolean = state.isWaveActive;
  let isVictory: boolean = state.isVictory;
  if (isWaveActive && nextQueue.length === 0 && survivingPhages.length === 0) {
    isWaveActive = false;
    nextAtp += 50; // wave clear bonus
    if (state.currentWave >= state.totalWaves) {
      isVictory = true;
    }
  }

  const isGameOver = nextViability <= 0;
  const newHighScore = Math.max(state.highScore, nextScore);

  return {
    state: {
      ...state,
      atp: nextAtp,
      score: nextScore,
      highScore: newHighScore,
      cellViability: nextViability,
      isWaveActive,
      isVictory,
      isGameOver,
      waveSpawnQueue: nextQueue,
      spawnTimerSec: nextSpawnTimer,
      towers: updatedTowers,
      phages: survivingPhages,
      projectiles: [], // reset flight list per frame tick for crisp ballistic drawing
    },
    defeatedPhages,
    breachedPhages,
  };
}
