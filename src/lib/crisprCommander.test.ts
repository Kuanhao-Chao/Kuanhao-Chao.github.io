import { describe, expect, it } from 'vitest';
import {
  createInitialState,
  matchPam,
  PAM_RULES,
  pointToSegmentDistance,
  checkSliceCleave,
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
    expect(state.atp).toBe(50);
    expect(state.level).toBe(1);
    expect(state.isGameOver).toBe(false);
  });

  describe('matchPam', () => {
    it('matches SpCas9 NGG PAM motifs correctly', () => {
      const cas9 = PAM_RULES.cas9_sp;
      expect(matchPam('AGG', cas9)).toBe(true);
      expect(matchPam('TGG', cas9)).toBe(true);
      expect(matchPam('CGG', cas9)).toBe(true);
      expect(matchPam('GGG', cas9)).toBe(true);
      expect(matchPam('AGA', cas9)).toBe(false);
      expect(matchPam('TG', cas9)).toBe(false);
    });

    it('matches AsCas12a TTTV PAM motifs correctly', () => {
      const cas12 = PAM_RULES.cas12a;
      expect(matchPam('TTTA', cas12)).toBe(true);
      expect(matchPam('TTTC', cas12)).toBe(true);
      expect(matchPam('TTTG', cas12)).toBe(true);
      expect(matchPam('TTTT', cas12)).toBe(false); // V is A, C, or G (not T)
    });
  });

  describe('pointToSegmentDistance & checkSliceCleave', () => {
    it('computes exact distance to line segment', () => {
      // Point (0, 5), segment from (-5, 0) to (5, 0) -> closest is (0, 0), dist = 5
      expect(pointToSegmentDistance(0, 5, -5, 0, 5, 0)).toBeCloseTo(5);
      // Point (10, 5), segment from (-5, 0) to (5, 0) -> closest endpoint is (5, 0), dist = hypot(5, 5)
      expect(pointToSegmentDistance(10, 5, -5, 0, 5, 0)).toBeCloseTo(Math.hypot(5, 5));
    });

    it('detects slicing intersection across strand radius', () => {
      const strand = spawnViralStrand(1, 1, () => 0.5);
      strand.x = 0.5;
      strand.y = 0.5;
      strand.radius = 30;

      // Slice through center (400, 300)
      const hitSlice = { x1: 350, y1: 300, x2: 450, y2: 300, time: 100 };
      expect(checkSliceCleave(strand, hitSlice, 800, 600)).toBe(true);

      // Slice far away
      const missSlice = { x1: 100, y1: 100, x2: 200, y2: 100, time: 100 };
      expect(checkSliceCleave(strand, missSlice, 800, 600)).toBe(false);
    });
  });

  describe('updateGameState', () => {
    it('cleaves strand, accumulates combo multiplier and ATP', () => {
      const state = createInitialState(0);
      const strand = spawnViralStrand(1, 1, () => 0.5);
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
      expect(next.strands).toHaveLength(0);
    });

    it('triggers breach damage when strand reaches bottom border', () => {
      const state = createInitialState(0);
      const strand = spawnViralStrand(1, 1, () => 0.5);
      strand.x = 0.5;
      strand.y = 0.96; // at bottom
      state.strands = [strand];

      const { state: next, breaches } = updateGameState(state, 0.016, [], 800, 600);
      expect(breaches).toHaveLength(1);
      expect(next.cellIntegrity).toBe(90); // took 10 damage
      expect(next.combo).toBe(0);
    });

    it('ends game when cell integrity drops to zero', () => {
      const state = createInitialState(0);
      state.cellIntegrity = 5;
      const strand = spawnViralStrand(1, 1, () => 0.5);
      strand.x = 0.5;
      strand.y = 0.96;
      state.strands = [strand];

      const { state: next } = updateGameState(state, 0.016, [], 800, 600);
      expect(next.cellIntegrity).toBe(0);
      expect(next.isGameOver).toBe(true);
    });
  });

  describe('activatePowerUp', () => {
    it('activates dCas9 shield when enough ATP is available', () => {
      const state = createInitialState(0);
      state.atp = 50;
      const next = activatePowerUp(state, 'dcas9_shield');
      expect(next.atp).toBe(10); // cost 40
      expect(next.powerUps).toHaveLength(1);
      expect(next.powerUps[0].type).toBe('dcas9_shield');
    });

    it('repairs cell integrity with prime editor', () => {
      const state = createInitialState(0);
      state.cellIntegrity = 50;
      state.atp = 60;
      const next = activatePowerUp(state, 'prime_editor');
      expect(next.cellIntegrity).toBe(90); // +40
      expect(next.atp).toBe(10); // cost 50
    });

    it('rejects power-up if ATP is insufficient', () => {
      const state = createInitialState(0);
      state.atp = 10;
      const next = activatePowerUp(state, 'dcas9_shield');
      expect(next.atp).toBe(10);
      expect(next.powerUps).toHaveLength(0);
    });
  });
});
