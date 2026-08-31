import { describe, expect, it } from 'vitest';
import {
  createInitialDefenseState,
  generateWaveQueue,
  startNextWave,
  canPlaceTower,
  placeTower,
  upgradeTower,
  sellTower,
  setTowerPriority,
  selectPhageTarget,
  updateDefenseGame,
  getDefaultWaypoints,
  TOWER_DEFINITIONS,
  type ActiveTower,
  type ActivePhage,
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

  describe('Tower Placement, Upgrades, Priority & Sell', () => {
    it('validates tower placement distance from path waypoints', () => {
      const waypoints = getDefaultWaypoints(800, 550);
      expect(canPlaceTower([], 0, 110, waypoints)).toBe(false);
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

    it('sells tower and returns 70% refund ATP', () => {
      let state = createInitialDefenseState(0);
      state.atp = 300;
      const { state: placedState } = placeTower(state, 'restriction_enzyme', 200, 400); // 100 ATP cost
      expect(placedState.atp).toBe(200);

      const { state: soldState, refundAtp } = sellTower(placedState, placedState.towers[0].id);
      expect(soldState.towers).toHaveLength(0);
      expect(refundAtp).toBe(70); // 70% of 100
      expect(soldState.atp).toBe(270);
    });

    it('selects targets based on target priority', () => {
      const tower: ActiveTower = {
        id: 'tower-1',
        type: 'crispr_cas9',
        x: 100,
        y: 100,
        level: 1,
        cooldownSec: 0,
        targetId: null,
        targetPriority: 'strongest',
        kills: 0,
        totalDamage: 0,
      };

      const phages: ActivePhage[] = [
        {
          id: 'p1',
          type: 'lambda_phage',
          x: 120,
          y: 100,
          health: 50,
          maxHealth: 50,
          speed: 80,
          baseSpeed: 80,
          slowTimerSec: 0,
          waypointIndex: 2,
          progressRatio: 0.5,
          atpReward: 15,
          radius: 13,
          color: '#38bdf8',
        },
        {
          id: 'p2',
          type: 't4_myoviridae',
          x: 130,
          y: 100,
          health: 140,
          maxHealth: 140,
          speed: 55,
          baseSpeed: 55,
          slowTimerSec: 0,
          waypointIndex: 1,
          progressRatio: 0.2,
          atpReward: 25,
          radius: 17,
          color: '#f43f5e',
        },
      ];

      // Strongest target should be p2 (140 HP vs 50 HP)
      const target = selectPhageTarget(tower, phages, 200);
      expect(target?.id).toBe('p2');

      // Set to first progress -> should select p1 (progress 0.5 vs 0.2)
      tower.targetPriority = 'first';
      const targetFirst = selectPhageTarget(tower, phages, 200);
      expect(targetFirst?.id).toBe('p1');
    });
  });
});
