import {
  type BayGraph,
  type BayNode,
  type BayEdge,
  haversineDistanceMiles,
} from './bayGraph';

export type AlgorithmId =
  | 'dijkstra'
  | 'a_star'
  | 'bfs'
  | 'greedy'
  | 'bidirectional_a_star'
  | 'dfs';

export interface AlgorithmMetadata {
  id: AlgorithmId;
  name: string;
  tagline: string;
  category: 'Optimal' | 'Heuristic' | 'Unweighted' | 'Bidirectional' | 'Exhaustive';
  timeComplexity: string;
  spaceComplexity: string;
  isOptimal: boolean;
  isComplete: boolean;
  color: string;
  description: string;
  characteristics: string[];
}

export const ALGORITHMS: Record<AlgorithmId, AlgorithmMetadata> = {
  dijkstra: {
    id: 'dijkstra',
    name: "Dijkstra's Algorithm",
    tagline: 'Settle the unsettled node with the lowest accumulated cost',
    category: 'Optimal',
    timeComplexity: 'O((V + E) log V)',
    spaceComplexity: 'O(V)',
    isOptimal: true,
    isComplete: true,
    color: '#0284c7', // Sky Blue
    description:
      'Finds a minimum-cost route for non-negative weights by settling the smallest accumulated cost g(n). Search order follows graph costs, not literal geographic circles.',
    characteristics: [
      'Optimal shortest travel time',
      'Non-negative edge weights required',
      'Min-Heap Priority Queue on cumulative g(n)',
    ],
  },
  a_star: {
    id: 'a_star',
    name: 'A* Search',
    tagline: 'Goal-directed optimal search guided by admissible Haversine heuristic',
    category: 'Heuristic',
    timeComplexity: 'O((V + E) log V)',
    spaceComplexity: 'O(V)',
    isOptimal: true,
    isComplete: true,
    color: '#10b981', // Emerald
    description:
      'Orders the frontier by g(n) + h(n). This implementation scales geographic distance against every represented edge to obtain a consistent lower bound; without useful coordinates h is zero. A heuristic can reduce work, but does not guarantee fewer expansions on every query.',
    characteristics: [
      'Mathematically optimal path',
      'Graph-derived consistent lower bound',
      'f(n) = g(n) + h(n) evaluation',
    ],
  },
  bidirectional_a_star: {
    id: 'bidirectional_a_star',
    name: 'Bidirectional A*',
    tagline: 'Balanced potentials, reversed edges and a lower-bound stopping rule',
    category: 'Bidirectional',
    timeComplexity: 'O((V + E) log V)',
    spaceComplexity: 'O(V + E)',
    isOptimal: true,
    isComplete: true,
    color: '#8b5cf6', // Violet
    description:
      'Searches forward and backward on reversed edges using compatible reduced costs. A meeting supplies an upper bound; optimality requires the combined frontier lower bound to reach it. The first meeting alone is not a valid stopping rule.',
    characteristics: [
      'Forward search plus reversed-graph search',
      'Graph-validated, consistent balanced potentials',
      'Incumbent route plus lower-bound termination',
    ],
  },
  greedy: {
    id: 'greedy',
    name: 'Greedy Best-First',
    tagline: 'Pure heuristic chase always choosing the geographically closest node',
    category: 'Heuristic',
    timeComplexity: 'O((V + E) log V)',
    spaceComplexity: 'O(V)',
    isOptimal: false,
    isComplete: true,
    color: '#f59e0b', // Amber
    description:
      'Orders the frontier using only h(n), ignoring the accumulated route cost. It can find a route quickly, but can choose a much more expensive path. With a zero heuristic, ties follow insertion order.',
    characteristics: [
      'Does not guarantee minimum cost',
      'Order depends on the heuristic and ties',
      'f(n) = h(n) heuristic only',
    ],
  },
  bfs: {
    id: 'bfs',
    name: 'Breadth-First Search (BFS)',
    tagline: 'Unweighted hop-by-hop exploration ring by ring',
    category: 'Unweighted',
    timeComplexity: 'O(V + E)',
    spaceComplexity: 'O(V)',
    isOptimal: false, // Not optimal for weighted road distances
    isComplete: true,
    color: '#ec4899', // Pink
    description:
      'Traverses the graph layer by layer using a FIFO queue. Minimizes the total number of road segment hops, but ignores speed limits and physical mileage, illustrating why weighted search is essential for navigation.',
    characteristics: [
      'Minimizes intersection hop count',
      'Uniform topological rings',
      'FIFO Queue (unweighted)',
    ],
  },
  dfs: {
    id: 'dfs',
    name: 'Depth-First Search (DFS)',
    tagline: 'Exhaustive branch plunging with backtracking',
    category: 'Exhaustive',
    timeComplexity: 'O(V + E)',
    spaceComplexity: 'O(V)',
    isOptimal: false,
    isComplete: true,
    color: '#ef4444', // Red
    description:
      'Follows a branch before backtracking, using a stack and a visited set. It finds a route in a finite reachable graph, but neither minimizes hops nor weighted cost; neighbor order can strongly affect the result.',
    characteristics: [
      'No shortest-path guarantee',
      'LIFO Stack exploration',
      'Demonstrates unguided tree traversal',
    ],
  },
};

export type StepType = 'visit' | 'frontier' | 'settle' | 'meet' | 'done';

export interface SearchStep {
  stepIndex: number;
  type: StepType;
  nodeId: string;
  parentId?: string;
  g: number;
  h: number;
  f: number;
  openSetCount: number;
  closedSetCount: number;
  direction?: 'forward' | 'backward';
  edgeName?: string;
  queueKey?: number;
  lowerBound?: number;
  incumbent?: number;
}

export interface PathfindingResult {
  algorithm: AlgorithmId;
  startId: string;
  goalId: string;
  found: boolean;
  path: string[]; // List of node IDs from start to goal
  pathEdges: { u: string; v: string; name: string; distance: number; speedLimit: number }[];
  totalDistanceMiles: number;
  totalTimeMinutes: number;
  exploredCount: number;
  peakFrontierCount: number;
  steps: SearchStep[];
  executionTimeMs: number;
}

// Min-Priority Queue for Dijkstra & A*
class PriorityQueue<T> {
  private items: { element: T; priority: number }[] = [];

  enqueue(element: T, priority: number): void {
    this.items.push({ element, priority });
    let index = this.items.length - 1;
    while (index > 0) { const parent = (index - 1) >> 1; if (this.items[parent].priority <= priority) break; [this.items[index], this.items[parent]] = [this.items[parent], this.items[index]]; index = parent; }
  }

  dequeue(): T | undefined {
    const first = this.items[0]; const last = this.items.pop();
    if (this.items.length && last) {
      this.items[0] = last;
      let index = 0;
      while (true) {
        const left = index * 2 + 1; const right = left + 1;
        if (left >= this.items.length) break;
        const child = right < this.items.length && this.items[right].priority < this.items[left].priority ? right : left;
        if (this.items[index].priority <= this.items[child].priority) break;
        [this.items[index], this.items[child]] = [this.items[child], this.items[index]]; index = child;
      }
    }
    return first?.element;
  }

  isEmpty(): boolean {
    return this.items.length === 0;
  }

  size(): number {
    return this.items.length;
  }
  peek(): T | undefined { return this.items[0]?.element; }
  peekPriority(): number { return this.items[0]?.priority ?? Infinity; }
}

/** A consistent metric lower bound derived from EVERY represented edge, not a
 * guessed highway speed. Missing/identical coordinates safely yield h = 0. */
export function graphHeuristic(graph: BayGraph): (from: BayNode, to: BayNode) => number {
  let minutesPerMile = Infinity;
  for (const [u, links] of graph.adjacency) for (const { target, weight } of links) {
    if (!Number.isFinite(weight) || weight < 0) throw new Error('Search requires finite non-negative edge weights.');
    const from = graph.nodes.get(u)!; const to = graph.nodes.get(target)!;
    const distance = haversineDistanceMiles(from.lat, from.lng, to.lat, to.lng);
    if (distance > 0) minutesPerMile = Math.min(minutesPerMile, weight / distance);
  }
  const coordinatesValid = [...graph.nodes.values()].every((node) => Number.isFinite(node.lat) && Number.isFinite(node.lng));
  const scale = coordinatesValid && graph.heuristicMode !== 'zero' && Number.isFinite(minutesPerMile) ? Math.max(0, minutesPerMile * (1 - 1e-12)) : 0;
  if (scale === 0) return () => 0;
  return (from, to) => scale * haversineDistanceMiles(from.lat, from.lng, to.lat, to.lng);
}

/**
 * Reconstructs the full path from goal to start following parent pointers.
 */
function reconstructPath(
  parentMap: Map<string, string>,
  startId: string,
  goalId: string
): string[] {
  const path: string[] = [];
  let curr: string | undefined = goalId;

  while (curr !== undefined) {
    path.unshift(curr);
    if (curr === startId) break;
    curr = parentMap.get(curr);
  }

  if (path.length > 0 && path[0] === startId) {
    return path;
  }
  return [];
}

/**
 * Calculates road distances and times along a reconstructed path.
 */
function computePathMetrics(graph: BayGraph, path: string[]) {
  let totalDistanceMiles = 0;
  let totalTimeMinutes = 0;
  const pathEdges: {
    u: string;
    v: string;
    name: string;
    distance: number;
    speedLimit: number;
  }[] = [];

  for (let i = 0; i < path.length - 1; i++) {
    const u = path[i];
    const v = path[i + 1];
    const neighbors = graph.adjacency.get(u) || [];
    const match = neighbors.filter((n) => n.target === v).sort((a, b) => a.weight - b.weight)[0];
    if (match) {
      totalDistanceMiles += match.edge.distance;
      totalTimeMinutes += match.weight;
      pathEdges.push({
        u,
        v,
        name: match.edge.name,
        distance: match.edge.distance,
        speedLimit: match.edge.speedLimit,
      });
    }
  }

  return {
    totalDistanceMiles,
    totalTimeMinutes,
    pathEdges,
  };
}

/**
 * Dijkstra's Algorithm (Uniform Cost Search)
 */
export function runDijkstra(
  graph: BayGraph,
  startId: string,
  goalId: string
): PathfindingResult {
  const t0 = performance.now();
  const steps: SearchStep[] = [];
  const gScore = new Map<string, number>();
  const parent = new Map<string, string>();
  const closed = new Set<string>();
  const pq = new PriorityQueue<string>();
  let peakFrontier = 0;

  for (const n of graph.nodes.keys()) {
    gScore.set(n, Infinity);
  }

  gScore.set(startId, 0);
  pq.enqueue(startId, 0);
  peakFrontier = Math.max(peakFrontier, pq.size());

  steps.push({
    stepIndex: steps.length,
    type: 'visit',
    nodeId: startId,
    g: 0,
    h: 0,
    f: 0,
    openSetCount: pq.size(),
    closedSetCount: closed.size,
  });

  let found = false;

  while (!pq.isEmpty()) {
    const curr = pq.dequeue()!;
    if (closed.has(curr)) continue;

    closed.add(curr);
    const currG = gScore.get(curr) ?? Infinity;

    steps.push({
      stepIndex: steps.length,
      type: 'settle',
      nodeId: curr,
      parentId: parent.get(curr),
      g: currG,
      h: 0,
      f: currG,
      openSetCount: pq.size(),
      closedSetCount: closed.size,
    });

    if (curr === goalId) {
      found = true;
      break;
    }

    const neighbors = graph.adjacency.get(curr) || [];
    for (const { target, weight, edge } of neighbors) {
      if (closed.has(target)) continue;

      const tentativeG = currG + weight;
      if (tentativeG < (gScore.get(target) ?? Infinity)) {
        gScore.set(target, tentativeG);
        parent.set(target, curr);
        pq.enqueue(target, tentativeG);
        peakFrontier = Math.max(peakFrontier, pq.size());

        steps.push({
          stepIndex: steps.length,
          type: 'frontier',
          nodeId: target,
          parentId: curr,
          g: tentativeG,
          h: 0,
          f: tentativeG,
          openSetCount: pq.size(),
          closedSetCount: closed.size,
          edgeName: edge.name,
        });
      }
    }
  }

  const path = found ? reconstructPath(parent, startId, goalId) : [];
  const metrics = computePathMetrics(graph, path);

  steps.push({
    stepIndex: steps.length,
    type: 'done',
    nodeId: goalId,
    g: metrics.totalTimeMinutes,
    h: 0,
    f: metrics.totalTimeMinutes,
    openSetCount: pq.size(),
    closedSetCount: closed.size,
  });

  return {
    algorithm: 'dijkstra',
    startId,
    goalId,
    found,
    path,
    pathEdges: metrics.pathEdges,
    totalDistanceMiles: metrics.totalDistanceMiles,
    totalTimeMinutes: metrics.totalTimeMinutes,
    exploredCount: closed.size,
    peakFrontierCount: peakFrontier,
    steps,
    executionTimeMs: Math.round((performance.now() - t0) * 100) / 100,
  };
}

/**
 * A* Search (Admissible Haversine Heuristic)
 */
export function runAStar(
  graph: BayGraph,
  startId: string,
  goalId: string,
  heuristicMultiplier = 1.0
): PathfindingResult {
  const t0 = performance.now();
  const steps: SearchStep[] = [];
  const gScore = new Map<string, number>();
  const fScore = new Map<string, number>();
  const parent = new Map<string, string>();
  const closed = new Set<string>();
  const pq = new PriorityQueue<string>();
  let peakFrontier = 0;

  const goalNode = graph.nodes.get(goalId)!;

  for (const n of graph.nodes.keys()) {
    gScore.set(n, Infinity);
    fScore.set(n, Infinity);
  }

  const startNode = graph.nodes.get(startId)!;
  const heuristic = graphHeuristic(graph);
  heuristicMultiplier = Math.max(0, Math.min(1, heuristicMultiplier));
  const startH = heuristic(startNode, goalNode) * heuristicMultiplier;

  gScore.set(startId, 0);
  fScore.set(startId, startH);
  pq.enqueue(startId, startH);
  peakFrontier = Math.max(peakFrontier, pq.size());

  steps.push({
    stepIndex: steps.length,
    type: 'visit',
    nodeId: startId,
    g: 0,
    h: startH,
    f: startH,
    openSetCount: pq.size(),
    closedSetCount: closed.size,
  });

  let found = false;

  while (!pq.isEmpty()) {
    const curr = pq.dequeue()!;
    if (closed.has(curr)) continue;

    closed.add(curr);
    const currG = gScore.get(curr) ?? Infinity;
    const currNode = graph.nodes.get(curr)!;
    const currH = heuristic(currNode, goalNode) * heuristicMultiplier;

    steps.push({
      stepIndex: steps.length,
      type: 'settle',
      nodeId: curr,
      parentId: parent.get(curr),
      g: currG,
      h: currH,
      f: currG + currH,
      openSetCount: pq.size(),
      closedSetCount: closed.size,
    });

    if (curr === goalId) {
      found = true;
      break;
    }

    const neighbors = graph.adjacency.get(curr) || [];
    for (const { target, weight, edge } of neighbors) {
      if (closed.has(target)) continue;

      const tentativeG = currG + weight;
      if (tentativeG < (gScore.get(target) ?? Infinity)) {
        const targetNode = graph.nodes.get(target)!;
        const targetH = heuristic(targetNode, goalNode) * heuristicMultiplier;
        const targetF = tentativeG + targetH;

        gScore.set(target, tentativeG);
        fScore.set(target, targetF);
        parent.set(target, curr);
        pq.enqueue(target, targetF);
        peakFrontier = Math.max(peakFrontier, pq.size());

        steps.push({
          stepIndex: steps.length,
          type: 'frontier',
          nodeId: target,
          parentId: curr,
          g: tentativeG,
          h: targetH,
          f: targetF,
          openSetCount: pq.size(),
          closedSetCount: closed.size,
          edgeName: edge.name,
        });
      }
    }
  }

  const path = found ? reconstructPath(parent, startId, goalId) : [];
  const metrics = computePathMetrics(graph, path);

  steps.push({
    stepIndex: steps.length,
    type: 'done',
    nodeId: goalId,
    g: metrics.totalTimeMinutes,
    h: 0,
    f: metrics.totalTimeMinutes,
    openSetCount: pq.size(),
    closedSetCount: closed.size,
  });

  return {
    algorithm: 'a_star',
    startId,
    goalId,
    found,
    path,
    pathEdges: metrics.pathEdges,
    totalDistanceMiles: metrics.totalDistanceMiles,
    totalTimeMinutes: metrics.totalTimeMinutes,
    exploredCount: closed.size,
    peakFrontierCount: peakFrontier,
    steps,
    executionTimeMs: Math.round((performance.now() - t0) * 100) / 100,
  };
}

/**
 * Greedy Best-First Search (Heuristic Only f(n) = h(n))
 */
export function runGreedyBestFirst(
  graph: BayGraph,
  startId: string,
  goalId: string
): PathfindingResult {
  const t0 = performance.now();
  const steps: SearchStep[] = [];
  const parent = new Map<string, string>();
  const closed = new Set<string>();
  const pq = new PriorityQueue<string>();
  let peakFrontier = 0;

  const goalNode = graph.nodes.get(goalId)!;
  const startNode = graph.nodes.get(startId)!;
  const heuristic = graphHeuristic(graph);
  const startH = heuristic(startNode, goalNode);

  pq.enqueue(startId, startH);
  peakFrontier = Math.max(peakFrontier, pq.size());

  steps.push({
    stepIndex: steps.length,
    type: 'visit',
    nodeId: startId,
    g: 0,
    h: startH,
    f: startH,
    openSetCount: pq.size(),
    closedSetCount: closed.size,
  });

  let found = false;

  while (!pq.isEmpty()) {
    const curr = pq.dequeue()!;
    if (closed.has(curr)) continue;

    closed.add(curr);
    const currNode = graph.nodes.get(curr)!;
    const currH = heuristic(currNode, goalNode);

    steps.push({
      stepIndex: steps.length,
      type: 'settle',
      nodeId: curr,
      parentId: parent.get(curr),
      g: 0,
      h: currH,
      f: currH,
      openSetCount: pq.size(),
      closedSetCount: closed.size,
    });

    if (curr === goalId) {
      found = true;
      break;
    }

    const neighbors = graph.adjacency.get(curr) || [];
    for (const { target, edge } of neighbors) {
      if (closed.has(target)) continue;

      if (!parent.has(target)) {
        const targetNode = graph.nodes.get(target)!;
        const targetH = heuristic(targetNode, goalNode);
        parent.set(target, curr);
        pq.enqueue(target, targetH);
        peakFrontier = Math.max(peakFrontier, pq.size());

        steps.push({
          stepIndex: steps.length,
          type: 'frontier',
          nodeId: target,
          parentId: curr,
          g: 0,
          h: targetH,
          f: targetH,
          openSetCount: pq.size(),
          closedSetCount: closed.size,
          edgeName: edge.name,
        });
      }
    }
  }

  const path = found ? reconstructPath(parent, startId, goalId) : [];
  const metrics = computePathMetrics(graph, path);

  steps.push({
    stepIndex: steps.length,
    type: 'done',
    nodeId: goalId,
    g: metrics.totalTimeMinutes,
    h: 0,
    f: metrics.totalTimeMinutes,
    openSetCount: pq.size(),
    closedSetCount: closed.size,
  });

  return {
    algorithm: 'greedy',
    startId,
    goalId,
    found,
    path,
    pathEdges: metrics.pathEdges,
    totalDistanceMiles: metrics.totalDistanceMiles,
    totalTimeMinutes: metrics.totalTimeMinutes,
    exploredCount: closed.size,
    peakFrontierCount: peakFrontier,
    steps,
    executionTimeMs: Math.round((performance.now() - t0) * 100) / 100,
  };
}

/**
 * Breadth-First Search (BFS - Unweighted Hop Count)
 */
export function runBFS(
  graph: BayGraph,
  startId: string,
  goalId: string
): PathfindingResult {
  const t0 = performance.now();
  const steps: SearchStep[] = [];
  const parent = new Map<string, string>();
  const visited = new Set<string>();
  const queue: string[] = [startId];
  visited.add(startId);
  let peakFrontier = 1;

  steps.push({
    stepIndex: steps.length,
    type: 'visit',
    nodeId: startId,
    g: 0,
    h: 0,
    f: 0,
    openSetCount: queue.length,
    closedSetCount: visited.size,
  });

  let found = false;

  while (queue.length > 0) {
    const curr = queue.shift()!;

    steps.push({
      stepIndex: steps.length,
      type: 'settle',
      nodeId: curr,
      parentId: parent.get(curr),
      g: 0,
      h: 0,
      f: 0,
      openSetCount: queue.length,
      closedSetCount: visited.size,
    });

    if (curr === goalId) {
      found = true;
      break;
    }

    const neighbors = graph.adjacency.get(curr) || [];
    for (const { target, edge } of neighbors) {
      if (!visited.has(target)) {
        visited.add(target);
        parent.set(target, curr);
        queue.push(target);
        peakFrontier = Math.max(peakFrontier, queue.length);

        steps.push({
          stepIndex: steps.length,
          type: 'frontier',
          nodeId: target,
          parentId: curr,
          g: 0,
          h: 0,
          f: 0,
          openSetCount: queue.length,
          closedSetCount: visited.size,
          edgeName: edge.name,
        });
      }
    }
  }

  const path = found ? reconstructPath(parent, startId, goalId) : [];
  const metrics = computePathMetrics(graph, path);

  steps.push({
    stepIndex: steps.length,
    type: 'done',
    nodeId: goalId,
    g: metrics.totalTimeMinutes,
    h: 0,
    f: metrics.totalTimeMinutes,
    openSetCount: queue.length,
    closedSetCount: visited.size,
  });

  return {
    algorithm: 'bfs',
    startId,
    goalId,
    found,
    path,
    pathEdges: metrics.pathEdges,
    totalDistanceMiles: metrics.totalDistanceMiles,
    totalTimeMinutes: metrics.totalTimeMinutes,
    exploredCount: visited.size,
    peakFrontierCount: peakFrontier,
    steps,
    executionTimeMs: Math.round((performance.now() - t0) * 100) / 100,
  };
}

/**
 * Bidirectional A* Search (Simultaneous Dual-End Exploration)
 */
export function runBidirectionalAStar(graph: BayGraph, startId: string, goalId: string): PathfindingResult {
  const t0 = performance.now();
  const steps: SearchStep[] = [];
  const metric = graphHeuristic(graph);
  const start = graph.nodes.get(startId)!;
  const goal = graph.nodes.get(goalId)!;
  const potential = (id: string) => (metric(graph.nodes.get(id)!, goal) - metric(start, graph.nodes.get(id)!)) / 2;
  const ps = potential(startId);
  const pt = potential(goalId);
  const reverse = new Map<string, Array<{ target: string; weight: number; edge: BayEdge }>>();
  for (const id of graph.nodes.keys()) reverse.set(id, []);
  for (const [u, links] of graph.adjacency) for (const link of links) reverse.get(link.target)?.push({ target: u, weight: link.weight, edge: link.edge });
  const distances = [new Map([[startId, 0]]), new Map([[goalId, 0]])];
  const parents = [new Map<string, string>(), new Map<string, string>()];
  const settled = [new Set<string>(), new Set<string>()];
  const queues = [new PriorityQueue<{ id: string; g: number }>(), new PriorityQueue<{ id: string; g: number }>()];
  queues[0].enqueue({ id: startId, g: 0 }, 0);
  queues[1].enqueue({ id: goalId, g: 0 }, 0);
  let upper = startId === goalId ? 0 : Infinity;
  let meeting: string | null = startId === goalId ? startId : null;
  let peak = 2;
  const clean = (direction: number) => {
    const queue = queues[direction];
    while (!queue.isEmpty()) {
      const top = queue.peek()!;
      if (settled[direction].has(top.id) || top.g !== distances[direction].get(top.id)) queue.dequeue();
      else break;
    }
  };
  const consider = (id: string) => {
    const candidate = (distances[0].get(id) ?? Infinity) + (distances[1].get(id) ?? Infinity);
    if (candidate < upper) { upper = candidate; meeting = id; }
  };
  while (true) {
    clean(0); clean(1);
    if (queues[0].isEmpty() || queues[1].isEmpty()) break;
    // Both queues are Dijkstra queues in the SAME reduced-cost metric.
    // Convert the incumbent's original cost into that metric before stopping.
    const lower = queues[0].peekPriority() + queues[1].peekPriority();
    if (Number.isFinite(upper) && lower >= upper + pt - ps - 1e-10) break;
    const direction = queues[0].peekPriority() <= queues[1].peekPriority() ? 0 : 1;
    const { id, g } = queues[direction].dequeue()!;
    settled[direction].add(id);
    const h = direction === 0 ? metric(graph.nodes.get(id)!, goal) : metric(start, graph.nodes.get(id)!);
    steps.push({ stepIndex: steps.length, type: 'settle', nodeId: id, parentId: parents[direction].get(id), g, h, f: g + h, queueKey: g + (direction === 0 ? potential(id) - ps : pt - potential(id)), lowerBound: lower, incumbent: Number.isFinite(upper) ? upper : undefined, openSetCount: queues[0].size() + queues[1].size(), closedSetCount: settled[0].size + settled[1].size, direction: direction === 0 ? 'forward' : 'backward' });
    consider(id);
    const links = (direction === 0 ? graph.adjacency : reverse).get(id) ?? [];
    for (const { target, weight, edge } of links) {
      if (settled[direction].has(target)) continue;
      const next = g + weight;
      if (next >= (distances[direction].get(target) ?? Infinity)) continue;
      distances[direction].set(target, next);
      parents[direction].set(target, id);
      const reducedDistance = next + (direction === 0 ? potential(target) - ps : pt - potential(target));
      queues[direction].enqueue({ id: target, g: next }, reducedDistance);
      const targetH = direction === 0 ? metric(graph.nodes.get(target)!, goal) : metric(start, graph.nodes.get(target)!);
      steps.push({ stepIndex: steps.length, type: 'frontier', nodeId: target, parentId: id, g: next, h: targetH, f: next + targetH, queueKey: reducedDistance, openSetCount: queues[0].size() + queues[1].size(), closedSetCount: settled[0].size + settled[1].size, direction: direction === 0 ? 'forward' : 'backward', edgeName: edge.name });
      consider(target);
    }
    peak = Math.max(peak, queues[0].size() + queues[1].size());
  }
  const path = meeting === null ? [] : reconstructPath(parents[0], startId, meeting);
  if (meeting !== null) {
    let id = meeting;
    while (id !== goalId) { const next = parents[1].get(id); if (next === undefined) break; path.push(next); id = next; }
    steps.push({ stepIndex: steps.length, type: 'meet', nodeId: meeting, g: upper, h: 0, f: upper, openSetCount: 0, closedSetCount: settled[0].size + settled[1].size });
  }
  const metrics = computePathMetrics(graph, path);
  steps.push({ stepIndex: steps.length, type: 'done', nodeId: goalId, g: metrics.totalTimeMinutes, h: 0, f: metrics.totalTimeMinutes, openSetCount: 0, closedSetCount: settled[0].size + settled[1].size });
  return { algorithm: 'bidirectional_a_star', startId, goalId, found: path.length > 0 && path[path.length - 1] === goalId, path, ...metrics, exploredCount: settled[0].size + settled[1].size, peakFrontierCount: peak, steps, executionTimeMs: performance.now() - t0 };
}

/**
 * Depth-First Search (DFS - Exhaustive Tree Exploration)
 */
export function runDFS(
  graph: BayGraph,
  startId: string,
  goalId: string
): PathfindingResult {
  const t0 = performance.now();
  const steps: SearchStep[] = [];
  const parent = new Map<string, string>();
  const visited = new Set<string>();
  const stack: string[] = [startId];
  let peakFrontier = 1;

  steps.push({
    stepIndex: steps.length,
    type: 'visit',
    nodeId: startId,
    g: 0,
    h: 0,
    f: 0,
    openSetCount: stack.length,
    closedSetCount: visited.size,
  });

  let found = false;

  while (stack.length > 0) {
    const curr = stack.pop()!;
    if (visited.has(curr)) continue;

    visited.add(curr);

    steps.push({
      stepIndex: steps.length,
      type: 'settle',
      nodeId: curr,
      parentId: parent.get(curr),
      g: 0,
      h: 0,
      f: 0,
      openSetCount: stack.length,
      closedSetCount: visited.size,
    });

    if (curr === goalId) {
      found = true;
      break;
    }

    const neighbors = graph.adjacency.get(curr) || [];
    for (const { target, edge } of neighbors) {
      if (!visited.has(target)) {
        parent.set(target, curr);
        stack.push(target);
        peakFrontier = Math.max(peakFrontier, stack.length);

        steps.push({
          stepIndex: steps.length,
          type: 'frontier',
          nodeId: target,
          parentId: curr,
          g: 0,
          h: 0,
          f: 0,
          openSetCount: stack.length,
          closedSetCount: visited.size,
          edgeName: edge.name,
        });
      }
    }
  }

  const path = found ? reconstructPath(parent, startId, goalId) : [];
  const metrics = computePathMetrics(graph, path);

  steps.push({
    stepIndex: steps.length,
    type: 'done',
    nodeId: goalId,
    g: metrics.totalTimeMinutes,
    h: 0,
    f: metrics.totalTimeMinutes,
    openSetCount: stack.length,
    closedSetCount: visited.size,
  });

  return {
    algorithm: 'dfs',
    startId,
    goalId,
    found,
    path,
    pathEdges: metrics.pathEdges,
    totalDistanceMiles: metrics.totalDistanceMiles,
    totalTimeMinutes: metrics.totalTimeMinutes,
    exploredCount: visited.size,
    peakFrontierCount: peakFrontier,
    steps,
    executionTimeMs: Math.round((performance.now() - t0) * 100) / 100,
  };
}

/**
 * Universal algorithm runner dispatch.
 */
export function runPathfinding(
  algorithm: AlgorithmId,
  graph: BayGraph,
  startId: string,
  goalId: string
): PathfindingResult {
  switch (algorithm) {
    case 'dijkstra':
      return runDijkstra(graph, startId, goalId);
    case 'a_star':
      return runAStar(graph, startId, goalId);
    case 'bidirectional_a_star':
      return runBidirectionalAStar(graph, startId, goalId);
    case 'greedy':
      return runGreedyBestFirst(graph, startId, goalId);
    case 'bfs':
      return runBFS(graph, startId, goalId);
    case 'dfs':
      return runDFS(graph, startId, goalId);
  }
}
