/**
 * High-Density Full City Road Network Graph
 *
 * Models an authentic, comprehensive road network of San Francisco and the
 * surrounding Bay Area corridors with hundreds of real intersections,
 * avenues, boulevards, one-ways, bridges, and freeway interchanges.
 */

import type { BayGraph, BayNode, BayEdge, NodeType, RoadType, LatLngPoint } from './bayGraph';
import { haversineDistanceMiles } from './realWorldRoadGraph';
import { runPathfinding } from './pathfinding';

export type CityRoadType = RoadType | 'local';

export interface CityIntersection {
  id: string;
  name: string;
  district: string;
  lat: number;
  lng: number;
  type?: NodeType;
}

export interface CityRoadSegment {
  u: string;
  v: string;
  streetName: string;
  roadType: CityRoadType;
  speedLimit: number;
  distanceMiles: number;
  durationMinutes: number;
  oneWay?: boolean;
  path?: LatLngPoint[];
}

export interface CityRoadGraph {
  nodes: Map<string, CityIntersection>;
  edges: CityRoadSegment[];
  adjacency: Map<string, Array<{ target: string; segment: CityRoadSegment }>>;
}

let cachedCityGraph: CityRoadGraph | null = null;

/**
 * Builds the comprehensive full city road network graph.
 */
export function buildFullCityRoadGraph(): CityRoadGraph {
  if (cachedCityGraph) return cachedCityGraph;

  const nodes = new Map<string, CityIntersection>();
  const edges: CityRoadSegment[] = [];
  const adjacency = new Map<string, Array<{ target: string; segment: CityRoadSegment }>>();

  function addNode(id: string, name: string, district: string, lat: number, lng: number, type: NodeType = 'junction'): void {
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
    bidirectional = true,
    path?: LatLngPoint[]
  ): void {
    const nodeU = nodes.get(u);
    const nodeV = nodes.get(v);
    if (!nodeU || !nodeV) return;

    let dist = 0;
    if (path && path.length >= 2) {
      for (let i = 0; i < path.length - 1; i++) {
        dist += haversineDistanceMiles(path[i].lat, path[i].lng, path[i + 1].lat, path[i + 1].lng);
      }
    } else {
      dist = haversineDistanceMiles(nodeU.lat, nodeU.lng, nodeV.lat, nodeV.lng);
    }
    const distanceMiles = Math.max(0.04, Math.round(dist * 100) / 100);
    const durationMinutes = Math.round((distanceMiles / speedLimit) * 60 * 100) / 100;

    const forwardPath = path && path.length >= 2
      ? [...path]
      : [{ lat: nodeU.lat, lng: nodeU.lng }, { lat: nodeV.lat, lng: nodeV.lng }];

    const segForward: CityRoadSegment = {
      u,
      v,
      streetName,
      roadType,
      speedLimit,
      distanceMiles,
      durationMinutes,
      oneWay: !bidirectional,
      path: forwardPath,
    };
    edges.push(segForward);
    adjacency.get(u)?.push({ target: v, segment: segForward });

    if (bidirectional) {
      const backwardPath = path && path.length >= 2
        ? [...path].reverse()
        : [{ lat: nodeV.lat, lng: nodeV.lng }, { lat: nodeU.lat, lng: nodeU.lng }];

      const segBackward: CityRoadSegment = {
        u: v,
        v: u,
        streetName,
        roadType,
        speedLimit,
        distanceMiles,
        durationMinutes,
        path: backwardPath,
      };
      edges.push(segBackward);
      adjacency.get(v)?.push({ target: u, segment: segBackward });
    }
  }

  // ==========================================
  // 1. DOWNTOWN / MARKET STREET / SOMA GRID
  // ==========================================
  // Market Street Spine (Ferry Bldg to Castro)
  const marketStops = [
    { id: 'mkt_steuart', name: 'Market St & Steuart St (Ferry Bldg)', lat: 37.7942, lng: -122.3955, dist: 'Downtown' },
    { id: 'mkt_main', name: 'Market St & Main St', lat: 37.7928, lng: -122.3975, dist: 'FiDi' },
    { id: 'mkt_1st', name: 'Market St & 1st St', lat: 37.7909, lng: -122.3998, dist: 'FiDi' },
    { id: 'mkt_2nd', name: 'Market St & 2nd St (Montgomery BART)', lat: 37.7892, lng: -122.4018, dist: 'FiDi' },
    { id: 'mkt_3rd', name: 'Market St & 3rd St (Kearny St)', lat: 37.7876, lng: -122.4038, dist: 'FiDi' },
    { id: 'mkt_4th', name: 'Market St & 4th St (Powell BART)', lat: 37.7858, lng: -122.4063, dist: 'Downtown' },
    { id: 'mkt_5th', name: 'Market St & 5th St', lat: 37.7839, lng: -122.4087, dist: 'SoMa' },
    { id: 'mkt_6th', name: 'Market St & 6th St', lat: 37.7818, lng: -122.4112, dist: 'SoMa' },
    { id: 'mkt_7th', name: 'Market St & 7th St (Civic Center BART)', lat: 37.7798, lng: -122.4137, dist: 'Civic Center' },
    { id: 'mkt_8th', name: 'Market St & 8th St (Hyde St)', lat: 37.7779, lng: -122.4162, dist: 'Civic Center' },
    { id: 'mkt_9th', name: 'Market St & 9th St (Larkin St)', lat: 37.7761, lng: -122.4185, dist: 'Mid-Market' },
    { id: 'mkt_10th', name: 'Market St & 10th St (Polk St)', lat: 37.7744, lng: -122.4206, dist: 'Mid-Market' },
    { id: 'mkt_van_ness', name: 'Market St & Van Ness Ave', lat: 37.7731, lng: -122.4219, dist: 'Mid-Market' },
    { id: 'mkt_franklin', name: 'Market St & Franklin St', lat: 37.7718, lng: -122.4234, dist: 'Hayes Valley' },
    { id: 'mkt_gough', name: 'Market St & Gough St', lat: 37.7705, lng: -122.4248, dist: 'Hayes Valley' },
    { id: 'mkt_valencia', name: 'Market St & Valencia St', lat: 37.7688, lng: -122.4267, dist: 'Mission' },
    { id: 'mkt_guerrero', name: 'Market St & Guerrero St', lat: 37.7674, lng: -122.4283, dist: 'Castro' },
    { id: 'mkt_dolores', name: 'Market St & Dolores St', lat: 37.7661, lng: -122.4299, dist: 'Castro' },
    { id: 'mkt_church', name: 'Market St & Church St', lat: 37.7648, lng: -122.4315, dist: 'Castro' },
    { id: 'mkt_castro', name: 'Market St & Castro St', lat: 37.7628, lng: -122.4350, dist: 'Castro' },
    { id: 'mkt_twin_peaks', name: 'Market St & Portola Dr (Twin Peaks Pass)', lat: 37.7585, lng: -122.4415, dist: 'Twin Peaks' },
  ];

  for (let i = 0; i < marketStops.length; i++) {
    const s = marketStops[i];
    addNode(s.id, s.name, s.dist, s.lat, s.lng, 'arterial' as NodeType);
    if (i > 0) {
      addEdge(marketStops[i - 1].id, s.id, 'Market Street', 'arterial', 30);
    }
  }

  // Mission Street Spine (Parallels Market from Embarcadero to Daly City)
  const missionStops = [
    { id: 'msn_steuart', name: 'Mission St & Steuart St', lat: 37.7929, lng: -122.3932, dist: 'Downtown' },
    { id: 'msn_1st', name: 'Mission St & 1st St (Transbay Transit Center)', lat: 37.7899, lng: -122.3976, dist: 'SoMa' },
    { id: 'msn_2nd', name: 'Mission St & 2nd St', lat: 37.7882, lng: -122.3997, dist: 'SoMa' },
    { id: 'msn_3rd', name: 'Mission St & 3rd St (SFMOMA)', lat: 37.7865, lng: -122.4018, dist: 'SoMa' },
    { id: 'msn_4th', name: 'Mission St & 4th St (Metreon)', lat: 37.7848, lng: -122.4042, dist: 'SoMa' },
    { id: 'msn_5th', name: 'Mission St & 5th St', lat: 37.7829, lng: -122.4066, dist: 'SoMa' },
    { id: 'msn_6th', name: 'Mission St & 6th St', lat: 37.7809, lng: -122.4091, dist: 'SoMa' },
    { id: 'msn_7th', name: 'Mission St & 7th St', lat: 37.7788, lng: -122.4116, dist: 'SoMa' },
    { id: 'msn_8th', name: 'Mission St & 8th St', lat: 37.7769, lng: -122.4140, dist: 'SoMa' },
    { id: 'msn_9th', name: 'Mission St & 9th St', lat: 37.7751, lng: -122.4164, dist: 'SoMa' },
    { id: 'msn_10th', name: 'Mission St & 10th St', lat: 37.7733, lng: -122.4187, dist: 'SoMa' },
    { id: 'msn_14th', name: 'Mission St & 14th St', lat: 37.7682, lng: -122.4199, dist: 'Mission' },
    { id: 'msn_16th', name: 'Mission St & 16th St BART', lat: 37.7650, lng: -122.4196, dist: 'Mission' },
    { id: 'msn_18th', name: 'Mission St & 18th St', lat: 37.7618, lng: -122.4193, dist: 'Mission' },
    { id: 'msn_20th', name: 'Mission St & 20th St', lat: 37.7586, lng: -122.4190, dist: 'Mission' },
    { id: 'msn_24th', name: 'Mission St & 24th St BART', lat: 37.7522, lng: -122.4184, dist: 'Mission' },
    { id: 'msn_cesar_chavez', name: 'Mission St & Cesar Chavez St', lat: 37.7479, lng: -122.4180, dist: 'Bernal Heights' },
    { id: 'msn_silver', name: 'Mission St & Silver Ave', lat: 37.7315, lng: -122.4285, dist: 'Excelsior' },
    { id: 'msn_geneva', name: 'Mission St & Geneva Ave (Balboa Park BART)', lat: 37.7165, lng: -122.4410, dist: 'Excelsior' },
  ];

  for (let i = 0; i < missionStops.length; i++) {
    const s = missionStops[i];
    addNode(s.id, s.name, s.dist, s.lat, s.lng, 'arterial' as NodeType);
    if (i > 0) {
      addEdge(missionStops[i - 1].id, s.id, 'Mission Street', 'arterial', 25);
    }
  }

  // Cross Connectors between Market & Mission
  addEdge('mkt_steuart', 'msn_steuart', 'Steuart St', 'local', 25);
  addEdge('mkt_1st', 'msn_1st', '1st St', 'local', 25);
  addEdge('mkt_2nd', 'msn_2nd', '2nd St', 'local', 25);
  addEdge('mkt_3rd', 'msn_3rd', '3rd St', 'arterial', 30);
  addEdge('mkt_4th', 'msn_4th', '4th St', 'arterial', 30);
  addEdge('mkt_5th', 'msn_5th', '5th St', 'local', 25);
  addEdge('mkt_6th', 'msn_6th', '6th St', 'local', 25);
  addEdge('mkt_7th', 'msn_7th', '7th St', 'arterial', 30);
  addEdge('mkt_8th', 'msn_8th', '8th St', 'arterial', 30);
  addEdge('mkt_9th', 'msn_9th', '9th St', 'local', 25);
  addEdge('mkt_10th', 'msn_10th', '10th St', 'local', 25);
  addEdge('mkt_valencia', 'msn_14th', '14th St', 'local', 25);
  addEdge('mkt_valencia', 'msn_16th', '16th St', 'arterial', 30);

  // Folsom & Howard Streets (SoMa arterials)
  const folsomStops = [
    { id: 'fol_embarcadero', name: 'Folsom St & The Embarcadero', lat: 37.7905, lng: -122.3892, dist: 'South Beach' },
    { id: 'fol_1st', name: 'Folsom St & 1st St', lat: 37.7876, lng: -122.3941, dist: 'SoMa' },
    { id: 'fol_2nd', name: 'Folsom St & 2nd St', lat: 37.7859, lng: -122.3963, dist: 'SoMa' },
    { id: 'fol_3rd', name: 'Folsom St & 3rd St (Moscone Center)', lat: 37.7842, lng: -122.3985, dist: 'SoMa' },
    { id: 'fol_4th', name: 'Folsom St & 4th St', lat: 37.7824, lng: -122.4007, dist: 'SoMa' },
    { id: 'fol_5th', name: 'Folsom St & 5th St', lat: 37.7806, lng: -122.4030, dist: 'SoMa' },
    { id: 'fol_6th', name: 'Folsom St & 6th St', lat: 37.7788, lng: -122.4053, dist: 'SoMa' },
    { id: 'fol_7th', name: 'Folsom St & 7th St', lat: 37.7770, lng: -122.4075, dist: 'SoMa' },
    { id: 'fol_8th', name: 'Folsom St & 8th St', lat: 37.7751, lng: -122.4098, dist: 'SoMa' },
    { id: 'fol_9th', name: 'Folsom St & 9th St', lat: 37.7733, lng: -122.4121, dist: 'SoMa' },
    { id: 'fol_10th', name: 'Folsom St & 10th St', lat: 37.7714, lng: -122.4144, dist: 'SoMa' },
    { id: 'fol_14th', name: 'Folsom St & 14th St', lat: 37.7678, lng: -122.4153, dist: 'Mission' },
    { id: 'fol_16th', name: 'Folsom St & 16th St', lat: 37.7645, lng: -122.4150, dist: 'Mission' },
    { id: 'fol_cesar_chavez', name: 'Folsom St & Cesar Chavez St', lat: 37.7475, lng: -122.4140, dist: 'Mission' },
  ];

  for (let i = 0; i < folsomStops.length; i++) {
    const s = folsomStops[i];
    addNode(s.id, s.name, s.dist, s.lat, s.lng, 'arterial' as NodeType);
    if (i > 0) {
      addEdge(folsomStops[i - 1].id, s.id, 'Folsom Street', 'arterial', 25);
    }
  }

  // Cross SoMa Streets
  addEdge('msn_steuart', 'fol_embarcadero', 'The Embarcadero South', 'arterial', 35);
  addEdge('msn_1st', 'fol_1st', '1st St', 'local', 25);
  addEdge('msn_2nd', 'fol_2nd', '2nd St', 'local', 25);
  addEdge('msn_3rd', 'fol_3rd', '3rd St', 'arterial', 30);
  addEdge('msn_4th', 'fol_4th', '4th St', 'arterial', 30);
  addEdge('msn_5th', 'fol_5th', '5th St', 'local', 25);
  addEdge('msn_6th', 'fol_6th', '6th St', 'local', 25);
  addEdge('msn_7th', 'fol_7th', '7th St', 'arterial', 30);
  addEdge('msn_8th', 'fol_8th', '8th St', 'arterial', 30);
  addEdge('msn_9th', 'fol_9th', '9th St', 'local', 25);
  addEdge('msn_10th', 'fol_10th', '10th St', 'local', 25);
  addEdge('msn_14th', 'fol_14th', '14th St', 'local', 25);
  addEdge('msn_16th', 'fol_16th', '16th St', 'arterial', 30);
  addEdge('msn_cesar_chavez', 'fol_cesar_chavez', 'Cesar Chavez St', 'arterial', 35);

  // ==========================================
  // 2. FINANCIAL DISTRICT, NOB HILL, NORTH BEACH
  // ==========================================
  // California Street (Embarcadero to Van Ness)
  const calStops = [
    { id: 'cal_drumm', name: 'California St & Drumm St (Hyatt Regency)', lat: 37.7946, lng: -122.3965, dist: 'FiDi' },
    { id: 'cal_battery', name: 'California St & Battery St', lat: 37.7938, lng: -122.4000, dist: 'FiDi' },
    { id: 'cal_sansome', name: 'California St & Sansome St', lat: 37.7933, lng: -122.4014, dist: 'FiDi' },
    { id: 'cal_montgomery', name: 'California St & Montgomery St', lat: 37.7928, lng: -122.4032, dist: 'FiDi' },
    { id: 'cal_kearny', name: 'California St & Kearny St', lat: 37.7924, lng: -122.4048, dist: 'Chinatown' },
    { id: 'cal_grant', name: 'California St & Grant Ave (Dragon Gate)', lat: 37.7920, lng: -122.4062, dist: 'Chinatown' },
    { id: 'cal_stockton', name: 'California St & Stockton St', lat: 37.7916, lng: -122.4079, dist: 'Nob Hill' },
    { id: 'cal_powell', name: 'California St & Powell St (Cable Car Crossing)', lat: 37.7913, lng: -122.4095, dist: 'Nob Hill' },
    { id: 'cal_mason', name: 'California St & Mason St (Fairmont Hotel)', lat: 37.7909, lng: -122.4111, dist: 'Nob Hill' },
    { id: 'cal_taylor', name: 'California St & Taylor St (Grace Cathedral)', lat: 37.7905, lng: -122.4128, dist: 'Nob Hill' },
    { id: 'cal_jones', name: 'California St & Jones St', lat: 37.7901, lng: -122.4145, dist: 'Nob Hill' },
    { id: 'cal_larkin', name: 'California St & Larkin St', lat: 37.7892, lng: -122.4188, dist: 'Nob Hill' },
    { id: 'cal_polk', name: 'California St & Polk St', lat: 37.7888, lng: -122.4206, dist: 'Polk Gulch' },
    { id: 'cal_van_ness', name: 'California St & Van Ness Ave', lat: 37.7884, lng: -122.4225, dist: 'Van Ness' },
    { id: 'cal_franklin', name: 'California St & Franklin St', lat: 37.7881, lng: -122.4243, dist: 'Pacific Heights' },
    { id: 'cal_fillmore', name: 'California St & Fillmore St', lat: 37.7872, lng: -122.4342, dist: 'Pacific Heights' },
    { id: 'cal_divisadero', name: 'California St & Divisadero St', lat: 37.7865, lng: -122.4402, dist: 'Pacific Heights' },
    { id: 'cal_presidio', name: 'California St & Presidio Ave', lat: 37.7858, lng: -122.4475, dist: 'Presidio Hts' },
    { id: 'cal_arguello', name: 'California St & Arguello Blvd', lat: 37.7852, lng: -122.4590, dist: 'Richmond' },
    { id: 'cal_park_presidio', name: 'California St & Park Presidio Blvd', lat: 37.7845, lng: -122.4735, dist: 'Richmond' },
    { id: 'cal_32nd', name: 'California St & 32nd Ave (Lincoln Park)', lat: 37.7838, lng: -122.4935, dist: 'Sea Cliff' },
  ];

  for (let i = 0; i < calStops.length; i++) {
    const s = calStops[i];
    addNode(s.id, s.name, s.dist, s.lat, s.lng, 'arterial' as NodeType);
    if (i > 0) {
      addEdge(calStops[i - 1].id, s.id, 'California Street', 'arterial', 25);
    }
  }

  // Geary Boulevard (Union Square all the way to Ocean Beach)
  const gearyStops = [
    { id: 'gry_kearny', name: 'Geary St & Kearny St', lat: 37.7880, lng: -122.4040, dist: 'FiDi' },
    { id: 'gry_stockton', name: 'Geary St & Stockton St (Union Square)', lat: 37.7873, lng: -122.4068, dist: 'Downtown' },
    { id: 'gry_powell', name: 'Geary St & Powell St', lat: 37.7870, lng: -122.4082, dist: 'Downtown' },
    { id: 'gry_taylor', name: 'Geary St & Taylor St (Theater District)', lat: 37.7862, lng: -122.4116, dist: 'Tenderloin' },
    { id: 'gry_larkin', name: 'Geary St & Larkin St', lat: 37.7850, lng: -122.4178, dist: 'Little Saigon' },
    { id: 'gry_van_ness', name: 'Geary Blvd & Van Ness Ave', lat: 37.7842, lng: -122.4218, dist: 'Van Ness' },
    { id: 'gry_franklin', name: 'Geary Blvd & Franklin St', lat: 37.7839, lng: -122.4236, dist: 'Cathedral Hill' },
    { id: 'gry_fillmore', name: 'Geary Blvd & Fillmore St (Japantown)', lat: 37.7830, lng: -122.4338, dist: 'Western Addition' },
    { id: 'gry_divisadero', name: 'Geary Blvd & Divisadero St', lat: 37.7824, lng: -122.4400, dist: 'Western Addition' },
    { id: 'gry_masonic', name: 'Geary Blvd & Masonic Ave', lat: 37.7818, lng: -122.4462, dist: 'Richmond' },
    { id: 'gry_arguello', name: 'Geary Blvd & Arguello Blvd', lat: 37.7812, lng: -122.4588, dist: 'Inner Richmond' },
    { id: 'gry_6th', name: 'Geary Blvd & 6th Ave', lat: 37.7808, lng: -122.4645, dist: 'Richmond' },
    { id: 'gry_park_presidio', name: 'Geary Blvd & Park Presidio Blvd (CA-1)', lat: 37.7804, lng: -122.4732, dist: 'Central Richmond' },
    { id: 'gry_25th', name: 'Geary Blvd & 25th Ave', lat: 37.7797, lng: -122.4845, dist: 'Outer Richmond' },
    { id: 'gry_33rd', name: 'Geary Blvd & 33rd Ave', lat: 37.7792, lng: -122.4935, dist: 'Outer Richmond' },
    { id: 'gry_ocean_beach', name: 'Geary Blvd & Great Highway (Cliff House / Ocean Beach)', lat: 37.7785, lng: -122.5135, dist: 'Ocean Beach' },
  ];

  for (let i = 0; i < gearyStops.length; i++) {
    const s = gearyStops[i];
    addNode(s.id, s.name, s.dist, s.lat, s.lng, 'arterial' as NodeType);
    if (i > 0) {
      addEdge(gearyStops[i - 1].id, s.id, 'Geary Boulevard', 'arterial', 35);
    }
  }

  // Cross streets connecting California and Geary
  addEdge('cal_kearny', 'gry_kearny', 'Kearny St', 'local', 25);
  addEdge('cal_stockton', 'gry_stockton', 'Stockton St', 'local', 25);
  addEdge('cal_powell', 'gry_powell', 'Powell St', 'local', 20);
  addEdge('cal_taylor', 'gry_taylor', 'Taylor St', 'local', 25);
  addEdge('cal_larkin', 'gry_larkin', 'Larkin St', 'local', 25);
  addEdge('cal_van_ness', 'gry_van_ness', 'Van Ness Ave (US-101)', 'arterial', 35);
  addEdge('cal_franklin', 'gry_franklin', 'Franklin St', 'arterial', 30);
  addEdge('cal_fillmore', 'gry_fillmore', 'Fillmore St', 'arterial', 30);
  addEdge('cal_divisadero', 'gry_divisadero', 'Divisadero St', 'arterial', 30);
  addEdge('cal_arguello', 'gry_arguello', 'Arguello Blvd', 'arterial', 30);
  addEdge('cal_park_presidio', 'gry_park_presidio', 'Park Presidio Blvd (CA-1)', 'highway', 45);

  // Connect Geary to Market
  addEdge('gry_kearny', 'mkt_3rd', 'Kearny St to Market', 'arterial', 25);
  addEdge('gry_stockton', 'mkt_4th', '4th St Corridor', 'arterial', 30);
  addEdge('gry_powell', 'mkt_4th', 'Powell St Cable Car Walk', 'local', 20);
  addEdge('gry_taylor', 'mkt_6th', 'Taylor to 6th', 'local', 25);
  addEdge('gry_larkin', 'mkt_9th', 'Larkin St Corridor', 'arterial', 25);
  addEdge('gry_van_ness', 'mkt_van_ness', 'Van Ness Ave (US-101)', 'arterial', 35);

  // ==========================================
  // 3. NORTH BEACH, MARINA & THE WATERFRONT
  // ==========================================
  // The Embarcadero Waterfront Promenade
  const embStops = [
    { id: 'emb_fisherman', name: 'The Embarcadero & Pier 39 (Fisherman’s Wharf)', lat: 37.8085, lng: -122.4105, dist: 'North Beach' },
    { id: 'emb_bay', name: 'The Embarcadero & Bay St', lat: 37.8055, lng: -122.4045, dist: 'North Beach' },
    { id: 'emb_broadway', name: 'The Embarcadero & Broadway', lat: 37.7995, lng: -122.3980, dist: 'North Beach' },
    { id: 'emb_ferry', name: 'The Embarcadero & Ferry Building Plaza', lat: 37.7955, lng: -122.3937, dist: 'Downtown' },
    { id: 'emb_folsom', name: 'The Embarcadero & Folsom St', lat: 37.7905, lng: -122.3892, dist: 'South Beach' },
    { id: 'emb_bryant', name: 'The Embarcadero & Bryant St (Pier 30)', lat: 37.7850, lng: -122.3875, dist: 'South Beach' },
    { id: 'emb_king', name: 'The Embarcadero & King St (Oracle Park)', lat: 37.7786, lng: -122.3892, dist: 'Mission Bay' },
  ];

  for (let i = 0; i < embStops.length; i++) {
    const s = embStops[i];
    addNode(s.id, s.name, s.dist, s.lat, s.lng, 'arterial' as NodeType);
    if (i > 0) {
      addEdge(embStops[i - 1].id, s.id, 'The Embarcadero', 'arterial', 35);
    }
  }

  // Connect Market Steuart to Ferry Plaza
  addEdge('mkt_steuart', 'emb_ferry', 'Market St Portal to Ferry Bldg', 'arterial', 25);
  addEdge('fol_embarcadero', 'emb_folsom', 'Folsom Promenade Link', 'arterial', 30);

  // Columbus Avenue Diagonal (FiDi through Chinatown & North Beach to Fisherman’s Wharf)
  const colStops = [
    { id: 'col_montgomery', name: 'Columbus Ave & Montgomery St (Transamerica Pyramid)', lat: 37.7968, lng: -122.4035, dist: 'FiDi' },
    { id: 'col_broadway', name: 'Columbus Ave & Broadway (City Lights Books)', lat: 37.7981, lng: -122.4062, dist: 'North Beach' },
    { id: 'col_union', name: 'Columbus Ave & Union St (Washington Square Park)', lat: 37.8005, lng: -122.4095, dist: 'North Beach' },
    { id: 'col_lombard', name: 'Columbus Ave & Lombard St', lat: 37.8028, lng: -122.4128, dist: 'Russian Hill' },
    { id: 'col_bay', name: 'Columbus Ave & Bay St', lat: 37.8052, lng: -122.4158, dist: 'Fisherman’s Wharf' },
  ];

  for (let i = 0; i < colStops.length; i++) {
    const s = colStops[i];
    addNode(s.id, s.name, s.dist, s.lat, s.lng, 'arterial' as NodeType);
    if (i > 0) {
      addEdge(colStops[i - 1].id, s.id, 'Columbus Avenue', 'arterial', 30);
    }
  }

  addEdge('cal_montgomery', 'col_montgomery', 'Montgomery St', 'arterial', 25);
  addEdge('emb_broadway', 'col_broadway', 'Broadway Corridor', 'arterial', 30);
  addEdge('emb_bay', 'col_bay', 'Bay Street', 'arterial', 30);
  addEdge('col_bay', 'emb_fisherman', 'Beach Street Pier Access', 'arterial', 25);

  // Lombard Street & Marina Blvd (Presidio to North Beach)
  const lmbStops = [
    { id: 'lmb_columbus', name: 'Lombard St & Columbus Ave', lat: 37.8028, lng: -122.4128, dist: 'North Beach' },
    { id: 'lmb_hyde', name: 'Lombard St & Hyde St (Crooked Street)', lat: 37.8021, lng: -122.4187, dist: 'Russian Hill' },
    { id: 'lmb_van_ness', name: 'Lombard St & Van Ness Ave (US-101 Northbound)', lat: 37.8010, lng: -122.4238, dist: 'Marina' },
    { id: 'lmb_fillmore', name: 'Lombard St & Fillmore St', lat: 37.8000, lng: -122.4355, dist: 'Marina' },
    { id: 'lmb_divisadero', name: 'Lombard St & Divisadero St', lat: 37.7995, lng: -122.4418, dist: 'Marina' },
    { id: 'lmb_presidio_gate', name: 'Lombard St & Richardson Ave (Presidio Gate / Palace of Fine Arts)', lat: 37.7990, lng: -122.4485, dist: 'Marina' },
  ];

  for (let i = 0; i < lmbStops.length; i++) {
    const s = lmbStops[i];
    addNode(s.id, s.name, s.dist, s.lat, s.lng, 'arterial' as NodeType);
    if (i > 0) {
      addEdge(lmbStops[i - 1].id, s.id, 'Lombard Street (US-101)', 'arterial', 35);
    }
  }

  // Van Ness Avenue (US-101) North-South Backbone
  addEdge('emb_bay', 'lmb_van_ness', 'Van Ness Bay Approach', 'arterial', 35);
  addEdge('lmb_van_ness', 'cal_van_ness', 'Van Ness Ave', 'arterial', 35);
  addEdge('cal_van_ness', 'gry_van_ness', 'Van Ness Ave', 'arterial', 35);
  addEdge('gry_van_ness', 'mkt_van_ness', 'Van Ness Ave', 'arterial', 35);

  // ==========================================
  // 4. GOLDEN GATE BRIDGE & MARIN ACCESS
  // ==========================================
  const ggbStops = [
    { id: 'ggb_toll_plaza', name: 'Golden Gate Bridge South Toll Plaza (Presidio)', lat: 37.8075, lng: -122.4750, dist: 'Presidio' },
    { id: 'ggb_south_tower', name: 'Golden Gate Bridge South Tower', lat: 37.8180, lng: -122.4785, dist: 'Golden Gate' },
    { id: 'ggb_midspan', name: 'Golden Gate Bridge Mid-Span', lat: 37.8220, lng: -122.4795, dist: 'Golden Gate' },
    { id: 'ggb_north_tower', name: 'Golden Gate Bridge North Tower', lat: 37.8260, lng: -122.4805, dist: 'Golden Gate' },
    { id: 'ggb_vista_point', name: 'Golden Gate Bridge Vista Point (Marin Headlands)', lat: 37.8325, lng: -122.4795, dist: 'Marin' },
  ];

  for (const s of ggbStops) {
    addNode(s.id, s.name, s.dist, s.lat, s.lng, 'bridge' as NodeType);
  }

  addEdge('ggb_toll_plaza', 'ggb_south_tower', 'Golden Gate Bridge (US-101)', 'bridge', 50, true, [
    { lat: 37.8075, lng: -122.4750 },
    { lat: 37.8125, lng: -122.4768 },
    { lat: 37.8180, lng: -122.4785 },
  ]);
  addEdge('ggb_south_tower', 'ggb_midspan', 'Golden Gate Bridge (US-101)', 'bridge', 50, true, [
    { lat: 37.8180, lng: -122.4785 },
    { lat: 37.8200, lng: -122.4790 },
    { lat: 37.8220, lng: -122.4795 },
  ]);
  addEdge('ggb_midspan', 'ggb_north_tower', 'Golden Gate Bridge (US-101)', 'bridge', 50, true, [
    { lat: 37.8220, lng: -122.4795 },
    { lat: 37.8240, lng: -122.4800 },
    { lat: 37.8260, lng: -122.4805 },
  ]);
  addEdge('ggb_north_tower', 'ggb_vista_point', 'Golden Gate Bridge (US-101)', 'bridge', 50, true, [
    { lat: 37.8260, lng: -122.4805 },
    { lat: 37.8290, lng: -122.4802 },
    { lat: 37.8325, lng: -122.4795 },
  ]);

  // Connect Lombard / Richardson Ave to Golden Gate Bridge with Presidio Parkway curve
  addEdge('lmb_presidio_gate', 'ggb_toll_plaza', 'Doyle Drive / Presidio Parkway (US-101)', 'highway', 55, true, [
    { lat: 37.7995, lng: -122.4490 },
    { lat: 37.8020, lng: -122.4580 },
    { lat: 37.8045, lng: -122.4670 },
    { lat: 37.8075, lng: -122.4750 },
  ]);

  // Connect Park Presidio Blvd (CA-1) through MacArthur Tunnel to Golden Gate Bridge
  addEdge('cal_park_presidio', 'ggb_toll_plaza', 'Veterans Blvd (CA-1)', 'highway', 50, true, [
    { lat: 37.7845, lng: -122.4725 },
    { lat: 37.7940, lng: -122.4715 },
    { lat: 37.8020, lng: -122.4720 },
    { lat: 37.8075, lng: -122.4750 },
  ]);

  // Continue US-101 North into Marin County
  addNode('marin_sausalito', 'US-101 & Sausalito Lateral (Alexander Ave)', 'Sausalito', 37.8480, -122.4950, 'highway' as NodeType);
  addNode('marin_mill_valley', 'US-101 & CA-1 (Mill Valley / Stinson Beach)', 'Mill Valley', 37.8860, -122.5220, 'highway' as NodeType);
  addNode('marin_san_rafael', 'US-101 & I-580 Interchange (San Rafael Downtown)', 'San Rafael', 37.9735, -122.5311, 'highway' as NodeType);

  addEdge('ggb_vista_point', 'marin_sausalito', 'US-101 Northbound (Waldo Grade / Rainbow Tunnel)', 'highway', 65, true, [
    { lat: 37.8325, lng: -122.4795 },
    { lat: 37.8375, lng: -122.4840 },
    { lat: 37.8425, lng: -122.4900 },
    { lat: 37.8480, lng: -122.4950 },
  ]);
  addEdge('marin_sausalito', 'marin_mill_valley', 'US-101 Northbound', 'highway', 65, true, [
    { lat: 37.8480, lng: -122.4950 },
    { lat: 37.8620, lng: -122.5080 },
    { lat: 37.8750, lng: -122.5160 },
    { lat: 37.8860, lng: -122.5220 },
  ]);
  addEdge('marin_mill_valley', 'marin_san_rafael', 'US-101 Northbound (Marin Corridor)', 'highway', 65, true, [
    { lat: 37.8860, lng: -122.5220 },
    { lat: 37.9150, lng: -122.5260 },
    { lat: 37.9450, lng: -122.5290 },
    { lat: 37.9735, lng: -122.5311 },
  ]);

  // ==========================================
  // 5. SUNSET DISTRICT, GOLDEN GATE PARK & OCEAN BEACH
  // ==========================================
  // Sunset Blvd & 19th Ave North-South Corridors
  const oceanStops = [
    { id: 'ocn_fulton', name: 'Great Highway & Fulton St (Ocean Beach North)', lat: 37.7715, lng: -122.5110, dist: 'Ocean Beach' },
    { id: 'ocn_judah', name: 'Great Highway & Judah St', lat: 37.7615, lng: -122.5095, dist: 'Outer Sunset' },
    { id: 'ocn_taraval', name: 'Great Highway & Taraval St', lat: 37.7425, lng: -122.5075, dist: 'Outer Sunset' },
    { id: 'ocn_sloat', name: 'Great Highway & Sloat Blvd (SF Zoo)', lat: 37.7345, lng: -122.5060, dist: 'Lakeshore' },
  ];

  for (let i = 0; i < oceanStops.length; i++) {
    const s = oceanStops[i];
    addNode(s.id, s.name, s.dist, s.lat, s.lng, 'arterial' as NodeType);
    if (i > 0) {
      addEdge(oceanStops[i - 1].id, s.id, 'Great Highway', 'arterial', 35);
    }
  }

  addEdge('gry_ocean_beach', 'ocn_fulton', 'Great Highway Cliffside', 'arterial', 35);

  // 19th Avenue (CA-1 Southbound spine through Sunset to Daly City)
  const ave19Stops = [
    { id: 'ave19_lincoln', name: '19th Ave & Lincoln Way (Golden Gate Park South)', lat: 37.7660, lng: -122.4760, dist: 'Sunset' },
    { id: 'ave19_judah', name: '19th Ave & Judah St', lat: 37.7618, lng: -122.4758, dist: 'Sunset' },
    { id: 'ave19_taraval', name: '19th Ave & Taraval St', lat: 37.7428, lng: -122.4752, dist: 'Sunset' },
    { id: 'ave19_sloat', name: '19th Ave & Sloat Blvd (Stern Grove)', lat: 37.7348, lng: -122.4750, dist: 'Sunset' },
    { id: 'ave19_holloway', name: '19th Ave & Holloway Ave (SF State University)', lat: 37.7215, lng: -122.4770, dist: 'Parkmerced' },
    { id: 'daly_city_junc', name: 'I-280 & CA-1 Interchange (Daly City)', lat: 37.7015, lng: -122.4680, dist: 'Daly City' },
  ];

  for (let i = 0; i < ave19Stops.length; i++) {
    const s = ave19Stops[i];
    addNode(s.id, s.name, s.dist, s.lat, s.lng, 'arterial' as NodeType);
    if (i > 0) {
      addEdge(ave19Stops[i - 1].id, s.id, '19th Avenue (CA-1)', 'arterial', 35);
    }
  }

  // Cross Sunset Connectors
  addEdge('gry_park_presidio', 'ave19_lincoln', 'Park Presidio Bypass (Crossover Dr through Golden Gate Park)', 'arterial', 35);
  addEdge('ave19_judah', 'ocn_judah', 'Judah Street', 'local', 25);
  addEdge('ave19_taraval', 'ocn_taraval', 'Taraval Street', 'local', 25);
  addEdge('ave19_sloat', 'ocn_sloat', 'Sloat Boulevard', 'arterial', 35);

  // Twin Peaks & Portola Connector
  addNode('twin_peaks_summit', 'Twin Peaks Summit (Twin Peaks Blvd)', 'Twin Peaks', 37.7545, -122.4465, 'landmark' as NodeType);
  addEdge('mkt_twin_peaks', 'twin_peaks_summit', 'Twin Peaks Blvd', 'local', 25);
  addEdge('twin_peaks_summit', 'ave19_sloat', 'Portola Dr to Sloat Blvd', 'arterial', 35);

  // ==========================================
  // 6. SAN FRANCISCO–OAKLAND BAY BRIDGE (I-80)
  // ==========================================
  const bayBridgeStops = [
    { id: 'bb_fremont_ramp', name: 'I-80 Eastbound On-Ramp (Fremont St & Harrison St)', lat: 37.7885, lng: -122.3920, dist: 'SoMa' },
    { id: 'bb_anchorage', name: 'Bay Bridge West Anchorage', lat: 37.7930, lng: -122.3830, dist: 'San Francisco Bay' },
    { id: 'bb_yerba_buena', name: 'Yerba Buena Island / Treasure Island Tunnel', lat: 37.8100, lng: -122.3650, dist: 'Yerba Buena' },
    { id: 'bb_east_span', name: 'Bay Bridge New Self-Anchored Suspension Span', lat: 37.8180, lng: -122.3380, dist: 'San Francisco Bay' },
    { id: 'bb_toll_plaza', name: 'Bay Bridge Toll Plaza (Oakland Gateway)', lat: 37.8240, lng: -122.3120, dist: 'Oakland' },
    { id: 'oak_macarthur_maze', name: 'MacArthur Maze Interchange (I-80 / I-580 / I-880)', lat: 37.8280, lng: -122.2920, dist: 'Emeryville' },
  ];

  for (const s of bayBridgeStops) {
    addNode(s.id, s.name, s.dist, s.lat, s.lng, 'bridge' as NodeType);
  }

  // Realistic S-Curve geometry across the Bay Bridge
  addEdge('bb_fremont_ramp', 'bb_anchorage', 'Bay Bridge SF Approach', 'bridge', 50, true, [
    { lat: 37.7885, lng: -122.3920 },
    { lat: 37.7905, lng: -122.3880 },
    { lat: 37.7930, lng: -122.3830 },
  ]);
  addEdge('bb_anchorage', 'bb_yerba_buena', 'Bay Bridge Western Suspension Span', 'bridge', 50, true, [
    { lat: 37.7930, lng: -122.3830 },
    { lat: 37.7960, lng: -122.3785 },
    { lat: 37.8015, lng: -122.3720 },
    { lat: 37.8065, lng: -122.3670 },
    { lat: 37.8100, lng: -122.3650 },
  ]);
  addEdge('bb_yerba_buena', 'bb_east_span', 'Bay Bridge Eastern Span', 'bridge', 50, true, [
    { lat: 37.8100, lng: -122.3650 },
    { lat: 37.8130, lng: -122.3550 },
    { lat: 37.8155, lng: -122.3460 },
    { lat: 37.8180, lng: -122.3380 },
  ]);
  addEdge('bb_east_span', 'bb_toll_plaza', 'Bay Bridge Oakland Skyway', 'bridge', 50, true, [
    { lat: 37.8180, lng: -122.3380 },
    { lat: 37.8205, lng: -122.3270 },
    { lat: 37.8225, lng: -122.3180 },
    { lat: 37.8240, lng: -122.3120 },
  ]);
  addEdge('bb_toll_plaza', 'oak_macarthur_maze', 'I-80 Toll Plaza to MacArthur Maze', 'highway', 60, true, [
    { lat: 37.8240, lng: -122.3120 },
    { lat: 37.8260, lng: -122.3020 },
    { lat: 37.8280, lng: -122.2920 },
  ]);

  // Connect SoMa / FiDi to Bay Bridge Ramp
  addEdge('fol_1st', 'bb_fremont_ramp', 'Harrison St Bridge Approach', 'arterial', 30);
  addEdge('emb_folsom', 'bb_fremont_ramp', 'Folsom to Fremont Ramp', 'arterial', 30);

  // ==========================================
  // 7. EAST BAY HIGHWAY SYSTEM (OAKLAND & BERKELEY)
  // ==========================================
  const eastBayStops = [
    { id: 'emeryville_powell', name: 'I-80 & Powell St (Emeryville / Bay Street)', lat: 37.8385, lng: -122.2950, dist: 'Emeryville' },
    { id: 'berkeley_university', name: 'I-80 & University Ave (Berkeley Marina Exit)', lat: 37.8685, lng: -122.3040, dist: 'Berkeley' },
    { id: 'berkeley_campus', name: 'University Ave & Oxford St (UC Berkeley Sather Tower / Campanile)', lat: 37.8719, lng: -122.2585, dist: 'Berkeley' },
    { id: 'oak_downtown', name: 'Oakland City Center (Broadway & 14th St BART)', lat: 37.8044, lng: -122.2712, dist: 'Oakland' },
    { id: 'oak_grand_ave', name: 'Grand Ave & Harrison St (Lake Merritt)', lat: 37.8095, lng: -122.2610, dist: 'Oakland' },
    { id: 'oak_airport', name: 'Oakland International Airport (OAK)', lat: 37.7126, lng: -122.2197, dist: 'Oakland' },
    { id: 'richmond_downtown', name: 'Richmond Downtown & I-580 / BART', lat: 37.9355, lng: -122.3530, dist: 'Richmond' },
    { id: 'walnut_creek_downtown', name: 'Walnut Creek Downtown (CA-24 / I-680)', lat: 37.9063, lng: -122.0645, dist: 'Walnut Creek' },
  ];

  for (const s of eastBayStops) {
    addNode(s.id, s.name, s.dist, s.lat, s.lng, 'city' as NodeType);
  }

  addEdge('oak_macarthur_maze', 'emeryville_powell', 'I-80 Eastbound (Eastshore Fwy)', 'highway', 65, true, [
    { lat: 37.8280, lng: -122.2920 },
    { lat: 37.8340, lng: -122.2940 },
    { lat: 37.8385, lng: -122.2950 },
  ]);
  addEdge('emeryville_powell', 'berkeley_university', 'I-80 Eastbound', 'highway', 65, true, [
    { lat: 37.8385, lng: -122.2950 },
    { lat: 37.8520, lng: -122.3000 },
    { lat: 37.8685, lng: -122.3040 },
  ]);
  addEdge('berkeley_university', 'berkeley_campus', 'University Avenue Corridor', 'arterial', 35, true, [
    { lat: 37.8685, lng: -122.3040 },
    { lat: 37.8698, lng: -122.2850 },
    { lat: 37.8710, lng: -122.2700 },
    { lat: 37.8719, lng: -122.2585 },
  ]);

  addEdge('oak_macarthur_maze', 'oak_downtown', 'I-980 Southbound into Downtown Oakland', 'highway', 65, true, [
    { lat: 37.8280, lng: -122.2920 },
    { lat: 37.8160, lng: -122.2820 },
    { lat: 37.8044, lng: -122.2712 },
  ]);
  addEdge('oak_downtown', 'oak_grand_ave', 'Grand Avenue Waterfront', 'arterial', 30);
  addEdge('oak_downtown', 'oak_airport', 'I-880 Southbound (Nimitz Fwy)', 'highway', 65, true, [
    { lat: 37.8044, lng: -122.2712 },
    { lat: 37.7780, lng: -122.2450 },
    { lat: 37.7450, lng: -122.2280 },
    { lat: 37.7126, lng: -122.2197 },
  ]);

  // CA-24 Eastbound through Caldecott Tunnel to Walnut Creek
  addEdge('oak_macarthur_maze', 'walnut_creek_downtown', 'CA-24 East (Caldecott Tunnel to Walnut Creek)', 'highway', 65, true, [
    { lat: 37.8280, lng: -122.2920 },
    { lat: 37.8450, lng: -122.2520 },
    { lat: 37.8600, lng: -122.2220 },
    { lat: 37.8820, lng: -122.1550 },
    { lat: 37.9063, lng: -122.0645 },
  ]);

  // Richmond–San Rafael Bridge (I-580)
  addEdge('marin_san_rafael', 'richmond_downtown', 'Richmond–San Rafael Bridge (I-580)', 'bridge', 55, true, [
    { lat: 37.9735, lng: -122.5311 },
    { lat: 37.9480, lng: -122.4920 },
    { lat: 37.9350, lng: -122.4580 },
    { lat: 37.9320, lng: -122.4220 },
    { lat: 37.9270, lng: -122.3880 },
    { lat: 37.9355, lng: -122.3530 },
  ]);
  addEdge('richmond_downtown', 'berkeley_university', 'I-80 / I-580 Southbound', 'highway', 65, true, [
    { lat: 37.9355, lng: -122.3530 },
    { lat: 37.9050, lng: -122.3250 },
    { lat: 37.8685, lng: -122.3040 },
  ]);

  // ==========================================
  // 8. PENINSULA & SOUTH BAY (US-101 & I-280)
  // ==========================================
  const peninsulaStops = [
    { id: 'sfo_airport', name: 'San Francisco International Airport (SFO Terminals)', lat: 37.6213, lng: -122.3790, dist: 'San Bruno' },
    { id: 'san_mateo_downtown', name: 'San Mateo Downtown & 3rd Ave', lat: 37.5630, lng: -122.3255, dist: 'San Mateo' },
    { id: 'san_mateo_bridge_west', name: 'CA-92 & San Mateo Bridge West Plaza', lat: 37.5580, lng: -122.2720, dist: 'San Mateo' },
    { id: 'redwood_city', name: 'Redwood City Courthouse Square', lat: 37.4852, lng: -122.2364, dist: 'Redwood City' },
    { id: 'palo_alto_stanford', name: 'Stanford University (Palm Drive & Main Quad)', lat: 37.4275, lng: -122.1697, dist: 'Stanford' },
    { id: 'dumbarton_bridge_west', name: 'CA-84 & Dumbarton Bridge West (EPA)', lat: 37.4820, lng: -122.1490, dist: 'Menlo Park' },
    { id: 'fremont_downtown', name: 'Fremont Central & Paseo Padre', lat: 37.5485, lng: -121.9886, dist: 'Fremont' },
    { id: 'mountain_view_google', name: 'Mountain View (Googleplex / Shoreline)', lat: 37.4220, lng: -122.0841, dist: 'Mountain View' },
    { id: 'i280_crystal_springs', name: 'I-280 & CA-92 (Crystal Springs Reservoirs)', lat: 37.5260, lng: -122.3480, dist: 'Hillsborough' },
    { id: 'i280_sand_hill', name: 'I-280 & Sand Hill Road (Stanford SLAC)', lat: 37.4180, lng: -122.2060, dist: 'Menlo Park' },
    { id: 'i280_apple_park', name: 'I-280 & Wolfe Rd (Apple Park Cupertino)', lat: 37.3340, lng: -122.0080, dist: 'Cupertino' },
    { id: 'san_jose_downtown', name: 'San Jose City Hall & Santa Clara St', lat: 37.3382, lng: -121.8863, dist: 'San Jose' },
  ];

  for (const s of peninsulaStops) {
    addNode(s.id, s.name, s.dist, s.lat, s.lng, 'city' as NodeType);
  }

  // Connect San Francisco to Peninsula via US-101 Bayshore Freeway with true shoreline curvature
  addEdge('msn_cesar_chavez', 'sfo_airport', 'US-101 Southbound (Bayshore Fwy)', 'highway', 65, true, [
    { lat: 37.7485, lng: -122.4060 },
    { lat: 37.7120, lng: -122.3980 },
    { lat: 37.6750, lng: -122.3920 },
    { lat: 37.6420, lng: -122.3850 },
    { lat: 37.6213, lng: -122.3790 },
  ]);
  addEdge('sfo_airport', 'san_mateo_downtown', 'US-101 Southbound', 'highway', 65, true, [
    { lat: 37.6213, lng: -122.3790 },
    { lat: 37.5980, lng: -122.3610 },
    { lat: 37.5800, lng: -122.3420 },
    { lat: 37.5630, lng: -122.3255 },
  ]);
  addEdge('san_mateo_downtown', 'san_mateo_bridge_west', 'CA-92 Eastbound', 'highway', 65);
  addEdge('san_mateo_downtown', 'redwood_city', 'US-101 Southbound (Bayshore Fwy)', 'highway', 65, true, [
    { lat: 37.5630, lng: -122.3255 },
    { lat: 37.5340, lng: -122.2920 },
    { lat: 37.5080, lng: -122.2580 },
    { lat: 37.4852, lng: -122.2364 },
  ]);
  addEdge('redwood_city', 'palo_alto_stanford', 'El Camino Real & University Ave', 'arterial', 35, true, [
    { lat: 37.4852, lng: -122.2364 },
    { lat: 37.4620, lng: -122.2050 },
    { lat: 37.4420, lng: -122.1820 },
    { lat: 37.4275, lng: -122.1697 },
  ]);
  addEdge('palo_alto_stanford', 'mountain_view_google', 'US-101 Southbound', 'highway', 65, true, [
    { lat: 37.4275, lng: -122.1697 },
    { lat: 37.4280, lng: -122.1380 },
    { lat: 37.4250, lng: -122.1050 },
    { lat: 37.4220, lng: -122.0841 },
  ]);
  addEdge('mountain_view_google', 'san_jose_downtown', 'US-101 Southbound (Silicon Valley Express)', 'highway', 65, true, [
    { lat: 37.4220, lng: -122.0841 },
    { lat: 37.4020, lng: -122.0320 },
    { lat: 37.3780, lng: -121.9750 },
    { lat: 37.3520, lng: -121.9220 },
    { lat: 37.3382, lng: -121.8863 },
  ]);

  // I-280 Junipero Serra Freeway Corridor through the hills
  addEdge('daly_city_junc', 'i280_crystal_springs', 'I-280 Southbound (Junipero Serra Fwy)', 'highway', 70, true, [
    { lat: 37.7015, lng: -122.4680 },
    { lat: 37.6450, lng: -122.4420 },
    { lat: 37.5850, lng: -122.3920 },
    { lat: 37.5260, lng: -122.3480 },
  ]);
  addEdge('i280_crystal_springs', 'i280_sand_hill', 'I-280 Southbound (Crystal Springs Reservoirs)', 'highway', 70, true, [
    { lat: 37.5260, lng: -122.3480 },
    { lat: 37.4780, lng: -122.2850 },
    { lat: 37.4420, lng: -122.2420 },
    { lat: 37.4180, lng: -122.2060 },
  ]);
  addEdge('i280_sand_hill', 'i280_apple_park', 'I-280 Southbound (Foothills Express)', 'highway', 70, true, [
    { lat: 37.4180, lng: -122.2060 },
    { lat: 37.3850, lng: -122.1420 },
    { lat: 37.3520, lng: -122.0680 },
    { lat: 37.3340, lng: -122.0080 },
  ]);
  addEdge('i280_apple_park', 'san_jose_downtown', 'I-280 South into Downtown San Jose', 'highway', 70, true, [
    { lat: 37.3340, lng: -122.0080 },
    { lat: 37.3310, lng: -121.9480 },
    { lat: 37.3382, lng: -121.8863 },
  ]);

  // Connect I-280 into Peninsula Cities
  addEdge('daly_city_junc', 'sfo_airport', 'I-280 to I-380 Connector', 'highway', 65);
  addEdge('i280_crystal_springs', 'san_mateo_bridge_west', 'CA-92 Highway Spine', 'highway', 65);
  addEdge('i280_sand_hill', 'palo_alto_stanford', 'Sand Hill Road to Stanford Quad', 'arterial', 35);
  addEdge('i280_apple_park', 'mountain_view_google', 'Sunnyvale / Shoreline Connector', 'arterial', 40);

  // San Mateo–Hayward Bridge (CA-92) with authentic bay curvature
  addNode('hayward_downtown', 'Hayward Downtown (CA-92 & I-880)', 'Hayward', 37.6688, -122.0808, 'city' as NodeType);
  addEdge('san_mateo_bridge_west', 'hayward_downtown', 'San Mateo–Hayward Bridge (CA-92)', 'bridge', 55, true, [
    { lat: 37.5580, lng: -122.2720 },
    { lat: 37.5710, lng: -122.2420 },
    { lat: 37.5890, lng: -122.2030 },
    { lat: 37.6080, lng: -122.1640 },
    { lat: 37.6250, lng: -122.1280 },
    { lat: 37.6450, lng: -122.1020 },
    { lat: 37.6688, lng: -122.0808 },
  ]);
  addEdge('hayward_downtown', 'oak_airport', 'I-880 Northbound', 'highway', 65);

  // Dumbarton Bridge (CA-84) connecting Peninsula to Fremont
  addEdge('palo_alto_stanford', 'dumbarton_bridge_west', 'University Ave & Willow Rd (CA-84)', 'arterial', 40);
  addEdge('dumbarton_bridge_west', 'fremont_downtown', 'Dumbarton Bridge (CA-84)', 'bridge', 55, true, [
    { lat: 37.4820, lng: -122.1490 },
    { lat: 37.4980, lng: -122.1290 },
    { lat: 37.5140, lng: -122.1050 },
    { lat: 37.5320, lng: -122.0620 },
    { lat: 37.5485, lng: -121.9886 },
  ]);
  addEdge('fremont_downtown', 'hayward_downtown', 'I-880 Northbound (Nimitz Fwy)', 'highway', 65);
  addEdge('fremont_downtown', 'san_jose_downtown', 'I-880 Southbound into San Jose', 'highway', 65, true, [
    { lat: 37.5485, lng: -121.9886 },
    { lat: 37.4850, lng: -121.9380 },
    { lat: 37.4220, lng: -121.9050 },
    { lat: 37.3382, lng: -121.8863 },
  ]);

  cachedCityGraph = { nodes, edges, adjacency };
  return cachedCityGraph;
}

/**
 * Splices any arbitrary doorstep address or clicked GPS coordinate into the
 * dense full city road network in sub-millisecond time using nearest-neighbor projection.
 */
export function spliceEndpointIntoCityGraph(
  cityGraph: CityRoadGraph,
  endpoint: { id?: string; name: string; lat: number; lng: number; district?: string },
  isStart: boolean
): {
  graph: CityRoadGraph;
  nodeId: string;
} {
  const nodeId = endpoint.id || (isStart ? 'custom_start_node' : 'custom_goal_node');

  // Clone nodes and adjacency maps
  const nodes = new Map<string, CityIntersection>(cityGraph.nodes);
  const edges = [...cityGraph.edges];
  const adjacency = new Map<string, Array<{ target: string; segment: CityRoadSegment }>>();

  for (const [key, val] of cityGraph.adjacency.entries()) {
    adjacency.set(key, [...val]);
  }

  // If node already exists in graph, reuse it directly
  if (nodes.has(nodeId)) {
    return { graph: cityGraph, nodeId };
  }

  const newNode: CityIntersection = {
    id: nodeId,
    name: endpoint.name,
    district: endpoint.district || 'San Francisco',
    lat: endpoint.lat,
    lng: endpoint.lng,
    type: isStart || !isStart ? 'landmark' : 'junction',
  };

  nodes.set(nodeId, newNode);
  adjacency.set(nodeId, []);

  // Find 3 nearest intersections in the city road graph
  const candidates: { node: CityIntersection; dist: number }[] = [];
  for (const n of cityGraph.nodes.values()) {
    const dist = haversineDistanceMiles(endpoint.lat, endpoint.lng, n.lat, n.lng);
    candidates.push({ node: n, dist });
  }

  candidates.sort((a, b) => a.dist - b.dist);
  const nearestThree = candidates.slice(0, 3);

  for (const { node: targetNode, dist } of nearestThree) {
    const streetSpeed = 25; // 25 mph local connector
    const distMiles = Math.max(0.02, Math.round(dist * 100) / 100);
    const durMins = Math.round((distMiles / streetSpeed) * 60 * 100) / 100;

    const forwardSeg: CityRoadSegment = {
      u: nodeId,
      v: targetNode.id,
      streetName: `Local Access to ${targetNode.name}`,
      roadType: 'arterial',
      speedLimit: streetSpeed,
      distanceMiles: distMiles,
      durationMinutes: durMins,
      path: [
        { lat: newNode.lat, lng: newNode.lng },
        { lat: targetNode.lat, lng: targetNode.lng },
      ],
    };

    const backwardSeg: CityRoadSegment = {
      u: targetNode.id,
      v: nodeId,
      streetName: `Local Access to ${endpoint.name}`,
      roadType: 'arterial',
      speedLimit: streetSpeed,
      distanceMiles: distMiles,
      durationMinutes: durMins,
      path: [
        { lat: targetNode.lat, lng: targetNode.lng },
        { lat: newNode.lat, lng: newNode.lng },
      ],
    };

    edges.push(forwardSeg, backwardSeg);
    adjacency.get(nodeId)!.push({ target: targetNode.id, segment: forwardSeg });
    adjacency.get(targetNode.id)!.push({ target: nodeId, segment: backwardSeg });
  }

  return {
    graph: { nodes, edges, adjacency },
    nodeId,
  };
}

/**
 * Converts the CityRoadGraph into a standard BayGraph for pathfinding algorithms.
 */
export function cityRoadGraphToBayGraph(cityGraph: CityRoadGraph): BayGraph {
  const nodes = new Map<string, BayNode>();
  for (const [id, cNode] of cityGraph.nodes) {
    nodes.set(id, {
      id,
      name: cNode.name,
      lat: cNode.lat,
      lng: cNode.lng,
      x: 0,
      y: 0,
      type: cNode.type || 'junction',
      city: cNode.district,
      region: 'sf',
    });
  }

  const edges: BayEdge[] = [];
  const adjacency = new Map<string, Array<{ target: string; weight: number; edge: BayEdge }>>();

  for (const id of nodes.keys()) {
    adjacency.set(id, []);
  }

  for (const seg of cityGraph.edges) {
    const roadType: RoadType = seg.roadType === 'local' ? 'arterial' : seg.roadType;
    const bayEdge: BayEdge = {
      u: seg.u,
      v: seg.v,
      name: seg.streetName,
      roadType,
      distance: seg.distanceMiles,
      speedLimit: seg.speedLimit,
      path: seg.path,
    };
    edges.push(bayEdge);
    adjacency.get(seg.u)?.push({
      target: seg.v,
      weight: seg.durationMinutes,
      edge: bayEdge,
    });
  }

  return { nodes, edges, adjacency };
}

// ==========================================
// GLOBAL CITY ROAD NETWORKS
// ==========================================

export interface TurnManeuver {
  instruction: string;
  distanceMiles: number;
  durationMinutes: number;
  lat: number;
  lng: number;
}

export interface EndpointInput {
  id?: string;
  name: string;
  lat: number;
  lng: number;
  district?: string;
}

export interface FullCityGraphResult {
  graph: BayGraph;
  startId: string;
  goalId: string;
  maneuvers: TurnManeuver[];
  summary: string;
  totalDistanceMiles: number;
  totalDurationMinutes: number;
  cityRoadGraph: CityRoadGraph;
}

let cachedNycGraph: CityRoadGraph | null = null;
let cachedTokyoGraph: CityRoadGraph | null = null;
let cachedLondonGraph: CityRoadGraph | null = null;
let cachedTaipeiGraph: CityRoadGraph | null = null;

/**
 * Builds the comprehensive New York City full city road network (Manhattan & Brooklyn).
 */
export function buildNycCityRoadGraph(): CityRoadGraph {
  if (cachedNycGraph) return cachedNycGraph;

  const nodes = new Map<string, CityIntersection>();
  const edges: CityRoadSegment[] = [];
  const adjacency = new Map<string, Array<{ target: string; segment: CityRoadSegment }>>();

  function addNode(id: string, name: string, district: string, lat: number, lng: number, type: NodeType = 'junction'): void {
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
    bidirectional = true,
    path?: LatLngPoint[]
  ): void {
    const nodeU = nodes.get(u);
    const nodeV = nodes.get(v);
    if (!nodeU || !nodeV) return;

    let dist = 0;
    if (path && path.length >= 2) {
      for (let i = 0; i < path.length - 1; i++) {
        dist += haversineDistanceMiles(path[i].lat, path[i].lng, path[i + 1].lat, path[i + 1].lng);
      }
    } else {
      dist = haversineDistanceMiles(nodeU.lat, nodeU.lng, nodeV.lat, nodeV.lng);
    }
    const distanceMiles = Math.max(0.04, Math.round(dist * 100) / 100);
    const durationMinutes = Math.round((distanceMiles / speedLimit) * 60 * 100) / 100;

    const forwardPath = path && path.length >= 2
      ? [...path]
      : [{ lat: nodeU.lat, lng: nodeU.lng }, { lat: nodeV.lat, lng: nodeV.lng }];

    const segForward: CityRoadSegment = {
      u,
      v,
      streetName,
      roadType,
      speedLimit,
      distanceMiles,
      durationMinutes,
      oneWay: !bidirectional,
      path: forwardPath,
    };
    edges.push(segForward);
    adjacency.get(u)?.push({ target: v, segment: segForward });

    if (bidirectional) {
      const backwardPath = path && path.length >= 2
        ? [...path].reverse()
        : [{ lat: nodeV.lat, lng: nodeV.lng }, { lat: nodeU.lat, lng: nodeU.lng }];

      const segBackward: CityRoadSegment = {
        u: v,
        v: u,
        streetName,
        roadType,
        speedLimit,
        distanceMiles,
        durationMinutes,
        path: backwardPath,
      };
      edges.push(segBackward);
      adjacency.get(v)?.push({ target: u, segment: segBackward });
    }
  }

  // Manhattan Core Grid
  const nycNodes = [
    { id: 'nyc_times_sq', name: 'Times Square (Broadway & 42nd St)', lat: 40.7580, lng: -73.9855, dist: 'Midtown' },
    { id: 'nyc_columbus_circle', name: 'Columbus Circle & Central Park South', lat: 40.7681, lng: -73.9819, dist: 'Midtown' },
    { id: 'nyc_rockefeller', name: 'Rockefeller Center (5th Ave & 50th St)', lat: 40.7587, lng: -73.9787, dist: 'Midtown' },
    { id: 'nyc_grand_central', name: 'Grand Central Terminal (Park Ave & 42nd)', lat: 40.7527, lng: -73.9772, dist: 'Midtown' },
    { id: 'nyc_herald_sq', name: "Herald Square / Macy's (Broadway & 34th)", lat: 40.7505, lng: -73.9876, dist: 'Midtown' },
    { id: 'nyc_empire_state', name: 'Empire State Building (5th Ave & 34th)', lat: 40.7484, lng: -73.9857, dist: 'Midtown' },
    { id: 'nyc_flatiron', name: 'Flatiron Building & Madison Sq Park (Broadway & 23rd)', lat: 40.7411, lng: -73.9897, dist: 'Flatiron' },
    { id: 'nyc_union_sq', name: 'Union Square (Broadway & 14th St)', lat: 40.7359, lng: -73.9911, dist: 'Union Sq' },
    { id: 'nyc_washington_sq', name: 'Washington Square Park / NYU', lat: 40.7308, lng: -73.9973, dist: 'Greenwich Village' },
    { id: 'nyc_soho', name: 'SoHo (Broadway & Prince St)', lat: 40.7250, lng: -73.9980, dist: 'SoHo' },
    { id: 'nyc_chinatown', name: 'Chinatown (Canal St & Centre St)', lat: 40.7180, lng: -74.0000, dist: 'Chinatown' },
    { id: 'nyc_city_hall', name: 'City Hall Park & Brooklyn Bridge Approach', lat: 40.7128, lng: -74.0060, dist: 'Civic Center' },
    { id: 'nyc_wtc', name: 'World Trade Center / Oculus', lat: 40.7115, lng: -74.0125, dist: 'FiDi' },
    { id: 'nyc_wall_st', name: 'Wall Street & New York Stock Exchange', lat: 40.7070, lng: -74.0090, dist: 'FiDi' },
    { id: 'nyc_battery_park', name: 'Battery Park & Statue of Liberty Ferry', lat: 40.7033, lng: -74.0170, dist: 'Battery Park' },
    { id: 'nyc_fdr_midtown', name: 'FDR Drive at 42nd St (UN Headquarters)', lat: 40.7495, lng: -73.9680, dist: 'East River' },
    { id: 'nyc_fdr_downtown', name: 'FDR Drive at South St Seaport', lat: 40.7075, lng: -74.0015, dist: 'Seaport' },
    { id: 'nyc_west_side_midtown', name: 'West Side Highway at 42nd St (Pier 84)', lat: 40.7620, lng: -74.0010, dist: 'Hudson River' },
    { id: 'nyc_west_side_downtown', name: 'West Side Highway at Battery Place', lat: 40.7060, lng: -74.0175, dist: 'Hudson River' },
    { id: 'nyc_brooklyn_bridge_manhattan', name: 'Brooklyn Bridge Manhattan Tower', lat: 40.7100, lng: -74.0000, dist: 'East River' },
    { id: 'nyc_brooklyn_bridge_brooklyn', name: 'Brooklyn Bridge Brooklyn Tower', lat: 40.7040, lng: -73.9940, dist: 'East River' },
    { id: 'nyc_brooklyn_promenade', name: 'Brooklyn Bridge Promenade & DUMBO', lat: 40.7061, lng: -73.9969, dist: 'Brooklyn' },
    { id: 'nyc_downtown_brooklyn', name: 'Downtown Brooklyn (Cadman Plaza / Fulton St)', lat: 40.6960, lng: -73.9900, dist: 'Brooklyn' },
    { id: 'nyc_manhattan_bridge', name: 'Manhattan Bridge (Canal St to Flatbush Ave)', lat: 40.7075, lng: -73.9900, dist: 'East River' },
  ];

  for (const n of nycNodes) {
    addNode(n.id, n.name, n.dist, n.lat, n.lng, n.id.includes('bridge') ? 'bridge' : 'city');
  }

  // Broadway Spine
  addEdge('nyc_columbus_circle', 'nyc_times_sq', 'Broadway Southbound', 'arterial', 25);
  addEdge('nyc_times_sq', 'nyc_herald_sq', 'Broadway / 7th Ave', 'arterial', 25);
  addEdge('nyc_herald_sq', 'nyc_flatiron', 'Broadway Southbound', 'arterial', 25);
  addEdge('nyc_flatiron', 'nyc_union_sq', 'Broadway Southbound', 'arterial', 25);
  addEdge('nyc_union_sq', 'nyc_soho', 'Broadway Corridor', 'arterial', 25);
  addEdge('nyc_soho', 'nyc_chinatown', 'Broadway into Canal St', 'arterial', 25);
  addEdge('nyc_chinatown', 'nyc_city_hall', 'Centre Street Corridor', 'arterial', 25);
  addEdge('nyc_city_hall', 'nyc_wtc', 'Vesey / Fulton St', 'local', 20);
  addEdge('nyc_city_hall', 'nyc_wall_st', 'Broadway into Wall Street', 'local', 20);
  addEdge('nyc_wall_st', 'nyc_battery_park', 'Broadway / State St', 'local', 20);

  // 5th Avenue Spine
  addEdge('nyc_columbus_circle', 'nyc_rockefeller', 'Central Park South to 5th Ave', 'arterial', 25);
  addEdge('nyc_rockefeller', 'nyc_grand_central', '5th Ave & 42nd St', 'arterial', 25);
  addEdge('nyc_grand_central', 'nyc_empire_state', 'Park Ave to 34th St', 'arterial', 25);
  addEdge('nyc_empire_state', 'nyc_flatiron', '5th Avenue Southbound', 'arterial', 25);
  addEdge('nyc_flatiron', 'nyc_washington_sq', '5th Ave into Washington Sq Arch', 'arterial', 25);
  addEdge('nyc_washington_sq', 'nyc_soho', 'Houston St to Prince St', 'arterial', 25);

  // East-West Connectors
  addEdge('nyc_times_sq', 'nyc_rockefeller', '42nd St / 48th St', 'local', 20);
  addEdge('nyc_times_sq', 'nyc_grand_central', '42nd Street Crosstown', 'arterial', 25);
  addEdge('nyc_herald_sq', 'nyc_empire_state', '34th Street Crosstown', 'arterial', 25);
  addEdge('nyc_union_sq', 'nyc_washington_sq', '14th St to University Pl', 'local', 20);

  // Highways
  addEdge('nyc_grand_central', 'nyc_fdr_midtown', '42nd St to FDR Drive', 'arterial', 30);
  addEdge('nyc_fdr_midtown', 'nyc_fdr_downtown', 'FDR Drive Southbound (East River Scenic)', 'highway', 50);
  addEdge('nyc_fdr_downtown', 'nyc_battery_park', 'FDR Drive Underpass to Battery', 'highway', 45);

  addEdge('nyc_times_sq', 'nyc_west_side_midtown', '42nd St to West Side Hwy', 'arterial', 30);
  addEdge('nyc_west_side_midtown', 'nyc_west_side_downtown', 'West Side Highway (12th Ave)', 'highway', 50);
  addEdge('nyc_west_side_downtown', 'nyc_battery_park', 'Battery Place Tunnel', 'arterial', 30);
  addEdge('nyc_west_side_downtown', 'nyc_wtc', 'West St to Oculus', 'arterial', 30);

  // Brooklyn Bridge with curved coordinates
  addEdge('nyc_city_hall', 'nyc_brooklyn_bridge_manhattan', 'Brooklyn Bridge Manhattan Ramp', 'bridge', 45);
  addEdge('nyc_brooklyn_bridge_manhattan', 'nyc_brooklyn_bridge_brooklyn', 'Brooklyn Bridge Main Cable Span', 'bridge', 45, true, [
    { lat: 40.7100, lng: -74.0000 },
    { lat: 40.7080, lng: -73.9980 },
    { lat: 40.7061, lng: -73.9969 },
    { lat: 40.7040, lng: -73.9940 },
  ]);
  addEdge('nyc_brooklyn_bridge_brooklyn', 'nyc_brooklyn_promenade', 'Brooklyn Bridge Cadman Plaza Ramp', 'bridge', 40);
  addEdge('nyc_brooklyn_promenade', 'nyc_downtown_brooklyn', 'Cadman Plaza West', 'arterial', 30);

  // Alternative Manhattan Bridge
  addEdge('nyc_chinatown', 'nyc_manhattan_bridge', 'Canal St Bridge Approach', 'arterial', 30);
  addEdge('nyc_manhattan_bridge', 'nyc_downtown_brooklyn', 'Manhattan Bridge to Flatbush Ave', 'bridge', 45);

  cachedNycGraph = { nodes, edges, adjacency };
  return cachedNycGraph;
}

/**
 * Builds the comprehensive Tokyo central road network (Shibuya, Roppongi, Tokyo Tower, Ginza).
 */
export function buildTokyoCityRoadGraph(): CityRoadGraph {
  if (cachedTokyoGraph) return cachedTokyoGraph;

  const nodes = new Map<string, CityIntersection>();
  const edges: CityRoadSegment[] = [];
  const adjacency = new Map<string, Array<{ target: string; segment: CityRoadSegment }>>();

  function addNode(id: string, name: string, district: string, lat: number, lng: number, type: NodeType = 'junction'): void {
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
    bidirectional = true,
    path?: LatLngPoint[]
  ): void {
    const nodeU = nodes.get(u);
    const nodeV = nodes.get(v);
    if (!nodeU || !nodeV) return;

    let dist = 0;
    if (path && path.length >= 2) {
      for (let i = 0; i < path.length - 1; i++) {
        dist += haversineDistanceMiles(path[i].lat, path[i].lng, path[i + 1].lat, path[i + 1].lng);
      }
    } else {
      dist = haversineDistanceMiles(nodeU.lat, nodeU.lng, nodeV.lat, nodeV.lng);
    }
    const distanceMiles = Math.max(0.04, Math.round(dist * 100) / 100);
    const durationMinutes = Math.round((distanceMiles / speedLimit) * 60 * 100) / 100;

    const forwardPath = path && path.length >= 2
      ? [...path]
      : [{ lat: nodeU.lat, lng: nodeU.lng }, { lat: nodeV.lat, lng: nodeV.lng }];

    const segForward: CityRoadSegment = {
      u,
      v,
      streetName,
      roadType,
      speedLimit,
      distanceMiles,
      durationMinutes,
      oneWay: !bidirectional,
      path: forwardPath,
    };
    edges.push(segForward);
    adjacency.get(u)?.push({ target: v, segment: segForward });

    if (bidirectional) {
      const backwardPath = path && path.length >= 2
        ? [...path].reverse()
        : [{ lat: nodeV.lat, lng: nodeV.lng }, { lat: nodeU.lat, lng: nodeU.lng }];

      const segBackward: CityRoadSegment = {
        u: v,
        v: u,
        streetName,
        roadType,
        speedLimit,
        distanceMiles,
        durationMinutes,
        path: backwardPath,
      };
      edges.push(segBackward);
      adjacency.get(v)?.push({ target: u, segment: segBackward });
    }
  }

  const tokyoNodes = [
    { id: 'tky_shibuya', name: 'Shibuya Crossing & Hachiko', lat: 35.6595, lng: 139.7005, dist: 'Shibuya' },
    { id: 'tky_harajuku', name: 'Harajuku / Meiji Jingu', lat: 35.6702, lng: 139.7027, dist: 'Shibuya' },
    { id: 'tky_omotesando', name: 'Omotesando Boulevard', lat: 35.6652, lng: 139.7123, dist: 'Minato' },
    { id: 'tky_aoyama', name: 'Aoyama-itchome Crossing', lat: 35.6728, lng: 139.7240, dist: 'Minato' },
    { id: 'tky_roppongi', name: 'Roppongi Crossing & Dori', lat: 35.6628, lng: 139.7314, dist: 'Roppongi' },
    { id: 'tky_roppongi_hills', name: 'Roppongi Hills & Mori Tower', lat: 35.6605, lng: 139.7292, dist: 'Roppongi' },
    { id: 'tky_azabu', name: 'Azabu-Juban Shopping Street', lat: 35.6550, lng: 139.7360, dist: 'Minato' },
    { id: 'tky_tokyo_tower', name: 'Tokyo Tower & Shiba Park', lat: 35.6586, lng: 139.7454, dist: 'Shiba' },
    { id: 'tky_toranomon', name: 'Toranomon Hills', lat: 35.6668, lng: 139.7495, dist: 'Toranomon' },
    { id: 'tky_shimbashi', name: 'Shimbashi Station Gateway', lat: 35.6664, lng: 139.7583, dist: 'Minato' },
    { id: 'tky_ginza', name: 'Ginza 4-chome Crossing', lat: 35.6719, lng: 139.7649, dist: 'Ginza' },
    { id: 'tky_hibiya', name: 'Hibiya Park & Imperial Palace Outer Garden', lat: 35.6750, lng: 139.7560, dist: 'Chiyoda' },
    { id: 'tky_tokyo_stn', name: 'Tokyo Station Marunouchi', lat: 35.6812, lng: 139.7671, dist: 'Marunouchi' },
    { id: 'tky_rainbow_bridge', name: 'Rainbow Bridge (Daiba Line)', lat: 35.6366, lng: 139.7631, dist: 'Tokyo Bay' },
    { id: 'tky_odaiba', name: 'Odaiba Seaside Park', lat: 35.6290, lng: 139.7750, dist: 'Odaiba' },
  ];

  for (const n of tokyoNodes) {
    addNode(n.id, n.name, n.dist, n.lat, n.lng, n.id.includes('bridge') ? 'bridge' : 'city');
  }

  addEdge('tky_shibuya', 'tky_harajuku', 'Meiji Dori Northbound', 'arterial', 35);
  addEdge('tky_harajuku', 'tky_omotesando', 'Omotesando Dori', 'arterial', 30);
  addEdge('tky_shibuya', 'tky_omotesando', 'Aoyama Dori Eastbound', 'arterial', 35);
  addEdge('tky_omotesando', 'tky_aoyama', 'Aoyama Dori', 'arterial', 40);
  addEdge('tky_shibuya', 'tky_roppongi_hills', 'Roppongi Dori (Route 412)', 'arterial', 35);
  addEdge('tky_roppongi_hills', 'tky_roppongi', 'Roppongi Keyakizaka Dori', 'local', 25);
  addEdge('tky_aoyama', 'tky_roppongi', 'Gaien-Higashi Dori', 'arterial', 35);
  addEdge('tky_roppongi', 'tky_azabu', 'Azabu Dori Southbound', 'arterial', 30);
  addEdge('tky_roppongi', 'tky_tokyo_tower', 'Sakurada Dori to Tokyo Tower', 'arterial', 35);
  addEdge('tky_azabu', 'tky_tokyo_tower', 'Akabanebashi Crossing', 'local', 25);
  addEdge('tky_tokyo_tower', 'tky_toranomon', 'Atago Dori / Shintora Dori', 'arterial', 35);
  addEdge('tky_toranomon', 'tky_shimbashi', 'Shintora Dori Eastbound', 'arterial', 35);
  addEdge('tky_shimbashi', 'tky_ginza', 'Chuo Dori into Ginza', 'arterial', 30);
  addEdge('tky_ginza', 'tky_tokyo_stn', 'Chuo Dori to Marunouchi', 'arterial', 30);
  addEdge('tky_hibiya', 'tky_tokyo_stn', 'Hibiya Dori Northbound', 'arterial', 35);
  addEdge('tky_toranomon', 'tky_hibiya', 'Hibiya Dori', 'arterial', 35);
  addEdge('tky_shimbashi', 'tky_rainbow_bridge', 'Shuto Expressway Route 1 Haneda Line', 'highway', 60);
  addEdge('tky_rainbow_bridge', 'tky_odaiba', 'Rainbow Bridge Suspension Span (Tokyo Bay)', 'bridge', 50, true, [
    { lat: 35.6366, lng: 139.7631 },
    { lat: 35.6330, lng: 139.7690 },
    { lat: 35.6290, lng: 139.7750 },
  ]);

  cachedTokyoGraph = { nodes, edges, adjacency };
  return cachedTokyoGraph;
}

/**
 * Builds the comprehensive London central road network (Westminster to Tower Bridge).
 */
export function buildLondonCityRoadGraph(): CityRoadGraph {
  if (cachedLondonGraph) return cachedLondonGraph;

  const nodes = new Map<string, CityIntersection>();
  const edges: CityRoadSegment[] = [];
  const adjacency = new Map<string, Array<{ target: string; segment: CityRoadSegment }>>();

  function addNode(id: string, name: string, district: string, lat: number, lng: number, type: NodeType = 'junction'): void {
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
    bidirectional = true,
    path?: LatLngPoint[]
  ): void {
    const nodeU = nodes.get(u);
    const nodeV = nodes.get(v);
    if (!nodeU || !nodeV) return;

    let dist = 0;
    if (path && path.length >= 2) {
      for (let i = 0; i < path.length - 1; i++) {
        dist += haversineDistanceMiles(path[i].lat, path[i].lng, path[i + 1].lat, path[i + 1].lng);
      }
    } else {
      dist = haversineDistanceMiles(nodeU.lat, nodeU.lng, nodeV.lat, nodeV.lng);
    }
    const distanceMiles = Math.max(0.04, Math.round(dist * 100) / 100);
    const durationMinutes = Math.round((distanceMiles / speedLimit) * 60 * 100) / 100;

    const forwardPath = path && path.length >= 2
      ? [...path]
      : [{ lat: nodeU.lat, lng: nodeU.lng }, { lat: nodeV.lat, lng: nodeV.lng }];

    const segForward: CityRoadSegment = {
      u,
      v,
      streetName,
      roadType,
      speedLimit,
      distanceMiles,
      durationMinutes,
      oneWay: !bidirectional,
      path: forwardPath,
    };
    edges.push(segForward);
    adjacency.get(u)?.push({ target: v, segment: segForward });

    if (bidirectional) {
      const backwardPath = path && path.length >= 2
        ? [...path].reverse()
        : [{ lat: nodeV.lat, lng: nodeV.lng }, { lat: nodeU.lat, lng: nodeU.lng }];

      const segBackward: CityRoadSegment = {
        u: v,
        v: u,
        streetName,
        roadType,
        speedLimit,
        distanceMiles,
        durationMinutes,
        path: backwardPath,
      };
      edges.push(segBackward);
      adjacency.get(v)?.push({ target: u, segment: segBackward });
    }
  }

  const londonNodes = [
    { id: 'ldn_westminster', name: 'Westminster Palace / Big Ben', lat: 51.4994, lng: -0.1248, dist: 'Westminster' },
    { id: 'ldn_westminster_bridge', name: 'Westminster Bridge (River Thames)', lat: 51.5008, lng: -0.1215, dist: 'Thames' },
    { id: 'ldn_waterloo', name: 'London Eye & Waterloo Station', lat: 51.5033, lng: -0.1195, dist: 'South Bank' },
    { id: 'ldn_trafalgar', name: 'Trafalgar Square & National Gallery', lat: 51.5080, lng: -0.1281, dist: 'West End' },
    { id: 'ldn_strand', name: 'Strand & Aldwych', lat: 51.5125, lng: -0.1170, dist: 'Covent Garden' },
    { id: 'ldn_waterloo_bridge', name: 'Waterloo Bridge (South Bank to Strand)', lat: 51.5085, lng: -0.1170, dist: 'Thames' },
    { id: 'ldn_embankment', name: 'Victoria Embankment Waterfront', lat: 51.5105, lng: -0.1110, dist: 'City of London' },
    { id: 'ldn_blackfriars', name: 'Blackfriars Bridge', lat: 51.5110, lng: -0.1040, dist: 'Thames' },
    { id: 'ldn_st_pauls', name: "St. Paul's Cathedral & Ludgate Hill", lat: 51.5138, lng: -0.0984, dist: 'City of London' },
    { id: 'ldn_tate_modern', name: 'Tate Modern & Bankside', lat: 51.5076, lng: -0.0994, dist: 'Bankside' },
    { id: 'ldn_bank', name: 'Bank of England (Threadneedle St)', lat: 51.5134, lng: -0.0888, dist: 'City of London' },
    { id: 'ldn_london_bridge_north', name: 'London Bridge North (Monument)', lat: 51.5108, lng: -0.0860, dist: 'City of London' },
    { id: 'ldn_london_bridge_south', name: 'The Shard & London Bridge Station', lat: 51.5045, lng: -0.0865, dist: 'Southwark' },
    { id: 'ldn_tooley_st', name: 'Tooley Street & Hay’s Galleria', lat: 51.5040, lng: -0.0800, dist: 'Southwark' },
    { id: 'ldn_tower_of_london', name: 'Tower of London & Castle Moat', lat: 51.5081, lng: -0.0759, dist: 'Tower Hill' },
    { id: 'ldn_tower_bridge', name: 'Tower Bridge (Iconic Twin Gothic Towers)', lat: 51.5055, lng: -0.0754, dist: 'Tower Bridge' },
  ];

  for (const n of londonNodes) {
    addNode(n.id, n.name, n.dist, n.lat, n.lng, n.id.includes('bridge') ? 'bridge' : 'city');
  }

  addEdge('ldn_westminster', 'ldn_trafalgar', 'Whitehall Northbound', 'arterial', 25);
  addEdge('ldn_trafalgar', 'ldn_strand', 'Strand Eastbound', 'arterial', 25);
  addEdge('ldn_strand', 'ldn_embankment', 'Arundel St to Embankment', 'local', 20);
  addEdge('ldn_embankment', 'ldn_blackfriars', 'Victoria Embankment', 'arterial', 30);
  addEdge('ldn_blackfriars', 'ldn_st_pauls', 'New Bridge St to Ludgate Hill', 'arterial', 25);
  addEdge('ldn_st_pauls', 'ldn_bank', 'Cheapside into Bank', 'arterial', 25);
  addEdge('ldn_bank', 'ldn_london_bridge_north', 'King William St to Monument', 'arterial', 25);
  addEdge('ldn_london_bridge_north', 'ldn_tower_of_london', 'Lower Thames St / Eastcheap', 'arterial', 25);
  addEdge('ldn_tower_of_london', 'ldn_tower_bridge', 'Tower Hill Approach', 'bridge', 30);

  addEdge('ldn_westminster', 'ldn_westminster_bridge', 'Westminster Bridge Approach', 'bridge', 30);
  addEdge('ldn_westminster_bridge', 'ldn_waterloo', 'York Road to Waterloo', 'bridge', 30);
  addEdge('ldn_waterloo', 'ldn_waterloo_bridge', 'Waterloo Road', 'arterial', 25);
  addEdge('ldn_waterloo_bridge', 'ldn_strand', 'Waterloo Bridge', 'bridge', 30);

  addEdge('ldn_waterloo', 'ldn_tate_modern', 'Stamford St & Southwark St', 'arterial', 25);
  addEdge('ldn_tate_modern', 'ldn_blackfriars', 'Blackfriars Bridge South', 'bridge', 30);
  addEdge('ldn_tate_modern', 'ldn_london_bridge_south', 'Southwark St Eastbound', 'arterial', 25);
  addEdge('ldn_london_bridge_north', 'ldn_london_bridge_south', 'London Bridge Crossing', 'bridge', 30);
  addEdge('ldn_london_bridge_south', 'ldn_tooley_st', 'Tooley Street Eastbound', 'arterial', 25);
  addEdge('ldn_tooley_st', 'ldn_tower_bridge', 'Tower Bridge Road', 'bridge', 30);

  cachedLondonGraph = { nodes, edges, adjacency };
  return cachedLondonGraph;
}

/**
 * Builds the comprehensive Taipei road network (Taipei 101 to Shilin Night Market).
 */
export function buildTaipeiCityRoadGraph(): CityRoadGraph {
  if (cachedTaipeiGraph) return cachedTaipeiGraph;

  const nodes = new Map<string, CityIntersection>();
  const edges: CityRoadSegment[] = [];
  const adjacency = new Map<string, Array<{ target: string; segment: CityRoadSegment }>>();

  function addNode(id: string, name: string, district: string, lat: number, lng: number, type: NodeType = 'junction'): void {
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
    bidirectional = true,
    path?: LatLngPoint[]
  ): void {
    const nodeU = nodes.get(u);
    const nodeV = nodes.get(v);
    if (!nodeU || !nodeV) return;

    let dist = 0;
    if (path && path.length >= 2) {
      for (let i = 0; i < path.length - 1; i++) {
        dist += haversineDistanceMiles(path[i].lat, path[i].lng, path[i + 1].lat, path[i + 1].lng);
      }
    } else {
      dist = haversineDistanceMiles(nodeU.lat, nodeU.lng, nodeV.lat, nodeV.lng);
    }
    const distanceMiles = Math.max(0.04, Math.round(dist * 100) / 100);
    const durationMinutes = Math.round((distanceMiles / speedLimit) * 60 * 100) / 100;

    const forwardPath = path && path.length >= 2
      ? [...path]
      : [{ lat: nodeU.lat, lng: nodeU.lng }, { lat: nodeV.lat, lng: nodeV.lng }];

    const segForward: CityRoadSegment = {
      u,
      v,
      streetName,
      roadType,
      speedLimit,
      distanceMiles,
      durationMinutes,
      oneWay: !bidirectional,
      path: forwardPath,
    };
    edges.push(segForward);
    adjacency.get(u)?.push({ target: v, segment: segForward });

    if (bidirectional) {
      const backwardPath = path && path.length >= 2
        ? [...path].reverse()
        : [{ lat: nodeV.lat, lng: nodeV.lng }, { lat: nodeU.lat, lng: nodeU.lng }];

      const segBackward: CityRoadSegment = {
        u: v,
        v: u,
        streetName,
        roadType,
        speedLimit,
        distanceMiles,
        durationMinutes,
        path: backwardPath,
      };
      edges.push(segBackward);
      adjacency.get(v)?.push({ target: u, segment: segBackward });
    }
  }

  const taipeiNodes = [
    { id: 'tpe_101', name: 'Taipei 101 & Xinyi Shopping District', lat: 25.0339, lng: 121.5645, dist: 'Xinyi' },
    { id: 'tpe_city_hall', name: 'Taipei City Hall & Songgao Rd', lat: 25.0410, lng: 121.5660, dist: 'Xinyi' },
    { id: 'tpe_sun_yat_sen', name: 'Sun Yat-sen Memorial Hall', lat: 25.0400, lng: 121.5580, dist: 'Xinyi' },
    { id: 'tpe_zhongxiao_dunhua', name: 'Zhongxiao Dunhua (East District)', lat: 25.0415, lng: 121.5500, dist: 'Daan' },
    { id: 'tpe_daan_park', name: 'Daan Forest Park (Xinyi & Jianguo)', lat: 25.0300, lng: 121.5350, dist: 'Daan' },
    { id: 'tpe_cksm_hall', name: 'Chiang Kai-shek Memorial Hall', lat: 25.0355, lng: 121.5197, dist: 'Zhongzheng' },
    { id: 'tpe_main_stn', name: 'Taipei Main Station (Zhongxiao West Rd)', lat: 25.0478, lng: 121.5170, dist: 'Zhongzheng' },
    { id: 'tpe_ximending', name: 'Ximending Red House & Hanzhong St', lat: 25.0422, lng: 121.5070, dist: 'Wanhua' },
    { id: 'tpe_civic_blvd_east', name: 'Civic Boulevard Expressway (Guanghua)', lat: 25.0450, lng: 121.5350, dist: 'Zhongshan' },
    { id: 'tpe_jianguo_expwy', name: 'Jianguo Elevated Expressway (Minquan Exit)', lat: 25.0620, lng: 121.5370, dist: 'Zhongshan' },
    { id: 'tpe_zhongshan_north', name: 'Zhongshan North Road & Mackay Hospital', lat: 25.0580, lng: 121.5230, dist: 'Zhongshan' },
    { id: 'tpe_yuanshan', name: 'Yuanshan MRT & The Grand Hotel', lat: 25.0715, lng: 121.5200, dist: 'Zhongshan' },
    { id: 'tpe_zhongshan_bridge', name: 'Zhongshan Bridge (Keelung River Crossing)', lat: 25.0760, lng: 121.5235, dist: 'Keelung River' },
    { id: 'tpe_shilin_night_market', name: 'Shilin Night Market & Jiantan MRT', lat: 25.0881, lng: 121.5244, dist: 'Shilin' },
    { id: 'tpe_shilin_residence', name: 'Shilin Official Residence & Fulin Rd', lat: 25.0930, lng: 121.5300, dist: 'Shilin' },
    { id: 'tpe_dazhi', name: 'Dazhi Miramar Ferris Wheel & Beian Rd', lat: 25.0830, lng: 121.5570, dist: 'Zhongshan' },
    { id: 'tpe_songshan_airport', name: 'Taipei Songshan Airport (TSA)', lat: 25.0697, lng: 121.5525, dist: 'Songshan' },
    { id: 'tpe_raohe', name: 'Raohe Street Night Market / Songshan Stn', lat: 25.0500, lng: 121.5780, dist: 'Songshan' },
  ];

  for (const n of taipeiNodes) {
    addNode(n.id, n.name, n.dist, n.lat, n.lng, n.id.includes('bridge') ? 'bridge' : 'city');
  }

  addEdge('tpe_101', 'tpe_city_hall', 'City Hall Road Northbound', 'arterial', 35);
  addEdge('tpe_101', 'tpe_sun_yat_sen', 'Renai Road Boulevard', 'arterial', 40);
  addEdge('tpe_city_hall', 'tpe_sun_yat_sen', 'Zhongxiao East Road Sec 4', 'arterial', 35);
  addEdge('tpe_sun_yat_sen', 'tpe_zhongxiao_dunhua', 'Zhongxiao East Road', 'arterial', 35);
  addEdge('tpe_101', 'tpe_daan_park', 'Xinyi Road East-West Corridor', 'arterial', 40);
  addEdge('tpe_daan_park', 'tpe_cksm_hall', 'Xinyi Road into CKS Memorial', 'arterial', 35);
  addEdge('tpe_cksm_hall', 'tpe_main_stn', 'Zhongshan South Road', 'arterial', 35);
  addEdge('tpe_main_stn', 'tpe_ximending', 'Zhonghua Road Sec 1', 'arterial', 35);

  addEdge('tpe_zhongxiao_dunhua', 'tpe_civic_blvd_east', 'Dunhua South to Civic Blvd', 'arterial', 35);
  addEdge('tpe_civic_blvd_east', 'tpe_main_stn', 'Civic Boulevard Elevated Expressway', 'highway', 60);
  addEdge('tpe_civic_blvd_east', 'tpe_jianguo_expwy', 'Jianguo Elevated Expressway North', 'highway', 65);
  addEdge('tpe_main_stn', 'tpe_zhongshan_north', 'Zhongshan North Road Sec 1 & 2', 'arterial', 35);
  addEdge('tpe_zhongshan_north', 'tpe_yuanshan', 'Zhongshan North Road Sec 3', 'arterial', 40);
  addEdge('tpe_jianguo_expwy', 'tpe_yuanshan', 'Minquan East to Yuanshan', 'arterial', 40);

  addEdge('tpe_yuanshan', 'tpe_zhongshan_bridge', 'Zhongshan North Road Bridge Ramp', 'bridge', 45);
  addEdge('tpe_zhongshan_bridge', 'tpe_shilin_night_market', 'Zhongshan Bridge to Jiantan', 'bridge', 45, true, [
    { lat: 25.0760, lng: 121.5235 },
    { lat: 25.0820, lng: 121.5240 },
    { lat: 25.0881, lng: 121.5244 },
  ]);
  addEdge('tpe_shilin_night_market', 'tpe_shilin_residence', 'Zhongshan North Rd Sec 5', 'arterial', 35);

  addEdge('tpe_yuanshan', 'tpe_dazhi', 'Beian Road through Grand Hotel Foothills', 'arterial', 40);
  addEdge('tpe_dazhi', 'tpe_shilin_night_market', 'Ziqiang Tunnel to Shilin', 'arterial', 40);
  addEdge('tpe_dazhi', 'tpe_songshan_airport', 'Dazhi Bridge over Keelung River', 'bridge', 45);
  addEdge('tpe_songshan_airport', 'tpe_raohe', 'Minquan East Rd to Bade Rd', 'arterial', 35);
  addEdge('tpe_raohe', 'tpe_city_hall', 'Keelung Road Southbound', 'arterial', 40);

  cachedTaipeiGraph = { nodes, edges, adjacency };
  return cachedTaipeiGraph;
}

/**
 * Universally dispatches the appropriate metropolitan full city road graph
 * based on geographic coordinates.
 */
export function getFullCityRoadGraph(lat: number, lng: number): CityRoadGraph {
  if (lat >= 40.4 && lat <= 41.2 && lng >= -74.3 && lng <= -73.6) {
    return buildNycCityRoadGraph();
  }
  if (lat >= 35.3 && lat <= 36.2 && lng >= 139.3 && lng <= 140.2) {
    return buildTokyoCityRoadGraph();
  }
  if (lat >= 51.2 && lat <= 51.8 && lng >= -0.6 && lng <= 0.4) {
    return buildLondonCityRoadGraph();
  }
  if (lat >= 24.7 && lat <= 25.5 && lng >= 121.2 && lng <= 121.9) {
    return buildTaipeiCityRoadGraph();
  }
  return buildFullCityRoadGraph();
}

/**
 * Complete Full-City Graph Builder with Spliced Endpoints and Driving Maneuvers.
 * Seamlessly integrates any two points into the comprehensive city network and derives
 * realistic turn maneuvers from the optimal path.
 */
export function buildFullCityGraphWithEndpoints(
  start: EndpointInput,
  goal: EndpointInput
): FullCityGraphResult {
  const avgLat = (start.lat + goal.lat) / 2;
  const avgLng = (start.lng + goal.lng) / 2;
  const baseCityGraph = getFullCityRoadGraph(avgLat, avgLng);

  const splicedStart = spliceEndpointIntoCityGraph(baseCityGraph, start, true);
  const splicedGoal = spliceEndpointIntoCityGraph(splicedStart.graph, goal, false);

  const bayGraph = cityRoadGraphToBayGraph(splicedGoal.graph);
  const startId = splicedStart.nodeId;
  const goalId = splicedGoal.nodeId;

  // Run A* pathfinding to extract the primary optimal driving route for maneuvers
  const pathRes = runPathfinding('a_star', bayGraph, startId, goalId);

  const maneuvers: TurnManeuver[] = [];
  let summary = `Driving route from ${start.name} to ${goal.name}`;

  if (pathRes.found && pathRes.pathEdges.length > 0) {
    const primaryHighways = new Set<string>();

    for (let i = 0; i < pathRes.pathEdges.length; i++) {
      const pe = pathRes.pathEdges[i];
      const targetNode = bayGraph.nodes.get(pe.v);
      const targetLat = targetNode?.lat ?? goal.lat;
      const targetLng = targetNode?.lng ?? goal.lng;

      let instruction = `Continue onto ${pe.name}`;
      if (i === 0) {
        instruction = `Depart ${start.name} onto ${pe.name}`;
      } else if (i === pathRes.pathEdges.length - 1) {
        instruction = `Follow ${pe.name} to arrive at ${goal.name}`;
      } else if (pe.name.toLowerCase().includes('bridge') || pe.name.toLowerCase().includes('span')) {
        instruction = `Cross ${pe.name}`;
      }

      if (pe.name.includes('I-') || pe.name.includes('US-') || pe.name.includes('CA-') || pe.name.includes('Bridge') || pe.name.includes('Fwy') || pe.name.includes('Expressway')) {
        primaryHighways.add(pe.name);
      }

      const durMins = (pe.distance / pe.speedLimit) * 60;
      maneuvers.push({
        instruction,
        distanceMiles: pe.distance,
        durationMinutes: durMins,
        lat: targetLat,
        lng: targetLng,
      });
    }

    if (primaryHighways.size > 0) {
      summary = `via ${Array.from(primaryHighways).slice(0, 2).join(' and ')}`;
    }
  } else {
    maneuvers.push({
      instruction: `Head towards ${goal.name}`,
      distanceMiles: haversineDistanceMiles(start.lat, start.lng, goal.lat, goal.lng),
      durationMinutes: 10,
      lat: goal.lat,
      lng: goal.lng,
    });
  }

  return {
    graph: bayGraph,
    startId,
    goalId,
    maneuvers,
    summary,
    totalDistanceMiles: pathRes.totalDistanceMiles,
    totalDurationMinutes: pathRes.totalTimeMinutes,
    cityRoadGraph: splicedGoal.graph,
  };
}
