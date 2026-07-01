export const DNA_BASES = ['A', 'C', 'G', 'T'] as const;

export type DnaBase = (typeof DNA_BASES)[number];
export type WgtNodeId = 'S1' | 'S2' | 'S3' | 'S4' | 'S5' | 'S6' | 'S7' | 'S8';

export interface WgtDnaEdge {
  id: string;
  from: WgtNodeId;
  to: WgtNodeId;
  label: DnaBase;
}

export const WGT_DNA_NODES: readonly WgtNodeId[] = ['S1', 'S2', 'S3', 'S4', 'S5', 'S6', 'S7', 'S8'];

// Figure 1 topology, adapted to the full DNA alphabet by assigning both edges entering S8 to T.
export const WGT_DNA_EDGES: readonly WgtDnaEdge[] = [
  { id: 's1-s8', from: 'S1', to: 'S8', label: 'T' },
  { id: 's2-s4', from: 'S2', to: 'S4', label: 'A' },
  { id: 's2-s6', from: 'S2', to: 'S6', label: 'A' },
  { id: 's2-s7', from: 'S2', to: 'S7', label: 'C' },
  { id: 's3-s1', from: 'S3', to: 'S1', label: 'G' },
  { id: 's3-s5', from: 'S3', to: 'S5', label: 'C' },
  { id: 's4-s3', from: 'S4', to: 'S3', label: 'G' },
  { id: 's4-s6', from: 'S4', to: 'S6', label: 'A' },
  { id: 's5-s1', from: 'S5', to: 'S1', label: 'G' },
  { id: 's5-s5', from: 'S5', to: 'S5', label: 'C' },
  { id: 's6-s7', from: 'S6', to: 'S7', label: 'C' },
  { id: 's7-s3', from: 'S7', to: 'S3', label: 'G' },
  { id: 's7-s8', from: 'S7', to: 'S8', label: 'T' },
];

export const WGT_DNA_ORDER: readonly WgtNodeId[] = ['S2', 'S4', 'S6', 'S7', 'S5', 'S3', 'S1', 'S8'];

export const WGT_BASE_COLOR: Record<DnaBase, string> = {
  A: 'var(--wgt-a)',
  C: 'var(--wgt-c)',
  G: 'var(--wgt-g)',
  T: 'var(--wgt-t)',
};

export const WGT_ROOT_COLOR = 'var(--wgt-root)';
export const WGT_VALID_COLOR = 'var(--wgt-valid)';
export const WGT_GRAPH_TRANSLATE = { desktop: -193, mobile: 18 } as const;

export const WGT_ORDER_BY_NODE = Object.fromEntries(
  WGT_DNA_ORDER.map((node, index) => [node, index + 1]),
) as Record<WgtNodeId, number>;

export const WGT_INCOMING_EDGES = Object.fromEntries(
  WGT_DNA_NODES.map((node) => [node, WGT_DNA_EDGES.filter((edge) => edge.to === node)]),
) as Record<WgtNodeId, WgtDnaEdge[]>;

export const WGT_OUTGOING_EDGES = Object.fromEntries(
  WGT_DNA_NODES.map((node) => [node, WGT_DNA_EDGES.filter((edge) => edge.from === node)]),
) as Record<WgtNodeId, WgtDnaEdge[]>;

export const WGT_INCOMING_BASE = Object.fromEntries(
  WGT_DNA_NODES.map((node) => [node, WGT_INCOMING_EDGES[node][0]?.label ?? null]),
) as Record<WgtNodeId, DnaBase | null>;

export const WGT_GROUPS = [
  { key: 'root', label: 'zero indegree', range: [1, 1] as const, nodes: ['S2'] as const, color: WGT_ROOT_COLOR },
  { key: 'A', label: 'incoming A', range: [2, 3] as const, nodes: ['S4', 'S6'] as const, color: WGT_BASE_COLOR.A },
  { key: 'C', label: 'incoming C', range: [4, 5] as const, nodes: ['S7', 'S5'] as const, color: WGT_BASE_COLOR.C },
  { key: 'G', label: 'incoming G', range: [6, 7] as const, nodes: ['S3', 'S1'] as const, color: WGT_BASE_COLOR.G },
  { key: 'T', label: 'incoming T', range: [8, 8] as const, nodes: ['S8'] as const, color: WGT_BASE_COLOR.T },
] as const;

export const WGT_ROUGH_RANGE = Object.fromEntries(
  WGT_GROUPS.flatMap((group) => group.nodes.map((node) => [node, group.range])),
) as Record<WgtNodeId, readonly [number, number]>;

export const WGT_ROUGH_LABEL = Object.fromEntries(
  WGT_DNA_NODES.map((node) => [node, WGT_ROUGH_RANGE[node][1]]),
) as Record<WgtNodeId, number>;

export const WGT_PREDECESSOR_NODES = Object.fromEntries(
  WGT_DNA_NODES.map((node) => [
    node,
    [...new Set(WGT_INCOMING_EDGES[node].map((edge) => edge.from))]
      .sort((left, right) => WGT_ORDER_BY_NODE[left] - WGT_ORDER_BY_NODE[right]),
  ]),
) as Record<WgtNodeId, WgtNodeId[]>;

export const WGT_PREDECESSOR_ORDERS = Object.fromEntries(
  WGT_DNA_NODES.map((node) => [
    node,
    [...new Set(WGT_INCOMING_EDGES[node].map((edge) => WGT_ROUGH_LABEL[edge.from]))]
      .sort((left, right) => left - right),
  ]),
) as Record<WgtNodeId, number[]>;

export const WGT_BASE_SUMMARY: Record<'all' | DnaBase, string> = {
  all: 'Eight nodes and thirteen DNA-labeled edges share one graph; S2 is the only zero-indegree node.',
  A: 'A enters S4 and S6, so these destinations occupy the first DNA block at positions 2–3.',
  C: 'C enters S7 and S5, placing them after the A block at positions 4–5.',
  G: 'G enters S3 and S1, placing them after C at positions 6–7.',
  T: 'T enters S8 from S7 and S1, making S8 the final DNA block at position 8.',
};

function rangeText([start, end]: readonly [number, number]) {
  return start === end ? String(start) : `${start}–${end}`;
}

function listText(values: readonly (string | number)[]) {
  return values.length ? `[${values.join(', ')}]` : '∅';
}

export function nodeInspectorText(node: WgtNodeId) {
  const incoming = WGT_INCOMING_BASE[node];
  if (!incoming) return `${node} · zero indegree · rough range 1 · final position 1`;
  return `${node} · incoming ${incoming} · predecessors ${listText(WGT_PREDECESSOR_NODES[node])} · predecessor orders ${listText(WGT_PREDECESSOR_ORDERS[node])} · rough range ${rangeText(WGT_ROUGH_RANGE[node])} · final position ${WGT_ORDER_BY_NODE[node]}`;
}

export function monotoneSummary(base: DnaBase) {
  const pairs = WGT_DNA_EDGES
    .filter((edge) => edge.label === base)
    .map((edge) => [WGT_ORDER_BY_NODE[edge.from], WGT_ORDER_BY_NODE[edge.to]] as const)
    .sort(([sourceA, destinationA], [sourceB, destinationB]) => sourceA - sourceB || destinationA - destinationB);
  return `${base} edges: sources ${pairs.map(([source]) => source).join(', ')} → destinations ${pairs.map(([, destination]) => destination).join(', ')}. Destination positions never move backward.`;
}

function validateWgtDnaExample() {
  const nodeSet = new Set(WGT_DNA_NODES);
  if (nodeSet.size !== WGT_DNA_NODES.length) throw new Error('WGT DNA example contains duplicate nodes.');
  if (new Set(WGT_DNA_ORDER).size !== nodeSet.size || WGT_DNA_ORDER.some((node) => !nodeSet.has(node))) {
    throw new Error('WGT DNA order must contain every graph node exactly once.');
  }
  for (const edge of WGT_DNA_EDGES) {
    if (!nodeSet.has(edge.from) || !nodeSet.has(edge.to) || !DNA_BASES.includes(edge.label)) {
      throw new Error(`Invalid WGT DNA edge ${edge.id}.`);
    }
  }
  const roots = WGT_DNA_NODES.filter((node) => WGT_INCOMING_EDGES[node].length === 0);
  if (roots.length !== 1 || roots[0] !== 'S2' || WGT_DNA_ORDER[0] !== 'S2') {
    throw new Error('WGT DNA example must have S2 as its only first-position root.');
  }
  for (const node of WGT_DNA_NODES) {
    const labels = new Set(WGT_INCOMING_EDGES[node].map((edge) => edge.label));
    if (labels.size > 1) throw new Error(`WGT DNA node ${node} is not input-consistent.`);
  }
  for (const left of WGT_DNA_EDGES) {
    for (const right of WGT_DNA_EDGES) {
      const labelOrder = DNA_BASES.indexOf(left.label) - DNA_BASES.indexOf(right.label);
      if (labelOrder < 0 && WGT_ORDER_BY_NODE[left.to] >= WGT_ORDER_BY_NODE[right.to]) {
        throw new Error(`WGT DNA order violates label ordering for ${left.id} and ${right.id}.`);
      }
      if (
        labelOrder === 0
        && WGT_ORDER_BY_NODE[left.from] < WGT_ORDER_BY_NODE[right.from]
        && WGT_ORDER_BY_NODE[left.to] > WGT_ORDER_BY_NODE[right.to]
      ) {
        throw new Error(`WGT DNA order violates source monotonicity for ${left.id} and ${right.id}.`);
      }
    }
  }
}

validateWgtDnaExample();
