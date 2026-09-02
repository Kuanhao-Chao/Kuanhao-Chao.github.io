import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {
  type BayGraph,
  PRESET_TRIPS,
  spliceCustomEndpoints,
  type CustomEndpoint,
} from '../lib/bayGraph';
import { buildDenseBayAreaGraph } from '../lib/realRoads';
import {
  type AlgorithmId,
  type PathfindingResult,
  ALGORITHMS,
  runPathfinding,
} from '../lib/pathfinding';
import {
  searchBayAreaPlaces,
  reverseGeocodeLocal,
  LOCAL_BAY_GAZETTEER,
} from '../lib/geocoding';
import {
  getSecureStoredApiKey,
  loadGoogleMapsSDK,
  GOOGLE_MAPS_DARK_STYLE,
} from '../lib/googleMaps';

export type MapTileStyle = 'dark' | 'light' | 'streets' | 'satellite';

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

  // Road Graph & Endpoints
  private baseGraph: BayGraph;
  private activeGraph: BayGraph;
  public currentStartEndpoint: CustomEndpoint;
  public currentGoalEndpoint: CustomEndpoint;
  private startId: string = 'sf_ferry_bldg';
  private goalId: string = 'berkeley_campanile';

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

  private isDarkTheme: boolean = true;
  private isMapReady: boolean = false;

  constructor(mapEl: HTMLElement, canvasEl: HTMLCanvasElement, container: HTMLElement) {
    this.mapEl = mapEl;
    this.canvasEl = canvasEl;
    const ctx = canvasEl.getContext('2d');
    if (!ctx) throw new Error('Failed to get 2D canvas context');
    this.ctx = ctx;
    this.container = container;

    // Use high-density real-world road graph
    this.baseGraph = buildDenseBayAreaGraph();
    this.activeGraph = this.baseGraph;

    const defaultStart = LOCAL_BAY_GAZETTEER[0]; // SF Ferry Bldg
    const defaultGoal = LOCAL_BAY_GAZETTEER.find((p) => p.id === 'geo_uc_berkeley')!; // UC Berkeley

    this.currentStartEndpoint = {
      id: 'sf_ferry_bldg',
      name: defaultStart.name,
      lat: defaultStart.lat,
      lng: defaultStart.lng,
      city: defaultStart.city,
      region: defaultStart.region,
    };

    this.currentGoalEndpoint = {
      id: 'berkeley_campanile',
      name: defaultGoal.name,
      lat: defaultGoal.lat,
      lng: defaultGoal.lng,
      city: defaultGoal.city,
      region: defaultGoal.region,
    };

    this.detectTheme();
    this.initMapEngine();
    this.bindDOMEvents();
  }

  private detectTheme(): void {
    const theme = document.documentElement.getAttribute('data-theme') || 'dark';
    this.isDarkTheme = theme !== 'light' && theme !== 'parchment';
    this.currentTileStyle = this.isDarkTheme ? 'dark' : 'light';
  }

  private async initMapEngine(): Promise<void> {
    // 1. Try background Google Maps initialization if an environment key is present
    const envKey = await getSecureStoredApiKey();
    if (envKey) {
      try {
        await loadGoogleMapsSDK(envKey);
        if (window.google && window.google.maps) {
          this.initGoogleMap();
          this.isGoogleMapsActive = true;
          this.updateMapBadge('Google Maps Active');
          return;
        }
      } catch (_e) {
        // Fall through to instant Leaflet engine
      }
    }

    // 2. Direct high-speed Leaflet Map Engine (Zero config, zero delays, 100% reliable)
    this.initLeafletMap();
    this.isGoogleMapsActive = false;
    this.updateMapBadge('High-Res GIS Map');
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

    const center = { lat: 37.76, lng: -122.28 };
    this.gmap = new window.google.maps.Map(this.mapEl, {
      center,
      zoom: 10,
      minZoom: 8,
      maxZoom: 19,
      styles: this.isDarkTheme ? GOOGLE_MAPS_DARK_STYLE : undefined,
      disableDefaultUI: true,
      zoomControl: true,
      mapTypeId: this.currentTileStyle === 'satellite' ? 'hybrid' : 'roadmap',
    });

    window.google.maps.event.addListenerOnce(this.gmap, 'idle', () => {
      this.isMapReady = true;
      this.syncCanvasDimensions();
      this.recalculate();
      this.render();
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

  // --- LEAFLET MAP ENGINE INITIALIZATION (DEFAULT & FALLBACK) ---
  private initLeafletMap(): void {
    if (this.gmap) {
      this.gmap = null;
    }
    this.mapEl.replaceChildren();

    const bayCenter: L.LatLngExpression = [37.76, -122.28];
    this.leafletMap = L.map(this.mapEl, {
      center: bayCenter,
      zoom: 10,
      minZoom: 8,
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

    // Invalidate size on next frame so Leaflet tiles fill the container smoothly
    requestAnimationFrame(() => {
      this.leafletMap?.invalidateSize();
      this.syncCanvasDimensions();
      this.recalculate();
      this.render();
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
              id: place.id,
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
      }, 250);
    });

    document.addEventListener('click', (e) => {
      if (!input.contains(e.target as Node) && !resultsContainer.contains(e.target as Node)) {
        resultsContainer.hidden = true;
      }
    });
  }

  private handleMapClick(lat: number, lng: number): void {
    const geo = reverseGeocodeLocal(lat, lng);
    const goalInput = this.container.querySelector<HTMLInputElement>('[data-br-input="goal"]');
    if (goalInput) goalInput.value = geo.name;

    this.currentGoalEndpoint = {
      id: geo.id,
      name: geo.name,
      lat,
      lng,
      city: geo.city,
      region: geo.region,
    };

    this.recalculate();
  }

  public loadTrip(tripId: string): void {
    const trip = PRESET_TRIPS.find((t) => t.id === tripId);
    if (!trip) return;

    const startNode = this.baseGraph.nodes.get(trip.startId);
    const goalNode = this.baseGraph.nodes.get(trip.goalId);

    if (startNode && goalNode) {
      this.currentStartEndpoint = {
        id: startNode.id,
        name: startNode.name,
        lat: startNode.lat,
        lng: startNode.lng,
        city: startNode.city,
        region: startNode.region,
      };

      this.currentGoalEndpoint = {
        id: goalNode.id,
        name: goalNode.name,
        lat: goalNode.lat,
        lng: goalNode.lng,
        city: goalNode.city,
        region: goalNode.region,
      };

      const startInput = this.container.querySelector<HTMLInputElement>('[data-br-input="start"]');
      const goalInput = this.container.querySelector<HTMLInputElement>('[data-br-input="goal"]');
      if (startInput) startInput.value = startNode.name;
      if (goalInput) goalInput.value = goalNode.name;

      this.recalculate();
      this.fitRouteBounds();
    }
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

    const { graph, startId, goalId } = spliceCustomEndpoints(
      this.baseGraph,
      this.currentStartEndpoint,
      this.currentGoalEndpoint,
      4
    );

    this.activeGraph = graph;
    this.startId = startId;
    this.goalId = goalId;

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
        const res = runPathfinding(alg, this.activeGraph, this.startId, this.goalId);
        this.raceResults.set(alg, res);
      }
      this.currentResult = this.raceResults.get(this.currentAlgorithm) || null;
    } else {
      this.currentResult = runPathfinding(
        this.currentAlgorithm,
        this.activeGraph,
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

    if (this.animationSpeed >= 999) {
      this.currentStepIndex = this.getMaxSteps();
      this.pause();
      this.updateTelemetry();
      this.render();
      return;
    }

    const stepsPerSecond = 35 * this.animationSpeed;
    this.stepsAccumulator += (deltaMs / 1000) * stepsPerSecond;

    const stepsToAdvance = Math.floor(this.stepsAccumulator);
    if (stepsToAdvance > 0) {
      this.stepsAccumulator -= stepsToAdvance;
      this.currentStepIndex = Math.min(
        this.getMaxSteps(),
        this.currentStepIndex + stepsToAdvance
      );
      this.updateTelemetry();
      this.render();

      if (this.currentStepIndex >= this.getMaxSteps()) {
        this.pause();
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

  // --- CANVAS RENDERING SYNCHRONIZED WITH GPS MAP ---
  public render(): void {
    if (!this.isMapReady) return;
    const ctx = this.ctx;
    const rect = this.mapEl.getBoundingClientRect();
    ctx.clearRect(0, 0, rect.width, rect.height);

    this.renderRoadNetwork();

    if (this.isRaceMode) {
      for (const res of this.raceResults.values()) {
        this.renderSingleExploration(res);
      }
    } else if (this.currentResult) {
      this.renderSingleExploration(this.currentResult);
    }

    this.renderFinalPath();
    this.renderNodes();
  }

  private renderRoadNetwork(): void {
    const ctx = this.ctx;

    for (const edge of this.activeGraph.edges) {
      const u = this.activeGraph.nodes.get(edge.u);
      const v = this.activeGraph.nodes.get(edge.v);
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
      } else if (edge.roadType === 'highway') {
        ctx.strokeStyle = this.isDarkTheme ? 'rgba(148, 163, 184, 0.4)' : 'rgba(71, 85, 105, 0.5)';
        ctx.lineWidth = 2.5;
        ctx.stroke();
      } else {
        ctx.strokeStyle = this.isDarkTheme ? 'rgba(71, 85, 105, 0.3)' : 'rgba(148, 163, 184, 0.4)';
        ctx.lineWidth = 1.5;
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

    // Settled Edges Glow
    ctx.strokeStyle = color;
    ctx.lineWidth = 3.2;
    ctx.shadowColor = color;
    ctx.shadowBlur = 8;

    for (const { u: uId, v: vId } of settledEdges) {
      const u = this.activeGraph.nodes.get(uId);
      const v = this.activeGraph.nodes.get(vId);
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
      const node = this.activeGraph.nodes.get(nId);
      if (node) {
        const p = this.latLngToPoint(node.lat, node.lng);
        ctx.beginPath();
        ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Active Frontier Pulse Rings
    for (const nId of frontierNodes) {
      if (settledNodes.has(nId)) continue;
      const node = this.activeGraph.nodes.get(nId);
      if (node) {
        const p = this.latLngToPoint(node.lat, node.lng);
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.8;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 8, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
  }

  private renderFinalPath(): void {
    if (!this.currentResult || !this.currentResult.found) return;

    const maxSteps = this.getMaxSteps();
    if (this.currentStepIndex < maxSteps) return;

    const ctx = this.ctx;
    const path = this.currentResult.path;
    if (path.length < 2) return;

    ctx.strokeStyle = '#fbbf24';
    ctx.lineWidth = 6.0;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.shadowColor = '#fbbf24';
    ctx.shadowBlur = 14;

    ctx.beginPath();
    const startNode = this.activeGraph.nodes.get(path[0])!;
    const pStart = this.latLngToPoint(startNode.lat, startNode.lng);
    ctx.moveTo(pStart.x, pStart.y);

    for (let i = 1; i < path.length; i++) {
      const node = this.activeGraph.nodes.get(path[i])!;
      const p = this.latLngToPoint(node.lat, node.lng);
      ctx.lineTo(p.x, p.y);
    }
    ctx.stroke();
    ctx.shadowBlur = 0;

    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2.2;
    ctx.stroke();
  }

  private renderNodes(): void {
    const ctx = this.ctx;
    for (const node of this.activeGraph.nodes.values()) {
      const isKey = node.type === 'city' || node.type === 'airport' || node.type === 'landmark';
      const p = this.latLngToPoint(node.lat, node.lng);
      ctx.beginPath();
      ctx.arc(p.x, p.y, isKey ? 3.5 : 2.0, 0, Math.PI * 2);
      ctx.fillStyle = isKey
        ? this.isDarkTheme
          ? '#94a3b8'
          : '#475569'
        : 'rgba(148, 163, 184, 0.5)';
      ctx.fill();
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
