import { describe, it, expect } from 'vitest';
import { computeIsm, predictSpliceScores, ISM_PRESETS } from './ism';

describe('In Silico Mutagenesis (ISM) & Splice Site Engine', () => {
  it('correctly scores canonical donor splice junctions', () => {
    const scores = predictSpliceScores('CAGGTAAGTAAGT', 3, 'donor');
    expect(scores.donorScore).toBeGreaterThan(0.7);
  });

  it('correctly scores canonical acceptor splice junctions with polypyrimidine tract', () => {
    const scores = predictSpliceScores('TTTTTTTTCTTTCAGGTGAAG', 15, 'acceptor');
    expect(scores.acceptorScore).toBeGreaterThan(0.7);
  });

  it('computes full 4xL ISM mutation matrix with delta scores', () => {
    const res = computeIsm('CAGGTAAGTAAGT', 'donor', 3);
    expect(res.positions.length).toBe(13);
    for (const pos of res.positions) {
      expect(pos.mutations.A).toBeDefined();
      expect(pos.mutations.C).toBeDefined();
      expect(pos.mutations.G).toBeDefined();
      expect(pos.mutations.T).toBeDefined();
      expect(pos.mutations[pos.refBase].delta).toBe(0);
    }
    expect(res.maxImportance).toBeGreaterThan(0);
    expect(res.mostDisruptiveMutation.delta).toBeLessThan(0);
  });

  it('confirms severe disruption at invariant +1G donor position (BRCA1 knockout)', () => {
    const res = computeIsm('CAGGTAAGTAAGT', 'donor', 3);
    const donorPlus1 = res.positions.find((p) => p.positionLabel === '+1');
    expect(donorPlus1).toBeDefined();
    if (donorPlus1) {
      expect(donorPlus1.refBase).toBe('G');
      const mutA = donorPlus1.mutations.A;
      expect(mutA.delta).toBeLessThan(-0.5);
      expect(mutA.effectClass).toBe('disruption');
    }
  });

  it('handles all built-in clinical presets without errors', () => {
    for (const preset of ISM_PRESETS) {
      const res = computeIsm(preset.sequence, preset.type, preset.junctionCoord);
      expect(res.positions.length).toBe(preset.sequence.length);
      expect(res.primaryRefScore).toBeGreaterThan(0);
    }
  });

  it('handles degenerate / empty input with fallback defaults', () => {
    const res = computeIsm('');
    expect(res.sequence.length).toBeGreaterThan(0);
    expect(res.positions.length).toBeGreaterThan(0);
  });
});
