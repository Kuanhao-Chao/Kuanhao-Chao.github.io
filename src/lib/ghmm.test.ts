import { describe, it, expect } from 'vitest';
import {
  evaluateDurationScore,
  scoreSegmentEmission,
  runGhmmGeneFinder,
  translateDnaToProtein,
} from './ghmm';

describe('Generalized Hidden Markov Models (GHMMs) for Gene Finding', () => {
  it('evaluates explicit duration scores with biological length peaks', () => {
    // Exon length peak at 15
    const scoreOpt = evaluateDurationScore('Exon_Init', 15);
    const scoreShort = evaluateDurationScore('Exon_Init', 4);
    expect(scoreOpt).toBeGreaterThan(scoreShort);

    // Intron length minimum threshold (< 8 is penalized)
    const intronShort = evaluateDurationScore('Intron', 5);
    const intronValid = evaluateDurationScore('Intron', 14);
    expect(intronValid).toBeGreaterThan(intronShort);
  });

  it('validates canonical biological signals (ATG, GT, AG, Stop Codons)', () => {
    // Valid initial exon: ATG...GT
    const initRes = scoreSegmentEmission('ATGGCCAAAGT', 0, 11, 'Exon_Init');
    expect(initRes.isValid).toBe(true);

    // Invalid initial exon without ATG
    const badInit = scoreSegmentEmission('TTGGCCAAAGT', 0, 11, 'Exon_Init');
    expect(badInit.isValid).toBe(false);

    // Valid intron ending in AG
    const intronRes = scoreSegmentEmission('GTAAGTCCTAAG', 0, 12, 'Intron');
    expect(intronRes.isValid).toBe(true);
  });

  it('translates nucleotide CDS into correct protein sequence', () => {
    const cds = 'ATGGCCAAATAA'; // Met-Ala-Lys-Stop
    const prot = translateDnaToProtein(cds);
    expect(prot).toBe('MAK');
  });

  it('accurately predicts multi-exon eukaryotic gene structure', () => {
    // Construct synthetic gene:
    // Intergenic: AAAAA (5bp)
    // Exon_Init:  ATGGCCAAAGT (11bp)
    // Intron:     GTAAGTCCTAAG (12bp)
    // Exon_Term:  AGGCAAAATAA (11bp)
    // Intergenic: TTTTT (5bp)
    const geneDna = 'AAAAAATGGCCAAAGTGTAAGTCCTAAGAGGCAAAATAATTTTT';
    const result = runGhmmGeneFinder(geneDna);

    expect(result.features.length).toBeGreaterThan(0);
    expect(result.exonCount).toBeGreaterThanOrEqual(1);
    expect(result.proteinTranslation.length).toBeGreaterThan(0);
    expect(result.stats.totalLen).toBe(geneDna.length);
  });

  it('identifies single-exon prokaryotic genes', () => {
    const sglGene = 'ATGGCCAAAGCGTAA';
    const result = runGhmmGeneFinder(sglGene);

    expect(result.features.length).toBeGreaterThan(0);
    expect(result.proteinTranslation).toBe('MAKA');
  });
});
