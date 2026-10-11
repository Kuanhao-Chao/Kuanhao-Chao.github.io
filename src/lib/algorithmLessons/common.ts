import type { LessonFrame } from '../algorithmLessonTypes';

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
  if (!roots.length && ids.length > 12) {
    ids.forEach((id, index) =>
      positions.set(id, { x: 80 + (index % 4) * 200, y: 70 + Math.floor(index / 4) * 85 })
    );
    return positions;
  }
  if (!roots.length) {
    ids.forEach((id, index) => {
      const angle = (index / Math.max(1, ids.length)) * Math.PI * 2 - Math.PI / 2;
      positions.set(id, { x: 380 + 280 * Math.cos(angle), y: 180 + 125 * Math.sin(angle) });
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
  for (let level = 0; level <= max; level++) {
    const column = ids.filter((id) => levels.get(id) === level);
    column.forEach((id, index) =>
      positions.set(id, {
        x: 65 + (level / max) * 630,
        y: column.length > 3 ? 70 + index * 80 : 40 + ((index + 1) / (column.length + 1)) * 280,
      })
    );
  }
  return positions;
}
