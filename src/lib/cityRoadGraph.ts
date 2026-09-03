/**
 * High-Density Full City Road Network Graph
 *
 * Models an authentic, comprehensive road network of San Francisco and the
 * surrounding Bay Area corridors with hundreds of real intersections,
 * avenues, boulevards, one-ways, bridges, and freeway interchanges.
 */

import type { BayGraph, BayNode, BayEdge, NodeType, RoadType, LatLngPoint } from './bayGraph';
import { haversineDistanceMiles } from './realWorldRoadGraph';

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
