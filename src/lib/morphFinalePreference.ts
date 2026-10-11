import type { FinaleVariant } from './morphFinale';

export const FINALE_KEY = 'khc-morph-finale-v1';
export const resolveFinale = (raw: string | null): FinaleVariant =>
  raw === 'attention' ? 'attention' : 'motif';
/** 0 = motif, 1 = attention; independent of story position and background motion. */
export function finaleBlend(from: number, to: number, seconds: number): number {
  const t = Math.max(0, Math.min(1, Number.isFinite(seconds) ? seconds / 0.75 : 0));
  const ease = t * t * t * (t * (t * 6 - 15) + 10);
  return from + (to - from) * ease;
}
