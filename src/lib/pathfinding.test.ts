import { describe, it, expect } from 'vitest';
import { createBayGraph, PRESET_TRIPS, type BayGraph, type BayEdge } from './bayGraph';
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
import { mulberry32 } from './dino';

function weightedExample(links: Array<[string, string, number]>, directed = false): BayGraph {
  const graph: BayGraph = { nodes: new Map(), adjacency: new Map(), edges: [] };
  for (const [u, v, weight] of links) {
    for (const id of [u, v]) if (!graph.nodes.has(id)) {
      graph.nodes.set(id, { id, name: id, city: 'Example', region: 'global', type: 'junction', x: 0, y: 0, lat: 0, lng: 0 }); graph.adjacency.set(id, []);
    }
    const edge: BayEdge = { u, v, distance: weight, speedLimit: 60, roadType: 'arterial', name: `${u}→${v}` };
    graph.edges.push(edge); graph.adjacency.get(u)!.push({ target: v, weight, edge });
    if (!directed) graph.adjacency.get(v)!.push({ target: u, weight, edge });
  }
  return graph;
}

describe('weighted shortest-path regressions', () => {
  it('matches Dijkstra across seeded directed weighted graphs with a validated heuristic', () => {
    const random = mulberry32(913);
    for (let example = 0; example < 100; example++) {
      const links: Array<[string, string, number]> = [];
      for (let i = 0; i < 8; i++) {
        links.push([String(i), String(i), 0]);
        for (let j = 0; j < 8; j++) if (i !== j && random() < .3) links.push([String(i), String(j), .1 + random() * 8]);
      }
      const graph = weightedExample(links, true);
      for (const node of graph.nodes.values()) { node.lat = random() * .1; node.lng = random() * .1; }
      const oracle = runDijkstra(graph, '0', '7');
      for (const result of [runAStar(graph, '0', '7'), runBidirectionalAStar(graph, '0', '7')]) {
        expect(result.found).toBe(oracle.found);
        if (oracle.found) expect(result.totalTimeMinutes).toBeCloseTo(oracle.totalTimeMinutes, 10);
      }
    }
  });
  it('derives a safe heuristic from the graph instead of assuming a 65-mph speed bound', () => {
    const graph = weightedExample([['S', 'T', 10], ['S', 'A', 1], ['A', 'T', 1]], true);
    graph.nodes.get('A')!.lng = 1; graph.nodes.get('T')!.lng = 2;
    expect(runAStar(graph, 'S', 'T').totalTimeMinutes).toBe(2);
  });
  it('searches the reversed adjacency in the backward direction on a one-way route', () => {
    const graph = weightedExample([['S', 'A', 3], ['A', 'B', 2], ['B', 'T', 1]], true);
    const result = runBidirectionalAStar(graph, 'S', 'T');
    expect(result.path).toEqual(['S', 'A', 'B', 'T']);
    expect(result.totalTimeMinutes).toBe(6);
    expect(runBidirectionalAStar(graph, 'T', 'S').found).toBe(false);
  });
  it('does not terminate bidirectional search at a more expensive first common settled node', () => {
    const graph = weightedExample([['S', 'A', 5], ['A', 'T', 5], ['S', 'B', 1], ['B', 'C', 1], ['C', 'T', 9]]);
    expect(runBidirectionalAStar(graph, 'S', 'T').totalTimeMinutes).toBe(10);
  });
});

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
