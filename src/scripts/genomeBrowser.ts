/**
 * The genome browser for `/shorkie-lab/genome/`: Shorkie_LM constraint over all 12,157,105 bases of
 * sacCer3, drawn IGV-style at whatever resolution the viewport can carry.
 *
 * Layer three of the usual split -- `src/lib/genomeBrowser.ts` holds the arithmetic (level choice,
 * tile cover, coordinate maps) and is tested without a canvas; this file is DOM, fetching and
 * painting only. Every number it draws comes from a shipped tile; nothing here computes science.
 *
 * Four things about it are not obvious:
 *
 *   - **Every track is one canvas.** chrIV is 1.5 M points and the whole genome 12 M; the
 *     expression page already established that a dense per-cell view has to be canvas, at 37k
 *     nodes. There is no SVG fallback here and there should not be.
 *
 *   - **A summary bin draws its min, its mean AND its max.** A constraint track exists to show
 *     that one base is strongly determined; a 4,096 bp bin that reports only its average hides
 *     exactly that. The solid bar is the mean, the pale extension above it reaches the max, and the
 *     tick is the min. At base resolution the three coincide and it degenerates to a plain bar,
 *     which is correct rather than a special case.
 *
 *   - **A tile PNG is up to 65,536 pixels wide, which is wider than a canvas may legally be** in
 *     Safari (16,384) and Firefox (32,767). Decoding happens in 4,096-column slices through one
 *     small reusable canvas, so the decode never depends on a limit the browser is free to pick.
 *
 *   - **The cache is bounded and de-duplicated.** Panning a chromosome touches hundreds of tiles;
 *     an unbounded map grows without limit and a fast drag queues the same fetch dozens of times.
 *     Both are handled here, and the audit asserts the bound holds after a long pan.
 */

import {
  levelForBpPerPixel, tilesCovering, tileStartBp, clampView, zoomAbout,
  xOfBp as xOfBpPure, bpOfX as bpOfXPure, parseLocus, formatLocus, formatSpan, rulerTicks,
  MIN_VIEW_BP, type Level, type ChromInfo, type View,
} from '../lib/genomeBrowser';
import { drawGeneRows, type GeneTrackFeature } from './geneTrack';
import {
  LOGO_COLOURS, LOGO_GLYPHS, LOGO_GLOBSCALE, packGeneRows, type Base,
} from '../lib/shorkieModel';

const DATA = '/genome-data';

/** Decode slice width. Below every browser's maximum canvas dimension, with room to spare. */
const DECODE_CHUNK = 4096;

/**
 * Decoded tiles held at once. A summary tile is 3 x 65,536 bytes and a base tile 65,536, so this
 * bounds the cache at about 9 MB -- roughly a screenful at every level of the pyramid at once, and
 * flat no matter how far the reader pans.
 */
const MAX_TILES = 48;

/** Below this many pixels a base, letters are unreadable and the track draws bars instead. */
const LETTER_MIN_PX = 7;

/**
 * Left gutter, in CSS pixels. Responsive because it is not decoration: at 320 px a fixed 58 px
 * gutter is a fifth of the plot, and the rotated axis title it exists to hold does not fit there
 * anyway. Below the breakpoint the tick labels keep their room and the title moves into the caption.
 */
const padLeft = (w: number) => (w < 520 ? 30 : 58);
const PAD_RIGHT = 14;
const RULER_H = 22;
const MINIMAP_H = 30;
const GENE_ROW_H = 12;

/** Full height of the overview strip, in bits. See the note where it is used. */
const MINI_MAX = 0.5;

interface IndexFile {
  genome: string;
  score: string;
  icMax: number;
  levels: Level[];
  rowNames: string[];
  tileBins: number;
  window: Record<string, unknown>;
  chroms: (ChromInfo & { genes: number; meanIc: number; minIc: number; maxIc: number })[];
}

interface Tile {
  rows: number;
  cols: number;
  data: Uint8Array;
}

/** Per-pixel-column aggregate of the bins under it. */
interface Column {
  min: number;
  max: number;
  mean: number;
  have: boolean;
}

export function initGenomeBrowser(host: HTMLElement): void {
  const $ = <T extends HTMLElement = HTMLElement>(sel: string) =>
    host.querySelector(sel) as T | null;

  const trackCanvas = $<HTMLCanvasElement>('[data-gb-track]');
  const miniCanvas = $<HTMLCanvasElement>('[data-gb-mini]');
  const chromSel = $<HTMLSelectElement>('[data-gb-chrom]');
  const regionSel = $<HTMLSelectElement>('[data-gb-region]');
  const locusInput = $<HTMLInputElement>('[data-gb-locus]');
  const readout = $('[data-gb-readout]');
  const levelOut = $('[data-gb-level-out]');
  const statusOut = $('[data-gb-status]');
  const hoverOut = $('[data-gb-hover]');
  if (!trackCanvas || !miniCanvas || !chromSel || !locusInput) return;

  let index: IndexFile | null = null;
  let view: View = { chrom: 'chrI', start: 0, end: 20000 };
  let hoverBp: number | null = null;

  // -------------------------------------------------------------------------------------------
  // Tile cache: bounded, de-duplicated, and shared by every level and by the sequence.
  // -------------------------------------------------------------------------------------------
  const tiles = new Map<string, Tile>();       // insertion order IS the LRU order
  const inflight = new Map<string, Promise<Tile | null>>();
  let fetched = 0;
  let evicted = 0;

  function cacheGet(key: string): Tile | null {
    const t = tiles.get(key);
    if (!t) return null;
    // Re-inserting moves it to the end, so the oldest key is always the first one out.
    tiles.delete(key);
    tiles.set(key, t);
    return t;
  }

  function cachePut(key: string, t: Tile): void {
    tiles.set(key, t);
    while (tiles.size > MAX_TILES) {
      const oldest = tiles.keys().next().value as string | undefined;
      if (oldest === undefined) break;
      tiles.delete(oldest);
      evicted += 1;
    }
  }

  async function decodeGray(url: string): Promise<Tile | null> {
    const res = await fetch(url).catch(() => null);
    if (!res || !res.ok) return null;
    const bitmap = await createImageBitmap(await res.blob()).catch(() => null);
    if (!bitmap) return null;
    const cols = bitmap.width;
    const rows = bitmap.height;
    const out = new Uint8Array(rows * cols);
    const cv = document.createElement('canvas');
    cv.width = Math.min(cols, DECODE_CHUNK);
    cv.height = rows;
    const cx = cv.getContext('2d', { willReadFrequently: true });
    if (!cx) { bitmap.close(); return null; }
    for (let x0 = 0; x0 < cols; x0 += DECODE_CHUNK) {
      const w = Math.min(DECODE_CHUNK, cols - x0);
      cx.clearRect(0, 0, w, rows);
      cx.drawImage(bitmap, x0, 0, w, rows, 0, 0, w, rows);
      const px = cx.getImageData(0, 0, w, rows).data;
      for (let r = 0; r < rows; r += 1) {
        const base = r * cols + x0;
        for (let c = 0; c < w; c += 1) out[base + c] = px[(r * w + c) * 4];
      }
    }
    bitmap.close();
    return { rows, cols, data: out };
  }

  /**
   * A tile if it is already decoded, otherwise null -- and the fetch is started.
   *
   * Never awaited by the renderer: a browser that blocks its paint on a network round trip stutters
   * on every pan. The frame draws what it has, and the arriving tile schedules another frame.
   */
  function tile(key: string, url: string): Tile | null {
    const hit = cacheGet(key);
    if (hit) return hit;
    if (inflight.has(key)) return null;
    const p = decodeGray(url).then((t) => {
      inflight.delete(key);
      if (t) { cachePut(key, t); fetched += 1; schedule(); }
      return t;
    });
    inflight.set(key, p);
    return null;
  }

  // -------------------------------------------------------------------------------------------
  // Gene models: one fetch per chromosome, kept for the session.
  // -------------------------------------------------------------------------------------------
  const genes = new Map<string, GeneTrackFeature[]>();
  const genesInflight = new Set<string>();

  function geneModels(chrom: string): GeneTrackFeature[] | null {
    const have = genes.get(chrom);
    if (have) return have;
    if (genesInflight.has(chrom)) return null;
    genesInflight.add(chrom);
    void fetch(`${DATA}/${chrom}/genes.json`)
      .then((r) => (r.ok ? r.json() : []))
      .catch(() => [])
      .then((g: GeneTrackFeature[]) => {
        genes.set(chrom, g);
        genesInflight.delete(chrom);
        schedule();
      });
    return null;
  }

  // -------------------------------------------------------------------------------------------
  // Sampling
  // -------------------------------------------------------------------------------------------
  function chromInfo(name: string): IndexFile['chroms'][number] | null {
    return index?.chroms.find((c) => c.name === name) ?? null;
  }

  function dequant(byte: number): number {
    return (byte / 255) * (index?.icMax ?? 2);
  }

  /**
   * Aggregate the level's bins under each pixel column.
   *
   * The three rows are carried separately all the way to the pixel: a column's min is the smallest
   * of its bins' minima, not the minimum of their means. Collapsing to the mean first is what makes
   * a pyramid smooth away the spikes it exists to preserve.
   */
  function sample(lvl: Level, inner: number): Column[] {
    const info = chromInfo(view.chrom);
    const cols: Column[] = new Array(inner);
    const bpPerPx = (view.end - view.start) / inner;
    const tileBins = index?.tileBins ?? 65536;
    const nBins = info ? Math.ceil(info.length / lvl.binBp) : 0;

    // The tiles this view needs, requested once and then read column by column.
    const want = tilesCovering(view.start, view.end, lvl.binBp, tileBins);
    const loaded = new Map<number, Tile>();
    for (const t of want) {
      const key = `${view.chrom}/L${lvl.level}/${t}`;
      const got = tile(key, `${DATA}/${key}.png`);
      if (got) loaded.set(t, got);
    }

    for (let x = 0; x < inner; x += 1) {
      const bpLo = view.start + x * bpPerPx;
      const bpHi = bpLo + bpPerPx;
      const bLo = Math.floor(bpLo / lvl.binBp);
      const bHi = Math.max(bLo + 1, Math.ceil(bpHi / lvl.binBp));
      let mn = Infinity; let mx = -Infinity; let sum = 0; let n = 0;
      for (let b = bLo; b < bHi; b += 1) {
        if (b < 0 || b >= nBins) continue;
        const ti = Math.floor(b / tileBins);
        const t = loaded.get(ti);
        if (!t) continue;
        const c = b - ti * tileBins;
        if (c >= t.cols) continue;
        // Row 0 is the min at a summary level and the value itself at the base level, so the
        // three collapse onto one row there and the aggregation below needs no special case.
        const lo = t.data[c];
        const hi = t.rows === 1 ? lo : t.data[t.cols + c];
        const me = t.rows === 1 ? lo : t.data[2 * t.cols + c];
        if (lo < mn) mn = lo;
        if (hi > mx) mx = hi;
        sum += me;
        n += 1;
      }
      cols[x] = n === 0
        ? { min: 0, max: 0, mean: 0, have: false }
        : { min: dequant(mn), max: dequant(mx), mean: dequant(sum / n), have: true };
    }
    return cols;
  }

  /** The reference bases across the view, or null where the sequence tile has not arrived. */
  function sequence(): (Base | null)[] | null {
    const tileBins = index?.tileBins ?? 65536;
    const span = view.end - view.start;
    if (span > 20000) return null;                       // never needed above the letter zoom
    const out: (Base | null)[] = new Array(span).fill(null);
    const letters: Base[] = ['A', 'C', 'G', 'T'];
    let any = false;
    for (const t of tilesCovering(view.start, view.end, 1, tileBins)) {
      const key = `${view.chrom}/seq/${t}`;
      const got = tile(key, `${DATA}/${key}.png`);
      if (!got) continue;
      any = true;
      const base = tileStartBp(t, 1, tileBins);
      for (let i = 0; i < span; i += 1) {
        const c = view.start + i - base;
        if (c < 0 || c >= got.cols) continue;
        const v = got.data[c];
        out[i] = v < 4 ? letters[v] : null;
      }
    }
    return any ? out : null;
  }

  // -------------------------------------------------------------------------------------------
  // Painting
  // -------------------------------------------------------------------------------------------
  const css = (name: string, fallback: string) =>
    getComputedStyle(host).getPropertyValue(name).trim() || fallback;

  /**
   * Size a canvas to its box, in CSS pixels, so one user unit is one CSS pixel.
   *
   * NO minimum width. Flooring at 320 on a 288 px element makes the backing store wider than the
   * box, `width: 100%` scales it back down, and every horizontal coordinate on the canvas is then
   * off by that ratio -- the ruler, the constraint track and the gene models each by the same
   * amount, so nothing looks broken and every coordinate is wrong. The expression page shipped
   * exactly this and it took measuring bp 8,192 at five widths to find.
   */
  function fit(cv: HTMLCanvasElement, cssH: number): CanvasRenderingContext2D | null {
    const cssW = Math.max(1, Math.round(cv.clientWidth));
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    cv.width = Math.round(cssW * dpr);
    cv.height = Math.round(cssH * dpr);
    cv.style.height = `${cssH}px`;
    const ctx = cv.getContext('2d');
    if (!ctx) return null;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssW, cssH);
    return ctx;
  }

  const xOfBp = (bp: number, width: number) => xOfBpPure(bp, view, width, padLeft(width), PAD_RIGHT);
  const bpOfX = (x: number, width: number) => bpOfXPure(x, view, width, padLeft(width), PAD_RIGHT);

  function paintMini(): void {
    const info = chromInfo(view.chrom);
    if (!info || !index) return;
    const ctx = fit(miniCanvas!, MINIMAP_H);
    if (!ctx) return;
    const w = Math.max(1, Math.round(miniCanvas!.clientWidth));
    const inner = Math.max(1, w - padLeft(w) - PAD_RIGHT);
    const ink = css('--color-ink', '#1a1a1a');
    const muted = css('--color-muted', '#6b7280');
    const rule = css('--color-rule', '#d8d8d8');
    const accent = css('--color-accent', '#3d6ea8');

    // The coarsest level, so the whole chromosome is one tile however long it is.
    const lvl = index.levels[index.levels.length - 1];
    const nBins = Math.ceil(info.length / lvl.binBp);
    const key = `${view.chrom}/L${lvl.level}/0`;
    const t = tile(key, `${DATA}/${key}.png`);

    ctx.strokeStyle = rule;
    ctx.lineWidth = 1;
    ctx.strokeRect(padLeft(w) + 0.5, 4.5, inner - 1, MINIMAP_H - 13);

    if (t) {
      const top = 5;
      const h = MINIMAP_H - 14;
      ctx.fillStyle = muted;
      ctx.globalAlpha = 0.75;
      for (let x = 0; x < inner; x += 1) {
        const b0 = Math.floor((x / inner) * nBins);
        const b1 = Math.max(b0 + 1, Math.ceil(((x + 1) / inner) * nBins));
        let sum = 0; let n = 0;
        for (let b = b0; b < b1 && b < t.cols; b += 1) {
          sum += t.rows === 1 ? t.data[b] : t.data[2 * t.cols + b];
          n += 1;
        }
        if (!n) continue;
        // A locator strip, on its own fixed scale. The main track's 0-2 axis must never move --
        // comparability between positions is the whole point of information content -- but a
        // 4,096 bp bin mean spans 0.10 to 0.41 across the genome (p1 to p99) and on a 0-2 axis
        // that is a featureless 10% band. MINI_MAX is fixed, so chromosomes still compare with
        // each other; it is simply not the same ruler as the plot below, and is labelled as such.
        const bh = Math.min(h, (dequant(sum / n) / MINI_MAX) * h);
        if (bh > 0) ctx.fillRect(padLeft(w) + x, top + h - bh, 1, bh);
      }
      ctx.globalAlpha = 1;
    }

    // The viewport, as a filled box rather than an outline: at whole-chromosome zoom a 20 kb view
    // is under a pixel wide and an outline of it is invisible.
    const vx0 = padLeft(w) + (view.start / info.length) * inner;
    const vx1 = padLeft(w) + (view.end / info.length) * inner;
    ctx.fillStyle = accent;
    ctx.globalAlpha = 0.22;
    ctx.fillRect(vx0, 4, Math.max(2, vx1 - vx0), MINIMAP_H - 12);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = accent;
    ctx.strokeRect(vx0 - 0.5, 3.5, Math.max(2, vx1 - vx0) + 1, MINIMAP_H - 11);

    ctx.font = '10px system-ui, sans-serif';
    ctx.textAlign = 'right';
    if (padLeft(w) >= 58) {
      ctx.fillStyle = ink;
      ctx.fillText(view.chrom, padLeft(w) - 8, MINIMAP_H - 11);
    }
    ctx.fillStyle = muted;
    // The scale note is not decoration: this strip is on a DIFFERENT ruler from the plot below, and
    // saying so is the only thing standing between a reader and comparing the two by eye.
    ctx.fillText(
      w < 520 ? `0–${MINI_MAX} bits` : `${formatSpan(info.length)} · strip 0–${MINI_MAX} bits`,
      padLeft(w) + inner, MINIMAP_H - 1,
    );
  }

  function paintTrack(): void {
    const info = chromInfo(view.chrom);
    if (!info || !index) return;
    const cv = trackCanvas!;
    const w = Math.max(1, Math.round(cv.clientWidth));
    const inner = Math.max(1, w - padLeft(w) - PAD_RIGHT);
    const bpPerPx = (view.end - view.start) / inner;
    const lvl = levelForBpPerPixel(bpPerPx, index.levels);

    const feats = geneModels(view.chrom) ?? [];
    const pad = (view.end - view.start) * 0.1;
    const visible = feats.filter((f) => f.txEnd > view.start - pad && f.txStart < view.end + pad);
    // packGeneRows is what drawGeneRows itself calls, on the same input -- so the lane cannot be
    // sized for fewer rows than get drawn. A second, approximate row count here would be a
    // reimplementation free to disagree with the renderer, which is how genes get clipped.
    const geneRows = Math.max(1, Math.max(...packGeneRows(visible), 0) + 1);
    const seq = bpPerPx <= 1 / LETTER_MIN_PX ? sequence() : null;
    const seqH = seq ? 16 : 0;
    const trackH = 190;
    const geneH = geneRows * GENE_ROW_H + 12;
    const total = RULER_H + trackH + seqH + geneH;

    const ctx = fit(cv, total);
    if (!ctx) return;

    const ink = css('--color-ink', '#1a1a1a');
    const muted = css('--color-muted', '#6b7280');
    const rule = css('--color-rule', '#d8d8d8');
    const accent = css('--color-accent', '#3d6ea8');

    // ---- ruler -----------------------------------------------------------------------------
    ctx.font = '10px system-ui, sans-serif';
    ctx.fillStyle = muted;
    ctx.strokeStyle = rule;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(padLeft(w), RULER_H - 0.5);
    ctx.lineTo(padLeft(w) + inner, RULER_H - 0.5);
    ctx.stroke();
    const ticks = rulerTicks(view, Math.max(3, Math.round(inner / 130)));
    ticks.forEach((bp, i) => {
      const x = xOfBp(bp, w);
      ctx.beginPath();
      ctx.moveTo(x + 0.5, RULER_H - 5);
      ctx.lineTo(x + 0.5, RULER_H - 1);
      ctx.stroke();
      // A label centred on the axis end is clipped mid-number, which reads as a different
      // coordinate rather than a truncated one -- the same trap the zoomed logo hit.
      ctx.textAlign = i === 0 && x < padLeft(w) + 24 ? 'left'
        : i === ticks.length - 1 && x > padLeft(w) + inner - 24 ? 'right' : 'center';
      ctx.fillText(rulerLabel(bp, view.end - view.start), x, RULER_H - 8);
    });

    // ---- constraint ------------------------------------------------------------------------
    const top = RULER_H + 6;
    const h = trackH - 22;
    const icMax = index.icMax || 2;
    const yOf = (v: number) => top + h - (Math.max(0, Math.min(icMax, v)) / icMax) * h;

    ctx.strokeStyle = rule;
    ctx.setLineDash([2, 3]);
    for (const g of [0.5, 1.0, 1.5]) {
      ctx.beginPath();
      ctx.moveTo(padLeft(w), Math.round(yOf(g)) + 0.5);
      ctx.lineTo(padLeft(w) + inner, Math.round(yOf(g)) + 0.5);
      ctx.stroke();
    }
    ctx.setLineDash([]);
    ctx.fillStyle = muted;
    ctx.textAlign = 'right';
    for (const g of [0, 0.5, 1.0, 1.5, 2.0]) ctx.fillText(g.toFixed(1), padLeft(w) - 6, yOf(g) + 3);
    if (padLeft(w) >= 58) {
      ctx.save();
      ctx.translate(13, top + h / 2);
      ctx.rotate(-Math.PI / 2);
      ctx.textAlign = 'center';
      ctx.fillText('information content (bits)', 0, 0);
      ctx.restore();
    }

    const cols = sample(lvl, inner);
    let drawn = 0;
    if (seq) {
      // Letter view: one glyph a base, HEIGHT set by its information content.
      //
      // The glyphs are the paper's DejaVu Sans Bold outlines, drawn through the same transform as
      // the two SVG logos on this site -- one em tall, per-letter offsets already baked in,
      // translate to the column centre and the baseline, then `scale(colW * 1.35, -sy)`. Doing it
      // with `fillText` and a scaled font size instead is not a logo twice over: font-size scales
      // width with height, and a monospace T stretched 13:1 (8 px wide, 110 px tall) renders as a
      // lollipop because its stem is a hairline. DejaVu Bold's is not, which is why the paper uses
      // it. LOGO_GLOBSCALE is on both axes, so letters overflow their column and touch -- that
      // density IS the published look.
      //
      // Mean information content is around 0.19 bits of 2, so most letters are genuinely short.
      // That is the model, not the drawing.
      const bw = inner / (view.end - view.start);
      for (let i = 0; i < seq.length; i += 1) {
        const b = seq[i];
        const col = cols[Math.min(cols.length - 1, Math.floor(i * bw))];
        if (!b || !col?.have) continue;
        const sy = (Math.max(0, Math.min(icMax, col.mean)) / icMax) * h * LOGO_GLOBSCALE;
        if (sy < 0.12) continue;                     // below a pixel at this scale
        ctx.save();
        ctx.translate(xOfBp(view.start + i + 0.5, w), top + h);
        ctx.scale(bw * LOGO_GLOBSCALE, -sy);
        ctx.fillStyle = LOGO_COLOURS[b];
        ctx.fill(new Path2D(LOGO_GLYPHS[b]));
        ctx.restore();
        drawn += 1;
      }
    } else {
      for (let x = 0; x < inner; x += 1) {
        const c = cols[x];
        if (!c.have) continue;
        drawn += 1;
        const yMean = yOf(c.mean);
        const yMax = yOf(c.max);
        const yMin = yOf(c.min);
        ctx.globalAlpha = 0.9;
        ctx.fillStyle = accent;
        ctx.fillRect(padLeft(w) + x, yMean, 1, top + h - yMean);
        // The maximum is a MARK, not a filled extension. Filling from the mean up to the max is
        // the BigWig convention and it inverts the reading here: a 512 bp bin almost always
        // contains one near-determined base, so max is ~2.0 nearly everywhere and the fill
        // blankets 90% of the plot -- a picture of a uniformly constrained genome whose mean is
        // 0.19 bits. As a mark it says the same thing (the top of the range is saturated at this
        // bin size) without painting over the profile that carries the signal.
        if (yMax < yMean - 1) {
          ctx.globalAlpha = 0.42;
          ctx.fillRect(padLeft(w) + x, yMax, 1, 1.5);
        }
        if (yMin > yMean + 1.5) {
          ctx.globalAlpha = 0.5;
          ctx.fillStyle = ink;
          ctx.fillRect(padLeft(w) + x, yMin, 1, 1);
        }
      }
      ctx.globalAlpha = 1;
    }

    ctx.strokeStyle = rule;
    ctx.beginPath();
    ctx.moveTo(padLeft(w), top + h + 0.5);
    ctx.lineTo(padLeft(w) + inner, top + h + 0.5);
    ctx.stroke();

    // ---- sequence strip --------------------------------------------------------------------
    let y = top + h + 8;
    if (seq) {
      ctx.textAlign = 'center';
      ctx.font = '10px ui-monospace, monospace';
      for (let i = 0; i < seq.length; i += 1) {
        const b = seq[i];
        if (!b) continue;
        ctx.fillStyle = LOGO_COLOURS[b];
        ctx.fillText(b, xOfBp(view.start + i + 0.5, w), y + 10);
      }
      y += seqH;
    }

    // ---- genes -----------------------------------------------------------------------------
    const tally = drawGeneRows(ctx, {
      features: visible,
      ownId: '',
      ownLabel: '',
      width: w,
      top: y + 4,
      rowH: GENE_ROW_H,
      expanded: true,
      xOfBp,
      colours: { orf: ink, muted, bg: css('--color-surface', '#fff') },
      // Labels appear as zoom makes room for them; at chromosome scale nothing is wide enough.
      labelMinPx: 26,
    });
    ctx.textAlign = 'right';
    ctx.fillStyle = muted;
    ctx.font = '10px system-ui, sans-serif';
    ctx.fillText('genes', padLeft(w) - 6, y + 4 + GENE_ROW_H / 2 + 3);

    // Hover crosshair, drawn last so nothing paints over it.
    if (hoverBp !== null && hoverBp >= view.start && hoverBp <= view.end) {
      const hx = xOfBp(hoverBp, w);
      ctx.strokeStyle = accent;
      ctx.globalAlpha = 0.5;
      ctx.beginPath();
      ctx.moveTo(hx + 0.5, RULER_H);
      ctx.lineTo(hx + 0.5, top + h);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    cv.dataset.gbLevel = String(lvl.binBp);
    cv.dataset.gbDrawn = String(drawn);
    cv.dataset.gbGeneTrack = JSON.stringify(tally);
    cv.dataset.gbTiles = String(tiles.size);
    cv.dataset.gbMode = seq ? 'letters' : 'bars';

    if (levelOut) {
      levelOut.textContent = lvl.binBp === 1
        ? `${seq ? 'per base, letters' : 'per base'}`
        : `${lvl.binBp.toLocaleString()} bp bins · min/mean/max`;
    }
    if (readout) readout.textContent = `${formatLocus(view)} · ${formatSpan(view.end - view.start)}`;
    if (statusOut) {
      const missing = cols.filter((c) => !c.have).length;
      statusOut.textContent = missing > 0
        ? `loading ${missing} of ${inner} columns…`
        : `${tiles.size} tiles cached · ${fetched} fetched · ${evicted} evicted`;
    }
  }

  function rulerLabel(bp: number, span: number): string {
    if (span > 200_000) return `${(bp / 1e6).toFixed(2)} Mb`;
    if (span > 2_000) return `${(bp / 1e3).toFixed(1)} kb`;
    return bp.toLocaleString('en-US');
  }

  // -------------------------------------------------------------------------------------------
  // Frame scheduling: paint at most once a frame however many tiles land at once.
  // -------------------------------------------------------------------------------------------
  let queued = false;
  function schedule(): void {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      paintMini();
      paintTrack();
    });
  }

  // -------------------------------------------------------------------------------------------
  // Navigation
  // -------------------------------------------------------------------------------------------
  function setView(next: View, pushHash = true): void {
    const info = chromInfo(next.chrom);
    if (!info) return;
    const v = clampView(next.start, next.end, info.length);
    view = { chrom: next.chrom, ...v };
    if (chromSel && chromSel.value !== view.chrom) chromSel.value = view.chrom;
    if (locusInput && document.activeElement !== locusInput) locusInput.value = formatLocus(view);
    host.dataset.gbView = formatLocus(view);
    if (pushHash) {
      const hash = `#${formatLocus(view).replace(/,/g, '')}`;
      if (window.location.hash !== hash) {
        window.history.replaceState(null, '', `${window.location.pathname}${hash}`);
      }
    }
    schedule();
  }

  function zoom(factor: number, anchorBp?: number): void {
    const info = chromInfo(view.chrom);
    if (!info) return;
    const anchor = anchorBp ?? (view.start + view.end) / 2;
    setView({ chrom: view.chrom, ...zoomAbout(view.start, view.end, factor, anchor, info.length) });
  }

  // Drag to pan the main track.
  let dragging = false;
  let dragX = 0;
  let dragStart = 0;
  trackCanvas.addEventListener('pointerdown', (e) => {
    dragging = true;
    dragX = e.clientX;
    dragStart = view.start;
    trackCanvas.setPointerCapture(e.pointerId);
    trackCanvas.style.cursor = 'grabbing';
  });
  trackCanvas.addEventListener('pointermove', (e) => {
    const w = Math.max(1, Math.round(trackCanvas.clientWidth));
    const rect = trackCanvas.getBoundingClientRect();
    if (dragging) {
      const inner = Math.max(1, w - padLeft(w) - PAD_RIGHT);
      const bpPerPx = (view.end - view.start) / inner;
      const shift = (dragX - e.clientX) * bpPerPx;
      const width = view.end - view.start;
      setView({ chrom: view.chrom, start: dragStart + shift, end: dragStart + shift + width });
      return;
    }
    const bp = bpOfX(e.clientX - rect.left, w);
    hoverBp = bp >= view.start && bp <= view.end ? bp : null;
    if (hoverOut) {
      if (hoverBp === null) hoverOut.textContent = '';
      else {
        // At 100 kb there are 74 genes across the width and none of them has room for a name, so
        // the names live here instead of being painted over each other.
        const under = (genes.get(view.chrom) ?? [])
          .filter((f) => hoverBp! >= f.txStart && hoverBp! <= f.txEnd)
          .map((f) => `${f.name}${f.strand === '-' ? ' −' : ' +'}`);
        hoverOut.textContent = `${view.chrom}:${Math.round(hoverBp + 1).toLocaleString('en-US')}`
          + (under.length ? ` · ${under.join(', ')}` : '');
      }
    }
    schedule();
  });
  const endDrag = (e: PointerEvent) => {
    if (!dragging) return;
    dragging = false;
    trackCanvas.style.cursor = 'grab';
    try { trackCanvas.releasePointerCapture(e.pointerId); } catch { /* already released */ }
  };
  trackCanvas.addEventListener('pointerup', endDrag);
  trackCanvas.addEventListener('pointercancel', endDrag);
  trackCanvas.addEventListener('pointerleave', () => {
    hoverBp = null;
    if (hoverOut) hoverOut.textContent = '';
    schedule();
  });

  // Wheel zooms about the cursor; a plain scroll still scrolls the page unless the pointer is over
  // the track, which is the convention every genome browser uses.
  trackCanvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    const rect = trackCanvas.getBoundingClientRect();
    const w = Math.max(1, Math.round(trackCanvas.clientWidth));
    zoom(e.deltaY > 0 ? 1.25 : 0.8, bpOfX(e.clientX - rect.left, w));
  }, { passive: false });

  // The minimap is a jump target: click anywhere on a chromosome to centre the view there.
  const miniJump = (clientX: number) => {
    const info = chromInfo(view.chrom);
    if (!info) return;
    const rect = miniCanvas.getBoundingClientRect();
    const mw = Math.max(1, Math.round(miniCanvas.clientWidth));
    const inner = Math.max(1, mw - padLeft(mw) - PAD_RIGHT);
    const frac = (clientX - rect.left - padLeft(mw)) / inner;
    const centre = Math.max(0, Math.min(1, frac)) * info.length;
    const half = (view.end - view.start) / 2;
    setView({ chrom: view.chrom, start: centre - half, end: centre + half });
  };
  let miniDown = false;
  miniCanvas.addEventListener('pointerdown', (e) => {
    miniDown = true;
    miniCanvas.setPointerCapture(e.pointerId);
    miniJump(e.clientX);
  });
  miniCanvas.addEventListener('pointermove', (e) => { if (miniDown) miniJump(e.clientX); });
  const endMini = (e: PointerEvent) => {
    miniDown = false;
    try { miniCanvas.releasePointerCapture(e.pointerId); } catch { /* already released */ }
  };
  miniCanvas.addEventListener('pointerup', endMini);
  miniCanvas.addEventListener('pointercancel', endMini);

  host.querySelectorAll<HTMLButtonElement>('[data-gb-zoom]').forEach((b) => {
    b.addEventListener('click', () => zoom(Number(b.dataset.gbZoom)));
  });
  host.querySelectorAll<HTMLButtonElement>('[data-gb-pan]').forEach((b) => {
    b.addEventListener('click', () => {
      const width = view.end - view.start;
      const d = Number(b.dataset.gbPan) * width * 0.4;
      setView({ chrom: view.chrom, start: view.start + d, end: view.end + d });
    });
  });
  const whole = $<HTMLButtonElement>('[data-gb-whole]');
  whole?.addEventListener('click', () => {
    const info = chromInfo(view.chrom);
    if (info) setView({ chrom: view.chrom, start: 0, end: info.length });
  });

  chromSel.addEventListener('change', () => {
    const info = chromInfo(chromSel.value);
    if (info) setView({ chrom: chromSel.value, start: 0, end: info.length });
  });

  regionSel?.addEventListener('change', () => {
    const v = parseLocus(regionSel.value, index?.chroms ?? []);
    if (v) setView(v);
    regionSel.selectedIndex = 0;
  });

  const go = () => {
    const v = parseLocus(locusInput.value, index?.chroms ?? []);
    if (!v) {
      locusInput.setAttribute('aria-invalid', 'true');
      return;
    }
    locusInput.removeAttribute('aria-invalid');
    setView(v);
  };
  locusInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });
  $<HTMLButtonElement>('[data-gb-go]')?.addEventListener('click', go);

  host.addEventListener('keydown', (e) => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
    const width = view.end - view.start;
    if (e.key === 'ArrowLeft') setView({ chrom: view.chrom, start: view.start - width * 0.2, end: view.end - width * 0.2 });
    else if (e.key === 'ArrowRight') setView({ chrom: view.chrom, start: view.start + width * 0.2, end: view.end + width * 0.2 });
    else if (e.key === '+' || e.key === '=') zoom(0.5);
    else if (e.key === '-') zoom(2);
    else return;
    e.preventDefault();
  });

  // -------------------------------------------------------------------------------------------
  // Repaints that are not navigation
  // -------------------------------------------------------------------------------------------
  /**
   * Document- and window-level listeners, removed once this controller's host leaves the DOM.
   *
   * This page is `bare`, so the host is destroyed on every navigation away and rebuilt on the way
   * back -- which means `mount` runs again and `initGenomeBrowser` installs a SECOND set of these.
   * The `dataset` guard only stops a double-bind on the *same* element; it cannot see the previous
   * controller, whose listeners keep firing into a closure holding a detached canvas. Checking
   * `isConnected` at fire time is self-cleaning and needs no lifecycle hook -- there is nothing to
   * unregister from `astro:page-load`, which is the trap the persisted-element scripts document.
   */
  const selfRemoving = (target: EventTarget, type: string, fn: () => void) => {
    const wrapped = () => {
      if (!host.isConnected) { target.removeEventListener(type, wrapped); return; }
      fn();
    };
    target.addEventListener(type, wrapped);
  };

  // Reading CSS custom properties means the canvas keeps the old palette across a theme change;
  // every other canvas on this site listens for exactly this.
  selfRemoving(document, 'khc:theme-change', () => schedule());

  // Guarded on width: a height change cannot move the horizontal axis, and resizing on every
  // scroll-driven viewport-height change on mobile is a repaint for nothing.
  let lastW = 0;
  let resizeTimer = 0;
  selfRemoving(window, 'resize', () => {
    const w = trackCanvas.clientWidth;
    if (w === lastW) return;
    lastW = w;
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(schedule, 90);
  });

  selfRemoving(window, 'hashchange', () => {
    const v = parseLocus(decodeURIComponent(window.location.hash.slice(1)), index?.chroms ?? []);
    if (v) setView(v, false);
  });

  // -------------------------------------------------------------------------------------------
  // Boot
  // -------------------------------------------------------------------------------------------
  void (async () => {
    const res = await fetch(`${DATA}/index.json`).catch(() => null);
    if (!res || !res.ok) {
      if (statusOut) statusOut.textContent = 'genome data unavailable';
      return;
    }
    index = (await res.json()) as IndexFile;
    index.chroms.sort((a, b) => b.length - a.length);

    chromSel.replaceChildren();
    for (const c of index.chroms) {
      const o = document.createElement('option');
      o.value = c.name;
      o.textContent = `${c.name} · ${formatSpan(c.length)} · ${c.genes} genes`;
      chromSel.appendChild(o);
    }

    const fromHash = parseLocus(decodeURIComponent(window.location.hash.slice(1)), index.chroms);
    const start = fromHash
      ?? parseLocus(host.dataset.gbDefault || 'chrVII:874,000-877,000', index.chroms)
      ?? { chrom: index.chroms[0].name, start: 0, end: Math.min(20000, index.chroms[0].length) };
    lastW = trackCanvas.clientWidth;
    setView(start, !fromHash);
    host.dataset.gbReady = '1';
  })();

  // Kept so the export surface documents what the page guarantees rather than leaving it implicit.
  host.dataset.gbMinView = String(MIN_VIEW_BP);
}

function mount(): void {
  document.querySelectorAll<HTMLElement>('[data-genome-browser]').forEach((host) => {
    if (host.dataset.gbBound === '1') return;
    host.dataset.gbBound = '1';
    initGenomeBrowser(host);
  });
}

// ClientRouter is active, so the module is evaluated once and a controller that bound only at
// module scope is dead after one navigation; the dataset flag keeps the persisted case a no-op.
document.addEventListener('astro:page-load', mount);
if (document.readyState !== 'loading') mount();
else document.addEventListener('DOMContentLoaded', mount);
