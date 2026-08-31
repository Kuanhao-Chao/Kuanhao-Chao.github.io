import { describe, expect, it } from 'vitest';
import {
  createInitialDefenseState,
  generateWaveQueue,
  startNextWave,
  canPlaceTower,
  placeTower,
  upgradeTower,
  updateDefenseGame,
  getDefaultWaypoints,
  TOWER_DEFINITIONS,
} from './phageDefense';

describe('Phage Defense Logic Engine', () => {
  it('initializes with default clean state and waypoints', () => {
    const state = createInitialDefenseState(1000);
    expect(state.atp).toBe(350);
    expect(state.highScore).toBe(1000);
    expect(state.cellViability).toBe(100);
    expect(state.currentWave).toBe(0);
    expect(state.isWaveActive).toBe(false);
    expect(state.waypoints.length).toBeGreaterThan(4);
  });

  describe('generateWaveQueue & startNextWave', () => {
    it('generates appropriate phage types for early and late waves', () => {
      const w1 = generateWaveQueue(1);
      expect(w1.length).toBeGreaterThan(5);
      expect(w1.every((t) => t === 'lambda_phage')).toBe(true);

      const w12 = generateWaveQueue(12);
      expect(w12.some((t) => t === 'giant_megaphage')).toBe(true);
    });

    it('transitions state to active wave on startNextWave', () => {
      const state = createInitialDefenseState(0);
      const next = startNextWave(state);
      expect(next.currentWave).toBe(1);
      expect(next.isWaveActive).toBe(true);
      expect(next.waveSpawnQueue.length).toBeGreaterThan(0);
    });
  });

  describe('Tower Placement & Upgrades', () => {
    it('validates tower placement distance from path waypoints', () => {
      const waypoints = getDefaultWaypoints(800, 550);
      // Place right on top of waypoint 0 (0, 110)
      expect(canPlaceTower([], 0, 110, waypoints)).toBe(false);
      // Place in safe open cytoplasm (200, 400)
      expect(canPlaceTower([], 200, 400, waypoints)).toBe(true);
    });

    it('places tower and deducts ATP successfully', () => {
      const state = createInitialDefenseState(0);
      const initialAtp = state.atp;
      const { state: next, success } = placeTower(state, 'restriction_enzyme', 200, 400);

      expect(success).toBe(true);
      expect(next.towers).toHaveLength(1);
      expect(next.atp).toBe(initialAtp - TOWER_DEFINITIONS.restriction_enzyme.cost);
    });

    it('upgrades tower level and stats', () => {
      let state = createInitialDefenseState(0);
      state.atp = 500;
      const { state: placedState } = placeTower(state, 'crispr_cas9', 200, 400);
      const towerId = placedState.towers[0].id;

      const { state: upgradedState, success } = upgradeTower(placedState, towerId);
      expect(success).toBe(true);
      expect(upgradedState.towers[0].level).toBe(2);
    });
  });

  describe('updateDefenseGame Combat & Breaches', () => {
    it('spawns and advances phages along waypoints', () => {
      let state = createInitialDefenseState(0);
      state = startNextWave(state);
      state.spawnTimerSec = 2.0; // trigger spawn immediately

      const { state: next } = updateDefenseGame(state, 0.1);
      expect(next.phages.length).toBeGreaterThan(0);
      expect(next.phages[0].x).toBeGreaterThanOrEqual(0);
    });

    it('inflicts damage and awards ATP when tower attacks phage', () => {
      let state = createInitialDefenseState(0);
      const { state: withTower } = placeTower(state, 'crispr_cas9', 100, 200);
      state = withTower;
      state.phages = [
        {
          id: 'test-phage-1',
          type: 'lambda_phage',
          x: 100,
          y: 200,
          health: 10,
          maxHealth: 50,
          speed: 80,
          baseSpeed: 80,
          slowTimerSec: 0,
          waypointIndex: 0,
          progressRatio: 0.1,
          atpReward: 15,
          radius: 12,
          color: '#38bdf8',
        },
      ];

      const initialAtp = state.atp;
      const { state: next, defeatedPhages } = updateDefenseGame(state, 0.1);

      expect(defeatedPhages).toHaveLength(1);
      expect(next.atp).toBe(initialAtp + 15);
      expect(next.score).toBe(150);
    });
  });
});
