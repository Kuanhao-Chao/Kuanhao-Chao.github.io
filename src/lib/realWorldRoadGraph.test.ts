import { describe, it, expect } from 'vitest';
import {
  haversineDistanceMiles,
  buildRealWorldRoadGraph,
  generateOfflineRealRoadGraph,
  realRoadGraphToBayGraph,
} from './realWorldRoadGraph';
import { runPathfinding } from './pathfinding';

describe('RealWorldRoadGraph Engine', () => {
  const sfFerry = {
    lat: 37.7955,
    lng: -122.3937,
    name: 'San Francisco Ferry Building',
  };

  const stanford = {
    lat: 37.4275,
    lng: -122.1697,
    name: 'Stanford University',
  };

  const berkeley = {
    lat: 37.8719,
    lng: -122.2585,
    name: 'UC Berkeley',
  };

  it('calculates accurate Haversine distances', () => {
    // SF Ferry Bldg to UC Berkeley is roughly 10-12 miles as the crow flies
    const dist = haversineDistanceMiles(sfFerry.lat, sfFerry.lng, berkeley.lat, berkeley.lng);
    expect(dist).toBeGreaterThan(9.0);
    expect(dist).toBeLessThan(14.0);
  });

  it('generates a robust offline real-world topological graph', () => {
    const graph = generateOfflineRealRoadGraph(sfFerry, stanford);

    expect(graph.nodes.size).toBeGreaterThan(20);
    expect(graph.edges.length).toBeGreaterThan(20);
    expect(graph.startId).toBe('start_node');
    expect(graph.goalId).toBe('goal_node');

    const startNode = graph.nodes.get(graph.startId);
    expect(startNode).toBeDefined();
    expect(startNode?.lat).toBe(sfFerry.lat);
    expect(startNode?.lng).toBe(sfFerry.lng);

    const goalNode = graph.nodes.get(graph.goalId);
    expect(goalNode).toBeDefined();
    expect(goalNode?.lat).toBe(stanford.lat);
    expect(goalNode?.lng).toBe(stanford.lng);

    // Verify adjacency list exists for every node
    for (const [nodeId] of graph.nodes) {
      expect(graph.adjacency.has(nodeId)).toBe(true);
      expect(graph.adjacency.get(nodeId)!.length).toBeGreaterThan(0);
    }
  });

  it('connects start and goal seamlessly allowing full traversal', () => {
    const graph = generateOfflineRealRoadGraph(sfFerry, berkeley);

    // BFS reachability test from start to goal
    const visited = new Set<string>();
    const queue: string[] = [graph.startId];
    visited.add(graph.startId);

    while (queue.length > 0) {
      const curr = queue.shift()!;
      const neighbors = graph.adjacency.get(curr) || [];
      for (const adj of neighbors) {
        if (!visited.has(adj.target)) {
          visited.add(adj.target);
          queue.push(adj.target);
        }
      }
    }

    expect(visited.has(graph.goalId)).toBe(true);
  });

  it('dynamically builds real road graph for arbitrary coordinates', async () => {
    const graph = await buildRealWorldRoadGraph(sfFerry, berkeley);

    expect(graph.nodes.size).toBeGreaterThan(15);
    expect(graph.edges.length).toBeGreaterThan(15);
    expect(graph.summary.startName).toBe(sfFerry.name);
    expect(graph.summary.goalName).toBe(berkeley.name);
    expect(graph.summary.estimatedDistanceMiles).toBeGreaterThan(5);
  });

  it('converts to BayGraph and runs Dijkstra and A* successfully', () => {
    const realGraph = generateOfflineRealRoadGraph(sfFerry, stanford);
    const bayGraph = realRoadGraphToBayGraph(realGraph);

    expect(bayGraph.nodes.size).toBe(realGraph.nodes.size);
    expect(bayGraph.edges.length).toBe(realGraph.edges.length);

    // Run Dijkstra
    const dijkstraRes = runPathfinding('dijkstra', bayGraph, realGraph.startId, realGraph.goalId);
    expect(dijkstraRes.found).toBe(true);
    expect(dijkstraRes.path.length).toBeGreaterThan(2);
    expect(dijkstraRes.totalDistanceMiles).toBeGreaterThan(0);

    // Run A*
    const aStarRes = runPathfinding('a_star', bayGraph, realGraph.startId, realGraph.goalId);
    expect(aStarRes.found).toBe(true);
    expect(aStarRes.path.length).toBeGreaterThan(2);
    expect(aStarRes.totalDistanceMiles).toBeCloseTo(dijkstraRes.totalDistanceMiles, 0.5);

    // Run Bidirectional A*
    const biRes = runPathfinding('bidirectional_a_star', bayGraph, realGraph.startId, realGraph.goalId);
    expect(biRes.found).toBe(true);

    // Run Greedy
    const greedyRes = runPathfinding('greedy', bayGraph, realGraph.startId, realGraph.goalId);
    expect(greedyRes.found).toBe(true);

    // Run BFS
    const bfsRes = runPathfinding('bfs', bayGraph, realGraph.startId, realGraph.goalId);
    expect(bfsRes.found).toBe(true);
  });
});
