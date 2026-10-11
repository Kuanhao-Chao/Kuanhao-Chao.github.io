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

  it('requires both canonical dinucleotides within the intron', () => {
    expect(scoreSegmentEmission('CCAACCCCAG',0,10,'Intron').isValid).toBe(false);
  });

  it('returns only complete coding genes, never an unfinished initial exon', () => {
    expect(runGhmmGeneFinder('AAAAATGGCCAAAGT').cdsSequence).toBe('');
  });

  it('carries a partial codon across a canonical intron', () => {
    const result = runGhmmGeneFinder('ATGG'+'GTCCCCAG'+'CCTAA');
    expect(result.cdsSequence).toBe('ATGGCCTAA');
    expect(result.proteinTranslation).toBe('MA');
    const intron = result.features.find(f=>f.type==='intron')!;
    expect(intron.sequence).toBe('GTCCCCAG');
    expect(intron.start).toBe(5);
    expect(intron.end).toBe(12);
  });

  it('rejects an internal stop assembled across the splice junction', () => {
    const result=runGhmmGeneFinder('ATGTA'+'GTCCCCAG'+'ATTTTAA');
    const rejected = result.candidates.find(c=>c.start===13 && c.end===20 && c.state==='Exon_Term' && c.pendingBefore==='TA');
    expect(rejected?.valid).toBe(false);
    expect(rejected?.reason).toMatch(/Premature/);
    // A shorter alternative ATG-TAG gene is legal; reject the invalid path,
    // not every other gene that this unconstrained sequence can also encode.
    expect(result.cdsSequence).not.toBe('ATGTAATTTTAA');
  });

  it('normalizes the declared bounded duration distribution', () => {
    const total=Array.from({length:36},(_,i)=>Math.exp(evaluateDurationScore('Exon_Init',i+1))).reduce((a,b)=>a+b,0);
    expect(total).toBeCloseTo(1,10);
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

  it('identifies a complete single-exon coding sequence', () => {
    const sglGene = 'ATGGCCAAAGCGTAA';
    const result = runGhmmGeneFinder(sglGene);

    expect(result.features.length).toBeGreaterThan(0);
    expect(result.proteinTranslation).toBe('MAKA');
  });

  it('keeps complete CDS invariants and a local score ledger', () => {
    for (const seq of ['ATGGGTCCCCAGCCTAA', 'ATGGCCAAAGCGTAA', 'AAAA', '', 'ATGTAG']) {
      const result=runGhmmGeneFinder(seq);
      expect(result.features.reduce((sum,f)=>sum+f.score,0)).toBeCloseTo(result.totalScore,10);
      if (!result.cdsSequence) continue;
      expect(result.cdsSequence.startsWith('ATG')).toBe(true);
      expect(result.cdsSequence.length%3).toBe(0);
      const codons=result.cdsSequence.match(/.{3}/g)!;
      expect(['TAA','TAG','TGA']).toContain(codons.at(-1));
      expect(codons.slice(0,-1).some(c=>['TAA','TAG','TGA'].includes(c))).toBe(false);
    }
  });
});
