import { describe, it, expect } from 'vitest';
import {
  BAY_NODES,
  BAY_EDGES,
  PRESET_TRIPS,
  createBayGraph,
  haversineDistanceMiles,
  heuristicTravelTimeMinutes,
  spliceCustomEndpoints,
} from './bayGraph';

describe('bayGraph topology and data integrity', () => {
  it('contains valid Bay Area nodes with bounded coordinates and valid regions', () => {
    expect(BAY_NODES.length).toBeGreaterThan(40);

    const validRegions = new Set(['sf', 'peninsula', 'southbay', 'eastbay', 'northbay']);
    const ids = new Set<string>();

    for (const node of BAY_NODES) {
      expect(ids.has(node.id)).toBe(false);
      ids.add(node.id);

      expect(validRegions.has(node.region)).toBe(true);
      expect(node.x).toBeGreaterThanOrEqual(0);
      expect(node.x).toBeLessThanOrEqual(1000);
      expect(node.y).toBeGreaterThanOrEqual(0);
      expect(node.y).toBeLessThanOrEqual(1000);

      // Lat/Lng should fall within the greater SF Bay Area bounding box (37°N to 38.3°N, -122.7°W to -121.7°W)
      expect(node.lat).toBeGreaterThan(37.0);
      expect(node.lat).toBeLessThan(38.3);
      expect(node.lng).toBeGreaterThan(-123.0);
      expect(node.lng).toBeLessThan(-121.7);
    }
  });

  it('contains valid edges linking existing nodes with positive distance and speed limits', () => {
    const nodeIds = new Set(BAY_NODES.map((n) => n.id));

    expect(BAY_EDGES.length).toBeGreaterThan(50);

    for (const edge of BAY_EDGES) {
      expect(nodeIds.has(edge.u)).toBe(true);
      expect(nodeIds.has(edge.v)).toBe(true);
      expect(edge.u).not.toBe(edge.v);
      expect(edge.distance).toBeGreaterThan(0);
      expect(edge.speedLimit).toBeGreaterThanOrEqual(20);
      expect(edge.speedLimit).toBeLessThanOrEqual(70);
    }
  });

  it('builds an adjacency graph with complete global connectivity (single connected component)', () => {
    const graph = createBayGraph();
    expect(graph.nodes.size).toBe(BAY_NODES.length);

    // BFS to ensure all nodes can be reached from San Francisco Ferry Building
    const visited = new Set<string>();
    const queue: string[] = ['sf_ferry_bldg'];
    visited.add('sf_ferry_bldg');

    while (queue.length > 0) {
      const curr = queue.shift()!;
      const neighbors = graph.adjacency.get(curr) || [];
      for (const edge of neighbors) {
        if (!visited.has(edge.target)) {
          visited.add(edge.target);
          queue.push(edge.target);
        }
      }
    }

    expect(visited.size).toBe(BAY_NODES.length);
  });

  it('validates preset trips have existing start and goal nodes', () => {
    const nodeIds = new Set(BAY_NODES.map((n) => n.id));

    expect(PRESET_TRIPS.length).toBeGreaterThanOrEqual(5);

    for (const trip of PRESET_TRIPS) {
      expect(nodeIds.has(trip.startId)).toBe(true);
      expect(nodeIds.has(trip.goalId)).toBe(true);
      expect(trip.startId).not.toBe(trip.goalId);
      expect(trip.name.length).toBeGreaterThan(0);
    }
  });

  it('calculates realistic Haversine distances and admissible heuristics', () => {
    const sfFerry = BAY_NODES.find((n) => n.id === 'sf_ferry_bldg')!;
    const berkeley = BAY_NODES.find((n) => n.id === 'berkeley_campanile')!;

    const straightLineMiles = haversineDistanceMiles(
      sfFerry.lat,
      sfFerry.lng,
      berkeley.lat,
      berkeley.lng
    );

    // SF to Berkeley straight line distance is ~9 to 11 miles
    expect(straightLineMiles).toBeGreaterThan(8);
    expect(straightLineMiles).toBeLessThan(14);

    const heuristicTime = heuristicTravelTimeMinutes(sfFerry, berkeley, 65);
    expect(heuristicTime).toBeGreaterThan(5);
    expect(heuristicTime).toBeLessThan(15);
  });

  it('splices custom arbitrary endpoints into the base road network graph', () => {
    const base = createBayGraph();
    const customStart = {
      id: 'custom_apple_hq',
      name: '1 Infinite Loop, Cupertino',
      lat: 37.3318,
      lng: -122.0312,
      city: 'Cupertino',
    };
    const customGoal = {
      id: 'custom_coit_tower',
      name: 'Coit Tower, SF',
      lat: 37.8024,
      lng: -122.4058,
      city: 'San Francisco',
    };

    const { graph, startId, goalId } = spliceCustomEndpoints(base, customStart, customGoal, 3);
    expect(startId).toBe('custom_apple_hq');
    expect(goalId).toBe('custom_coit_tower');
    expect(graph.nodes.has('custom_apple_hq')).toBe(true);
    expect(graph.nodes.has('custom_coit_tower')).toBe(true);

    const startNeighbors = graph.adjacency.get('custom_apple_hq') || [];
    expect(startNeighbors.length).toBe(3);

    const goalNeighbors = graph.adjacency.get('custom_coit_tower') || [];
    expect(goalNeighbors.length).toBe(3);
  });
});
