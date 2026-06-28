// Shared pure helpers for the Wheeler-graph index visualizations (build-time + client).
// No algorithm logic lives here — these only map the faithful `tiny.json` data to CSS classes/labels.

export interface Cell {
  sym: string;
  doc: number | null;
  kind: string; // 'sep' | 'dna'
}

/** CSS class for an alphabet cell: separators are neutral; DNA bases are colored by species. */
export function cellClass(c: Cell): string {
  if (c.kind === 'sep') return 'sep';
  if (c.doc === 0) return 'sp0';
  if (c.doc === 1) return 'sp1';
  return 'dna';
}

/** CSS class for a whole row, tinted by the species it belongs to. */
export function speciesClass(doc: number | null): string {
  return doc === 0 ? 'sp0' : doc === 1 ? 'sp1' : 'dna';
}

export function speciesLabel(doc: number | null): string {
  return doc === null ? '' : `S${doc}`;
}
