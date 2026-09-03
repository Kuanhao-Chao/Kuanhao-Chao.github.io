import { describe, it, expect } from 'vitest';
import { parseGoogleRoutesIntoGraph, type GoogleDirectionsGraphResult } from './googleDirectionsGraph';
import { cityRoadGraphToBayGraph } from './cityRoadGraph';
import { runPathfinding } from './pathfinding';

describe('GoogleDirectionsGraph Extractor', () => {
  it('parses Google Maps Directions routes into a search graph with curved polylines', () => {
    // Mock Google Maps LatLng object
    const mockLatLng = (lat: number, lng: number) => ({
      lat: () => lat,
      lng: () => lng,
    });

    // Mock Google Maps DirectionsRoute with 2 legs/steps
    const mockRoutes: any[] = [
      {
        summary: 'I-80 E',
        legs: [
          {
            distance: { value: 16000 }, // ~10 miles (16,000 meters)
            duration: { value: 900 },   // 15 minutes (900 seconds)
            steps: [
              {
                instructions: 'Head east on <b>Market St</b> toward Steuart St',
                distance: { value: 800 },
                duration: { value: 120 },
                start_location: mockLatLng(37.7942, -122.3955),
                end_location: mockLatLng(37.7915, -122.3875),
                path: [
                  mockLatLng(37.7942, -122.3955),
                  mockLatLng(37.7928, -122.3910),
                  mockLatLng(37.7915, -122.3875),
                ],
              },
              {
                instructions: 'Merge onto <b>I-80 E</b> / San Francisco - Oakland Bay Bridge',
                distance: { value: 12000 },
                duration: { value: 600 },
                start_location: mockLatLng(37.7915, -122.3875),
                end_location: mockLatLng(37.8280, -122.2920),
                path: [
                  mockLatLng(37.7915, -122.3875),
                  mockLatLng(37.7980, -122.3780),
                  mockLatLng(37.8100, -122.3650),
                  mockLatLng(37.8180, -122.3380),
                  mockLatLng(37.8280, -122.2920),
                ],
              },
              {
                instructions: 'Take exit 11 for <b>University Ave</b> toward Berkeley',
                distance: { value: 3200 },
                duration: { value: 180 },
                start_location: mockLatLng(37.8280, -122.2920),
                end_location: mockLatLng(37.8719, -122.2585),
                path: [
                  mockLatLng(37.8280, -122.2920),
                  mockLatLng(37.8685, -122.3040),
                  mockLatLng(37.8719, -122.2585),
                ],
              },
            ],
          },
        ],
      },
    ];

    const start = { lat: 37.7942, lng: -122.3955, name: 'Market St (Ferry Bldg)' };
    const goal = { lat: 37.8719, lng: -122.2585, name: 'UC Berkeley Campus' };

    const result: GoogleDirectionsGraphResult = parseGoogleRoutesIntoGraph(start, goal, mockRoutes);

    expect(result).toBeDefined();
    expect(result.startNodeId).toBe('gdir_start');
    expect(result.goalNodeId).toBe('gdir_goal');
    expect(result.totalDistanceMiles).toBeGreaterThan(5);
    expect(result.totalDurationMinutes).toBeGreaterThan(10);
    expect(result.maneuvers.length).toBe(3);

    // Verify maneuvers stripped of HTML
    expect(result.maneuvers[0].instruction).toContain('Market St');
    expect(result.maneuvers[0].instruction).not.toContain('<b>');

    // Verify graph structure
    const { graph } = result;
    expect(graph.nodes.size).toBeGreaterThanOrEqual(4);
    expect(graph.edges.length).toBeGreaterThanOrEqual(3);

    // Verify curved polylines preserved on edges
    const bayBridgeSeg = graph.edges.find((e) => e.streetName.includes('Bay Bridge'));
    expect(bayBridgeSeg).toBeDefined();
    expect(bayBridgeSeg!.path).toBeDefined();
    expect(bayBridgeSeg!.path!.length).toBe(5);

    // Verify graph is fully solvable with search algorithms
    const bayGraph = cityRoadGraphToBayGraph(graph);
    const dijkstraRes = runPathfinding('dijkstra', bayGraph, result.startNodeId, result.goalNodeId);
    expect(dijkstraRes.found).toBe(true);
    expect(dijkstraRes.path[0]).toBe(result.startNodeId);
    expect(dijkstraRes.path[dijkstraRes.path.length - 1]).toBe(result.goalNodeId);

    const aStarRes = runPathfinding('a_star', bayGraph, result.startNodeId, result.goalNodeId);
    expect(aStarRes.found).toBe(true);
    expect(aStarRes.totalDistanceMiles).toBeCloseTo(dijkstraRes.totalDistanceMiles, 0.1);
  });
});
