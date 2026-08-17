import { describe, it, expect } from 'vitest';
import { runAlgorithmDuel, DUEL_PRESETS } from './algorithmDuel';

describe('Algorithm Duel & Benchmark Engine', () => {
  it('runs identical sequence duel where WFA achieves dramatic speedup', () => {
    const res = runAlgorithmDuel('ACGTAGCTAGTCGATCGAT', 'ACGTAGCTAGTCGATCGAT');
    expect(res.winner).toBe('wfa');
    expect(res.speedupRatio).toBeGreaterThan(10);
    expect(res.divergenceDistance).toBe(0);
    expect(res.steps.length).toBeGreaterThan(0);
    expect(res.winnerExplanation).toContain('Wavefront Alignment');
  });

  it('runs single SNP duel correctly', () => {
    const res = runAlgorithmDuel('ACGTAGCTA', 'ACGTCGCTA');
    expect(res.winner).toBe('wfa');
    expect(res.divergenceDistance).toBe(1);
    expect(res.totalNwCells).toBe(100);
    expect(res.totalWfaCells).toBeLessThan(res.totalNwCells);
  });

  it('runs insertion gap duel with diagonal shift', () => {
    const res = runAlgorithmDuel('ACGTAGCTA', 'ACGTAGCCCCCTA');
    expect(res.winner).toBe('wfa');
    expect(res.totalNwCells).toBe(140);
  });

  it('handles all built-in presets without crashing', () => {
    for (const preset of DUEL_PRESETS) {
      const res = runAlgorithmDuel(preset.seq1, preset.seq2);
      expect(res.steps.length).toBeGreaterThan(0);
      expect(res.speedupRatio).toBeGreaterThan(0);
    }
  });

  it('handles empty or degenerate sequences gracefully with sensible defaults', () => {
    const res = runAlgorithmDuel('', '');
    expect(res.seq1).toBe('ACGTAGCTA');
    expect(res.seq2).toBe('ACGTCGCTA');
    expect(res.steps.length).toBeGreaterThan(0);
  });
});
