/**
 * The homepage reading veil: how much of the background art may show through text and through
 * the translucent cards. ONE number, `--art-through` in src/styles/tokens.css. The text mask
 * reads it here, and the cards fill with its complement (`--veil-fill`), so the two layers cannot
 * disagree about how faint the art is. Pure: the DOM walk lives in src/scripts/background.ts.
 */
export const VEIL_DEFAULT = 0.3;
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
  'main table',
  'main button',
  'main input',
  'main select',
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
 * The veil for this page. Only the homepage has one: every other page keeps the fully cleared
 * reading area, because long-form text is read there for minutes rather than glanced at.
 * An unreadable token falls back to the default rather than to 0, so a stylesheet that failed to
 * load cannot silently switch the veil off.
 */
export function readVeil(raw: string | null | undefined, home: boolean): number {
  if (!home) return 0;
  const value = Number.parseFloat(String(raw ?? '').trim());
  if (!Number.isFinite(value)) return VEIL_DEFAULT;
  return Math.max(0, Math.min(VEIL_MAX, value));
}

/** Opacity of the layer that erases art from the soft boxes: 1 - veil of the art survives. */
export function softEraseAlpha(veil: number): number {
  return 1 - Math.max(0, Math.min(VEIL_MAX, veil));
}
