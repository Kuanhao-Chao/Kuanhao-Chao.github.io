export type Region = 'sf' | 'peninsula' | 'southbay' | 'eastbay' | 'northbay';
export type NodeType = 'city' | 'airport' | 'landmark' | 'junction' | 'bridge';
export type RoadType = 'interstate' | 'highway' | 'arterial' | 'bridge';

export interface BayNode {
  id: string;
  name: string;
  city: string;
  region: Region;
  type: NodeType;
  x: number; // 0..1000 coordinate scale
  y: number; // 0..1000 coordinate scale
  lat: number;
  lng: number;
  description?: string;
}

export interface LatLngPoint {
  lat: number;
  lng: number;
}

export interface BayEdge {
  u: string;
  v: string;
  distance: number; // miles
  speedLimit: number; // mph
  roadType: RoadType;
  name: string;
  path?: LatLngPoint[]; // Actual curved road geometry coordinates
}

export interface PresetTrip {
  id: string;
  name: string;
  icon: string;
  startId: string;
  goalId: string;
  description: string;
  highlights: string[];
}

export interface BayGraph {
  nodes: Map<string, BayNode>;
  adjacency: Map<string, { target: string; edge: BayEdge; weight: number }[]>;
  edges: BayEdge[];
}

// 80+ Authentic Bay Area Landmarks & Highway Junction Nodes
export const BAY_NODES: BayNode[] = [
  // --- SAN FRANCISCO ---
  {
    id: 'sf_ferry_bldg',
    name: 'SF Ferry Building',
    city: 'San Francisco',
    region: 'sf',
    type: 'landmark',
    x: 430,
    y: 285,
    lat: 37.7955,
    lng: -122.3937,
    description: 'Iconic Embarcadero clock tower and Bay transit portal',
  },
  {
    id: 'sf_fidi',
    name: 'Financial District (FiDi)',
    city: 'San Francisco',
    region: 'sf',
    type: 'city',
    x: 415,
    y: 288,
    lat: 37.7946,
    lng: -122.4004,
    description: 'Transamerica Pyramid & Montgomery St financial core',
  },
  {
    id: 'sf_fishermans_wharf',
    name: "Fisherman's Wharf & Pier 39",
    city: 'San Francisco',
    region: 'sf',
    type: 'landmark',
    x: 410,
    y: 260,
    lat: 37.808,
    lng: -122.4177,
    description: 'Northern waterfront, historic maritime docks',
  },
  {
    id: 'sf_presidio',
    name: 'The Presidio',
    city: 'San Francisco',
    region: 'sf',
    type: 'landmark',
    x: 370,
    y: 275,
    lat: 37.7989,
    lng: -122.4662,
    description: 'Historic military post & eucalyptus wooded parkland',
  },
  {
    id: 'sf_golden_gate_south',
    name: 'Golden Gate Bridge (South Plaza)',
    city: 'San Francisco',
    region: 'sf',
    type: 'bridge',
    x: 350,
    y: 250,
    lat: 37.8185,
    lng: -122.4783,
    description: 'US-101 Toll Plaza & south bridgehead anchor',
  },
  {
    id: 'sf_soma',
    name: 'SOMA / Moscone Center',
    city: 'San Francisco',
    region: 'sf',
    type: 'city',
    x: 420,
    y: 310,
    lat: 37.784,
    lng: -122.401,
    description: 'Tech hubs, startups, and Howard/Folsom arterials',
  },
  {
    id: 'sf_mission',
    name: 'Mission District',
    city: 'San Francisco',
    region: 'sf',
    type: 'city',
    x: 395,
    y: 335,
    lat: 37.7599,
    lng: -122.4148,
    description: 'Valencia St corridor & Mission Dolores',
  },
  {
    id: 'sf_twin_peaks',
    name: 'Twin Peaks Summit',
    city: 'San Francisco',
    region: 'sf',
    type: 'landmark',
    x: 370,
    y: 345,
    lat: 37.7544,
    lng: -122.4477,
    description: 'Panoramic geographic center of the SF peninsula',
  },
  {
    id: 'sf_sunset',
    name: 'Sunset District / Ocean Beach',
    city: 'San Francisco',
    region: 'sf',
    type: 'city',
    x: 330,
    y: 340,
    lat: 37.753,
    lng: -122.495,
    description: 'Great Highway & Sunset residential avenues',
  },
  {
    id: 'sf_bayview',
    name: 'Bayview / Hunters Point',
    city: 'San Francisco',
    region: 'sf',
    type: 'junction',
    x: 435,
    y: 370,
    lat: 37.7302,
    lng: -122.3844,
    description: 'US-101 & I-280 southern interchange portal',
  },
  {
    id: 'sf_bay_bridge_west',
    name: 'Bay Bridge (West Anchorage)',
    city: 'San Francisco',
    region: 'sf',
    type: 'bridge',
    x: 450,
    y: 295,
    lat: 37.7887,
    lng: -122.3879,
    description: 'I-80 eastbound approach onto the suspension span',
  },
  {
    id: 'treasure_island',
    name: 'Treasure Island / Yerba Buena',
    city: 'San Francisco',
    region: 'sf',
    type: 'junction',
    x: 490,
    y: 275,
    lat: 37.814,
    lng: -122.368,
    description: 'Yerba Buena Tunnel midway portal connecting east/west spans',
  },

  // --- NORTH BAY (MARIN & NAPA/SOLANO) ---
  {
    id: 'marin_gg_north',
    name: 'Golden Gate Bridge (Vista Point)',
    city: 'Sausalito',
    region: 'northbay',
    type: 'bridge',
    x: 340,
    y: 220,
    lat: 37.8325,
    lng: -122.4795,
    description: 'North bridgehead anchor looking back across the strait',
  },
  {
    id: 'marin_headlands',
    name: 'Marin Headlands (Hawk Hill)',
    city: 'Sausalito',
    region: 'northbay',
    type: 'landmark',
    x: 310,
    y: 225,
    lat: 37.828,
    lng: -122.501,
    description: 'Conzelman Road bluffs overlooking the Golden Gate strait',
  },
  {
    id: 'sausalito',
    name: 'Sausalito Harbor',
    city: 'Sausalito',
    region: 'northbay',
    type: 'city',
    x: 335,
    y: 195,
    lat: 37.859,
    lng: -122.4853,
    description: 'Waterfront village & Richardson Bay harbor',
  },
  {
    id: 'mill_valley',
    name: 'Mill Valley / Mt Tamalpais',
    city: 'Mill Valley',
    region: 'northbay',
    type: 'city',
    x: 315,
    y: 165,
    lat: 37.906,
    lng: -122.545,
    description: 'Redwood canyons and US-101 / CA-1 junction',
  },
  {
    id: 'san_rafael_downtown',
    name: 'San Rafael Downtown',
    city: 'San Rafael',
    region: 'northbay',
    type: 'city',
    x: 330,
    y: 125,
    lat: 37.9735,
    lng: -122.5311,
    description: 'Marin County seat and US-101 / I-580 hub',
  },
  {
    id: 'richmond_bridge_west',
    name: 'Richmond–San Rafael Bridge (West)',
    city: 'San Rafael',
    region: 'northbay',
    type: 'bridge',
    x: 370,
    y: 120,
    lat: 37.954,
    lng: -122.475,
    description: 'I-580 Eastbound toll plaza & bridgehead approach',
  },
  {
    id: 'novato',
    name: 'Novato Junction',
    city: 'Novato',
    region: 'northbay',
    type: 'junction',
    x: 320,
    y: 70,
    lat: 38.1074,
    lng: -122.5697,
    description: 'US-101 and CA-37 North Bay corridor junction',
  },
  {
    id: 'vallejo_downtown',
    name: 'Vallejo / Six Flags',
    city: 'Vallejo',
    region: 'northbay',
    type: 'city',
    x: 520,
    y: 75,
    lat: 38.1041,
    lng: -122.2566,
    description: 'I-80 & CA-37 Carquinez Strait junction',
  },

  // --- PENINSULA ---
  {
    id: 'daly_city',
    name: 'Daly City / Mission St',
    city: 'Daly City',
    region: 'peninsula',
    type: 'junction',
    x: 370,
    y: 390,
    lat: 37.6879,
    lng: -122.4702,
    description: 'I-280 & CA-1 split, Gateway to the Peninsula',
  },
  {
    id: 'south_sf',
    name: 'South San Francisco (Biotech Hub)',
    city: 'South San Francisco',
    region: 'peninsula',
    type: 'city',
    x: 410,
    y: 415,
    lat: 37.6547,
    lng: -122.4077,
    description: 'Oyster Point & Genentech campus corridor',
  },
  {
    id: 'pacifica',
    name: 'Pacifica / Linda Mar',
    city: 'Pacifica',
    region: 'peninsula',
    type: 'city',
    x: 325,
    y: 420,
    lat: 37.6138,
    lng: -122.4869,
    description: 'Coastal CA-1 surf bluffs and coastal headlands',
  },
  {
    id: 'sfo_airport',
    name: 'San Francisco Int Airport (SFO)',
    city: 'Millbrae',
    region: 'peninsula',
    type: 'airport',
    x: 440,
    y: 450,
    lat: 37.6213,
    lng: -122.379,
    description: 'International terminals & US-101 / Millbrae Ave exit',
  },
  {
    id: 'san_mateo_downtown',
    name: 'San Mateo Downtown',
    city: 'San Mateo',
    region: 'peninsula',
    type: 'city',
    x: 470,
    y: 505,
    lat: 37.563,
    lng: -122.3255,
    description: 'Central Peninsula hub & CA-92 crossroads',
  },
  {
    id: 'foster_city_bridgehead',
    name: 'San Mateo Bridge (West / Foster City)',
    city: 'Foster City',
    region: 'peninsula',
    type: 'bridge',
    x: 505,
    y: 510,
    lat: 37.558,
    lng: -122.271,
    description: 'CA-92 eastbound bridgehead across the wide bay',
  },
  {
    id: 'crystal_springs',
    name: 'Crystal Springs Reservoir / I-280',
    city: 'Hillsborough',
    region: 'peninsula',
    type: 'junction',
    x: 415,
    y: 500,
    lat: 37.535,
    lng: -122.378,
    description: 'Scenic Junipero Serra Freeway & San Andreas rift valley',
  },
  {
    id: 'redwood_city',
    name: 'Redwood City (Port & Downtown)',
    city: 'Redwood City',
    region: 'peninsula',
    type: 'city',
    x: 505,
    y: 560,
    lat: 37.4852,
    lng: -122.2364,
    description: 'San Mateo County Government & Broadway corridor',
  },
  {
    id: 'half_moon_bay',
    name: 'Half Moon Bay',
    city: 'Half Moon Bay',
    region: 'peninsula',
    type: 'city',
    x: 360,
    y: 550,
    lat: 37.4636,
    lng: -122.4286,
    description: 'Coastal agricultural center & CA-92 west terminus',
  },
  {
    id: 'menlo_park',
    name: 'Menlo Park / Sand Hill Rd',
    city: 'Menlo Park',
    region: 'peninsula',
    type: 'city',
    x: 530,
    y: 595,
    lat: 37.4538,
    lng: -122.1822,
    description: 'Venture Capital row & Meta headquarters',
  },
  {
    id: 'dumbarton_bridge_west',
    name: 'Dumbarton Bridge (West Approach)',
    city: 'Menlo Park',
    region: 'peninsula',
    type: 'bridge',
    x: 565,
    y: 585,
    lat: 37.498,
    lng: -122.148,
    description: 'CA-84 South Bay bridgehead to Fremont',
  },
  {
    id: 'stanford_univ',
    name: 'Stanford University',
    city: 'Palo Alto',
    region: 'peninsula',
    type: 'landmark',
    x: 500,
    y: 620,
    lat: 37.4275,
    lng: -122.1697,
    description: 'Main Quad, Hoover Tower, and Stanford Oval',
  },
  {
    id: 'palo_alto_downtown',
    name: 'Palo Alto Downtown (University Ave)',
    city: 'Palo Alto',
    region: 'peninsula',
    type: 'city',
    x: 535,
    y: 625,
    lat: 37.4419,
    lng: -122.143,
    description: 'University Ave retail & US-101 / Embarcadero connector',
  },
  {
    id: 'mountain_view_google',
    name: 'Mountain View (Googleplex / Shoreline)',
    city: 'Mountain View',
    region: 'peninsula',
    type: 'city',
    x: 565,
    y: 660,
    lat: 37.422,
    lng: -122.0841,
    description: 'Charleston Rd & Shoreline Amphitheatre parkway',
  },
  {
    id: 'sunnyvale_dt',
    name: 'Sunnyvale Downtown / Mathilda',
    city: 'Sunnyvale',
    region: 'peninsula',
    type: 'city',
    x: 605,
    y: 695,
    lat: 37.3688,
    lng: -122.0363,
    description: 'Historic Murphy Ave & Central Expressway junction',
  },

  // --- SOUTH BAY & SILICON VALLEY ---
  {
    id: 'cupertino_apple',
    name: 'Apple Park (Cupertino)',
    city: 'Cupertino',
    region: 'southbay',
    type: 'landmark',
    x: 565,
    y: 725,
    lat: 37.3349,
    lng: -122.009,
    description: 'The Ring campus, Wolfe Rd & I-280 interchange',
  },
  {
    id: 'santa_clara_levis',
    name: "Levi's Stadium & Great America",
    city: 'Santa Clara',
    region: 'southbay',
    type: 'landmark',
    x: 645,
    y: 690,
    lat: 37.4032,
    lng: -121.9698,
    description: '49ers home stadium, Great America Pkwy & CA-237',
  },
  {
    id: 'sjc_airport',
    name: 'San Jose Mineta Airport (SJC)',
    city: 'San Jose',
    region: 'southbay',
    type: 'airport',
    x: 660,
    y: 725,
    lat: 37.3639,
    lng: -121.9289,
    description: 'Airport Pkwy, US-101 & CA-87 terminal loop',
  },
  {
    id: 'san_jose_downtown',
    name: 'San Jose Downtown (Plaza de César Chávez)',
    city: 'San Jose',
    region: 'southbay',
    type: 'city',
    x: 675,
    y: 770,
    lat: 37.3337,
    lng: -121.8907,
    description: 'Capital of Silicon Valley, San Carlos St & Market St',
  },
  {
    id: 'santana_row',
    name: 'Santana Row / Valley Fair',
    city: 'San Jose',
    region: 'southbay',
    type: 'landmark',
    x: 620,
    y: 755,
    lat: 37.3216,
    lng: -121.9479,
    description: 'Winchester Mystery House & Stevens Creek retail hub',
  },
  {
    id: 'campbell_downtown',
    name: 'Campbell Downtown',
    city: 'Campbell',
    region: 'southbay',
    type: 'city',
    x: 610,
    y: 795,
    lat: 37.2872,
    lng: -121.9449,
    description: 'CA-17 & Hamilton Ave corridor',
  },
  {
    id: 'los_gatos',
    name: 'Los Gatos / Santa Cruz Mts Pass',
    city: 'Los Gatos',
    region: 'southbay',
    type: 'city',
    x: 590,
    y: 840,
    lat: 37.2358,
    lng: -121.9624,
    description: 'Foothill town & CA-17 mountain highway south to Santa Cruz',
  },
  {
    id: 'almaden_valley',
    name: 'Almaden Valley / QuickSilver',
    city: 'San Jose',
    region: 'southbay',
    type: 'junction',
    x: 665,
    y: 845,
    lat: 37.2144,
    lng: -121.8519,
    description: 'CA-85 & Almaden Expressway southern terminus',
  },
  {
    id: 'san_jose_east_foothills',
    name: 'East San Jose / Grandview Foothills',
    city: 'San Jose',
    region: 'southbay',
    type: 'junction',
    x: 720,
    y: 760,
    lat: 37.3626,
    lng: -121.8217,
    description: 'I-680 / US-101 / I-280 apex interchange (Joe Colla)',
  },
  {
    id: 'milpitas_great_mall',
    name: 'Milpitas (Great Mall / BART)',
    city: 'Milpitas',
    region: 'southbay',
    type: 'junction',
    x: 695,
    y: 685,
    lat: 37.4162,
    lng: -121.8995,
    description: 'I-880, I-680, and CA-237 tri-highway gateway',
  },

  // --- EAST BAY ---
  {
    id: 'fremont_tesla',
    name: 'Fremont (Tesla Factory / Warm Springs)',
    city: 'Fremont',
    region: 'eastbay',
    type: 'landmark',
    x: 710,
    y: 620,
    lat: 37.4938,
    lng: -121.9442,
    description: 'South Fremont manufacturing hub & I-880 / I-680 connector',
  },
  {
    id: 'fremont_central',
    name: 'Fremont Central Park / Hub',
    city: 'Fremont',
    region: 'eastbay',
    type: 'city',
    x: 685,
    y: 575,
    lat: 37.5485,
    lng: -121.9886,
    description: 'Lake Elizabeth & Mowry Ave corridor',
  },
  {
    id: 'dumbarton_bridge_east',
    name: 'Dumbarton Bridge (East / Newark)',
    city: 'Newark',
    region: 'eastbay',
    type: 'bridge',
    x: 640,
    y: 570,
    lat: 37.525,
    lng: -122.065,
    description: 'CA-84 toll plaza into Fremont/Newark',
  },
  {
    id: 'union_city',
    name: 'Union City / Decoto',
    city: 'Union City',
    region: 'eastbay',
    type: 'junction',
    x: 660,
    y: 535,
    lat: 37.5934,
    lng: -122.0438,
    description: 'I-880 & Alvarado-Niles Rd junction',
  },
  {
    id: 'hayward_downtown',
    name: 'Hayward Downtown / B St',
    city: 'Hayward',
    region: 'eastbay',
    type: 'city',
    x: 625,
    y: 485,
    lat: 37.6688,
    lng: -122.0808,
    description: 'Heart of the Bay, I-880, I-580 & CA-92 connector',
  },
  {
    id: 'san_mateo_bridge_east',
    name: 'San Mateo Bridge (East / Hayward Pier)',
    city: 'Hayward',
    region: 'eastbay',
    type: 'bridge',
    x: 585,
    y: 495,
    lat: 37.618,
    lng: -122.148,
    description: 'CA-92 toll plaza entering East Bay shore',
  },
  {
    id: 'san_leandro',
    name: 'San Leandro / Marina',
    city: 'San Leandro',
    region: 'eastbay',
    type: 'city',
    x: 585,
    y: 435,
    lat: 37.7249,
    lng: -122.1561,
    description: 'I-880 / Davis St & Shoreline parkway',
  },
  {
    id: 'oakland_airport',
    name: 'Oakland Int Airport (OAK)',
    city: 'Oakland',
    region: 'eastbay',
    type: 'airport',
    x: 540,
    y: 410,
    lat: 37.7126,
    lng: -122.2197,
    description: 'Hegenberger Rd & Airport terminal loop',
  },
  {
    id: 'alameda_island',
    name: 'Alameda Island (Park St)',
    city: 'Alameda',
    region: 'eastbay',
    type: 'city',
    x: 505,
    y: 350,
    lat: 37.7652,
    lng: -122.2416,
    description: 'Island city linked via Posey & Webster Tubes',
  },
  {
    id: 'oakland_jack_london',
    name: 'Oakland Jack London Square',
    city: 'Oakland',
    region: 'eastbay',
    type: 'landmark',
    x: 510,
    y: 320,
    lat: 37.7952,
    lng: -122.2798,
    description: 'Historic waterfront harbor & Broadway terminus',
  },
  {
    id: 'oakland_downtown',
    name: 'Oakland Downtown (City Center)',
    city: 'Oakland',
    region: 'eastbay',
    type: 'city',
    x: 520,
    y: 300,
    lat: 37.8044,
    lng: -122.2711,
    description: '14th & Broadway, Lake Merritt & I-980 hub',
  },
  {
    id: 'bay_bridge_east',
    name: 'Bay Bridge (East Toll Plaza)',
    city: 'Oakland',
    region: 'eastbay',
    type: 'bridge',
    x: 515,
    y: 265,
    lat: 37.822,
    lng: -122.315,
    description: 'The Maze interchange (I-80 / I-580 / I-880)',
  },
  {
    id: 'emeryville',
    name: 'Emeryville / Powell St',
    city: 'Emeryville',
    region: 'eastbay',
    type: 'city',
    x: 525,
    y: 245,
    lat: 37.8313,
    lng: -122.2865,
    description: 'Bay Street shopping & Pixar campus',
  },
  {
    id: 'berkeley_campanile',
    name: 'UC Berkeley (Campanile / Sather Tower)',
    city: 'Berkeley',
    region: 'eastbay',
    type: 'landmark',
    x: 550,
    y: 220,
    lat: 37.8721,
    lng: -122.2578,
    description: 'Iconic bell tower, UC Berkeley central campus',
  },
  {
    id: 'berkeley_marina',
    name: 'Berkeley Marina & I-80',
    city: 'Berkeley',
    region: 'eastbay',
    type: 'junction',
    x: 505,
    y: 225,
    lat: 37.865,
    lng: -122.31,
    description: 'University Ave & I-80 Eastshore Freeway',
  },
  {
    id: 'richmond_bridge_east',
    name: 'Richmond–San Rafael Bridge (East Toll)',
    city: 'Richmond',
    region: 'eastbay',
    type: 'bridge',
    x: 460,
    y: 155,
    lat: 37.935,
    lng: -122.415,
    description: 'Point Richmond & I-580 East Bay bridgehead',
  },
  {
    id: 'richmond_downtown',
    name: 'Richmond Downtown / Macdonald',
    city: 'Richmond',
    region: 'eastbay',
    type: 'city',
    x: 480,
    y: 140,
    lat: 37.9358,
    lng: -122.3477,
    description: 'I-80 / I-580 convergence & Richmond Parkway',
  },
  {
    id: 'walnut_creek',
    name: 'Walnut Creek Downtown',
    city: 'Walnut Creek',
    region: 'eastbay',
    type: 'city',
    x: 670,
    y: 240,
    lat: 37.9101,
    lng: -122.0652,
    description: 'I-680 & CA-24 interchange, Mt Diablo gateway',
  },
  {
    id: 'dublin_pleasanton',
    name: 'Dublin / Pleasanton (Hacienda)',
    city: 'Pleasanton',
    region: 'eastbay',
    type: 'junction',
    x: 730,
    y: 440,
    lat: 37.7022,
    lng: -121.8999,
    description: 'I-580 & I-680 Tri-Valley intersection',
  },
];

// Edges with realistic distances and speed limits
export const BAY_EDGES: BayEdge[] = [
  // --- SAN FRANCISCO CORE ARTERIALS & FREEWAYS ---
  {
    u: 'sf_ferry_bldg',
    v: 'sf_fidi',
    distance: 0.5,
    speedLimit: 25,
    roadType: 'arterial',
    name: 'Market St',
  },
  {
    u: 'sf_fidi',
    v: 'sf_fishermans_wharf',
    distance: 1.6,
    speedLimit: 25,
    roadType: 'arterial',
    name: 'Columbus Ave',
  },
  {
    u: 'sf_fishermans_wharf',
    v: 'sf_presidio',
    distance: 2.8,
    speedLimit: 30,
    roadType: 'arterial',
    name: 'Marina Blvd / Lombard',
  },
  {
    u: 'sf_presidio',
    v: 'sf_golden_gate_south',
    distance: 1.4,
    speedLimit: 45,
    roadType: 'highway',
    name: 'US-101 Presidio Pkwy',
  },
  {
    u: 'sf_fidi',
    v: 'sf_soma',
    distance: 0.9,
    speedLimit: 25,
    roadType: 'arterial',
    name: '3rd St / Howard',
  },
  {
    u: 'sf_soma',
    v: 'sf_bay_bridge_west',
    distance: 0.8,
    speedLimit: 45,
    roadType: 'interstate',
    name: 'I-80 E Onramp',
  },
  {
    u: 'sf_soma',
    v: 'sf_mission',
    distance: 1.8,
    speedLimit: 30,
    roadType: 'arterial',
    name: 'Mission St / SOMA',
  },
  {
    u: 'sf_mission',
    v: 'sf_twin_peaks',
    distance: 2.1,
    speedLimit: 30,
    roadType: 'arterial',
    name: 'Market St / Portola',
  },
  {
    u: 'sf_twin_peaks',
    v: 'sf_sunset',
    distance: 2.6,
    speedLimit: 35,
    roadType: 'arterial',
    name: 'Sunset Blvd',
  },
  {
    u: 'sf_presidio',
    v: 'sf_sunset',
    distance: 3.5,
    speedLimit: 35,
    roadType: 'arterial',
    name: '19th Ave (CA-1)',
  },
  {
    u: 'sf_soma',
    v: 'sf_bayview',
    distance: 3.8,
    speedLimit: 60,
    roadType: 'interstate',
    name: 'US-101 S / I-280',
  },
  {
    u: 'sf_mission',
    v: 'sf_bayview',
    distance: 3.2,
    speedLimit: 55,
    roadType: 'highway',
    name: 'I-280 S Central',
  },
  {
    u: 'sf_sunset',
    v: 'daly_city',
    distance: 3.9,
    speedLimit: 45,
    roadType: 'highway',
    name: 'CA-1 S / Junipero Serra',
  },
  {
    u: 'sf_bayview',
    v: 'daly_city',
    distance: 4.1,
    speedLimit: 65,
    roadType: 'interstate',
    name: 'I-280 S Ocean Ave',
  },

  // --- BAY BRIDGE & GOLDEN GATE BRIDGE CROSSINGS ---
  {
    u: 'sf_golden_gate_south',
    v: 'marin_gg_north',
    distance: 1.7,
    speedLimit: 45,
    roadType: 'bridge',
    name: 'Golden Gate Bridge (US-101)',
  },
  {
    u: 'sf_bay_bridge_west',
    v: 'treasure_island',
    distance: 2.1,
    speedLimit: 50,
    roadType: 'bridge',
    name: 'SF–Oakland Bay Bridge (West Span I-80)',
  },
  {
    u: 'treasure_island',
    v: 'bay_bridge_east',
    distance: 2.4,
    speedLimit: 50,
    roadType: 'bridge',
    name: 'SF–Oakland Bay Bridge (East Span I-80)',
  },

  // --- NORTH BAY (MARIN & HIGHWAYS) ---
  {
    u: 'marin_gg_north',
    v: 'marin_headlands',
    distance: 1.9,
    speedLimit: 30,
    roadType: 'arterial',
    name: 'Conzelman Rd',
  },
  {
    u: 'marin_gg_north',
    v: 'sausalito',
    distance: 2.2,
    speedLimit: 35,
    roadType: 'highway',
    name: 'Alexander Ave / US-101',
  },
  {
    u: 'sausalito',
    v: 'mill_valley',
    distance: 3.8,
    speedLimit: 60,
    roadType: 'interstate',
    name: 'US-101 N Richardson Bay',
  },
  {
    u: 'mill_valley',
    v: 'san_rafael_downtown',
    distance: 5.4,
    speedLimit: 65,
    roadType: 'interstate',
    name: 'US-101 N Marin Corridor',
  },
  {
    u: 'san_rafael_downtown',
    v: 'richmond_bridge_west',
    distance: 3.1,
    speedLimit: 55,
    roadType: 'interstate',
    name: 'I-580 E East San Rafael',
  },
  {
    u: 'richmond_bridge_west',
    v: 'richmond_bridge_east',
    distance: 5.5,
    speedLimit: 55,
    roadType: 'bridge',
    name: 'Richmond–San Rafael Bridge (I-580)',
  },
  {
    u: 'san_rafael_downtown',
    v: 'novato',
    distance: 10.2,
    speedLimit: 65,
    roadType: 'interstate',
    name: 'US-101 N Novato Exp',
  },
  {
    u: 'novato',
    v: 'vallejo_downtown',
    distance: 17.5,
    speedLimit: 60,
    roadType: 'highway',
    name: 'CA-37 E Sears Point',
  },
  {
    u: 'vallejo_downtown',
    v: 'richmond_downtown',
    distance: 14.8,
    speedLimit: 65,
    roadType: 'interstate',
    name: 'I-80 W Carquinez Bridge',
  },

  // --- PENINSULA CORRIDORS (US-101, I-280, CA-1) ---
  {
    u: 'daly_city',
    v: 'south_sf',
    distance: 3.3,
    speedLimit: 65,
    roadType: 'interstate',
    name: 'US-101 S / I-280',
  },
  {
    u: 'daly_city',
    v: 'pacifica',
    distance: 5.6,
    speedLimit: 50,
    roadType: 'highway',
    name: 'CA-1 S Coastal',
  },
  {
    u: 'pacifica',
    v: 'half_moon_bay',
    distance: 12.5,
    speedLimit: 50,
    roadType: 'highway',
    name: 'CA-1 S Devils Slide',
  },
  {
    u: 'south_sf',
    v: 'sfo_airport',
    distance: 3.1,
    speedLimit: 65,
    roadType: 'interstate',
    name: 'US-101 S Bayshore',
  },
  {
    u: 'daly_city',
    v: 'crystal_springs',
    distance: 11.2,
    speedLimit: 65,
    roadType: 'interstate',
    name: 'I-280 S Junipero Serra',
  },
  {
    u: 'sfo_airport',
    v: 'san_mateo_downtown',
    distance: 6.2,
    speedLimit: 65,
    roadType: 'interstate',
    name: 'US-101 S San Mateo',
  },
  {
    u: 'san_mateo_downtown',
    v: 'foster_city_bridgehead',
    distance: 3.2,
    speedLimit: 55,
    roadType: 'highway',
    name: 'CA-92 E Foster City',
  },
  {
    u: 'san_mateo_downtown',
    v: 'crystal_springs',
    distance: 3.6,
    speedLimit: 50,
    roadType: 'highway',
    name: 'CA-92 W Hills',
  },
  {
    u: 'crystal_springs',
    v: 'half_moon_bay',
    distance: 8.4,
    speedLimit: 45,
    roadType: 'highway',
    name: 'CA-92 W Half Moon Bay Rd',
  },
  {
    u: 'foster_city_bridgehead',
    v: 'san_mateo_bridge_east',
    distance: 7.1,
    speedLimit: 60,
    roadType: 'bridge',
    name: 'San Mateo–Hayward Bridge (CA-92)',
  },
  {
    u: 'san_mateo_downtown',
    v: 'redwood_city',
    distance: 5.8,
    speedLimit: 65,
    roadType: 'interstate',
    name: 'US-101 S Redwood Shores',
  },
  {
    u: 'crystal_springs',
    v: 'menlo_park',
    distance: 10.4,
    speedLimit: 65,
    roadType: 'interstate',
    name: 'I-280 S Woodside',
  },
  {
    u: 'redwood_city',
    v: 'menlo_park',
    distance: 3.7,
    speedLimit: 65,
    roadType: 'interstate',
    name: 'US-101 S Menlo Park',
  },
  {
    u: 'menlo_park',
    v: 'dumbarton_bridge_west',
    distance: 3.5,
    speedLimit: 55,
    roadType: 'highway',
    name: 'CA-84 E Bayfront Expy',
  },
  {
    u: 'dumbarton_bridge_west',
    v: 'dumbarton_bridge_east',
    distance: 4.8,
    speedLimit: 55,
    roadType: 'bridge',
    name: 'Dumbarton Bridge (CA-84)',
  },
  {
    u: 'menlo_park',
    v: 'stanford_univ',
    distance: 2.1,
    speedLimit: 35,
    roadType: 'arterial',
    name: 'Sand Hill Rd',
  },
  {
    u: 'menlo_park',
    v: 'palo_alto_downtown',
    distance: 1.6,
    speedLimit: 30,
    roadType: 'arterial',
    name: 'El Camino Real',
  },
  {
    u: 'stanford_univ',
    v: 'palo_alto_downtown',
    distance: 1.3,
    speedLimit: 25,
    roadType: 'arterial',
    name: 'Palm Drive / University Ave',
  },
  {
    u: 'stanford_univ',
    v: 'cupertino_apple',
    distance: 10.8,
    speedLimit: 65,
    roadType: 'interstate',
    name: 'I-280 S Foothills',
  },
  {
    u: 'palo_alto_downtown',
    v: 'mountain_view_google',
    distance: 4.9,
    speedLimit: 65,
    roadType: 'interstate',
    name: 'US-101 S Mountain View',
  },
  {
    u: 'mountain_view_google',
    v: 'sunnyvale_dt',
    distance: 4.2,
    speedLimit: 50,
    roadType: 'highway',
    name: 'Central Expressway',
  },

  // --- SOUTH BAY / SILICON VALLEY HIGHWAYS ---
  {
    u: 'mountain_view_google',
    v: 'santa_clara_levis',
    distance: 6.8,
    speedLimit: 60,
    roadType: 'highway',
    name: 'CA-237 E Silicon Valley Expy',
  },
  {
    u: 'sunnyvale_dt',
    v: 'cupertino_apple',
    distance: 3.8,
    speedLimit: 40,
    roadType: 'arterial',
    name: 'Sunnyvale-Saratoga Rd',
  },
  {
    u: 'cupertino_apple',
    v: 'santana_row',
    distance: 4.5,
    speedLimit: 65,
    roadType: 'interstate',
    name: 'I-280 S Cupertino',
  },
  {
    u: 'sunnyvale_dt',
    v: 'sjc_airport',
    distance: 7.1,
    speedLimit: 65,
    roadType: 'interstate',
    name: 'US-101 S Santa Clara',
  },
  {
    u: 'santa_clara_levis',
    v: 'sjc_airport',
    distance: 4.3,
    speedLimit: 55,
    roadType: 'highway',
    name: 'CA-87 / Lafayette',
  },
  {
    u: 'santa_clara_levis',
    v: 'milpitas_great_mall',
    distance: 4.8,
    speedLimit: 60,
    roadType: 'highway',
    name: 'CA-237 E Milpitas',
  },
  {
    u: 'sjc_airport',
    v: 'san_jose_downtown',
    distance: 3.6,
    speedLimit: 55,
    roadType: 'highway',
    name: 'CA-87 S Guadalupe Pkwy',
  },
  {
    u: 'santana_row',
    v: 'san_jose_downtown',
    distance: 3.9,
    speedLimit: 35,
    roadType: 'arterial',
    name: 'Stevens Creek / San Carlos',
  },
  {
    u: 'santana_row',
    v: 'campbell_downtown',
    distance: 2.8,
    speedLimit: 55,
    roadType: 'highway',
    name: 'CA-17 S Campbell',
  },
  {
    u: 'campbell_downtown',
    v: 'los_gatos',
    distance: 4.2,
    speedLimit: 55,
    roadType: 'highway',
    name: 'CA-17 S Los Gatos',
  },
  {
    u: 'cupertino_apple',
    v: 'almaden_valley',
    distance: 10.1,
    speedLimit: 65,
    roadType: 'highway',
    name: 'CA-85 S West Valley Fwy',
  },
  {
    u: 'san_jose_downtown',
    v: 'almaden_valley',
    distance: 7.5,
    speedLimit: 50,
    roadType: 'highway',
    name: 'Almaden Expressway',
  },
  {
    u: 'san_jose_downtown',
    v: 'san_jose_east_foothills',
    distance: 4.2,
    speedLimit: 65,
    roadType: 'interstate',
    name: 'I-280 / US-101 S Interchange',
  },
  {
    u: 'milpitas_great_mall',
    v: 'san_jose_east_foothills',
    distance: 5.7,
    speedLimit: 65,
    roadType: 'interstate',
    name: 'I-680 S East San Jose',
  },
  {
    u: 'sjc_airport',
    v: 'milpitas_great_mall',
    distance: 4.6,
    speedLimit: 65,
    roadType: 'interstate',
    name: 'I-880 N Montague Expy',
  },

  // --- EAST BAY CORRIDORS (I-880, I-580, I-80, I-680, CA-24) ---
  {
    u: 'milpitas_great_mall',
    v: 'fremont_tesla',
    distance: 4.9,
    speedLimit: 65,
    roadType: 'interstate',
    name: 'I-880 N Warm Springs',
  },
  {
    u: 'fremont_tesla',
    v: 'fremont_central',
    distance: 4.6,
    speedLimit: 65,
    roadType: 'interstate',
    name: 'I-880 N Fremont',
  },
  {
    u: 'fremont_central',
    v: 'dumbarton_bridge_east',
    distance: 3.7,
    speedLimit: 45,
    roadType: 'highway',
    name: 'CA-84 W Decoto / Mowry',
  },
  {
    u: 'fremont_central',
    v: 'union_city',
    distance: 3.5,
    speedLimit: 65,
    roadType: 'interstate',
    name: 'I-880 N Alvarado',
  },
  {
    u: 'union_city',
    v: 'hayward_downtown',
    distance: 5.1,
    speedLimit: 65,
    roadType: 'interstate',
    name: 'I-880 N Hayward',
  },
  {
    u: 'hayward_downtown',
    v: 'san_mateo_bridge_east',
    distance: 3.8,
    speedLimit: 55,
    roadType: 'highway',
    name: 'CA-92 W Hayward Shoreline',
  },
  {
    u: 'hayward_downtown',
    v: 'dublin_pleasanton',
    distance: 10.4,
    speedLimit: 65,
    roadType: 'interstate',
    name: 'I-580 E Castro Valley / Dublin Grade',
  },
  {
    u: 'fremont_tesla',
    v: 'dublin_pleasanton',
    distance: 14.2,
    speedLimit: 65,
    roadType: 'interstate',
    name: 'I-680 N Sunol Grade',
  },
  {
    u: 'dublin_pleasanton',
    v: 'walnut_creek',
    distance: 14.8,
    speedLimit: 65,
    roadType: 'interstate',
    name: 'I-680 N San Ramon Valley',
  },
  {
    u: 'hayward_downtown',
    v: 'san_leandro',
    distance: 4.7,
    speedLimit: 65,
    roadType: 'interstate',
    name: 'I-880 N San Leandro',
  },
  {
    u: 'san_leandro',
    v: 'oakland_airport',
    distance: 3.4,
    speedLimit: 55,
    roadType: 'highway',
    name: '98th Ave / Doolittle',
  },
  {
    u: 'oakland_airport',
    v: 'alameda_island',
    distance: 4.8,
    speedLimit: 40,
    roadType: 'arterial',
    name: 'Otis Dr / Bay Farm Island',
  },
  {
    u: 'san_leandro',
    v: 'oakland_downtown',
    distance: 7.9,
    speedLimit: 65,
    roadType: 'interstate',
    name: 'I-880 N Coliseum / East Oakland',
  },
  {
    u: 'alameda_island',
    v: 'oakland_jack_london',
    distance: 1.8,
    speedLimit: 30,
    roadType: 'arterial',
    name: 'Webster St Tube',
  },
  {
    u: 'oakland_jack_london',
    v: 'oakland_downtown',
    distance: 0.9,
    speedLimit: 25,
    roadType: 'arterial',
    name: 'Broadway corridor',
  },
  {
    u: 'oakland_downtown',
    v: 'bay_bridge_east',
    distance: 2.1,
    speedLimit: 60,
    roadType: 'interstate',
    name: 'I-980 / I-80 Maze',
  },
  {
    u: 'oakland_downtown',
    v: 'walnut_creek',
    distance: 14.5,
    speedLimit: 65,
    roadType: 'highway',
    name: 'CA-24 E Caldecott Tunnel',
  },
  {
    u: 'bay_bridge_east',
    v: 'emeryville',
    distance: 1.4,
    speedLimit: 55,
    roadType: 'interstate',
    name: 'I-80 E / Powell St',
  },
  {
    u: 'emeryville',
    v: 'berkeley_campanile',
    distance: 2.7,
    speedLimit: 30,
    roadType: 'arterial',
    name: 'Telegraph Ave / Ashby',
  },
  {
    u: 'emeryville',
    v: 'berkeley_marina',
    distance: 2.3,
    speedLimit: 65,
    roadType: 'interstate',
    name: 'I-80 E Eastshore Fwy',
  },
  {
    u: 'berkeley_marina',
    v: 'berkeley_campanile',
    distance: 2.5,
    speedLimit: 30,
    roadType: 'arterial',
    name: 'University Ave',
  },
  {
    u: 'berkeley_marina',
    v: 'richmond_downtown',
    distance: 5.6,
    speedLimit: 65,
    roadType: 'interstate',
    name: 'I-80 E Albany / El Cerrito',
  },
  {
    u: 'richmond_downtown',
    v: 'richmond_bridge_east',
    distance: 3.4,
    speedLimit: 55,
    roadType: 'interstate',
    name: 'I-580 W Point Richmond',
  },
  {
    u: 'richmond_downtown',
    v: 'walnut_creek',
    distance: 18.2,
    speedLimit: 65,
    roadType: 'highway',
    name: 'CA-4 E / I-680',
  },
];

// Curated Iconic Bay Area Trips for Demo & Testing
export const PRESET_TRIPS: PresetTrip[] = [
  {
    id: 'trip-bay-bridge',
    name: 'SF Ferry Bldg → UC Berkeley Campanile',
    icon: '🌉',
    startId: 'sf_ferry_bldg',
    goalId: 'berkeley_campanile',
    description: 'Iconic transbay commute crossing the SF–Oakland Bay Bridge',
    highlights: ['Bay Bridge I-80', 'The Maze', 'Telegraph Ave', 'UC Berkeley Campus'],
  },
  {
    id: 'trip-golden-gate',
    name: 'Stanford University → Marin Headlands',
    icon: '🌲',
    startId: 'stanford_univ',
    goalId: 'marin_headlands',
    description: 'Silicon Valley to Marin scenic bluffs via I-280 & Golden Gate Bridge',
    highlights: ['Junipero Serra Fwy', '19th Ave CA-1', 'Golden Gate Bridge', 'Hawk Hill'],
  },
  {
    id: 'trip-silicon-valley',
    name: 'SFO Airport → Apple Park (Cupertino)',
    icon: '✈️',
    startId: 'sfo_airport',
    goalId: 'cupertino_apple',
    description: 'Airport transit to Cupertino comparing US-101 vs scenic I-280',
    highlights: ['Bayshore Fwy US-101', 'San Mateo CA-92', 'I-280 Foothills', 'Apple Park'],
  },
  {
    id: 'trip-bay-corridor',
    name: 'San Jose Downtown → SF Financial District',
    icon: '🌊',
    startId: 'san_jose_downtown',
    goalId: 'sf_fidi',
    description: 'The definitive 50-mile Bay Area tech corridor commute',
    highlights: ['Silicon Valley Capital', 'Peninsula Corridor', 'SOMA', 'Transamerica FiDi'],
  },
  {
    id: 'trip-dumbarton',
    name: 'Palo Alto → Fremont (Tesla Factory)',
    icon: '🔄',
    startId: 'palo_alto_downtown',
    goalId: 'fremont_tesla',
    description: 'Lower Bay bridge crossing (CA-84) vs looping around San Jose',
    highlights: ['University Ave', 'Dumbarton Bridge CA-84', 'Salt Ponds', 'Warm Springs'],
  },
  {
    id: 'trip-north-east-bay',
    name: 'San Rafael → Oakland Jack London Square',
    icon: '⚡',
    startId: 'san_rafael_downtown',
    goalId: 'oakland_jack_london',
    description: 'North Bay to East Bay crossing the Richmond–San Rafael Bridge',
    highlights: ['Richmond Bridge I-580', 'Eastshore I-80', 'I-980', 'Historic Waterfront'],
  },
];

// Coastline & Water Polygons for High-Contrast Vector Map Rendering
export interface WaterPolygon {
  name: string;
  points: [number, number][];
}

export const BAY_WATER_POLYGONS: WaterPolygon[] = [
  // San Francisco Central & South Bay
  {
    name: 'San Francisco Bay',
    points: [
      [360, 250],
      [420, 260],
      [450, 280],
      [490, 270],
      [515, 260],
      [510, 310],
      [480, 360],
      [520, 420],
      [570, 490],
      [630, 560],
      [680, 610],
      [660, 670],
      [630, 670],
      [580, 620],
      [550, 570],
      [490, 500],
      [450, 440],
      [430, 380],
      [440, 330],
      [420, 290],
      [360, 250],
    ],
  },
  // San Pablo Bay / North Bay Water
  {
    name: 'San Pablo Bay',
    points: [
      [370, 130],
      [450, 160],
      [490, 140],
      [520, 80],
      [470, 60],
      [380, 65],
      [330, 120],
      [370, 130],
    ],
  },
  // Pacific Ocean Western Coastline
  {
    name: 'Pacific Ocean',
    points: [
      [0, 0],
      [320, 0],
      [300, 180],
      [325, 230],
      [350, 250],
      [315, 270],
      [310, 370],
      [305, 450],
      [330, 550],
      [300, 700],
      [300, 1000],
      [0, 1000],
      [0, 0],
    ],
  },
];

/**
 * Builds an indexed adjacency graph for high-performance pathfinding queries.
 */
export function createBayGraph(): BayGraph {
  const nodes = new Map<string, BayNode>();
  for (const n of BAY_NODES) {
    nodes.set(n.id, n);
  }

  const adjacency = new Map<string, { target: string; edge: BayEdge; weight: number }[]>();
  for (const n of BAY_NODES) {
    adjacency.set(n.id, []);
  }

  for (const e of BAY_EDGES) {
    // Travel time in hours = distance / speedLimit; convert to minutes
    const weightTimeMinutes = (e.distance / e.speedLimit) * 60;
    const uList = adjacency.get(e.u);
    const vList = adjacency.get(e.v);

    if (uList && vList) {
      uList.push({ target: e.v, edge: e, weight: weightTimeMinutes });
      vList.push({ target: e.u, edge: e, weight: weightTimeMinutes });
    }
  }

  return {
    nodes,
    adjacency,
    edges: BAY_EDGES,
  };
}

/**
 * Great-circle distance between two GPS coordinates using Haversine formula (miles).
 */
export function haversineDistanceMiles(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 3958.8; // Earth radius in miles
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Admissible travel-time heuristic in minutes (straight-line distance / max highway speed 65mph).
 */
export function heuristicTravelTimeMinutes(
  nodeA: BayNode,
  nodeB: BayNode,
  maxSpeedMph = 65
): number {
  const distanceMiles = haversineDistanceMiles(nodeA.lat, nodeA.lng, nodeB.lat, nodeB.lng);
  return (distanceMiles / maxSpeedMph) * 60;
}

export interface CustomEndpoint {
  id: string;
  name: string;
  lat: number;
  lng: number;
  city?: string;
  region?: Region;
}

/**
 * Dynamically splices custom arbitrary start and goal coordinates into the Bay Area road network graph.
 * Connects the custom endpoints to the nearest K road nodes with realistic street-level speeds (25-35 mph).
 */
export function spliceCustomEndpoints(
  baseGraph: BayGraph,
  start: CustomEndpoint,
  goal: CustomEndpoint,
  kNearest = 3
): {
  graph: BayGraph;
  startId: string;
  goalId: string;
} {
  const nodes = new Map<string, BayNode>(baseGraph.nodes);
  const adjacency = new Map<string, { target: string; edge: BayEdge; weight: number }[]>();

  // Deep copy adjacency list
  for (const [key, val] of baseGraph.adjacency.entries()) {
    adjacency.set(key, [...val]);
  }

  const customEdges: BayEdge[] = [...baseGraph.edges];

  const processEndpoint = (ep: CustomEndpoint, isStart: boolean) => {
    // If endpoint is an existing node ID, reuse it
    if (nodes.has(ep.id)) {
      return ep.id;
    }

    const customId = ep.id || (isStart ? 'custom_start_node' : 'custom_goal_node');

    // Determine normalized (x,y) from (lat, lng) relative to bounding box
    const normX = Math.round(300 + ((ep.lng - -122.58) / (-121.8 - -122.58)) * 450);
    const normY = Math.round(850 - ((ep.lat - 37.2) / (38.15 - 37.2)) * 790);

    const customNode: BayNode = {
      id: customId,
      name: ep.name,
      city: ep.city || 'Bay Area',
      region: ep.region || 'peninsula',
      type: 'landmark',
      x: Math.max(0, Math.min(1000, normX)),
      y: Math.max(0, Math.min(1000, normY)),
      lat: ep.lat,
      lng: ep.lng,
      description: 'Custom Address Waypoint',
    };

    nodes.set(customId, customNode);
    adjacency.set(customId, []);

    // Find nearest K nodes in base graph
    const candidates: { node: BayNode; distMiles: number }[] = [];
    for (const baseNode of baseGraph.nodes.values()) {
      const dist = haversineDistanceMiles(ep.lat, ep.lng, baseNode.lat, baseNode.lng);
      candidates.push({ node: baseNode, distMiles: dist });
    }

    candidates.sort((a, b) => a.distMiles - b.distMiles);
    const nearest = candidates.slice(0, Math.max(1, kNearest));

    for (const { node: targetNode, distMiles } of nearest) {
      const streetSpeed = 25; // 25 mph local connector
      const edge: BayEdge = {
        u: customId,
        v: targetNode.id,
        distance: Math.max(0.1, Math.round(distMiles * 10) / 10),
        speedLimit: streetSpeed,
        roadType: 'arterial',
        name: `Local Connector to ${targetNode.name}`,
      };

      const weightMinutes = (edge.distance / streetSpeed) * 60;

      customEdges.push(edge);
      adjacency.get(customId)!.push({ target: targetNode.id, edge, weight: weightMinutes });
      adjacency.get(targetNode.id)!.push({ target: customId, edge, weight: weightMinutes });
    }

    return customId;
  };

  const startId = processEndpoint(start, true);
  const goalId = processEndpoint(goal, false);

  return {
    graph: {
      nodes,
      adjacency,
      edges: customEdges,
    },
    startId,
    goalId,
  };
}
