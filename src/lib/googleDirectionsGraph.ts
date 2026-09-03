/**
 * Google Maps Directions Graph Extractor
 *
 * Taps into google.maps.DirectionsService to dynamically construct authentic,
 * high-fidelity road network graphs directly from Google Maps driving routes.
 * Extracts real maneuver nodes, alternative highway corridors, step-by-step
 * turn instructions, and exact curved polyline paths.
 */

import type { LatLngPoint, RoadType } from './bayGraph';
import type { CityRoadGraph, CityIntersection, CityRoadSegment, CityRoadType } from './cityRoadGraph';
import { haversineDistanceMiles } from './realWorldRoadGraph';

export interface TurnManeuver {
  instruction: string;
  distanceMiles: number;
  durationMinutes: number;
  lat: number;
  lng: number;
}

export interface GoogleDirectionsGraphResult {
  graph: CityRoadGraph;
  startNodeId: string;
  goalNodeId: string;
  maneuvers: TurnManeuver[];
  routeSummary: string;
  totalDistanceMiles: number;
  totalDurationMinutes: number;
}

/**
 * Classifies street name or maneuver instruction into a RoadType.
 */
function classifyRoadType(instruction: string, streetName: string): { roadType: CityRoadType; speedLimit: number } {
  const text = `${instruction} ${streetName}`.toLowerCase();
  if (text.includes('bridge')) {
    return { roadType: 'bridge', speedLimit: 50 };
  }
  if (
    text.includes('i-') ||
    text.includes('interstate') ||
    text.includes('us-') ||
    text.includes('ca-') ||
    text.includes('fwy') ||
    text.includes('freeway') ||
    text.includes('highway') ||
    text.includes('hwy') ||
    text.includes('expressway')
  ) {
    return { roadType: 'highway', speedLimit: 65 };
  }
  if (
    text.includes('blvd') ||
    text.includes('boulevard') ||
    text.includes('avenue') ||
    text.includes('ave') ||
    text.includes('broadway') ||
    text.includes('way') ||
    text.includes('drive')
  ) {
    return { roadType: 'arterial', speedLimit: 35 };
  }
  return { roadType: 'local', speedLimit: 25 };
}

/**
 * Strips HTML tags from Google Maps route instructions (e.g. <b>I-80 E</b> -> I-80 E).
 */
function stripHtml(html: string): string {
  // `DOMParser` rather than a detached div's markup property. The input is a third-party API
  // response, and a parsed document has no browsing context: scripting is disabled in it and it
  // fetches no external resources, so an `onerror` payload in an instruction string is inert.
  // Assigning the same markup to a live element's markup property gives neither guarantee, and
  // the repo-wide security audit rejects that bare token for exactly this reason -- including
  // inside a comment, which is why this sentence names it obliquely.
  if (typeof DOMParser !== 'undefined') {
    return new DOMParser().parseFromString(html, 'text/html').body.textContent || '';
  }
  return html.replace(/<[^>]*>?/gm, '');
}

/**
 * Fetches real driving routes and alternatives from Google Maps DirectionsService
 * and converts them into a search-algorithm-ready graph with exact curved road polylines.
 */
export async function fetchGoogleDirectionsRoadGraph(
  start: { lat: number; lng: number; name: string },
  goal: { lat: number; lng: number; name: string }
): Promise<GoogleDirectionsGraphResult | null> {
  if (typeof window === 'undefined' || !window.google || !window.google.maps) {
    return null;
  }

  const directionsService = new window.google.maps.DirectionsService();

  return new Promise((resolve) => {
    directionsService.route(
      {
        origin: new window.google.maps.LatLng(start.lat, start.lng),
        destination: new window.google.maps.LatLng(goal.lat, goal.lng),
        travelMode: window.google.maps.TravelMode.DRIVING,
        provideRouteAlternatives: true,
      },
      (result, status) => {
        if (status !== window.google.maps.DirectionsStatus.OK || !result || !result.routes.length) {
          console.warn('[GoogleDirectionsGraph] Route request failed or returned zero routes:', status);
          resolve(null);
          return;
        }

        try {
          const parsed = parseGoogleRoutesIntoGraph(start, goal, result.routes);
          resolve(parsed);
        } catch (err) {
          console.error('[GoogleDirectionsGraph] Error parsing routes into graph:', err);
          resolve(null);
        }
      }
    );
  });
}

/**
 * Converts Google DirectionsRoute objects into a connected graph with real curved road paths.
 */
export function parseGoogleRoutesIntoGraph(
  start: { lat: number; lng: number; name: string },
  goal: { lat: number; lng: number; name: string },
  routes: google.maps.DirectionsRoute[]
): GoogleDirectionsGraphResult {
  const nodes = new Map<string, CityIntersection>();
  const edges: CityRoadSegment[] = [];
  const adjacency = new Map<string, Array<{ target: string; segment: CityRoadSegment }>>();
  const maneuvers: TurnManeuver[] = [];

  function addNode(id: string, name: string, district: string, lat: number, lng: number, type: 'landmark' | 'junction' = 'junction'): void {
    if (!nodes.has(id)) {
      nodes.set(id, { id, name, district, lat, lng, type });
      adjacency.set(id, []);
    }
  }

  function addEdge(
    u: string,
    v: string,
    streetName: string,
    roadType: CityRoadType,
    speedLimit: number,
    distanceMiles: number,
    durationMinutes: number,
    path: LatLngPoint[]
  ): void {
    // Prevent duplicate edges
    const existing = adjacency.get(u)?.some((adj) => adj.target === v);
    if (existing) return;

    const seg: CityRoadSegment = {
      u,
      v,
      streetName,
      roadType,
      speedLimit,
      distanceMiles: Math.max(0.02, Math.round(distanceMiles * 100) / 100),
      durationMinutes: Math.max(0.05, Math.round(durationMinutes * 100) / 100),
      path,
    };

    edges.push(seg);
    adjacency.get(u)?.push({ target: v, segment: seg });

    // Also add bidirectional return edge with reversed polyline
    const revPath = [...path].reverse();
    const segRev: CityRoadSegment = {
      u: v,
      v: u,
      streetName,
      roadType,
      speedLimit,
      distanceMiles: seg.distanceMiles,
      durationMinutes: seg.durationMinutes,
      path: revPath,
    };
    edges.push(segRev);
    adjacency.get(v)?.push({ target: u, segment: segRev });
  }

  const startNodeId = 'gdir_start';
  const goalNodeId = 'gdir_goal';

  addNode(startNodeId, start.name, 'Start Point', start.lat, start.lng, 'landmark');
  addNode(goalNodeId, goal.name, 'Destination', goal.lat, goal.lng, 'landmark');

  let totalDistanceMiles = 0;
  let totalDurationMinutes = 0;
  const primarySummary = routes[0]?.summary || 'Bay Area Route';

  // Process all route alternatives (Primary route + Alternatives)
  routes.forEach((route, routeIdx) => {
    const leg = route.legs[0];
    if (!leg) return;

    if (routeIdx === 0) {
      totalDistanceMiles = Math.round((leg.distance?.value || 0) * 0.000621371 * 10) / 10;
      totalDurationMinutes = Math.round((leg.duration?.value || 0) / 60);
    }

    let prevNodeId = startNodeId;

    leg.steps.forEach((step, stepIdx) => {
      const isLastStep = stepIdx === leg.steps.length - 1;
      const stepNodeId = isLastStep ? goalNodeId : `gdir_r${routeIdx}_s${stepIdx}`;
      const cleanInstruction = stripHtml(step.instructions || 'Continue');

      const endLat = step.end_location.lat();
      const endLng = step.end_location.lng();

      if (!isLastStep) {
        addNode(stepNodeId, cleanInstruction.slice(0, 45), route.summary || 'Corridor', endLat, endLng);
      }

      // Convert Google Maps LatLng points into LatLngPoint[]
      const pathPoints: LatLngPoint[] = step.path.map((pt) => ({
        lat: pt.lat(),
        lng: pt.lng(),
      }));

      // Ensure start and end locations are anchored in the polyline
      if (pathPoints.length < 2) {
        const uNode = nodes.get(prevNodeId);
        if (uNode) {
          pathPoints.unshift({ lat: uNode.lat, lng: uNode.lng });
        }
        pathPoints.push({ lat: endLat, lng: endLng });
      }

      const distMiles = (step.distance?.value || 0) * 0.000621371;
      const durMins = (step.duration?.value || 0) / 60;
      const { roadType, speedLimit } = classifyRoadType(cleanInstruction, route.summary || '');

      addEdge(prevNodeId, stepNodeId, cleanInstruction, roadType, speedLimit, distMiles, durMins, pathPoints);

      if (routeIdx === 0) {
        maneuvers.push({
          instruction: cleanInstruction,
          distanceMiles: Math.round(distMiles * 10) / 10,
          durationMinutes: Math.round(durMins * 10) / 10,
          lat: endLat,
          lng: endLng,
        });
      }

      prevNodeId = stepNodeId;
    });
  });

  // Cross-link nearby nodes across different route options to give the search algorithms
  // realistic alternative junctions and decision branches
  const nodeList = Array.from(nodes.values());
  for (let i = 0; i < nodeList.length; i++) {
    for (let j = i + 1; j < nodeList.length; j++) {
      const n1 = nodeList[i];
      const n2 = nodeList[j];
      if (n1.id === n2.id || (n1.id === startNodeId && n2.id === goalNodeId)) continue;

      const dist = haversineDistanceMiles(n1.lat, n1.lng, n2.lat, n2.lng);
      // If two distinct route intersections are within 0.75 miles, create a local connecting edge
      if (dist > 0.05 && dist < 0.75) {
        const alreadyConnected = adjacency.get(n1.id)?.some((a) => a.target === n2.id);
        if (!alreadyConnected) {
          addEdge(
            n1.id,
            n2.id,
            `Connecting Corridor (${n1.name} ↔ ${n2.name})`,
            'arterial',
            30,
            dist,
            (dist / 30) * 60,
            [{ lat: n1.lat, lng: n1.lng }, { lat: n2.lat, lng: n2.lng }]
          );
        }
      }
    }
  }

  return {
    graph: { nodes, edges, adjacency },
    startNodeId,
    goalNodeId,
    maneuvers,
    routeSummary: primarySummary,
    totalDistanceMiles,
    totalDurationMinutes,
  };
}
