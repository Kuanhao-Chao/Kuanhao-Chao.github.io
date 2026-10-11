/**
 * De Bruijn Graph (Eulerian Path Genome Assembly) Engine
 * - Builds (k-1)-mer nodes and k-mer directed edges with coverage
 * - Computes Eulerian Path (Hierholzer's Algorithm)
 * - Graph Cleaning Heuristics: Tip Clipping, Bubble Popping, Coverage Filtering, Unitig Compaction
 */

export interface DbgNode {
  id: string; // (k-1)-mer string
  kminus1: string;
  inDeg: number;
  outDeg: number;
  inEdges: string[]; // Edge IDs
  outEdges: string[]; // Edge IDs
  isTip?: boolean;
}

export interface DbgEdge {
  id: string;
  kmer: string;
  from: string; // source node ID
  to: string; // target node ID
  coverage: number;
  multiplicity: number | null; // Null means observation counts do not specify genome copies.
  isTip?: boolean;
  isBubble?: boolean;
  isRemoved?: boolean;
}

export interface EulerianResult {
  isEulerian: boolean;
  startNode?: string;
  endNode?: string;
  pathNodes: string[];
  pathEdges: string[];
  assembledSeq: string;
  statusText: string;
  trace?: EulerianTrace[];
}
export interface EulerianTrace { phase: 'start' | 'consume' | 'backtrack'; node: string; edge?: string; stack: string[]; reversePath: string[]; consumed: number }

export interface Unitig {
  id: string;
  sequence: string;
  length: number;
  nodes: string[];
  edges: string[];
  avgCoverage: number;
}

export interface DbgGraph {
  k: number;
  dataMode: 'multiset' | 'coverage';
  nodes: Map<string, DbgNode>;
  edges: Map<string, DbgEdge>;
  eulerian: EulerianResult;
  unitigs: Unitig[];
  stats: {
    numNodes: number;
    numEdges: number;
    totalKmers: number;
    maxContigLen: number;
    n50: number;
  };
}

/**
 * Build De Bruijn graph from sequence(s) and k-mer length.
 */
export function buildDeBruijnGraph(
  input: string | string[],
  k: number = 4,
  dataMode: 'multiset' | 'coverage' = 'multiset',
): DbgGraph {
  const reads: string[] = Array.isArray(input)
    ? input.map((r) => r.trim().toUpperCase()).filter(Boolean)
    : [input.trim().toUpperCase()].filter(Boolean);

  if (!Number.isInteger(k) || k < 2 || k > 8) throw new Error('k must be an integer between 2 and 8; it is not silently clamped.');
  if (reads.some(read => !/^[ACGTN]+$/.test(read))) throw new Error('Reads must use ACGTN letters only; N is a literal symbol, not a wildcard.');
  const safeK = k;
  const nodes = new Map<string, DbgNode>();
  const edges = new Map<string, DbgEdge>();
  const edgeCountMap = new Map<string, { from: string; to: string; count: number }>();

  let totalKmers = 0;

  for (const read of reads) {
    if (read.length < safeK) continue;

    for (let i = 0; i <= read.length - safeK; i++) {
      const kmer = read.substring(i, i + safeK);
      const prefix = kmer.substring(0, safeK - 1);
      const suffix = kmer.substring(1);

      totalKmers++;

      // Record nodes
      if (!nodes.has(prefix)) {
        nodes.set(prefix, {
          id: prefix,
          kminus1: prefix,
          inDeg: 0,
          outDeg: 0,
          inEdges: [],
          outEdges: [],
        });
      }
      if (!nodes.has(suffix)) {
        nodes.set(suffix, {
          id: suffix,
          kminus1: suffix,
          inDeg: 0,
          outDeg: 0,
          inEdges: [],
          outEdges: [],
        });
      }

      // Count edge coverage
      const existing = edgeCountMap.get(kmer);
      if (existing) {
        existing.count++;
      } else {
        edgeCountMap.set(kmer, { from: prefix, to: suffix, count: 1 });
      }
    }
  }

  // Populate Edges and Degree references
  let edgeCounter = 0;
  for (const [kmer, data] of edgeCountMap.entries()) {
    edgeCounter++;
    const edgeId = `e_${edgeCounter}_${kmer}`;
    const edge: DbgEdge = {
      id: edgeId,
      kmer,
      from: data.from,
      to: data.to,
      coverage: data.count,
      multiplicity: dataMode === 'multiset' ? data.count : null,
    };
    edges.set(edgeId, edge);

    const fromNode = nodes.get(data.from);
    const toNode = nodes.get(data.to);
    if (fromNode) {
      fromNode.outDeg += dataMode === 'multiset' ? data.count : 1;
      fromNode.outEdges.push(edgeId);
    }
    if (toNode) {
      toNode.inDeg += dataMode === 'multiset' ? data.count : 1;
      toNode.inEdges.push(edgeId);
    }
  }

  const graph: DbgGraph = {
    k: safeK,
    dataMode,
    nodes,
    edges,
    eulerian: {
      isEulerian: false,
      pathNodes: [],
      pathEdges: [],
      assembledSeq: '',
      statusText: '',
    },
    unitigs: [],
    stats: {
      numNodes: nodes.size,
      numEdges: edges.size,
      totalKmers,
      maxContigLen: 0,
      n50: 0,
    },
  };

  graph.eulerian = findEulerianPath(graph);
  graph.unitigs = compactUnitigs(graph);
  computeStats(graph);

  return graph;
}

/**
 * Find Eulerian Path in directed De Bruijn graph using Hierholzer's algorithm.
 */
export function findEulerianPath(graph: DbgGraph): EulerianResult {
  const { nodes, edges } = graph;
  refreshDegrees(graph);
  if (graph.dataMode === 'coverage') return { isEulerian: false, pathNodes: [], pathEdges: [], assembledSeq: '', statusText: 'Coverage counts observations, not genomic copies. Inspect topology and unitigs; genome-copy Euler traversal is disabled in this mode.' };
  if (nodes.size === 0 || edges.size === 0) {
    return {
      isEulerian: false,
      pathNodes: [],
      pathEdges: [],
      assembledSeq: '',
      statusText: 'Empty graph.',
    };
  }

  let startNode: string | undefined;
  let endNode: string | undefined;
  let startCount = 0;
  let endCount = 0;

  for (const [id, node] of nodes.entries()) {
    const diff = node.outDeg - node.inDeg;
    if (diff === 1) {
      startNode = id;
      startCount++;
    } else if (diff === -1) {
      endNode = id;
      endCount++;
    } else if (diff !== 0) {
      return {
        isEulerian: false,
        pathNodes: [],
        pathEdges: [],
        assembledSeq: '',
        statusText: `Non-Eulerian: Node "${id}" has in-degree ${node.inDeg} vs out-degree ${node.outDeg} (diff = ${diff}).`,
      };
    }
  }

  if (startCount > 1 || endCount > 1) {
    return {
      isEulerian: false,
      pathNodes: [],
      pathEdges: [],
      assembledSeq: '',
      statusText: 'Non-Eulerian: multiple start/end unbalanced nodes.',
    };
  }

  // If fully balanced (Eulerian Circuit), pick any node with outgoing edges
  if (!startNode) {
    for (const [id, node] of nodes.entries()) {
      if (node.outDeg > 0) {
        startNode = id;
        break;
      }
    }
  }

  if (!startNode) {
    return {
      isEulerian: false,
      pathNodes: [],
      pathEdges: [],
      assembledSeq: '',
      statusText: 'No start node available.',
    };
  }

  // Hierholzer's Algorithm using Edge Multiplicity
  // Copy available outgoing edges count
  const remainingEdges = new Map<string, { to: string; edgeId: string }[]>();
  let totalEdgeInstances = 0;

  for (const [id, node] of nodes.entries()) {
    const edgeList: { to: string; edgeId: string }[] = [];
    for (const eId of node.outEdges) {
      const edge = edges.get(eId);
      if (edge && !edge.isRemoved) {
        for (let c = 0; c < (edge.multiplicity ?? 0); c++) {
          edgeList.push({ to: edge.to, edgeId: edge.id });
          totalEdgeInstances++;
        }
      }
    }
    remainingEdges.set(id, edgeList);
  }

  const stack: string[] = [startNode];
  const pathNodesRev: string[] = [];
  const edgeStack: string[] = [];
  const pathEdgesRev: string[] = [];
  let consumed = 0;
  const trace: EulerianTrace[] = [{ phase: 'start', node: startNode, stack: [...stack], reversePath: [], consumed }];

  while (stack.length > 0) {
    const u = stack[stack.length - 1];
    const outList = remainingEdges.get(u);

    if (outList && outList.length > 0) {
      const next = outList.pop()!;
      stack.push(next.to);
      edgeStack.push(next.edgeId);
      consumed++;
      trace.push({ phase: 'consume', node: next.to, edge: next.edgeId, stack: [...stack], reversePath: [...pathNodesRev], consumed });
    } else {
      const popped = stack.pop()!;
      pathNodesRev.push(popped);
      if (edgeStack.length > 0) {
        pathEdgesRev.push(edgeStack.pop()!);
      }
      trace.push({ phase: 'backtrack', node: popped, stack: [...stack], reversePath: [...pathNodesRev], consumed });
    }
  }

  const pathNodes = pathNodesRev.reverse();
  const pathEdges = pathEdgesRev.reverse();

  if (pathEdges.length !== totalEdgeInstances) {
    return {
      isEulerian: false,
      pathNodes,
      pathEdges,
      assembledSeq: '',
      statusText: `Disconnected graph: traversed ${pathEdges.length}/${totalEdgeInstances} edges.`,
      trace,
    };
  }

  // Reconstruct Assembled Genome Sequence
  let assembledSeq = pathNodes[0] || '';
  for (let i = 0; i < pathEdges.length; i++) {
    const edge = edges.get(pathEdges[i]);
    if (edge) {
      assembledSeq += edge.kmer[edge.kmer.length - 1];
    }
  }

  return {
    isEulerian: true,
    startNode,
    endNode,
    pathNodes,
    pathEdges,
    assembledSeq,
    statusText: `Eulerian Path found! Reconstructed ${assembledSeq.length} bp sequence traversing ${pathEdges.length} edges.`,
    trace,
  };
}

/**
 * Tip Clipping: Prune dead-end spurs.
 */
export function clipTips(graph: DbgGraph, maxTipLen = 3): { clippedEdges: string[]; clippedNodes: string[] } {
  if (!Number.isInteger(maxTipLen) || maxTipLen < 1) throw new Error('Tip length must be positive.');
  const active = [...graph.edges.values()].filter(edge => !edge.isRemoved);
  const outgoing = (id: string) => active.filter(e => e.from === id);
  const incoming = (id: string) => active.filter(e => e.to === id);
  const clippedEdges = new Set<string>(); const clippedNodes = new Set<string>();
  for (const id of graph.nodes.keys()) for (const reverse of [false, true]) {
    const branches = reverse ? incoming(id) : outgoing(id);
    if (branches.length < 2) continue; // A normal contig end is NOT a branch-attached tip.
    for (const first of branches) {
      const path = [first]; const seen = new Set([id]); let node = reverse ? first.from : first.to;
      let deadEnd = false;
      while (path.length <= maxTipLen && !seen.has(node)) {
        seen.add(node);
        const inList = reverse ? outgoing(node) : incoming(node);
        const outList = reverse ? incoming(node) : outgoing(node);
        if (inList.length !== 1) break;
        if (!outList.length) { deadEnd = true; break; }
        if (outList.length !== 1 || path.length === maxTipLen) break;
        const next = outList[0]; path.push(next); node = reverse ? next.from : next.to;
      }
      const support = Math.max(...path.map(e => e.coverage));
      if (!deadEnd || support > 1 || !branches.some(e => e.id !== first.id && e.coverage > support)) continue;
      for (const edge of path) { clippedEdges.add(edge.id); clippedNodes.add(reverse ? edge.from : edge.to); }
    }
  }
  for (const id of clippedEdges) { const edge = graph.edges.get(id)!; edge.isRemoved = true; edge.isTip = true; }
  refreshDegrees(graph);
  graph.eulerian = findEulerianPath(graph); graph.unitigs = compactUnitigs(graph); computeStats(graph);
  return { clippedEdges: [...clippedEdges], clippedNodes: [...clippedNodes] };
}

/**
 * Bubble Popping: Collapses alternative parallel paths due to SNPs/errors.
 */
export function popBubbles(
  graph: DbgGraph,
  maxBubbleDepth: number = 8,
): { poppedEdges: string[]; consensusEdges: string[] } {
  const { nodes, edges } = graph;
  const poppedEdges: string[] = [];
  const consensusEdges: string[] = [];

  for (const [startId, startNode] of nodes.entries()) {
    const activeOut = startNode.outEdges
      .map((eId) => edges.get(eId))
      .filter((e): e is DbgEdge => !!e && !e.isRemoved);

    if (activeOut.length >= 2) {
      // Find forward simple paths from each branch up to maxBubbleDepth
      interface PathRecord {
        edgeList: string[];
        nodeList: string[];
        target: string;
        totalCov: number;
      }

      const allBranchPaths: PathRecord[][] = [];

      for (const branchEdge of activeOut) {
        const branchPaths: PathRecord[] = [];
        const queue: { currNode: string; edgeList: string[]; nodeList: string[]; totalCov: number }[] = [
          {
            currNode: branchEdge.to,
            edgeList: [branchEdge.id],
            nodeList: [startId, branchEdge.to],
            totalCov: branchEdge.coverage,
          },
        ];

        while (queue.length > 0) {
          const item = queue.shift()!;
          branchPaths.push({
            edgeList: item.edgeList,
            nodeList: item.nodeList,
            target: item.currNode,
            totalCov: item.totalCov,
          });

          if (item.edgeList.length < maxBubbleDepth) {
            const nextNode = nodes.get(item.currNode);
            if (nextNode && nextNode.outEdges.length === 1) {
              const nextEdgeId = nextNode.outEdges[0];
              const nextEdge = edges.get(nextEdgeId);
              if (nextEdge && !nextEdge.isRemoved && !item.nodeList.includes(nextEdge.to)) {
                queue.push({
                  currNode: nextEdge.to,
                  edgeList: [...item.edgeList, nextEdgeId],
                  nodeList: [...item.nodeList, nextEdge.to],
                  totalCov: item.totalCov + nextEdge.coverage,
                });
              }
            }
          }
        }
        allBranchPaths.push(branchPaths);
      }

      // Check if any two branches meet at the same target
      for (let b1 = 0; b1 < allBranchPaths.length; b1++) {
        for (let b2 = b1 + 1; b2 < allBranchPaths.length; b2++) {
          const paths1 = allBranchPaths[b1];
          const paths2 = allBranchPaths[b2];

          for (const p1 of paths1) {
            for (const p2 of paths2) {
              if (p1.target === p2.target && p1.edgeList.length > 0 && p2.edgeList.length > 0) {
                // Check if already removed
                const p1Removed = p1.edgeList.some((eId) => edges.get(eId)?.isRemoved);
                const p2Removed = p2.edgeList.some((eId) => edges.get(eId)?.isRemoved);
                if (p1Removed || p2Removed) continue;

                const avgCov1 = p1.totalCov / p1.edgeList.length;
                const avgCov2 = p2.totalCov / p2.edgeList.length;
                if (Math.abs(avgCov1 - avgCov2) < 1e-12) continue; // Equal-support variation is not an error.
                if (p1.edgeList.some(id => p2.edgeList.includes(id))) continue;
                const simpleInterior = (path: PathRecord) => path.nodeList.slice(1, -1).every(id => {
                  const node = nodes.get(id)!;
                  return node.inEdges.filter(e => !edges.get(e)?.isRemoved).length === 1 && node.outEdges.filter(e => !edges.get(e)?.isRemoved).length === 1;
                });
                if (!simpleInterior(p1) || !simpleInterior(p2)) continue;

                const winner = avgCov1 >= avgCov2 ? p1 : p2;
                const loser = avgCov1 >= avgCov2 ? p2 : p1;

                winner.edgeList.forEach((eId) => consensusEdges.push(eId));

                for (const eId of loser.edgeList) {
                  const edge = edges.get(eId);
                  if (edge && !edge.isRemoved) {
                    edge.isRemoved = true;
                    edge.isBubble = true;
                    poppedEdges.push(eId);

                    const fn = nodes.get(edge.from);
                    if (fn) {
                      fn.outDeg -= edge.coverage;
                      fn.outEdges = fn.outEdges.filter((e) => e !== eId);
                    }
                    const tn = nodes.get(edge.to);
                    if (tn) {
                      tn.inDeg -= edge.coverage;
                      tn.inEdges = tn.inEdges.filter((e) => e !== eId);
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  }

  graph.eulerian = findEulerianPath(graph);
  graph.unitigs = compactUnitigs(graph);
  computeStats(graph);

  return { poppedEdges, consensusEdges };
}

/**
 * Coverage Filtering: Remove edges with coverage strictly below threshold.
 */
export function filterLowCoverage(
  graph: DbgGraph,
  minCoverage: number,
): { removedEdges: string[] } {
  const { nodes, edges } = graph;
  const removedEdges: string[] = [];

  for (const [eId, edge] of edges.entries()) {
    if (!edge.isRemoved && edge.coverage < minCoverage) {
      edge.isRemoved = true;
      removedEdges.push(eId);

      const fromNode = nodes.get(edge.from);
      if (fromNode) {
        fromNode.outDeg -= edge.coverage;
        fromNode.outEdges = fromNode.outEdges.filter((e) => e !== eId);
      }
      const toNode = nodes.get(edge.to);
      if (toNode) {
        toNode.inDeg -= edge.coverage;
        toNode.inEdges = toNode.inEdges.filter((e) => e !== eId);
      }
    }
  }

  graph.eulerian = findEulerianPath(graph);
  graph.unitigs = compactUnitigs(graph);
  computeStats(graph);

  return { removedEdges };
}

/**
 * Unitig Compaction: Merges linear unbranched chains of nodes.
 */
export function compactUnitigs(graph: DbgGraph): Unitig[] {
  const active = [...graph.edges.values()].filter(edge => !edge.isRemoved);
  const outgoing = new Map<string, DbgEdge[]>(); const incoming = new Map<string, DbgEdge[]>();
  for (const id of graph.nodes.keys()) { outgoing.set(id, []); incoming.set(id, []); }
  for (const edge of active) { outgoing.get(edge.from)!.push(edge); incoming.get(edge.to)!.push(edge); }
  const visited = new Set<string>(); const unitigs: Unitig[] = [];
  function walk(first: DbgEdge) {
    let edge = first; let sequence = first.from; const nodes = [first.from]; const edges: string[] = [];
    let coverage = 0;
    while (!visited.has(edge.id)) {
      visited.add(edge.id); edges.push(edge.id); nodes.push(edge.to);
      sequence += edge.kmer.at(-1); coverage += edge.coverage;
      const next = outgoing.get(edge.to)!;
      if (incoming.get(edge.to)!.length !== 1 || next.length !== 1 || visited.has(next[0].id)) break;
      edge = next[0];
    }
    unitigs.push({ id: `unitig_${unitigs.length + 1}`, sequence, length: sequence.length, nodes, edges, avgCoverage: coverage / edges.length });
  }
  for (const id of graph.nodes.keys()) {
    if (incoming.get(id)!.length === 1 && outgoing.get(id)!.length === 1) continue;
    for (const edge of outgoing.get(id)!) if (!visited.has(edge.id)) walk(edge);
  }
  // Every leftover component is a nonbranching cycle; never drop a disconnected cycle.
  for (const edge of active) if (!visited.has(edge.id)) walk(edge);
  return unitigs.sort((a, b) => b.length - a.length);
}

function computeStats(graph: DbgGraph) {
  const lengths = graph.unitigs.map((u) => u.length);
  const totalLength = lengths.reduce((acc, l) => acc + l, 0);
  const maxContigLen = lengths.length > 0 ? lengths[0] : 0;

  // N50 calculation
  let cumSum = 0;
  let n50 = 0;
  for (const l of lengths) {
    cumSum += l;
    if (cumSum >= totalLength / 2) {
      n50 = l;
      break;
    }
  }

  graph.stats = {
    numNodes: Array.from(graph.nodes.values()).filter((n) => n.inDeg > 0 || n.outDeg > 0).length,
    numEdges: Array.from(graph.edges.values()).filter((e) => !e.isRemoved).length,
    totalKmers: graph.stats.totalKmers,
    maxContigLen,
    n50,
  };
}

function refreshDegrees(graph: DbgGraph) {
  for (const node of graph.nodes.values()) { node.inDeg = 0; node.outDeg = 0; node.inEdges = []; node.outEdges = []; }
  for (const edge of graph.edges.values()) if (!edge.isRemoved) {
    const from = graph.nodes.get(edge.from)!; const to = graph.nodes.get(edge.to)!;
    from.outEdges.push(edge.id); to.inEdges.push(edge.id); from.outDeg += edge.multiplicity ?? 1; to.inDeg += edge.multiplicity ?? 1;
  }
}

/** Reversible UI preview: callers retain the untouched original graph. */
export function previewGraphCleaning(graph: DbgGraph, operation: 'none' | 'tips' | 'bubbles' | 'coverage', parameter = 3): { graph: DbgGraph; removedEdges: string[]; reason: string } {
  const preview = structuredClone(graph);
  let removedEdges: string[] = [];
  let reason = 'No edges removed.';
  if (operation === 'tips') { removedEdges = clipTips(preview, parameter).clippedEdges; reason = `Branch-attached dead-end path ≤${parameter} edges; maximum support 1 and a stronger competing branch. May still remove real sequence.`; }
  if (operation === 'bubbles') { removedEdges = popBubbles(preview, parameter).poppedEdges; reason = 'Simple paths meet at one sink, spell alternative sequences, and have unequal average support. Lower-support path previewed; ties preserved. This is not variant calling.'; }
  if (operation === 'coverage') { removedEdges = filterLowCoverage(preview, parameter).removedEdges; reason = `Observed edge support below ${parameter}; not evidence that the sequence is biologically false.`; }
  return { graph: preview, removedEdges, reason };
}
