/**
 * CRISPR Commander — Pure Game Logic Engine
 *
 * Simulates real molecular cleaving of viral DNA/RNA strands using Cas9/Cas12
 * endonuclease enzymes, Protospacer Adjacent Motifs (PAM = NGG / TTTV),
 * base editing, dCas9 repressor shields, and particle/combo scoring mechanics.
 */

export type Nucleotide = 'A' | 'C' | 'G' | 'T';

export interface PamRule {
  pam: string;
  name: string;
  casType: 'Cas9' | 'Cas12a';
  position: '3prime' | '5prime';
}

export const PAM_RULES: Record<string, PamRule> = {
  cas9_sp: { pam: 'NGG', name: 'SpCas9', casType: 'Cas9', position: '3prime' },
  cas12a: { pam: 'TTTV', name: 'AsCas12a', casType: 'Cas12a', position: '5prime' },
};

export interface ViralStrand {
  id: string;
  type: 'phage_dna' | 'retrovirus_rna' | 'transposon' | 'acr_boss';
  name: string;
  sequence: string; // e.g. "ATGCGATCGGATCGG"
  pamIndex: number; // 0-indexed position where PAM occurs
  pamSequence: string; // e.g. "CGG" or "TGG"
  targetSequence: string; // 20bp or 6-10bp protospacer adjacent to PAM
  x: number; // 0 to 1 normalized canvas X
  y: number; // normalized canvas Y
  vx: number; // velocity X
  vy: number; // velocity Y
  radius: number;
  health: number;
  maxHealth: number;
  points: number;
  cleaved: boolean;
  color: string;
}

export interface SliceLine {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  time: number;
}

export type PowerUpType = 'base_editor' | 'dcas9_shield' | 'prime_editor' | 'hyper_drive';

export interface ActivePowerUp {
  type: PowerUpType;
  durationMs: number;
  remainingMs: number;
}

export interface GameState {
  score: number;
  highScore: number;
  cellIntegrity: number; // 0 to 100
  maxCellIntegrity: number;
  atp: number;
  combo: number;
  maxCombo: number;
  level: number;
  cleavedCount: number;
  activeGuideRna: string;
  activeCas: 'Cas9' | 'Cas12a';
  strands: ViralStrand[];
  powerUps: ActivePowerUp[];
  isGameOver: boolean;
  isPaused: boolean;
  spawnTimerMs: number;
  elapsedMs: number;
}

export function createInitialState(savedHighScore: number = 0): GameState {
  return {
    score: 0,
    highScore: savedHighScore,
    cellIntegrity: 100,
    maxCellIntegrity: 100,
    atp: 50,
    combo: 0,
    maxCombo: 0,
    level: 1,
    cleavedCount: 0,
    activeGuideRna: 'GATCGG',
    activeCas: 'Cas9',
    strands: [],
    powerUps: [],
    isGameOver: false,
    isPaused: false,
    spawnTimerMs: 0,
    elapsedMs: 0,
  };
}

export function matchPam(seq: string, rule: PamRule): boolean {
  if (rule.pam === 'NGG') {
    if (seq.length < 3) return false;
    return seq[1] === 'G' && seq[2] === 'G';
  }
  if (rule.pam === 'TTTV') {
    if (seq.length < 4) return false;
    return (
      seq[0] === 'T' &&
      seq[1] === 'T' &&
      seq[2] === 'T' &&
      (seq[3] === 'A' || seq[3] === 'C' || seq[3] === 'G')
    );
  }
  return false;
}

export function randomNucleotide(randomFn: () => number = Math.random): Nucleotide {
  const bases: Nucleotide[] = ['A', 'C', 'G', 'T'];
  return bases[Math.floor(randomFn() * bases.length)];
}

export function generateRandomSequence(length: number, randomFn: () => number = Math.random): string {
  let seq = '';
  for (let i = 0; i < length; i++) {
    seq += randomNucleotide(randomFn);
  }
  return seq;
}

export function spawnViralStrand(
  level: number,
  idCounter: number,
  randomFn: () => number = Math.random
): ViralStrand {
  const isBoss = level % 5 === 0 && idCounter % 12 === 0;
  const isRetrovirus = !isBoss && randomFn() < 0.3;
  const isTransposon = !isBoss && !isRetrovirus && randomFn() < 0.25;

  let type: ViralStrand['type'] = 'phage_dna';
  let name = 'T4 Bacteriophage DNA';
  let color = '#38bdf8'; // neon cyan
  let health = 1;
  let points = 100;
  let radius = 26;

  if (isBoss) {
    type = 'acr_boss';
    name = 'Anti-CRISPR AcrIIA4 Phage';
    color = '#f43f5e'; // neon crimson
    health = Math.min(5 + Math.floor(level / 2), 12);
    points = 1000;
    radius = 44;
  } else if (isRetrovirus) {
    type = 'retrovirus_rna';
    name = 'Retroviral RNA Strand';
    color = '#a855f7'; // neon purple
    health = 2;
    points = 250;
    radius = 30;
  } else if (isTransposon) {
    type = 'transposon';
    name = 'Jumping Retrotransposon';
    color = '#f59e0b'; // amber
    health = 1;
    points = 180;
    radius = 24;
  }

  // Create sequence with a guaranteed matching PAM
  const prefix = generateRandomSequence(4, randomFn);
  const pam = randomFn() < 0.5 ? 'AGG' : 'CGG';
  const target = prefix + pam;
  const suffix = generateRandomSequence(4, randomFn);
  const fullSeq = prefix + pam + suffix;

  const startX = 0.15 + randomFn() * 0.7;
  const startY = -0.05; // spawn above top screen
  const baseSpeedY = (0.08 + level * 0.015 + randomFn() * 0.04);
  const baseSpeedX = (randomFn() - 0.5) * 0.04;

  return {
    id: `strand-${idCounter}`,
    type,
    name,
    sequence: fullSeq,
    pamIndex: prefix.length,
    pamSequence: pam,
    targetSequence: target,
    x: startX,
    y: startY,
    vx: baseSpeedX,
    vy: baseSpeedY,
    radius,
    health,
    maxHealth: health,
    points,
    cleaved: false,
    color,
  };
}

/**
 * Line-to-circle distance intersection math for slice collision detection.
 */
export function pointToSegmentDistance(
  px: number,
  py: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number
): number {
  const l2 = (x2 - x1) * (x2 - x1) + (y2 - y1) * (y2 - y1);
  if (l2 === 0) {
    return Math.hypot(px - x1, py - y1);
  }
  let t = ((px - x1) * (x2 - x1) + (py - y1) * (y2 - y1)) / l2;
  t = Math.max(0, Math.min(1, t));
  const projX = x1 + t * (x2 - x1);
  const projY = y1 + t * (y2 - y1);
  return Math.hypot(px - projX, py - projY);
}

export function checkSliceCleave(
  strand: ViralStrand,
  slice: SliceLine,
  canvasW: number,
  canvasH: number
): boolean {
  if (strand.cleaved) return false;
  const px = strand.x * canvasW;
  const py = strand.y * canvasH;
  const dist = pointToSegmentDistance(px, py, slice.x1, slice.y1, slice.x2, slice.y2);
  return dist <= strand.radius;
}

export function updateGameState(
  state: GameState,
  deltaSec: number,
  slices: SliceLine[] = [],
  canvasW: number = 800,
  canvasH: number = 600,
  randomFn: () => number = Math.random
): { state: GameState; cleavedStrands: ViralStrand[]; breaches: ViralStrand[] } {
  if (state.isGameOver || state.isPaused) {
    return { state, cleavedStrands: [], breaches: [] };
  }

  const deltaMs = deltaSec * 1000;
  const newElapsedMs = state.elapsedMs + deltaMs;
  let newScore = state.score;
  let newCombo = state.combo;
  let newMaxCombo = state.maxCombo;
  let newAtp = state.atp;
  let newIntegrity = state.cellIntegrity;
  let newCleavedCount = state.cleavedCount;
  let newLevel = Math.floor(newCleavedCount / 10) + 1;

  // 1. Update active power-ups
  const nextPowerUps: ActivePowerUp[] = [];
  let isShieldActive = false;
  for (const p of state.powerUps) {
    const rem = p.remainingMs - deltaMs;
    if (rem > 0) {
      nextPowerUps.push({ ...p, remainingMs: rem });
      if (p.type === 'dcas9_shield') isShieldActive = true;
    }
  }

  // 2. Process slice hits
  const cleavedStrands: ViralStrand[] = [];
  const nextStrands: ViralStrand[] = [];
  const breaches: ViralStrand[] = [];

  for (const s of state.strands) {
    let strandCopy = { ...s };

    // Move strand
    const speedFactor = isShieldActive ? 0.35 : 1.0;
    strandCopy.x += strandCopy.vx * deltaSec * speedFactor;
    strandCopy.y += strandCopy.vy * deltaSec * speedFactor;

    // Check bounce off left/right walls
    if (strandCopy.x <= 0.05 || strandCopy.x >= 0.95) {
      strandCopy.vx *= -1;
    }

    // Check slice collisions
    let hitThisFrame = false;
    for (const slice of slices) {
      if (checkSliceCleave(strandCopy, slice, canvasW, canvasH)) {
        hitThisFrame = true;
        break;
      }
    }

    if (hitThisFrame) {
      strandCopy.health -= 1;
      if (strandCopy.health <= 0) {
        strandCopy.cleaved = true;
        cleavedStrands.push(strandCopy);
        newCombo += 1;
        if (newCombo > newMaxCombo) newMaxCombo = newCombo;

        const comboMultiplier = Math.min(1 + Math.floor(newCombo / 5) * 0.5, 4.0);
        newScore += Math.round(strandCopy.points * comboMultiplier);
        newAtp += strandCopy.type === 'acr_boss' ? 25 : 5;
        newCleavedCount += 1;
        continue;
      }
    }

    // Check bottom boundary breach (host DNA integration)
    if (strandCopy.y >= 0.95) {
      breaches.push(strandCopy);
      const damage = strandCopy.type === 'acr_boss' ? 30 : 10;
      newIntegrity = Math.max(0, newIntegrity - damage);
      newCombo = 0; // reset combo on breach
      continue;
    }

    nextStrands.push(strandCopy);
  }

  // 3. Spawn new strands
  const spawnInterval = Math.max(700, 2200 - newLevel * 120);
  let newSpawnTimer = state.spawnTimerMs + deltaMs;
  let idCounter = state.cleavedCount + nextStrands.length + 1;

  while (newSpawnTimer >= spawnInterval && nextStrands.length < 15) {
    newSpawnTimer -= spawnInterval;
    nextStrands.push(spawnViralStrand(newLevel, idCounter++, randomFn));
  }

  const isGameOver = newIntegrity <= 0;
  const newHighScore = Math.max(state.highScore, newScore);

  const nextState: GameState = {
    ...state,
    score: newScore,
    highScore: newHighScore,
    cellIntegrity: newIntegrity,
    atp: newAtp,
    combo: newCombo,
    maxCombo: newMaxCombo,
    level: newLevel,
    cleavedCount: newCleavedCount,
    strands: nextStrands,
    powerUps: nextPowerUps,
    isGameOver,
    spawnTimerMs: newSpawnTimer,
    elapsedMs: newElapsedMs,
  };

  return { state: nextState, cleavedStrands, breaches };
}

export function activatePowerUp(state: GameState, type: PowerUpType): GameState {
  const atpCost = {
    base_editor: 30,
    dcas9_shield: 40,
    prime_editor: 50,
    hyper_drive: 60,
  }[type];

  if (state.atp < atpCost || state.isGameOver) return state;

  const durationMs = {
    base_editor: 8000,
    dcas9_shield: 6000,
    prime_editor: 0, // instantaneous full heal
    hyper_drive: 7000,
  }[type];

  let nextIntegrity = state.cellIntegrity;
  if (type === 'prime_editor') {
    nextIntegrity = Math.min(state.maxCellIntegrity, nextIntegrity + 40);
  }

  const nextPowerUps = [...state.powerUps.filter((p) => p.type !== type)];
  if (durationMs > 0) {
    nextPowerUps.push({ type, durationMs, remainingMs: durationMs });
  }

  return {
    ...state,
    atp: state.atp - atpCost,
    cellIntegrity: nextIntegrity,
    powerUps: nextPowerUps,
  };
}
