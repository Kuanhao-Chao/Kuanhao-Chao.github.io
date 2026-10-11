/**
 * Exact, forward-oriented overlap graph teaching engine.
 * This uses exhaustive overlaps and local length-and-label-equivalent triangle
 * reduction, not Myers' optimized full string-graph implementation.
 */
export interface ReadRecord {
  id: string; name: string; sequence: string; length: number;
  isContained?: boolean; containedIn?: string;
}
export interface OverlapEdge {
  id: string; from: string; to: string; overlapLen: number; overhang: string;
  isTransitive?: boolean; isRemoved?: boolean;
}
export interface UnitigTiling {
  readId: string; readName: string; start: number; end: number; sequence: string;
}
export interface Unitig {
  id: string; sequence: string; length: number; readPath: string[]; tiling: UnitigTiling[];
}
export interface ReductionCheck {
  direct: string; via: [string, string]; directExtension: string;
  indirectExtension: string; directShift: number; indirectShift: number;
  equivalent: boolean;
}
export interface StringGraphResult {
  minOverlap: number; reads: ReadRecord[]; rawEdges: OverlapEdge[];
  reducedEdges: OverlapEdge[]; transitiveEdges: OverlapEdge[];
  reductionChecks: ReductionCheck[]; containedReads: string[]; unitigs: Unitig[];
  stats: { numReads: number; rawEdgeCount: number; reducedEdgeCount: number; transitiveRemoved: number; n50: number };
}
export function findPrefixSuffixOverlap(seqA: string, seqB: string, minOverlap = 4): { overlapLen: number; overhang: string } | null {
  for (let len = Math.min(seqA.length - 1, seqB.length - 1); len >= minOverlap; len--) {
    if (seqA.slice(-len) === seqB.slice(0, len)) return { overlapLen: len, overhang: seqB.slice(len) };
  }
  return null;
}
export function buildOverlapGraph(rawReads: string[] | string, minOverlap = 4): StringGraphResult {
  if (!Number.isInteger(minOverlap) || minOverlap < 1) throw new Error('Minimum overlap must be a positive integer.');
  const lines = (Array.isArray(rawReads) ? rawReads : rawReads.split(/[\n,;]+/)).map(s => s.trim().toUpperCase()).filter(Boolean);
  if (lines.some(s => !/^[ACGTN]+$/.test(s))) throw new Error('Reads must contain ACGTN only. N is literal; no characters were stripped.');
  if (lines.length > 24 || lines.some(s => s.length > 100)) throw new Error('Teaching limit: 24 reads of at most 100 bases.');
  const reads: ReadRecord[] = lines.map((sequence, idx) => ({ id: `R${idx + 1}`, name: `Read_${idx + 1}`, sequence, length: sequence.length }));
  for (let i = 0; i < reads.length; i++) {
    // Strictly longer containers win; among identical copies keep the first.
    const containers = reads.filter((r, j) => (r.length > reads[i].length || r.length === reads[i].length && j < i) && r.sequence.includes(reads[i].sequence));
    containers.sort((a, b) => b.length - a.length || reads.indexOf(a) - reads.indexOf(b));
    if (containers.length) { reads[i].isContained = true; reads[i].containedIn = containers[0].id; }
  }
  const active = reads.filter(r => !r.isContained);
  const rawEdges: OverlapEdge[] = [];
  for (const a of active) for (const b of active) if (a.id !== b.id) {
    const overlap = findPrefixSuffixOverlap(a.sequence, b.sequence, minOverlap);
    if (overlap) rawEdges.push({ id: `e_${a.id}_${b.id}`, from: a.id, to: b.id, ...overlap, isTransitive: false, isRemoved: false });
  }
  const { reducedEdges, transitiveEdges, checks } = reduceTransitiveEdges(active, rawEdges);
  const unitigs = generateLayoutAndConsensus(active, reducedEdges);
  const total = unitigs.reduce((n, u) => n + u.length, 0);
  let sum = 0; let n50 = 0;
  for (const u of unitigs) { sum += u.length; if (sum >= total / 2) { n50 = u.length; break; } }
  return { minOverlap, reads, rawEdges, reducedEdges, transitiveEdges, reductionChecks: checks,
    containedReads: reads.filter(r => r.isContained).map(r => r.id), unitigs,
    stats: { numReads: active.length, rawEdgeCount: rawEdges.length, reducedEdgeCount: reducedEdges.length, transitiveRemoved: transitiveEdges.length, n50 } };
}
export function reduceTransitiveEdges(reads: ReadRecord[], edges: OverlapEdge[]): { reducedEdges: OverlapEdge[]; transitiveEdges: OverlapEdge[]; checks: ReductionCheck[] } {
  const readMap = new Map(reads.map(r => [r.id, r]));
  const adj = new Map(reads.map(r => [r.id, edges.filter(e => e.from === r.id)]));
  const removed = new Set<string>(); const checks: ReductionCheck[] = [];
  // Positive shifts strictly shorten witness edges, preventing circular removal
  // dependencies. Removing triangles does not claim full transitive reduction.
  for (const ab of edges) for (const bc of adj.get(ab.to) ?? []) {
    const ac = adj.get(ab.from)?.find(e => e.to === bc.to);
    if (!ac || ab.from === bc.to) continue;
    const directShift = readMap.get(ac.from)!.length - ac.overlapLen;
    const indirectShift = readMap.get(ab.from)!.length - ab.overlapLen + readMap.get(bc.from)!.length - bc.overlapLen;
    const indirectExtension = ab.overhang + bc.overhang;
    const equivalent = directShift === indirectShift && ac.overhang === indirectExtension;
    checks.push({ direct: ac.id, via: [ab.id, bc.id], directExtension: ac.overhang, indirectExtension, directShift, indirectShift, equivalent });
    if (equivalent) removed.add(ac.id);
  }
  return {
    reducedEdges: edges.filter(e => !removed.has(e.id)).map(e => ({ ...e, isTransitive: false, isRemoved: false })),
    transitiveEdges: edges.filter(e => removed.has(e.id)).map(e => ({ ...e, isTransitive: true, isRemoved: true })), checks,
  };
}
/** Historical API name retained; this spells exact paths, not noisy-read consensus. */
export function generateLayoutAndConsensus(reads: ReadRecord[], edges: OverlapEdge[]): Unitig[] {
  const readMap = new Map(reads.map(r => [r.id, r]));
  const active = edges.filter(e => !e.isRemoved);
  const incoming = new Map(reads.map(r => [r.id, active.filter(e => e.to === r.id)]));
  const outgoing = new Map(reads.map(r => [r.id, active.filter(e => e.from === r.id)]));
  const visited = new Set<string>(); const unitigs: Unitig[] = [];
  const walk = (first: OverlapEdge) => {
    const start = readMap.get(first.from)!;
    let sequence = start.sequence;
    const readPath = [start.id];
    const tiling: UnitigTiling[] = [{ readId: start.id, readName: start.name, start: 0, end: start.length, sequence: start.sequence }];
    let edge: OverlapEdge | undefined = first;
    while (edge && !visited.has(edge.id)) {
      visited.add(edge.id);
      const read: ReadRecord = readMap.get(edge.to)!; const offset = sequence.length - edge.overlapLen;
      sequence += edge.overhang; readPath.push(read.id);
      tiling.push({ readId: read.id, readName: read.name, start: offset, end: offset + read.length, sequence: read.sequence });
      edge = incoming.get(read.id)!.length === 1 && outgoing.get(read.id)!.length === 1 ? outgoing.get(read.id)![0] : undefined;
    }
    unitigs.push({ id: `unitig_${unitigs.length + 1}`, sequence, length: sequence.length, readPath, tiling });
  };
  for (const read of reads) if (incoming.get(read.id)!.length !== 1 || outgoing.get(read.id)!.length !== 1) {
    for (const edge of outgoing.get(read.id)!) if (!visited.has(edge.id)) walk(edge);
  }
  // Every remaining edge belongs to an otherwise unvisited cyclic component.
  for (const edge of active) if (!visited.has(edge.id)) walk(edge);
  for (const read of reads) if (!incoming.get(read.id)!.length && !outgoing.get(read.id)!.length) {
    unitigs.push({ id: `unitig_${unitigs.length + 1}`, sequence: read.sequence, length: read.length, readPath: [read.id],
      tiling: [{ readId: read.id, readName: read.name, start: 0, end: read.length, sequence: read.sequence }] });
  }
  return unitigs.sort((a, b) => b.length - a.length);
}
