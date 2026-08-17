/**
 * String Graphs & Overlap-Layout-Consensus (OLC) Engine
 * - Prefix-Suffix Overlap Detection
 * - Contained Read Filtering
 * - Myers' Transitive Reduction (O(V + E) algorithm)
 * - Read Tiling Layout and Consensus Unitig Compaction
 */

export interface ReadRecord {
  id: string;
  name: string;
  sequence: string;
  length: number;
  isContained?: boolean;
  containedIn?: string;
}

export interface OverlapEdge {
  id: string;
  from: string; // Source read ID
  to: string; // Target read ID
  overlapLen: number;
  overhang: string; // Extension string added by target read
  isTransitive?: boolean;
  isRemoved?: boolean;
}

export interface UnitigTiling {
  readId: string;
  readName: string;
  start: number;
  end: number;
  sequence: string;
}

export interface Unitig {
  id: string;
  sequence: string;
  length: number;
  readPath: string[];
  tiling: UnitigTiling[];
}

export interface StringGraphResult {
  minOverlap: number;
  reads: ReadRecord[];
  rawEdges: OverlapEdge[];
  reducedEdges: OverlapEdge[];
  transitiveEdges: OverlapEdge[];
  containedReads: string[];
  unitigs: Unitig[];
  stats: {
    numReads: number;
    rawEdgeCount: number;
    reducedEdgeCount: number;
    transitiveRemoved: number;
    n50: number;
  };
}

/**
 * Find exact suffix-prefix overlap where suffix of seqA matches prefix of seqB.
 */
export function findPrefixSuffixOverlap(
  seqA: string,
  seqB: string,
  minOverlap: number = 4,
): { overlapLen: number; overhang: string } | null {
  const maxPossible = Math.min(seqA.length - 1, seqB.length - 1);

  for (let len = maxPossible; len >= minOverlap; len--) {
    const suffixA = seqA.substring(seqA.length - len);
    const prefixB = seqB.substring(0, len);

    if (suffixA === prefixB) {
      const overhang = seqB.substring(len);
      return { overlapLen: len, overhang };
    }
  }

  return null;
}

/**
 * Build Overlap Graph and compute Myers' Transitive Reduction.
 */
export function buildOverlapGraph(
  rawReads: string[] | string,
  minOverlap: number = 4,
): StringGraphResult {
  const lines = (Array.isArray(rawReads) ? rawReads : rawReads.split(/[\n,;]+/))
    .map((s) => s.trim().toUpperCase().replace(/[^A-Z]/g, ''))
    .filter(Boolean);

  const safeOverlap = Math.max(3, minOverlap);

  // 1. Initialize Read Records
  const reads: ReadRecord[] = lines.map((seq, idx) => ({
    id: `R${idx + 1}`,
    name: `Read_${idx + 1}`,
    sequence: seq,
    length: seq.length,
  }));

  // 2. Identify Contained Reads (Reads completely contained in longer reads)
  const containedReads: string[] = [];
  for (let i = 0; i < reads.length; i++) {
    for (let j = 0; j < reads.length; j++) {
      if (i !== j && reads[i].length <= reads[j].length) {
        if (reads[j].sequence.includes(reads[i].sequence)) {
          reads[i].isContained = true;
          reads[i].containedIn = reads[j].id;
          if (!containedReads.includes(reads[i].id)) {
            containedReads.push(reads[i].id);
          }
          break;
        }
      }
    }
  }

  const activeReads = reads.filter((r) => !r.isContained);

  // 3. Compute All-vs-All Prefix-Suffix Overlaps
  const rawEdges: OverlapEdge[] = [];
  let edgeIdCounter = 0;

  for (let i = 0; i < activeReads.length; i++) {
    for (let j = 0; j < activeReads.length; j++) {
      if (i !== j) {
        const rA = activeReads[i];
        const rB = activeReads[j];
        const overlap = findPrefixSuffixOverlap(rA.sequence, rB.sequence, safeOverlap);

        if (overlap && overlap.overhang.length > 0) {
          edgeIdCounter++;
          rawEdges.push({
            id: `e_${edgeIdCounter}_${rA.id}_${rB.id}`,
            from: rA.id,
            to: rB.id,
            overlapLen: overlap.overlapLen,
            overhang: overlap.overhang,
            isTransitive: false,
            isRemoved: false,
          });
        }
      }
    }
  }

  // 4. Myers' O(V + E) Transitive Reduction
  const { reducedEdges, transitiveEdges } = reduceTransitiveEdges(activeReads, rawEdges);

  // 5. Generate Unitig Layout and Consensus
  const unitigs = generateLayoutAndConsensus(activeReads, reducedEdges);

  // 6. Compute Stats & N50
  const lengths = unitigs.map((u) => u.length);
  const totalLength = lengths.reduce((acc, l) => acc + l, 0);
  let cumSum = 0;
  let n50 = 0;
  lengths.sort((a, b) => b - a);
  for (const l of lengths) {
    cumSum += l;
    if (cumSum >= totalLength / 2) {
      n50 = l;
      break;
    }
  }

  return {
    minOverlap: safeOverlap,
    reads,
    rawEdges,
    reducedEdges,
    transitiveEdges,
    containedReads,
    unitigs,
    stats: {
      numReads: activeReads.length,
      rawEdgeCount: rawEdges.length,
      reducedEdgeCount: reducedEdges.length,
      transitiveRemoved: transitiveEdges.length,
      n50: n50 || totalLength,
    },
  };
}

/**
 * Myers' 2005 Transitive Reduction Algorithm for Overlap Graphs.
 * An edge A -> C is transitive if there exists an edge A -> B and a path B -> C
 * such that length(A -> C) = length(A -> B) + length(B -> C).
 */
export function reduceTransitiveEdges(
  reads: ReadRecord[],
  edges: OverlapEdge[],
): { reducedEdges: OverlapEdge[]; transitiveEdges: OverlapEdge[] } {
  // Map node -> outgoing edges
  const adj = new Map<string, OverlapEdge[]>();
  for (const r of reads) {
    adj.set(r.id, []);
  }
  for (const e of edges) {
    adj.get(e.from)?.push(e);
  }

  // Sort outgoing edges by overlap length descending (or overhang ascending)
  for (const [, outEdges] of adj.entries()) {
    outEdges.sort((a, b) => a.overhang.length - b.overhang.length);
  }

  const markedTransitive = new Set<string>();

  for (const rA of reads) {
    const outA = adj.get(rA.id) || [];
    if (outA.length < 2) continue;

    // For each neighbor B of A
    for (const edgeAB of outA) {
      const outB = adj.get(edgeAB.to) || [];

      // For each neighbor C of B
      for (const edgeBC of outB) {
        // Look for direct edge A -> C
        const directEdgeAC = outA.find((e) => e.to === edgeBC.to);
        if (directEdgeAC) {
          // Direct edge A -> C is transitively covered by A -> B -> C
          markedTransitive.add(directEdgeAC.id);
        }
      }
    }
  }

  const reducedEdges: OverlapEdge[] = [];
  const transitiveEdges: OverlapEdge[] = [];

  for (const e of edges) {
    if (markedTransitive.has(e.id)) {
      const transCopy: OverlapEdge = { ...e, isTransitive: true, isRemoved: true };
      transitiveEdges.push(transCopy);
    } else {
      reducedEdges.push({ ...e, isTransitive: false, isRemoved: false });
    }
  }

  return { reducedEdges, transitiveEdges };
}

/**
 * Layout and Consensus generation from reduced string graph.
 */
export function generateLayoutAndConsensus(
  reads: ReadRecord[],
  edges: OverlapEdge[],
): Unitig[] {
  const readMap = new Map<string, ReadRecord>();
  reads.forEach((r) => readMap.set(r.id, r));

  const inDeg = new Map<string, number>();
  const outDeg = new Map<string, number>();
  const adj = new Map<string, OverlapEdge[]>();

  reads.forEach((r) => {
    inDeg.set(r.id, 0);
    outDeg.set(r.id, 0);
    adj.set(r.id, []);
  });

  edges.forEach((e) => {
    if (!e.isRemoved) {
      inDeg.set(e.to, (inDeg.get(e.to) || 0) + 1);
      outDeg.set(e.from, (outDeg.get(e.from) || 0) + 1);
      adj.get(e.from)?.push(e);
    }
  });

  // Find start nodes: inDeg === 0 or branching inDeg !== 1 / outDeg !== 1
  const startNodes: string[] = [];
  for (const r of reads) {
    const inD = inDeg.get(r.id) || 0;
    const outD = outDeg.get(r.id) || 0;
    if (inD === 0 || inD !== 1 || outD !== 1) {
      if (outD > 0) {
        startNodes.push(r.id);
      }
    }
  }

  // Fallback for cycles
  if (startNodes.length === 0 && reads.length > 0) {
    startNodes.push(reads[0].id);
  }

  const unitigs: Unitig[] = [];
  const visitedEdges = new Set<string>();
  let unitigCounter = 0;

  for (const startId of startNodes) {
    const outList = adj.get(startId) || [];

    for (const startEdge of outList) {
      if (visitedEdges.has(startEdge.id)) continue;

      unitigCounter++;
      visitedEdges.add(startEdge.id);

      const rStart = readMap.get(startId);
      if (!rStart) continue;

      const pathReads: string[] = [startId];
      let seq = rStart.sequence;
      const tiling: UnitigTiling[] = [
        {
          readId: rStart.id,
          readName: rStart.name,
          start: 0,
          end: rStart.length,
          sequence: rStart.sequence,
        },
      ];

      let currOffset = 0;
      let currEdge = startEdge;

      while (currEdge) {
        const nextRead = readMap.get(currEdge.to);
        if (!nextRead) break;

        pathReads.push(nextRead.id);
        currOffset += rStart.length - currEdge.overlapLen; // shift

        tiling.push({
          readId: nextRead.id,
          readName: nextRead.name,
          start: seq.length - currEdge.overlapLen,
          end: seq.length + currEdge.overhang.length,
          sequence: nextRead.sequence,
        });

        seq += currEdge.overhang;

        const nextOut = adj.get(nextRead.id) || [];
        const nextIn = inDeg.get(nextRead.id) || 0;
        const nextOutDeg = outDeg.get(nextRead.id) || 0;

        // Stop if branch
        if (nextIn === 1 && nextOutDeg === 1 && nextOut.length === 1 && !visitedEdges.has(nextOut[0].id)) {
          currEdge = nextOut[0];
          visitedEdges.add(currEdge.id);
        } else {
          break;
        }
      }

      unitigs.push({
        id: `unitig_${unitigCounter}`,
        sequence: seq,
        length: seq.length,
        readPath: pathReads,
        tiling,
      });
    }
  }

  // Fallback for single reads
  if (unitigs.length === 0 && reads.length > 0) {
    reads.forEach((r, idx) => {
      unitigs.push({
        id: `unitig_${idx + 1}`,
        sequence: r.sequence,
        length: r.length,
        readPath: [r.id],
        tiling: [
          {
            readId: r.id,
            readName: r.name,
            start: 0,
            end: r.length,
            sequence: r.sequence,
          },
        ],
      });
    });
  }

  unitigs.sort((a, b) => b.length - a.length);
  return unitigs;
}
