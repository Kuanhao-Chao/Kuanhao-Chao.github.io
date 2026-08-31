/**
 * Phage Defense — Pure Game Logic Engine
 *
 * Simulates microbial path & cytoplasm tower defense where players deploy
 * molecular biology defense units (Restriction Endonucleases, CRISPR-Cas9,
 * RNases, DNA Ligase) and tactical emergency abilities (Autophagy, CRISPRi,
 * Plasmid Overcharge) to protect a bacterial cell nucleoid from bacteriophages.
 *
 * Uses a normalized Virtual Game Coordinate Resolution of 800 x 500.
 */

export const VIRTUAL_WIDTH = 800;
export const VIRTUAL_HEIGHT = 500;

export interface Point {
  x: number;
  y: number;
}

export type TowerType = 'restriction_enzyme' | 'crispr_cas9' | 'rnase_interceptor' | 'ligase_drone';

export type TargetPriority = 'first' | 'strongest' | 'weakest' | 'closest';

export type EmergencyAbilityType = 'autophagy' | 'crispri' | 'overcharge';

export interface EmergencyAbilityDef {
  type: EmergencyAbilityType;
  name: string;
  cost: number;
  durationSec: number;
  description: string;
}

export const EMERGENCY_ABILITIES: Record<EmergencyAbilityType, EmergencyAbilityDef> = {
  autophagy: {
    type: 'autophagy',
    name: 'Autophagy Purge',
    cost: 150,
    durationSec: 0,
    description: 'Lysosomal cellular purge that instantly incinerates all basic phages on screen.',
  },
  crispri: {
    type: 'crispri',
    name: 'CRISPRi Stasis',
    cost: 80,
    durationSec: 6.0,
    description: 'Catalytic dCas9 silencing that freezes all phages in place for 6.0 seconds.',
  },
  overcharge: {
    type: 'overcharge',
    name: 'Plasmid Overcharge',
    cost: 100,
    durationSec: 8.0,
    description: 'ATP supercharge that doubles the catalytic turnover rate (2x speed) of all towers for 8.0s.',
  },
};

export interface TowerStats {
  type: TowerType;
  name: string;
  cost: number;
  range: number;
  damage: number;
  fireRate: number;
  aoeRadius?: number;
  slowRatio?: number;
  description: string;
  color: string;
}

export const TOWER_DEFINITIONS: Record<TowerType, TowerStats> = {
  restriction_enzyme: {
    type: 'restriction_enzyme',
    name: 'EcoRI Cleaver',
    cost: 100,
    range: 120,
    damage: 32,
    fireRate: 1.8,
    description: 'Rapid endonuclease firing palindromic restriction bolts (GAATTC).',
    color: '#38bdf8', // cyan
  },
  crispr_cas9: {
    type: 'crispr_cas9',
    name: 'CRISPR-Cas9 Array',
    cost: 175,
    range: 220,
    damage: 110,
    fireRate: 0.9,
    description: 'Long-range precision ribonucleoprotein delivering devastating double-strand breaks.',
    color: '#a855f7', // purple
  },
  rnase_interceptor: {
    type: 'rnase_interceptor',
    name: 'RNase Jammer',
    cost: 125,
    range: 135,
    damage: 14,
    fireRate: 2.2,
    aoeRadius: 90,
    slowRatio: 0.5,
    description: 'Degrades viral mRNA and slows phage migration velocity by 50%.',
    color: '#f59e0b', // amber
  },
  ligase_drone: {
    type: 'ligase_drone',
    name: 'DNA Ligase Beacon',
    cost: 150,
    range: 145,
    damage: 0,
    fireRate: 0.6,
    description: 'Support beacon that enhances adjacent enzyme turnover rate by +35% and heals the nucleoid.',
    color: '#10b981', // emerald
  },
};

export type PhageType = 'lambda_phage' | 't4_myoviridae' | 'm13_filamentous' | 'giant_megaphage';

export interface PhageStats {
  type: PhageType;
  name: string;
  maxHealth: number;
  speed: number;
  atpReward: number;
  radius: number;
  color: string;
}

export const PHAGE_DEFINITIONS: Record<PhageType, PhageStats> = {
  lambda_phage: {
    type: 'lambda_phage',
    name: 'Lambda Siphophage',
    maxHealth: 55,
    speed: 85,
    atpReward: 15,
    radius: 13,
    color: '#38bdf8',
  },
  t4_myoviridae: {
    type: 't4_myoviridae',
    name: 'T4 Myoviridae Phage',
    maxHealth: 150,
    speed: 55,
    atpReward: 25,
    radius: 17,
    color: '#f43f5e',
  },
  m13_filamentous: {
    type: 'm13_filamentous',
    name: 'M13 Inovirus',
    maxHealth: 95,
    speed: 70,
    atpReward: 20,
    radius: 14,
    color: '#eab308',
  },
  giant_megaphage: {
    type: 'giant_megaphage',
    name: 'Giant Jumbo Megaphage',
    maxHealth: 800,
    speed: 35,
    atpReward: 130,
    radius: 26,
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
  targetPriority: TargetPriority;
  kills: number;
  totalDamage: number;
}

export interface ActivePhage {
  id: string;
  type: PhageType;
  x: number;
  y: number;
  health: number;
  maxHealth: number;
  shieldHealth: number;
  maxShieldHealth: number;
  speed: number;
  baseSpeed: number;
  slowTimerSec: number;
  waypointIndex: number;
  progressRatio: number;
  atpReward: number;
  radius: number;
  color: string;
  animTick?: number;
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

export interface ActiveEmergency {
  type: EmergencyAbilityType;
  timerSec: number;
  maxTimerSec: number;
}

export interface DefenseGameState {
  atp: number;
  score: number;
  highScore: number;
  cellViability: number;
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
  activeEmergencies: ActiveEmergency[];
  isGameOver: boolean;
  isVictory: boolean;
  isPaused: boolean;
  waypoints: Point[];
}

export function getDefaultWaypoints(): Point[] {
  return [
    { x: 0, y: 100 },
    { x: 220, y: 100 },
    { x: 280, y: 280 },
    { x: 520, y: 280 },
    { x: 580, y: 120 },
    { x: 720, y: 120 },
    { x: 720, y: 400 },
    { x: 400, y: 400 },
  ];
}

export function createInitialDefenseState(savedHighScore: number = 0): DefenseGameState {
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
    activeEmergencies: [],
    isGameOver: false,
    isVictory: false,
    isPaused: false,
    waypoints: getDefaultWaypoints(),
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
  if (x < 30 || x > VIRTUAL_WIDTH - 30 || y < 30 || y > VIRTUAL_HEIGHT - 30) {
    return false;
  }

  for (const t of towers) {
    if (Math.hypot(t.x - x, t.y - y) < minTowerDist) return false;
  }

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
    targetPriority: 'first',
    kills: 0,
    totalDamage: 0,
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

export function sellTower(
  state: DefenseGameState,
  towerId: string
): { state: DefenseGameState; refundAtp: number } {
  const tower = state.towers.find((t) => t.id === towerId);
  if (!tower) return { state, refundAtp: 0 };

  const def = TOWER_DEFINITIONS[tower.type];
  const totalInvested =
    def.cost +
    (tower.level > 1 ? def.cost * 0.85 : 0) +
    (tower.level > 2 ? def.cost * 1.7 : 0);
  const refundAtp = Math.round(totalInvested * 0.7);

  return {
    state: {
      ...state,
      atp: state.atp + refundAtp,
      towers: state.towers.filter((t) => t.id !== towerId),
    },
    refundAtp,
  };
}

export function setTowerPriority(
  state: DefenseGameState,
  towerId: string,
  priority: TargetPriority
): DefenseGameState {
  return {
    ...state,
    towers: state.towers.map((t) => (t.id === towerId ? { ...t, targetPriority: priority } : t)),
  };
}

export function activateEmergencyAbility(
  state: DefenseGameState,
  abilityType: EmergencyAbilityType
): { state: DefenseGameState; success: boolean } {
  const def = EMERGENCY_ABILITIES[abilityType];
  if (state.atp < def.cost || state.isGameOver) {
    return { state, success: false };
  }

  let nextAtp = state.atp - def.cost;
  let nextPhages = [...state.phages];
  let nextEmergencies = [...state.activeEmergencies.filter((e) => e.type !== abilityType)];

  if (abilityType === 'autophagy') {
    // Autophagy immediately lyses all non-boss phages on screen and awards 50% reward
    const surviving: ActivePhage[] = [];
    for (const p of nextPhages) {
      if (p.type === 'giant_megaphage') {
        p.health = Math.max(1, p.health - 250);
        surviving.push(p);
      } else {
        nextAtp += Math.round(p.atpReward * 0.5);
      }
    }
    nextPhages = surviving;
  } else {
    nextEmergencies.push({
      type: abilityType,
      timerSec: def.durationSec,
      maxTimerSec: def.durationSec,
    });
  }

  return {
    state: {
      ...state,
      atp: nextAtp,
      phages: nextPhages,
      activeEmergencies: nextEmergencies,
    },
    success: true,
  };
}

export function selectPhageTarget(
  tower: ActiveTower,
  phages: ActivePhage[],
  range: number
): ActivePhage | null {
  const inRange = phages.filter((p) => Math.hypot(p.x - tower.x, p.y - tower.y) <= range);
  if (inRange.length === 0) return null;

  switch (tower.targetPriority) {
    case 'first':
      return inRange.reduce((prev, curr) => (curr.progressRatio > prev.progressRatio ? curr : prev));
    case 'strongest':
      return inRange.reduce((prev, curr) => (curr.health > prev.health ? curr : prev));
    case 'weakest':
      return inRange.reduce((prev, curr) => (curr.health < prev.health ? curr : prev));
    case 'closest':
      return inRange.reduce((prev, curr) =>
        Math.hypot(curr.x - tower.x, curr.y - tower.y) < Math.hypot(prev.x - tower.x, prev.y - tower.y)
          ? curr
          : prev
      );
  }
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

  // Update active emergency abilities timers
  const updatedEmergencies: ActiveEmergency[] = [];
  let isCrispriActive = false;
  let isOverchargeActive = false;

  for (const emergency of state.activeEmergencies) {
    const nextTimer = emergency.timerSec - dt;
    if (nextTimer > 0) {
      updatedEmergencies.push({ ...emergency, timerSec: nextTimer });
      if (emergency.type === 'crispri') isCrispriActive = true;
      if (emergency.type === 'overcharge') isOverchargeActive = true;
    }
  }

  // 1. Spawn phages from queue (if not frozen by CRISPRi)
  if (
    state.isWaveActive &&
    nextQueue.length > 0 &&
    !isCrispriActive &&
    nextSpawnTimer >= state.spawnIntervalSec
  ) {
    nextSpawnTimer -= state.spawnIntervalSec;
    const type = nextQueue.shift()!;
    const def = PHAGE_DEFINITIONS[type];
    const startPt = state.waypoints[0];
    const shield = type === 'giant_megaphage' ? 250 : 0;
    nextPhages.push({
      id: `phage-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      type,
      x: startPt.x,
      y: startPt.y,
      health: def.maxHealth,
      maxHealth: def.maxHealth,
      shieldHealth: shield,
      maxShieldHealth: shield,
      speed: def.speed,
      baseSpeed: def.speed,
      slowTimerSec: 0,
      waypointIndex: 0,
      progressRatio: 0,
      atpReward: def.atpReward,
      radius: def.radius,
      color: def.color,
      animTick: 0,
    });
  }

  // 2. Advance existing phages (frozen if CRISPRi active)
  for (const phage of state.phages) {
    let p = { ...phage, animTick: (phage.animTick || 0) + dt * 5 };

    if (p.slowTimerSec > 0) {
      p.slowTimerSec -= dt;
      if (p.slowTimerSec <= 0) p.speed = p.baseSpeed;
    }

    if (isCrispriActive) {
      nextPhages.push(p);
      continue;
    }

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
      breachedPhages.push(p);
      const damage = p.type === 'giant_megaphage' ? 40 : 10;
      nextViability = Math.max(0, nextViability - damage);
    }
  }

  // 3. DNA Ligase Support Aura (+35% turnover rate for adjacent enzymes & nucleoid repair)
  const ligaseTowers = state.towers.filter((t) => t.type === 'ligase_drone');
  for (const ligase of ligaseTowers) {
    const def = TOWER_DEFINITIONS.ligase_drone;
    const healRange = def.range * (1 + (ligase.level - 1) * 0.2);
    // Slowly heal cell wall / nucleoid
    if (nextViability < state.maxViability && Math.random() < 0.05 * dt) {
      nextViability = Math.min(state.maxViability, nextViability + 1);
    }
  }

  // 4. Update towers, targeting & spawn new projectiles
  const newProjectiles: Projectile[] = [];
  const updatedTowers: ActiveTower[] = [];

  for (const tower of state.towers) {
    let t = { ...tower };
    const def = TOWER_DEFINITIONS[t.type];
    const range = def.range * (1 + (t.level - 1) * 0.15);
    const damage = def.damage * (1 + (t.level - 1) * 0.45);

    // Calculate ligase aura boost
    let ligaseBoost = 1.0;
    for (const lig of ligaseTowers) {
      if (lig.id !== t.id && Math.hypot(lig.x - t.x, lig.y - t.y) <= 145) {
        ligaseBoost += 0.35;
      }
    }

    const overchargeMultiplier = isOverchargeActive ? 2.0 : 1.0;
    const effectiveFireRate =
      def.fireRate * (1 + (t.level - 1) * 0.2) * ligaseBoost * overchargeMultiplier;

    if (t.cooldownSec > 0) {
      t.cooldownSec = Math.max(0, t.cooldownSec - dt);
    }

    const bestTarget = selectPhageTarget(t, nextPhages, range);
    t.targetId = bestTarget ? bestTarget.id : null;

    if (bestTarget && t.cooldownSec <= 0 && def.damage > 0) {
      t.cooldownSec = 1 / effectiveFireRate;
      t.totalDamage += damage;

      newProjectiles.push({
        id: `proj-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        sourceTowerId: t.id,
        targetPhageId: bestTarget.id,
        x: t.x,
        y: t.y,
        targetX: bestTarget.x,
        targetY: bestTarget.y,
        damage,
        speed: t.type === 'crispr_cas9' ? 650 : 450,
        color: def.color,
        aoeRadius: def.aoeRadius,
        slowRatio: def.slowRatio,
      });
    }

    updatedTowers.push(t);
  }

  // 5. Update ALL in-flight projectiles & apply hit damage (CRITICAL FIX: Retain surviving projectiles!)
  const survivingProjectiles: Projectile[] = [];

  for (const proj of [...state.projectiles, ...newProjectiles]) {
    const target = nextPhages.find((p) => p.id === proj.targetPhageId);
    const destX = target ? target.x : proj.targetX;
    const destY = target ? target.y : proj.targetY;

    const dx = destX - proj.x;
    const dy = destY - proj.y;
    const dist = Math.hypot(dx, dy);
    const step = proj.speed * dt;

    if (dist <= step || dist < 8) {
      // Direct Hit / AoE Application
      if (proj.aoeRadius && proj.aoeRadius > 0) {
        for (const p of nextPhages) {
          if (Math.hypot(p.x - destX, p.y - destY) <= proj.aoeRadius) {
            applyDamageToPhage(p, proj.damage);
            if (proj.slowRatio) {
              p.speed = p.baseSpeed * proj.slowRatio;
              p.slowTimerSec = 2.5;
            }
          }
        }
      } else if (target) {
        applyDamageToPhage(target, proj.damage);
      }
    } else {
      // In flight: advance projectile along trajectory and keep in state!
      proj.x += (dx / dist) * step;
      proj.y += (dy / dist) * step;
      proj.targetX = destX;
      proj.targetY = destY;
      survivingProjectiles.push(proj);
    }
  }

  // 6. Clean up defeated phages & award ATP + score
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
    nextAtp += 60; // wave clear bonus
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
      projectiles: survivingProjectiles,
      activeEmergencies: updatedEmergencies,
    },
    defeatedPhages,
    breachedPhages,
  };
}

function applyDamageToPhage(phage: ActivePhage, rawDamage: number) {
  if (phage.shieldHealth > 0) {
    if (phage.shieldHealth >= rawDamage) {
      phage.shieldHealth -= rawDamage;
      return;
    } else {
      const remainder = rawDamage - phage.shieldHealth;
      phage.shieldHealth = 0;
      phage.health -= remainder;
      return;
    }
  }
  phage.health -= rawDamage;
}
