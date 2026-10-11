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

  it('sums deletion paths and agrees with the backward beginning value', () => {
    const model = createPlan7ModelFromMSA(['ACG', 'ACG'], 'tiny', DNA_ALPHABET);
    for (const query of ['', 'AG', 'ACCG', 'ACG']) {
      const v = runViterbi(model, query);
      const fb = runForwardBackward(model, query);
      expect(fb.logLikelihood).toBeGreaterThanOrEqual(v.logScore - 1e-12);
      expect(fb.backwardM[0][0]).toBeCloseTo(fb.logLikelihood, 10);
    }
  });

  it('normalizes emitting-state occupancy for every query residue', () => {
    const model = createPlan7ModelFromMSA(['ACG', 'A-G'], 'tiny', DNA_ALPHABET);
    const fb = runForwardBackward(model, 'ACCG');
    for (let i = 1; i <= 4; i++) {
      const total = fb.posteriorM[i].reduce((a,b)=>a+b,0) + (fb as typeof fb & {posteriorI:number[][]}).posteriorI[i].reduce((a,b)=>a+b,0);
      expect(total).toBeCloseTo(1, 10);
    }
  });

  it('rejects ragged, invalid and all-gap MSAs', () => {
    expect(()=>createPlan7ModelFromMSA(['AC', 'A'], 'bad', DNA_ALPHABET)).toThrow();
    expect(()=>createPlan7ModelFromMSA(['A!'], 'bad', DNA_ALPHABET)).toThrow();
    expect(()=>createPlan7ModelFromMSA(['--'], 'bad', DNA_ALPHABET)).toThrow();
  });

  it('matches hand-enumerated one-column path probabilities including End', () => {
    const model = createPlan7ModelFromMSA(['A','A'], 'one', DNA_ALPHABET);
    // e_M(A)=2.1/2.4=.875; inserts emit A with probability .25.
    expect(Math.exp(runForwardBackward(model, '').logLikelihood)).toBeCloseTo(.07, 12);
    expect(Math.exp(runForwardBackward(model, 'A').logLikelihood)).toBeCloseTo(.85*.875*.92, 12);
    const mThenI=.85*.875*.08*.25*.6;
    const iThenM=.08*.25*.6*.875*.92;
    expect(Math.exp(runForwardBackward(model, 'AA').logLikelihood)).toBeCloseTo(mThenI+iThenM, 12);
    expect(Math.exp(runViterbi(model, 'AA').logScore)).toBeCloseTo(Math.max(mThenI,iThenM), 12);
  });

  it('keeps zero transition probabilities impossible', () => {
    const model = createPlan7ModelFromMSA(['A'], 'one', DNA_ALPHABET);
    model.transitions.MM[0]=0; model.transitions.MD[0]=.92;
    expect(runForwardBackward(model,'A').logLikelihood).toBe(-Infinity);
    expect(runViterbi(model,'A').viterbiPath).toEqual([]);
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
