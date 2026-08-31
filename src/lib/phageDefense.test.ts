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
  activateEmergencyAbility,
  updateDefenseGame,
  getDefaultWaypoints,
  VIRTUAL_WIDTH,
  VIRTUAL_HEIGHT,
  TOWER_DEFINITIONS,
  type ActiveTower,
  type ActivePhage,
} from './phageDefense';

describe('Phage Defense Logic Engine', () => {
  it('initializes with default clean state, 800x500 virtual waypoints, and 350 ATP', () => {
    const state = createInitialDefenseState(1200);
    expect(state.atp).toBe(350);
    expect(state.highScore).toBe(1200);
    expect(state.cellViability).toBe(100);
    expect(state.currentWave).toBe(0);
    expect(state.isWaveActive).toBe(false);
    expect(state.waypoints.length).toBeGreaterThan(4);
    expect(state.waypoints[0].x).toBe(0);
    expect(state.waypoints[state.waypoints.length - 1].x).toBe(400);
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
    it('validates tower placement distance from path waypoints and boundary', () => {
      const waypoints = getDefaultWaypoints();
      // On the path
      expect(canPlaceTower([], 0, 100, waypoints)).toBe(false);
      // Outside boundary
      expect(canPlaceTower([], 10, 10, waypoints)).toBe(false);
      // Valid cytoplasm space
      expect(canPlaceTower([], 200, 380, waypoints)).toBe(true);
    });

    it('places tower and deducts ATP successfully', () => {
      const state = createInitialDefenseState(0);
      const initialAtp = state.atp;
      const { state: next, success } = placeTower(state, 'restriction_enzyme', 200, 380);

      expect(success).toBe(true);
      expect(next.towers).toHaveLength(1);
      expect(next.atp).toBe(initialAtp - TOWER_DEFINITIONS.restriction_enzyme.cost);
    });

    it('upgrades tower level and stats', () => {
      let state = createInitialDefenseState(0);
      state.atp = 500;
      const { state: placedState } = placeTower(state, 'crispr_cas9', 200, 380);
      const towerId = placedState.towers[0].id;

      const { state: upgradedState, success } = upgradeTower(placedState, towerId);
      expect(success).toBe(true);
      expect(upgradedState.towers[0].level).toBe(2);
    });

    it('sells tower and returns 70% refund ATP', () => {
      let state = createInitialDefenseState(0);
      state.atp = 300;
      const { state: placedState } = placeTower(state, 'restriction_enzyme', 200, 380); // 100 ATP cost
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
          shieldHealth: 0,
          maxShieldHealth: 0,
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
          shieldHealth: 0,
          maxShieldHealth: 0,
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

  describe('Projectile Flight Physics & Real-Time Hit Damage (Bug Fix)', () => {
    it('persists in-flight projectiles across frame ticks until impact and deals damage', () => {
      let state = createInitialDefenseState(0);
      state.isWaveActive = true;

      // Deploy CRISPR-Cas9 at (200, 100)
      const { state: placedState } = placeTower(state, 'crispr_cas9', 200, 180);
      state = placedState;

      // Place a target phage at distance 80px (200, 100)
      const initialHealth = 150;
      const testPhage: ActivePhage = {
        id: 'test-phage-1',
        type: 't4_myoviridae',
        x: 200,
        y: 100,
        health: initialHealth,
        maxHealth: initialHealth,
        shieldHealth: 0,
        maxShieldHealth: 0,
        speed: 0,
        baseSpeed: 0,
        slowTimerSec: 0,
        waypointIndex: 0,
        progressRatio: 0.1,
        atpReward: 25,
        radius: 17,
        color: '#f43f5e',
      };
      state.phages = [testPhage];

      // Frame 1: Tower targets phage and fires a projectile
      const dt = 0.016; // ~60fps
      const step1 = updateDefenseGame(state, dt);
      expect(step1.state.projectiles.length).toBe(1);
      expect(step1.state.projectiles[0].targetPhageId).toBe('test-phage-1');
      const step1Y = step1.state.projectiles[0].y;

      // Frame 2: Projectile advances in flight towards target (NOT discarded!)
      const step2 = updateDefenseGame(step1.state, dt);
      expect(step2.state.projectiles.length).toBe(1);
      expect(step2.state.projectiles[0].y).toBeLessThan(step1Y);

      // Simulate enough frame ticks for projectile to reach target
      let simState = step2.state;
      let totalDt = 0;
      while (simState.projectiles.length > 0 && totalDt < 1.0) {
        const step = updateDefenseGame(simState, 0.05);
        simState = step.state;
        totalDt += 0.05;
      }

      // Projectile should have hit, dealt damage, and cleared out
      expect(simState.projectiles).toHaveLength(0);
      expect(simState.phages[0].health).toBeLessThan(initialHealth);
    });

    it('kills enemy phages and awards ATP & score when health reaches 0', () => {
      let state = createInitialDefenseState(0);
      state.atp = 100;
      state.score = 0;

      const weakPhage: ActivePhage = {
        id: 'weak-p1',
        type: 'lambda_phage',
        x: 100,
        y: 100,
        health: 5,
        maxHealth: 50,
        shieldHealth: 0,
        maxShieldHealth: 0,
        speed: 0,
        baseSpeed: 0,
        slowTimerSec: 0,
        waypointIndex: 0,
        progressRatio: 0.1,
        atpReward: 15,
        radius: 13,
        color: '#38bdf8',
      };
      state.phages = [weakPhage];

      // Existing projectile right on top of the weak phage
      state.projectiles = [
        {
          id: 'proj-1',
          sourceTowerId: 't1',
          targetPhageId: 'weak-p1',
          x: 100,
          y: 100,
          targetX: 100,
          targetY: 100,
          damage: 30,
          speed: 400,
          color: '#38bdf8',
        },
      ];

      const { state: next, defeatedPhages } = updateDefenseGame(state, 0.016);
      expect(defeatedPhages).toHaveLength(1);
      expect(next.phages).toHaveLength(0);
      expect(next.atp).toBe(100 + 15); // +15 ATP
      expect(next.score).toBe(150); // +150 score
    });
  });

  describe('Tactical Emergency Abilities', () => {
    it('executes Autophagy Purge to incinerate all basic phages on screen', () => {
      let state = createInitialDefenseState(0);
      state.atp = 200;
      state.phages = [
        {
          id: 'p1',
          type: 'lambda_phage',
          x: 100,
          y: 100,
          health: 50,
          maxHealth: 50,
          shieldHealth: 0,
          maxShieldHealth: 0,
          speed: 80,
          baseSpeed: 80,
          slowTimerSec: 0,
          waypointIndex: 0,
          progressRatio: 0,
          atpReward: 15,
          radius: 13,
          color: '#38bdf8',
        },
      ];

      const { state: next, success } = activateEmergencyAbility(state, 'autophagy');
      expect(success).toBe(true);
      expect(next.phages).toHaveLength(0);
      expect(next.atp).toBe(200 - 150 + 8); // cost 150, 50% reward of 15 (~8)
    });

    it('activates CRISPRi stasis to freeze phage movement and spawn queue', () => {
      let state = createInitialDefenseState(0);
      state.atp = 100;
      const { state: next, success } = activateEmergencyAbility(state, 'crispri');

      expect(success).toBe(true);
      expect(next.activeEmergencies.some((e) => e.type === 'crispri')).toBe(true);
    });

    it('activates Plasmid Overcharge for 2x tower fire rate', () => {
      let state = createInitialDefenseState(0);
      state.atp = 150;
      const { state: next, success } = activateEmergencyAbility(state, 'overcharge');

      expect(success).toBe(true);
      expect(next.activeEmergencies.some((e) => e.type === 'overcharge')).toBe(true);
    });
  });
});
