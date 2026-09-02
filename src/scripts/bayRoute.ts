import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {
  type BayGraph,
  type CustomEndpoint,
} from '../lib/bayGraph';
import {
  buildFullCityRoadGraph,
  spliceEndpointIntoCityGraph,
  cityRoadGraphToBayGraph,
  type CityRoadGraph,
} from '../lib/cityRoadGraph';
import {
  type AlgorithmId,
  type PathfindingResult,
  ALGORITHMS,
  runPathfinding,
} from '../lib/pathfinding';
import {
  searchBayAreaPlaces,
  reverseGeocodeLocal,
} from '../lib/geocoding';
import {
  getSecureStoredApiKey,
  loadGoogleMapsSDK,
  onGoogleMapsAuthFailure,
  hasGoogleMapsAuthFailed,
  GOOGLE_MAPS_DARK_STYLE,
} from '../lib/googleMaps';
import { audioEngine } from '../lib/audioFeedback';

export type MapTileStyle = 'dark' | 'light' | 'streets' | 'satellite';

export const FULL_CITY_PRESETS: Record<
  string,
  { start: { name: string; lat: number; lng: number; district: string }; goal: { name: string; lat: number; lng: number; district: string } }
> = {
  trip_sf_to_berkeley: {
    start: { name: 'Market St & Steuart St (Ferry Bldg)', lat: 37.7942, lng: -122.3955, district: 'Downtown' },
    goal: { name: 'University Ave & Oxford St (UC Berkeley)', lat: 37.8719, lng: -122.2585, district: 'Berkeley' },
  },
  'trip-bay-bridge': {
    start: { name: 'Market St & Steuart St (Ferry Bldg)', lat: 37.7942, lng: -122.3955, district: 'Downtown' },
    goal: { name: 'University Ave & Oxford St (UC Berkeley)', lat: 37.8719, lng: -122.2585, district: 'Berkeley' },
  },
  trip_sfo_to_stanford: {
    start: { name: 'San Francisco International Airport (SFO)', lat: 37.6213, lng: -122.3790, district: 'San Bruno' },
    goal: { name: 'Stanford University (Palm Drive & Main Quad)', lat: 37.4275, lng: -122.1697, district: 'Stanford' },
  },
  'trip-golden-gate': {
    start: { name: 'Stanford University (Palm Drive & Main Quad)', lat: 37.4275, lng: -122.1697, district: 'Stanford' },
    goal: { name: 'Golden Gate Bridge Vista Point (Marin Headlands)', lat: 37.8325, lng: -122.4795, district: 'Marin' },
  },
  trip_sj_to_oakland: {
    start: { name: 'San Jose City Hall & Santa Clara St', lat: 37.3382, lng: -121.8863, district: 'San Jose' },
    goal: { name: 'Oakland City Center (Broadway & 14th St)', lat: 37.8044, lng: -122.2712, district: 'Oakland' },
  },
  'trip-silicon-valley': {
    start: { name: 'San Francisco International Airport (SFO)', lat: 37.6213, lng: -122.3790, district: 'San Bruno' },
    goal: { name: 'San Jose City Hall & Santa Clara St', lat: 37.3382, lng: -121.8863, district: 'San Jose' },
  },
  trip_marin_to_sf: {
    start: { name: 'Golden Gate Bridge Vista Point (Marin Headlands)', lat: 37.8325, lng: -122.4795, district: 'Marin' },
    goal: { name: 'Market St & 7th St (Civic Center / City Hall)', lat: 37.7798, lng: -122.4137, district: 'Civic Center' },
  },
  'trip-bay-corridor': {
    start: { name: 'San Jose City Hall & Santa Clara St', lat: 37.3382, lng: -121.8863, district: 'San Jose' },
    goal: { name: 'Market St & 1st St (FiDi)', lat: 37.7909, lng: -122.3998, district: 'FiDi' },
  },
  trip_cross_bay_bridges: {
    start: { name: 'Market St & Steuart St (Ferry Bldg)', lat: 37.7942, lng: -122.3955, district: 'Downtown' },
    goal: { name: 'Geary Blvd & Great Highway (Ocean Beach)', lat: 37.7785, lng: -122.5135, district: 'Ocean Beach' },
  },
  'trip-dumbarton': {
    start: { name: 'Geary Blvd & Great Highway (Ocean Beach)', lat: 37.7785, lng: -122.5135, district: 'Ocean Beach' },
    goal: { name: 'Market St & Steuart St (Ferry Bldg)', lat: 37.7942, lng: -122.3955, district: 'Downtown' },
  },
};

export class BayRouteVisualizer {
  private mapEl: HTMLElement;
  private canvasEl: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private container: HTMLElement;

  // Map Engines
  public isGoogleMapsActive: boolean = false;
  private gmap: google.maps.Map | null = null;
  private gmapStartMarker: google.maps.Marker | null = null;
  private gmapGoalMarker: google.maps.Marker | null = null;

  private leafletMap: L.Map | null = null;
  private leafletTileLayer: L.TileLayer | null = null;
  private leafletStartMarker: L.Marker | null = null;
  private leafletGoalMarker: L.Marker | null = null;

  private currentTileStyle: MapTileStyle = 'dark';

  // High-Density Full City Road Graph
  private cityBaseGraph: CityRoadGraph;
  private activeCityGraph: CityRoadGraph;
  private activeBayGraph: BayGraph;

  public currentStartEndpoint: CustomEndpoint;
  public currentGoalEndpoint: CustomEndpoint;
  private startId: string = 'mkt_steuart';
  private goalId: string = 'berkeley_campus';

  // App & Algorithm State
  public currentAlgorithm: AlgorithmId = 'dijkstra';
  public isRaceMode: boolean = false;
  private currentResult: PathfindingResult | null = null;
  private raceResults: Map<AlgorithmId, PathfindingResult> = new Map();
  private currentStepIndex: number = 0;
  private isPlaying: boolean = false;
  private animationSpeed: number = 1;
  private animFrameId: number | null = null;
  private lastFrameTimestamp: number = 0;
  private stepsAccumulator: number = 0;

  // Hover & Inspector State
  private hoveredNodeId: string | null = null;

  private isDarkTheme: boolean = true;
  private isMapReady: boolean = false;

  constructor(mapEl: HTMLElement, canvasEl: HTMLCanvasElement, container: HTMLElement) {
    this.mapEl = mapEl;
    this.canvasEl = canvasEl;
    const ctx = canvasEl.getContext('2d');
    if (!ctx) throw new Error('Failed to get 2D canvas context');
    this.ctx = ctx;
    this.container = container;

    // 1. Build the authentic full city road graph
    this.cityBaseGraph = buildFullCityRoadGraph();
    this.activeCityGraph = this.cityBaseGraph;
    this.activeBayGraph = cityRoadGraphToBayGraph(this.activeCityGraph);

    const defaultPreset = FULL_CITY_PRESETS.trip_sf_to_berkeley;
    this.currentStartEndpoint = {
      id: 'mkt_steuart',
      name: defaultPreset.start.name,
      lat: defaultPreset.start.lat,
      lng: defaultPreset.start.lng,
      city: defaultPreset.start.district,
      region: 'sf',
    };

    this.currentGoalEndpoint = {
      id: 'berkeley_campus',
      name: defaultPreset.goal.name,
      lat: defaultPreset.goal.lat,
      lng: defaultPreset.goal.lng,
      city: defaultPreset.goal.district,
      region: 'sf',
    };

    this.detectTheme();

    onGoogleMapsAuthFailure(() => {
      this.switchToLeafletFallback();
    });

    this.initMapEngine();
    this.bindDOMEvents();
    this.setupInspector();
  }

  private detectTheme(): void {
    const theme = document.documentElement.getAttribute('data-theme') || 'dark';
    this.isDarkTheme = theme !== 'light' && theme !== 'parchment';
    this.currentTileStyle = this.isDarkTheme ? 'dark' : 'light';
  }

  private async initMapEngine(): Promise<void> {
    const datasetKey = this.container.getAttribute('data-gmap-token') || '';
    const envKey = datasetKey.trim() || (await getSecureStoredApiKey());

    if (envKey && !hasGoogleMapsAuthFailed()) {
      try {
        await loadGoogleMapsSDK(envKey);
        if (window.google && window.google.maps && !hasGoogleMapsAuthFailed()) {
          this.initGoogleMap();
          return;
        }
      } catch (_e) {
        // Fall back to instant Leaflet engine
      }
    }

    this.initLeafletMap();
  }

  public switchToLeafletFallback(): void {
    if (this.leafletMap) return;
    this.isGoogleMapsActive = false;
    if (this.gmapStartMarker) {
      this.gmapStartMarker.setMap(null);
      this.gmapStartMarker = null;
    }
    if (this.gmapGoalMarker) {
      this.gmapGoalMarker.setMap(null);
      this.gmapGoalMarker = null;
    }
    this.gmap = null;
    this.mapEl.replaceChildren();
    this.updateMapBadge('High-Res GIS Map');
    this.initLeafletMap();
  }

  private updateMapBadge(text: string): void {
    const badge = this.container.querySelector('[data-br-map-badge]');
    if (badge) {
      badge.textContent = `🗺️ ${text}`;
    }
  }

  // --- GOOGLE MAPS ENGINE INITIALIZATION ---
  private initGoogleMap(): void {
    if (!window.google || !window.google.maps) return;

    if (this.leafletMap) {
      this.leafletMap.remove();
      this.leafletMap = null;
    }

    this.mapEl.replaceChildren();

    const center = { lat: 37.785, lng: -122.41 };
    this.gmap = new window.google.maps.Map(this.mapEl, {
      center,
      zoom: 12,
      minZoom: 9,
      maxZoom: 19,
      styles: this.isDarkTheme ? GOOGLE_MAPS_DARK_STYLE : undefined,
      disableDefaultUI: true,
      zoomControl: true,
      mapTypeId: this.currentTileStyle === 'satellite' ? 'hybrid' : 'roadmap',
    });

    const watchdogTimer = setTimeout(() => {
      if (!this.isMapReady && !this.leafletMap) {
        console.warn('[BayRoute] Google Maps initialization timed out. Switching to Leaflet GIS fallback.');
        this.switchToLeafletFallback();
      }
    }, 2500);

    window.google.maps.event.addListenerOnce(this.gmap, 'idle', () => {
      clearTimeout(watchdogTimer);
      if (hasGoogleMapsAuthFailed()) {
        this.switchToLeafletFallback();
        return;
      }
      this.isGoogleMapsActive = true;
      this.isMapReady = true;
      this.updateMapBadge('Google Maps Active');
      this.syncCanvasDimensions();
      this.recalculate();
    });

    this.gmap.addListener('bounds_changed', () => {
      this.syncCanvasDimensions();
      this.render();
    });

    this.gmap.addListener('click', (e: google.maps.MapMouseEvent) => {
      if (e.latLng) {
        this.handleMapClick(e.latLng.lat(), e.latLng.lng());
      }
    });

    this.syncCanvasDimensions();
  }

  // --- LEAFLET MAP ENGINE INITIALIZATION ---
  private initLeafletMap(): void {
    if (this.gmap) {
      this.gmap = null;
    }
    this.mapEl.replaceChildren();

    const cityCenter: L.LatLngExpression = [37.785, -122.41];
    this.leafletMap = L.map(this.mapEl, {
      center: cityCenter,
      zoom: 12,
      minZoom: 9,
      maxZoom: 18,
      zoomControl: false,
      attributionControl: false,
    });

    L.control.zoom({ position: 'topright' }).addTo(this.leafletMap);
    this.updateLeafletTileLayer();

    this.leafletMap.on('move zoom viewreset resize', () => {
      this.syncCanvasDimensions();
      this.render();
    });

    this.leafletMap.on('click', (e: L.LeafletMouseEvent) => {
      this.handleMapClick(e.latlng.lat, e.latlng.lng);
    });

    this.isMapReady = true;

    requestAnimationFrame(() => {
      this.leafletMap?.invalidateSize();
      this.syncCanvasDimensions();
      this.recalculate();
    });
  }

  private updateLeafletTileLayer(): void {
    if (!this.leafletMap) return;
    if (this.leafletTileLayer) {
      this.leafletMap.removeLayer(this.leafletTileLayer);
    }

    let url = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';
    switch (this.currentTileStyle) {
      case 'dark':
        url = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';
        break;
      case 'light':
        url = 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png';
        break;
      case 'streets':
        url = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
        break;
      case 'satellite':
        url = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
        break;
    }

    this.leafletTileLayer = L.tileLayer(url, {
      subdomains: ['a', 'b', 'c', 'd'],
      maxZoom: 19,
    }).addTo(this.leafletMap);
  }

  public setTileStyle(style: MapTileStyle): void {
    this.currentTileStyle = style;
    if (this.gmap) {
      if (style === 'satellite') {
        this.gmap.setMapTypeId('hybrid');
      } else {
        this.gmap.setMapTypeId('roadmap');
        this.gmap.setOptions({
          styles: style === 'dark' || this.isDarkTheme ? GOOGLE_MAPS_DARK_STYLE : undefined,
        });
      }
    } else if (this.leafletMap) {
      this.updateLeafletTileLayer();
    }
    this.render();
  }

  private syncCanvasDimensions(): void {
    const rect = this.mapEl.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const width = rect.width || 800;
    const height = rect.height || 560;

    this.canvasEl.width = width * dpr;
    this.canvasEl.height = height * dpr;
    this.canvasEl.style.width = `${width}px`;
    this.canvasEl.style.height = `${height}px`;

    this.ctx.resetTransform();
    this.ctx.scale(dpr, dpr);
  }

  private latLngToPoint(lat: number, lng: number): { x: number; y: number } {
    if (this.gmap && window.google && window.google.maps) {
      const bounds = this.gmap.getBounds();
      const projection = this.gmap.getProjection();
      if (!bounds || !projection) return { x: 0, y: 0 };

      const topRight = projection.fromLatLngToPoint(bounds.getNorthEast());
      const bottomLeft = projection.fromLatLngToPoint(bounds.getSouthWest());
      const point = projection.fromLatLngToPoint(new window.google.maps.LatLng(lat, lng));
      if (!topRight || !bottomLeft || !point) return { x: 0, y: 0 };

      const rect = this.mapEl.getBoundingClientRect();
      const scale = rect.width / (topRight.x - bottomLeft.x);
      const x = (point.x - bottomLeft.x) * scale;
      const y = (point.y - topRight.y) * scale;
      return { x, y };
    }

    if (this.leafletMap) {
      const p = this.leafletMap.latLngToContainerPoint([lat, lng]);
      return { x: p.x, y: p.y };
    }

    return { x: 0, y: 0 };
  }

  private bindDOMEvents(): void {
    document.addEventListener('khc:theme-change', () => {
      this.detectTheme();
      this.setTileStyle(this.isDarkTheme ? 'dark' : 'light');
    });

    const observer = new MutationObserver(() => {
      this.detectTheme();
      this.setTileStyle(this.isDarkTheme ? 'dark' : 'light');
    });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    });

    window.addEventListener('resize', () => {
      this.leafletMap?.invalidateSize();
      this.syncCanvasDimensions();
      this.render();
    });

    this.setupAutocomplete('start');
    this.setupAutocomplete('goal');
  }

  private setupAutocomplete(type: 'start' | 'goal'): void {
    const input = this.container.querySelector<HTMLInputElement>(`[data-br-input="${type}"]`);
    const resultsContainer = this.container.querySelector<HTMLElement>(`[data-br-results="${type}"]`);
    if (!input || !resultsContainer) return;

    let debounceTimer: ReturnType<typeof setTimeout>;

    input.addEventListener('input', () => {
      clearTimeout(debounceTimer);
      const query = input.value.trim();

      if (query.length < 2) {
        resultsContainer.hidden = true;
        resultsContainer.replaceChildren();
        return;
      }

      debounceTimer = setTimeout(async () => {
        const places = await searchBayAreaPlaces(query, 5);
        resultsContainer.replaceChildren();

        if (places.length === 0) {
          resultsContainer.hidden = true;
          return;
        }

        resultsContainer.hidden = false;
        for (const place of places) {
          const item = document.createElement('button');
          item.type = 'button';
          item.className = 'br-autocomplete-item';

          const title = document.createElement('strong');
          title.textContent = place.name;
          item.appendChild(title);

          const sub = document.createElement('span');
          sub.textContent = place.address || `${place.city} · ${place.region.toUpperCase()}`;
          item.appendChild(sub);

          item.addEventListener('click', () => {
            input.value = place.name;
            resultsContainer.hidden = true;

            const endpoint: CustomEndpoint = {
              id: `custom_${type}_node`,
              name: place.name,
              lat: place.lat,
              lng: place.lng,
              city: place.city,
              region: place.region,
            };

            if (type === 'start') {
              this.currentStartEndpoint = endpoint;
            } else {
              this.currentGoalEndpoint = endpoint;
            }

            this.recalculate();
            this.fitRouteBounds();
          });

          resultsContainer.appendChild(item);
        }
      }, 200);
    });

    document.addEventListener('click', (e) => {
      if (!input.contains(e.target as Node) && !resultsContainer.contains(e.target as Node)) {
        resultsContainer.hidden = true;
      }
    });
  }

  private setupInspector(): void {
    const tooltip = this.container.querySelector<HTMLElement>('[data-br-inspector]');
    if (!tooltip) return;

    const viewport = this.container.querySelector<HTMLElement>('.br-map-viewport') || this.canvasEl;

    viewport.addEventListener('mousemove', (e) => {
      const rect = this.canvasEl.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      // Find nearest node within 22px radius
      let nearestId: string | null = null;
      let minDistance = 22;

      for (const [id, node] of this.activeBayGraph.nodes) {
        const p = this.latLngToPoint(node.lat, node.lng);
        const dist = Math.hypot(p.x - mouseX, p.y - mouseY);
        if (dist < minDistance) {
          minDistance = dist;
          nearestId = id;
        }
      }

      this.hoveredNodeId = nearestId;

      if (nearestId && this.currentResult) {
        const node = this.activeBayGraph.nodes.get(nearestId)!;
        const step = this.currentResult.steps.find((s) => s.nodeId === nearestId);

        tooltip.hidden = false;
        tooltip.style.transform = `translate(${mouseX + 16}px, ${mouseY + 16}px)`;

        const elTitle = tooltip.querySelector('[data-inspector-title]');
        const elG = tooltip.querySelector('[data-inspector-g]');
        const elH = tooltip.querySelector('[data-inspector-h]');
        const elF = tooltip.querySelector('[data-inspector-f]');
        const elEdge = tooltip.querySelector('[data-inspector-edge]');

        if (elTitle) elTitle.textContent = node.name;
        if (elG) elG.textContent = step ? `${Math.round(step.g * 10) / 10} min` : 'Unvisited';
        if (elH) elH.textContent = step ? `${Math.round(step.h * 10) / 10} min` : '—';
        if (elF) elF.textContent = step ? `${Math.round(step.f * 10) / 10} min` : '—';
        if (elEdge) elEdge.textContent = step?.edgeName ? `Via: ${step.edgeName}` : `District: ${node.city}`;
      } else {
        tooltip.hidden = true;
      }

      this.render();
    });

    viewport.addEventListener('mouseleave', () => {
      this.hoveredNodeId = null;
      if (tooltip) tooltip.hidden = true;
      this.render();
    });
  }

  private handleMapClick(lat: number, lng: number): void {
    const geo = reverseGeocodeLocal(lat, lng);
    const goalInput = this.container.querySelector<HTMLInputElement>('[data-br-input="goal"]');
    if (goalInput) goalInput.value = geo.name;

    this.currentGoalEndpoint = {
      id: 'custom_goal_node',
      name: geo.name,
      lat,
      lng,
      city: geo.city,
      region: geo.region,
    };

    this.recalculate();
  }

  public loadTrip(tripId: string): void {
    const preset = FULL_CITY_PRESETS[tripId];
    if (!preset) return;

    this.currentStartEndpoint = {
      id: `start_${tripId}`,
      name: preset.start.name,
      lat: preset.start.lat,
      lng: preset.start.lng,
      city: preset.start.district,
      region: 'sf',
    };

    this.currentGoalEndpoint = {
      id: `goal_${tripId}`,
      name: preset.goal.name,
      lat: preset.goal.lat,
      lng: preset.goal.lng,
      city: preset.goal.district,
      region: 'sf',
    };

    const startInput = this.container.querySelector<HTMLInputElement>('[data-br-input="start"]');
    const goalInput = this.container.querySelector<HTMLInputElement>('[data-br-input="goal"]');
    if (startInput) startInput.value = preset.start.name;
    if (goalInput) goalInput.value = preset.goal.name;

    this.recalculate();
    this.fitRouteBounds();
  }

  public fitRouteBounds(): void {
    if (this.gmap && window.google && window.google.maps) {
      const bounds = new window.google.maps.LatLngBounds();
      bounds.extend({ lat: this.currentStartEndpoint.lat, lng: this.currentStartEndpoint.lng });
      bounds.extend({ lat: this.currentGoalEndpoint.lat, lng: this.currentGoalEndpoint.lng });
      this.gmap.fitBounds(bounds, 60);
    } else if (this.leafletMap) {
      const bounds = L.latLngBounds(
        [this.currentStartEndpoint.lat, this.currentStartEndpoint.lng],
        [this.currentGoalEndpoint.lat, this.currentGoalEndpoint.lng]
      );
      this.leafletMap.fitBounds(bounds, { padding: [60, 60], maxZoom: 14 });
    }
  }

  public setAlgorithm(alg: AlgorithmId): void {
    this.currentAlgorithm = alg;
    this.recalculate();
  }

  public setRaceMode(enabled: boolean): void {
    this.isRaceMode = enabled;
    this.recalculate();
  }

  public recalculate(): void {
    this.pause();

    // 1. Splice Start into city road graph
    const splicedStart = spliceEndpointIntoCityGraph(this.cityBaseGraph, this.currentStartEndpoint, true);
    // 2. Splice Goal into city road graph
    const splicedGoal = spliceEndpointIntoCityGraph(splicedStart.graph, this.currentGoalEndpoint, false);

    this.activeCityGraph = splicedGoal.graph;
    this.activeBayGraph = cityRoadGraphToBayGraph(this.activeCityGraph);
    this.startId = splicedStart.nodeId;
    this.goalId = splicedGoal.nodeId;

    if (this.isRaceMode) {
      this.raceResults.clear();
      const algos: AlgorithmId[] = [
        'dijkstra',
        'a_star',
        'bidirectional_a_star',
        'greedy',
        'bfs',
      ];
      for (const alg of algos) {
        const res = runPathfinding(alg, this.activeBayGraph, this.startId, this.goalId);
        this.raceResults.set(alg, res);
      }
      this.currentResult = this.raceResults.get(this.currentAlgorithm) || null;
    } else {
      this.currentResult = runPathfinding(
        this.currentAlgorithm,
        this.activeBayGraph,
        this.startId,
        this.goalId
      );
    }

    this.currentStepIndex = 0;
    this.updateMapMarkers();
    this.updateTelemetry();
    this.render();
    this.play();
  }

  private updateMapMarkers(): void {
    if (this.gmap && window.google && window.google.maps) {
      if (this.gmapStartMarker) this.gmapStartMarker.setMap(null);
      if (this.gmapGoalMarker) this.gmapGoalMarker.setMap(null);

      this.gmapStartMarker = new window.google.maps.Marker({
        position: { lat: this.currentStartEndpoint.lat, lng: this.currentStartEndpoint.lng },
        map: this.gmap,
        label: '🚩',
        draggable: true,
      });

      this.gmapGoalMarker = new window.google.maps.Marker({
        position: { lat: this.currentGoalEndpoint.lat, lng: this.currentGoalEndpoint.lng },
        map: this.gmap,
        label: '🏁',
        draggable: true,
      });

      this.gmapStartMarker.addListener('dragend', (e: google.maps.MapMouseEvent) => {
        if (e.latLng) {
          const lat = e.latLng.lat();
          const lng = e.latLng.lng();
          this.currentStartEndpoint.lat = lat;
          this.currentStartEndpoint.lng = lng;
          const geo = reverseGeocodeLocal(lat, lng);
          this.currentStartEndpoint.name = geo.name;
          const input = this.container.querySelector<HTMLInputElement>('[data-br-input="start"]');
          if (input) input.value = geo.name;
          this.recalculate();
        }
      });

      this.gmapGoalMarker.addListener('dragend', (e: google.maps.MapMouseEvent) => {
        if (e.latLng) {
          const lat = e.latLng.lat();
          const lng = e.latLng.lng();
          this.currentGoalEndpoint.lat = lat;
          this.currentGoalEndpoint.lng = lng;
          const geo = reverseGeocodeLocal(lat, lng);
          this.currentGoalEndpoint.name = geo.name;
          const input = this.container.querySelector<HTMLInputElement>('[data-br-input="goal"]');
          if (input) input.value = geo.name;
          this.recalculate();
        }
      });
    } else if (this.leafletMap) {
      if (this.leafletStartMarker) this.leafletMap.removeLayer(this.leafletStartMarker);
      if (this.leafletGoalMarker) this.leafletMap.removeLayer(this.leafletGoalMarker);

      const startIcon = L.divIcon({
        className: 'br-leaflet-marker br-leaflet-marker--start',
        html: `<div class="br-marker-pin br-marker-pin--start">🚩</div>`,
        iconSize: [28, 28],
        iconAnchor: [14, 28],
      });

      const goalIcon = L.divIcon({
        className: 'br-leaflet-marker br-leaflet-marker--goal',
        html: `<div class="br-marker-pin br-marker-pin--goal">🏁</div>`,
        iconSize: [28, 28],
        iconAnchor: [14, 28],
      });

      this.leafletStartMarker = L.marker(
        [this.currentStartEndpoint.lat, this.currentStartEndpoint.lng],
        { icon: startIcon, draggable: true }
      ).addTo(this.leafletMap);

      this.leafletGoalMarker = L.marker(
        [this.currentGoalEndpoint.lat, this.currentGoalEndpoint.lng],
        { icon: goalIcon, draggable: true }
      ).addTo(this.leafletMap);

      this.leafletStartMarker.on('dragend', (e) => {
        const pos = (e.target as L.Marker).getLatLng();
        this.currentStartEndpoint.lat = pos.lat;
        this.currentStartEndpoint.lng = pos.lng;
        const geo = reverseGeocodeLocal(pos.lat, pos.lng);
        this.currentStartEndpoint.name = geo.name;
        const input = this.container.querySelector<HTMLInputElement>('[data-br-input="start"]');
        if (input) input.value = geo.name;
        this.recalculate();
      });

      this.leafletGoalMarker.on('dragend', (e) => {
        const pos = (e.target as L.Marker).getLatLng();
        this.currentGoalEndpoint.lat = pos.lat;
        this.currentGoalEndpoint.lng = pos.lng;
        const geo = reverseGeocodeLocal(pos.lat, pos.lng);
        this.currentGoalEndpoint.name = geo.name;
        const input = this.container.querySelector<HTMLInputElement>('[data-br-input="goal"]');
        if (input) input.value = geo.name;
        this.recalculate();
      });
    }
  }

  // --- PLAYBACK CONTROLS ---
  public play(): void {
    if (this.isPlaying) return;
    this.isPlaying = true;
    this.lastFrameTimestamp = performance.now();
    this.stepsAccumulator = 0;
    this.animateLoop();
    this.updatePlayStateUI();
  }

  public pause(): void {
    this.isPlaying = false;
    if (this.animFrameId !== null) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }
    this.updatePlayStateUI();
  }

  public stepForward(): void {
    this.pause();
    const max = this.getMaxSteps();
    if (this.currentStepIndex < max) {
      this.currentStepIndex++;
      this.updateTelemetry();
      this.render();
      audioEngine.playStepSound(this.currentStepIndex / max);
    }
  }

  public stepBackward(): void {
    this.pause();
    if (this.currentStepIndex > 0) {
      this.currentStepIndex--;
      this.updateTelemetry();
      this.render();
    }
  }

  public scrubTo(fraction: number): void {
    this.pause();
    const max = this.getMaxSteps();
    this.currentStepIndex = Math.min(max, Math.max(0, Math.round(fraction * max)));
    this.updateTelemetry();
    this.render();
  }

  public setSpeed(speed: number): void {
    this.animationSpeed = speed;
  }

  private getMaxSteps(): number {
    if (this.isRaceMode) {
      let max = 0;
      for (const res of this.raceResults.values()) {
        max = Math.max(max, res.steps.length);
      }
      return max;
    }
    return this.currentResult ? this.currentResult.steps.length - 1 : 0;
  }

  private animateLoop(): void {
    if (!this.isPlaying) return;

    const now = performance.now();
    const deltaMs = now - this.lastFrameTimestamp;
    this.lastFrameTimestamp = now;

    const maxSteps = this.getMaxSteps();

    if (this.animationSpeed >= 999) {
      this.currentStepIndex = maxSteps;
      this.pause();
      this.updateTelemetry();
      this.render();
      audioEngine.playArrivalFanfare();
      return;
    }

    const stepsPerSecond = 35 * this.animationSpeed;
    this.stepsAccumulator += (deltaMs / 1000) * stepsPerSecond;

    const stepsToAdvance = Math.floor(this.stepsAccumulator);
    if (stepsToAdvance > 0) {
      this.stepsAccumulator -= stepsToAdvance;
      this.currentStepIndex = Math.min(
        maxSteps,
        this.currentStepIndex + stepsToAdvance
      );

      // Play exploration sonic blip
      if (maxSteps > 0) {
        audioEngine.playStepSound(this.currentStepIndex / maxSteps);
      }

      this.updateTelemetry();
      this.render();

      if (this.currentStepIndex >= maxSteps) {
        this.pause();
        audioEngine.playArrivalFanfare();
        return;
      }
    }

    this.animFrameId = requestAnimationFrame(() => this.animateLoop());
  }

  private updatePlayStateUI(): void {
    const playBtn = this.container.querySelector<HTMLButtonElement>('[data-br-play]');
    if (playBtn) {
      playBtn.textContent = this.isPlaying ? '⏸ Pause' : '▶ Play';
    }
  }

  private updateTelemetry(): void {
    const maxSteps = this.getMaxSteps();
    const progress = maxSteps > 0 ? this.currentStepIndex / maxSteps : 0;

    const scrubber = this.container.querySelector<HTMLInputElement>('[data-br-scrubber]');
    if (scrubber) scrubber.value = String(Math.round(progress * 100));

    if (!this.currentResult) return;

    const safeIdx = Math.min(this.currentStepIndex, this.currentResult.steps.length - 1);
    const currStep = this.currentResult.steps[safeIdx] || this.currentResult.steps[0];

    const elExplored = this.container.querySelector('[data-metric-explored]');
    const elFrontier = this.container.querySelector('[data-metric-frontier]');
    const elDistance = this.container.querySelector('[data-metric-distance]');
    const elTime = this.container.querySelector('[data-metric-time]');
    const elOptimality = this.container.querySelector('[data-metric-optimality]');

    if (elExplored) elExplored.textContent = String(currStep.closedSetCount);
    if (elFrontier) elFrontier.textContent = String(currStep.openSetCount);

    const isComplete = this.currentStepIndex >= maxSteps;
    if (elDistance) {
      elDistance.textContent = isComplete
        ? `${this.currentResult.totalDistanceMiles} mi`
        : 'Searching...';
    }
    if (elTime) {
      elTime.textContent = isComplete
        ? `${Math.round(this.currentResult.totalTimeMinutes)} min`
        : 'Computing...';
    }
    if (elOptimality) {
      elOptimality.textContent = isComplete
        ? ALGORITHMS[this.currentAlgorithm].isOptimal
          ? '100% (Optimal)'
          : 'Suboptimal'
        : 'Evaluating...';
    }

    if (this.isRaceMode) {
      this.updateRaceLeaderboard();
    }
  }

  private updateRaceLeaderboard(): void {
    const tableBody = this.container.querySelector('[data-br-race-body]');
    if (!tableBody) return;

    const entries = Array.from(this.raceResults.entries()).map(([alg, res]) => {
      const stepIdx = Math.min(this.currentStepIndex, res.steps.length - 1);
      const step = res.steps[stepIdx];
      const reachedGoal = stepIdx >= res.steps.length - 1 && res.found;
      return {
        alg,
        meta: ALGORITHMS[alg],
        explored: step ? step.closedSetCount : 0,
        frontier: step ? step.openSetCount : 0,
        reachedGoal,
        distance: res.totalDistanceMiles,
        time: res.totalTimeMinutes,
      };
    });

    entries.sort((a, b) => {
      if (a.reachedGoal && !b.reachedGoal) return -1;
      if (!a.reachedGoal && b.reachedGoal) return 1;
      return a.explored - b.explored;
    });

    tableBody.replaceChildren();

    for (let rank = 0; rank < entries.length; rank++) {
      const e = entries[rank];
      const tr = document.createElement('tr');
      if (e.reachedGoal) tr.className = 'race-row--finished';

      const tdRank = document.createElement('td');
      const strongRank = document.createElement('strong');
      strongRank.textContent = `#${rank + 1}`;
      tdRank.appendChild(strongRank);
      tr.appendChild(tdRank);

      const tdAlg = document.createElement('td');
      const dot = document.createElement('span');
      dot.className = 'race-color-dot';
      dot.style.background = e.meta.color;
      tdAlg.appendChild(dot);
      const strongAlg = document.createElement('strong');
      strongAlg.textContent = e.meta.name;
      tdAlg.appendChild(strongAlg);
      tr.appendChild(tdAlg);

      const tdExplored = document.createElement('td');
      tdExplored.textContent = String(e.explored);
      tr.appendChild(tdExplored);

      const tdFrontier = document.createElement('td');
      tdFrontier.textContent = String(e.frontier);
      tr.appendChild(tdFrontier);

      const tdDistance = document.createElement('td');
      tdDistance.textContent = e.reachedGoal ? `${e.distance} mi` : '—';
      tr.appendChild(tdDistance);

      const tdTime = document.createElement('td');
      tdTime.textContent = e.reachedGoal ? `${Math.round(e.time)} min` : '—';
      tr.appendChild(tdTime);

      const tdStatus = document.createElement('td');
      const badge = document.createElement('span');
      badge.className = `race-badge ${e.reachedGoal ? 'race-badge--arrived' : 'race-badge--searching'}`;
      badge.textContent = e.reachedGoal ? 'Arrived 🏁' : 'Searching ⚡';
      tdStatus.appendChild(badge);
      tr.appendChild(tdStatus);

      tableBody.appendChild(tr);
    }
  }

  // --- HARDWARE-ACCELERATED CANVAS RENDERING ---
  public render(): void {
    if (!this.isMapReady || !this.activeBayGraph) return;
    const ctx = this.ctx;
    const rect = this.mapEl.getBoundingClientRect();
    ctx.clearRect(0, 0, rect.width, rect.height);

    // Layer 1: The full city road network mesh
    this.renderCityRoadMesh();

    // Layer 2: Glowing explored edges & frontier nodes
    if (this.isRaceMode) {
      for (const res of this.raceResults.values()) {
        this.renderSingleExploration(res);
      }
    } else if (this.currentResult) {
      this.renderSingleExploration(this.currentResult);
    }

    // Layer 3: High-contrast golden optimal highway
    this.renderFinalPath();

    // Layer 4: City intersections & hovered node inspector
    this.renderNodes();
  }

  private renderCityRoadMesh(): void {
    const ctx = this.ctx;

    for (const edge of this.activeBayGraph.edges) {
      const u = this.activeBayGraph.nodes.get(edge.u);
      const v = this.activeBayGraph.nodes.get(edge.v);
      if (!u || !v) continue;

      const p1 = this.latLngToPoint(u.lat, u.lng);
      const p2 = this.latLngToPoint(v.lat, v.lng);

      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);

      if (edge.roadType === 'bridge') {
        ctx.strokeStyle = '#f97316';
        ctx.lineWidth = 3.5;
        ctx.setLineDash([4, 2]);
        ctx.stroke();
        ctx.setLineDash([]);
      } else if (edge.roadType === 'highway' || edge.roadType === 'interstate') {
        ctx.strokeStyle = this.isDarkTheme ? 'rgba(56, 189, 248, 0.45)' : 'rgba(2, 132, 199, 0.55)';
        ctx.lineWidth = 2.8;
        ctx.stroke();
      } else if (edge.roadType === 'arterial') {
        ctx.strokeStyle = this.isDarkTheme ? 'rgba(148, 163, 184, 0.35)' : 'rgba(71, 85, 105, 0.4)';
        ctx.lineWidth = 1.8;
        ctx.stroke();
      } else {
        ctx.strokeStyle = this.isDarkTheme ? 'rgba(100, 116, 139, 0.22)' : 'rgba(148, 163, 184, 0.28)';
        ctx.lineWidth = 1.2;
        ctx.stroke();
      }
    }
  }

  private renderSingleExploration(res: PathfindingResult): void {
    const ctx = this.ctx;
    const stepLimit = Math.min(this.currentStepIndex, res.steps.length - 1);
    const color = ALGORITHMS[res.algorithm].color;

    const settledNodes = new Set<string>();
    const settledEdges: { u: string; v: string }[] = [];
    const frontierNodes = new Set<string>();

    for (let i = 0; i <= stepLimit; i++) {
      const step = res.steps[i];
      if (step.type === 'settle' || step.type === 'meet') {
        settledNodes.add(step.nodeId);
        if (step.parentId) {
          settledEdges.push({ u: step.parentId, v: step.nodeId });
        }
      } else if (step.type === 'frontier') {
        frontierNodes.add(step.nodeId);
      }
    }

    // Explored Edges Laser Glow
    ctx.strokeStyle = color;
    ctx.lineWidth = 3.5;
    ctx.shadowColor = color;
    ctx.shadowBlur = 10;

    for (const { u: uId, v: vId } of settledEdges) {
      const u = this.activeBayGraph.nodes.get(uId);
      const v = this.activeBayGraph.nodes.get(vId);
      if (u && v) {
        const p1 = this.latLngToPoint(u.lat, u.lng);
        const p2 = this.latLngToPoint(v.lat, v.lng);
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.stroke();
      }
    }
    ctx.shadowBlur = 0;

    // Settled Node Discs
    ctx.fillStyle = color;
    for (const nId of settledNodes) {
      const node = this.activeBayGraph.nodes.get(nId);
      if (node) {
        const p = this.latLngToPoint(node.lat, node.lng);
        ctx.beginPath();
        ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Active Frontier Pulse Halo Rings
    for (const nId of frontierNodes) {
      if (settledNodes.has(nId)) continue;
      const node = this.activeBayGraph.nodes.get(nId);
      if (node) {
        const p = this.latLngToPoint(node.lat, node.lng);
        ctx.strokeStyle = color;
        ctx.lineWidth = 2.0;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 7.5, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
  }

  private renderFinalPath(): void {
    if (!this.currentResult || !this.currentResult.found || !this.activeBayGraph) return;

    const maxSteps = this.getMaxSteps();
    if (this.currentStepIndex < maxSteps) return;

    const ctx = this.ctx;
    const path = this.currentResult.path;
    if (path.length < 2) return;

    // Radiant Golden Amber Glow
    ctx.strokeStyle = '#f59e0b';
    ctx.lineWidth = 6.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.shadowColor = '#fbbf24';
    ctx.shadowBlur = 16;

    ctx.beginPath();
    const startNode = this.activeBayGraph.nodes.get(path[0])!;
    const pStart = this.latLngToPoint(startNode.lat, startNode.lng);
    ctx.moveTo(pStart.x, pStart.y);

    for (let i = 1; i < path.length; i++) {
      const node = this.activeBayGraph.nodes.get(path[i])!;
      const p = this.latLngToPoint(node.lat, node.lng);
      ctx.lineTo(p.x, p.y);
    }
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Sharp White Centerline
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2.4;
    ctx.stroke();
  }

  private renderNodes(): void {
    const ctx = this.ctx;

    for (const node of this.activeBayGraph.nodes.values()) {
      const isKey = node.type === 'city' || node.type === 'airport' || node.type === 'landmark';
      const p = this.latLngToPoint(node.lat, node.lng);

      ctx.beginPath();
      ctx.arc(p.x, p.y, isKey ? 3.5 : 2.0, 0, Math.PI * 2);
      ctx.fillStyle = isKey
        ? this.isDarkTheme
          ? '#94a3b8'
          : '#475569'
        : 'rgba(148, 163, 184, 0.4)';
      ctx.fill();
    }

    // Hovered Node Highlight in Inspector HUD
    if (this.hoveredNodeId) {
      const node = this.activeBayGraph.nodes.get(this.hoveredNodeId);
      if (node) {
        const p = this.latLngToPoint(node.lat, node.lng);
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 9, 0, Math.PI * 2);
        ctx.stroke();

        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
}

/**
 * Initializes the visualizer on page mount.
 */
export function initBayRoute(
  mapSelector: string,
  canvasSelector: string,
  containerSelector: string
): BayRouteVisualizer | null {
  const mapEl = document.querySelector<HTMLElement>(mapSelector);
  const canvasEl = document.querySelector<HTMLCanvasElement>(canvasSelector);
  const container = document.querySelector<HTMLElement>(containerSelector);
  if (!mapEl || !canvasEl || !container) return null;
  return new BayRouteVisualizer(mapEl, canvasEl, container);
}
