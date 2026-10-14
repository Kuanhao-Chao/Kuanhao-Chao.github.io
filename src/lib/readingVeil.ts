/**
 * How much background art may show through running text. Homepage cards use the complement
 * of the same `--art-through` token; ordinary pages use the fainter `--content-art-through`.
 * Pure policy: the DOM walk and union-first mask live in src/scripts/background.ts.
 */
export const VEIL_DEFAULT = 0.18;
export const CONTENT_VEIL_DEFAULT = 0.1;
/** Past this the art competes with the words, which is the opposite of a veil. */
export const VEIL_MAX = 0.6;

/** `soft` lets the art through at the veil strength; `solid` clears it completely, as before. */
export type VeilKind = 'soft' | 'solid';

/** Running text. Nested boxes (a `p` in an `li` in an `a`) are normal here; see `paintMask`. */
export const SOFT_SELECTOR = [
  'main h1',
  'main h2',
  'main h3',
  'main h4',
  'main h5',
  'main h6',
  'main a',
  'main label',
  'main p',
  'main li',
  'main dt',
  'main dd',
  'main blockquote',
  'main summary',
].join(', ');

/** Things that must stay legible or intact whatever is behind them: no art through these. */
export const SOLID_SELECTOR = [
  'main pre',
  'main code',
  'main figure',
  'main svg',
  'main .katex',
  'main table',
  'main button',
  'main input',
  'main select',
  'main textarea',
  'main img',
  'main canvas',
  'main iframe',
  'main video',
  'main audio',
  'main [data-terminal]',
  'main [data-cell-protected]',
  'main [data-background-protected]',
  'header.site-header',
  'footer',
].join(', ');

/**
 * Read the caller's page-specific token. Unreadable tokens use the corresponding quiet default;
 * an explicit zero still restores a fully cleared reading area.
 */
export function readVeil(raw: string | null | undefined, home: boolean): number {
  const value = Number.parseFloat(String(raw ?? '').trim());
  if (!Number.isFinite(value)) return home ? VEIL_DEFAULT : CONTENT_VEIL_DEFAULT;
  return Math.max(0, Math.min(VEIL_MAX, value));
}

/** Opacity of the layer that erases art from the soft boxes: 1 - veil of the art survives. */
export function softEraseAlpha(veil: number): number {
  return 1 - Math.max(0, Math.min(VEIL_MAX, veil));
}
