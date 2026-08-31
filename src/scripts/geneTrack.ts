/**
 * Gene models on a canvas, shared by the expression page and the language-model page.
 *
 * This exists because the two pages drew genes differently and one of them was wrong. The LM page
 * drew each feature as a single `fillRect(txStart -> txEnd)`, which paints a solid bar over every
 * intron the expression page draws as a gap -- the same defect the expression page's annotation
 * lane had before it was moved onto this renderer. Seven of the fourteen shipped windows contain an
 * intron, so on those windows the two pages were making contradictory claims about the same
 * coordinates.
 *
 * Everything positional goes through the caller's `xOfBp`, so a page that gets its axis right gets
 * its gene track right for free, and neither page can disagree with the other about where an intron
 * is. The tally is counted INSIDE the loop that fills the rectangles rather than taken from the
 * decomposition, so a gate reads what was actually drawn: a canvas has no elements to inspect, and
 * an intron painted as an exon is invisible to every other check on the page.
 */

import { geneTrackShapes, packGeneRows } from '../lib/shorkieModel';

export interface GeneTrackFeature {
  name: string;
  strand: string;
  txStart: number;
  txEnd: number;
  cdsStart: number;
  cdsEnd: number;
  exons: number[][];
}

export interface GeneTrackOptions {
  features: GeneTrackFeature[];
  /** The window's own gene: drawn at full opacity and labelled. */
  ownId: string;
  /** Label for the own gene -- the readable name, not the systematic id. */
  ownLabel: string;
  width: number;
  top: number;
  rowH?: number;
  /** First-fit row packing. Collapsed puts every gene on one row, as the compact rulers want. */
  expanded?: boolean;
  xOfBp: (bp: number, width: number) => number;
  colours: { orf: string; muted: string };
  /**
   * A second gene to emphasise -- the selected region on the LM page. Distinct from `ownId`, which
   * is a property of the window; this is a property of the selection and moves with it.
   */
  highlight?: string | null;
}

export interface GeneTrackTally {
  features: number;
  blocks: number;
  introns: number;
  rows: number;
  mode: 'expanded' | 'collapsed';
}

/**
 * Draw the gene models and return what was drawn.
 *
 * The caller publishes the tally on the canvas' dataset; both pages use the same key shape so one
 * audit assertion covers both.
 */
export function drawGeneRows(
  ctx: CanvasRenderingContext2D,
  opts: GeneTrackOptions,
): GeneTrackTally {
  const {
    features, ownId, ownLabel, width, top, rowH = 11, expanded = true,
    xOfBp, colours, highlight = null,
  } = opts;

  const rows = expanded ? packGeneRows(features) : features.map(() => 0);
  const nRows = Math.max(...rows, 0) + 1;
  let blocks = 0;
  let introns = 0;

  features.forEach((f, i) => {
    const own = f.name === ownId;
    const picked = highlight !== null && f.name === highlight;
    const mid = top + rows[i] * rowH + rowH / 2;
    const x0 = xOfBp(f.txStart, width);
    const x1 = xOfBp(f.txEnd, width);

    // A selected gene reads at full strength even when it is not the window's own gene, or the
    // selection would be invisible on the thirteen windows whose interesting gene is a neighbour.
    ctx.globalAlpha = own || picked ? 0.95 : 0.45;
    ctx.strokeStyle = colours.orf;
    ctx.lineWidth = picked ? 1.6 : 1;
    ctx.beginPath();
    ctx.moveTo(x0, mid + 0.5);
    ctx.lineTo(x1, mid + 0.5);
    ctx.stroke();

    const fwd = f.strand === '+';
    for (let x = x0 + 7; x < x1 - 3; x += 13) {
      ctx.beginPath();
      ctx.moveTo(x - (fwd ? 2 : -2), mid - 2.4);
      ctx.lineTo(x + (fwd ? 2 : -2), mid);
      ctx.lineTo(x - (fwd ? 2 : -2), mid + 2.4);
      ctx.stroke();
    }

    ctx.fillStyle = colours.orf;
    for (const piece of geneTrackShapes(f)) {
      if (piece.kind === 'intron') {
        introns += 1;                              // drawn as the line + chevrons above
        continue;
      }
      blocks += 1;
      const bh = piece.kind === 'cds' ? Math.max(rowH * 0.72, 5) : Math.max(rowH * 0.38, 3);
      const bx = xOfBp(piece.start, width);
      ctx.fillRect(bx, mid - bh / 2, Math.max(xOfBp(piece.end, width) - bx, 1), bh);
    }

    if (own || picked) {
      ctx.globalAlpha = 1;
      ctx.fillStyle = colours.muted;
      ctx.font = '9px system-ui, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(own ? ownLabel : f.name, x1 + 4, mid + 3);
    }
  });

  ctx.globalAlpha = 1;
  ctx.lineWidth = 1;
  return {
    features: features.length,
    blocks,
    introns,
    rows: nRows,
    mode: expanded ? 'expanded' : 'collapsed',
  };
}
