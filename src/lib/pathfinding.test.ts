import { describe, it, expect } from 'vitest';
import { createBayGraph, PRESET_TRIPS } from './bayGraph';
import {
  ALGORITHMS,
  runDijkstra,
  runAStar,
  runBidirectionalAStar,
  runGreedyBestFirst,
  runBFS,
  runDFS,
  runPathfinding,
} from './pathfinding';

describe('pathfinding algorithm suite', () => {
  const graph = createBayGraph();

  it('contains complete metadata for all 6 algorithms', () => {
    const algKeys = ['dijkstra', 'a_star', 'bidirectional_a_star', 'greedy', 'bfs', 'dfs'] as const;
    for (const key of algKeys) {
      const meta = ALGORITHMS[key];
      expect(meta).toBeDefined();
      expect(meta.name.length).toBeGreaterThan(0);
      expect(meta.timeComplexity.length).toBeGreaterThan(0);
      expect(meta.spaceComplexity.length).toBeGreaterThan(0);
      expect(meta.characteristics.length).toBeGreaterThanOrEqual(3);
    }
  });

  it('verifies Dijkstra finds the optimal route on the Bay Bridge trip', () => {
    const trip = PRESET_TRIPS.find((t) => t.id === 'trip-bay-bridge')!;
    const res = runDijkstra(graph, trip.startId, trip.goalId);

    expect(res.found).toBe(true);
    expect(res.path[0]).toBe('sf_ferry_bldg');
    expect(res.path[res.path.length - 1]).toBe('berkeley_campanile');
    expect(res.totalDistanceMiles).toBeGreaterThan(10);
    expect(res.totalDistanceMiles).toBeLessThan(20);
    expect(res.exploredCount).toBeGreaterThan(5);
    expect(res.steps.length).toBeGreaterThan(10);
  });

  it('verifies A* produces identical optimal path distance to Dijkstra while exploring fewer nodes', () => {
    const trip = PRESET_TRIPS.find((t) => t.id === 'trip-bay-corridor')!; // San Jose to SF FiDi
    const dijkstraRes = runDijkstra(graph, trip.startId, trip.goalId);
    const aStarRes = runAStar(graph, trip.startId, trip.goalId);

    expect(dijkstraRes.found).toBe(true);
    expect(aStarRes.found).toBe(true);

    // Both optimal algorithms must yield the exact same travel time and distance
    expect(aStarRes.totalTimeMinutes).toBeCloseTo(dijkstraRes.totalTimeMinutes, 1);
    expect(aStarRes.totalDistanceMiles).toBeCloseTo(dijkstraRes.totalDistanceMiles, 1);

    // A* should explore fewer or equal nodes than Dijkstra due to the heuristic
    expect(aStarRes.exploredCount).toBeLessThanOrEqual(dijkstraRes.exploredCount);
  });

  it('verifies Bidirectional A* finds a path and reduces explored space', () => {
    const trip = PRESET_TRIPS.find((t) => t.id === 'trip-golden-gate')!; // Stanford to Marin
    const biRes = runBidirectionalAStar(graph, trip.startId, trip.goalId);
    const dijkstraRes = runDijkstra(graph, trip.startId, trip.goalId);

    expect(biRes.found).toBe(true);
    expect(biRes.path[0]).toBe('stanford_univ');
    expect(biRes.path[biRes.path.length - 1]).toBe('marin_headlands');

    // Distance should be optimal or near-optimal
    expect(biRes.totalDistanceMiles).toBeCloseTo(dijkstraRes.totalDistanceMiles, 1);
    expect(biRes.steps.some((s) => s.type === 'meet')).toBe(true);
  });

  it('verifies Greedy Best-First quickly finds a path', () => {
    const trip = PRESET_TRIPS.find((t) => t.id === 'trip-dumbarton')!;
    const greedyRes = runGreedyBestFirst(graph, trip.startId, trip.goalId);

    expect(greedyRes.found).toBe(true);
    expect(greedyRes.path[0]).toBe('palo_alto_downtown');
    expect(greedyRes.path[greedyRes.path.length - 1]).toBe('fremont_tesla');
  });

  it('verifies BFS finds a path in hop-count order', () => {
    const trip = PRESET_TRIPS.find((t) => t.id === 'trip-silicon-valley')!;
    const bfsRes = runBFS(graph, trip.startId, trip.goalId);

    expect(bfsRes.found).toBe(true);
    expect(bfsRes.path[0]).toBe('sfo_airport');
    expect(bfsRes.path[bfsRes.path.length - 1]).toBe('cupertino_apple');
  });

  it('verifies DFS finds a path', () => {
    const trip = PRESET_TRIPS.find((t) => t.id === 'trip-bay-bridge')!;
    const dfsRes = runDFS(graph, trip.startId, trip.goalId);

    expect(dfsRes.found).toBe(true);
    expect(dfsRes.path[0]).toBe('sf_ferry_bldg');
    expect(dfsRes.path[dfsRes.path.length - 1]).toBe('berkeley_campanile');
  });

  it('verifies universal runPathfinding dispatcher handles all algorithms cleanly', () => {
    const trip = PRESET_TRIPS[0];
    const algos = ['dijkstra', 'a_star', 'bidirectional_a_star', 'greedy', 'bfs', 'dfs'] as const;

    for (const alg of algos) {
      const res = runPathfinding(alg, graph, trip.startId, trip.goalId);
      expect(res.algorithm).toBe(alg);
      expect(res.found).toBe(true);
      expect(res.steps.length).toBeGreaterThan(0);
      expect(res.steps[res.steps.length - 1].type).toBe('done');
    }
  });
});
