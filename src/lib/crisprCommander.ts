/**
 * CRISPR Commander — Pure Game Logic Engine
 *
 * Simulates real molecular cleaving of viral DNA/RNA strands using Cas9/Cas12
 * endonuclease enzymes, Protospacer Adjacent Motifs (PAM = NGG / TTTV),
 * base editing, dCas9 repressor shields, hyper-drive overdrive, and particle/combo scoring.
 */

export type Nucleotide = 'A' | 'C' | 'G' | 'T';

export type CasType = 'SpCas9' | 'AsCas12a';

export interface PamRule {
  pam: string;
  name: string;
  casType: CasType;
  position: '3prime' | '5prime';
}

export const PAM_RULES: Record<CasType, PamRule> = {
  SpCas9: { pam: 'NGG', name: 'SpCas9 (Streptococcus pyogenes)', casType: 'SpCas9', position: '3prime' },
  AsCas12a: { pam: 'TTTV', name: 'AsCas12a (Acidaminococcus sp.)', casType: 'AsCas12a', position: '5prime' },
};

export interface ViralStrand {
  id: string;
  type: 'phage_dna' | 'retrovirus_rna' | 'transposon' | 'acr_boss';
  name: string;
  sequence: string;
  pamIndex: number;
  pamSequence: string;
  targetSequence: string;
  x: number; // 0 to 1 normalized canvas X
  y: number; // normalized canvas Y
  vx: number;
  vy: number;
  radius: number;
  health: number;
  maxHealth: number;
  points: number;
  cleaved: boolean;
  color: string;
}

export interface CleavedFragment {
  id: string;
  sequence: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  angle: number;
  vRot: number;
  color: string;
  alpha: number;
  life: number;
  maxLife: number;
}

export interface SliceLine {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  time: number;
}

export type PowerUpType = 'dcas9_shield' | 'prime_editor' | 'base_editor' | 'hyper_drive';

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
  activeCas: CasType;
  strands: ViralStrand[];
  fragments: CleavedFragment[];
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
    atp: 60,
    combo: 0,
    maxCombo: 0,
    level: 1,
    cleavedCount: 0,
    activeCas: 'SpCas9',
    strands: [],
    fragments: [],
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
  activeCas: CasType = 'SpCas9',
  randomFn: () => number = Math.random
): ViralStrand {
  const isBoss = level % 5 === 0 && idCounter % 10 === 0;
  const isRetrovirus = !isBoss && randomFn() < 0.3;
  const isTransposon = !isBoss && !isRetrovirus && randomFn() < 0.25;

  let type: ViralStrand['type'] = 'phage_dna';
  let name = 'T4 Bacteriophage DNA';
  let color = '#38bdf8'; // cyan
  let health = 1;
  let points = 100;
  let radius = 28;

  if (isBoss) {
    type = 'acr_boss';
    name = 'Anti-CRISPR AcrIIA4 Phage';
    color = '#f43f5e'; // crimson
    health = Math.min(5 + Math.floor(level / 2), 12);
    points = 1000;
    radius = 44;
  } else if (isRetrovirus) {
    type = 'retrovirus_rna';
    name = 'Retroviral RNA Strand';
    color = '#a855f7'; // purple
    health = 2;
    points = 250;
    radius = 32;
  } else if (isTransposon) {
    type = 'transposon';
    name = 'Jumping Retrotransposon';
    color = '#f59e0b'; // amber
    health = 1;
    points = 180;
    radius = 26;
  }

  // PAM sequences tailored to active enzyme
  let pam = 'CGG';
  if (activeCas === 'AsCas12a') {
    pam = randomFn() < 0.5 ? 'TTTA' : 'TTTC';
  } else {
    pam = randomFn() < 0.5 ? 'AGG' : 'TGG';
  }

  const prefix = generateRandomSequence(4, randomFn);
  const target = prefix + pam;
  const suffix = generateRandomSequence(4, randomFn);
  const fullSeq = prefix + pam + suffix;

  const startX = 0.15 + randomFn() * 0.7;
  const startY = -0.05;
  const baseSpeedY = 0.08 + level * 0.015 + randomFn() * 0.04;
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

export function createDoubleStrandBreakFragments(
  strand: ViralStrand,
  canvasW: number,
  canvasH: number,
  randomFn: () => number = Math.random
): [CleavedFragment, CleavedFragment] {
  const px = strand.x * canvasW;
  const py = strand.y * canvasH;
  const mid = Math.floor(strand.sequence.length / 2);
  const seq1 = strand.sequence.slice(0, mid);
  const seq2 = strand.sequence.slice(mid);

  const angle1 = (randomFn() * 0.5 + 0.25) * Math.PI;
  const angle2 = angle1 + Math.PI;
  const speed = 2.0 + randomFn() * 3.0;

  const f1: CleavedFragment = {
    id: `frag-${strand.id}-1`,
    sequence: seq1,
    x: px,
    y: py,
    vx: Math.cos(angle1) * speed,
    vy: Math.sin(angle1) * speed - 1.0,
    angle: 0,
    vRot: (randomFn() - 0.5) * 0.15,
    color: strand.color,
    alpha: 1.0,
    life: 0,
    maxLife: 45,
  };

  const f2: CleavedFragment = {
    id: `frag-${strand.id}-2`,
    sequence: seq2,
    x: px,
    y: py,
    vx: Math.cos(angle2) * speed,
    vy: Math.sin(angle2) * speed - 1.0,
    angle: 0,
    vRot: (randomFn() - 0.5) * 0.15,
    color: strand.color,
    alpha: 1.0,
    life: 0,
    maxLife: 45,
  };

  return [f1, f2];
}

export function switchCasEnzyme(state: GameState, enzyme: CasType): GameState {
  if (state.activeCas === enzyme || state.isGameOver) return state;
  return {
    ...state,
    activeCas: enzyme,
  };
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
  let isHyperActive = false;
  for (const p of state.powerUps) {
    const rem = p.remainingMs - deltaMs;
    if (rem > 0) {
      nextPowerUps.push({ ...p, remainingMs: rem });
      if (p.type === 'dcas9_shield') isShieldActive = true;
      if (p.type === 'hyper_drive') isHyperActive = true;
    }
  }

  // 2. Process slice hits & fragment physics
  const cleavedStrands: ViralStrand[] = [];
  const nextStrands: ViralStrand[] = [];
  const breaches: ViralStrand[] = [];
  const nextFragments: CleavedFragment[] = [];

  // Update existing fragments
  for (const frag of state.fragments) {
    let f = { ...frag };
    f.x += f.vx;
    f.y += f.vy;
    f.vy += 0.06; // gravity
    f.angle += f.vRot;
    f.life += 1;
    f.alpha = Math.max(0, 1 - f.life / f.maxLife);
    if (f.life < f.maxLife) {
      nextFragments.push(f);
    }
  }

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

    // Check slice collisions (or Hyper-Drive auto-cleaves nearby)
    let hitThisFrame = false;
    for (const slice of slices) {
      if (checkSliceCleave(strandCopy, slice, canvasW, canvasH)) {
        hitThisFrame = true;
        break;
      }
    }

    if (hitThisFrame || isHyperActive) {
      strandCopy.health -= isHyperActive ? 2 : 1;
      if (strandCopy.health <= 0) {
        strandCopy.cleaved = true;
        cleavedStrands.push(strandCopy);
        newCombo += 1;
        if (newCombo > newMaxCombo) newMaxCombo = newCombo;

        const comboMultiplier = Math.min(1 + Math.floor(newCombo / 5) * 0.5, 4.0);
        newScore += Math.round(strandCopy.points * comboMultiplier);
        newAtp += strandCopy.type === 'acr_boss' ? 30 : 6;
        newCleavedCount += 1;

        // Spawn double-strand break fragments
        const [f1, f2] = createDoubleStrandBreakFragments(strandCopy, canvasW, canvasH, randomFn);
        nextFragments.push(f1, f2);
        continue;
      }
    }

    // Check bottom boundary breach (host DNA integration)
    if (strandCopy.y >= 0.95) {
      breaches.push(strandCopy);
      const damage = strandCopy.type === 'acr_boss' ? 30 : 10;
      newIntegrity = Math.max(0, newIntegrity - damage);
      newCombo = 0;
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
    nextStrands.push(spawnViralStrand(newLevel, idCounter++, state.activeCas, randomFn));
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
    fragments: nextFragments,
    powerUps: nextPowerUps,
    isGameOver,
    spawnTimerMs: newSpawnTimer,
    elapsedMs: newElapsedMs,
  };

  return { state: nextState, cleavedStrands, breaches };
}

export function activatePowerUp(state: GameState, type: PowerUpType): GameState {
  const atpCost: Record<PowerUpType, number> = {
    dcas9_shield: 40,
    prime_editor: 50,
    base_editor: 35,
    hyper_drive: 75,
  };

  if (state.atp < atpCost[type] || state.isGameOver) return state;

  const durationMs: Record<PowerUpType, number> = {
    dcas9_shield: 6000,
    prime_editor: 0, // instantaneous heal
    base_editor: 8000,
    hyper_drive: 5000,
  };

  let nextIntegrity = state.cellIntegrity;
  let nextStrands = [...state.strands];

  if (type === 'prime_editor') {
    nextIntegrity = Math.min(state.maxCellIntegrity, nextIntegrity + 40);
  } else if (type === 'base_editor') {
    // CBE deaminates and neutralizes point mutation targets (converts C->T)
    nextStrands = nextStrands.map((s) => ({
      ...s,
      health: Math.max(1, s.health - 1),
      sequence: s.sequence.replace(/C/g, 'T'),
    }));
  }

  const nextPowerUps = [...state.powerUps.filter((p) => p.type !== type)];
  if (durationMs[type] > 0) {
    nextPowerUps.push({ type, durationMs: durationMs[type], remainingMs: durationMs[type] });
  }

  return {
    ...state,
    atp: state.atp - atpCost[type],
    cellIntegrity: nextIntegrity,
    strands: nextStrands,
    powerUps: nextPowerUps,
  };
}
