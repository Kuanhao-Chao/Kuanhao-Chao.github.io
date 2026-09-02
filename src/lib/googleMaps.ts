import {
  getSecureStoredApiKey,
  setSecureStoredApiKey,
} from './cryptoStorage';

export const STORAGE_KEY_GMAP_API_KEY = 'bayroute_google_maps_api_key';

export interface ApiDiagnosticsResult {
  valid: boolean;
  mapsJs: boolean;
  places: boolean;
  geocoding: boolean;
  errorMessage?: string;
  recommendations?: string[];
}

// Global script load promise tracker
let gmapScriptPromise: Promise<void> | null = null;
let currentLoadedKey: string | null = null;

export { getSecureStoredApiKey, setSecureStoredApiKey };

let authFailureCallback: (() => void) | null = null;
let hasAuthFailed = false;

export function hasGoogleMapsAuthFailed(): boolean {
  return hasAuthFailed;
}

export function onGoogleMapsAuthFailure(cb: () => void): void {
  authFailureCallback = cb;
  if (hasAuthFailed) {
    try {
      cb();
    } catch (_e) {}
  }
}

if (typeof window !== 'undefined') {
  (window as unknown as { gm_authFailure?: () => void }).gm_authFailure = () => {
    hasAuthFailed = true;
    console.warn('[BayRoute] Google Maps authentication failed (Referrer/Billing error). Switching to OpenStreetMap fallback.');
    if (authFailureCallback) {
      try {
        authFailureCallback();
      } catch (_e) {}
    }
  };
}

/**
 * Dynamically loads the official Google Maps JavaScript API script.
 */
export function loadGoogleMapsSDK(keyString: string): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve();

  // Already loaded with the exact key
  if (window.google && window.google.maps && currentLoadedKey === keyString) {
    return Promise.resolve();
  }

  // If a previous script with different key was loaded, we must reload
  if (gmapScriptPromise && currentLoadedKey === keyString) {
    return gmapScriptPromise;
  }

  gmapScriptPromise = new Promise<void>((resolve, reject) => {
    // Remove existing scripts if reloading key
    const existingScript = document.getElementById('google-maps-sdk-script');
    if (existingScript) {
      existingScript.remove();
    }

    const script = document.createElement('script');
    script.id = 'google-maps-sdk-script';
    script.type = 'text/javascript';
    script.async = true;
    script.defer = true;
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(
      keyString.trim()
    )}&libraries=places,geometry&v=weekly`;

    const timeout = setTimeout(() => {
      reject(new Error('Google Maps JavaScript SDK load timed out after 10 seconds'));
    }, 10000);

    script.onload = () => {
      clearTimeout(timeout);
      currentLoadedKey = keyString.trim();
      resolve();
    };

    script.onerror = () => {
      clearTimeout(timeout);
      reject(new Error('Failed to load Google Maps script. Check network or API key format.'));
    };

    document.head.appendChild(script);
  });

  return gmapScriptPromise;
}

/**
 * Performs real-time diagnostics on the provided Google Maps API key.
 * Tests Maps JS, Places Autocomplete Service, and Geocoder Service.
 */
export async function testGoogleMapsApiKey(keyString: string): Promise<ApiDiagnosticsResult> {
  const result: ApiDiagnosticsResult = {
    valid: false,
    mapsJs: false,
    places: false,
    geocoding: false,
  };

  const cleanKey = keyString.trim();
  if (!cleanKey) {
    result.errorMessage = 'API Key cannot be empty.';
    result.recommendations = ['Enter a valid Google Maps API Key starting with "AIzaSy...".'];
    return result;
  }

  if (!cleanKey.startsWith('AIza')) {
    result.errorMessage = 'Invalid key format. Google API keys typically begin with "AIzaSy...".';
    result.recommendations = ['Check that you copied the complete API key from Google Cloud Console.'];
    return result;
  }

  try {
    await loadGoogleMapsSDK(cleanKey);

    if (!window.google || !window.google.maps) {
      throw new Error('Google Maps object was not initialized on window.');
    }

    // 1. Check Maps JS SDK Core
    result.mapsJs = typeof window.google.maps.Map === 'function';

    // 2. Check Places Autocomplete Service
    try {
      if (window.google.maps.places && window.google.maps.places.AutocompleteService) {
        const placesService = new window.google.maps.places.AutocompleteService();
        await new Promise<void>((res) => {
          placesService.getPlacePredictions(
            { input: 'San Francisco Ferry', bounds: new window.google.maps.LatLngBounds() },
            (predictions, status) => {
              if (
                status === window.google.maps.places.PlacesServiceStatus.OK ||
                status === window.google.maps.places.PlacesServiceStatus.ZERO_RESULTS
              ) {
                result.places = true;
              }
              res();
            }
          );
        });
      }
    } catch (_e) {
      result.places = false;
    }

    // 3. Check Geocoding Service
    try {
      if (window.google.maps.Geocoder) {
        const geocoder = new window.google.maps.Geocoder();
        await new Promise<void>((res) => {
          geocoder.geocode({ address: 'San Francisco, CA' }, (results, status) => {
            if (
              status === window.google.maps.GeocoderStatus.OK ||
              status === window.google.maps.GeocoderStatus.ZERO_RESULTS
            ) {
              result.geocoding = true;
            }
            res();
          });
        });
      }
    } catch (_e) {
      result.geocoding = false;
    }

    result.valid = result.mapsJs;
    return result;
  } catch (err: unknown) {
    result.errorMessage = err instanceof Error ? err.message : String(err);
    result.recommendations = [
      'Make sure "Maps JavaScript API" is enabled in Google Cloud Console.',
      'Make sure "Places API" and "Geocoding API" are enabled.',
      'Check that your API Key HTTP referrer restrictions allow "http://localhost:*/*".',
    ];
    return result;
  }
}

/**
 * Custom Dark-Mode Map Styling JSON for Google Maps.
 * Matches the site design tokens (slate midnight theme with high-contrast neon roads).
 */
export const GOOGLE_MAPS_DARK_STYLE: google.maps.MapTypeStyle[] = [
  { elementType: 'geometry', stylers: [{ color: '#0b1120' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#0b1120' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#94a3b8' }] },
  {
    featureType: 'administrative.locality',
    elementType: 'labels.text.fill',
    stylers: [{ color: '#cbd5e1' }],
  },
  {
    featureType: 'poi',
    elementType: 'labels.text.fill',
    stylers: [{ color: '#64748b' }],
  },
  {
    featureType: 'poi.park',
    elementType: 'geometry',
    stylers: [{ color: '#064e3b' }, { opacity: 0.5 }],
  },
  {
    featureType: 'road',
    elementType: 'geometry',
    stylers: [{ color: '#1e293b' }],
  },
  {
    featureType: 'road',
    elementType: 'geometry.stroke',
    stylers: [{ color: '#0f172a' }],
  },
  {
    featureType: 'road',
    elementType: 'labels.text.fill',
    stylers: [{ color: '#64748b' }],
  },
  {
    featureType: 'road.highway',
    elementType: 'geometry',
    stylers: [{ color: '#334155' }],
  },
  {
    featureType: 'road.highway',
    elementType: 'geometry.stroke',
    stylers: [{ color: '#1e293b' }],
  },
  {
    featureType: 'road.highway',
    elementType: 'labels.text.fill',
    stylers: [{ color: '#e2e8f0' }],
  },
  {
    featureType: 'transit',
    elementType: 'geometry',
    stylers: [{ color: '#1e293b' }],
  },
  {
    featureType: 'water',
    elementType: 'geometry',
    stylers: [{ color: '#082f49' }],
  },
  {
    featureType: 'water',
    elementType: 'labels.text.fill',
    stylers: [{ color: '#38bdf8' }],
  },
];
