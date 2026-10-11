import type { LessonFrame, LessonNode } from '../algorithmLessonTypes';

export const numberText = (n: number) =>
  n === -Infinity ? '−∞' : n === Infinity ? '∞' : Number.isInteger(n) ? String(n) : n.toFixed(3);
export const frame = (
  phase: string,
  title: string,
  explanation: string,
  line: number,
  active: string[] = [],
  metrics: LessonFrame['metrics'] = []
): LessonFrame => ({ phase, title, explanation, line, active, metrics });

export function graphPositions(
  ids: string[],
  edges: { from: string; to: string }[]
): Map<string, { x: number; y: number }> {
  const roots = ids.filter((id) => !edges.some((edge) => edge.to === id));
  const positions = new Map<string, { x: number; y: number }>();
  const hasLoops = edges.some((edge) => edge.from === edge.to);
  if (!roots.length && ids.length > 12) {
    ids.forEach((id, index) =>
      positions.set(id, {
        x: 80 + (index % 4) * 200,
        y: 85 + Math.floor(index / 4) * (hasLoops ? 140 : 85),
      })
    );
    return positions;
  }
  if (!roots.length) {
    ids.forEach((id, index) => {
      const angle = (index / Math.max(1, ids.length)) * Math.PI * 2 - Math.PI / 2;
      positions.set(id, { x: 380 + 280 * Math.cos(angle), y: 210 + 125 * Math.sin(angle) });
    });
    return positions;
  }
  const levels = new Map<string, number>();
  const queue = roots.map((id) => ({ id, level: 0 }));
  for (let i = 0; i < queue.length; i++) {
    const item = queue[i];
    if (levels.has(item.id)) continue;
    levels.set(item.id, item.level);
    for (const edge of edges.filter((e) => e.from === item.id))
      if (!levels.has(edge.to)) queue.push({ id: edge.to, level: item.level + 1 });
  }
  for (const id of ids) if (!levels.has(id)) levels.set(id, 0);
  const max = Math.max(1, ...levels.values());
  // Preserve native spacing for supported long paths; the renderer expands
  // the locally scrollable SVG rather than shrinking its nodes and labels.
  const width = Math.max(630, max * 110);
  for (let level = 0; level <= max; level++) {
    const column = ids.filter((id) => levels.get(id) === level);
    column.forEach((id, index) =>
      positions.set(id, {
        x: 65 + (level / max) * width,
        y:
          column.length > 3
            ? 85 + index * (hasLoops ? 140 : 80)
            : 40 + ((index + 1) / (column.length + 1)) * 280,
      })
    );
  }
  return positions;
}

/** Keep reciprocal directions and labels distinct, with circle-boundary arrows. */
export function graphConnection(
  from: Pick<LessonNode, 'id' | 'x' | 'y'>,
  to: Pick<LessonNode, 'id' | 'x' | 'y'>,
  reciprocal: boolean
): { path: string; labelX: number; labelY: number } {
  if (from.id === to.id)
    return {
      path: `M ${from.x - 15} ${from.y - 18} C ${from.x - 65} ${from.y - 80},${from.x + 65} ${from.y - 80},${from.x + 15} ${from.y - 18}`,
      labelX: from.x,
      labelY: from.y - 70,
    };
  const length = Math.hypot(to.x - from.x, to.y - from.y) || 1;
  const ux = (to.x - from.x) / length,
    uy = (to.y - from.y) / length;
  const nx = -uy,
    ny = ux;
  const startX = from.x + 27 * ux,
    startY = from.y + 27 * uy;
  const endX = to.x - 30 * ux,
    endY = to.y - 30 * uy;
  // Reversing an edge reverses the normal, routing its counterpart to the other
  // side. A quadratic's midpoint is half the control-point displacement.
  const bend = reciprocal ? 45 : 12;
  const controlX = (from.x + to.x) / 2 + nx * bend;
  const controlY = (from.y + to.y) / 2 + ny * bend;
  return {
    path: `M ${startX} ${startY} Q ${controlX} ${controlY} ${endX} ${endY}`,
    labelX: (startX + endX) / 4 + controlX / 2 + nx * 9,
    labelY: (startY + endY) / 4 + controlY / 2 + ny * 9 + 4,
  };
}
