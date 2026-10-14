import type { BayGraph, BayEdge } from './bayGraph';

function exampleGraph(points: Array<[string, number, number]>, links: Array<[string, string, number]>): BayGraph {
  const graph: BayGraph = { nodes: new Map(), adjacency: new Map(), edges: [], heuristicMode: 'zero' };
  for (const [id, x, y] of points) {
    graph.nodes.set(id, { id, name: id, city: 'Teaching example', region: 'global', type: 'junction', x, y, lat: y, lng: x });
    graph.adjacency.set(id, []);
  }
  for (const [u, v, weight] of links) {
    const edge: BayEdge = { u, v, name: `${u}–${v}`, distance: weight, speedLimit: 60, roadType: 'arterial' };
    graph.edges.push(edge);
    graph.adjacency.get(u)!.push({ target: v, weight, edge });
    graph.adjacency.get(v)!.push({ target: u, weight, edge });
  }
  return graph;
}

export const BAYROUTE_EXAMPLES = [
  {
    id: 'weighted', title: 'Cost versus hops', startId: 'S', goalId: 'T',
    explanation: 'BFS takes the one-edge S–T route costing 9. Dijkstra/A* take S–A–B–T costing 3. Fewest hops is not minimum weighted cost. Coordinates are schematic; all h values are zero.',
    graph: () => exampleGraph([['S', 0, 0], ['A', 1, .7], ['B', 2, .7], ['T', 3, 0]], [['S', 'T', 9], ['S', 'A', 1], ['A', 'B', 1], ['B', 'T', 1]]),
  },
  {
    id: 'bridge', title: 'Bridge detour', startId: 'S', goalId: 'T',
    explanation: 'A–B is the only crossing. S–C–D is a dead-end branch close to the destination. Graph connectivity, not visual closeness, determines which route exists. The valid route costs 5.',
    graph: () => { const graph = exampleGraph([['S', 0, 0], ['A', 0, 1], ['B', 2, 1], ['T', 2, 0], ['C', .7, .1], ['D', .75, .3]], [['S', 'A', 1], ['A', 'B', 3], ['B', 'T', 1], ['S', 'C', .2], ['C', 'D', .2]]); graph.heuristicMode = 'geodesic'; return graph; },
  },
  {
    id: 'termination', title: 'Why first meeting fails', startId: 'S', goalId: 'T',
    explanation: 'S–A–T costs 10; S–B–C–T costs 11. A first common settled node can yield the expensive route. Balanced bidirectional search keeps an incumbent and stops only when the combined reduced-cost lower bound certifies it. Here h = 0 isolates the stopping rule.',
    graph: () => exampleGraph([['S', 0, 0], ['A', 1, .8], ['B', .6, -.7], ['C', 1.5, -.7], ['T', 2.5, 0]], [['S', 'A', 5], ['A', 'T', 5], ['S', 'B', 1], ['B', 'C', 1], ['C', 'T', 9]]),
  },
] as const;

export const BAYROUTE_TRIPS = [
  { id: 'trip_sf_to_berkeley', title: 'SF → Berkeley', start: { name: 'SF Ferry Building', lat: 37.7955, lng: -122.3937 }, goal: { name: 'UC Berkeley', lat: 37.8722, lng: -122.258 } },
  { id: 'trip_nyc_manhattan', title: 'Times Square → Brooklyn', start: { name: 'Times Square', lat: 40.758, lng: -73.9855 }, goal: { name: 'Brooklyn Bridge', lat: 40.706, lng: -73.9969 } },
  { id: 'trip_tokyo_shibuya', title: 'Shibuya → Tokyo Tower', start: { name: 'Shibuya', lat: 35.6595, lng: 139.7005 }, goal: { name: 'Tokyo Tower', lat: 35.6586, lng: 139.7454 } },
  { id: 'trip_london_thames', title: 'Westminster → Tower Bridge', start: { name: 'Westminster', lat: 51.4995, lng: -.1248 }, goal: { name: 'Tower Bridge', lat: 51.5055, lng: -.0754 } },
  { id: 'trip_taipei_101', title: 'Taipei 101 → Shilin', start: { name: 'Taipei 101', lat: 25.0339, lng: 121.5645 }, goal: { name: 'Shilin', lat: 25.0888, lng: 121.5241 } },
  { id: 'trip_sfo_to_stanford', title: 'SFO → Stanford', start: { name: 'SFO Airport', lat: 37.6213, lng: -122.379 }, goal: { name: 'Stanford University', lat: 37.4275, lng: -122.1697 } },
] as const;
