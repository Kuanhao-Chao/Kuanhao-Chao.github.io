import {
  type BayNode,
  type BayEdge,
  type BayGraph,
  createBayGraph,
  haversineDistanceMiles,
} from './bayGraph';

export interface RoadIntersection {
  id: string;
  name: string;
  city: string;
  lat: number;
  lng: number;
  type: 'freeway_ramp' | 'arterial_junction' | 'bridge_anchor' | 'street_corner' | 'landmark_gate';
}

export interface RoadSegment {
  u: string;
  v: string;
  name: string;
  roadClass: 'motorway' | 'trunk' | 'primary' | 'secondary' | 'bridge';
  speedLimitMph: number;
  distanceMiles: number;
}

// Enriched high-density real-world intersections covering dense city grids
export const DENSE_BAY_INTERSECTIONS: RoadIntersection[] = [
  // --- SAN FRANCISCO DOWNTOWN & SOMA GRID ---
  { id: 'sf_market_1st', name: 'Market St & 1st St', city: 'San Francisco', lat: 37.7909, lng: -122.3995, type: 'street_corner' },
  { id: 'sf_market_4th', name: 'Market St & 4th St (Powell St Station)', city: 'San Francisco', lat: 37.7858, lng: -122.4065, type: 'street_corner' },
  { id: 'sf_market_van_ness', name: 'Market St & Van Ness Ave', city: 'San Francisco', lat: 37.7753, lng: -122.4194, type: 'arterial_junction' },
  { id: 'sf_market_castro', name: 'Market St & Castro St', city: 'San Francisco', lat: 37.7627, lng: -122.4352, type: 'street_corner' },
  { id: 'sf_mission_16th', name: 'Mission St & 16th St', city: 'San Francisco', lat: 37.7651, lng: -122.4197, type: 'arterial_junction' },
  { id: 'sf_mission_24th', name: 'Mission St & 24th St', city: 'San Francisco', lat: 37.7522, lng: -122.4184, type: 'arterial_junction' },
  { id: 'sf_van_ness_geary', name: 'Van Ness Ave & Geary Blvd', city: 'San Francisco', lat: 37.7858, lng: -122.4212, type: 'arterial_junction' },
  { id: 'sf_geary_park_presidio', name: 'Geary Blvd & Park Presidio (CA-1)', city: 'San Francisco', lat: 37.7809, lng: -122.4719, type: 'arterial_junction' },
  { id: 'sf_geary_33rd', name: 'Geary Blvd & 33rd Ave (Outer Richmond)', city: 'San Francisco', lat: 37.7788, lng: -122.4934, type: 'street_corner' },
  { id: 'sf_19th_lincoln', name: '19th Ave & Lincoln Way (Golden Gate Park)', city: 'San Francisco', lat: 37.7656, lng: -122.4764, type: 'arterial_junction' },
  { id: 'sf_19th_ocean', name: '19th Ave & Ocean Ave (SFSU)', city: 'San Francisco', lat: 37.7238, lng: -122.4776, type: 'arterial_junction' },
  { id: 'sf_lombard_van_ness', name: 'Lombard St & Van Ness Ave', city: 'San Francisco', lat: 37.7998, lng: -122.4239, type: 'arterial_junction' },
  { id: 'sf_embarcadero_broadway', name: 'The Embarcadero & Broadway', city: 'San Francisco', lat: 37.7997, lng: -122.3985, type: 'arterial_junction' },
  { id: 'sf_cesar_chavez_101', name: 'Cesar Chavez & US-101 Ramps', city: 'San Francisco', lat: 37.7495, lng: -122.4048, type: 'freeway_ramp' },
  { id: 'sf_280_alemann_junction', name: 'I-280 & Alemany Blvd Split', city: 'San Francisco', lat: 37.7335, lng: -122.4278, type: 'freeway_ramp' },

  // --- PENINSULA CORRIDORS & CITIES ---
  { id: 'pen_daly_city_bart', name: 'Daly City (John Daly Blvd & I-280)', city: 'Daly City', lat: 37.7058, lng: -122.4688, type: 'freeway_ramp' },
  { id: 'pen_san_bruno_el_camino', name: 'San Bruno (El Camino & San Bruno Ave)', city: 'San Bruno', lat: 37.6302, lng: -122.4116, type: 'arterial_junction' },
  { id: 'pen_sfo_101_ramp', name: 'US-101 at SFO Airport Access Ramp', city: 'Millbrae', lat: 37.6189, lng: -122.3951, type: 'freeway_ramp' },
  { id: 'pen_burlingame_broadway', name: 'Burlingame (Broadway & El Camino)', city: 'Burlingame', lat: 37.5878, lng: -122.3644, type: 'arterial_junction' },
  { id: 'pen_san_mateo_92_101', name: 'US-101 & CA-92 Interchange', city: 'San Mateo', lat: 37.5562, lng: -122.2965, type: 'freeway_ramp' },
  { id: 'pen_san_mateo_92_280', name: 'I-280 & CA-92 Interchange', city: 'San Mateo', lat: 37.5255, lng: -122.3524, type: 'freeway_ramp' },
  { id: 'pen_redwood_city_woodside', name: 'Redwood City (CA-84 Woodside & US-101)', city: 'Redwood City', lat: 37.4912, lng: -122.2155, type: 'freeway_ramp' },
  { id: 'pen_menlo_park_sand_hill', name: 'Menlo Park (Sand Hill Rd & I-280)', city: 'Menlo Park', lat: 37.4215, lng: -122.2085, type: 'freeway_ramp' },
  { id: 'pen_palo_alto_page_mill_280', name: 'Palo Alto (Page Mill Rd & I-280)', city: 'Palo Alto', lat: 37.3875, lng: -122.1742, type: 'freeway_ramp' },
  { id: 'pen_palo_alto_embarcadero_101', name: 'Palo Alto (Embarcadero Rd & US-101)', city: 'Palo Alto', lat: 37.4475, lng: -122.1285, type: 'freeway_ramp' },
  { id: 'pen_mountain_view_shoreline_101', name: 'Mountain View (Shoreline Blvd & US-101)', city: 'Mountain View', lat: 37.4172, lng: -122.0792, type: 'freeway_ramp' },
  { id: 'pen_sunnyvale_237_101', name: 'Sunnyvale (CA-237 & US-101 Mathilda)', city: 'Sunnyvale', lat: 37.4085, lng: -122.0285, type: 'freeway_ramp' },

  // --- SILICON VALLEY & SOUTH BAY ---
  { id: 'sb_cupertino_280_de_anza', name: 'Cupertino (I-280 & De Anza Blvd)', city: 'Cupertino', lat: 37.3325, lng: -122.0325, type: 'freeway_ramp' },
  { id: 'sb_cupertino_85_280', name: 'Cupertino (CA-85 & I-280 Interchange)', city: 'Cupertino', lat: 37.3355, lng: -122.0625, type: 'freeway_ramp' },
  { id: 'sb_santa_clara_san_tomas', name: 'Santa Clara (San Tomas Expy & Central Expy)', city: 'Santa Clara', lat: 37.3755, lng: -121.9725, type: 'arterial_junction' },
  { id: 'sb_santa_clara_great_america', name: 'Santa Clara (Great America Pkwy & CA-237)', city: 'Santa Clara', lat: 37.4125, lng: -121.9785, type: 'freeway_ramp' },
  { id: 'sb_san_jose_87_280', name: 'San Jose (CA-87 & I-280 Downtown Split)', city: 'San Jose', lat: 37.3255, lng: -121.8925, type: 'freeway_ramp' },
  { id: 'sb_san_jose_101_880', name: 'San Jose (US-101 & I-880 Interchange)', city: 'San Jose', lat: 37.3685, lng: -121.9025, type: 'freeway_ramp' },
  { id: 'sb_san_jose_santa_clara_1st', name: 'San Jose Downtown (Santa Clara St & 1st St)', city: 'San Jose', lat: 37.3365, lng: -121.8905, type: 'street_corner' },
  { id: 'sb_milpitas_237_880', name: 'Milpitas (CA-237 / Calaveras & I-880)', city: 'Milpitas', lat: 37.4355, lng: -121.9125, type: 'freeway_ramp' },
  { id: 'sb_los_gatos_85_17', name: 'Los Gatos (CA-85 & CA-17 Interchange)', city: 'Los Gatos', lat: 37.2425, lng: -121.9685, type: 'freeway_ramp' },

  // --- EAST BAY CORRIDORS ---
  { id: 'eb_fremont_880_auto_mall', name: 'Fremont (I-880 & Auto Mall Pkwy / Tesla)', city: 'Fremont', lat: 37.5025, lng: -121.9725, type: 'freeway_ramp' },
  { id: 'eb_fremont_84_880', name: 'Fremont / Newark (CA-84 Decoto & I-880)', city: 'Fremont', lat: 37.5625, lng: -122.0255, type: 'freeway_ramp' },
  { id: 'eb_hayward_880_92', name: 'Hayward (I-880 & CA-92 Jackson St)', city: 'Hayward', lat: 37.6455, lng: -122.0955, type: 'freeway_ramp' },
  { id: 'eb_san_leandro_880_davis', name: 'San Leandro (I-880 & Davis St)', city: 'San Leandro', lat: 37.7225, lng: -122.1625, type: 'freeway_ramp' },
  { id: 'eb_oakland_880_hegenberger', name: 'Oakland (I-880 & Hegenberger / OAK Access)', city: 'Oakland', lat: 37.7385, lng: -122.1955, type: 'freeway_ramp' },
  { id: 'eb_oakland_880_980_split', name: 'Oakland (I-880 & I-980 Downtown Split)', city: 'Oakland', lat: 37.7985, lng: -122.2825, type: 'freeway_ramp' },
  { id: 'eb_oakland_broadway_grand', name: 'Oakland (Broadway & Grand Ave / Lake Merritt)', city: 'Oakland', lat: 37.8125, lng: -122.2645, type: 'arterial_junction' },
  { id: 'eb_emeryville_macarthur_maze', name: 'MacArthur Maze (I-80 / I-580 / I-880 Junction)', city: 'Emeryville', lat: 37.8285, lng: -122.2925, type: 'freeway_ramp' },
  { id: 'eb_berkeley_university_80', name: 'Berkeley (University Ave & I-80 Frontage)', city: 'Berkeley', lat: 37.8685, lng: -122.3025, type: 'freeway_ramp' },
  { id: 'eb_berkeley_shattuck_university', name: 'Berkeley Downtown (Shattuck & University Ave)', city: 'Berkeley', lat: 37.8715, lng: -122.2685, type: 'arterial_junction' },
  { id: 'eb_richmond_580_80_split', name: 'Richmond (I-80 & I-580 Split)', city: 'Richmond', lat: 37.9155, lng: -122.3185, type: 'freeway_ramp' },
  { id: 'eb_walnut_creek_680_24', name: 'Walnut Creek (I-680 & CA-24 Interchange)', city: 'Walnut Creek', lat: 37.9025, lng: -122.0625, type: 'freeway_ramp' },

  // --- NORTH BAY CORRIDORS ---
  { id: 'nb_sausalito_101_alexander', name: 'Sausalito (US-101 & Alexander Ave / Hawk Hill)', city: 'Sausalito', lat: 37.8385, lng: -122.4885, type: 'freeway_ramp' },
  { id: 'nb_mill_valley_101_ca1', name: 'Mill Valley (US-101 & CA-1 Shoreline)', city: 'Mill Valley', lat: 37.8855, lng: -122.5185, type: 'freeway_ramp' },
  { id: 'nb_san_rafael_101_580', name: 'San Rafael (US-101 & I-580 Bridge Approach)', city: 'San Rafael', lat: 37.9555, lng: -122.5125, type: 'freeway_ramp' },
];

/**
 * Builds an ultra-dense, authentic road network graph connecting all highway corridors,
 * expressways, bridge approaches, and downtown street grids.
 */
export function buildDenseBayAreaGraph(): BayGraph {
  const base = createBayGraph();
  const nodes = new Map<string, BayNode>(base.nodes);
  const adjacency = new Map<string, { target: string; edge: BayEdge; weight: number }[]>();

  for (const [key, val] of base.adjacency.entries()) {
    adjacency.set(key, [...val]);
  }

  const allEdges: BayEdge[] = [...base.edges];

  // Add dense intersections to graph
  for (const inter of DENSE_BAY_INTERSECTIONS) {
    if (!nodes.has(inter.id)) {
      const normX = Math.round(300 + ((inter.lng - -122.58) / (-121.8 - -122.58)) * 450);
      const normY = Math.round(850 - ((inter.lat - 37.2) / (38.15 - 37.2)) * 790);

      nodes.set(inter.id, {
        id: inter.id,
        name: inter.name,
        city: inter.city,
        region: inter.lat > 37.82 ? 'northbay' : inter.lng > -122.3 ? 'eastbay' : inter.lat < 37.45 ? 'southbay' : 'sf',
        type: inter.type === 'freeway_ramp' ? 'junction' : 'landmark',
        x: Math.max(0, Math.min(1000, normX)),
        y: Math.max(0, Math.min(1000, normY)),
        lat: inter.lat,
        lng: inter.lng,
        description: `Real City Road: ${inter.name}`,
      });
      adjacency.set(inter.id, []);
    }
  }

  // Connect dense intersections to their nearest 3 neighboring nodes within 4 miles
  for (const inter of DENSE_BAY_INTERSECTIONS) {
    const candidates: { id: string; dist: number; isHighway: boolean }[] = [];

    for (const [otherId, otherNode] of nodes.entries()) {
      if (otherId === inter.id) continue;
      const dist = haversineDistanceMiles(inter.lat, inter.lng, otherNode.lat, otherNode.lng);
      if (dist < 4.5) {
        candidates.push({
          id: otherId,
          dist,
          isHighway: inter.type === 'freeway_ramp' || otherNode.type === 'junction',
        });
      }
    }

    candidates.sort((a, b) => a.dist - b.dist);
    const topNeighbors = candidates.slice(0, 3);

    for (const neighbor of topNeighbors) {
      const speed = neighbor.isHighway ? 55 : 30;
      const edge: BayEdge = {
        u: inter.id,
        v: neighbor.id,
        distance: Math.max(0.1, Math.round(neighbor.dist * 10) / 10),
        speedLimit: speed,
        roadType: neighbor.isHighway ? 'highway' : 'arterial',
        name: `${inter.name} ↔ Road`,
      };

      const weightMinutes = (edge.distance / speed) * 60;
      allEdges.push(edge);

      if (!adjacency.has(inter.id)) adjacency.set(inter.id, []);
      if (!adjacency.has(neighbor.id)) adjacency.set(neighbor.id, []);

      adjacency.get(inter.id)!.push({ target: neighbor.id, edge, weight: weightMinutes });
      adjacency.get(neighbor.id)!.push({ target: inter.id, edge, weight: weightMinutes });
    }
  }

  return {
    nodes,
    adjacency,
    edges: allEdges,
  };
}
