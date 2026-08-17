/**
 * Minimap2 Minimizer Sampling & Collinear DP Chaining Engine.
 *
 * Implements:
 * 1. (w, k)-minimizer sliding window sampling.
 * 2. Exact anchor pairing between Target (T) and Query (Q).
 * 3. 2D Collinear Dynamic Programming Chaining with gap penalty.
 * 4. Traceback to recover maximal collinear anchor chains.
 */

export interface Kmer {
  pos: number;
  seq: string;
  hash: number;
}

export interface Minimizer {
  pos: number;
  seq: string;
  hash: number;
  windowIndex: number;
}

export interface Anchor {
  id: number;
  x: number; // Target coordinate (0-based)
  y: number; // Query coordinate (0-based)
  kmer: string;
  hash: number;
}

export interface DpPredecessorEvaluation {
  predId: number;
  predAnchor: Anchor;
  deltaX: number;
  deltaY: number;
  gap: number;
  dist: number;
  matchBonus: number;
  gapPenalty: number;
  candidateScore: number;
}

export interface DpStep {
  stepNumber: number;
  anchorId: number;
  anchor: Anchor;
  candidates: DpPredecessorEvaluation[];
  bestPredecessorId: number | null;
  score: number;
  formulaText: string;
}

export interface CollinearChain {
  anchorIds: number[];
  score: number;
  anchors: Anchor[];
}

export interface Minimap2Result {
  target: string;
  query: string;
  w: number;
  k: number;
  targetKmers: Kmer[];
  queryKmers: Kmer[];
  targetMinimizers: Minimizer[];
  queryMinimizers: Minimizer[];
  anchors: Anchor[];
  steps: DpStep[];
  chains: CollinearChain[];
  bestChain: CollinearChain | null;
}

/**
 * Deterministic integer hash for nucleotide k-mers.
 */
export function hashKmer(kmer: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < kmer.length; i++) {
    h ^= kmer.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  // Ensure non-negative 16-bit integer for clean display & comparison
  return (h >>> 0) % 10000;
}

/**
 * Extract all k-mers from a sequence.
 */
export function extractKmers(seq: string, k: number): Kmer[] {
  const kmers: Kmer[] = [];
  if (seq.length < k) return kmers;
  for (let i = 0; i <= seq.length - k; i++) {
    const sub = seq.slice(i, i + k);
    kmers.push({
      pos: i,
      seq: sub,
      hash: hashKmer(sub),
    });
  }
  return kmers;
}

/**
 * Extract (w, k)-minimizers using sliding window.
 */
export function extractMinimizers(
  seq: string,
  w: number,
  k: number,
): { kmers: Kmer[]; minimizers: Minimizer[] } {
  const kmers = extractKmers(seq, k);
  const minimizers: Minimizer[] = [];
  if (kmers.length === 0) return { kmers, minimizers };

  const numWindows = Math.max(1, kmers.length - w + 1);

  for (let win = 0; win < numWindows; win++) {
    let minKmer = kmers[win];

    const windowEnd = Math.min(kmers.length, win + w);
    for (let j = win; j < windowEnd; j++) {
      if (kmers[j].hash < minKmer.hash) {
        minKmer = kmers[j];
      }
    }

    // Avoid duplicate adjacent identical minimizers
    const last = minimizers[minimizers.length - 1];
    if (!last || last.pos !== minKmer.pos) {
      minimizers.push({
        pos: minKmer.pos,
        seq: minKmer.seq,
        hash: minKmer.hash,
        windowIndex: win,
      });
    }
  }

  return { kmers, minimizers };
}

/**
 * Find exact matching anchors between Target and Query minimizers.
 */
export function findAnchors(
  targetMinimizers: Minimizer[],
  queryMinimizers: Minimizer[],
): Anchor[] {
  const rawAnchors: Omit<Anchor, 'id'>[] = [];

  for (const tMin of targetMinimizers) {
    for (const qMin of queryMinimizers) {
      if (tMin.seq === qMin.seq) {
        rawAnchors.push({
          x: tMin.pos,
          y: qMin.pos,
          kmer: tMin.seq,
          hash: tMin.hash,
        });
      }
    }
  }

  // Sort anchors primarily by target x, secondarily by query y
  rawAnchors.sort((a, b) => {
    if (a.x !== b.x) return a.x - b.x;
    return a.y - b.y;
  });

  // Assign sequential IDs
  return rawAnchors.map((a, idx) => ({
    id: idx,
    ...a,
  }));
}

/**
 * Compute Collinear Dynamic Programming Chaining on anchors.
 */
export function runCollinearChaining(
  target: string,
  query: string,
  w: number,
  k: number,
  maxDistance = 50,
): Minimap2Result {
  const cleanTarget = target.trim().toUpperCase().replace(/[^ACGT]/g, '');
  const cleanQuery = query.trim().toUpperCase().replace(/[^ACGT]/g, '');

  const { kmers: targetKmers, minimizers: targetMinimizers } = extractMinimizers(
    cleanTarget,
    w,
    k,
  );
  const { kmers: queryKmers, minimizers: queryMinimizers } = extractMinimizers(
    cleanQuery,
    w,
    k,
  );

  const anchors = findAnchors(targetMinimizers, queryMinimizers);
  const numAnchors = anchors.length;

  if (numAnchors === 0) {
    return {
      target: cleanTarget,
      query: cleanQuery,
      w,
      k,
      targetKmers,
      queryKmers,
      targetMinimizers,
      queryMinimizers,
      anchors: [],
      steps: [],
      chains: [],
      bestChain: null,
    };
  }

  const scores: number[] = new Array(numAnchors).fill(0);
  const backpointers: (number | null)[] = new Array(numAnchors).fill(null);
  const steps: DpStep[] = [];

  // Minimap2 DP recurrence:
  // S(i) = k + max_{j < i, x_j < x_i, y_j < y_i} (S(j) + min(Δx, Δy, k) - α(gap))
  // gap = |Δx - Δy|
  // α(gap) = 0.5 * gap + 0.05 * max(Δx, Δy)
  for (let i = 0; i < numAnchors; i++) {
    const cur = anchors[i];
    let bestPrevScore = 0;
    let bestPrevId: number | null = null;
    const candidates: DpPredecessorEvaluation[] = [];

    for (let j = 0; j < i; j++) {
      const prev = anchors[j];
      const deltaX = cur.x - prev.x;
      const deltaY = cur.y - prev.y;

      // Collinear strictly increasing condition
      if (deltaX > 0 && deltaY > 0) {
        const dist = Math.max(deltaX, deltaY);
        if (dist <= maxDistance) {
          const gap = Math.abs(deltaX - deltaY);
          const matchBonus = Math.min(deltaX, deltaY, k);
          const gapPenalty = Math.round((0.5 * gap + 0.05 * dist) * 10) / 10;
          const candidateScore = Math.max(0, scores[j] + matchBonus - gapPenalty);

          candidates.push({
            predId: j,
            predAnchor: prev,
            deltaX,
            deltaY,
            gap,
            dist,
            matchBonus,
            gapPenalty,
            candidateScore,
          });

          if (candidateScore > bestPrevScore) {
            bestPrevScore = candidateScore;
            bestPrevId = j;
          }
        }
      }
    }

    scores[i] = k + bestPrevScore;
    backpointers[i] = bestPrevId;

    let formulaText = `S[${i}] = ${k} (base anchor length)`;
    if (bestPrevId !== null) {
      const bestCand = candidates.find((c) => c.predId === bestPrevId);
      if (bestCand) {
        formulaText = `S[${i}] = ${k} + S[${bestPrevId}](${scores[bestPrevId]}) + bonus(${bestCand.matchBonus}) - gapPenalty(${bestCand.gapPenalty}) = ${scores[i]}`;
      }
    }

    steps.push({
      stepNumber: i + 1,
      anchorId: i,
      anchor: cur,
      candidates,
      bestPredecessorId: bestPrevId,
      score: scores[i],
      formulaText,
    });
  }

  // Traceback all maximal chains
  const chains: CollinearChain[] = [];
  const visitedInChain = new Set<number>();

  // Sort anchor indices by score descending
  const sortedIndices = Array.from({ length: numAnchors }, (_, idx) => idx).sort(
    (a, b) => scores[b] - scores[a],
  );

  for (const startIdx of sortedIndices) {
    if (visitedInChain.has(startIdx)) continue;

    const chainAnchorIds: number[] = [];
    let curr: number | null = startIdx;
    while (curr !== null) {
      chainAnchorIds.unshift(curr);
      visitedInChain.add(curr);
      curr = backpointers[curr];
    }

    chains.push({
      anchorIds: chainAnchorIds,
      score: scores[startIdx],
      anchors: chainAnchorIds.map((id) => anchors[id]),
    });
  }

  const bestChain = chains.length > 0 ? chains[0] : null;

  return {
    target: cleanTarget,
    query: cleanQuery,
    w,
    k,
    targetKmers,
    queryKmers,
    targetMinimizers,
    queryMinimizers,
    anchors,
    steps,
    chains,
    bestChain,
  };
}
