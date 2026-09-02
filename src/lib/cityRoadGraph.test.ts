import { describe, it, expect } from 'vitest';
import {
  buildFullCityRoadGraph,
  spliceEndpointIntoCityGraph,
  cityRoadGraphToBayGraph,
} from './cityRoadGraph';
import { runPathfinding } from './pathfinding';

describe('CityRoadGraph Engine', () => {
  it('builds a comprehensive, interconnected full city road network', () => {
    const graph = buildFullCityRoadGraph();

    expect(graph.nodes.size).toBeGreaterThan(80);
    expect(graph.edges.length).toBeGreaterThan(150);

    // Verify all nodes have adjacency entries
    for (const [nodeId] of graph.nodes) {
      expect(graph.adjacency.has(nodeId)).toBe(true);
      expect(graph.adjacency.get(nodeId)!.length).toBeGreaterThan(0);
    }
  });

  it('connects key city landmarks across San Francisco and Bay corridors', () => {
    const cityGraph = buildFullCityRoadGraph();
    const bayGraph = cityRoadGraphToBayGraph(cityGraph);

    // Run Dijkstra from SF Ferry Building to Ocean Beach
    const oceanRes = runPathfinding('dijkstra', bayGraph, 'mkt_steuart', 'gry_ocean_beach');
    expect(oceanRes.found).toBe(true);
    expect(oceanRes.path.length).toBeGreaterThan(5);
    expect(oceanRes.totalDistanceMiles).toBeGreaterThan(5);

    // Run A* from Ferry Building to UC Berkeley across the Bay Bridge
    const berkeleyRes = runPathfinding('a_star', bayGraph, 'mkt_steuart', 'berkeley_campus');
    expect(berkeleyRes.found).toBe(true);
    expect(berkeleyRes.path.length).toBeGreaterThan(5);
    expect(berkeleyRes.totalDistanceMiles).toBeGreaterThan(8);

    // Run Bidirectional A* from Presidio to Stanford University
    const stanfordRes = runPathfinding('bidirectional_a_star', bayGraph, 'ggb_toll_plaza', 'palo_alto_stanford');
    expect(stanfordRes.found).toBe(true);
    expect(stanfordRes.path.length).toBeGreaterThan(5);
  });

  it('splices arbitrary doorstep addresses into the city grid seamlessly', () => {
    const cityGraph = buildFullCityRoadGraph();

    // Custom address: Coit Tower atop Telegraph Hill
    const coitTower = {
      name: 'Coit Tower (Telegraph Hill)',
      lat: 37.8024,
      lng: -122.4058,
    };

    const spliced = spliceEndpointIntoCityGraph(cityGraph, coitTower, true);
    expect(spliced.graph.nodes.has(spliced.nodeId)).toBe(true);

    const splicedNode = spliced.graph.nodes.get(spliced.nodeId)!;
    expect(splicedNode.lat).toBe(coitTower.lat);
    expect(splicedNode.lng).toBe(coitTower.lng);

    // Verify 3 local connectors were created
    const neighbors = spliced.graph.adjacency.get(spliced.nodeId) || [];
    expect(neighbors.length).toBe(3);

    // Verify route can be found from Coit Tower to Twin Peaks Summit
    const bayGraph = cityRoadGraphToBayGraph(spliced.graph);
    const res = runPathfinding('a_star', bayGraph, spliced.nodeId, 'twin_peaks_summit');
    expect(res.found).toBe(true);
    expect(res.path[0]).toBe(spliced.nodeId);
    expect(res.path[res.path.length - 1]).toBe('twin_peaks_summit');
  });

  it('runs all 5 algorithms on the full city network', () => {
    const cityGraph = buildFullCityRoadGraph();
    const bayGraph = cityRoadGraphToBayGraph(cityGraph);

    const startId = 'mkt_steuart';
    const goalId = 'twin_peaks_summit';

    const dijkstra = runPathfinding('dijkstra', bayGraph, startId, goalId);
    const aStar = runPathfinding('a_star', bayGraph, startId, goalId);
    const biAStar = runPathfinding('bidirectional_a_star', bayGraph, startId, goalId);
    const greedy = runPathfinding('greedy', bayGraph, startId, goalId);
    const bfs = runPathfinding('bfs', bayGraph, startId, goalId);

    expect(dijkstra.found).toBe(true);
    expect(aStar.found).toBe(true);
    expect(biAStar.found).toBe(true);
    expect(greedy.found).toBe(true);
    expect(bfs.found).toBe(true);

    // Dijkstra and A* should find the exact same optimal travel time
    expect(aStar.totalTimeMinutes).toBeCloseTo(dijkstra.totalTimeMinutes, 0.5);
    // A* should explore fewer or equal nodes than Dijkstra
    expect(aStar.exploredCount).toBeLessThanOrEqual(dijkstra.exploredCount);
  });
});
