import {
  type BayGraph,
  type BayNode,
  BAY_NODES,
  BAY_EDGES,
  BAY_WATER_POLYGONS,
  PRESET_TRIPS,
  createBayGraph,
} from '../lib/bayGraph';
import {
  type AlgorithmId,
  type PathfindingResult,
  type SearchStep,
  ALGORITHMS,
  runPathfinding,
} from '../lib/pathfinding';

export interface BayRouteAppOptions {
  canvas: HTMLCanvasElement;
  container: HTMLElement;
}

export class BayRouteVisualizer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private container: HTMLElement;
  private graph: BayGraph;

  // App State
  public currentAlgorithm: AlgorithmId = 'dijkstra';
  public currentStartId: string = 'sf_ferry_bldg';
  public currentGoalId: string = 'berkeley_campanile';
  public isRaceMode: boolean = false;

  // Search Results & Animation Playback
  private currentResult: PathfindingResult | null = null;
  private raceResults: Map<AlgorithmId, PathfindingResult> = new Map();
  private currentStepIndex: number = 0;
  private isPlaying: boolean = false;
  private animationSpeed: number = 1; // 1x default
  private animFrameId: number | null = null;
  private lastFrameTimestamp: number = 0;
  private stepsAccumulator: number = 0;

  // Hover & Interaction
  private hoveredNodeId: string | null = null;
  private selectingTarget: 'start' | 'goal' | 'auto' = 'auto';

  // Theme support
  private isDark: boolean = true;

  constructor(canvas: HTMLCanvasElement, container: HTMLElement) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Failed to obtain Canvas 2D context');
    this.ctx = ctx;
    this.container = container;
    this.graph = createBayGraph();

    this.detectTheme();
    this.initCanvasSize();
    this.bindEvents();
    this.loadTrip('trip-bay-bridge');
  }

  private detectTheme(): void {
    const theme = document.documentElement.getAttribute('data-theme') || 'dark';
    this.isDark = theme !== 'light' && theme !== 'parchment';
  }

  private initCanvasSize(): void {
    const rect = this.canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const width = rect.width || 800;
    const height = rect.height || 640;

    this.canvas.width = width * dpr;
    this.canvas.height = height * dpr;
    this.ctx.resetTransform();
    this.ctx.scale((width * dpr) / 1000, (height * dpr) / 1000);
  }

  private bindEvents(): void {
    window.addEventListener('resize', () => {
      this.initCanvasSize();
      this.render();
    });

    document.addEventListener('khc:theme-change', () => {
      this.detectTheme();
      this.render();
    });

    const observer = new MutationObserver(() => {
      this.detectTheme();
      this.render();
    });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    });

    // Mouse Hover & Click Interaction
    this.canvas.addEventListener('mousemove', (e) => this.handleMouseMove(e));
    this.canvas.addEventListener('mouseleave', () => {
      this.hoveredNodeId = null;
      this.render();
    });
    this.canvas.addEventListener('click', (e) => this.handleClick(e));
  }

  private getCanvasCoords(e: MouseEvent): { x: number; y: number } {
    const rect = this.canvas.getBoundingClientRect();
    const clientX = e.clientX - rect.left;
    const clientY = e.clientY - rect.top;
    const x = (clientX / rect.width) * 1000;
    const y = (clientY / rect.height) * 1000;
    return { x, y };
  }

  private findNearestNode(x: number, y: number, maxRadius = 35): BayNode | null {
    let nearest: BayNode | null = null;
    let minDist = maxRadius;

    for (const node of this.graph.nodes.values()) {
      const dist = Math.hypot(node.x - x, node.y - y);
      if (dist < minDist) {
        minDist = dist;
        nearest = node;
      }
    }
    return nearest;
  }

  private handleMouseMove(e: MouseEvent): void {
    const { x, y } = this.getCanvasCoords(e);
    const nearest = this.findNearestNode(x, y, 30);
    const newHover = nearest ? nearest.id : null;

    if (newHover !== this.hoveredNodeId) {
      this.hoveredNodeId = newHover;
      this.canvas.style.cursor = nearest ? 'pointer' : 'default';
      this.render();
      this.updateTooltip(nearest, e.clientX, e.clientY);
    }
  }

  private updateTooltip(node: BayNode | null, clientX: number, clientY: number): void {
    const tooltip = this.container.querySelector<HTMLElement>('[data-br-tooltip]');
    if (!tooltip) return;

    if (!node) {
      tooltip.hidden = true;
      return;
    }

    tooltip.hidden = false;
    tooltip.replaceChildren();

    const titleEl = document.createElement('strong');
    titleEl.textContent = node.name;
    tooltip.appendChild(titleEl);

    const subEl = document.createElement('span');
    subEl.style.display = 'block';
    subEl.style.fontSize = '0.75rem';
    subEl.style.opacity = '0.8';
    subEl.textContent = `${node.city} · ${node.region.toUpperCase()}`;
    tooltip.appendChild(subEl);

    if (node.description) {
      const descEl = document.createElement('span');
      descEl.style.display = 'block';
      descEl.style.fontSize = '0.7rem';
      descEl.style.marginTop = '2px';
      descEl.style.color = 'var(--color-muted)';
      descEl.textContent = node.description;
      tooltip.appendChild(descEl);
    }

    const containerRect = this.container.getBoundingClientRect();
    tooltip.style.left = `${clientX - containerRect.left + 12}px`;
    tooltip.style.top = `${clientY - containerRect.top + 12}px`;
  }

  private handleClick(e: MouseEvent): void {
    const { x, y } = this.getCanvasCoords(e);
    const nearest = this.findNearestNode(x, y, 40);
    if (!nearest) return;

    if (this.selectingTarget === 'start') {
      if (nearest.id !== this.currentGoalId) {
        this.currentStartId = nearest.id;
        this.selectingTarget = 'auto';
        this.recalculate();
      }
    } else if (this.selectingTarget === 'goal') {
      if (nearest.id !== this.currentStartId) {
        this.currentGoalId = nearest.id;
        this.selectingTarget = 'auto';
        this.recalculate();
      }
    } else {
      // Auto mode: toggle start or goal
      if (nearest.id === this.currentStartId) {
        this.selectingTarget = 'goal';
      } else if (nearest.id === this.currentGoalId) {
        this.selectingTarget = 'start';
      } else {
        // By default, set goal if start is already set
        this.currentGoalId = nearest.id;
        this.recalculate();
      }
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

  public loadTrip(tripId: string): void {
    const trip = PRESET_TRIPS.find((t) => t.id === tripId);
    if (!trip) return;

    this.currentStartId = trip.startId;
    this.currentGoalId = trip.goalId;
    this.recalculate();
  }

  public setStartNode(id: string): void {
    if (this.graph.nodes.has(id) && id !== this.currentGoalId) {
      this.currentStartId = id;
      this.recalculate();
    }
  }

  public setGoalNode(id: string): void {
    if (this.graph.nodes.has(id) && id !== this.currentStartId) {
      this.currentGoalId = id;
      this.recalculate();
    }
  }

  public recalculate(): void {
    this.pause();

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
        const res = runPathfinding(alg, this.graph, this.currentStartId, this.currentGoalId);
        this.raceResults.set(alg, res);
      }
      this.currentResult = this.raceResults.get(this.currentAlgorithm) || null;
    } else {
      this.currentResult = runPathfinding(
        this.currentAlgorithm,
        this.graph,
        this.currentStartId,
        this.currentGoalId
      );
    }

    this.currentStepIndex = 0;
    this.updateTelemetry();
    this.render();

    // Auto-play on route change
    this.play();
  }

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
    const maxSteps = this.getMaxSteps();
    if (this.currentStepIndex < maxSteps) {
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

  public scrubTo(progressFraction: number): void {
    this.pause();
    const maxSteps = this.getMaxSteps();
    this.currentStepIndex = Math.min(
      maxSteps,
      Math.max(0, Math.round(progressFraction * maxSteps))
    );
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
      // Instant mode
      this.currentStepIndex = this.getMaxSteps();
      this.pause();
      this.updateTelemetry();
      this.render();
      return;
    }

    // Base rate: 30 steps/second * speed multiplier
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
      playBtn.setAttribute('aria-label', this.isPlaying ? 'Pause search animation' : 'Play search animation');
    }
  }

  private updateTelemetry(): void {
    const maxSteps = this.getMaxSteps();
    const progress = maxSteps > 0 ? this.currentStepIndex / maxSteps : 0;

    // Scrubber
    const scrubber = this.container.querySelector<HTMLInputElement>('[data-br-scrubber]');
    if (scrubber) {
      scrubber.value = String(Math.round(progress * 100));
    }

    if (!this.currentResult) return;

    // Get current step event
    const safeIdx = Math.min(this.currentStepIndex, this.currentResult.steps.length - 1);
    const currStep = this.currentResult.steps[safeIdx] || this.currentResult.steps[0];

    // Dom updates
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
        ? (ALGORITHMS[this.currentAlgorithm].isOptimal ? '100% (Optimal)' : 'Suboptimal')
        : 'Evaluating...';
    }

    // Race Mode Leaderboard
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
        computeMs: res.executionTimeMs,
      };
    });

    // Sort by arrival status, then explored count
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

      // Rank TD
      const tdRank = document.createElement('td');
      const strongRank = document.createElement('strong');
      strongRank.textContent = `#${rank + 1}`;
      tdRank.appendChild(strongRank);
      tr.appendChild(tdRank);

      // Alg TD
      const tdAlg = document.createElement('td');
      const dot = document.createElement('span');
      dot.className = 'race-color-dot';
      dot.style.background = e.meta.color;
      tdAlg.appendChild(dot);

      const strongAlg = document.createElement('strong');
      strongAlg.textContent = e.meta.name;
      tdAlg.appendChild(strongAlg);
      tr.appendChild(tdAlg);

      // Explored TD
      const tdExplored = document.createElement('td');
      tdExplored.textContent = String(e.explored);
      tr.appendChild(tdExplored);

      // Frontier TD
      const tdFrontier = document.createElement('td');
      tdFrontier.textContent = String(e.frontier);
      tr.appendChild(tdFrontier);

      // Distance TD
      const tdDistance = document.createElement('td');
      tdDistance.textContent = e.reachedGoal ? `${e.distance} mi` : '—';
      tr.appendChild(tdDistance);

      // Time TD
      const tdTime = document.createElement('td');
      tdTime.textContent = e.reachedGoal ? `${Math.round(e.time)} min` : '—';
      tr.appendChild(tdTime);

      // Status TD
      const tdStatus = document.createElement('td');
      const badge = document.createElement('span');
      badge.className = `race-badge ${e.reachedGoal ? 'race-badge--arrived' : 'race-badge--searching'}`;
      badge.textContent = e.reachedGoal ? 'Arrived 🏁' : 'Searching ⚡';
      tdStatus.appendChild(badge);
      tr.appendChild(tdStatus);

      tableBody.appendChild(tr);
    }
  }

  // --- RENDERING ENGINE ---
  public render(): void {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, 1000, 1000);

    // 1. Map Background Landmass
    ctx.fillStyle = this.isDark ? '#0b1120' : '#f8fafc';
    ctx.fillRect(0, 0, 1000, 1000);

    // 2. Water Polygons (Pacific Ocean & Bay Area Water)
    ctx.fillStyle = this.isDark ? '#082f49' : '#e0f2fe';
    for (const poly of BAY_WATER_POLYGONS) {
      ctx.beginPath();
      ctx.moveTo(poly.points[0][0], poly.points[0][1]);
      for (let i = 1; i < poly.points.length; i++) {
        ctx.lineTo(poly.points[i][0], poly.points[i][1]);
      }
      ctx.closePath();
      ctx.fill();
    }

    // Coastline Shading Stroke
    ctx.strokeStyle = this.isDark ? '#0284c7' : '#38bdf8';
    ctx.lineWidth = 1.2;
    ctx.stroke();

    // 3. Static Road Network Edges
    this.renderRoadNetwork();

    // 4. Algorithm Explored Frontier / Settled Trails
    if (this.isRaceMode) {
      this.renderRaceExploration();
    } else if (this.currentResult) {
      this.renderSingleExploration(this.currentResult);
    }

    // 5. Final Path Overlay (if search complete)
    this.renderFinalPath();

    // 6. Graph Nodes & Landmark Pins
    this.renderNodes();

    // 7. Start & Destination Pins
    this.renderWaypoints();
  }

  private renderRoadNetwork(): void {
    const ctx = this.ctx;

    for (const edge of this.graph.edges) {
      const u = this.graph.nodes.get(edge.u);
      const v = this.graph.nodes.get(edge.v);
      if (!u || !v) continue;

      ctx.beginPath();
      ctx.moveTo(u.x, u.y);
      ctx.lineTo(v.x, v.y);

      if (edge.roadType === 'bridge') {
        ctx.strokeStyle = this.isDark ? '#f97316' : '#ea580c'; // International Orange
        ctx.lineWidth = 3.5;
        ctx.setLineDash([4, 2]);
        ctx.stroke();
        ctx.setLineDash([]);
      } else if (edge.roadType === 'interstate') {
        ctx.strokeStyle = this.isDark ? '#334155' : '#cbd5e1';
        ctx.lineWidth = 2.5;
        ctx.stroke();
      } else if (edge.roadType === 'highway') {
        ctx.strokeStyle = this.isDark ? '#1e293b' : '#e2e8f0';
        ctx.lineWidth = 2.0;
        ctx.stroke();
      } else {
        ctx.strokeStyle = this.isDark ? '#1e293b' : '#f1f5f9';
        ctx.lineWidth = 1.2;
        ctx.stroke();
      }
    }
  }

  private renderSingleExploration(res: PathfindingResult): void {
    const ctx = this.ctx;
    const stepLimit = Math.min(this.currentStepIndex, res.steps.length - 1);
    const color = ALGORITHMS[res.algorithm].color;

    // Settled nodes set and active frontier set
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

    // Draw settled exploration edges with glow
    ctx.strokeStyle = color;
    ctx.lineWidth = 2.8;
    ctx.shadowColor = color;
    ctx.shadowBlur = this.isDark ? 8 : 2;

    for (const { u: uId, v: vId } of settledEdges) {
      const u = this.graph.nodes.get(uId);
      const v = this.graph.nodes.get(vId);
      if (u && v) {
        ctx.beginPath();
        ctx.moveTo(u.x, u.y);
        ctx.lineTo(v.x, v.y);
        ctx.stroke();
      }
    }
    ctx.shadowBlur = 0;

    // Draw settled node discs
    ctx.fillStyle = color;
    for (const nId of settledNodes) {
      const node = this.graph.nodes.get(nId);
      if (node) {
        ctx.beginPath();
        ctx.arc(node.x, node.y, 4, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Draw active frontier pulse rings
    for (const nId of frontierNodes) {
      if (settledNodes.has(nId)) continue;
      const node = this.graph.nodes.get(nId);
      if (node) {
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(node.x, node.y, 7, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
  }

  private renderRaceExploration(): void {
    for (const res of this.raceResults.values()) {
      this.renderSingleExploration(res);
    }
  }

  private renderFinalPath(): void {
    if (!this.currentResult || !this.currentResult.found) return;

    const maxSteps = this.getMaxSteps();
    if (this.currentStepIndex < maxSteps) return; // Only reveal upon completion

    const ctx = this.ctx;
    const path = this.currentResult.path;
    if (path.length < 2) return;

    // Laser Beam Glowing Gold Route
    ctx.strokeStyle = '#fbbf24';
    ctx.lineWidth = 5.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.shadowColor = '#fbbf24';
    ctx.shadowBlur = 12;

    ctx.beginPath();
    const startNode = this.graph.nodes.get(path[0])!;
    ctx.moveTo(startNode.x, startNode.y);

    for (let i = 1; i < path.length; i++) {
      const node = this.graph.nodes.get(path[i])!;
      ctx.lineTo(node.x, node.y);
    }
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Inner bright core
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2.0;
    ctx.stroke();
  }

  private renderNodes(): void {
    const ctx = this.ctx;

    for (const node of this.graph.nodes.values()) {
      const isHovered = node.id === this.hoveredNodeId;
      const isKey = node.type === 'city' || node.type === 'airport' || node.type === 'landmark';

      ctx.beginPath();
      ctx.arc(node.x, node.y, isHovered ? 6 : isKey ? 3.5 : 2.2, 0, Math.PI * 2);
      ctx.fillStyle = isHovered
        ? '#38bdf8'
        : isKey
          ? this.isDark
            ? '#94a3b8'
            : '#64748b'
          : this.isDark
            ? '#475569'
            : '#cbd5e1';
      ctx.fill();

      // Text labels for major landmarks / hovered node
      if (isHovered || isKey) {
        ctx.font = isHovered
          ? 'bold 11px system-ui, sans-serif'
          : '9px system-ui, sans-serif';
        ctx.fillStyle = isHovered
          ? '#ffffff'
          : this.isDark
            ? '#cbd5e1'
            : '#334155';
        ctx.fillText(node.name, node.x + 8, node.y + 3);
      }
    }
  }

  private renderWaypoints(): void {
    const ctx = this.ctx;
    const startNode = this.graph.nodes.get(this.currentStartId);
    const goalNode = this.graph.nodes.get(this.currentGoalId);

    // Start Waypoint (Coral Red 🚩)
    if (startNode) {
      ctx.shadowColor = '#f43f5e';
      ctx.shadowBlur = 10;
      ctx.fillStyle = '#f43f5e';
      ctx.beginPath();
      ctx.arc(startNode.x, startNode.y, 8, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(startNode.x, startNode.y, 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;

      ctx.font = 'bold 12px system-ui, sans-serif';
      ctx.fillStyle = '#f43f5e';
      ctx.fillText(`🚩 START: ${startNode.name}`, startNode.x + 12, startNode.y - 4);
    }

    // Destination Waypoint (Emerald Radar 🏁)
    if (goalNode) {
      ctx.shadowColor = '#10b981';
      ctx.shadowBlur = 12;
      ctx.strokeStyle = '#10b981';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(goalNode.x, goalNode.y, 11, 0, Math.PI * 2);
      ctx.stroke();

      ctx.fillStyle = '#10b981';
      ctx.beginPath();
      ctx.arc(goalNode.x, goalNode.y, 7, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(goalNode.x, goalNode.y, 2.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;

      ctx.font = 'bold 12px system-ui, sans-serif';
      ctx.fillStyle = '#10b981';
      ctx.fillText(`🏁 GOAL: ${goalNode.name}`, goalNode.x + 14, goalNode.y - 4);
    }
  }
}

/**
 * Initializes the visualizer on page mount.
 */
export function initBayRoute(canvasSelector: string, containerSelector: string): BayRouteVisualizer | null {
  const canvas = document.querySelector<HTMLCanvasElement>(canvasSelector);
  const container = document.querySelector<HTMLElement>(containerSelector);
  if (!canvas || !container) return null;
  return new BayRouteVisualizer(canvas, container);
}
