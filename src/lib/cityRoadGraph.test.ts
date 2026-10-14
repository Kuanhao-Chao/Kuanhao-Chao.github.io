import { describe, it, expect } from 'vitest';
import {
  buildFullCityRoadGraph,
  spliceEndpointIntoCityGraph,
  cityRoadGraphToBayGraph,
  buildFullCityGraphWithEndpoints,
} from './cityRoadGraph';
import { runPathfinding } from './pathfinding';
import { BAYROUTE_TRIPS, BAYROUTE_EXAMPLES } from './bayRouteTeaching';

describe('CityRoadGraph Engine', () => {
  it('builds an interconnected curated road network', () => {
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

  it('snaps a nearby landmark without creating local connectors and keeps a represented route', () => {
    const cityGraph = buildFullCityRoadGraph();
    const snapped = spliceEndpointIntoCityGraph(cityGraph, { name: 'Coit Tower', lat: 37.8024, lng: -122.4058 }, true);
    expect(snapped.graph).toBe(cityGraph);
    expect(snapped.graph.edges.length).toBe(cityGraph.edges.length);
    const result = runPathfinding('a_star', cityRoadGraphToBayGraph(snapped.graph), snapped.nodeId, 'twin_peaks_summit');
    expect(result.found).toBe(true);
    expect(result.path[0]).toBe(snapped.nodeId);
    expect(result.path[result.path.length - 1]).toBe('twin_peaks_summit');
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

  it('preserves multi-point curved polyline geometry across all major bridges and freeways', () => {
    const cityGraph = buildFullCityRoadGraph();
    const bayGraph = cityRoadGraphToBayGraph(cityGraph);

    // Verify all edges have valid polyline paths
    for (const edge of bayGraph.edges) {
      expect(edge.path).toBeDefined();
      expect(edge.path!.length).toBeGreaterThanOrEqual(2);
      for (const pt of edge.path!) {
        expect(pt.lat).toBeGreaterThan(37.0);
        expect(pt.lat).toBeLessThan(38.5);
        expect(pt.lng).toBeGreaterThan(-123.0);
        expect(pt.lng).toBeLessThan(-121.5);
      }
    }

    // Verify Bay Bridge has multi-point curved polyline geometry
    const bayBridgeEdge = bayGraph.edges.find(
      (e) => e.u === 'bb_anchorage' && e.v === 'bb_yerba_buena'
    );
    expect(bayBridgeEdge).toBeDefined();
    expect(bayBridgeEdge!.path!.length).toBeGreaterThanOrEqual(4);

    // Verify Golden Gate Bridge has multi-point curved polyline geometry
    const ggbEdge = bayGraph.edges.find(
      (e) => e.u === 'ggb_toll_plaza' && e.v === 'ggb_south_tower'
    );
    expect(ggbEdge).toBeDefined();
    expect(ggbEdge!.path!.length).toBeGreaterThanOrEqual(3);

    // Verify San Mateo Bridge spans the lower bay with curved geometry
    const sanMateoEdge = bayGraph.edges.find(
      (e) => e.u === 'san_mateo_bridge_west' && e.v === 'hayward_downtown'
    );
    expect(sanMateoEdge).toBeDefined();
    expect(sanMateoEdge!.path!.length).toBeGreaterThanOrEqual(5);

    // Verify Dumbarton Bridge connects Peninsula to East Bay
    const dumbartonEdge = bayGraph.edges.find(
      (e) => e.u === 'dumbarton_bridge_west' && e.v === 'fremont_downtown'
    );
    expect(dumbartonEdge).toBeDefined();
    expect(dumbartonEdge!.path!.length).toBeGreaterThanOrEqual(4);

    // Verify Richmond-San Rafael Bridge connects North Bay to East Bay
    const richmondEdge = bayGraph.edges.find(
      (e) => e.u === 'marin_san_rafael' && e.v === 'richmond_downtown'
    );
    expect(richmondEdge).toBeDefined();
    expect(richmondEdge!.path!.length).toBeGreaterThanOrEqual(5);
  });

  it('builds and routes through the New York City full city network', () => {
    const timesSq = { name: 'Times Square', lat: 40.7580, lng: -73.9855 };
    const brooklyn = { name: 'Brooklyn Bridge Promenade', lat: 40.7061, lng: -73.9969 };

    const res = buildFullCityGraphWithEndpoints(timesSq, brooklyn);
    expect(res.graph.nodes.size).toBeGreaterThan(20);
    expect(res.graph.edges.length).toBeGreaterThan(40);
    expect(res.maneuvers.length).toBeGreaterThan(3);
    expect(res.totalDistanceMiles).toBeGreaterThan(3);

    const aStar = runPathfinding('a_star', res.graph, res.startId, res.goalId);
    expect(aStar.found).toBe(true);
    expect(aStar.totalDistanceMiles).toBeGreaterThan(3);
  });

  it('builds and routes through the Tokyo central city network', () => {
    const shibuya = { name: 'Shibuya Crossing', lat: 35.6595, lng: 139.7005 };
    const tokyoTower = { name: 'Tokyo Tower', lat: 35.6586, lng: 139.7454 };

    const res = buildFullCityGraphWithEndpoints(shibuya, tokyoTower);
    expect(res.graph.nodes.size).toBeGreaterThan(14);
    expect(res.graph.edges.length).toBeGreaterThan(25);
    expect(res.maneuvers.length).toBeGreaterThan(2);

    const aStar = runPathfinding('a_star', res.graph, res.startId, res.goalId);
    expect(aStar.found).toBe(true);
  });

  it('builds and routes through the London Thames city network', () => {
    const westminster = { name: 'Westminster Palace', lat: 51.4994, lng: -0.1248 };
    const towerBridge = { name: 'Tower Bridge', lat: 51.5055, lng: -0.0754 };

    const res = buildFullCityGraphWithEndpoints(westminster, towerBridge);
    expect(res.graph.nodes.size).toBeGreaterThan(14);
    expect(res.graph.edges.length).toBeGreaterThan(25);

    const aStar = runPathfinding('a_star', res.graph, res.startId, res.goalId);
    expect(aStar.found).toBe(true);
  });

  it('builds and routes through the Taipei city network', () => {
    const tpe101 = { name: 'Taipei 101', lat: 25.0339, lng: 121.5645 };
    const shilin = { name: 'Shilin Night Market', lat: 25.0881, lng: 121.5244 };

    const res = buildFullCityGraphWithEndpoints(tpe101, shilin);
    expect(res.graph.nodes.size).toBeGreaterThan(16);
    expect(res.graph.edges.length).toBeGreaterThan(30);

    const aStar = runPathfinding('a_star', res.graph, res.startId, res.goalId);
    expect(aStar.found).toBe(true);
  });
});

describe('curated road endpoints', () => {
  it('keeps all six trips on their supported curated graphs', () => {
    for (const trip of BAYROUTE_TRIPS) {
      const result = buildFullCityGraphWithEndpoints(trip.start, trip.goal);
      expect(result.graph.nodes.has(result.startId)).toBe(true);
      expect(result.graph.nodes.has(result.goalId)).toBe(true);
      expect(result.totalDurationMinutes).toBeGreaterThan(0);
    }
  });
  it('provides worked teaching examples with independently known optimal costs', () => {
    const expected = [3, 5, 10];
    BAYROUTE_EXAMPLES.forEach((example, i) => expect(runPathfinding('bidirectional_a_star', example.graph(), example.startId, example.goalId).totalTimeMinutes).toBe(expected[i]));
  });
  it('snaps to a represented junction without adding roads or nodes', () => {
    const graph = buildFullCityRoadGraph();
    const node = [...graph.nodes.values()][0];
    const result = spliceEndpointIntoCityGraph(graph, { name: 'Nearby', lat: node.lat + .0001, lng: node.lng }, true);
    expect(result.nodeId).toBe(node.id);
    expect(result.graph.nodes.size).toBe(graph.nodes.size);
    expect(result.graph.edges.length).toBe(graph.edges.length);
  });
  it('rejects cross-region routes instead of inventing transcontinental connectors', () => {
    expect(() => buildFullCityGraphWithEndpoints({ name: 'SF', lat: 37.79, lng: -122.4 }, { name: 'NYC', lat: 40.75, lng: -73.98 })).toThrow(/region/i);
  });
});
