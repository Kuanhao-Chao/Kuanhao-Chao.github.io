import { describe, it, expect } from 'vitest';
import {
  createPlan7ModelFromMSA,
  runViterbi,
  runForwardBackward,
  logSumExp,
  logSumExpArray,
  DNA_ALPHABET,
  PROTEIN_ALPHABET,
} from './phmm';

describe('Profile Hidden Markov Models (pHMMs)', () => {
  it('computes logSumExp accurately without underflow', () => {
    const val = logSumExp(-1000, -1000);
    expect(val).toBeCloseTo(-1000 + Math.log(2), 4);

    const arrVal = logSumExpArray([-1000, -1000, -1000]);
    expect(arrVal).toBeCloseTo(-1000 + Math.log(3), 4);
  });

  it('builds Plan 7 model from DNA Multiple Sequence Alignment', () => {
    const msa = [
      'TATAAA',
      'TATAAG',
      'TATATA',
      'TATAAA',
    ];
    const model = createPlan7ModelFromMSA(msa, 'TATA_Box', DNA_ALPHABET);

    expect(model.K).toBe(6);
    expect(model.matchEmissions[1]['T']).toBeGreaterThan(0.7);
    expect(model.matchEmissions[2]['A']).toBeGreaterThan(0.7);
  });

  it('executes Viterbi optimal path alignment', () => {
    const msa = [
      'TATAAA',
      'TATAAG',
      'TATATA',
      'TATAAA',
    ];
    const model = createPlan7ModelFromMSA(msa, 'TATA_Box', DNA_ALPHABET);
    const result = runViterbi(model, 'TATAAA');

    expect(result.logScore).toBeGreaterThan(-100);
    expect(result.viterbiPath.length).toBe(6);
    expect(result.viterbiPath.every((step) => step.stateType === 'M')).toBe(true);
  });

  it('computes Forward-Backward posterior probabilities in [0, 1]', () => {
    const msa = [
      'CAKCGKTFS',
      'CPKCGKSFS',
      'CAECGKSFS',
      'CPRCGKTFA',
    ];
    const model = createPlan7ModelFromMSA(msa, 'Zinc_Finger', PROTEIN_ALPHABET);
    const fb = runForwardBackward(model, 'CAKCGKTFS');

    expect(fb.logLikelihood).toBeGreaterThan(-200);
    expect(fb.posteriorM.length).toBe(10); // N+1

    for (let i = 1; i <= 9; i++) {
      for (let k = 1; k <= model.K; k++) {
        expect(fb.posteriorM[i][k]).toBeGreaterThanOrEqual(0);
        expect(fb.posteriorM[i][k]).toBeLessThanOrEqual(1.0001);
      }
    }
  });
});
