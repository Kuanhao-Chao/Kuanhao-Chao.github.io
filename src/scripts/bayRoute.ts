import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {
  type BayGraph,
  type BayNode,
  BAY_NODES,
  BAY_EDGES,
  PRESET_TRIPS,
  createBayGraph,
  spliceCustomEndpoints,
  type CustomEndpoint,
} from '../lib/bayGraph';
import {
  type AlgorithmId,
  type PathfindingResult,
  type SearchStep,
  ALGORITHMS,
  runPathfinding,
} from '../lib/pathfinding';
import {
  searchBayAreaPlaces,
  reverseGeocodeLocal,
  type GeocodedPlace,
  LOCAL_BAY_GAZETTEER,
} from '../lib/geocoding';

export type MapTileStyle = 'dark' | 'light' | 'streets' | 'satellite';

export class BayRouteVisualizer {
  private mapEl: HTMLElement;
  private canvasEl: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private container: HTMLElement;

  // Leaflet Map & Layer Instances
  private map: L.Map | null = null;
  private tileLayer: L.TileLayer | null = null;
  private currentTileStyle: MapTileStyle = 'dark';
  private startMarker: L.Marker | null = null;
  private goalMarker: L.Marker | null = null;

  // Graph & Endpoints
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

  // Hover & Theme
  private hoveredNodeId: string | null = null;
  private isDarkTheme: boolean = true;

  constructor(mapEl: HTMLElement, canvasEl: HTMLCanvasElement, container: HTMLElement) {
    this.mapEl = mapEl;
    this.canvasEl = canvasEl;
    const ctx = canvasEl.getContext('2d');
    if (!ctx) throw new Error('Failed to get 2D canvas context');
    this.ctx = ctx;
    this.container = container;

    this.baseGraph = createBayGraph();
    this.activeGraph = this.baseGraph;

    // Default start & goal
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
    this.initMap();
    this.initCanvasOverlay();
    this.bindDOMEvents();
    this.recalculate();
  }

  private detectTheme(): void {
    const theme = document.documentElement.getAttribute('data-theme') || 'dark';
    this.isDarkTheme = theme !== 'light' && theme !== 'parchment';
    this.currentTileStyle = this.isDarkTheme ? 'dark' : 'light';
  }

  private initMap(): void {
    // Center of the Bay Area (SF Bay waters between SF and Oakland)
    const bayCenter: L.LatLngExpression = [37.76, -122.28];

    this.map = L.map(this.mapEl, {
      center: bayCenter,
      zoom: 10,
      minZoom: 8,
      maxZoom: 18,
      zoomControl: false,
      attributionControl: false,
    });

    // Custom Zoom Controls top-right
    L.control.zoom({ position: 'topright' }).addTo(this.map);

    this.updateTileLayer();

    // Map Events to sync Canvas overlay
    this.map.on('move zoom viewreset resize', () => {
      this.syncCanvasDimensions();
      this.render();
    });

    // Map Click to drop custom Start / Goal pins
    this.map.on('click', (e: L.LeafletMouseEvent) => {
      this.handleMapClick(e.latlng.lat, e.latlng.lng);
    });
  }

  private updateTileLayer(): void {
    if (!this.map) return;
    if (this.tileLayer) {
      this.map.removeLayer(this.tileLayer);
    }

    let url = '';
    const subdomains = ['a', 'b', 'c', 'd'];

    switch (this.currentTileStyle) {
      case 'dark':
        url = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';
        break;
      case 'light':
        url = 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png';
        break;
      case 'streets':
        url = 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png';
        break;
      case 'satellite':
        url = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
        break;
    }

    this.tileLayer = L.tileLayer(url, {
      subdomains,
      maxZoom: 19,
    }).addTo(this.map);
  }

  public setTileStyle(style: MapTileStyle): void {
    this.currentTileStyle = style;
    this.updateTileLayer();
    this.render();
  }

  private initCanvasOverlay(): void {
    this.syncCanvasDimensions();
  }

  private syncCanvasDimensions(): void {
    if (!this.map) return;
    const size = this.map.getSize();
    const dpr = window.devicePixelRatio || 1;

    this.canvasEl.width = size.x * dpr;
    this.canvasEl.height = size.y * dpr;
    this.canvasEl.style.width = `${size.x}px`;
    this.canvasEl.style.height = `${size.y}px`;

    this.ctx.resetTransform();
    this.ctx.scale(dpr, dpr);
  }

  private latLngToPoint(lat: number, lng: number): { x: number; y: number } {
    if (!this.map) return { x: 0, y: 0 };
    const p = this.map.latLngToContainerPoint([lat, lng]);
    return { x: p.x, y: p.y };
  }

  private bindDOMEvents(): void {
    document.addEventListener('khc:theme-change', () => {
      this.detectTheme();
      this.updateTileLayer();
      this.render();
    });

    const observer = new MutationObserver(() => {
      this.detectTheme();
      this.updateTileLayer();
      this.render();
    });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
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

    // Close dropdown on outside click
    document.addEventListener('click', (e) => {
      if (!input.contains(e.target as Node) && !resultsContainer.contains(e.target as Node)) {
        resultsContainer.hidden = true;
      }
    });
  }

  private handleMapClick(lat: number, lng: number): void {
    const geo = reverseGeocodeLocal(lat, lng);

    // If start is set, update goal; or toggle between them
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

  public setCustomStart(place: GeocodedPlace): void {
    this.currentStartEndpoint = {
      id: place.id,
      name: place.name,
      lat: place.lat,
      lng: place.lng,
      city: place.city,
      region: place.region,
    };
    const input = this.container.querySelector<HTMLInputElement>('[data-br-input="start"]');
    if (input) input.value = place.name;
    this.recalculate();
  }

  public setCustomGoal(place: GeocodedPlace): void {
    this.currentGoalEndpoint = {
      id: place.id,
      name: place.name,
      lat: place.lat,
      lng: place.lng,
      city: place.city,
      region: place.region,
    };
    const input = this.container.querySelector<HTMLInputElement>('[data-br-input="goal"]');
    if (input) input.value = place.name;
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
    if (!this.map) return;
    const bounds = L.latLngBounds(
      [this.currentStartEndpoint.lat, this.currentStartEndpoint.lng],
      [this.currentGoalEndpoint.lat, this.currentGoalEndpoint.lng]
    );
    this.map.fitBounds(bounds, { padding: [60, 60], maxZoom: 14 });
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

    // Splice custom start and goal coordinates into road network graph
    const { graph, startId, goalId } = spliceCustomEndpoints(
      this.baseGraph,
      this.currentStartEndpoint,
      this.currentGoalEndpoint,
      3
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
    if (!this.map) return;

    if (this.startMarker) this.map.removeLayer(this.startMarker);
    if (this.goalMarker) this.map.removeLayer(this.goalMarker);

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

    this.startMarker = L.marker([this.currentStartEndpoint.lat, this.currentStartEndpoint.lng], {
      icon: startIcon,
      draggable: true,
    }).addTo(this.map);

    this.goalMarker = L.marker([this.currentGoalEndpoint.lat, this.currentGoalEndpoint.lng], {
      icon: goalIcon,
      draggable: true,
    }).addTo(this.map);

    this.startMarker.on('dragend', (e) => {
      const pos = (e.target as L.Marker).getLatLng();
      this.currentStartEndpoint.lat = pos.lat;
      this.currentStartEndpoint.lng = pos.lng;
      const geo = reverseGeocodeLocal(pos.lat, pos.lng);
      this.currentStartEndpoint.name = geo.name;
      const input = this.container.querySelector<HTMLInputElement>('[data-br-input="start"]');
      if (input) input.value = geo.name;
      this.recalculate();
    });

    this.goalMarker.on('dragend', (e) => {
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
      // Instant
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
    const elStepCount = this.container.querySelector('[data-metric-step]');

    if (elExplored) elExplored.textContent = String(currStep.closedSetCount);
    if (elFrontier) elFrontier.textContent = String(currStep.openSetCount);
    if (elStepCount) elStepCount.textContent = `${this.currentStepIndex} / ${maxSteps}`;

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

  // --- CANVAS RENDERING SYNCHRONIZED WITH LEAFLET GPS ---
  public render(): void {
    if (!this.map) return;
    const ctx = this.ctx;
    const size = this.map.getSize();
    ctx.clearRect(0, 0, size.x, size.y);

    // 1. Render Base Road Network on Real Map
    this.renderRoadNetwork();

    // 2. Render Search Frontier Animation
    if (this.isRaceMode) {
      for (const res of this.raceResults.values()) {
        this.renderSingleExploration(res);
      }
    } else if (this.currentResult) {
      this.renderSingleExploration(this.currentResult);
    }

    // 3. Render Final Path Glow
    this.renderFinalPath();

    // 4. Render Graph Intersections
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
        ctx.strokeStyle = '#f97316'; // International Orange
        ctx.lineWidth = 3.5;
        ctx.setLineDash([4, 2]);
        ctx.stroke();
        ctx.setLineDash([]);
      } else if (edge.roadType === 'interstate') {
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

    // Glowing Laser Polyline
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

    // Inner bright beam
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2.2;
    ctx.stroke();
  }

  private renderNodes(): void {
    const ctx = this.ctx;
    const zoom = this.map?.getZoom() || 10;

    for (const node of this.activeGraph.nodes.values()) {
      const isKey = node.type === 'city' || node.type === 'airport' || node.type === 'landmark';
      if (!isKey && zoom < 12) continue; // declutter minor intersections when zoomed out

      const p = this.latLngToPoint(node.lat, node.lng);
      ctx.beginPath();
      ctx.arc(p.x, p.y, isKey ? 3.5 : 2.0, 0, Math.PI * 2);
      ctx.fillStyle = isKey
        ? this.isDarkTheme
          ? '#94a3b8'
          : '#475569'
        : 'rgba(148, 163, 184, 0.5)';
      ctx.fill();

      // Show landmark labels when zoomed in or for primary cities
      if (isKey && zoom >= 11) {
        ctx.font = 'bold 10px system-ui, sans-serif';
        ctx.fillStyle = this.isDarkTheme ? '#e2e8f0' : '#1e293b';
        ctx.fillText(node.name, p.x + 6, p.y + 3);
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
