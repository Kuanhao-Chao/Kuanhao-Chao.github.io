export interface GeocodedPlace {
  id: string;
  name: string;
  address: string;
  city: string;
  region: 'sf' | 'peninsula' | 'southbay' | 'eastbay' | 'northbay';
  lat: number;
  lng: number;
  category: 'landmark' | 'university' | 'tech_campus' | 'transit' | 'address' | 'city';
}

// Bounding box for the 9-County San Francisco Bay Area
export const BAY_AREA_BOUNDS = {
  minLat: 37.0,
  maxLat: 38.3,
  minLng: -123.0,
  maxLng: -121.6,
};

export function isWithinBayArea(lat: number, lng: number): boolean {
  return (
    lat >= BAY_AREA_BOUNDS.minLat &&
    lat <= BAY_AREA_BOUNDS.maxLat &&
    lng >= BAY_AREA_BOUNDS.minLng &&
    lng <= BAY_AREA_BOUNDS.maxLng
  );
}

// Pre-indexed Local Gazetteer of Iconic Bay Area Locations for Instant Zero-Latency Search
export const LOCAL_BAY_GAZETTEER: GeocodedPlace[] = [
  // --- SAN FRANCISCO ---
  {
    id: 'geo_sf_ferry',
    name: 'San Francisco Ferry Building',
    address: '1 Ferry Building, San Francisco, CA 94111',
    city: 'San Francisco',
    region: 'sf',
    lat: 37.7955,
    lng: -122.3937,
    category: 'transit',
  },
  {
    id: 'geo_sf_coit_tower',
    name: 'Coit Tower',
    address: '1 Telegraph Hill Blvd, San Francisco, CA 94133',
    city: 'San Francisco',
    region: 'sf',
    lat: 37.8024,
    lng: -122.4058,
    category: 'landmark',
  },
  {
    id: 'geo_sf_transamerica',
    name: 'Transamerica Pyramid (FiDi)',
    address: '600 Montgomery St, San Francisco, CA 94111',
    city: 'San Francisco',
    region: 'sf',
    lat: 37.7952,
    lng: -122.4028,
    category: 'landmark',
  },
  {
    id: 'geo_sf_salesforce',
    name: 'Salesforce Tower',
    address: '415 Mission St, San Francisco, CA 94105',
    city: 'San Francisco',
    region: 'sf',
    lat: 37.7897,
    lng: -122.3972,
    category: 'tech_campus',
  },
  {
    id: 'geo_sf_golden_gate_bridge',
    name: 'Golden Gate Bridge (Welcome Center)',
    address: 'Golden Gate Bridge, San Francisco, CA 94129',
    city: 'San Francisco',
    region: 'sf',
    lat: 37.8185,
    lng: -122.4783,
    category: 'landmark',
  },
  {
    id: 'geo_sf_palace_fine_arts',
    name: 'Palace of Fine Arts',
    address: '3301 Lyon St, San Francisco, CA 94123',
    city: 'San Francisco',
    region: 'sf',
    lat: 37.8029,
    lng: -122.4484,
    category: 'landmark',
  },
  {
    id: 'geo_sf_fisherman_wharf',
    name: "Fisherman's Wharf / Pier 39",
    address: 'The Embarcadero & Beach St, San Francisco, CA 94133',
    city: 'San Francisco',
    region: 'sf',
    lat: 37.8087,
    lng: -122.4098,
    category: 'landmark',
  },
  {
    id: 'geo_sf_twin_peaks',
    name: 'Twin Peaks',
    address: '501 Twin Peaks Blvd, San Francisco, CA 94114',
    city: 'San Francisco',
    region: 'sf',
    lat: 37.7544,
    lng: -122.4477,
    category: 'landmark',
  },
  {
    id: 'geo_sf_mission_dolores',
    name: 'Mission Dolores Park',
    address: 'Dolores St & 19th St, San Francisco, CA 94114',
    city: 'San Francisco',
    region: 'sf',
    lat: 37.7596,
    lng: -122.4269,
    category: 'landmark',
  },
  {
    id: 'geo_sf_city_hall',
    name: 'San Francisco City Hall',
    address: '1 Dr Carlton B Goodlett Pl, San Francisco, CA 94102',
    city: 'San Francisco',
    region: 'sf',
    lat: 37.7793,
    lng: -122.4193,
    category: 'city',
  },
  {
    id: 'geo_sf_chase_center',
    name: 'Chase Center (Warriors Arena)',
    address: '1 Warriors Way, San Francisco, CA 94158',
    city: 'San Francisco',
    region: 'sf',
    lat: 37.768,
    lng: -122.3877,
    category: 'landmark',
  },
  {
    id: 'geo_sf_oracle_park',
    name: 'Oracle Park (SF Giants)',
    address: '24 Willie Mays Plaza, San Francisco, CA 94107',
    city: 'San Francisco',
    region: 'sf',
    lat: 37.7786,
    lng: -122.3893,
    category: 'landmark',
  },
  {
    id: 'geo_sf_ocean_beach',
    name: 'Ocean Beach / Cliff House',
    address: 'Great Hwy & Balboa St, San Francisco, CA 94121',
    city: 'San Francisco',
    region: 'sf',
    lat: 37.7738,
    lng: -122.5107,
    category: 'landmark',
  },
  {
    id: 'geo_sf_presidio_tunnel_tops',
    name: 'Presidio Tunnel Tops',
    address: '210 Lincoln Blvd, San Francisco, CA 94129',
    city: 'San Francisco',
    region: 'sf',
    lat: 37.8016,
    lng: -122.4582,
    category: 'landmark',
  },
  {
    id: 'geo_sf_ucsf_mission_bay',
    name: 'UCSF Medical Center at Mission Bay',
    address: '1825 4th St, San Francisco, CA 94158',
    city: 'San Francisco',
    region: 'sf',
    lat: 37.7674,
    lng: -122.3912,
    category: 'university',
  },

  // --- PENINSULA ---
  {
    id: 'geo_sfo_airport',
    name: 'San Francisco International Airport (SFO)',
    address: 'San Francisco International Airport, San Francisco, CA 94128',
    city: 'Millbrae',
    region: 'peninsula',
    lat: 37.6213,
    lng: -122.379,
    category: 'transit',
  },
  {
    id: 'geo_genentech_ssf',
    name: 'Genentech Headquarters',
    address: '1 DNA Way, South San Francisco, CA 94080',
    city: 'South San Francisco',
    region: 'peninsula',
    lat: 37.6547,
    lng: -122.4077,
    category: 'tech_campus',
  },
  {
    id: 'geo_san_mateo_dt',
    name: 'San Mateo Downtown',
    address: '300 S El Camino Real, San Mateo, CA 94401',
    city: 'San Mateo',
    region: 'peninsula',
    lat: 37.563,
    lng: -122.3255,
    category: 'city',
  },
  {
    id: 'geo_stanford_univ',
    name: 'Stanford University (Main Quad / Oval)',
    address: '450 Jane Stanford Way, Stanford, CA 94305',
    city: 'Palo Alto',
    region: 'peninsula',
    lat: 37.4275,
    lng: -122.1697,
    category: 'university',
  },
  {
    id: 'geo_meta_hq',
    name: 'Meta Headquarters (1 Hacker Way)',
    address: '1 Hacker Way, Menlo Park, CA 94025',
    city: 'Menlo Park',
    region: 'peninsula',
    lat: 37.4848,
    lng: -122.1484,
    category: 'tech_campus',
  },
  {
    id: 'geo_sand_hill_road',
    name: 'Sand Hill Road Venture Row',
    address: '3000 Sand Hill Rd, Menlo Park, CA 94025',
    city: 'Menlo Park',
    region: 'peninsula',
    lat: 37.421,
    lng: -122.2105,
    category: 'landmark',
  },
  {
    id: 'geo_palo_alto_dt',
    name: 'Palo Alto Downtown (University Ave)',
    address: '400 University Ave, Palo Alto, CA 94301',
    city: 'Palo Alto',
    region: 'peninsula',
    lat: 37.4446,
    lng: -122.1611,
    category: 'city',
  },
  {
    id: 'geo_googleplex',
    name: 'Googleplex (Google HQ)',
    address: '1600 Amphitheatre Pkwy, Mountain View, CA 94043',
    city: 'Mountain View',
    region: 'peninsula',
    lat: 37.422,
    lng: -122.0841,
    category: 'tech_campus',
  },
  {
    id: 'geo_mountain_view_castro',
    name: 'Mountain View Downtown (Castro St)',
    address: '200 Castro St, Mountain View, CA 94041',
    city: 'Mountain View',
    region: 'peninsula',
    lat: 37.394,
    lng: -122.0785,
    category: 'city',
  },
  {
    id: 'geo_half_moon_bay_pier',
    name: 'Half Moon Bay (Pillar Point Harbor)',
    address: '1 Johnson Pier, Half Moon Bay, CA 94019',
    city: 'Half Moon Bay',
    region: 'peninsula',
    lat: 37.5022,
    lng: -122.4831,
    category: 'landmark',
  },
  {
    id: 'geo_pacifica_pier',
    name: 'Pacifica Pier',
    address: '2100 Beach Blvd, Pacifica, CA 94044',
    city: 'Pacifica',
    region: 'peninsula',
    lat: 37.6334,
    lng: -122.4947,
    category: 'landmark',
  },

  // --- SILICON VALLEY & SOUTH BAY ---
  {
    id: 'geo_apple_park',
    name: 'Apple Park (1 Infinite Loop / The Ring)',
    address: '1 Apple Park Way, Cupertino, CA 95014',
    city: 'Cupertino',
    region: 'southbay',
    lat: 37.3349,
    lng: -122.009,
    category: 'tech_campus',
  },
  {
    id: 'geo_apple_infinite_loop',
    name: 'Apple Infinite Loop',
    address: '1 Infinite Loop, Cupertino, CA 95014',
    city: 'Cupertino',
    region: 'southbay',
    lat: 37.3318,
    lng: -122.0312,
    category: 'tech_campus',
  },
  {
    id: 'geo_nvidia_hq',
    name: 'NVIDIA Headquarters (Voyager / Endeavor)',
    address: '2788 San Tomas Expy, Santa Clara, CA 95051',
    city: 'Santa Clara',
    region: 'southbay',
    lat: 37.3708,
    lng: -121.967,
    category: 'tech_campus',
  },
  {
    id: 'geo_levis_stadium',
    name: "Levi's Stadium (49ers Home)",
    address: '4900 Marie P DeBartolo Way, Santa Clara, CA 95054',
    city: 'Santa Clara',
    region: 'southbay',
    lat: 37.4032,
    lng: -121.9698,
    category: 'landmark',
  },
  {
    id: 'geo_sjc_airport',
    name: 'San Jose Mineta Airport (SJC)',
    address: '1701 Airport Blvd, San Jose, CA 95110',
    city: 'San Jose',
    region: 'southbay',
    lat: 37.3639,
    lng: -121.9289,
    category: 'transit',
  },
  {
    id: 'geo_san_jose_city_hall',
    name: 'San Jose City Hall / Downtown',
    address: '200 E Santa Clara St, San Jose, CA 95113',
    city: 'San Jose',
    region: 'southbay',
    lat: 37.3382,
    lng: -121.8863,
    category: 'city',
  },
  {
    id: 'geo_san_jose_sap_center',
    name: 'SAP Center (San Jose Sharks)',
    address: '525 W Santa Clara St, San Jose, CA 95113',
    city: 'San Jose',
    region: 'southbay',
    lat: 37.3327,
    lng: -121.9012,
    category: 'landmark',
  },
  {
    id: 'geo_santana_row',
    name: 'Santana Row',
    address: '377 Santana Row, San Jose, CA 95128',
    city: 'San Jose',
    region: 'southbay',
    lat: 37.3216,
    lng: -121.9479,
    category: 'landmark',
  },
  {
    id: 'geo_los_gatos_dt',
    name: 'Los Gatos Downtown',
    address: '110 E Main St, Los Gatos, CA 95030',
    city: 'Los Gatos',
    region: 'southbay',
    lat: 37.2223,
    lng: -121.9803,
    category: 'city',
  },

  // --- EAST BAY ---
  {
    id: 'geo_uc_berkeley',
    name: 'UC Berkeley (Sather Tower / Campanile)',
    address: 'Sather Tower, Berkeley, CA 94720',
    city: 'Berkeley',
    region: 'eastbay',
    lat: 37.8721,
    lng: -122.2578,
    category: 'university',
  },
  {
    id: 'geo_uc_berkeley_gate',
    name: 'UC Berkeley (Sather Gate / Telegraph Ave)',
    address: '2400 Telegraph Ave, Berkeley, CA 94704',
    city: 'Berkeley',
    region: 'eastbay',
    lat: 37.868,
    lng: -122.259,
    category: 'university',
  },
  {
    id: 'geo_oakland_jack_london',
    name: 'Oakland Jack London Square',
    address: '472 Water St, Oakland, CA 94607',
    city: 'Oakland',
    region: 'eastbay',
    lat: 37.7952,
    lng: -122.2798,
    category: 'landmark',
  },
  {
    id: 'geo_oakland_city_center',
    name: 'Oakland City Center / 14th & Broadway',
    address: '1 Frank H Ogawa Plaza, Oakland, CA 94612',
    city: 'Oakland',
    region: 'eastbay',
    lat: 37.8044,
    lng: -122.2711,
    category: 'city',
  },
  {
    id: 'geo_oakland_lake_merritt',
    name: 'Lake Merritt (Sailboat House)',
    address: '568 Bellevue Ave, Oakland, CA 94610',
    city: 'Oakland',
    region: 'eastbay',
    lat: 37.8081,
    lng: -122.2562,
    category: 'landmark',
  },
  {
    id: 'geo_oak_airport',
    name: 'Oakland International Airport (OAK)',
    address: '1 Airport Dr, Oakland, CA 94621',
    city: 'Oakland',
    region: 'eastbay',
    lat: 37.7126,
    lng: -122.2197,
    category: 'transit',
  },
  {
    id: 'geo_pixar_emeryville',
    name: 'Pixar Animation Studios',
    address: '1200 Park Ave, Emeryville, CA 94608',
    city: 'Emeryville',
    region: 'eastbay',
    lat: 37.8322,
    lng: -122.2831,
    category: 'tech_campus',
  },
  {
    id: 'geo_tesla_fremont',
    name: 'Tesla Factory (Fremont)',
    address: '45500 Fremont Blvd, Fremont, CA 94538',
    city: 'Fremont',
    region: 'eastbay',
    lat: 37.4938,
    lng: -121.9442,
    category: 'tech_campus',
  },
  {
    id: 'geo_fremont_central_park',
    name: 'Fremont Central Park / Lake Elizabeth',
    address: '40000 Paseo Padre Pkwy, Fremont, CA 94538',
    city: 'Fremont',
    region: 'eastbay',
    lat: 37.5485,
    lng: -121.9886,
    category: 'landmark',
  },
  {
    id: 'geo_walnut_creek_dt',
    name: 'Walnut Creek Downtown (Broadway Plaza)',
    address: '1275 Broadway Plaza, Walnut Creek, CA 94596',
    city: 'Walnut Creek',
    region: 'eastbay',
    lat: 37.896,
    lng: -122.059,
    category: 'city',
  },

  // --- NORTH BAY ---
  {
    id: 'geo_marin_headlands',
    name: 'Marin Headlands (Hawk Hill)',
    address: 'Conzelman Rd, Sausalito, CA 94965',
    city: 'Sausalito',
    region: 'northbay',
    lat: 37.828,
    lng: -122.501,
    category: 'landmark',
  },
  {
    id: 'geo_sausalito_ferry',
    name: 'Sausalito Ferry Landing',
    address: 'Tracy Way, Sausalito, CA 94965',
    city: 'Sausalito',
    region: 'northbay',
    lat: 37.8558,
    lng: -122.4789,
    category: 'transit',
  },
  {
    id: 'geo_muir_woods',
    name: 'Muir Woods National Monument',
    address: '1 Muir Woods Rd, Mill Valley, CA 94941',
    city: 'Mill Valley',
    region: 'northbay',
    lat: 37.897,
    lng: -122.5811,
    category: 'landmark',
  },
  {
    id: 'geo_san_rafael_dt',
    name: 'San Rafael Downtown / 4th St',
    address: '1000 4th St, San Rafael, CA 94901',
    city: 'San Rafael',
    region: 'northbay',
    lat: 37.9735,
    lng: -122.5311,
    category: 'city',
  },
];

// In-Memory Geocoding Query Cache
const geocodeCache = new Map<string, GeocodedPlace[]>();

/**
 * Searches the local gazetteer first, then optionally queries online geocoding API.
 */
export async function searchBayAreaPlaces(
  query: string,
  limit = 6
): Promise<GeocodedPlace[]> {
  const clean = query.trim().toLowerCase();
  if (!clean || clean.length < 2) return [];

  if (geocodeCache.has(clean)) {
    return geocodeCache.get(clean)!;
  }

  // 1. Local Gazette matching (Instant & Offline-Capable)
  const localMatches: GeocodedPlace[] = [];
  const queryTokens = clean.split(/\s+/).filter(Boolean);

  for (const place of LOCAL_BAY_GAZETTEER) {
    const haystack = `${place.name} ${place.address} ${place.city} ${place.region}`.toLowerCase();
    const matchesAll = queryTokens.every((t) => haystack.includes(t));
    if (matchesAll) {
      localMatches.push(place);
    }
  }

  if (localMatches.length > 0) {
    const result = localMatches.slice(0, limit);
    geocodeCache.set(clean, result);
    return result;
  }

  // 2. Real-time online OSM Nominatim API query for unindexed addresses
  try {
    const viewbox = `${BAY_AREA_BOUNDS.minLng},${BAY_AREA_BOUNDS.maxLat},${BAY_AREA_BOUNDS.maxLng},${BAY_AREA_BOUNDS.minLat}`;
    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(
      query
    )}&viewbox=${viewbox}&bounded=1&limit=${limit}&addressdetails=1`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 1200);

    const headers: HeadersInit =
      typeof window === 'undefined' ? { 'User-Agent': 'BayRouteVisualizer/1.0 (khchao.com)' } : {};

    const res = await fetch(url, {
      signal: controller.signal,
      headers,
    });
    clearTimeout(timer);

    if (res.ok) {
      const data = await res.json();
      const onlineResults: GeocodedPlace[] = [];

      for (const item of data) {
        const lat = parseFloat(item.lat);
        const lng = parseFloat(item.lon);

        if (isWithinBayArea(lat, lng)) {
          onlineResults.push({
            id: `osm_${item.place_id || Math.random()}`,
            name: item.name || item.display_name.split(',')[0],
            address: item.display_name,
            city: item.address?.city || item.address?.town || item.address?.village || 'Bay Area',
            region: determineRegionFromCoords(lat, lng),
            lat,
            lng,
            category: 'address',
          });
        }
      }

      const combined = [...localMatches];
      for (const on of onlineResults) {
        if (!combined.some((c) => Math.hypot(c.lat - on.lat, c.lng - on.lng) < 0.005)) {
          combined.push(on);
        }
      }

      const finalResult = combined.slice(0, limit);
      geocodeCache.set(clean, finalResult);
      return finalResult;
    }
  } catch (_err) {
    // Graceful fallback to local matches on network timeout or CORS
  }

  geocodeCache.set(clean, localMatches.slice(0, limit));
  return localMatches.slice(0, limit);
}

/**
 * Reverse geocodes a clicked GPS location to find the closest known place or street.
 */
export function reverseGeocodeLocal(lat: number, lng: number): GeocodedPlace {
  let closest: GeocodedPlace = LOCAL_BAY_GAZETTEER[0];
  let minDistance = Infinity;

  for (const place of LOCAL_BAY_GAZETTEER) {
    const d = Math.hypot(place.lat - lat, place.lng - lng);
    if (d < minDistance) {
      minDistance = d;
      closest = place;
    }
  }

  // If reasonably close (< 2 miles / 0.03 deg), use the landmark name
  if (minDistance < 0.03) {
    return {
      id: `custom_${lat.toFixed(4)}_${lng.toFixed(4)}`,
      name: `Near ${closest.name}`,
      address: `${closest.address}`,
      city: closest.city,
      region: closest.region,
      lat,
      lng,
      category: 'address',
    };
  }

  const region = determineRegionFromCoords(lat, lng);
  return {
    id: `custom_${lat.toFixed(4)}_${lng.toFixed(4)}`,
    name: `Location (${lat.toFixed(4)}°N, ${Math.abs(lng).toFixed(4)}°W)`,
    address: `Bay Area (${region.toUpperCase()})`,
    city: 'Bay Area',
    region,
    lat,
    lng,
    category: 'address',
  };
}

function determineRegionFromCoords(
  lat: number,
  lng: number
): 'sf' | 'peninsula' | 'southbay' | 'eastbay' | 'northbay' {
  if (lat > 37.82 && lng < -122.38) return 'northbay';
  if (lat >= 37.71 && lat <= 37.82 && lng <= -122.36) return 'sf';
  if (lng > -122.35 && lat >= 37.45) return 'eastbay';
  if (lat < 37.45 && lng > -122.25) return 'southbay';
  return 'peninsula';
}
