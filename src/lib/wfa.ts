/**
 * Wavefront Alignment Algorithm (WFA) Engine
 * Exact gap-affine sequence alignment running in O(s · d) time.
 * Computes furthest-reaching offsets along diagonals with free LCP extensions.
 */

export interface WfaPenalties {
  mismatch: number; // Penalty x (e.g. 2)
  gapOpen: number; // Penalty o (e.g. 3)
  gapExtend: number; // Penalty e (e.g. 1)
}

export const DEFAULT_WFA_PENALTIES: WfaPenalties = {
  mismatch: 2,
  gapOpen: 3,
  gapExtend: 1,
};

export type WfaComponentType = 'M' | 'I' | 'D';

export interface WavefrontNode {
  s: number;
  k: number;
  type: WfaComponentType;
  offset: number; // Target coordinate i
  lcpExtended: number; // How many bases extended for free
  origin: 'init' | 'mismatch' | 'gap_open' | 'gap_extend';
  prevK?: number;
  prevS?: number;
  prevType?: WfaComponentType;
}

export interface WfaStepRecord {
  score: number;
  activeDiagonals: number[];
  frontiers: {
    k: number;
    offset: number;
    lcpExtended: number;
    i: number;
    j: number;
    type: WfaComponentType;
  }[];
  newCellsVisited: number;
}

export interface WfaResult {
  seq1: string;
  seq2: string;
  penalties: WfaPenalties;
  finalScore: number;
  totalSteps: number;
  cellsEvaluated: number;
  totalDpCells: number;
  prunedPercentage: number;
  steps: WfaStepRecord[];
  tracebackPath: [number, number][];
  aligned1: string;
  aligned2: string;
  matchLine: string;
  identity: number;
  matches: number;
  mismatches: number;
  gaps: number;
  length: number;
}

/**
 * Compute Longest Common Prefix (LCP) length along diagonal k starting at offset h in seq1.
 */
export function computeLcp(seq1: string, seq2: string, h: number, k: number): number {
  let len = 0;
  const m = seq1.length;
  const n = seq2.length;

  while (h + len < m && h + k + len < n && seq1[h + len] === seq2[h + k + len]) {
    len++;
  }
  return len;
}

/**
 * Run Wavefront Alignment Algorithm (WFA).
 */
export function runWfaAlignment(
  rawSeq1: string,
  rawSeq2: string,
  penalties: WfaPenalties = DEFAULT_WFA_PENALTIES,
): WfaResult {
  const seq1 = (rawSeq1 || 'ACGTAGCTA').trim().toUpperCase().replace(/[^A-Z]/g, '');
  const seq2 = (rawSeq2 || 'ACGTCGCTA').trim().toUpperCase().replace(/[^A-Z]/g, '');

  const m = seq1.length;
  const n = seq2.length;
  const targetK = n - m;

  const { mismatch: x, gapOpen: o, gapExtend: e } = penalties;
  const oe = o + e;

  // Wavefront tables: score -> Map<k, WavefrontNode>
  const M_table = new Map<number, Map<number, WavefrontNode>>();
  const I_table = new Map<number, Map<number, WavefrontNode>>();
  const D_table = new Map<number, Map<number, WavefrontNode>>();

  function getM(s: number, k: number): number {
    return M_table.get(s)?.get(k)?.offset ?? -Infinity;
  }
  function getI(s: number, k: number): number {
    return I_table.get(s)?.get(k)?.offset ?? -Infinity;
  }
  function getD(s: number, k: number): number {
    return D_table.get(s)?.get(k)?.offset ?? -Infinity;
  }

  const steps: WfaStepRecord[] = [];
  const visitedCells = new Set<string>();

  // Step 0: Initialize M_0[0]
  M_table.set(0, new Map());
  I_table.set(0, new Map());
  D_table.set(0, new Map());

  const lcp0 = computeLcp(seq1, seq2, 0, 0);
  const node0: WavefrontNode = {
    s: 0,
    k: 0,
    type: 'M',
    offset: lcp0,
    lcpExtended: lcp0,
    origin: 'init',
  };
  M_table.get(0)!.set(0, node0);

  // Record initial visited cells
  for (let c = 0; c <= lcp0; c++) {
    visitedCells.add(`${c},${c}`);
  }

  steps.push({
    score: 0,
    activeDiagonals: [0],
    frontiers: [
      {
        k: 0,
        offset: lcp0,
        lcpExtended: lcp0,
        i: lcp0,
        j: lcp0,
        type: 'M',
      },
    ],
    newCellsVisited: lcp0 + 1,
  });

  let endScore = -1;
  let endComponent: WfaComponentType = 'M';

  // Check if initial LCP already reached the target end (m, n)
  if (lcp0 >= m && lcp0 + 0 >= n) {
    endScore = 0;
  }

  // Iterate increasing penalty score s = 1, 2, ...
  let maxScoreCap = 200; // Safety cap
  for (let s = 1; s <= maxScoreCap && endScore === -1; s++) {
    const m_map = new Map<number, WavefrontNode>();
    const i_map = new Map<number, WavefrontNode>();
    const d_map = new Map<number, WavefrontNode>();

    M_table.set(s, m_map);
    I_table.set(s, i_map);
    D_table.set(s, d_map);

    // Diagonals range from -m to +n
    const minK = -m;
    const maxK = n;

    const stepFrontiers: WfaStepRecord['frontiers'] = [];
    const activeDiags: number[] = [];
    let newCellsCount = 0;

    for (let k = minK; k <= maxK; k++) {
      // 1. Insertion Wavefront I_s[k] (from k-1)
      let bestI = -Infinity;
      let iOrigin: WavefrontNode['origin'] = 'gap_open';
      let prevI_s = s - oe;
      let prevI_type: WfaComponentType = 'M';

      if (s >= oe && getM(s - oe, k - 1) >= 0) {
        bestI = getM(s - oe, k - 1) + 1;
        iOrigin = 'gap_open';
        prevI_s = s - oe;
        prevI_type = 'M';
      }
      if (s >= e && getI(s - e, k - 1) + 1 > bestI) {
        bestI = getI(s - e, k - 1) + 1;
        iOrigin = 'gap_extend';
        prevI_s = s - e;
        prevI_type = 'I';
      }

      if (bestI >= 0) {
        i_map.set(k, {
          s,
          k,
          type: 'I',
          offset: bestI,
          lcpExtended: 0,
          origin: iOrigin,
          prevK: k - 1,
          prevS: prevI_s,
          prevType: prevI_type,
        });
      }

      // 2. Deletion Wavefront D_s[k] (from k+1)
      let bestD = -Infinity;
      let dOrigin: WavefrontNode['origin'] = 'gap_open';
      let prevD_s = s - oe;
      let prevD_type: WfaComponentType = 'M';

      if (s >= oe && getM(s - oe, k + 1) >= 0) {
        bestD = getM(s - oe, k + 1);
        dOrigin = 'gap_open';
        prevD_s = s - oe;
        prevD_type = 'M';
      }
      if (s >= e && getD(s - e, k + 1) > bestD) {
        bestD = getD(s - e, k + 1);
        dOrigin = 'gap_extend';
        prevD_s = s - e;
        prevD_type = 'D';
      }

      if (bestD >= 0) {
        d_map.set(k, {
          s,
          k,
          type: 'D',
          offset: bestD,
          lcpExtended: 0,
          origin: dOrigin,
          prevK: k + 1,
          prevS: prevD_s,
          prevType: prevD_type,
        });
      }

      // 3. Match / Substitution Wavefront M_s[k]
      let bestM = -Infinity;
      let mOrigin: WavefrontNode['origin'] = 'mismatch';
      let prevM_s = s - x;
      let prevM_k = k;
      let prevM_type: WfaComponentType = 'M';

      // From mismatch
      if (s >= x && getM(s - x, k) >= 0) {
        bestM = getM(s - x, k) + 1;
        mOrigin = 'mismatch';
        prevM_s = s - x;
        prevM_k = k;
        prevM_type = 'M';
      }

      // From insertion
      if (bestI > bestM) {
        bestM = bestI;
        mOrigin = 'gap_open';
        prevM_s = s;
        prevM_k = k;
        prevM_type = 'I';
      }

      // From deletion
      if (bestD > bestM) {
        bestM = bestD;
        mOrigin = 'gap_open';
        prevM_s = s;
        prevM_k = k;
        prevM_type = 'D';
      }

      if (bestM >= 0 && bestM <= m && bestM + k >= 0 && bestM + k <= n) {
        // Free LCP extension along diagonal k
        const lcp = computeLcp(seq1, seq2, bestM, k);
        const finalOffset = Math.min(m, bestM + lcp);

        m_map.set(k, {
          s,
          k,
          type: 'M',
          offset: finalOffset,
          lcpExtended: lcp,
          origin: mOrigin,
          prevK: prevM_k,
          prevS: prevM_s,
          prevType: prevM_type,
        });

        // Record visited cells along this frontier
        for (let off = bestM; off <= finalOffset; off++) {
          const key = `${off},${off + k}`;
          if (!visitedCells.has(key)) {
            visitedCells.add(key);
            newCellsCount++;
          }
        }

        activeDiags.push(k);
        stepFrontiers.push({
          k,
          offset: finalOffset,
          lcpExtended: lcp,
          i: finalOffset,
          j: finalOffset + k,
          type: 'M',
        });

        // Check if reached destination (m, n)
        if (k === targetK && finalOffset >= m) {
          endScore = s;
          endComponent = 'M';
        }
      }
    }

    if (activeDiags.length > 0) {
      steps.push({
        score: s,
        activeDiagonals: activeDiags,
        frontiers: stepFrontiers,
        newCellsVisited: newCellsCount,
      });
    }
  }

  const finalScore = endScore >= 0 ? endScore : 0;

  // Reconstruct Traceback Path
  const tracebackPath: [number, number][] = [];
  let currS = finalScore;
  let currK = targetK;
  let currType: WfaComponentType = endComponent;

  let currNode = (
    currType === 'M' ? M_table : currType === 'I' ? I_table : D_table
  )
    .get(currS)
    ?.get(currK);

  let curI = m;
  let curJ = n;

  let aligned1Rev = '';
  let aligned2Rev = '';
  let matchLineRev = '';

  while (curI > 0 || curJ > 0) {
    tracebackPath.push([curI, curJ]);

    if (!currNode || (curI === 0 && curJ === 0)) {
      break;
    }

    // Step 1: Undo LCP matches on current diagonal
    if (currType === 'M' && currNode.lcpExtended > 0) {
      const lcp = currNode.lcpExtended;
      const baseOffset = currNode.offset - lcp;

      while (curI > baseOffset && curI > 0 && curJ > 0 && seq1[curI - 1] === seq2[curJ - 1]) {
        tracebackPath.push([curI, curJ]);
        aligned1Rev += seq1[curI - 1];
        aligned2Rev += seq2[curJ - 1];
        matchLineRev += '|';
        curI--;
        curJ--;
      }
    }

    if (curI === 0 && curJ === 0) {
      break;
    }

    // Step 2: Jump through predecessor origin
    const prevS = currNode.prevS ?? 0;
    const prevK = currNode.prevK ?? currK;
    const prevType = currNode.prevType ?? 'M';

    if (currNode.origin === 'mismatch' && curI > 0 && curJ > 0) {
      aligned1Rev += seq1[curI - 1];
      aligned2Rev += seq2[curJ - 1];
      matchLineRev += '.';
      curI--;
      curJ--;
    } else if (currNode.type === 'I' && curI > 0) {
      aligned1Rev += seq1[curI - 1];
      aligned2Rev += '-';
      matchLineRev += ' ';
      curI--;
    } else if (currNode.type === 'D' && curJ > 0) {
      aligned1Rev += '-';
      aligned2Rev += seq2[curJ - 1];
      matchLineRev += ' ';
      curJ--;
    } else if (curI > 0 && curJ > 0 && curI === curJ) {
      // Fallback match step
      aligned1Rev += seq1[curI - 1];
      aligned2Rev += seq2[curJ - 1];
      matchLineRev += seq1[curI - 1] === seq2[curJ - 1] ? '|' : '.';
      curI--;
      curJ--;
    } else if (curI > 0) {
      aligned1Rev += seq1[curI - 1];
      aligned2Rev += '-';
      matchLineRev += ' ';
      curI--;
    } else if (curJ > 0) {
      aligned1Rev += '-';
      aligned2Rev += seq2[curJ - 1];
      matchLineRev += ' ';
      curJ--;
    }

    currS = prevS;
    currK = prevK;
    currType = prevType;
    currNode = (
      currType === 'M' ? M_table : currType === 'I' ? I_table : D_table
    )
      .get(currS)
      ?.get(currK);
  }

  tracebackPath.push([0, 0]);

  const aligned1 = aligned1Rev.split('').reverse().join('');
  const aligned2 = aligned2Rev.split('').reverse().join('');
  const matchLine = matchLineRev.split('').reverse().join('');

  let matches = 0;
  let mismatches = 0;
  let gaps = 0;

  for (let k = 0; k < aligned1.length; k++) {
    const a = aligned1[k];
    const b = aligned2[k];
    if (a === '-' || b === '-') gaps++;
    else if (a === b) matches++;
    else mismatches++;
  }

  const length = aligned1.length;
  const identity = length > 0 ? Math.round((matches / length) * 1000) / 10 : 0;
  const totalDpCells = (m + 1) * (n + 1);
  const cellsEvaluated = visitedCells.size;
  const prunedPercentage = Math.round((1 - cellsEvaluated / totalDpCells) * 1000) / 10;

  return {
    seq1,
    seq2,
    penalties,
    finalScore,
    totalSteps: steps.length,
    cellsEvaluated,
    totalDpCells,
    prunedPercentage: Math.max(0, prunedPercentage),
    steps,
    tracebackPath,
    aligned1,
    aligned2,
    matchLine,
    identity,
    matches,
    mismatches,
    gaps,
    length,
  };
}
