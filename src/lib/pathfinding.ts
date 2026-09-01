import {
  type BayGraph,
  type BayNode,
  haversineDistanceMiles,
  heuristicTravelTimeMinutes,
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
    tagline: 'Uniform cost exploration expanding in concentric geodesic contours',
    category: 'Optimal',
    timeComplexity: 'O((V + E) log V)',
    spaceComplexity: 'O(V)',
    isOptimal: true,
    isComplete: true,
    color: '#0284c7', // Sky Blue
    description:
      "Guarantees the mathematically optimal shortest path by exploring outward in uniform cost contours without any directional heuristic guidance. Explores equally in all directions.",
    characteristics: [
      'Optimal shortest travel time',
      'Concentric wavefront expansion',
      'Min-Heap Priority Queue on cumulative g(n)',
    ],
  },
  a_star: {
    id: 'a_star',
    name: 'A* Search',
    tagline: 'Goal-directed optimal search guided by admissible Haversine heuristic',
    category: 'Heuristic',
    timeComplexity: 'O(E)',
    spaceComplexity: 'O(V)',
    isOptimal: true,
    isComplete: true,
    color: '#10b981', // Emerald
    description:
      'Combines actual path cost g(n) with an admissible straight-line distance heuristic h(n). Pulls the exploration cone directly toward the destination, drastically reducing explored nodes.',
    characteristics: [
      'Mathematically optimal path',
      'Tear-drop directed search cone',
      'f(n) = g(n) + h(n) evaluation',
    ],
  },
  bidirectional_a_star: {
    id: 'bidirectional_a_star',
    name: 'Bidirectional A*',
    tagline: 'Dual-end simultaneous searches meeting halfway across the Bay',
    category: 'Bidirectional',
    timeComplexity: 'O(b^(d/2))',
    spaceComplexity: 'O(b^(d/2))',
    isOptimal: true,
    isComplete: true,
    color: '#8b5cf6', // Violet
    description:
      'Executes two concurrent A* searches: one forward from the start, and one backward from the destination. When their frontiers collide, the search space volume is reduced by up to an order of magnitude.',
    characteristics: [
      'Simultaneous dual search cones',
      'Exponential search volume reduction',
      'Meets on intermediate bridges/highways',
    ],
  },
  greedy: {
    id: 'greedy',
    name: 'Greedy Best-First',
    tagline: 'Pure heuristic chase always choosing the geographically closest node',
    category: 'Heuristic',
    timeComplexity: 'O(V + E)',
    spaceComplexity: 'O(V)',
    isOptimal: false,
    isComplete: true,
    color: '#f59e0b', // Amber
    description:
      'Evaluates only h(n), aggressively charging directly toward the target. In open terrain it is lightning fast, but around geographic obstacles (like the SF Bay) it can get trapped along shorelines before finding bridge ramps.',
    characteristics: [
      'Ultra-fast forward rush',
      'Can be fooled by water barriers',
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
      'Explores as deep as possible down each arterial branch before backtracking. Included for educational contrast to demonstrate why unguided depth search produces wild, circuitous paths across multiple counties.',
    characteristics: [
      'Highly suboptimal zigzag paths',
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
    const item = { element, priority };
    let added = false;
    for (let i = 0; i < this.items.length; i++) {
      if (item.priority < this.items[i].priority) {
        this.items.splice(i, 0, item);
        added = true;
        break;
      }
    }
    if (!added) {
      this.items.push(item);
    }
  }

  dequeue(): T | undefined {
    return this.items.shift()?.element;
  }

  isEmpty(): boolean {
    return this.items.length === 0;
  }

  size(): number {
    return this.items.length;
  }
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
    const match = neighbors.find((n) => n.target === v);
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
    totalDistanceMiles: Math.round(totalDistanceMiles * 10) / 10,
    totalTimeMinutes: Math.round(totalTimeMinutes * 10) / 10,
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
  const startH = heuristicTravelTimeMinutes(startNode, goalNode) * heuristicMultiplier;

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
    const currH = heuristicTravelTimeMinutes(currNode, goalNode) * heuristicMultiplier;

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
        const targetH = heuristicTravelTimeMinutes(targetNode, goalNode) * heuristicMultiplier;
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
  const startH = heuristicTravelTimeMinutes(startNode, goalNode);

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
    const currH = heuristicTravelTimeMinutes(currNode, goalNode);

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
        const targetH = heuristicTravelTimeMinutes(targetNode, goalNode);
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
export function runBidirectionalAStar(
  graph: BayGraph,
  startId: string,
  goalId: string
): PathfindingResult {
  const t0 = performance.now();
  const steps: SearchStep[] = [];

  const gForward = new Map<string, number>();
  const gBackward = new Map<string, number>();
  const parentForward = new Map<string, string>();
  const parentBackward = new Map<string, string>();
  const closedForward = new Set<string>();
  const closedBackward = new Set<string>();

  const pqForward = new PriorityQueue<string>();
  const pqBackward = new PriorityQueue<string>();
  let peakFrontier = 0;

  const startNode = graph.nodes.get(startId)!;
  const goalNode = graph.nodes.get(goalId)!;

  for (const n of graph.nodes.keys()) {
    gForward.set(n, Infinity);
    gBackward.set(n, Infinity);
  }

  gForward.set(startId, 0);
  gBackward.set(goalId, 0);

  const hF = heuristicTravelTimeMinutes(startNode, goalNode);
  const hB = heuristicTravelTimeMinutes(goalNode, startNode);

  pqForward.enqueue(startId, hF);
  pqBackward.enqueue(goalId, hB);
  peakFrontier = Math.max(peakFrontier, pqForward.size() + pqBackward.size());

  steps.push({
    stepIndex: steps.length,
    type: 'visit',
    nodeId: startId,
    g: 0,
    h: hF,
    f: hF,
    openSetCount: pqForward.size() + pqBackward.size(),
    closedSetCount: closedForward.size + closedBackward.size,
    direction: 'forward',
  });

  steps.push({
    stepIndex: steps.length,
    type: 'visit',
    nodeId: goalId,
    g: 0,
    h: hB,
    f: hB,
    openSetCount: pqForward.size() + pqBackward.size(),
    closedSetCount: closedForward.size + closedBackward.size,
    direction: 'backward',
  });

  let meetingNode: string | null = null;
  let bestCost = Infinity;

  while (!pqForward.isEmpty() && !pqBackward.isEmpty()) {
    // Forward Step
    const currF = pqForward.dequeue()!;
    if (!closedForward.has(currF)) {
      closedForward.add(currF);
      const gF = gForward.get(currF) ?? Infinity;
      const hCurrF = heuristicTravelTimeMinutes(graph.nodes.get(currF)!, goalNode);

      steps.push({
        stepIndex: steps.length,
        type: 'settle',
        nodeId: currF,
        parentId: parentForward.get(currF),
        g: gF,
        h: hCurrF,
        f: gF + hCurrF,
        openSetCount: pqForward.size() + pqBackward.size(),
        closedSetCount: closedForward.size + closedBackward.size,
        direction: 'forward',
      });

      if (closedBackward.has(currF)) {
        const total = gF + (gBackward.get(currF) ?? Infinity);
        if (total < bestCost) {
          bestCost = total;
          meetingNode = currF;
          break;
        }
      }

      const neighborsF = graph.adjacency.get(currF) || [];
      for (const { target, weight, edge } of neighborsF) {
        if (closedForward.has(target)) continue;

        const tentativeG = gF + weight;
        if (tentativeG < (gForward.get(target) ?? Infinity)) {
          gForward.set(target, tentativeG);
          parentForward.set(target, currF);
          const hTargetF = heuristicTravelTimeMinutes(graph.nodes.get(target)!, goalNode);
          pqForward.enqueue(target, tentativeG + hTargetF);

          steps.push({
            stepIndex: steps.length,
            type: 'frontier',
            nodeId: target,
            parentId: currF,
            g: tentativeG,
            h: hTargetF,
            f: tentativeG + hTargetF,
            openSetCount: pqForward.size() + pqBackward.size(),
            closedSetCount: closedForward.size + closedBackward.size,
            direction: 'forward',
            edgeName: edge.name,
          });
        }
      }
    }

    // Backward Step
    const currB = pqBackward.dequeue()!;
    if (!closedBackward.has(currB)) {
      closedBackward.add(currB);
      const gB = gBackward.get(currB) ?? Infinity;
      const hCurrB = heuristicTravelTimeMinutes(graph.nodes.get(currB)!, startNode);

      steps.push({
        stepIndex: steps.length,
        type: 'settle',
        nodeId: currB,
        parentId: parentBackward.get(currB),
        g: gB,
        h: hCurrB,
        f: gB + hCurrB,
        openSetCount: pqForward.size() + pqBackward.size(),
        closedSetCount: closedForward.size + closedBackward.size,
        direction: 'backward',
      });

      if (closedForward.has(currB)) {
        const total = (gForward.get(currB) ?? Infinity) + gB;
        if (total < bestCost) {
          bestCost = total;
          meetingNode = currB;
          break;
        }
      }

      const neighborsB = graph.adjacency.get(currB) || [];
      for (const { target, weight, edge } of neighborsB) {
        if (closedBackward.has(target)) continue;

        const tentativeG = gB + weight;
        if (tentativeG < (gBackward.get(target) ?? Infinity)) {
          gBackward.set(target, tentativeG);
          parentBackward.set(target, currB);
          const hTargetB = heuristicTravelTimeMinutes(graph.nodes.get(target)!, startNode);
          pqBackward.enqueue(target, tentativeG + hTargetB);

          steps.push({
            stepIndex: steps.length,
            type: 'frontier',
            nodeId: target,
            parentId: currB,
            g: tentativeG,
            h: hTargetB,
            f: tentativeG + hTargetB,
            openSetCount: pqForward.size() + pqBackward.size(),
            closedSetCount: closedForward.size + closedBackward.size,
            direction: 'backward',
            edgeName: edge.name,
          });
        }
      }
    }

    peakFrontier = Math.max(peakFrontier, pqForward.size() + pqBackward.size());
  }

  const path: string[] = [];
  if (meetingNode) {
    steps.push({
      stepIndex: steps.length,
      type: 'meet',
      nodeId: meetingNode,
      g: bestCost,
      h: 0,
      f: bestCost,
      openSetCount: 0,
      closedSetCount: closedForward.size + closedBackward.size,
    });

    // Reconstruct start -> meetingNode
    const forwardPart = reconstructPath(parentForward, startId, meetingNode);
    path.push(...forwardPart);

    // Reconstruct meetingNode -> goal
    let currBack: string | undefined = parentBackward.get(meetingNode);
    while (currBack !== undefined) {
      path.push(currBack);
      if (currBack === goalId) break;
      currBack = parentBackward.get(currBack);
    }
  }

  const metrics = computePathMetrics(graph, path);

  steps.push({
    stepIndex: steps.length,
    type: 'done',
    nodeId: goalId,
    g: metrics.totalTimeMinutes,
    h: 0,
    f: metrics.totalTimeMinutes,
    openSetCount: 0,
    closedSetCount: closedForward.size + closedBackward.size,
  });

  return {
    algorithm: 'bidirectional_a_star',
    startId,
    goalId,
    found: path.length > 0,
    path,
    pathEdges: metrics.pathEdges,
    totalDistanceMiles: metrics.totalDistanceMiles,
    totalTimeMinutes: metrics.totalTimeMinutes,
    exploredCount: closedForward.size + closedBackward.size,
    peakFrontierCount: peakFrontier,
    steps,
    executionTimeMs: Math.round((performance.now() - t0) * 100) / 100,
  };
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
