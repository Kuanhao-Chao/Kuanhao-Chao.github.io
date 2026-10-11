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

  it('shows synthetic score loss at donor +1G without clinical claims', () => {
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

  it('handles the explicitly synthetic presets without errors', () => {
    for (const preset of ISM_PRESETS) {
      const res = computeIsm(preset.sequence, preset.type, preset.junctionCoord);
      expect(res.positions.length).toBe(preset.sequence.length);
      expect(res.primaryRefScore).toBeGreaterThan(0);
    }
  });

  it('rejects empty, malformed and insufficient-window inputs', () => {
    expect(()=>computeIsm('')).toThrow();
    expect(()=>computeIsm('CAG!GTAAGT','donor',3)).toThrow();
    expect(()=>computeIsm('CAGGTAAGT','donor',0)).toThrow();
  });

  it('defines importance as the mean absolute alternative delta, including gains', () => {
    const res=computeIsm('CAGATAAGT','donor',3);
    for (const pos of res.positions) {
      const expected=Object.values(pos.mutations).filter(m=>m.base!==pos.refBase).reduce((n,m)=>n+Math.abs(m.delta),0)/3;
      expect(pos.importance).toBeCloseTo(expected,12);
      for (const mutation of Object.values(pos.mutations)) expect(mutation.delta).toBeCloseTo(mutation.score-res.primaryRefScore,12);
    }
    expect(res.positions[3].mutations.G.delta).toBeGreaterThan(0);
  });
});
