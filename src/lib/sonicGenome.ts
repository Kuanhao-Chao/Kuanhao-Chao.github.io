export type MusicalScale =
  | 'lydian'
  | 'dorian'
  | 'pentatonic'
  | 'hirajoshi'
  | 'aeolian'
  | 'wholetone';

export type SynthPreset =
  | 'ambient-pad'
  | 'crystal-chimes'
  | 'cyber-saw'
  | 'chiptune'
  | 'ethereal-glass';

export type AminoPolarity = 'hydrophobic' | 'polar' | 'acidic' | 'basic' | 'stop';

export interface CodonTranslation {
  aa: string;
  name: string;
  polarity: AminoPolarity;
}

export interface MotifMatch {
  type: 'TATA' | 'EBOX' | 'CTCF' | 'SPLICE_DONOR' | 'SPLICE_ACCEPTOR' | 'CPG' | 'POLYA';
  name: string;
  start: number;
  length: number;
  percussionTrigger: 'kick' | 'snare' | 'hihat' | 'shimmer' | 'woodblock';
}

export interface GenomicNoteEvent {
  index: number;
  base: 'A' | 'C' | 'G' | 'T' | 'N';
  codon?: string;
  aminoAcid?: string;
  aminoName?: string;
  polarity?: AminoPolarity;
  midiNote: number;
  frequency: number;
  duration: number;
  velocity: number;
  isMotif: boolean;
  motif?: MotifMatch;
  gcRatio: number;
  isTriadRoot: boolean;
}

// Scale interval definitions relative to root (semitones)
export const SCALE_INTERVALS: Record<MusicalScale, number[]> = {
  lydian: [0, 2, 4, 6, 7, 9, 11], // Bright, dreamy (Root, M2, M3, #4, P5, M6, M7)
  dorian: [0, 2, 3, 5, 7, 9, 10], // Spacey, melancholic (Root, M2, m3, P4, P5, M6, m7)
  pentatonic: [0, 2, 4, 7, 9], // Universal, consonant (Root, M2, M3, P5, M6)
  hirajoshi: [0, 2, 3, 7, 8], // Traditional Japanese, mysterious (Root, M2, m3, P5, m6)
  aeolian: [0, 2, 3, 5, 7, 8, 10], // Natural Minor, dramatic (Root, M2, m3, P4, P5, m6, m7)
  wholetone: [0, 2, 4, 6, 8, 10] // Dream-like, unanchored (Root, M2, M3, #4, #5, #6)
};

// Root frequencies for C4 = 261.63 Hz
export const ROOT_MIDI = 60; // C4

// Standard Genetic Code codon table
export const CODON_TABLE: Record<string, CodonTranslation> = {
  TTT: { aa: 'F', name: 'Phenylalanine', polarity: 'hydrophobic' },
  TTC: { aa: 'F', name: 'Phenylalanine', polarity: 'hydrophobic' },
  TTA: { aa: 'L', name: 'Leucine', polarity: 'hydrophobic' },
  TTG: { aa: 'L', name: 'Leucine', polarity: 'hydrophobic' },
  TCT: { aa: 'S', name: 'Serine', polarity: 'polar' },
  TCC: { aa: 'S', name: 'Serine', polarity: 'polar' },
  TCA: { aa: 'S', name: 'Serine', polarity: 'polar' },
  TCG: { aa: 'S', name: 'Serine', polarity: 'polar' },
  TAT: { aa: 'Y', name: 'Tyrosine', polarity: 'polar' },
  TAC: { aa: 'Y', name: 'Tyrosine', polarity: 'polar' },
  TAA: { aa: '*', name: 'Stop', polarity: 'stop' },
  TAG: { aa: '*', name: 'Stop', polarity: 'stop' },
  TGT: { aa: 'C', name: 'Cysteine', polarity: 'polar' },
  TGC: { aa: 'C', name: 'Cysteine', polarity: 'polar' },
  TGA: { aa: '*', name: 'Stop', polarity: 'stop' },
  TGG: { aa: 'W', name: 'Tryptophan', polarity: 'hydrophobic' },

  CTT: { aa: 'L', name: 'Leucine', polarity: 'hydrophobic' },
  CTC: { aa: 'L', name: 'Leucine', polarity: 'hydrophobic' },
  CTA: { aa: 'L', name: 'Leucine', polarity: 'hydrophobic' },
  CTG: { aa: 'L', name: 'Leucine', polarity: 'hydrophobic' },
  CCT: { aa: 'P', name: 'Proline', polarity: 'hydrophobic' },
  CCC: { aa: 'P', name: 'Proline', polarity: 'hydrophobic' },
  CCA: { aa: 'P', name: 'Proline', polarity: 'hydrophobic' },
  CCG: { aa: 'P', name: 'Proline', polarity: 'hydrophobic' },
  CAT: { aa: 'H', name: 'Histidine', polarity: 'basic' },
  CAC: { aa: 'H', name: 'Histidine', polarity: 'basic' },
  CAA: { aa: 'Q', name: 'Glutamine', polarity: 'polar' },
  CAG: { aa: 'Q', name: 'Glutamine', polarity: 'polar' },
  CGT: { aa: 'R', name: 'Arginine', polarity: 'basic' },
  CGC: { aa: 'R', name: 'Arginine', polarity: 'basic' },
  CGA: { aa: 'R', name: 'Arginine', polarity: 'basic' },
  CGG: { aa: 'R', name: 'Arginine', polarity: 'basic' },

  ATT: { aa: 'I', name: 'Isoleucine', polarity: 'hydrophobic' },
  ATC: { aa: 'I', name: 'Isoleucine', polarity: 'hydrophobic' },
  ATA: { aa: 'I', name: 'Isoleucine', polarity: 'hydrophobic' },
  ATG: { aa: 'M', name: 'Methionine', polarity: 'hydrophobic' },
  ACT: { aa: 'T', name: 'Threonine', polarity: 'polar' },
  ACC: { aa: 'T', name: 'Threonine', polarity: 'polar' },
  ACA: { aa: 'T', name: 'Threonine', polarity: 'polar' },
  ACG: { aa: 'T', name: 'Threonine', polarity: 'polar' },
  AAT: { aa: 'N', name: 'Asparagine', polarity: 'polar' },
  AAC: { aa: 'N', name: 'Asparagine', polarity: 'polar' },
  AAA: { aa: 'K', name: 'Lysine', polarity: 'basic' },
  AAG: { aa: 'K', name: 'Lysine', polarity: 'basic' },
  AGT: { aa: 'S', name: 'Serine', polarity: 'polar' },
  AGC: { aa: 'S', name: 'Serine', polarity: 'polar' },
  AGA: { aa: 'R', name: 'Arginine', polarity: 'basic' },
  AGG: { aa: 'R', name: 'Arginine', polarity: 'basic' },

  GTT: { aa: 'V', name: 'Valine', polarity: 'hydrophobic' },
  GTC: { aa: 'V', name: 'Valine', polarity: 'hydrophobic' },
  GTA: { aa: 'V', name: 'Valine', polarity: 'hydrophobic' },
  GTG: { aa: 'V', name: 'Valine', polarity: 'hydrophobic' },
  GCT: { aa: 'A', name: 'Alanine', polarity: 'hydrophobic' },
  GCC: { aa: 'A', name: 'Alanine', polarity: 'hydrophobic' },
  GCA: { aa: 'A', name: 'Alanine', polarity: 'hydrophobic' },
  GCG: { aa: 'A', name: 'Alanine', polarity: 'hydrophobic' },
  GAT: { aa: 'D', name: 'Aspartate', polarity: 'acidic' },
  GAC: { aa: 'D', name: 'Aspartate', polarity: 'acidic' },
  GAA: { aa: 'E', name: 'Glutamate', polarity: 'acidic' },
  GAG: { aa: 'E', name: 'Glutamate', polarity: 'acidic' },
  GGT: { aa: 'G', name: 'Glycine', polarity: 'hydrophobic' },
  GGC: { aa: 'G', name: 'Glycine', polarity: 'hydrophobic' },
  GGA: { aa: 'G', name: 'Glycine', polarity: 'hydrophobic' },
  GGG: { aa: 'G', name: 'Glycine', polarity: 'hydrophobic' }
};

/**
 * Cleans and formats raw DNA/FASTA inputs into uppercase ACGTN string.
 */
export function cleanDnaSequence(raw: string): string {
  if (!raw) return '';
  const lines = raw.split(/\r?\n/);
  const filtered = lines.filter((l) => !l.trim().startsWith('>')).join('');
  return filtered
    .toUpperCase()
    .replace(/U/g, 'T')
    .replace(/[^ACGTN]/g, '');
}

/**
 * Translates English text into a biological DNA sequence using a 6-bit encoding.
 */
export function textToCodonSequence(text: string): string {
  if (!text) return '';
  const BASES = ['A', 'C', 'G', 'T'];
  let seq = '';
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i) % 64; // 6 bits = 2 bits x 3 bases = 1 codon
    const b1 = BASES[(code >> 4) & 3];
    const b2 = BASES[(code >> 2) & 3];
    const b3 = BASES[code & 3];
    seq += b1 + b2 + b3;
  }
  return seq;
}

/**
 * Translates a 3-letter DNA codon into amino acid details.
 */
export function translateCodon(codon: string): CodonTranslation {
  const norm = codon.toUpperCase().replace(/U/g, 'T');
  return CODON_TABLE[norm] || { aa: 'X', name: 'Unknown', polarity: 'hydrophobic' };
}

/**
 * Calculates rolling GC-content percentage over a sliding window.
 */
export function computeRollingGcContent(seq: string, windowSize: number = 20): number[] {
  const result: number[] = [];
  const n = seq.length;
  if (n === 0) return result;

  const half = Math.floor(windowSize / 2);
  for (let i = 0; i < n; i++) {
    const start = Math.max(0, i - half);
    const end = Math.min(n, i + half + 1);
    let gc = 0;
    for (let j = start; j < end; j++) {
      const b = seq[j];
      if (b === 'G' || b === 'C') gc++;
    }
    result.push(gc / (end - start));
  }
  return result;
}

/**
 * Scans a DNA sequence for canonical genomic motifs to trigger musical events.
 */
export function scanMotifs(seq: string): MotifMatch[] {
  const matches: MotifMatch[] = [];
  const patterns: Array<{
    regex: RegExp;
    type: MotifMatch['type'];
    name: string;
    trigger: MotifMatch['percussionTrigger'];
  }> = [
    { regex: /TATA[AT]A[AT]/g, type: 'TATA', name: 'TATA Box Promoter', trigger: 'kick' },
    { regex: /CACGTG/g, type: 'EBOX', name: 'E-Box (MYC/MAX)', trigger: 'snare' },
    { regex: /CCGCG[ACGT]GG[ACGT]GGC/g, type: 'CTCF', name: 'CTCF Insulator', trigger: 'woodblock' },
    { regex: /GTAAG|GTGAG|GTAGT/g, type: 'SPLICE_DONOR', name: '5′ Splice Donor', trigger: 'hihat' },
    { regex: /[CT]{6,}[ACGT]AG/g, type: 'SPLICE_ACCEPTOR', name: '3′ Splice Acceptor', trigger: 'hihat' },
    { regex: /AATAAA/g, type: 'POLYA', name: 'Polyadenylation Signal', trigger: 'shimmer' }
  ];

  for (const p of patterns) {
    let m: RegExpExecArray | null;
    while ((m = p.regex.exec(seq)) !== null) {
      matches.push({
        type: p.type,
        name: p.name,
        start: m.index,
        length: m[0].length,
        percussionTrigger: p.trigger
      });
    }
  }

  return matches.sort((a, b) => a.start - b.start);
}

/**
 * Converts MIDI note number to fundamental frequency in Hertz.
 */
export function midiToFrequency(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

/**
 * Maps a DNA sequence and scale into a sequence of playable musical events.
 */
export function sequenceToNoteEvents(
  seq: string,
  scale: MusicalScale,
  baseOctave: number = 4
): GenomicNoteEvent[] {
  const cleaned = cleanDnaSequence(seq);
  const intervals = SCALE_INTERVALS[scale] || SCALE_INTERVALS.lydian;
  const numNotes = intervals.length;
  const rollingGc = computeRollingGcContent(cleaned, 15);
  const motifs = scanMotifs(cleaned);
  const motifMap = new Map<number, MotifMatch>();
  for (const m of motifs) {
    for (let i = 0; i < m.length; i++) {
      if (!motifMap.has(m.start + i)) {
        motifMap.set(m.start + i, m);
      }
    }
  }

  const basePitchMap: Record<string, number> = {
    A: 0, // Root
    T: 2 % numNotes, // Third
    C: 4 % numNotes, // Fifth
    G: 6 % numNotes, // Seventh / Octave
    N: 1 % numNotes // Accent
  };

  const rootMidi = 12 * (baseOctave + 1); // C4 = 60
  const events: GenomicNoteEvent[] = [];

  for (let i = 0; i < cleaned.length; i++) {
    const base = (cleaned[i] as 'A' | 'C' | 'G' | 'T' | 'N') || 'A';
    const isTriadRoot = i % 3 === 0;
    const codon = isTriadRoot && i + 3 <= cleaned.length ? cleaned.slice(i, i + 3) : undefined;
    const trans = codon ? translateCodon(codon) : undefined;

    // Harmonic scale degree selection
    const baseDegree = basePitchMap[base] ?? 0;
    const octaveOffset = base === 'G' ? 1 : base === 'A' ? 0 : 0;
    const interval = intervals[baseDegree % numNotes];
    const midi = rootMidi + 12 * octaveOffset + interval;
    const freq = midiToFrequency(midi);

    const gc = rollingGc[i] ?? 0.5;
    const motif = motifMap.get(i);

    events.push({
      index: i,
      base,
      codon,
      aminoAcid: trans?.aa,
      aminoName: trans?.name,
      polarity: trans?.polarity,
      midiNote: midi,
      frequency: freq,
      duration: isTriadRoot ? 0.35 : 0.22,
      velocity: isTriadRoot ? 0.85 : 0.65,
      isMotif: !!motif,
      motif,
      gcRatio: gc,
      isTriadRoot
    });
  }

  return events;
}
