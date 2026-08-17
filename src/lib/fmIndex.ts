/**
 * FM-Index & Burrows-Wheeler Transform (BWT) Algorithm Core.
 *
 * Implements:
 * 1. BWT Construction via Suffix Array lexicographical sorting.
 * 2. C table (character count smaller than c) and Occ matrix (cumulative occurrences).
 * 3. Ferragina & Manzini (FM) Backward Search with step-by-step trace generation.
 * 4. Last-to-First (LF) column mapping and original text recovery.
 */

export interface BwtRow {
  index: number;
  sa: number;
  f: string;
  l: string;
  suffix: string;
  rotation: string;
}

export interface BwtIndex {
  text: string;
  length: number;
  alphabet: string[];
  rows: BwtRow[];
  sa: number[];
  bwt: string;
  firstCol: string;
  cTable: Record<string, number>;
  occMatrix: Record<string, number[]>;
}

export interface SearchStep {
  stepNumber: number;
  char: string;
  patternIndex: number;
  spPrev: number;
  epPrev: number;
  cVal: number;
  occSp: number;
  occEpPlus1: number;
  sp: number;
  ep: number;
  isMatch: boolean;
  querySuffix: string;
  matchPositions: number[];
  formulaSpText: string;
  formulaEpText: string;
}

export interface SearchTrace {
  pattern: string;
  initialInterval: [number, number];
  steps: SearchStep[];
  isFound: boolean;
  matchCount: number;
  finalPositions: number[];
}

/**
 * Standardize text: uppercase and ensure trailing '$' sentinel.
 */
export function sanitizeReferenceText(input: string): string {
  let cleaned = input.trim().toUpperCase().replace(/[^A-Z0-9$]/g, '');
  if (!cleaned) cleaned = 'BANANA';
  if (!cleaned.endsWith('$')) {
    cleaned = cleaned.replace(/\$/g, '') + '$';
  }
  return cleaned;
}

/**
 * Build the BWT Index, Suffix Array, C table, and Occurrences matrix.
 */
export function buildBwt(rawText: string): BwtIndex {
  const text = sanitizeReferenceText(rawText);
  const n = text.length;

  // Generate all cyclic rotations
  const rotations: { rotation: string; sa: number; suffix: string }[] = [];
  for (let i = 0; i < n; i++) {
    const rotation = text.slice(i) + text.slice(0, i);
    const suffix = text.slice(i);
    rotations.push({ rotation, sa: i, suffix });
  }

  // Sort rotations lexicographically ('$' sorts before all other characters)
  rotations.sort((a, b) => {
    // Custom comparator where '$' is always smallest
    const sA = a.rotation;
    const sB = b.rotation;
    const len = Math.max(sA.length, sB.length);
    for (let k = 0; k < len; k++) {
      const charA = sA[k] || '';
      const charB = sB[k] || '';
      if (charA === charB) continue;
      if (charA === '$') return -1;
      if (charB === '$') return 1;
      return charA.localeCompare(charB);
    }
    return 0;
  });

  const sa: number[] = [];
  const rows: BwtRow[] = [];
  let bwt = '';
  let firstCol = '';

  for (let idx = 0; idx < n; idx++) {
    const item = rotations[idx];
    const fChar = item.rotation[0];
    const lChar = item.rotation[n - 1];
    sa.push(item.sa);
    firstCol += fChar;
    bwt += lChar;
    rows.push({
      index: idx,
      sa: item.sa,
      f: fChar,
      l: lChar,
      suffix: item.suffix,
      rotation: item.rotation,
    });
  }

  // Unique sorted alphabet
  const alphabetSet = new Set<string>();
  for (let i = 0; i < n; i++) {
    alphabetSet.add(text[i]);
  }
  const alphabet = Array.from(alphabetSet).sort((a, b) => {
    if (a === '$') return -1;
    if (b === '$') return 1;
    return a.localeCompare(b);
  });

  // Calculate character frequencies in text
  const charCounts: Record<string, number> = {};
  for (const ch of alphabet) charCounts[ch] = 0;
  for (let i = 0; i < n; i++) {
    charCounts[text[i]] = (charCounts[text[i]] || 0) + 1;
  }

  // Calculate C table: C[c] = total occurrences of characters strictly smaller than c
  const cTable: Record<string, number> = {};
  let runningTotal = 0;
  for (const ch of alphabet) {
    cTable[ch] = runningTotal;
    runningTotal += charCounts[ch] || 0;
  }

  // Calculate Occurrences matrix: Occ(c, i) = occurrences of c in L[0..i-1] for i in 0..n
  const occMatrix: Record<string, number[]> = {};
  for (const ch of alphabet) {
    occMatrix[ch] = new Array(n + 1).fill(0);
  }

  for (let i = 0; i < n; i++) {
    const lChar = bwt[i];
    for (const ch of alphabet) {
      occMatrix[ch][i + 1] = occMatrix[ch][i] + (ch === lChar ? 1 : 0);
    }
  }

  return {
    text,
    length: n,
    alphabet,
    rows,
    sa,
    bwt,
    firstCol,
    cTable,
    occMatrix,
  };
}

/**
 * Execute step-by-step FM-Index backward search for a given pattern.
 */
export function bwtBackwardSearch(index: BwtIndex, query: string): SearchTrace {
  const pattern = query.trim().toUpperCase();
  const n = index.length;

  if (!pattern) {
    return {
      pattern: '',
      initialInterval: [0, n - 1],
      steps: [],
      isFound: true,
      matchCount: n,
      finalPositions: [...index.sa].sort((a, b) => a - b),
    };
  }

  let sp = 0;
  let ep = n - 1;
  const steps: SearchStep[] = [];

  for (let j = pattern.length - 1; j >= 0; j--) {
    const char = pattern[j];
    const spPrev = sp;
    const epPrev = ep;

    if (!index.alphabet.includes(char)) {
      // Character not in alphabet
      const step: SearchStep = {
        stepNumber: steps.length + 1,
        char,
        patternIndex: j,
        spPrev,
        epPrev,
        cVal: 0,
        occSp: 0,
        occEpPlus1: 0,
        sp: 1,
        ep: 0,
        isMatch: false,
        querySuffix: pattern.slice(j),
        matchPositions: [],
        formulaSpText: `'${char}' not in alphabet`,
        formulaEpText: `'${char}' not in alphabet`,
      };
      steps.push(step);
      sp = 1;
      ep = 0;
      break;
    }

    const cVal = index.cTable[char] ?? 0;
    const occSp = index.occMatrix[char]?.[spPrev] ?? 0;
    const occEpPlus1 = index.occMatrix[char]?.[epPrev + 1] ?? 0;

    const spNew = cVal + occSp;
    const epNew = cVal + occEpPlus1 - 1;
    const isMatch = spNew <= epNew;

    const querySuffix = pattern.slice(j);
    const matchPositions = isMatch ? index.sa.slice(spNew, epNew + 1).sort((a, b) => a - b) : [];

    const formulaSpText = `sp = C['${char}'] + Occ('${char}', ${spPrev}) = ${cVal} + ${occSp} = ${spNew}`;
    const formulaEpText = `ep = C['${char}'] + Occ('${char}', ${epPrev + 1}) - 1 = ${cVal} + ${occEpPlus1} - 1 = ${epNew}`;

    const step: SearchStep = {
      stepNumber: steps.length + 1,
      char,
      patternIndex: j,
      spPrev,
      epPrev,
      cVal,
      occSp,
      occEpPlus1,
      sp: spNew,
      ep: epNew,
      isMatch,
      querySuffix,
      matchPositions,
      formulaSpText,
      formulaEpText,
    };

    steps.push(step);
    sp = spNew;
    ep = epNew;

    if (!isMatch) break;
  }

  const isFound = sp <= ep;
  const matchCount = isFound ? ep - sp + 1 : 0;
  const finalPositions = isFound ? index.sa.slice(sp, ep + 1).sort((a, b) => a - b) : [];

  return {
    pattern,
    initialInterval: [0, n - 1],
    steps,
    isFound,
    matchCount,
    finalPositions,
  };
}

/**
 * LF-Mapping: maps row i in L column to its corresponding row in F column.
 */
export function lfMapping(index: BwtIndex, lRowIndex: number): number {
  if (lRowIndex < 0 || lRowIndex >= index.length) return -1;
  const char = index.bwt[lRowIndex];
  const cVal = index.cTable[char] ?? 0;
  const occCount = index.occMatrix[char]?.[lRowIndex] ?? 0;
  return cVal + occCount;
}

/**
 * Reconstruct original string from BWT using LF-mapping walk.
 */
export function recoverOriginalText(index: BwtIndex): string {
  let row = 0; // '$' is always at row 0 in F
  let result = '$';
  for (let step = 0; step < index.length - 1; step++) {
    const char = index.bwt[row];
    result = char + result;
    row = lfMapping(index, row);
  }
  return result;
}
