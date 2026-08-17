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
}

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
): DbgGraph {
  const reads: string[] = Array.isArray(input)
    ? input.map((r) => r.trim().toUpperCase().replace(/[^A-Z]/g, '')).filter(Boolean)
    : [input.trim().toUpperCase().replace(/[^A-Z]/g, '')].filter(Boolean);

  const safeK = Math.max(3, Math.min(8, k));
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
    };
    edges.set(edgeId, edge);

    const fromNode = nodes.get(data.from);
    const toNode = nodes.get(data.to);
    if (fromNode) {
      fromNode.outDeg += data.count;
      fromNode.outEdges.push(edgeId);
    }
    if (toNode) {
      toNode.inDeg += data.count;
      toNode.inEdges.push(edgeId);
    }
  }

  const graph: DbgGraph = {
    k: safeK,
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
        for (let c = 0; c < edge.coverage; c++) {
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

  while (stack.length > 0) {
    const u = stack[stack.length - 1];
    const outList = remainingEdges.get(u);

    if (outList && outList.length > 0) {
      const next = outList.pop()!;
      stack.push(next.to);
      edgeStack.push(next.edgeId);
    } else {
      pathNodesRev.push(stack.pop()!);
      if (edgeStack.length > 0) {
        pathEdgesRev.push(edgeStack.pop()!);
      }
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
  };
}

/**
 * Tip Clipping: Prune dead-end spurs.
 */
export function clipTips(
  graph: DbgGraph,
  _maxTipLen: number = 3,
): { clippedEdges: string[]; clippedNodes: string[] } {
  const { nodes, edges } = graph;
  const clippedEdges: string[] = [];
  const clippedNodes: string[] = [];

  let changed = true;
  let iter = 0;

  while (changed && iter < 10) {
    changed = false;
    iter++;

    for (const [id, node] of nodes.entries()) {
      // Dead-end tip: outDeg === 0 and inDeg === 1 with low coverage
      if (node.outDeg === 0 && node.inEdges.length === 1) {
        const eId = node.inEdges[0];
        const edge = edges.get(eId);
        if (edge && !edge.isRemoved && edge.coverage === 1) {
          edge.isRemoved = true;
          edge.isTip = true;
          node.isTip = true;
          clippedEdges.push(eId);
          clippedNodes.push(id);

          // Decrement fromNode outDeg
          const parent = nodes.get(edge.from);
          if (parent) {
            parent.outDeg -= edge.coverage;
            parent.outEdges = parent.outEdges.filter((e) => e !== eId);
          }
          changed = true;
        }
      }
      // Dead-end tip: inDeg === 0 and outDeg === 1 with low coverage
      if (node.inDeg === 0 && node.outEdges.length === 1) {
        const eId = node.outEdges[0];
        const edge = edges.get(eId);
        if (edge && !edge.isRemoved && edge.coverage === 1) {
          edge.isRemoved = true;
          edge.isTip = true;
          node.isTip = true;
          clippedEdges.push(eId);
          clippedNodes.push(id);

          // Decrement toNode inDeg
          const child = nodes.get(edge.to);
          if (child) {
            child.inDeg -= edge.coverage;
            child.inEdges = child.inEdges.filter((e) => e !== eId);
          }
          changed = true;
        }
      }
    }
  }

  graph.eulerian = findEulerianPath(graph);
  graph.unitigs = compactUnitigs(graph);
  computeStats(graph);

  return { clippedEdges, clippedNodes };
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
  const { nodes, edges } = graph;
  const visitedNodes = new Set<string>();
  const unitigs: Unitig[] = [];
  let unitigCounter = 0;

  // Identify starts of unitigs: nodes where inDeg !== 1 or outDeg !== 1
  for (const [id, node] of nodes.entries()) {
    const isBranching = node.inDeg !== 1 || node.outDeg !== 1;
    if (isBranching && node.outDeg > 0) {
      for (const eId of node.outEdges) {
        const edge = edges.get(eId);
        if (!edge || edge.isRemoved) continue;

        unitigCounter++;
        const uNodes: string[] = [id];
        const uEdges: string[] = [eId];
        let seq = id + edge.kmer[edge.kmer.length - 1];
        let totalCov = edge.coverage;
        let currNodeId = edge.to;

        while (true) {
          uNodes.push(currNodeId);
          visitedNodes.add(currNodeId);

          const cNode = nodes.get(currNodeId);
          if (!cNode || cNode.inDeg !== 1 || cNode.outDeg !== 1) {
            break;
          }

          const nextEdgeId = cNode.outEdges[0];
          const nextEdge = edges.get(nextEdgeId);
          if (!nextEdge || nextEdge.isRemoved) break;

          uEdges.push(nextEdgeId);
          seq += nextEdge.kmer[nextEdge.kmer.length - 1];
          totalCov += nextEdge.coverage;
          currNodeId = nextEdge.to;
        }

        unitigs.push({
          id: `unitig_${unitigCounter}`,
          sequence: seq,
          length: seq.length,
          nodes: uNodes,
          edges: uEdges,
          avgCoverage: Math.round((totalCov / uEdges.length) * 10) / 10,
        });
      }
    }
  }

  // Fallback for simple isolated circles
  if (unitigs.length === 0 && graph.eulerian.assembledSeq) {
    unitigs.push({
      id: 'unitig_1',
      sequence: graph.eulerian.assembledSeq,
      length: graph.eulerian.assembledSeq.length,
      nodes: graph.eulerian.pathNodes,
      edges: graph.eulerian.pathEdges,
      avgCoverage: 1,
    });
  }

  unitigs.sort((a, b) => b.length - a.length);
  return unitigs;
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
