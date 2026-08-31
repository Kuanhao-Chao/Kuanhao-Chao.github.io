import { describe, expect, it } from 'vitest';
import {
  createInitialState,
  matchPam,
  PAM_RULES,
  pointToSegmentDistance,
  checkSliceCleave,
  createDoubleStrandBreakFragments,
  switchCasEnzyme,
  updateGameState,
  activatePowerUp,
  spawnViralStrand,
} from './crisprCommander';

describe('CRISPR Commander Logic Engine', () => {
  it('initializes with default clean state', () => {
    const state = createInitialState(500);
    expect(state.score).toBe(0);
    expect(state.highScore).toBe(500);
    expect(state.cellIntegrity).toBe(100);
    expect(state.atp).toBe(60);
    expect(state.level).toBe(1);
    expect(state.activeCas).toBe('SpCas9');
    expect(state.isGameOver).toBe(false);
  });

  describe('matchPam', () => {
    it('matches SpCas9 NGG PAM motifs correctly', () => {
      const cas9 = PAM_RULES.SpCas9;
      expect(matchPam('AGG', cas9)).toBe(true);
      expect(matchPam('TGG', cas9)).toBe(true);
      expect(matchPam('CGG', cas9)).toBe(true);
      expect(matchPam('GGG', cas9)).toBe(true);
      expect(matchPam('AGA', cas9)).toBe(false);
      expect(matchPam('TG', cas9)).toBe(false);
    });

    it('matches AsCas12a TTTV PAM motifs correctly', () => {
      const cas12 = PAM_RULES.AsCas12a;
      expect(matchPam('TTTA', cas12)).toBe(true);
      expect(matchPam('TTTC', cas12)).toBe(true);
      expect(matchPam('TTTG', cas12)).toBe(true);
      expect(matchPam('TTTT', cas12)).toBe(false);
    });
  });

  describe('switchCasEnzyme', () => {
    it('toggles enzyme system smoothly', () => {
      let state = createInitialState(0);
      expect(state.activeCas).toBe('SpCas9');
      state = switchCasEnzyme(state, 'AsCas12a');
      expect(state.activeCas).toBe('AsCas12a');
    });
  });

  describe('createDoubleStrandBreakFragments', () => {
    it('splits a cleaved strand into two complementary physics fragments', () => {
      const strand = spawnViralStrand(1, 1, 'SpCas9', () => 0.5);
      strand.x = 0.5;
      strand.y = 0.5;
      const [f1, f2] = createDoubleStrandBreakFragments(strand, 800, 600, () => 0.5);

      expect(f1.sequence.length + f2.sequence.length).toBe(strand.sequence.length);
      expect(f1.vx).not.toBe(0);
      expect(f2.vx).not.toBe(0);
      expect(f1.color).toBe(strand.color);
    });
  });

  describe('updateGameState', () => {
    it('cleaves strand, creates fragments, and accumulates combo multiplier', () => {
      const state = createInitialState(0);
      const strand = spawnViralStrand(1, 1, 'SpCas9', () => 0.5);
      strand.x = 0.5;
      strand.y = 0.5;
      strand.health = 1;
      state.strands = [strand];

      const slice = { x1: 380, y1: 300, x2: 420, y2: 300, time: 100 };
      const { state: next, cleavedStrands } = updateGameState(state, 0.016, [slice], 800, 600);

      expect(cleavedStrands).toHaveLength(1);
      expect(next.score).toBeGreaterThan(0);
      expect(next.combo).toBe(1);
      expect(next.atp).toBeGreaterThan(state.atp);
      expect(next.fragments).toHaveLength(2);
      expect(next.strands).toHaveLength(0);
    });

    it('triggers breach damage when strand reaches bottom border', () => {
      const state = createInitialState(0);
      const strand = spawnViralStrand(1, 1, 'SpCas9', () => 0.5);
      strand.x = 0.5;
      strand.y = 0.96;
      state.strands = [strand];

      const { state: next, breaches } = updateGameState(state, 0.016, [], 800, 600);
      expect(breaches).toHaveLength(1);
      expect(next.cellIntegrity).toBe(90);
      expect(next.combo).toBe(0);
    });

    it('ends game when cell integrity drops to zero', () => {
      const state = createInitialState(0);
      state.cellIntegrity = 5;
      const strand = spawnViralStrand(1, 1, 'SpCas9', () => 0.5);
      strand.x = 0.5;
      strand.y = 0.96;
      state.strands = [strand];

      const { state: next } = updateGameState(state, 0.016, [], 800, 600);
      expect(next.cellIntegrity).toBe(0);
      expect(next.isGameOver).toBe(true);
    });
  });

  describe('activatePowerUp', () => {
    it('activates Cytosine Base Editor (CBE) and deaminates C to T', () => {
      const state = createInitialState(0);
      state.atp = 50;
      const strand = spawnViralStrand(1, 1, 'SpCas9', () => 0.5);
      strand.sequence = 'ACGT';
      state.strands = [strand];

      const next = activatePowerUp(state, 'base_editor');
      expect(next.atp).toBe(15); // cost 35
      expect(next.strands[0].sequence).toBe('ATGT');
    });

    it('activates Hyper-Drive Overdrive', () => {
      const state = createInitialState(0);
      state.atp = 100;
      const next = activatePowerUp(state, 'hyper_drive');
      expect(next.atp).toBe(25); // cost 75
      expect(next.powerUps.some((p) => p.type === 'hyper_drive')).toBe(true);
    });
  });
});
