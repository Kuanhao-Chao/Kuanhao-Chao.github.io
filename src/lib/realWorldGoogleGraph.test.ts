import { describe, it, expect } from 'vitest';
import {
  buildDynamicRealWorldGraph,
  synthesizeRealRoadCorridor,
  parseGoogleRoutesToGraph,
  realWorldGraphToBayGraph,
} from './realWorldGoogleGraph';
import { runPathfinding } from './pathfinding';

describe('RealWorldGoogleGraph Engine', () => {
  it('synthesizes authentic real-road corridors between global coordinates anywhere in the world', () => {
    const globalTrips = [
      {
        name: 'San Francisco: Ferry Bldg → UC Berkeley',
        start: { lat: 37.7942, lng: -122.3955, name: 'SF Ferry Building' },
        goal: { lat: 37.8719, lng: -122.2585, name: 'UC Berkeley' },
      },
      {
        name: 'New York City: Times Square → Brooklyn Bridge',
        start: { lat: 40.7580, lng: -73.9855, name: 'Times Square' },
        goal: { lat: 40.7061, lng: -73.9969, name: 'Brooklyn Bridge' },
      },
      {
        name: 'Tokyo: Shibuya Crossing → Tokyo Tower',
        start: { lat: 35.6595, lng: 139.7005, name: 'Shibuya Crossing' },
        goal: { lat: 35.6586, lng: 139.7454, name: 'Tokyo Tower' },
      },
      {
        name: 'London: Westminster → Tower Bridge',
        start: { lat: 51.4994, lng: -0.1248, name: 'Westminster Palace' },
        goal: { lat: 51.5055, lng: -0.0754, name: 'Tower Bridge' },
      },
      {
        name: 'Taipei: Taipei 101 → Shilin Night Market',
        start: { lat: 25.0339, lng: 121.5645, name: 'Taipei 101' },
        goal: { lat: 25.0881, lng: 121.5244, name: 'Shilin Market' },
      },
    ];

    for (const trip of globalTrips) {
      const graph = synthesizeRealRoadCorridor(trip.start, trip.goal);

      expect(graph.nodes.size).toBeGreaterThanOrEqual(8);
      expect(graph.edges.length).toBeGreaterThanOrEqual(12);
      expect(graph.startId).toBe('synth_start');
      expect(graph.goalId).toBe('synth_goal');
      expect(graph.maneuvers.length).toBeGreaterThan(0);

      // Verify every single edge has curved polyline path coordinates
      for (const edge of graph.edges) {
        expect(edge.path).toBeDefined();
        expect(edge.path.length).toBeGreaterThanOrEqual(2);
        for (const pt of edge.path) {
          expect(Number.isFinite(pt.lat)).toBe(true);
          expect(Number.isFinite(pt.lng)).toBe(true);
        }
      }

      // Verify graph runs search algorithms successfully
      const bayGraph = realWorldGraphToBayGraph(graph);
      const dijkstraRes = runPathfinding('dijkstra', bayGraph, graph.startId, graph.goalId);
      const aStarRes = runPathfinding('a_star', bayGraph, graph.startId, graph.goalId);
      const biAStarRes = runPathfinding('bidirectional_a_star', bayGraph, graph.startId, graph.goalId);

      expect(dijkstraRes.found).toBe(true);
      expect(aStarRes.found).toBe(true);
      expect(biAStarRes.found).toBe(true);
      expect(aStarRes.totalTimeMinutes).toBeCloseTo(dijkstraRes.totalTimeMinutes, 0.5);
    }
  });

  it('parses Google Maps DirectionsRoute objects with step.path polylines into a connected graph', () => {
    const mockLatLng = (lat: number, lng: number) => ({
      lat: () => lat,
      lng: () => lng,
    });

    const mockRoutes: any[] = [
      {
        summary: 'Broadway Corridor',
        legs: [
          {
            distance: { value: 5000 },
            duration: { value: 600 },
            steps: [
              {
                instructions: 'Head south on <b>Broadway</b>',
                distance: { value: 2000 },
                duration: { value: 240 },
                start_location: mockLatLng(40.7580, -73.9855),
                end_location: mockLatLng(40.7300, -73.9900),
                path: [
                  mockLatLng(40.7580, -73.9855),
                  mockLatLng(40.7440, -73.9880),
                  mockLatLng(40.7300, -73.9900),
                ],
              },
              {
                instructions: 'Continue onto <b>FDR Drive</b> toward destination',
                distance: { value: 3000 },
                duration: { value: 360 },
                start_location: mockLatLng(40.7300, -73.9900),
                end_location: mockLatLng(40.7061, -73.9969),
                path: [
                  mockLatLng(40.7300, -73.9900),
                  mockLatLng(40.7180, -73.9940),
                  mockLatLng(40.7061, -73.9969),
                ],
              },
            ],
          },
        ],
      },
    ];

    const start = { lat: 40.7580, lng: -73.9855, name: 'Times Square' };
    const goal = { lat: 40.7061, lng: -73.9969, name: 'Brooklyn Bridge' };

    const graph = parseGoogleRoutesToGraph(start, goal, mockRoutes);

    expect(graph.nodes.size).toBe(3);
    expect(graph.startId).toBe('start_node');
    expect(graph.goalId).toBe('goal_node');
    expect(graph.maneuvers.length).toBe(2);
    expect(graph.maneuvers[0].instruction).not.toContain('<b>');

    const bayGraph = realWorldGraphToBayGraph(graph);
    const res = runPathfinding('a_star', bayGraph, graph.startId, graph.goalId);
    expect(res.found).toBe(true);
    expect(res.path[0]).toBe('start_node');
    expect(res.path[res.path.length - 1]).toBe('goal_node');
  });
});
