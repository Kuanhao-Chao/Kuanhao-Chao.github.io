import type { BayGraph, BayNode, LatLngPoint } from '../lib/bayGraph';
import { haversineDistanceMiles } from '../lib/bayGraph';
import { buildFullCityGraphWithEndpoints } from '../lib/cityRoadGraph';
import { BAYROUTE_EXAMPLES, BAYROUTE_TRIPS } from '../lib/bayRouteTeaching';
import { GLOBAL_GAZETTEER, LOCAL_BAY_GAZETTEER } from '../lib/geocoding';
import { ALGORITHMS, runPathfinding, type AlgorithmId, type PathfindingResult, type SearchStep } from '../lib/pathfinding';
import { getSecureStoredApiKey, loadGoogleMapsSDK, onGoogleMapsAuthFailure, GOOGLE_MAPS_DARK_STYLE } from '../lib/googleMaps';
import { audioEngine } from '../lib/audioFeedback';
import { isDarkTheme } from '../lib/theme';

interface MapAdapter {
  project(point: LatLngPoint): { x: number; y: number };
  unproject(point: { x: number; y: number }): LatLngPoint;
  fit(nodes: BayNode[]): void;
  resize(): void;
  destroy(): void;
}

export function initBayRoute(root: HTMLElement) {
  const canvasEl = root.querySelector<HTMLCanvasElement>('[data-br-canvas]');
  if (!canvasEl || root.dataset.brReady) return null;
  const context = canvasEl.getContext('2d');
  if (!context) return null;
  const canvas = canvasEl; const ctx = context;
  root.dataset.brReady = 'true';
  const abort = new AbortController(); const { signal } = abort;
  const get = <T extends HTMLElement>(name: string) => root.querySelector<T>(`[data-br-${name}]`)!;
  const algorithmSelect = get<HTMLSelectElement>('algo');
  const sceneSelect = get<HTMLSelectElement>('scene');
  const startSelect = get<HTMLSelectElement>('start-node');
  const goalSelect = get<HTMLSelectElement>('goal-node');
  const providerSelect = get<HTMLSelectElement>('provider');
  const providerLayer = get<HTMLElement>('basemap');
  const status = get<HTMLElement>('status');
  const explanation = get<HTMLElement>('explanation');
  const inspector = get<HTMLElement>('inspector');
  const progress = get<HTMLInputElement>('scrubber');
  const race = get<HTMLInputElement>('race');
  const table = get<HTMLElement>('results');
  let graph: BayGraph = BAYROUTE_EXAMPLES[0].graph();
  let startId = 'S'; let goalId = 'T';
  let results: PathfindingResult[] = [];
  let indices: number[] = [];
  let playing = false;
  let frame = 0; let last = 0; let remainder = 0;
  let width = 800; let height = 500;
  let providerRevision = 0;
  let disposed = false;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  let dark = isDarkTheme();
  let localBounds = { minLng: 0, maxLng: 3, minLat: 0, maxLat: 1, scale: 1, ox: 0, oy: 0 };
  const local: MapAdapter = {
    project: (point) => ({ x: localBounds.ox + (point.lng - localBounds.minLng) * localBounds.scale, y: localBounds.oy + (localBounds.maxLat - point.lat) * localBounds.scale }),
    unproject: (point) => ({ lng: localBounds.minLng + (point.x - localBounds.ox) / localBounds.scale, lat: localBounds.maxLat - (point.y - localBounds.oy) / localBounds.scale }),
    fit: (nodes) => {
      const lngs = nodes.map((node) => node.lng); const lats = nodes.map((node) => node.lat);
      const minLng = Math.min(...lngs); const maxLng = Math.max(...lngs); const minLat = Math.min(...lats); const maxLat = Math.max(...lats);
      const dx = Math.max(.001, maxLng - minLng); const dy = Math.max(.001, maxLat - minLat);
      const scale = Math.min((width - 100) / dx, (height - 100) / dy);
      localBounds = { minLng, maxLng, minLat, maxLat, scale, ox: (width - dx * scale) / 2, oy: (height - dy * scale) / 2 };
    },
    resize: () => local.fit([...graph.nodes.values()]),
    destroy: () => {},
  };
  let adapter: MapAdapter = local;
  const isExample = () => BAYROUTE_EXAMPLES.some((example) => example.id === sceneSelect.value);
  const announce = (message: string) => { if (status.textContent !== message) status.textContent = message; };
  function pause() {
    playing = false; cancelAnimationFrame(frame); frame = 0; last = 0; remainder = 0;
    get<HTMLButtonElement>('play').textContent = 'Play';
  }
  function resetTrace() { pause(); indices = results.map(() => 0); progress.value = '0'; render(); updateInspector(); }
  function fillEndpoints() {
    const nodes = [...graph.nodes.values()];
    startSelect.replaceChildren(...nodes.map((node) => new Option(node.name, node.id)));
    goalSelect.replaceChildren(...nodes.map((node) => new Option(node.name, node.id)));
    startSelect.value = startId; goalSelect.value = goalId;
  }
  function loadScene() {
    providerRevision++;
    pause(); results = []; indices = []; table.replaceChildren(); progress.value = '0';
    const example = BAYROUTE_EXAMPLES.find((item) => item.id === sceneSelect.value);
    if (example) { graph = example.graph(); startId = example.startId; goalId = example.goalId; explanation.textContent = example.explanation; }
    else {
      const trip = BAYROUTE_TRIPS.find((item) => item.id === sceneSelect.value)!;
      const model = buildFullCityGraphWithEndpoints(trip.start, trip.goal);
      graph = model.graph; startId = model.startId; goalId = model.goalId;
      const s = graph.nodes.get(startId)!; const g = graph.nodes.get(goalId)!;
      const snapS = haversineDistanceMiles(trip.start.lat, trip.start.lng, s.lat, s.lng);
      const snapG = haversineDistanceMiles(trip.goal.lat, trip.goal.lng, g.lat, g.lng);
      explanation.textContent = `Curated, incomplete road graph. Start snaps ${snapS.toFixed(2)} mi to ${s.name}; goal snaps ${snapG.toFixed(2)} mi to ${g.name}. Costs are distance / modeled speed, not traffic-aware directions. A basemap supplies context only, never the graph.`;
    }
    fillEndpoints(); adapter.fit([...graph.nodes.values()]); render(); updateInspector();
    announce(`${graph.nodes.size} represented junctions · ${graph.edges.length} stored edges. Choose an algorithm and Run.`);
    if (isExample() && providerSelect.value !== 'local') { providerSelect.value = 'local'; void chooseProvider(); }
    else if (!isExample() && providerSelect.value !== 'local' && adapter === local) void chooseProvider();
  }
  function compute() {
    pause();
    if (audioEngine.isSoundEnabled()) audioEngine.setSoundEnabled(true);
    const selected = algorithmSelect.value as AlgorithmId;
    const algorithms: AlgorithmId[] = race.checked ? ['dijkstra', 'a_star', 'bidirectional_a_star', 'greedy', 'bfs'] : [selected];
    results = algorithms.map((id) => runPathfinding(id, graph, startId, goalId));
    indices = results.map(() => 0);
    renderResults(); render(); updateInspector();
    announce(results[0].found ? 'Search computed. Playback shows its recorded expansion trace; compute time and playback time are different.' : 'No route on the represented directed graph. No connector or fallback route is invented.');
  }
  function renderResults() {
    table.replaceChildren();
    for (const result of results) {
      const row = document.createElement('tr'); row.dataset.algorithm = result.algorithm;
      for (const value of [ALGORITHMS[result.algorithm].name, result.found ? result.totalTimeMinutes.toFixed(3) : 'No route', String(result.exploredCount), result.executionTimeMs.toFixed(2)]) {
        const cell = document.createElement('td'); cell.textContent = value; row.append(cell);
      }
      table.append(row);
    }
  }
  function advance(count = 1) {
    indices = results.map((result, i) => Math.min(result.steps.length, (indices[i] ?? 0) + count));
    render(); updateInspector();
    if (results.length && results.every((result, i) => indices[i] >= result.steps.length)) {
      pause(); if (results.some((result) => result.found)) audioEngine.playArrivalFanfare(); announce('Trace complete. Compare weighted cost, settled entries and compute milliseconds in the table.');
    }
  }
  function playback(timestamp: number) {
    if (!playing || disposed) return;
    if (!last) last = timestamp;
    remainder += Math.min(.1, (timestamp - last) / 1000) * Number(get<HTMLSelectElement>('speed').value);
    last = timestamp;
    const count = Math.floor(remainder); remainder -= count;
    if (count) { advance(count); audioEngine.playStepSound(indices[0] / Math.max(1, results[0]?.steps.length ?? 1)); }
    if (playing) frame = requestAnimationFrame(playback);
  }
  function play() {
    if (playing) { pause(); return; }
    if (!results.length) compute();
    if (results.every((result, i) => indices[i] >= result.steps.length)) resetTrace();
    playing = true; last = 0; get<HTMLButtonElement>('play').textContent = 'Pause'; frame = requestAnimationFrame(playback);
  }
  function updateInspector() {
    const result = results.find((item) => item.algorithm === algorithmSelect.value) ?? results[0];
    const index = result ? results.indexOf(result) : 0;
    const step = result?.steps[Math.max(0, (indices[index] ?? 0) - 1)];
    progress.max = String(Math.max(1, result?.steps.length ?? 1)); progress.value = String(indices[index] ?? 0);
    get<HTMLElement>('step-count').textContent = `${indices[index] ?? 0} / ${result?.steps.length ?? 0} events`;
    if (!step) { inspector.textContent = 'Step through an algorithm to inspect the current junction, g/h/f and queue sizes.'; return; }
    inspector.textContent = `${step.direction ? step.direction + ' · ' : ''}${step.type}: ${graph.nodes.get(step.nodeId)?.name ?? step.nodeId} · g=${step.g.toFixed(3)} · h=${step.h.toFixed(3)} · g+h=${step.f.toFixed(3)} · queue entries=${step.openSetCount} · settled entries=${step.closedSetCount}. ${step.queueKey !== undefined ? `Reduced queue key=${step.queueKey.toFixed(3)}. ` : ''}${step.lowerBound !== undefined ? `Combined reduced lower bound=${step.lowerBound.toFixed(3)}. ` : ''}${step.incumbent !== undefined ? `Incumbent original cost=${step.incumbent.toFixed(3)}. ` : ''}${result?.algorithm === 'bfs' ? 'BFS g is hop count, not weighted travel cost.' : ''}`;
  }
  function drawEdge(u: string, v: string, color: string, lineWidth: number) {
    const edge = graph.adjacency.get(u)?.find((link) => link.target === v)?.edge;
    const from = graph.nodes.get(u); const to = graph.nodes.get(v);
    if (!from || !to) return;
    const points = edge?.path?.length ? edge.path : [from, to];
    ctx.strokeStyle = color; ctx.lineWidth = lineWidth; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.beginPath();
    points.forEach((point, i) => { const p = adapter.project(point); if (i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y); }); ctx.stroke();
  }
  function render() {
    ctx.clearRect(0, 0, width, height);
    if (adapter === local) {
      ctx.fillStyle = dark ? '#0c1920' : '#f2f5ef'; ctx.fillRect(0, 0, width, height);
      ctx.strokeStyle = dark ? '#183039' : '#dde6db'; ctx.lineWidth = 1;
      for (let x = 0; x < width; x += 40) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, height); ctx.stroke(); }
      for (let y = 0; y < height; y += 40) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(width, y); ctx.stroke(); }
      ctx.fillStyle = dark ? '#849f9e' : '#607772'; ctx.font = '11px monospace'; ctx.textAlign = 'left';
      ctx.fillText(isExample() ? 'SCHEMATIC · arbitrary cost units' : 'CURATED ROADS · approximate geographic layout', 14, 24);
      ctx.fillText('N ↑', width - 46, 24);
    }
    const drawn = new Set<string>();
    for (const edge of graph.edges) {
      const key = [edge.u, edge.v].sort().join('|'); if (drawn.has(key)) continue; drawn.add(key);
      drawEdge(edge.u, edge.v, dark ? '#3e5a62' : '#a8b9af', isExample() ? 3 : 1.5);
      if (isExample()) {
        const a = adapter.project(graph.nodes.get(edge.u)!); const b = adapter.project(graph.nodes.get(edge.v)!);
        const weight = graph.adjacency.get(edge.u)?.find((link) => link.target === edge.v)?.weight ?? 0;
        ctx.fillStyle = dark ? '#cfdfde' : '#3b514b'; ctx.font = 'bold 13px monospace'; ctx.textAlign = 'center'; ctx.fillText(String(weight), (a.x + b.x) / 2, (a.y + b.y) / 2 - 10);
      }
    }
    const settled = new Set<string>(); const frontier = new Set<string>();
    results.forEach((result, i) => {
      const trace = result.steps.slice(0, indices[i]); const color = ALGORITHMS[result.algorithm].color;
      for (const step of trace) {
        if (step.type === 'settle') { settled.add(step.nodeId); frontier.delete(step.nodeId); }
        else if (step.type === 'frontier' && !settled.has(step.nodeId)) frontier.add(step.nodeId);
      }
      const latest = trace[trace.length - 1];
      if (latest?.parentId) drawEdge(latest.direction === 'backward' ? latest.nodeId : latest.parentId, latest.direction === 'backward' ? latest.parentId : latest.nodeId, color, 3);
      if (indices[i] >= result.steps.length) for (let j = 1; j < result.path.length; j++) drawEdge(result.path[j - 1], result.path[j], color, race.checked ? 3 : 5);
    });
    for (const node of graph.nodes.values()) {
      const point = adapter.project(node); const endpoint = node.id === startId || node.id === goalId;
      const r = endpoint ? 10 : isExample() ? 8 : settled.has(node.id) ? 4 : 2.5;
      ctx.fillStyle = node.id === startId ? '#059669' : node.id === goalId ? '#dc5d36' : settled.has(node.id) ? '#0284c7' : dark ? '#203b44' : '#fbfdf8';
      ctx.strokeStyle = frontier.has(node.id) ? '#d97706' : dark ? '#90b1b5' : '#587872'; ctx.lineWidth = frontier.has(node.id) ? 3 : 1.4;
      ctx.beginPath(); ctx.arc(point.x, point.y, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      if (endpoint || isExample()) {
        ctx.fillStyle = dark ? '#e6f2ed' : '#243d35'; ctx.font = `${endpoint ? 'bold ' : ''}12px sans-serif`; ctx.textAlign = 'center';
        ctx.fillText(`${node.id === startId ? 'S · ' : node.id === goalId ? 'T · ' : ''}${node.name.slice(0, 38)}`, Math.max(60, Math.min(width - 60, point.x)), point.y + r + 20);
      }
    }
  }
  function resize() {
    const rect = canvas.getBoundingClientRect(); width = Math.max(200, rect.width); height = Math.max(200, rect.height);
    const dpr = Math.min(2, window.devicePixelRatio || 1); canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    adapter.resize(); render();
  }
  function selectMapPoint(point: LatLngPoint) {
    let best: BayNode | null = null; let distance = Infinity;
    for (const node of graph.nodes.values()) { const d = haversineDistanceMiles(point.lat, point.lng, node.lat, node.lng); if (d < distance) { best = node; distance = d; } }
    if (!best || (!isExample() && distance > 2)) { announce('No represented junction within two miles. Choose a supported landmark or junction.'); return; }
    const target = get<HTMLSelectElement>('pick-target').value;
    if (target === 'start') startId = best.id; else goalId = best.id;
    startSelect.value = startId; goalSelect.value = goalId; results = []; indices = []; pause(); table.replaceChildren(); render(); updateInspector();
    announce(`${target}: ${best.name} · snap ${isExample() ? 'to a schematic node' : distance.toFixed(2) + ' mi'}. No new edge was added.`);
  }
  async function chooseProvider() {
    const version = ++providerRevision; const choice = providerSelect.value;
    adapter.destroy(); adapter = local; providerLayer.replaceChildren(); providerLayer.hidden = true; canvas.style.pointerEvents = 'auto'; local.resize(); render();
    if (choice === 'local') { announce('Offline schematic · no basemap requests or credentials required.'); return; }
    if (isExample()) { providerSelect.value = 'local'; announce('Teaching examples use an offline schematic. Choose a city trip to enable a basemap.'); return; }
    try {
      if (choice === 'leaflet') {
        const L = await import('leaflet');
        if (disposed || version !== providerRevision) return;
        providerLayer.hidden = false;
        const map = L.map(providerLayer, { scrollWheelZoom: false });
        const tiles = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap contributors', maxZoom: 19 }).addTo(map);
        map.on('move zoom resize', render);
        map.on('click', (event) => selectMapPoint(event.latlng));
        tiles.on('tileerror', () => announce('Some basemap tiles could not load. The offline schematic remains available; the curated graph is unchanged.'));
        adapter = { project: (point) => map.latLngToContainerPoint(point), unproject: (point) => map.containerPointToLatLng([point.x, point.y]), fit: (nodes) => { map.fitBounds(L.latLngBounds(nodes.map((node) => [node.lat, node.lng] as [number, number])), { padding: [35, 35], animate: false }); }, resize: () => map.invalidateSize({ animate: false }), destroy: () => { map.off(); tiles.off(); map.remove(); } };
      } else {
        const key = get<HTMLInputElement>('api-key').value.trim() || root.dataset.gmapToken || await getSecureStoredApiKey();
        if (!key) throw new Error('Google basemaps need your existing browser-restricted key. Offline and OpenStreetMap views do not.');
        await loadGoogleMapsSDK(key);
        if (disposed || version !== providerRevision) return;
        providerLayer.hidden = false;
        const map = new google.maps.Map(providerLayer, { center: [...graph.nodes.values()][0], zoom: 11, styles: dark ? GOOGLE_MAPS_DARK_STYLE : [], gestureHandling: 'cooperative', streetViewControl: false, fullscreenControl: false });
        const overlay = new google.maps.OverlayView();
        overlay.onAdd = () => {}; overlay.draw = () => { if (!disposed) render(); }; overlay.onRemove = () => {}; overlay.setMap(map);
        const listener = map.addListener('click', (event: google.maps.MapMouseEvent) => { if (event.latLng) selectMapPoint(event.latLng.toJSON()); });
        adapter = { project: (point) => overlay.getProjection()?.fromLatLngToContainerPixel(point) ?? local.project(point), unproject: (point) => overlay.getProjection()?.fromContainerPixelToLatLng(new google.maps.Point(point.x, point.y))?.toJSON() ?? local.unproject(point), fit: (nodes) => { const bounds = new google.maps.LatLngBounds(); nodes.forEach((node) => bounds.extend(node)); map.fitBounds(bounds, 40); }, resize: () => google.maps.event.trigger(map, 'resize'), destroy: () => { listener.remove(); overlay.setMap(null); google.maps.event.clearInstanceListeners(map); } };
      }
      canvas.style.pointerEvents = 'none'; adapter.fit([...graph.nodes.values()]); render();
      announce('Optional basemap loaded. It supplies visual context only; routes still use the curated graph.');
    } catch (error) {
      if (disposed || version !== providerRevision) return;
      providerSelect.value = 'local'; providerLayer.hidden = true; adapter = local; local.resize(); render();
      announce(error instanceof Error && error.message.startsWith('Google basemaps need') ? error.message : 'Basemap unavailable. Returned to the offline schematic; the graph remains usable.');
    }
  }
  const removeAuth = onGoogleMapsAuthFailure(() => { if (!disposed && providerSelect.value === 'google') { providerSelect.value = 'local'; void chooseProvider(); } });
  const places = [...LOCAL_BAY_GAZETTEER, ...GLOBAL_GAZETTEER];
  get<HTMLDataListElement>('landmarks').replaceChildren(...places.map((place) => new Option(place.name, place.name)));
  function searchAddresses() {
    const find = (query: string) => places.find((place) => place.name.toLowerCase() === query.toLowerCase().trim()) ?? places.find((place) => query.trim().length > 2 && `${place.name} ${place.address}`.toLowerCase().includes(query.toLowerCase().trim()));
    const from = find(get<HTMLInputElement>('start-input').value); const to = find(get<HTMLInputElement>('goal-input').value);
    if (!from || !to) { announce('Use a landmark from the local list. Unsupported places are rejected; no external autocomplete request is made.'); return; }
    try {
      const model = buildFullCityGraphWithEndpoints(from, to);
      providerRevision++;
      pause(); graph = model.graph; startId = model.startId; goalId = model.goalId;
      sceneSelect.value = 'custom'; results = []; indices = []; table.replaceChildren(); fillEndpoints(); adapter.fit([...graph.nodes.values()]); render(); updateInspector();
      explanation.textContent = `Local landmark search: ${from.name} → ${to.name}. Endpoints snap to represented junctions; this is an incomplete curated graph, not live directions.`;
      announce(`Start snap ${haversineDistanceMiles(from.lat, from.lng, graph.nodes.get(startId)!.lat, graph.nodes.get(startId)!.lng).toFixed(2)} mi; goal snap ${haversineDistanceMiles(to.lat, to.lng, graph.nodes.get(goalId)!.lat, graph.nodes.get(goalId)!.lng).toFixed(2)} mi.`);
    } catch (error) { announce(error instanceof Error ? error.message : 'Unsupported route.'); }
  }
  sceneSelect.addEventListener('change', loadScene, { signal });
  algorithmSelect.addEventListener('change', () => { pause(); results = []; indices = []; table.replaceChildren(); updateInspector(); render(); get<HTMLElement>('algorithm-note').textContent = ALGORITHMS[algorithmSelect.value as AlgorithmId].description; }, { signal });
  get<HTMLButtonElement>('run').addEventListener('click', () => { compute(); if (reduced.matches) advance(Math.max(...results.map((result) => result.steps.length))); else play(); }, { signal });
  get<HTMLButtonElement>('play').addEventListener('click', play, { signal });
  get<HTMLButtonElement>('step').addEventListener('click', () => { pause(); if (!results.length) compute(); advance(); }, { signal });
  get<HTMLButtonElement>('reset').addEventListener('click', resetTrace, { signal });
  get<HTMLButtonElement>('fit').addEventListener('click', () => { adapter.fit([...graph.nodes.values()]); render(); }, { signal });
  get<HTMLButtonElement>('search').addEventListener('click', searchAddresses, { signal });
  providerSelect.addEventListener('change', () => void chooseProvider(), { signal });
  race.addEventListener('change', () => { pause(); results = []; indices = []; table.replaceChildren(); updateInspector(); render(); }, { signal });
  get<HTMLButtonElement>('apply-map').addEventListener('click', () => void chooseProvider(), { signal });
  progress.addEventListener('input', () => { pause(); indices = results.map((result) => Math.min(result.steps.length, Number(progress.value))); updateInspector(); render(); }, { signal });
  for (const select of [startSelect, goalSelect]) select.addEventListener('change', () => { pause(); startId = startSelect.value; goalId = goalSelect.value; results = []; indices = []; table.replaceChildren(); updateInspector(); render(); }, { signal });
  canvas.addEventListener('click', (event) => { const rect = canvas.getBoundingClientRect(); selectMapPoint(adapter.unproject({ x: event.clientX - rect.left, y: event.clientY - rect.top })); }, { signal });
  get<HTMLButtonElement>('sound').addEventListener('click', () => { const enabled = audioEngine.toggleSound(); get<HTMLButtonElement>('sound').textContent = enabled ? 'Sound on' : 'Sound off'; get<HTMLButtonElement>('sound').setAttribute('aria-pressed', String(enabled)); }, { signal });
  document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); }, { signal });
  window.addEventListener('blur', pause, { signal });
  document.addEventListener('khc:theme-change', () => { dark = isDarkTheme(); render(); }, { signal });
  const observer = new ResizeObserver(resize); observer.observe(canvas);
  const win = window as unknown as { __bayRoute?: { state: () => unknown; destroy: () => void }; __bayRouteInstances?: number };
  win.__bayRouteInstances = (win.__bayRouteInstances ?? 0) + 1;
  const controller = { state: () => ({ startId, goalId, scene: sceneSelect.value, algorithm: algorithmSelect.value, results, indices, playing, provider: providerSelect.value }), destroy: () => {
    if (disposed) return; disposed = true; providerRevision++; pause(); abort.abort(); observer.disconnect(); adapter.destroy(); removeAuth(); audioEngine.destroy();
    delete root.dataset.brReady; win.__bayRouteInstances = Math.max(0, (win.__bayRouteInstances ?? 1) - 1); if (win.__bayRoute === controller) delete win.__bayRoute;
  } };
  win.__bayRoute = controller;
  get<HTMLButtonElement>('sound').textContent = audioEngine.isSoundEnabled() ? 'Sound on' : 'Sound off';
  resize(); loadScene();
  return controller;
}
