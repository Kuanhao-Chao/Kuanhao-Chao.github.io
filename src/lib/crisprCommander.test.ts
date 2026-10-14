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
    it('records schematic blunt versus staggered daughter ends without a universal nucleotide offset', () => {
      for (const [enzyme, style] of [['SpCas9', 'blunt'], ['AsCas12a', 'staggered']] as const) {
        const fragments = createDoubleStrandBreakFragments(spawnViralStrand(1, 1, enzyme, () => .5), 800, 600, () => .5);
        expect(fragments.map(fragment => [fragment.endStyle, fragment.side])).toEqual([[style, 'left'], [style, 'right']]);
      }
    });
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
    it('starts practice with Cas9 targets, then advances to the Cas12a round', () => {
      const state = createInitialState(0, true);
      expect(state.practiceRound).toBe(0);
      state.cleavedCount = 3;
      const next = updateGameState(state, 0).state;
      expect(next.practiceRound).toBe(1);
      expect(next.activeCas).toBe('AsCas12a');
    });
    it('spawns both enzyme targets in mixed play even without switching the enzyme', () => {
      const state = createInitialState();
      state.spawnTimerMs = 2100;
      const next = updateGameState(state, .016, [], 800, 600, () => .8).state;
      expect(next.strands[0].pamSequence).toBe('TTTC');
    });
    it('requires a new gesture to damage an armored strand again', () => {
      const state = createInitialState();
      const strand = spawnViralStrand(1, 1, 'SpCas9', () => .5);
      strand.x = .5;
      strand.y = .5;
      strand.health = strand.maxHealth = 3;
      state.strands = [strand];
      const swipe = { x1: 370, y1: 300, x2: 430, y2: 300, time: 1, gestureId: 7 };
      const first = updateGameState(state, 0, [swipe]);
      const held = updateGameState(first.state, 0, [swipe]);
      expect(held.state.strands[0].health).toBe(2);
      expect(updateGameState(held.state, 0, [{ ...swipe, gestureId: 8 }]).state.strands[0].health).toBe(1);
    });
    it('places the PAM outside the guide-matched protospacer in the correct orientation', () => {
      const cas9 = spawnViralStrand(1, 1, 'SpCas9', () => .5);
      const cas12 = spawnViralStrand(1, 1, 'AsCas12a', () => .5);
      expect(cas9.sequence).toBe(cas9.targetSequence + cas9.pamSequence);
      expect(cas12.sequence).toBe(cas12.pamSequence + cas12.targetSequence);
    });
    it('rejects an incompatible PAM without damage or reward', () => {
      const state = createInitialState();
      const strand = spawnViralStrand(1, 1, 'AsCas12a', () => .8);
      strand.x = .5;
      strand.y = .5;
      state.strands = [strand];
      const result = updateGameState(state, 0, [{ x1: 370, y1: 300, x2: 430, y2: 300, time: 1 }]);
      expect(result.state.strands[0]?.health).toBe(strand.health);
      expect(result.state.score).toBe(0);
      expect(result.cleavedStrands).toHaveLength(0);
    });
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
    it('target assist preserves DNA and PAM rather than globally editing cytosines', () => {
      const state = createInitialState(0);
      state.atp = 50;
      const strand = spawnViralStrand(1, 1, 'SpCas9', () => 0.5);
      strand.sequence = 'ACGT';
      state.strands = [strand];

      const next = activatePowerUp(state, 'base_editor');
      expect(next.atp).toBe(15); // cost 35
      expect(next.strands[0].sequence).toBe('ACGT');
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
