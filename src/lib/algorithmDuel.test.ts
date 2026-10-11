import { describe, it, expect } from 'vitest';
import { runAlgorithmDuel, DUEL_PRESETS } from './algorithmDuel';

describe('Affine DP and WFA recorded work comparison', () => {
  it('compares the same affine objective rather than different scoring schemes', () => {
    const result = runAlgorithmDuel('ACGT', 'ACGGT');
    expect(-result.nwResult.score).toBe(4);
    expect(result.wfaResult.finalScore).toBe(4);
  });
  it('records fewer visited WFA coordinates without claiming measured speedup', () => {
    const res = runAlgorithmDuel('ACGTAGCTAGTCGATCGAT', 'ACGTAGCTAGTCGATCGAT');
    expect(res.fewerVisitedCoordinates).toBe('wfa');
    expect(res.dpToWfaCoordinateRatio).toBeGreaterThan(10);
    expect(res.divergenceDistance).toBe(0);
    expect(res.steps.length).toBeGreaterThan(0);
    expect(res.coordinateCountExplanation).toContain('not a wall-clock speedup');
  });

  it('runs single SNP duel correctly', () => {
    const res = runAlgorithmDuel('ACGTAGCTA', 'ACGTCGCTA');
    expect(res.fewerVisitedCoordinates).toBe('wfa');
    expect(res.divergenceDistance).toBe(1);
    expect(res.totalNwCells).toBe(100);
    expect(res.totalWfaCells).toBeLessThan(res.totalNwCells);
  });

  it('runs insertion gap duel with diagonal shift', () => {
    const res = runAlgorithmDuel('ACGTAGCTA', 'ACGTAGCCCCCTA');
    expect(res.fewerVisitedCoordinates).toBe('wfa');
    expect(res.totalNwCells).toBe(140);
  });

  it('handles all built-in presets without crashing', () => {
    for (const preset of DUEL_PRESETS) {
      const res = runAlgorithmDuel(preset.seq1, preset.seq2);
      expect(res.steps.length).toBeGreaterThan(0);
      expect(res.dpToWfaCoordinateRatio).toBeGreaterThan(0);
    }
  });

  it('does not silently replace genuine empty sequences with examples', () => {
    const res = runAlgorithmDuel('', '');
    expect(res.seq1).toBe('');
    expect(res.seq2).toBe('');
    expect(res.steps.length).toBeGreaterThan(0);
  });
  it('derives synchronized counters from the actual recorded computations', () => {
    const res = runAlgorithmDuel('ACGT', 'ACGGT');
    expect(res.steps[0].nw).toMatchObject({ i: 0, j: 0, cellsEvaluated: 1 });
    expect(res.steps.at(-1)?.wfa.cellsEvaluated).toBe(res.wfaResult.stateUpdates);
  });
});
