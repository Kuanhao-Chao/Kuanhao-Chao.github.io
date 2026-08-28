import { describe, it, expect } from 'vitest';
import {
  cleanDnaSequence,
  textToCodonSequence,
  translateCodon,
  computeRollingGcContent,
  scanMotifs,
  sequenceToNoteEvents,
  type MusicalScale
} from './sonicGenome';

describe('sonicGenome Core Engine', () => {
  describe('cleanDnaSequence', () => {
    it('strips FASTA headers, numbers, and whitespace', () => {
      const raw = '>chr1:100-200 sample\nATGC 123\n  gatc\r\n';
      expect(cleanDnaSequence(raw)).toBe('ATGCGATC');
    });

    it('converts RNA uracil (U) to thymine (T)', () => {
      expect(cleanDnaSequence('AUGCUA')).toBe('ATGCTA');
    });

    it('filters out non-nucleotide characters and handles IUPAC degeneracy', () => {
      expect(cleanDnaSequence('ATGC-NXYZ123!@#GCTA')).toBe('ATGCNGCTA');
    });

    it('returns empty string on empty or header-only input', () => {
      expect(cleanDnaSequence('>only_header\n')).toBe('');
      expect(cleanDnaSequence('')).toBe('');
    });
  });

  describe('textToCodonSequence', () => {
    it('translates English text to valid DNA codons', () => {
      const text = 'KHC';
      const seq = textToCodonSequence(text);
      expect(seq.length).toBe(text.length * 3);
      expect(/^[ACGT]+$/.test(seq)).toBe(true);
    });

    it('handles empty input gracefully', () => {
      expect(textToCodonSequence('')).toBe('');
    });
  });

  describe('translateCodon', () => {
    it('translates start and stop codons correctly', () => {
      expect(translateCodon('ATG')).toEqual({ aa: 'M', name: 'Methionine', polarity: 'hydrophobic' });
      expect(translateCodon('TAA')).toEqual({ aa: '*', name: 'Stop', polarity: 'stop' });
      expect(translateCodon('TAG')).toEqual({ aa: '*', name: 'Stop', polarity: 'stop' });
      expect(translateCodon('TGA')).toEqual({ aa: '*', name: 'Stop', polarity: 'stop' });
    });

    it('translates acidic and basic amino acids', () => {
      expect(translateCodon('GAT')).toEqual({ aa: 'D', name: 'Aspartate', polarity: 'acidic' });
      expect(translateCodon('AAA')).toEqual({ aa: 'K', name: 'Lysine', polarity: 'basic' });
      expect(translateCodon('CGT')).toEqual({ aa: 'R', name: 'Arginine', polarity: 'basic' });
    });
  });

  describe('computeRollingGcContent', () => {
    it('computes rolling GC ratio across window correctly', () => {
      const seq = 'GGGGAAAAGGGG';
      const gc = computeRollingGcContent(seq, 3);
      expect(gc.length).toBe(seq.length);
      // 'GGGG' has 100% GC
      expect(gc[0]).toBeCloseTo(1.0, 2);
      // 'AAAA' has 0% GC
      expect(gc[5]).toBeCloseTo(0.0, 2);
    });
  });

  describe('scanMotifs', () => {
    it('identifies TATA box motifs', () => {
      const seq = 'CCCCCTATAAAACCCCC';
      const motifs = scanMotifs(seq);
      const match = motifs.find((m) => m.type === 'TATA');
      expect(match).toBeDefined();
      expect(match?.start).toBe(5);
    });

    it('identifies E-box and Splice Donor motifs', () => {
      const seq = 'AAACACGTGAAAGGTAAGTTT';
      const motifs = scanMotifs(seq);
      expect(motifs.some((m) => m.type === 'EBOX')).toBe(true);
      expect(motifs.some((m) => m.type === 'SPLICE_DONOR')).toBe(true);
    });
  });

  describe('sequenceToNoteEvents', () => {
    it('generates harmonic note events across valid musical scales', () => {
      const seq = 'ATGC';
      const scales: MusicalScale[] = ['lydian', 'dorian', 'pentatonic', 'hirajoshi', 'aeolian', 'wholetone'];

      for (const scale of scales) {
        const events = sequenceToNoteEvents(seq, scale, 4);
        expect(events.length).toBe(4);
        expect(events[0].base).toBe('A');
        expect(events[0].frequency).toBeGreaterThan(50);
        expect(events[0].frequency).toBeLessThan(3000);
        expect(events[0].duration).toBeGreaterThan(0);
      }
    });

    it('annotates codon and amino acid every 3 bases', () => {
      const seq = 'ATGCCC';
      const events = sequenceToNoteEvents(seq, 'pentatonic', 4);
      expect(events[0].codon).toBe('ATG');
      expect(events[0].aminoAcid).toBe('M');
      expect(events[3].codon).toBe('CCC');
      expect(events[3].aminoAcid).toBe('P');
    });
  });
});
