/**
 * Ribosome mRNA Translation Rush Game Engine.
 *
 * Pure, headless state machine modeling continuous 5' -> 3' mRNA translation,
 * A/P/E site codon translocation, tRNA anticodon docking, spliceosome intron
 * excision, ATP/GTP energy conservation, and protein domain synthesis.
 */

export interface CodonData {
  codon: string;
  anticodon: string;
  aminoAcid: string;
  aminoName: string;
  isStop?: boolean;
  isIntron?: boolean;
}

export const GENETIC_CODE: Record<string, { aa: string; name: string; anti: string }> = {
  AUG: { aa: 'M', name: 'Methionine (Start)', anti: 'UAC' },
  UUU: { aa: 'F', name: 'Phenylalanine', anti: 'AAA' },
  UUC: { aa: 'F', name: 'Phenylalanine', anti: 'GAA' },
  GGU: { aa: 'G', name: 'Glycine', anti: 'CCA' },
  GGC: { aa: 'G', name: 'Glycine', anti: 'GCC' },
  AAA: { aa: 'K', name: 'Lysine', anti: 'UUU' },
  AAG: { aa: 'K', name: 'Lysine', anti: 'CUU' },
  CAG: { aa: 'Q', name: 'Glutamine', anti: 'CUG' },
  GAG: { aa: 'E', name: 'Glutamate', anti: 'CUC' },
  UGG: { aa: 'W', name: 'Tryptophan', anti: 'ACC' },
  CCU: { aa: 'P', name: 'Proline', anti: 'GGA' },
  CGU: { aa: 'R', name: 'Arginine', anti: 'ACG' },
  GAU: { aa: 'D', name: 'Aspartate', anti: 'AUC' },
  UAU: { aa: 'Y', name: 'Tyrosine', anti: 'AUA' },
  UAA: { aa: '*', name: 'Ochre (Stop)', anti: 'AUU' },
  UAG: { aa: '*', name: 'Amber (Stop)', anti: 'AUC' },
  UGA: { aa: '*', name: 'Opal (Stop)', anti: 'ACU' },
};

export interface TranscriptItem {
  id: number;
  codon: string;
  anticodon: string;
  aminoAcid: string;
  aminoName: string;
  isStop: boolean;
  isIntron: boolean;
  spliced?: boolean;
  translated?: boolean;
  failed?: boolean;
}

export interface RibosomeGameState {
  status: 'ready' | 'playing' | 'gameover' | 'victory';
  score: number;
  highScore: number;
  chain: string[];
  combo: number;
  maxCombo: number;
  energy: number; // 0 - 100 ATP
  level: number;
  stream: TranscriptItem[];
  currentIndex: number;
  activeAnticodonChoices: string[];
  intronActive: boolean;
  message: string;
}

export function createInitialStream(length: number = 30): TranscriptItem[] {
  const codons = Object.keys(GENETIC_CODE).filter((c) => !['UAA', 'UAG', 'UGA'].includes(c));
  const stream: TranscriptItem[] = [
    {
      id: 0,
      codon: 'AUG',
      anticodon: 'UAC',
      aminoAcid: 'M',
      aminoName: 'Methionine (Start)',
      isStop: false,
      isIntron: false,
    },
  ];

  for (let i = 1; i < length; i++) {
    // 15% chance of intron loop, 8% chance of premature stop codon
    const rand = Math.random();
    let codon = codons[Math.floor(Math.random() * codons.length)];
    let isIntron = false;
    let isStop = false;

    if (i > 3 && rand < 0.15) {
      isIntron = true;
      codon = 'GURAG';
    } else if (i > 6 && rand > 0.92) {
      isStop = true;
      codon = ['UAA', 'UAG', 'UGA'][Math.floor(Math.random() * 3)];
    }

    const info = GENETIC_CODE[codon] || { aa: '?', name: 'Intron', anti: '---' };
    stream.push({
      id: i,
      codon,
      anticodon: info.anti,
      aminoAcid: info.aa,
      aminoName: info.name,
      isStop,
      isIntron,
    });
  }

  return stream;
}

export function createRibosomeGame(savedHighScore: number = 0): RibosomeGameState {
  const stream = createInitialStream(35);
  const current = stream[0];
  const choices = generateAnticodonChoices(current.anticodon);

  return {
    status: 'ready',
    score: 0,
    highScore: savedHighScore,
    chain: [],
    combo: 0,
    maxCombo: 0,
    energy: 100,
    level: 1,
    stream,
    currentIndex: 0,
    activeAnticodonChoices: choices,
    intronActive: false,
    message: 'Press START or Space to begin translation!',
  };
}

export function generateAnticodonChoices(correctAnticodon: string): string[] {
  const allAntis = Object.values(GENETIC_CODE).map((g) => g.anti);
  const pool = Array.from(new Set(allAntis)).filter((a) => a !== correctAnticodon);
  const shuffled = pool.sort(() => Math.random() - 0.5).slice(0, 3);
  shuffled.push(correctAnticodon);
  return shuffled.sort(() => Math.random() - 0.5);
}

export function stepGame(state: RibosomeGameState, action: { type: 'MATCH_TRNA'; anticodon: string } | { type: 'SPLICE' } | { type: 'TICK' } | { type: 'START' }): RibosomeGameState {
  if (action.type === 'START') {
    return {
      ...state,
      status: 'playing',
      message: 'Translate codons into peptides! Match complementary tRNAs!',
    };
  }

  if (state.status !== 'playing') return state;

  const currentItem = state.stream[state.currentIndex];
  if (!currentItem) {
    return {
      ...state,
      status: 'victory',
      score: state.score + 500,
      message: '🎉 Protein Domain Fully Synthesized & Folded!',
    };
  }

  // Handle Intron Splicing
  if (action.type === 'SPLICE') {
    if (currentItem.isIntron) {
      const nextIndex = state.currentIndex + 1;
      const nextItem = state.stream[nextIndex];
      const newScore = state.score + 150 * (state.combo + 1);
      const newCombo = state.combo + 1;
      const nextChoices = nextItem ? generateAnticodonChoices(nextItem.anticodon) : [];

      return {
        ...state,
        score: newScore,
        combo: newCombo,
        maxCombo: Math.max(state.maxCombo, newCombo),
        currentIndex: nextIndex,
        activeAnticodonChoices: nextChoices,
        energy: Math.min(100, state.energy + 10),
        message: '✂️ Spliceosome Excision: Intron Spliced!',
      };
    } else {
      // Inappropriate splicing of mature exon
      const newEnergy = Math.max(0, state.energy - 15);
      return {
        ...state,
        energy: newEnergy,
        combo: 0,
        message: '⚠️ Mis-splicing! That was a coding exon!',
        status: newEnergy <= 0 ? 'gameover' : 'playing',
      };
    }
  }

  // Handle tRNA Matching
  if (action.type === 'MATCH_TRNA') {
    if (currentItem.isIntron) {
      const newEnergy = Math.max(0, state.energy - 20);
      return {
        ...state,
        energy: newEnergy,
        combo: 0,
        message: '⚠️ Ribosome stalled! Press SPACE to splice the intron!',
        status: newEnergy <= 0 ? 'gameover' : 'playing',
      };
    }

    if (currentItem.isStop) {
      // Dodged stop codon by matching or terminal factor
      return {
        ...state,
        status: 'victory',
        score: state.score + 300,
        message: '🛑 Reached Termination Codon: Protein Completed!',
      };
    }

    if (action.anticodon === currentItem.anticodon) {
      // Correct tRNA match! Peptide bond formed!
      const nextIndex = state.currentIndex + 1;
      const nextItem = state.stream[nextIndex];
      const newChain = [...state.chain, currentItem.aminoAcid];
      const newCombo = state.combo + 1;
      const newScore = state.score + 100 * newCombo;
      const nextChoices = nextItem ? generateAnticodonChoices(nextItem.anticodon) : [];

      if (!nextItem || nextIndex >= state.stream.length) {
        return {
          ...state,
          score: newScore + 500,
          chain: newChain,
          combo: newCombo,
          maxCombo: Math.max(state.maxCombo, newCombo),
          status: 'victory',
          message: '🏆 Protein Domain Synthesis Complete!',
        };
      }

      return {
        ...state,
        score: newScore,
        chain: newChain,
        combo: newCombo,
        maxCombo: Math.max(state.maxCombo, newCombo),
        currentIndex: nextIndex,
        activeAnticodonChoices: nextChoices,
        energy: Math.min(100, state.energy + 5),
        message: `✨ Peptide Bond Formed: +${currentItem.aminoName}!`,
      };
    } else {
      // Mismatched tRNA
      const newEnergy = Math.max(0, state.energy - 15);
      return {
        ...state,
        energy: newEnergy,
        combo: 0,
        message: `❌ Mismatch! Needed complementary anticodon ${currentItem.anticodon}`,
        status: newEnergy <= 0 ? 'gameover' : 'playing',
      };
    }
  }

  // Handle Tick (Energy decay over time if stagnant)
  if (action.type === 'TICK') {
    const newEnergy = Math.max(0, state.energy - 0.08);
    if (newEnergy <= 0) {
      return {
        ...state,
        energy: 0,
        status: 'gameover',
        message: '💀 Ribosome Ran Out of ATP Energy!',
      };
    }
    return { ...state, energy: newEnergy };
  }

  return state;
}
