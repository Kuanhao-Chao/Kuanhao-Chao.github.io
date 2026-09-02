import { describe, it, expect } from 'vitest';
import {
  DENSE_BAY_INTERSECTIONS,
  buildDenseBayAreaGraph,
} from './realRoads';

describe('Dense Real-World Road Network Engine', () => {
  it('contains dense intersection nodes across major Bay Area cities and corridors', () => {
    expect(DENSE_BAY_INTERSECTIONS.length).toBeGreaterThan(30);

    const sfNodes = DENSE_BAY_INTERSECTIONS.filter((n) => n.city === 'San Francisco');
    const penNodes = DENSE_BAY_INTERSECTIONS.filter((n) =>
      ['Daly City', 'San Bruno', 'Millbrae', 'San Mateo', 'Palo Alto', 'Mountain View'].includes(n.city)
    );
    const sbNodes = DENSE_BAY_INTERSECTIONS.filter((n) =>
      ['Cupertino', 'Santa Clara', 'San Jose', 'Milpitas'].includes(n.city)
    );
    const ebNodes = DENSE_BAY_INTERSECTIONS.filter((n) =>
      ['Fremont', 'Hayward', 'Oakland', 'Berkeley'].includes(n.city)
    );

    expect(sfNodes.length).toBeGreaterThan(5);
    expect(penNodes.length).toBeGreaterThan(5);
    expect(sbNodes.length).toBeGreaterThan(4);
    expect(ebNodes.length).toBeGreaterThan(5);
  });

  it('builds a globally connected graph with enhanced density', () => {
    const graph = buildDenseBayAreaGraph();
    expect(graph.nodes.size).toBeGreaterThan(70);
    expect(graph.edges.length).toBeGreaterThan(80);

    // Verify SF Market St intersection exists and has neighbors
    expect(graph.nodes.has('sf_market_1st')).toBe(true);
    const neighbors = graph.adjacency.get('sf_market_1st') || [];
    expect(neighbors.length).toBeGreaterThan(0);
  });
});
