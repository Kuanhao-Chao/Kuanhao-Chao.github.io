/**
 * The genome browser for `/shorkie-lab/genome/`: Shorkie_LM constraint over all 12,157,105 bases of
 * sacCer3, laid against phastCons conservation and the curated annotation, drawn IGV-style at
 * whatever resolution the viewport can carry.
 *
 * Layer three of the usual split -- `src/lib/genomeBrowser.ts` holds the arithmetic (level choice,
 * tile cover, lane layout, brushing, search, history) and is tested without a canvas; this file is
 * DOM, fetching and painting only. Every number it draws comes from a shipped tile; nothing here
 * computes science.
 *
 * Things about it that are not obvious:
 *
 *   - **Every lane comes from `laneLayout`.** The first version hardcoded ruler -> track ->
 *     sequence -> genes with literal offsets computed in three separate places, and adding a
 *     fourth lane meant editing all three. Now the canvas height, the drawing offsets and the
 *     hit-testing all read one pure function, so they cannot disagree about where a lane is.
 *
 *   - **The two model passes share an axis; phastCons does not.** masked and unmasked are both
 *     information content in bits on 0-2 and are meant to be read against each other. phastCons is
 *     a 0-1 posterior. Putting it on the same axis would invite reading 0.9 posterior as 0.9 bits,
 *     so every score lane draws its own axis and prints its own units.
 *
 *   - **A summary bin draws its min, its mean AND its max**, and byte 0 means NO DATA rather than
 *     zero. phastCons has no value for 0.65% of the genome; drawn as zero that reads as
 *     "completely unconserved" exactly where the truth is "not aligned".
 *
 *   - **A tile PNG is up to 65,536 pixels wide, which is wider than a canvas may legally be** in
 *     Safari (16,384) and Firefox (32,767). Decoding happens in 4,096-column slices through one
 *     small reusable canvas.
 *
 *   - **Drag pans; drag on the RULER selects.** IGV's convention, and it avoids a mode toggle.
 *     Shift-drag anywhere also selects, for anyone who does not know that.
 *
 *   - **The cache is bounded, de-duplicated, and its bound scales with the number of enabled score
 *     tracks.** A constant that was right for one pyramid thrashes with three.
 */

import {
  levelForBpPerPixel, tilesCovering, tileStartBp, clampView, zoomAbout,
  levelsForTrack, axisFraction, axisValue, isSignedAxis, pearson, exportRows, laneExcluder,
  xOfBp as xOfBpPure, bpOfX as bpOfXPure, formatLocus, formatSpan, rulerTicks,
  laneLayout, laneAt, brushRegion, featureDensity, searchLocus, chromOrder,
  shouldDrawLetters, pinchZoom, pointDistance, pointMidpoint,
  emptyHistory, historyPush, historyBack, historyForward, canGoBack, canGoForward,
  encodeViewState, decodeViewState,
  MIN_VIEW_BP, type Level, type ChromInfo, type View, type LaneSpec, type Lane,
  type SearchIndex, type History,
} from '../lib/genomeBrowser';
import { drawGeneRows, type GeneTrackFeature } from './geneTrack';
import {
  LOGO_COLOURS, LOGO_GLYPHS, LOGO_GLOBSCALE, packGeneRows, type Base,
} from '../lib/shorkieModel';

const BASES4: Base[] = ['A', 'C', 'G', 'T'];

const DATA = '/genome-data';

/** Decode slice width. Below every browser's maximum canvas dimension, with room to spare. */
const DECODE_CHUNK = 4096;

/**
 * Whether the letter view is drawn is `shouldDrawLetters(span, innerWidth)` in the pure layer, not
 * a constant here. A flat 7 px threshold made the sequence unreachable on a phone: 252 px of plot
 * over the old 40 bp floor is 6.3 px a base, so the deepest zoom still drew bars.
 */

/**
 * Above this span a feature lane draws a density profile instead of individual features.
 *
 * 122,225 PWM-tier calls genome-wide is not a drawing at chromosome zoom, it is a solid bar. IGV
 * does the same thing and says so; the lane label says which it is showing.
 */
const FEATURE_DETAIL_BP = 60_000;

const PAD_RIGHT = 14;
const RULER_H = 26;
const MINIMAP_H = 30;
const GENE_ROW_H = 12;
const FEATURE_ROW_H = 11;
/** Rows a feature lane may stack to before it wraps. Enough for a dense promoter, bounded so one
 *  lane cannot push the score tracks off the screen. */
const FEATURE_MAX_ROWS = 6;
const SEQ_LANE_H = 16;
const LANE_GAP = 9;

/**
 * Left gutter, in CSS pixels. Responsive because it is not decoration: at 320 px a fixed 62 px
 * gutter is a fifth of the plot, and the axis labels it exists to hold do not fit there anyway.
 */
const padLeft = (w: number) => (w < 380 ? 22 : w < 560 ? 34 : 62);

/** Below this canvas width the controls collapse and the default lane set shrinks. */
const PHONE_W = 560;

/** Full height of the overview strip, in bits. A locator scale, not the plot's. */
const MINI_MAX = 0.5;

/**
 * One-click lane sets.
 *
 * With nine score lanes from two different networks plus twelve annotation lanes, a flat list of
 * toggles is a puzzle rather than a control. Each preset is a QUESTION, not a tidy grouping: what
 * is constrained here, what is expressed here, do the two agree, what regulates this gene, and
 * what varies in the population. Ids that a build does not carry are simply skipped, so a preset
 * naming a track that has not been generated degrades instead of breaking.
 */
const PRESETS: {
  id: string; label: string; hint: string; lanes: string[];
  /** Tracks without which this view would be misleading rather than merely smaller. */
  requires?: string[];
}[] = [
  {
    id: 'constraint',
    label: 'constraint',
    hint: 'What does the language model think is determined by its context, against 7-species conservation?',
    lanes: ['lm-masked', 'phastcons', 'genes', 'sequence'],
    // Without the language model this is "phastCons + genes" under a heading promising constraint.
    requires: ['lm-masked'],
  },
  {
    id: 'expression',
    label: 'expression',
    hint: 'What does the expression model predict is transcribed, and which bases drive it?',
    lanes: ['sk-rnaseq', 'sk-gradient', 'genes', 'tfbs_chip'],
  },
  {
    id: 'compare',
    label: 'compare models',
    hint: 'Constrained against expressed — two lanes, so the header prints their correlation over the view',
    lanes: ['lm-masked', 'sk-rnaseq', 'genes'],
    requires: ['lm-masked'],
  },
  {
    id: 'regulation',
    label: 'regulation',
    hint: 'Predicted expression against the curated regulatory evidence that might explain it',
    lanes: ['sk-rnaseq', 'tfbs_chip', 'tfbs_conserved', 'regulatory', 'genes'],
  },
  {
    id: 'attribution',
    label: 'attribution methods',
    hint: 'Two ways of asking which bases drive the prediction — a local slope and a path integral. '
      + 'They agree less than they look like they should: r = 0.60 per base.',
    lanes: ['sk-gradient', 'sk-ig', 'genes'],
    // Without IG this is one method under a heading that promises a comparison, which is worse
    // than not offering the view at all.
    requires: ['sk-ig'],
  },
  {
    id: 'variation',
    label: 'variation',
    hint: 'Constraint against what actually varies across 1,011 natural isolates',
    lanes: ['lm-masked', 'variant_missense', 'variant_synonymous', 'genes'],
    requires: ['lm-masked'],
  },
];

interface TrackSpec {
  id: string;
  label: string;
  short: string;
  detail: string;
  note: string;
  source: string;
  units: string;
  axis: [number, number];
  prediction: boolean;
  /** bp a stored bin. 16 for Shorkie's coverage tracks, 1 for a genuinely per-base track. */
  nativeBp?: number;
  /** How values map onto the lane. A property of the DATA, not a display preference. */
  space?: 'linear' | 'log1p' | 'symlog';
  /** For `symlog`: the value at which the scale turns over from linear to logarithmic. */
  linthresh?: number;
  /** The track's own ladder, written by the tiler. A coarse track has holes at the fine end. */
  levels?: Level[];
  /** Which model (or neither) this lane comes from. Written by the tiler, never inferred here. */
  group?: string;
  /** Short qualifier drawn on the lane. Empty for the one track that IS a prediction. */
  laneTag?: string;
  /** Written in `make_genome_tiles.py`, which refuses to build without all four fields. */
  docs?: LaneDocs;
}

interface IndexFile {
  genome: string;
  levels: Level[];
  /** What each track `group` means, so the panel's headings come from the generator too. */
  groupLabels?: Record<string, { label: string; hint: string }>;
  tileBins: number;
  noDataByte: number;
  tracks: TrackSpec[];
  comparison?: Record<string, unknown>;
  window: Record<string, unknown>;
  chroms: (ChromInfo & {
    genes: number;
    tracks: Record<string, { scored: number; mean: number | null; meanAbs?: number }>;
    levels: Record<string, { level: number; bins: number; tiles: number }[]>;
  })[];
}

interface Tile { rows: number; cols: number; data: Uint8Array }

/** Per-pixel-column aggregate. `have` false where every bin under the column is no-data. */
interface Column { min: number; max: number; mean: number; have: boolean }

interface FeatureClass {
  cls: string;
  starts: Int32Array;
  lengths: Int32Array;
  names: string[];
  nameIdx: Int32Array;
  strand: Int8Array;
  extra: Int32Array;
}

interface ChromFeatures { names: string[]; classes: Map<string, FeatureClass> }

interface MotifEntry {
  matrix: string | null;
  jasparName?: string;
  length?: number;
  probs?: number[][];
  bits?: number[];
  class?: string | null;
  family?: string | null;
  dataType?: string | null;
  pubmed?: string | null;
  matchedVia?: string | null;
  reason?: string;
  explained?: boolean;
}

interface MotifFile { source: string; url: string; background: string;
                      factors: Record<string, MotifEntry> }

/**
 * The feature lanes, and the grouping is a claim about evidence rather than a tidy-up.
 *
 * The three TFBS tiers stay apart because they are three different statements: a ChIP measurement
 * that the factor binds there, a conservation argument that it might, and a motif match that says
 * only that the letters look right. The expression page measures them enriching at 3.26x, 1.25x
 * and 1.49x; merging them into one "TFBS" lane buries the 15,979-feature result under 122,225
 * weaker ones.
 */
interface LaneDocs {
  /** The dataset, its release, and where it came from. */
  source: string;
  /** What the feature physically is. */
  measures: string;
  /** How to read it — what its presence and its absence each mean. */
  read: string;
  /** What it does NOT mean: the misreading this particular lane invites. */
  caveat: string;
}

/**
 * The feature lanes.
 *
 * Two things are load-bearing here. **The grouping is a claim about evidence**, not a tidy-up: the
 * three TFBS tiers stay apart because a ChIP measurement, a conservation argument and a motif match
 * are three different statements, and the expression page measures them enriching at 3.26x, 1.25x
 * and 1.49x. **And every lane carries `docs`** — four fields rather than a paragraph, so a lane
 * cannot be added without saying where it came from, what it is, how to read it, and what it does
 * not mean. The last field is the one that matters; every lane here invites a specific misreading.
 */
const FEATURE_LANES: {
  id: string;
  /** Gutter label. The gutter is 34-62 px, so the full name is clipped there, and a clipped label
   *  reads as a different one -- "Chromosome structure" became "me structure". */
  short: string;
  label: string;
  classes: string[];
  hint: string;
  docs: LaneDocs;
}[] = [
  {
    id: 'tfbs_chip', short: 'ChIP', label: 'TFBS · ChIP-supported', classes: ['tfbs_chip'],
    hint: 'Harbison/MacIsaac calls with ChIP evidence — the tier attribution actually enriches on',
    docs: {
      source: 'UCSC transRegCode — the transcriptional regulatory code of Harbison, Gordon et al. '
        + '(Nature 2004), restricted here to the 15,979 calls whose chipEvidence field is "good" '
        + 'or "weak".',
      measures: 'A location where a named transcription factor was measured binding, by '
        + 'chromatin immunoprecipitation followed by microarray, across 203 factors in rich medium '
        + 'and a range of stresses.',
      read: 'The strongest binding evidence on the page. On the expression playground, attribution '
        + 'enriches 3.26× on this tier against 1.25× for conserved-only and 1.49× for motif-only, '
        + 'so if the model is reading regulatory sequence anywhere, it is here. Click a box for '
        + 'the factor’s JASPAR motif.',
      caveat: 'ChIP measures occupancy, not function: a factor can sit somewhere without '
        + 'regulating it, and cross-linking pulls down whole complexes, which is why the table '
        + 'contains coactivators like Swi6 and Gal80 that do not bind DNA at all. Only 22.8% of '
        + 'curated calls actually contain their factor’s consensus.',
    },
  },
  {
    id: 'tfbs_conserved', short: 'cons', label: 'TFBS · conserved only',
    classes: ['tfbs_conserved'],
    hint: 'conserved across species but with no ChIP measurement',
    docs: {
      source: 'The same transRegCode table, restricted to calls with no ChIP evidence but a '
        + 'positive consSpecies count — conserved in one or two of the sensu stricto yeasts.',
      measures: 'A motif occurrence that has been preserved across related species, which is an '
        + 'argument that it is under selection and therefore likely to be real.',
      read: 'A middle tier: weaker than a measurement, stronger than a match. 68,354 calls.',
      caveat: 'Conservation and the model’s constraint are not independent here — both ultimately '
        + 'read cross-species similarity — so agreement between this lane and the model lane is '
        + 'less surprising than agreement with the ChIP tier would be.',
    },
  },
  {
    id: 'tfbs_pwm', short: 'motif', label: 'TFBS · motif only', classes: ['tfbs_pwm'],
    hint: 'neither ChIP-supported nor conserved: the weakest tier',
    docs: {
      source: 'The same transRegCode table: 122,225 calls with neither ChIP evidence nor '
        + 'cross-species conservation.',
      measures: 'A position where the sequence matches a factor’s recognition motif well enough '
        + 'to be reported, and nothing more.',
      read: 'Useful mainly as the negative control for the other two tiers. If a signal is real '
        + 'regulatory biology it should be weaker here, and it is.',
      caveat: 'A motif match is not a binding site. Yeast promoters are AT-rich and most factor '
        + 'motifs are short, so matches occur constantly by chance — this is why the unfiltered '
        + 'JASPAR scan of this genome returns 16.7 million hits, 1.4 per base, and is not shown.',
    },
  },
  {
    id: 'regulatory', short: 'OReg', label: 'Regulatory (ORegAnno)', classes: ['regulatory'],
    hint: 'literature-curated regulatory regions',
    docs: {
      source: 'UCSC oreganno — the Open Regulatory Annotation database, curated from published '
        + 'experiments. 7,299 regions.',
      measures: 'A region a paper reported as regulatory, with a literature citation behind it.',
      read: 'Hand-curated, so precision is high and coverage is not: presence is good evidence, '
        + 'absence is mostly evidence that nobody has looked.',
      caveat: 'Regions here are large — often the whole promoter — so an overlap with a model peak '
        + 'localises the peak to a promoter, not to a base.',
    },
  },
  {
    id: 'conserved_element', short: 'elem', label: 'Conserved elements',
    classes: ['conserved_element'],
    hint: 'phastCons element calls — the discrete counterpart of the conservation score',
    docs: {
      source: 'UCSC phastConsElements7way: the discrete element calls the same phylo-HMM makes '
        + 'over the 7-yeast alignment that produces the conservation score track. 52,725 elements.',
      measures: 'A contiguous run the model calls conserved, with a log-odds score in its name.',
      read: 'The thresholded version of the phastCons lane. Useful when you want "is this in a '
        + 'conserved element" as a yes/no rather than reading a posterior curve.',
      caveat: 'Not independent of the phastCons score track — it is the same model’s output, '
        + 'thresholded. Turning both on shows one piece of evidence twice.',
    },
  },
  {
    id: 'variant_missense', short: 'missense', label: 'Variants · missense',
    classes: ['variant_missense'],
    hint: 'natural variants that change an amino acid (or a start/stop)',
    docs: {
      source: 'UCSC evaSnp8 — European Variant Archive release 8, short genetic variants observed '
        + 'across sequenced S. cerevisiae isolates. 15,879 classified as missense here.',
      measures: 'A position where a natural isolate differs from the reference AND the change '
        + 'alters the protein: missense, nonsense, start/stop loss or frameshift.',
      read: 'The population-level complement to conservation. Conservation asks what evolution '
        + 'held still ACROSS species; this asks what is still varying WITHIN one. A base the model '
        + 'finds highly determined and that carries no missense variant is a stronger claim than '
        + 'either measure alone. The genome carries roughly twice as many synonymous as missense '
        + 'variants, which is itself the signature of purifying selection.',
      caveat: 'Absence of a variant is not evidence of constraint on its own — it is also a '
        + 'function of how many isolates have been sequenced and how well that position is '
        + 'covered. Read depletion relative to the synonymous lane, never in isolation.',
    },
  },
  {
    id: 'variant_synonymous', short: 'syn', label: 'Variants · synonymous',
    classes: ['variant_synonymous'],
    hint: 'natural variants inside a codon that leave the protein unchanged',
    docs: {
      source: 'The same EVA release 8 set: 31,577 variants whose only coding consequence is '
        + 'synonymous.',
      measures: 'A base that varies between isolates without changing the encoded protein.',
      read: 'The control for the missense lane. Coding sequence that tolerates synonymous change '
        + 'but not missense change is under protein-level selection; if the model’s constraint is '
        + 'functional rather than compositional, it should track the missense depletion and not '
        + 'this one.',
      caveat: 'Synonymous is not neutral in yeast — codon usage affects translation efficiency, '
        + 'and some synonymous sites sit in splice or regulatory elements. Treat this as a weaker '
        + 'constraint, not as no constraint.',
    },
  },
  {
    id: 'variant_noncoding', short: 'noncod', label: 'Variants · non-coding',
    classes: ['variant_noncoding'],
    hint: 'natural variants outside coding sequence',
    docs: {
      source: 'The same EVA release 8 set: 36,936 variants with no coding consequence.',
      measures: 'A base that varies between isolates and lies outside a protein-coding region — '
        + 'promoters, terminators and intergenic sequence.',
      read: 'Where regulatory constraint would show. This is the lane to read against the '
        + 'binding-site tiers: a promoter position that is both a ChIP-supported site and free of '
        + 'natural variation is under regulatory selection.',
      caveat: 'The same sequencing-depth caveat as the missense lane, and more strongly: '
        + 'intergenic sequence is harder to align between divergent isolates, so absence of a '
        + 'variant call is a weaker statement here than inside a gene.',
    },
  },
  {
    id: 'ncrna', short: 'ncRNA', label: 'Non-coding RNA',
    classes: ['trna', 'snorna', 'ncrna', 'snrna', 'rrna'],
    hint: 'tRNA, snoRNA, snRNA, rRNA and other ncRNA genes',
    docs: {
      source: 'The SGD genome annotation (saccharomyces_cerevisiae.gff), read locally.',
      measures: 'Genes transcribed into RNA that is not translated: 299 tRNA, 77 snoRNA, 31 '
        + 'ncRNA, 24 rRNA and 6 snRNA genes.',
      read: 'These are strongly constrained by RNA structure rather than by the genetic code, so '
        + 'they are a different kind of test for the model than a protein-coding gene.',
      caveat: 'tRNA genes are highly repetitive as a family — the model may predict them well '
        + 'because it has seen 299 near-copies, which is memorisation rather than an understanding '
        + 'of RNA structure.',
    },
  },
  {
    id: 'repeats', short: 'repeat', label: 'Repeats & mobile elements',
    classes: ['ltr', 'transposon', 'repeat'],
    hint: 'LTRs, transposons and tandem repeats',
    docs: {
      source: 'SGD for the 384 long terminal repeats and 141 transposable elements; UCSC '
        + 'simpleRepeat (Tandem Repeats Finder) for the 2,075 tandem repeats.',
      measures: 'Ty retrotransposons, the solo LTRs they leave behind, and short tandem repeats.',
      read: 'The clearest case where high model certainty means low biological importance. A '
        + 'repeat is predictable precisely because it recurs, so a peak here is memorisation.',
      caveat: 'Shorkie’s training weighted repeat loss at 0.1, so the model was explicitly '
        + 'discouraged from memorising these — but a loss weight cannot make a repeat '
        + 'unpredictable, only less rewarded.',
    },
  },
  {
    id: 'structure', short: 'struct', label: 'Chromosome structure',
    classes: ['ars', 'ars_consensus', 'centromere', 'telomere'],
    hint: 'replication origins, centromeres and telomeres',
    docs: {
      source: 'SGD: 543 autonomously replicating sequences with 196 ARS consensus sequences '
        + 'inside them, 80 centromere elements and 146 telomeric features.',
      measures: 'The sequences that make a chromosome work as a chromosome rather than as a '
        + 'carrier of genes — where replication starts, where the spindle attaches, where the ends '
        + 'are maintained.',
      read: 'Yeast centromeres are short and sequence-defined (unlike most eukaryotes’), and the '
        + 'ARS consensus is an 11 bp element, so these are among the few places where a specific '
        + 'short sequence is genuinely required. Good places to look for sharp model peaks.',
      caveat: 'Telomeric regions are exactly where phastCons has no alignment and where the '
        + 'window flank is truncated, so both the conservation lane and the model’s own edge '
        + 'behaviour are least reliable there.',
    },
  },
  {
    id: 'other', short: 'other', label: 'Other gene features',
    classes: ['pseudogene', 'uorf', 'utr_intron'],
    hint: 'pseudogenes, uORFs and 5′ UTR introns',
    docs: {
      source: 'The SGD genome annotation: 24 pseudogenes, 21 upstream ORFs and 24 introns in 5′ '
        + 'untranslated regions.',
      measures: 'Coding-like features that are not part of a normal protein-coding transcript.',
      read: 'A pseudogene is the natural experiment for the model: coding-like sequence that is no '
        + 'longer under coding constraint. uORFs are short translated elements that regulate the '
        + 'gene below them.',
      caveat: 'Small counts — 21 uORFs is not a genome-wide result, and a difference measured on '
        + 'them is a difference measured on 21 features.',
    },
  },
];

/** Tracks on by default: one model pass, conservation, genes, and the strongest TFBS tier. */
const DEFAULT_ON = ['lm-masked', 'phastcons', 'genes', 'sequence', 'tfbs_chip'];
/**
 * The narrow default. Fewer lanes, not different ones: the model, its genes and the sequence.
 * A default rather than a restriction -- every lane is one tap away in the panel, and a shared
 * link's `t=` list always wins over both of these.
 */
const DEFAULT_ON_NARROW = ['lm-masked', 'genes', 'sequence'];

/** Every toggleable lane id, in panel order. */
const ALL_LANES = (index: IndexFile | null): string[] => [
  ...(index?.tracks ?? []).map((t) => t.id),
  'genes', 'sequence',
  ...FEATURE_LANES.map((f) => f.id),
];

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
  const corrOut = $('[data-gb-corr]');
  const statsBox = $('[data-gb-stats]');
  const deepLink = $<HTMLAnchorElement>('[data-gb-deep]');

  /**
   * The 23 windows that `/shorkie-lab/shorkie/` analyses in full, as genome coordinates.
   *
   * The browser can already jump TO one by name; nothing told a reader they were standing IN one,
   * which is the half that turns two pages into one story. Passed in as data rather than fetched,
   * because both pages already have `shorkieLoci.json` at build time and a second copy fetched at
   * runtime is a second thing that can disagree.
   */
  type Primary = { id: string; gene: string; chrom: string; start: number; end: number };
  const primaries: Primary[] = (() => {
    try {
      return JSON.parse(host.dataset.gbPrimary || '[]') as Primary[];
    } catch {
      return [];
    }
  })();

  /** The primary window the view sits in, preferring the one it overlaps most. */
  function primaryHere(): Primary | null {
    let best: Primary | null = null;
    let bestOverlap = 0;
    for (const p of primaries) {
      if (p.chrom !== view.chrom) continue;
      const ov = Math.min(view.end, p.end) - Math.max(view.start, p.start);
      if (ov > bestOverlap) { best = p; bestOverlap = ov; }
    }
    // Half the view has to be inside it, or panning past the edge of a 16 kb window would keep
    // claiming the reader is in it while almost nothing on screen belongs to it.
    return bestOverlap > (view.end - view.start) * 0.5 ? best : null;
  }
  const scatterCv = $<HTMLCanvasElement>('[data-gb-scatter]');
  const hoverOut = $('[data-gb-hover]');
  const panelBox = $('[data-gb-panel]');
  const tooltip = $('[data-gb-tooltip]');
  const roiBox = $('[data-gb-roi]');
  if (!trackCanvas || !miniCanvas) return;

  let index: IndexFile | null = null;
  let searchIndex: SearchIndex | null = null;
  let view: View = { chrom: 'chrI', start: 0, end: 20000 };
  let history: History = emptyHistory();
  let hoverBp: number | null = null;
  let roi: { start: number; end: number } | null = null;
  let brush: { start: number; end: number } | null = null;
  /** The band being dragged on the overview strip, in chromosome coordinates. */
  let miniBrush: { start: number; end: number } | null = null;
  let motifs: MotifFile | null = null;
  let lanes: Lane[] = [];

  /** Enabled state and height for every lane the panel can toggle. */
  const isCompact = host.dataset.gbMinimal === '1' || host.dataset.gbCompact === '1';

  /**
   * Lanes this mounting is not allowed to show at all.
   *
   * `data-gb-tracks` decides what is ON at startup and says nothing about what EXISTS, so the
   * expression page's embed would surface the language model's lanes the moment it grew a track
   * panel. `data-gb-exclude="lm-"` removes the family. Applied in every place that enumerates
   * lanes -- a lane hidden from the panel but still reachable from a preset or a URL is worse than
   * one hidden from nothing.
   */
  const laneHidden = laneExcluder(host.dataset.gbExclude);
  const availableLanes = (): string[] => ALL_LANES(index).filter((id) => !laneHidden(id));
  const enabled = new Map<string, boolean>();
  const laneHeight = new Map<string, number>([
    ['lm-masked', isCompact ? 90 : 118],
    ['lm-unmasked', isCompact ? 90 : 118],
    ['phastcons', isCompact ? 72 : 96],
  ]);

  const scoreTracks = (): TrackSpec[] =>
    (index?.tracks ?? []).filter((t) => enabled.get(t.id) && !laneHidden(t.id));

  /** The level each score lane was last drawn at. Tracks differ: a 16 bp track has no L0. */
  const drawnLevels = new Map<string, Level>();

  /** Glyphs drawn by score lanes in the current paint; see `letters` in `paintTrack`. */
  let scoreGlyphs = 0;

  /**
   * A track's genome-wide mean, length-weighted over the chromosomes that scored it.
   *
   * Weighted, because chrIV is eighteen times chrI and an unweighted mean of per-chromosome means
   * would let the mitochondrion -- 0.7% of the genome and by far the most atypical sequence in it
   * -- carry a seventeenth of the answer.
   */
  function genomeMean(id: string, abs = false): number | null {
    if (!index) return null;
    let num = 0; let den = 0;
    for (const c of index.chroms) {
      // A signed track's plain mean is near zero everywhere and is not a baseline; the tiler
      // records `meanAbs` for those, which is what its |v| summary must be compared against.
      const m = abs ? c.tracks[id]?.meanAbs : c.tracks[id]?.mean;
      if (m == null) continue;
      num += m * c.length; den += c.length;
    }
    return den ? num / den : null;
  }

  /**
   * Per-lane autoscale, OFF by default and labelled loudly when on.
   *
   * It contradicts this browser's own fixed-axis rule, which is exactly why it must be opt-in: the
   * whole point of an information-content axis pinned at 0-2 bits is that a quiet window looks
   * quiet, and autoscaling makes an unconstrained stretch look as structured as a constrained one.
   * It earns its place only on the coverage lanes, where a silent locus and a maximal one differ by
   * four orders of magnitude and a genome-wide axis leaves a whole chromosome arm flat.
   */
  let autoscale = false;

  /** The last computed per-lane range, so the label can say what the axis actually became. */
  const autoRange = new Map<string, [number, number]>();

  /** The axis a lane is drawn on: the track's own, or the visible data's when autoscale is on. */
  function laneAxis(spec: TrackSpec, cols: Column[]): [number, number] {
    if (!autoscale) return spec.axis;
    let lo = Infinity; let hi = -Infinity;
    for (const c of cols) {
      if (!c.have) continue;
      if (c.min < lo) lo = c.min;
      if (c.max > hi) hi = c.max;
    }
    if (!Number.isFinite(lo) || hi <= lo) return spec.axis;
    // A signed track keeps its zero rule in the middle even when autoscaled, or the sign stops
    // being readable off the drawing -- which is the only thing the lane is for.
    const out: [number, number] = isSignedAxis(spec.axis)
      ? [-Math.max(Math.abs(lo), Math.abs(hi)), Math.max(Math.abs(lo), Math.abs(hi))]
      : [Math.min(0, lo), hi];
    autoRange.set(spec.id, out);
    return out;
  }

  // -------------------------------------------------------------------------------------------
  // Tile cache: bounded, de-duplicated, shared by every track, the sequence and the minimap.
  // -------------------------------------------------------------------------------------------
  const tiles = new Map<string, Tile>();       // insertion order IS the LRU order
  const inflight = new Map<string, Promise<Tile | null>>();
  let fetched = 0;
  let evicted = 0;

  /**
   * How many decoded tiles to hold.
   *
   * A constant was right when one pyramid shipped. With three score tracks enabled the working set
   * triples, and a bound that does not move means every pan evicts tiles it is about to need again.
   * 16 covers the sequence and the minimap; each enabled score track adds its own headroom.
   */
  const maxTiles = () => 16 + 16 * Math.max(1, scoreTracks().length);

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
    while (tiles.size > maxTiles()) {
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
  function tile(key: string): Tile | null {
    const hit = cacheGet(key);
    if (hit) return hit;
    if (inflight.has(key)) return null;
    const p = decodeGray(`${DATA}/${key}.png`).then((t) => {
      inflight.delete(key);
      if (t) { cachePut(key, t); fetched += 1; schedule(); }
      return t;
    });
    inflight.set(key, p);
    return null;
  }

  // -------------------------------------------------------------------------------------------
  // Per-chromosome JSON: gene models and features, one fetch each, kept for the session.
  // -------------------------------------------------------------------------------------------
  const genes = new Map<string, GeneTrackFeature[]>();
  const features = new Map<string, ChromFeatures>();
  const jsonInflight = new Set<string>();

  function geneModels(chrom: string): GeneTrackFeature[] | null {
    const have = genes.get(chrom);
    if (have) return have;
    const key = `genes:${chrom}`;
    if (jsonInflight.has(key)) return null;
    jsonInflight.add(key);
    void fetch(`${DATA}/${chrom}/genes.json`)
      .then((r) => (r.ok ? r.json() : []))
      .catch(() => [])
      .then((g: GeneTrackFeature[]) => {
        genes.set(chrom, g);
        jsonInflight.delete(key);
        schedule();
      });
    return null;
  }

  /**
   * Features for a chromosome, unpacked into typed arrays.
   *
   * The file stores `[start, length, nameIdx, strand, extra]` rows against a shared name table --
   * 33,837 features on chrIV. Unpacking into parallel typed arrays once beats walking arrays of
   * arrays on every frame, and `featureDensity` takes exactly this shape.
   */
  function chromFeatures(chrom: string): ChromFeatures | null {
    const have = features.get(chrom);
    if (have) return have;
    const key = `feat:${chrom}`;
    if (jsonInflight.has(key)) return null;
    jsonInflight.add(key);
    void fetch(`${DATA}/${chrom}/features.json`)
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null)
      .then((raw: { names: string[]; classes: Record<string, number[][]> } | null) => {
        const classes = new Map<string, FeatureClass>();
        if (raw) {
          for (const [cls, rows] of Object.entries(raw.classes)) {
            const n = rows.length;
            const fc: FeatureClass = {
              cls,
              starts: new Int32Array(n), lengths: new Int32Array(n),
              nameIdx: new Int32Array(n), strand: new Int8Array(n), extra: new Int32Array(n),
              names: raw.names,
            };
            for (let i = 0; i < n; i += 1) {
              const r = rows[i];
              fc.starts[i] = r[0]; fc.lengths[i] = r[1];
              fc.nameIdx[i] = r[2]; fc.strand[i] = r[3];
              fc.extra[i] = r.length > 4 ? r[4] : -1;
            }
            classes.set(cls, fc);
          }
        }
        features.set(chrom, { names: raw?.names ?? [], classes });
        jsonInflight.delete(key);
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

  /**
   * A stored byte back to its value. Byte 0 is no data, so values live in 1..255.
   *
   * The byte encodes a FRACTION up the lane in the track's own read space, which is how a
   * log-scaled coverage track keeps its resolution where the data is: quantising linearly over a
   * range spanning four orders of magnitude wastes almost every level on the top. `axisValue` is
   * the inverse of the `to_fraction` that `make_genome_tiles.py` wrote with, and the two must agree
   * exactly or a byte decodes to a different height than it was stored at.
   */
  const dequant = (byte: number, spec: Pick<TrackSpec, 'axis' | 'space' | 'linthresh'>) =>
    axisValue((byte - 1) / 254, spec.axis, spec.space ?? 'linear', spec.linthresh ?? 1);

  /**
   * Aggregate one track's bins under each pixel column.
   *
   * The three rows are carried separately all the way to the pixel: a column's min is the smallest
   * of its bins' minima, not the minimum of their means. Collapsing to the mean first is what makes
   * a pyramid smooth away the spikes it exists to preserve.
   */
  /** What `sample` needs of a track: its id and how its bytes decode. */
  type SampleSpec = Pick<TrackSpec, 'id' | 'axis' | 'space' | 'linthresh'>;

  function sample(spec: SampleSpec, lvl: Level, inner: number): Column[] {
    const trackId = spec.id;
    const info = chromInfo(view.chrom);
    const cols: Column[] = new Array(inner);
    const bpPerPx = (view.end - view.start) / inner;
    const tileBins = index?.tileBins ?? 65536;
    const nBins = info ? Math.ceil(info.length / lvl.binBp) : 0;

    const loaded = new Map<number, Tile>();
    for (const t of tilesCovering(view.start, view.end, lvl.binBp, tileBins)) {
      const got = tile(`${view.chrom}/${trackId}/L${lvl.level}/${t}`);
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
        // Row 0 is the min at a summary level and the value itself at the base level, so the three
        // collapse onto one row there and the aggregation needs no special case. Byte 0 is NO DATA
        // and must be skipped rather than dequantised -- it is not a low value.
        const b0 = t.data[c];
        if (b0 === 0) continue;
        const b1 = t.rows === 1 ? b0 : t.data[t.cols + c];
        const b2 = t.rows === 1 ? b0 : t.data[2 * t.cols + c];
        // Decoded to VALUES before aggregating: the pyramid's own mean was taken in value space,
        // so a pixel spanning several bins has to mean them the same way.
        const vlo = dequant(b0, spec);
        const vhi = dequant(b1 || b0, spec);
        const vme = dequant(b2 || b0, spec);
        if (vlo < mn) mn = vlo;
        if (vhi > mx) mx = vhi;
        sum += vme;
        n += 1;
      }
      cols[x] = n === 0
        ? { min: 0, max: 0, mean: 0, have: false }
        : { min: mn, max: mx, mean: sum / n, have: true };
    }
    return cols;
  }

  /**
   * One track's stored bins over a fixed bp grid, for export.
   *
   * Distinct from `sample`, which aggregates onto PIXEL columns: an export must land on the data's
   * own grid, or every row is an interpolation the reader has no way to detect. Where the track's
   * stored bins are finer than `binBp` the values are meaned; where they are coarser the same
   * stored value repeats, and the header says which by naming the stored resolution.
   */
  function sampleBins(
    spec: SampleSpec & { nativeBp?: number }, lvl: Level,
    startBp: number, n: number, binBp: number,
  ): (number | null)[] {
    const info = chromInfo(view.chrom);
    const tileBins = index?.tileBins ?? 65536;
    const nBins = info ? Math.ceil(info.length / lvl.binBp) : 0;
    const out: (number | null)[] = new Array(n).fill(null);
    const loaded = new Map<number, Tile>();
    for (const ti of tilesCovering(startBp, startBp + n * binBp, lvl.binBp, tileBins)) {
      const got = tile(`${view.chrom}/${spec.id}/L${lvl.level}/${ti}`);
      if (got) loaded.set(ti, got);
    }
    for (let i = 0; i < n; i += 1) {
      const b0 = Math.floor((startBp + i * binBp) / lvl.binBp);
      const b1 = Math.max(b0 + 1, Math.ceil((startBp + (i + 1) * binBp) / lvl.binBp));
      let sum = 0; let k = 0;
      for (let b = b0; b < b1; b += 1) {
        if (b < 0 || b >= nBins) continue;
        const ti = Math.floor(b / tileBins);
        const tl = loaded.get(ti);
        if (!tl) continue;
        const c = b - ti * tileBins;
        if (c >= tl.cols) continue;
        const byte = tl.rows === 1 ? tl.data[c] : tl.data[2 * tl.cols + c];
        if (byte === 0) continue;                 // no data is a GAP, never a zero
        sum += dequant(byte, spec);
        k += 1;
      }
      out[i] = k ? sum / k : null;
    }
    return out;
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
      const got = tile(`${view.chrom}/seq/${t}`);
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
   * off by that ratio -- ruler, tracks and gene models each by the same amount, so nothing looks
   * broken and every coordinate is wrong.
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

    const spec = index.tracks.find((t) => enabled.get(t.id)) ?? index.tracks[0];
    // The COARSEST level this particular track has. A coarse track's ladder stops short of the
    // fine end, never the coarse one, so this is always its last entry -- but reading the index's
    // global ladder would ask a 16 bp track for a level it may not own.
    const tl = levelsForTrack(spec ?? {}, index.levels);
    const lvl = tl[tl.length - 1];
    const nBins = Math.ceil(info.length / lvl.binBp);
    const t = spec ? tile(`${view.chrom}/${spec.id}/L${lvl.level}/0`) : null;

    ctx.strokeStyle = rule;
    ctx.lineWidth = 1;
    ctx.strokeRect(padLeft(w) + 0.5, 4.5, inner - 1, MINIMAP_H - 13);

    if (t && spec) {
      const top = 5;
      const h = MINIMAP_H - 14;
      // The strip is on a DIFFERENT ruler from the plot and says so in its caption: a 4,096 bp
      // bin mean spans a narrow band of the full axis, which on the plot's own scale is a
      // featureless stripe. `MINI_MAX` is that compressed range for the bits tracks; every other
      // track uses its own axis through its own space, so a log track stays log here too.
      const bitsLike = spec.units === 'bits';
      const frac = (v: number) => (bitsLike
        ? Math.max(0, Math.min(1, v / MINI_MAX))
        : axisFraction(v, spec.axis, spec.space ?? 'linear', spec.linthresh ?? 1));
      const signed = !bitsLike && isSignedAxis(spec.axis);
      ctx.fillStyle = muted;
      ctx.globalAlpha = 0.75;
      for (let x = 0; x < inner; x += 1) {
        const b0 = Math.floor((x / inner) * nBins);
        const b1 = Math.max(b0 + 1, Math.ceil(((x + 1) / inner) * nBins));
        let sum = 0; let n = 0;
        for (let b = b0; b < b1 && b < t.cols; b += 1) {
          const byte = t.rows === 1 ? t.data[b] : t.data[2 * t.cols + b];
          if (byte === 0) continue;
          sum += dequant(byte, spec);
          n += 1;
        }
        if (!n) continue;
        const f = frac(sum / n);
        if (signed) {
          // A signed track's zero is mid-lane, so its bar grows either way from there rather than
          // up from the floor -- drawing -0.8 and +0.2 as bars of the same sign is not a summary,
          // it is the wrong sign on the screen.
          const y0 = top + h * 0.5;
          const y1 = top + h * (1 - f);
          ctx.fillRect(padLeft(w) + x, Math.min(y0, y1), 1, Math.max(1, Math.abs(y1 - y0)));
        } else {
          const bh = Math.min(h, f * h);
          if (bh > 0) ctx.fillRect(padLeft(w) + x, top + h - bh, 1, bh);
        }
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

    if (roi) {
      const rx0 = padLeft(w) + (roi.start / info.length) * inner;
      const rx1 = padLeft(w) + (roi.end / info.length) * inner;
      ctx.fillStyle = css('--gb-roi', '#b8860b');
      ctx.globalAlpha = 0.6;
      ctx.fillRect(rx0, MINIMAP_H - 9, Math.max(2, rx1 - rx0), 3);
      ctx.globalAlpha = 1;
    }

    if (miniBrush) {
      const bx0 = padLeft(w) + (miniBrush.start / info.length) * inner;
      const bx1 = padLeft(w) + (miniBrush.end / info.length) * inner;
      ctx.fillStyle = accent;
      ctx.globalAlpha = 0.3;
      ctx.fillRect(bx0, 3, Math.max(1, bx1 - bx0), MINIMAP_H - 11);
      ctx.globalAlpha = 1;
      ctx.fillRect(bx0, 3, 1, MINIMAP_H - 11);
      ctx.fillRect(bx1 - 1, 3, 1, MINIMAP_H - 11);
      ctx.fillStyle = ink;
      ctx.font = '9px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(formatSpan(miniBrush.end - miniBrush.start), (bx0 + bx1) / 2, MINIMAP_H - 1);
    }
    miniCanvas!.dataset.gbMiniBrush = miniBrush
      ? `${Math.round(miniBrush.start)}-${Math.round(miniBrush.end)}` : '';

    ctx.font = '10px system-ui, sans-serif';
    ctx.textAlign = 'right';
    if (padLeft(w) >= 62) {
      ctx.fillStyle = ink;
      ctx.fillText(view.chrom, padLeft(w) - 8, MINIMAP_H - 11);
    }
    ctx.fillStyle = muted;
    // Not decoration: this strip is on a DIFFERENT ruler from the plot below, and saying so is the
    // only thing standing between a reader and comparing the two by eye.
    const label = spec && spec.units !== 'bits'
      ? `0–${spec.axis[1]} ${spec.units}` : `0–${MINI_MAX} bits`;
    ctx.fillText(w < 560 ? label : `${formatSpan(info.length)} · strip ${label}`,
                 padLeft(w) + inner, MINIMAP_H - 1);
  }

  /** The lane stack for the current state, in draw order. */
  function laneSpecs(): LaneSpec[] {
    const out: LaneSpec[] = [{ id: 'ruler', kind: 'ruler', label: '', height: RULER_H }];
    for (const t of scoreTracks()) {
      out.push({ id: t.id, kind: 'score', label: t.label, height: laneHeight.get(t.id) ?? 110 });
    }
    const w = Math.max(1, Math.round(trackCanvas!.clientWidth));
    const inner = Math.max(1, w - padLeft(w) - PAD_RIGHT);
    if (shouldDrawLetters(view.end - view.start, inner) && enabled.get('sequence')) {
      out.push({ id: 'sequence', kind: 'sequence', label: 'sequence', height: SEQ_LANE_H });
    }
    for (const fl of FEATURE_LANES) {
      if (!enabled.get(fl.id)) continue;
      // Density mode is one row by definition; detail mode is as many as the packing needs.
      const rows = (view.end - view.start) <= FEATURE_DETAIL_BP ? laneFeatures(fl.id).nRows : 1;
      out.push({
        id: fl.id, kind: 'features', label: fl.label,
        height: rows * FEATURE_ROW_H + 5,
      });
    }
    if (enabled.get('genes')) {
      const feats = geneModels(view.chrom) ?? [];
      const pad = (view.end - view.start) * 0.1;
      const visible = feats.filter((f) => f.txEnd > view.start - pad && f.txStart < view.end + pad);
      // packGeneRows is what drawGeneRows itself calls, on the same input -- so the lane cannot be
      // sized for fewer rows than get drawn.
      const rows = Math.max(1, Math.max(...packGeneRows(visible), 0) + 1);
      out.push({ id: 'genes', kind: 'genes', label: 'genes', height: rows * GENE_ROW_H + 6 });
    }
    return out;
  }

  function rulerLabel(bp: number, span: number): string {
    if (span > 200_000) return `${(bp / 1e6).toFixed(2)} Mb`;
    if (span > 2_000) return `${(bp / 1e3).toFixed(1)} kb`;
    return bp.toLocaleString('en-US');
  }

  function paintTrack(): void {
    const info = chromInfo(view.chrom);
    if (!info || !index) return;
    const cv = trackCanvas!;
    const w = Math.max(1, Math.round(cv.clientWidth));
    const inner = Math.max(1, w - padLeft(w) - PAD_RIGHT);
    const bpPerPx = (view.end - view.start) / inner;
    const lvl = levelForBpPerPixel(bpPerPx, index.levels);

    const layout = laneLayout(laneSpecs(), LANE_GAP);
    lanes = layout.lanes;
    const ctx = fit(cv, layout.total);
    if (!ctx) return;

    const col = {
      ink: css('--color-ink', '#1a1a1a'),
      muted: css('--color-muted', '#6b7280'),
      rule: css('--color-rule', '#d8d8d8'),
      accent: css('--color-accent', '#3d6ea8'),
      surface: css('--color-surface', '#ffffff'),
      bg: css('--color-bg', '#ffffff'),
    };

    // The region of interest sits BEHIND everything, across the whole stack, so it reads as a
    // property of the coordinate rather than of any one track.
    if (roi && roi.end > view.start && roi.start < view.end) {
      const rx0 = Math.max(padLeft(w), xOfBp(roi.start, w));
      const rx1 = Math.min(padLeft(w) + inner, xOfBp(roi.end, w));
      ctx.fillStyle = css('--gb-roi', '#b8860b');
      ctx.globalAlpha = 0.12;
      ctx.fillRect(rx0, 0, Math.max(1, rx1 - rx0), layout.total);
      ctx.globalAlpha = 1;
    }

    let drawn = 0;
    drawnLevels.clear();
    let geneTally: Record<string, unknown> = {};
    let letters = 0;
    // Glyphs drawn by a SCORE lane (an information-content or signed-attribution logo), as opposed
    // to `letters`, which counts only the dedicated sequence lane. Without this the resolution
    // readout says "bars" over a lane that is visibly letters.
    scoreGlyphs = 0;
    const featureCounts: Record<string, number> = {};

    for (const lane of lanes) {
      if (lane.kind === 'ruler') drawRuler(ctx, lane, w, inner, col);
      else if (lane.kind === 'score') {
        const spec = index.tracks.find((t) => t.id === lane.id);
        // Each track is drawn at the finest level IT has. `lvl` above is the level a per-base track
        // would use; a 16 bp track asked for L0 would 404 every tile and draw nothing at all.
        if (spec) {
          const tlvl = levelForBpPerPixel(bpPerPx, levelsForTrack(spec, index.levels));
          drawnLevels.set(spec.id, tlvl);
          drawn += drawScore(ctx, lane, spec, tlvl, w, inner, col);
        }
      } else if (lane.kind === 'sequence') letters = drawSequence(ctx, lane, w);
      else if (lane.kind === 'genes') {
        ctx.save();
        ctx.beginPath();
        ctx.rect(padLeft(w), lane.boxTop, inner, lane.boxHeight);
        ctx.clip();
        geneTally = drawGenes(ctx, lane, w, col);
        ctx.restore();
        drawGeneGutter(ctx, lane, w, col);
      } else if (lane.kind === 'features') {
        ctx.save();
        ctx.beginPath();
        ctx.rect(padLeft(w), lane.boxTop, inner, lane.boxHeight);
        ctx.clip();
        featureCounts[lane.id] = drawFeatures(ctx, lane, w, inner, col);
        ctx.restore();
        drawFeatureGutter(ctx, lane, w, col);
      }
    }

    // Overlays last, so nothing paints over them.
    if (brush) {
      const bx0 = Math.max(padLeft(w), xOfBp(brush.start, w));
      const bx1 = Math.min(padLeft(w) + inner, xOfBp(brush.end, w));
      ctx.fillStyle = col.accent;
      ctx.globalAlpha = 0.16;
      ctx.fillRect(bx0, 0, Math.max(1, bx1 - bx0), layout.total);
      ctx.globalAlpha = 0.9;
      ctx.fillRect(bx0, 0, 1, layout.total);
      ctx.fillRect(bx1 - 1, 0, 1, layout.total);
      ctx.globalAlpha = 1;
      ctx.fillStyle = col.ink;
      ctx.font = '10px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(formatSpan(brush.end - brush.start), (bx0 + bx1) / 2, 12);
    } else if (hoverBp !== null && hoverBp >= view.start && hoverBp <= view.end) {
      const hx = xOfBp(hoverBp, w);
      ctx.strokeStyle = col.accent;
      ctx.globalAlpha = 0.45;
      ctx.beginPath();
      ctx.moveTo(hx + 0.5, RULER_H);
      ctx.lineTo(hx + 0.5, layout.total);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    // Live correlation between the two enabled score lanes, over the visible window.
    //
    // It makes the page's genome-wide constants locally interrogable: IC against phastCons is 0.121
    // genome-wide but 0.045 within coding sequence, and IC against GC is -0.020 genome-wide but
    // -0.221 in intergenic. A reader can now go and see where those numbers come from instead of
    // taking them on trust. Sampled onto the same PIXEL columns the lanes are drawn on, so what is
    // correlated is exactly what is on screen; `pearson` pairs only where both lanes have data,
    // which matters because phastCons is undefined over 0.65% of the genome and Shorkie cannot
    // score the first 1,024 bases of a chromosome.
    if (corrOut) {
      const on = scoreTracks();
      if (on.length !== 2) {
        corrOut.textContent = on.length < 2
          ? '' : `${on.length} tracks on · correlation needs exactly 2`;
      } else {
        const [a, b] = on;
        const va = sample(a, drawnLevels.get(a.id) ?? lvl, inner)
          .map((c) => (c.have ? c.mean : null));
        const vb = sample(b, drawnLevels.get(b.id) ?? lvl, inner)
          .map((c) => (c.have ? c.mean : null));
        const r = pearson(va, vb);
        corrOut.textContent = r == null
          ? `${a.short} vs ${b.short}: too little data here`
          : `${a.short} vs ${b.short}: r = ${r.toFixed(3)} over this view`;
        // NOT `gbCorr`: the readout span is `[data-gb-corr]`, and a canvas dataset key of the
        // same name makes that selector resolve to two elements. The same collision cost this
        // repo a round on `data-lm-locus` in the language-model page.
        cv.dataset.gbCorrelation = r == null ? '' : r.toFixed(4);
      }
      if (on.length !== 2) cv.dataset.gbCorrelation = '';
    }

    renderStats(inner, bpPerPx, col);

    if (deepLink) {
      const p = primaryHere();
      deepLink.hidden = !p;
      if (p) {
        deepLink.href = `/shorkie-lab/shorkie/#locus=${p.id}`;
        deepLink.textContent = `in the ${p.gene} window — open the full analysis →`;
        deepLink.title = `${p.gene} (${p.id}) is one of the ${primaries.length} windows analysed `
          + 'base by base: mutagenesis, four attribution methods, motif knockouts and layer traces.';
      }
      cv.dataset.gbPrimary = p ? p.id : '';
    }

    cv.dataset.gbLevel = String(lvl.binBp);
    cv.dataset.gbDrawn = String(drawn);
    cv.dataset.gbGeneTrack = JSON.stringify(geneTally);
    cv.dataset.gbTiles = String(tiles.size);
    cv.dataset.gbMode = letters + scoreGlyphs > 0 ? 'letters' : 'bars';
    cv.dataset.gbLanes = JSON.stringify(lanes.map((l) => l.id));
    cv.dataset.gbScoreTracks = String(scoreTracks().length);
    cv.dataset.gbFeatures = JSON.stringify(featureCounts);
    cv.dataset.gbFeatureMode =
      (view.end - view.start) > FEATURE_DETAIL_BP ? 'density' : 'detail';
    // `gbRoiRange`, not `gbRoi`: the readout is `<span data-gb-roi>` and `$` returns the first
    // match in document order, so on a page whose embed has no such span -- the genome-wide
    // section on /shorkie-lab/shorkie/ -- the controller would resolve its ROI readout to this
    // canvas and write text into it. It only worked here by the span happening to be declared
    // four lines earlier in the markup.
    cv.dataset.gbRoiRange = roi ? `${roi.start}-${roi.end}` : '';

    if (levelOut) {
      const anyFeature = lanes.some((l) => l.kind === 'features');
      // Tracks drawn coarser than the headline level are NAMED. A lane silently pinned at its
      // own 16 bp floor while the readout says "per base" is the browser claiming a resolution the
      // model does not have, which is the one thing this pyramid is built not to do.
      const coarser = [...drawnLevels.entries()]
        .filter(([, l]) => l.binBp > lvl.binBp)
        .map(([id, l]) => `${index!.tracks.find((s) => s.id === id)?.short ?? id} ${l.binBp} bp`);
      // On a phone the full sentence runs to six lines and pushes the canvas below the fold, so it
      // drops the parts a reader can see for themselves -- that a bar is a mean, that features are
      // individually drawn -- and keeps the two it cannot: the resolution, and which lane is not
      // at it. Same rule as the caption's short form on the full page.
      const tight = w < PHONE_W;
      levelOut.textContent = (lvl.binBp === 1
        ? (letters + scoreGlyphs > 0 ? 'per base, letters' : 'per base')
        : `${lvl.binBp.toLocaleString()} bp bins${tight ? '' : ' · min/mean/max'}`)
        + (coarser.length
          ? `${tight ? ' · floor: ' : ' · at their own floor: '}${coarser.join(', ')}` : '')
        + (anyFeature && !tight
          ? ` · features: ${cv.dataset.gbFeatureMode === 'density' ? 'density' : 'individual'}`
          : '');
    }
    if (readout) readout.textContent = `${formatLocus(view)} · ${formatSpan(view.end - view.start)}`;
    if (statusOut) {
      statusOut.textContent = `${tiles.size} tiles cached · ${fetched} fetched · ${evicted} evicted`
        + ` · cap ${maxTiles()}`;
    }
    syncButtons();
  }

  /**
   * "This view, in numbers" -- what each enabled lane reads here against what it reads genome-wide,
   * and, with exactly two lanes, the shape behind their correlation.
   *
   * A browser is a picture, and a picture answers "is this region unusual?" only by eye. The
   * genome-wide means are already in `index.json` because the tiler recorded them, so the
   * comparison costs one division. Two things it deliberately does NOT do:
   *
   * - A SIGNED track is summarised by mean |v|, never by its mean. Gradient x input is 50.2%
   *   negative genome-wide, so its mean is near zero everywhere and a ratio against it would be
   *   noise divided by noise -- a large, meaningless number that looks like a finding.
   * - Values are read at the level the lane is DRAWN at, on the data's own grid rather than on
   *   pixel columns, so the number does not change when the window is resized.
   */
  function renderStats(inner: number, bpPerPx: number, col: Record<string, string>): void {
    if (!statsBox || !index) return;
    const specs = scoreTracks();
    statsBox.textContent = '';
    if (!specs.length) {
      statsBox.hidden = true;
      if (scatterCv) scatterCv.hidden = true;
      return;
    }
    statsBox.hidden = false;

    const series: (number | null)[][] = [];
    for (const s of specs) {
      const l = drawnLevels.get(s.id) ?? levelForBpPerPixel(bpPerPx, levelsForTrack(s, index.levels));
      const start = Math.floor(view.start / l.binBp) * l.binBp;
      const n = Math.min(4000, Math.ceil((view.end - start) / l.binBp));
      series.push(sampleBins(s, l, start, n, l.binBp));
    }

    // A scroll container, because a four-column table is 320 px wide and the box is 240 at a
    // 320 px viewport. Without it the last column -- "vs genome", the one that answers the
    // question -- is clipped, which reads as a column that is not there rather than one cut off.
    const wrap = document.createElement('div');
    wrap.className = 'gb-stats__scroll';
    const table = document.createElement('table');
    table.className = 'gb-stats';
    const head = document.createElement('tr');
    for (const h of ['track', 'here', 'genome', 'vs genome']) {
      const th = document.createElement('th');
      th.textContent = h;
      head.appendChild(th);
    }
    table.appendChild(head);

    specs.forEach((s, i) => {
      const signed = isSignedAxis(s.axis);
      const vals = series[i].filter((v): v is number => v != null)
        .map((v) => (signed ? Math.abs(v) : v));
      const gm = genomeMean(s.id, signed);
      const tr = document.createElement('tr');
      const cell = (txt: string, cls?: string) => {
        const td = document.createElement('td');
        td.textContent = txt;
        if (cls) td.className = cls;
        tr.appendChild(td);
      };
      const fmt = (v: number) => (Math.abs(v) >= 100 ? v.toFixed(0)
        : Math.abs(v) >= 1 ? v.toFixed(2) : v.toFixed(4));
      cell(s.short + (signed ? ' |v|' : ''));
      if (!vals.length) {
        cell('no data'); cell(gm == null ? '—' : fmt(gm)); cell('—');
      } else {
        const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
        cell(fmt(mean));
        // For a signed track both sides of the comparison are mean |v|, never the plain mean:
        // gradient x input is 50.2% negative genome-wide, so a ratio against its mean would be
        // noise over noise, which produces a large number that reads as a finding.
        cell(gm == null ? '—' : fmt(gm));
        cell(gm == null || gm === 0 ? '—' : `${(mean / gm).toFixed(2)}x`,
          gm ? (mean / gm > 1.5 ? 'is-high' : mean / gm < 0.67 ? 'is-low' : '') : '');
      }
      table.appendChild(tr);
    });
    wrap.appendChild(table);
    statsBox.appendChild(wrap);

    const note = document.createElement('p');
    note.className = 'gb-stats__note';
    // Seven lines of explanation on a phone is most of the panel. The long form keeps the reason
    // the scatter does not share the lanes' fixed axes; the short form keeps only what a reader
    // cannot work out from the drawing.
    const tight = (statsBox.clientWidth || 999) < 420;
    note.textContent = specs.length === 2
      ? (tight
        ? 'One point per bin; axes are the view\u2019s 1st\u201399th percentile.'
        : 'Each point is one bin of the view. The axes span its 1st–99th percentile rather than the '
          + 'genome-wide range — the lanes above keep their fixed axes, this shows the shape behind '
          + 'r, and a few points pile against the border by design.')
      : (tight
        ? 'Two score lanes on shows their correlation.'
        : 'Turn on exactly two score lanes to see their correlation and the shape behind it.');
    statsBox.appendChild(note);

    // The scatter. A correlation is a single number summarising a shape, and the same r comes from
    // a line, a fan and a cloud with two outliers -- so the number is never shown without it.
    if (!scatterCv) return;
    if (specs.length !== 2) { scatterCv.hidden = true; return; }
    scatterCv.hidden = false;
    const w = Math.max(1, Math.round(scatterCv.clientWidth));
    const h = Math.max(1, Math.round(scatterCv.clientHeight || 150));
    const sctx = fit(scatterCv, h);
    if (!sctx) return;
    const [A, B] = [specs[0], specs[1]];
    const pad = 30;

    /**
     * The scatter fits the VIEW, where the lanes above keep their fixed axes -- and the two are not
     * in conflict, they answer different questions. A lane's job is that any two places on the
     * genome are read against one ruler, so a quiet window has to look quiet. The scatter's job is
     * the SHAPE behind a correlation, and r is invariant to rescaling either axis, so drawing it on
     * the genome-wide range puts every point in one corner and reports nothing. Each axis prints
     * the range it is actually using, which is what keeps that honest.
     */
    const rangeOf = (s: TrackSpec, vals: (number | null)[]): [number, number] => {
      // PERCENTILES, not min-max. These distributions are heavy-tailed: over TDH3's window a
      // handful of fully determined bases reach 2.0 bits, which on a min-max axis squashes every
      // other point into the left 15% of the plot and reports nothing about the shape. Points
      // outside the range pile visibly against the border rather than being dropped.
      const xs = vals.filter((v): v is number => v != null).sort((a, b) => a - b);
      if (xs.length < 8) return s.axis;
      const at = (q: number) => xs[Math.min(xs.length - 1, Math.floor(q * (xs.length - 1)))];
      let lo = at(0.01); let hi = at(0.99);
      if (!(hi > lo)) { lo = xs[0]; hi = xs[xs.length - 1]; }
      if (!(hi > lo)) return s.axis;
      // A signed track keeps zero in the middle, or the sign stops being readable off the plot.
      return isSignedAxis(s.axis)
        ? [-Math.max(Math.abs(lo), Math.abs(hi)), Math.max(Math.abs(lo), Math.abs(hi))]
        : [lo, hi];
    };
    const ra = rangeOf(A, series[0]);
    const rb = rangeOf(B, series[1]);
    const fa = (v: number) => axisFraction(v, ra, A.space ?? 'linear', A.linthresh ?? 1);
    const fb = (v: number) => axisFraction(v, rb, B.space ?? 'linear', B.linthresh ?? 1);
    sctx.strokeStyle = col.rule;
    sctx.strokeRect(pad + 0.5, 4.5, w - pad - 8, h - pad - 8);
    sctx.fillStyle = col.accent;
    sctx.globalAlpha = 0.35;
    const n = Math.min(series[0].length, series[1].length);
    let drawn = 0;
    for (let i = 0; i < n; i += 1) {
      const a = series[0][i]; const b = series[1][i];
      if (a == null || b == null) continue;
      const x = pad + fa(a) * (w - pad - 8);
      const y = 4 + (1 - fb(b)) * (h - pad - 8);
      sctx.fillRect(x - 1, y - 1, 2, 2);
      drawn += 1;
    }
    sctx.globalAlpha = 1;
    sctx.fillStyle = col.muted;
    sctx.font = '9px system-ui, sans-serif';
    const num = (v: number) => (Math.abs(v) >= 100 ? v.toFixed(0)
      : Math.abs(v) >= 1 ? v.toFixed(1) : v.toFixed(3));
    // The axis endpoints, because the plot fits the view and a reader must be able to see that.
    sctx.textAlign = 'left';
    sctx.fillText(num(ra[0]), pad, h - 14);
    sctx.fillText(`${A.short} →`, pad, h - 3);
    sctx.textAlign = 'right';
    sctx.fillText(num(ra[1]), w - 8, h - 14);
    sctx.textAlign = 'left';
    sctx.fillText(num(rb[1]), 2, 11);
    sctx.fillText(num(rb[0]), 2, h - pad - 6);
    sctx.save();
    sctx.translate(10, h - pad - 14);
    sctx.rotate(-Math.PI / 2);
    sctx.fillText(`${B.short} →`, 0, 0);
    sctx.restore();
    scatterCv.dataset.gbScatterPoints = String(drawn);
    scatterCv.dataset.gbScatterRange = `${num(ra[0])}-${num(ra[1])} x ${num(rb[0])}-${num(rb[1])}`;
  }

  function drawRuler(
    ctx: CanvasRenderingContext2D, lane: Lane, w: number, inner: number,
    col: Record<string, string>,
  ): void {
    const base = lane.boxTop + lane.boxHeight - 1;
    ctx.font = '10px system-ui, sans-serif';
    ctx.fillStyle = col.muted;
    ctx.strokeStyle = col.rule;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(padLeft(w), base - 0.5);
    ctx.lineTo(padLeft(w) + inner, base - 0.5);
    ctx.stroke();
    const ticks = rulerTicks(view, Math.max(3, Math.round(inner / 130)));
    ticks.forEach((bp, i) => {
      const x = xOfBp(bp, w);
      ctx.beginPath();
      ctx.moveTo(x + 0.5, base - 5);
      ctx.lineTo(x + 0.5, base - 1);
      ctx.stroke();
      // A label centred on the axis end is clipped mid-number, which reads as a different
      // coordinate rather than a truncated one.
      ctx.textAlign = i === 0 && x < padLeft(w) + 24 ? 'left'
        : i === ticks.length - 1 && x > padLeft(w) + inner - 24 ? 'right' : 'center';
      ctx.fillText(rulerLabel(bp, view.end - view.start), x, base - 8);
    });
    // The ruler is the selection surface; nothing else on the page says so.
    ctx.textAlign = 'left';
    ctx.fillText('drag to select', padLeft(w), lane.boxTop + 9);
  }

  function drawScore(
    ctx: CanvasRenderingContext2D, lane: Lane, spec: TrackSpec, lvl: Level,
    w: number, inner: number, col: Record<string, string>,
  ): number {
    const space = spec.space ?? 'linear';
    const signed = isSignedAxis(spec.axis);
    const h = lane.height - 12;
    const top = lane.top;
    const cols = sample(spec, lvl, inner);
    // Sampled BEFORE the axis is chosen, because autoscale reads the visible data. `linthresh` is
    // scaled with the axis so a symlog lane keeps the same shape when it zooms in, rather than
    // flattening as its range shrinks toward the turnover value.
    const axis = laneAxis(spec, cols);
    const lin = (spec.linthresh ?? 1)
      * (axis === spec.axis ? 1 : Math.max(1e-6, axis[1] / Math.max(spec.axis[1], 1e-12)));
    // Everything positional goes through the track's own space, so a gridline, a tick label, a bar
    // and the tooltip cannot disagree about where a value sits.
    const fracOf = (v: number) => axisFraction(v, axis, space, lin);
    const yOf = (v: number) => top + h - fracOf(v) * h;
    const yOfFrac = (f: number) => top + h - f * h;
    // Letters for an information-content lane, and now for a SIGNED attribution lane too: an
    // attribution's whole subject is which BASE is doing the work, and a bar chart of it withholds
    // exactly that. The signed geometry below assumes the zero rule sits mid-lane, which is what
    // symlog gives; a signed linear track would need `fracOf(0)` handled the same way but is not
    // something this browser ships.
    // ...but ONLY where the lane genuinely resolves single bases. Occlusion is signed too, and its
    // bins are 64 bp, so a letter view of it would draw sixty-four identical glyphs in a row --
    // the browser claiming a resolution the measurement does not have, in the one rendering where
    // a reader would take it most literally. `lvl.binBp === 1` is the whole guard.
    const asLetters = (spec.units === 'bits' || signed) && lvl.binBp === 1;
    const seq = asLetters && shouldDrawLetters(view.end - view.start, inner)
      ? sequence() : null;

    // Gridlines and the axis, per lane: every score lane prints its OWN range and units, because
    // 0-2 bits, a 0-1 posterior and a log coverage axis are not the same ruler and a shared axis
    // would say they are. Ticks are placed by FRACTION and labelled by value, so on a log or
    // symlog lane they stay evenly spaced on screen while their labels are not evenly spaced in
    // value -- which is what tells a reader the axis is not linear.
    ctx.strokeStyle = col.rule;
    ctx.setLineDash([2, 3]);
    const gridCount = 4;
    for (let g = 1; g < gridCount; g += 1) {
      ctx.beginPath();
      ctx.moveTo(padLeft(w), Math.round(yOfFrac(g / gridCount)) + 0.5);
      ctx.lineTo(padLeft(w) + inner, Math.round(yOfFrac(g / gridCount)) + 0.5);
      ctx.stroke();
    }
    ctx.setLineDash([]);
    ctx.fillStyle = col.muted;
    ctx.font = '9px system-ui, sans-serif';
    ctx.textAlign = 'right';
    const label = (v: number) => (Math.abs(v) >= 100 ? v.toFixed(0)
      : Math.abs(v) >= 1 ? v.toFixed(1)
        : v === 0 ? '0' : v.toFixed(3));
    for (let g = 0; g <= gridCount; g += 2) {
      const f = g / gridCount;
      ctx.fillText(label(axisValue(f, axis, space, lin)), padLeft(w) - 5, yOfFrac(f) + 3);
    }
    // The zero rule. A signed lane without one is unreadable: a bar is then a magnitude with no
    // baseline, and the sign -- the whole point of the track -- is not on the screen at all.
    if (signed) {
      ctx.strokeStyle = col.muted;
      ctx.globalAlpha = 0.55;
      ctx.beginPath();
      ctx.moveTo(padLeft(w), Math.round(yOf(0)) + 0.5);
      ctx.lineTo(padLeft(w) + inner, Math.round(yOf(0)) + 0.5);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    const tone = spec.id === 'phastcons' ? css('--gb-cons', '#8a6d3b')
      : spec.id === 'lm-unmasked' ? css('--gb-unmasked', '#7d5ba6')
        : spec.id === 'gc' ? css('--gb-gc', '#5b7fa6')
          : col.accent;

    let drawn = 0;
    if (seq) {
      // Letter view: one glyph a base, HEIGHT set by its information content. The glyphs are the
      // paper's DejaVu Sans Bold outlines through the same transform as the two SVG logos on this
      // site. `fillText` with a scaled font size is not a logo twice over: font-size scales width
      // with height, and a monospace T stretched 13:1 renders as a lollipop.
      const bw = inner / (view.end - view.start);
      // An unsigned lane grows from its floor; a signed one from its zero rule, and its height is
      // the SIGNED half-fraction. `baseY` and `sy` are the only two things that differ.
      const zeroF = signed ? fracOf(0) : 0;
      const baseY = signed ? yOf(0) : top + h;
      for (let i = 0; i < seq.length; i += 1) {
        const b = seq[i];
        const c = cols[Math.min(cols.length - 1, Math.floor(i * bw))];
        if (!b || !c?.have) continue;
        const sy = (fracOf(c.mean) - zeroF) * h * LOGO_GLOBSCALE;
        if (Math.abs(sy) < 0.12) continue;
        ctx.save();
        ctx.translate(xOfBp(view.start + i + 0.5, w), baseY);
        // `-sy` for both signs, which is exactly what `drawLogo` in variantPlayground.ts does:
        // with sy < 0 the glyph is not flipped, so a negative letter hangs MIRRORED below the
        // rule. That is this site's and the paper's convention -- positives up, negatives
        // mirrored below -- and the two logo renderers sit next to each other on the page, so
        // they must not disagree about what a negative letter looks like.
        ctx.scale(bw * LOGO_GLOBSCALE, -sy);
        ctx.fillStyle = LOGO_COLOURS[b];
        ctx.fill(new Path2D(LOGO_GLYPHS[b]));
        ctx.restore();
        drawn += 1;
        scoreGlyphs += 1;
      }
    } else {
      for (let x = 0; x < inner; x += 1) {
        const c = cols[x];
        if (!c.have) continue;                    // no data: a GAP, never a zero-height bar
        drawn += 1;
        const yMean = yOf(c.mean);
        const yMax = yOf(c.max);
        const yMin = yOf(c.min);
        // A signed track grows from its zero rule, not from the lane floor. Filling from the floor
        // would draw -0.8 and +0.2 as bars of the same sign, and every bar on the lane would be an
        // inverted reading of the one thing the track exists to report.
        const base = signed ? yOf(0) : top + h;
        ctx.globalAlpha = 0.9;
        ctx.fillStyle = tone;
        ctx.fillRect(padLeft(w) + x, Math.min(base, yMean), 1,
          Math.max(signed ? 1 : 0, Math.abs(base - yMean)));
        // The maximum is a MARK, not a filled extension. Filling from the mean up to the max is the
        // BigWig convention and it inverts the reading here: a 512 bp bin almost always contains
        // one near-determined base, so the fill blankets 90% of the plot.
        // The extremes are MARKS, not a filled envelope. Filling mean-to-max is the BigWig
        // convention and it inverts the reading here: a 512 bp bin almost always contains one
        // near-determined base, so the fill blankets 90% of the plot.
        if (yMax < yMean - 1) {
          ctx.globalAlpha = 0.4;
          ctx.fillRect(padLeft(w) + x, yMax, 1, 1.5);
        }
        if (yMin > yMean + 1.5) {
          ctx.globalAlpha = 0.5;
          ctx.fillStyle = signed ? tone : col.ink;
          ctx.fillRect(padLeft(w) + x, yMin, 1, signed ? 1.5 : 1);
        }
      }
      ctx.globalAlpha = 1;
    }

    ctx.strokeStyle = col.rule;
    ctx.beginPath();
    ctx.moveTo(padLeft(w), top + h + 0.5);
    ctx.lineTo(padLeft(w) + inner, top + h + 0.5);
    ctx.stroke();

    // The lane's own name and units, on the lane. With three score tracks stacked, a legend
    // somewhere else is a lookup the reader has to do on every glance.
    const missing = cols.filter((c) => !c.have).length;
    const text = `${spec.label} · ${spec.units}`
      + (spec.laneTag ? ` · ${spec.laneTag}` : '')
      // Autoscale is announced ON THE LANE, with the range it became. A rescaled axis that does not
      // say so is the same defect as a bar chart from a non-zero baseline: the drawing is a
      // different claim from the one the reader thinks they are looking at.
      + (axis !== spec.axis
        ? ` · AUTOSCALED ${label(axis[0])}–${label(axis[1])}` : '')
      + (missing > inner * 0.02 ? ` · ${Math.round((missing / inner) * 100)}% no data` : '');
    // A chip behind it, because phastCons saturates at 1.0 through a whole gene and a bare label
    // at the top of the plot lands on the data rather than above it.
    ctx.font = '10px system-ui, sans-serif';
    ctx.textAlign = 'left';
    const tw = ctx.measureText(text).width;
    ctx.globalAlpha = 0.82;
    ctx.fillStyle = col.surface;
    ctx.fillRect(padLeft(w) + 1, top, tw + 6, 12);
    ctx.globalAlpha = 1;
    ctx.fillStyle = col.muted;
    ctx.fillText(text, padLeft(w) + 4, top + 9);
    return drawn;
  }

  function drawSequence(ctx: CanvasRenderingContext2D, lane: Lane, w: number): number {
    const seq = sequence();
    if (!seq) return 0;
    let n = 0;
    ctx.textAlign = 'center';
    ctx.font = '10px ui-monospace, SFMono-Regular, Menlo, monospace';
    for (let i = 0; i < seq.length; i += 1) {
      const b = seq[i];
      if (!b) continue;
      ctx.fillStyle = LOGO_COLOURS[b];
      ctx.fillText(b, xOfBp(view.start + i + 0.5, w), lane.top + 11);
      n += 1;
    }
    return n;
  }

  function drawGenes(
    ctx: CanvasRenderingContext2D, lane: Lane, w: number, col: Record<string, string>,
  ): Record<string, unknown> {
    const feats = geneModels(view.chrom) ?? [];
    const pad = (view.end - view.start) * 0.1;
    const visible = feats.filter((f) => f.txEnd > view.start - pad && f.txStart < view.end + pad);
    const tally = drawGeneRows(ctx, {
      features: visible,
      ownId: '',
      ownLabel: '',
      width: w,
      top: lane.top,
      rowH: GENE_ROW_H,
      expanded: true,
      xOfBp,
      colours: { orf: col.ink, muted: col.muted, bg: col.surface },
      // Labels appear as zoom makes room for them; at chromosome scale nothing is wide enough.
      labelMinPx: 26,
    });
    return tally as unknown as Record<string, unknown>;
  }

  /**
   * A feature lane: individual features when they can be told apart, a density profile when they
   * cannot.
   *
   * The threshold is a span, not a count, because what matters is whether a feature is more than a
   * pixel wide. Drawing 122,225 motif-tier calls at chromosome zoom produces a solid bar that says
   * only "there are motifs in yeast".
   */
  function drawFeatures(
    ctx: CanvasRenderingContext2D, lane: Lane, w: number, inner: number,
    col: Record<string, string>,
  ): number {
    const spec = FEATURE_LANES.find((f) => f.id === lane.id);
    const store = chromFeatures(view.chrom);
    const top = lane.top;
    const h = lane.height - 2;
    if (!spec || !store) return 0;

    const tone = lane.id === 'tfbs_chip' ? css('--gb-chip', '#2f7d5b')
      : lane.id === 'tfbs_conserved' ? css('--gb-cons', '#8a6d3b')
        : lane.id === 'tfbs_pwm' ? col.muted : col.accent;
    const detail = (view.end - view.start) <= FEATURE_DETAIL_BP;
    let count = 0;

    if (detail) {
      const { items, rows, clipped } = laneFeatures(lane.id);
      for (let i = 0; i < items.length; i += 1) {
        const f = items[i];
        const x0 = xOfBp(f.start, w);
        const x1 = xOfBp(f.end, w);
        const ry = top + 2 + rows[i] * FEATURE_ROW_H;
        ctx.fillStyle = tone;
        ctx.globalAlpha = 0.85;
        ctx.fillRect(x0, ry, Math.max(1.5, x1 - x0), FEATURE_ROW_H - 3);
        count += 1;
        // Name the feature only when the name FITS inside the VISIBLE part of its own box,
        // measured rather than guessed: "OREG0038416" in a 36 px box renders as "OREG003841("
        // spilling over the edge, and a box starting left of the viewport has a huge x1 - x0
        // while its label draws outside the clip and vanishes.
        const vx0 = Math.max(x0, padLeft(w));
        const vx1 = Math.min(x1, padLeft(w) + inner);
        if (f.name && vx1 - vx0 > 26) {
          ctx.font = '9px system-ui, sans-serif';
          if (ctx.measureText(f.name).width + 6 <= vx1 - vx0) {
            ctx.globalAlpha = 1;
            // The page background, not the ink: white in light mode against a saturated box and
            // near-black in dark mode against the lighter one, so it contrasts in both.
            ctx.fillStyle = col.bg;
            ctx.textAlign = 'left';
            ctx.fillText(f.name, vx0 + 3, ry + FEATURE_ROW_H - 5);
          }
        }
      }
      if (clipped) {
        ctx.globalAlpha = 1;
        ctx.fillStyle = col.muted;
        ctx.font = '9px system-ui, sans-serif';
        ctx.textAlign = 'right';
        ctx.fillText(`${FEATURE_MAX_ROWS}+ deep`, padLeft(w) + inner - 2, top + 9);
      }
      ctx.globalAlpha = 1;
    } else {
      // Density. Concatenating the classes first keeps a grouped lane honest: "non-coding RNA"
      // covering 3% is 3% of the lane's own definition, not of whichever class happens to be first.
      let total = 0;
      for (const cls of spec.classes) total += store.classes.get(cls)?.starts.length ?? 0;
      const starts = new Int32Array(total);
      const lengths = new Int32Array(total);
      let o = 0;
      for (const cls of spec.classes) {
        const fc = store.classes.get(cls);
        if (!fc) continue;
        starts.set(fc.starts, o);
        lengths.set(fc.lengths, o);
        o += fc.starts.length;
      }
      const d = featureDensity(starts, lengths, view.start, view.end, inner);
      ctx.fillStyle = tone;
      for (let x = 0; x < inner; x += 1) {
        if (d[x] <= 0) continue;
        const bh = Math.max(1, d[x] * (h - 4));
        ctx.globalAlpha = 0.35 + 0.5 * d[x];
        ctx.fillRect(padLeft(w) + x, top + 2 + (h - 4) - bh, 1, bh);
        count += 1;
      }
      ctx.globalAlpha = 1;
      // No per-lane note. Six lanes each repeating "density — zoom in for individual features" is
      // 240 characters of the same sentence painted over the data it describes; the mode is stated
      // once, beside the bin size, where the reader is already looking for it.
    }
    return count;
  }

  /**
   * A lane's name, in the gutter when it fits there and inside the plot when it does not.
   *
   * The gutter is 22 px on a phone, and "genes" right-aligned at `padLeft - 5` starts at x = -11
   * and renders as "nes" -- which reads as a different word rather than a clipped one, the same
   * failure the ruler's end ticks and the feature names each had. Measure it; do not assume the
   * gutter is wide enough.
   */
  function drawLaneName(
    ctx: CanvasRenderingContext2D, text: string, w: number, y: number,
    col: Record<string, string>, size = 10,
  ): void {
    ctx.font = `${size}px system-ui, sans-serif`;
    ctx.fillStyle = col.muted;
    const gutter = padLeft(w);
    if (ctx.measureText(text).width + 6 <= gutter) {
      ctx.textAlign = 'right';
      ctx.fillText(text, gutter - 5, y);
      return;
    }
    // No room: put it just inside the plot, over a chip so it does not sit on the data.
    ctx.textAlign = 'left';
    const tw = ctx.measureText(text).width;
    ctx.globalAlpha = 0.82;
    ctx.fillStyle = col.bg;
    ctx.fillRect(gutter + 1, y - 8, tw + 5, 11);
    ctx.globalAlpha = 1;
    ctx.fillStyle = col.muted;
    ctx.fillText(text, gutter + 3, y);
  }

  function drawGeneGutter(
    ctx: CanvasRenderingContext2D, lane: Lane, w: number, col: Record<string, string>,
  ): void {
    drawLaneName(ctx, 'genes', w, lane.top + GENE_ROW_H / 2 + 3, col, 10);
  }

  function drawFeatureGutter(
    ctx: CanvasRenderingContext2D, lane: Lane, w: number, col: Record<string, string>,
  ): void {
    drawLaneName(ctx, FEATURE_LANES.find((f) => f.id === lane.id)?.short ?? lane.id,
                 w, lane.top + lane.height - 5, col, 9);
  }

  /**
   * The visible features of a lane, with a row assigned to each so nothing is painted over.
   *
   * Overlap is the rule here, not the exception: a 6 bp binding site sits inside an 800 bp ORegAnno
   * region, and drawn on one row the site simply disappears under it. `packGeneRows` is the same
   * first-fit packing the gene lane uses -- reused rather than reimplemented, so the two lanes
   * cannot disagree about what "overlapping" means.
   *
   * `FEATURE_MAX_ROWS` bounds it: at a dense locus the motif tier can stack a dozen deep, and a
   * lane that grows without limit pushes every other track off the screen. Rows past the cap wrap
   * back onto the last row, and the lane reports that it did.
   */
  function laneFeatures(laneId: string): {
    items: { start: number; end: number; name: string; cls: string; strand: number; extra: number }[];
    rows: number[];
    nRows: number;
    clipped: boolean;
  } {
    const spec = FEATURE_LANES.find((f) => f.id === laneId);
    const store = chromFeatures(view.chrom);
    const out: {
      start: number; end: number; name: string; cls: string; strand: number; extra: number;
    }[] = [];
    if (spec && store) {
      const pad = (view.end - view.start) * 0.02;
      for (const cls of spec.classes) {
        const fc = store.classes.get(cls);
        if (!fc) continue;
        for (let i = 0; i < fc.starts.length; i += 1) {
          const s = fc.starts[i];
          const e = s + fc.lengths[i];
          if (e <= view.start - pad || s >= view.end + pad) continue;
          out.push({
            start: s, end: e, cls,
            name: fc.names[fc.nameIdx[i]] ?? cls,
            strand: fc.strand[i], extra: fc.extra[i],
          });
        }
      }
    }
    // Pack in SCREEN space, not base-pair space: two 6 bp sites 200 bp apart do not overlap as
    // coordinates but are the same pixel at 100 kb, and stacking them is the only way both are
    // visible. The padding is a minimum drawn width plus a gap, converted to base pairs.
    const w = Math.max(1, Math.round(trackCanvas!.clientWidth));
    const inner = Math.max(1, w - padLeft(w) - PAD_RIGHT);
    const minBp = ((view.end - view.start) / inner) * 3;
    const rows = packGeneRows(out.map((f) => ({
      txStart: f.start, txEnd: Math.max(f.end, f.start + minBp),
    })));
    const needed = Math.max(...rows, 0) + 1;
    const capped = Math.min(needed, FEATURE_MAX_ROWS);
    if (needed > FEATURE_MAX_ROWS) {
      for (let i = 0; i < rows.length; i += 1) rows[i] = Math.min(rows[i], FEATURE_MAX_ROWS - 1);
    }
    return { items: out, rows, nRows: out.length ? capped : 1, clipped: needed > FEATURE_MAX_ROWS };
  }

  // -------------------------------------------------------------------------------------------
  // Hit-testing, for the tooltip
  // -------------------------------------------------------------------------------------------
  /**
   * The feature under the cursor, in the ROW under the cursor.
   *
   * Now that overlapping features stack, "the feature at this base" is ambiguous: a 6 bp site
   * inside an 800 bp region is two answers. Using the row disambiguates it exactly the way the
   * drawing does, so the tooltip names the box the pointer is actually over.
   */
  function featureAt(bp: number, laneId: string, yInLane: number): string | null {
    const { items, rows } = laneFeatures(laneId);
    if (!items.length) return null;
    const row = Math.max(0, Math.min(FEATURE_MAX_ROWS - 1,
      Math.floor((yInLane - 2) / FEATURE_ROW_H)));
    const hit = items.findIndex((f, i) => bp >= f.start && bp < f.end && rows[i] === row);
    // Fall back to any feature at this base: at the row boundary a pointer can land a pixel out,
    // and reporting the neighbouring row beats reporting nothing.
    const i = hit >= 0 ? hit : items.findIndex((f) => bp >= f.start && bp < f.end);
    if (i < 0) return null;
    const f = items[i];
    const strand = f.strand > 0 ? ' +' : f.strand < 0 ? ' −' : '';
    const extra = f.extra >= 0
      ? (f.cls.startsWith('tfbs') ? ` · conserved in ${f.extra}` : ` · score ${f.extra}`)
      : '';
    const motif = f.cls.startsWith('tfbs') ? ' · click for its motif' : '';
    return `${f.name}${strand} · ${f.cls} · ${(f.end - f.start).toLocaleString()} bp`
      + ` · ${(f.start + 1).toLocaleString()}–${f.end.toLocaleString()}${extra}${motif}`;
  }

  function geneAt(bp: number): string | null {
    const hits = (genes.get(view.chrom) ?? []).filter((f) => bp >= f.txStart && bp <= f.txEnd);
    if (!hits.length) return null;
    return hits.map((f) => {
      const common = (f as GeneTrackFeature & { gene?: string }).gene;
      return `${common && common !== f.name ? `${common} (${f.name})` : f.name}`
        + `${f.strand === '-' ? ' −' : ' +'} · ${(f.txEnd - f.txStart).toLocaleString()} bp`;
    }).join(' · ');
  }

  /**
   * One score track's value under the cursor, read from the level the view is ALREADY drawing.
   *
   * Reading L0 unconditionally would be exact, and would also fetch a 65,536-base tile for every
   * hover position -- at chromosome zoom that is two dozen tiles of data the view does not need,
   * evicting the coarse tiles it is drawing from. So the readout follows the drawing: exact per
   * base at L0, and the bin's mean above it, labelled with the bin size so it is never mistaken
   * for a per-base number.
   */
  function scoreAt(bp: number, trackId: string): string | null {
    if (!index) return null;
    const spec = index.tracks.find((t) => t.id === trackId);
    if (!spec) return null;
    const w = Math.max(1, Math.round(trackCanvas!.clientWidth));
    const inner = Math.max(1, w - padLeft(w) - PAD_RIGHT);
    // The level this TRACK is being drawn at -- following the drawn level is what stops a hover
    // pulling a 65,536-base L0 tile the view cannot show, and following the track's OWN ladder is
    // what stops it asking a 16 bp track for a level that does not exist.
    const lvl = levelForBpPerPixel((view.end - view.start) / inner,
      levelsForTrack(spec, index.levels));
    const bin = Math.floor(Math.floor(bp) / lvl.binBp);
    const ti = Math.floor(bin / index.tileBins);
    const t = tile(`${view.chrom}/${trackId}/L${lvl.level}/${ti}`);
    if (!t) return null;
    const c = bin - ti * index.tileBins;
    if (c < 0 || c >= t.cols) return null;
    // Byte 0 is no data, and saying so is the point of reserving it.
    const byte = t.rows === 1 ? t.data[c] : t.data[2 * t.cols + c];
    if (byte === 0) return `${spec.short}: no data (not aligned)`;
    const raw = dequant(byte, spec);
    // Coverage runs to four figures and an attribution to four decimals; one fixed precision
    // prints either "1097.560" or "0.000".
    const v = Math.abs(raw) >= 100 ? raw.toFixed(1)
      : Math.abs(raw) >= 1 ? raw.toFixed(2) : raw.toFixed(4);
    const native = spec.nativeBp ?? 1;
    return lvl.binBp === native
      ? `${spec.short} ${v} ${spec.units}`
        + (native > 1 ? ` (${native} bp bin)` : '')
      : `${spec.short} ${v} ${spec.units} (mean of ${lvl.binBp.toLocaleString()} bp)`;
  }

  /**
   * The motif a factor recognises, drawn as a logo, for a binding-site box that was clicked.
   *
   * A box says a factor binds there; the motif is the other half of the claim, and it is what lets
   * a reader judge the call rather than take it. The page already establishes that only 22.8% of
   * curated calls contain their factor's consensus, which is not a statement anyone can evaluate
   * without seeing the consensus -- so the reference sequence under the box is drawn beneath the
   * logo, at the same width, for exactly that comparison.
   *
   * The glyphs go through `LOGO_GLYPHS` and the canonical transform, like every other logo on this
   * site: `fillText` with a scaled font size scales width with height and stops being a logo.
   */
  function showMotif(name: string, start: number, end: number): void {
    const box = $('[data-gb-motif]');
    if (!box) return;
    const entry = motifs?.factors[name];
    box.textContent = '';
    box.removeAttribute('hidden');

    const head = document.createElement('div');
    head.className = 'gb-motif__head';
    const title = document.createElement('strong');
    title.textContent = name;
    const sub = document.createElement('span');
    sub.className = 'vp-stat';
    sub.textContent = `${view.chrom}:${(start + 1).toLocaleString()}–${end.toLocaleString()}`
      + ` · ${(end - start).toLocaleString()} bp`;
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'vp-btn vp-btn--icon';
    close.setAttribute('aria-label', 'Close');
    close.textContent = '×';
    close.addEventListener('click', () => box.setAttribute('hidden', ''));
    head.append(title, sub, close);
    box.appendChild(head);

    if (!entry || !entry.matrix || !entry.probs) {
      const why = document.createElement('p');
      why.className = 'vp-notes';
      // An absent matrix is usually a fact about the protein, not a hole in the data, and saying
      // which is far more useful than an empty panel.
      why.textContent = entry?.explained
        ? `No motif: ${entry.reason}. It appears in a binding-site table because ChIP `
          + 'cross-links whole complexes, so a protein that binds the complex is pulled down with '
          + 'the factor that binds the DNA.'
        : `No JASPAR CORE matrix for ${name}.`;
      box.appendChild(why);
      box.dataset.gbMotifFor = name;
      box.dataset.gbMotifHas = '0';
      return;
    }

    const cv = document.createElement('canvas');
    cv.className = 'gb-motif__logo';
    box.appendChild(cv);

    // The reference sequence under the box, CENTRED on it and as wide as the matrix.
    //
    // The drawn box and the matrix are routinely different lengths -- a Harbison call can be 9 bp
    // where the JASPAR matrix is 12 -- so slicing the box's own span gives a sequence that cannot
    // line up with the logo column for column, which is the one thing this comparison is for.
    const seq = sequence();
    const n = entry?.probs?.length ?? (end - start);
    const mid = Math.round((start + end) / 2);
    const from = mid - Math.floor(n / 2);
    const observed = seq && from >= view.start && from + n <= view.end
      ? seq.slice(from - view.start, from - view.start + n)
      : null;

    const draw = () => {
      const w = Math.max(120, Math.round(cv.clientWidth || 320));
      const h = 96;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      cv.width = Math.round(w * dpr);
      cv.height = Math.round(h * dpr);
      cv.style.height = `${h}px`;
      const ctx = cv.getContext('2d');
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      const colW = w / n;
      const plot = h - 26;
      const muted = css('--color-muted', '#6b7280');
      const rule = css('--color-rule', '#d8d8d8');

      ctx.strokeStyle = rule;
      ctx.beginPath();
      ctx.moveTo(0, plot + 0.5);
      ctx.lineTo(w, plot + 0.5);
      ctx.stroke();
      ctx.fillStyle = muted;
      ctx.font = '9px system-ui, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText('2 bits', 2, 9);

      for (let i = 0; i < n; i += 1) {
        // Ascending by probability, the PWM/IC convention: the tallest letter sits on top, and the
        // stack sums to the column's information content on a fixed 0-2 axis.
        const col = entry.probs![i];
        const order = [0, 1, 2, 3].sort((a, b) => col[a] - col[b]);
        let stacked = 0;
        for (const bi of order) {
          const share = col[bi] * (entry.bits![i] / 2);
          const sy = share * plot * LOGO_GLOBSCALE;
          if (sy < 0.12) { stacked += share; continue; }
          ctx.save();
          ctx.translate((i + 0.5) * colW, plot - stacked * plot);
          ctx.scale(colW * LOGO_GLOBSCALE, -sy);
          ctx.fillStyle = LOGO_COLOURS[BASES4[bi]];
          ctx.fill(new Path2D(LOGO_GLYPHS[BASES4[bi]]));
          ctx.restore();
          stacked += share;
        }
      }

      // The sequence actually there, at the same width and centred the same way, so the two can be
      // read column against column.
      if (observed && observed.length === n) {
        ctx.font = `${Math.min(13, Math.max(8, colW * 0.9))}px ui-monospace, monospace`;
        ctx.textAlign = 'center';
        for (let i = 0; i < n; i += 1) {
          const b = observed[i];
          if (!b) continue;
          ctx.fillStyle = LOGO_COLOURS[b];
          ctx.fillText(b, (i + 0.5) * colW, h - 12);
        }
        ctx.fillStyle = muted;
        ctx.font = '9px system-ui, sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText(`reference at ${(from + 1).toLocaleString()}`, 2, h - 1);
      } else {
        ctx.fillStyle = muted;
        ctx.font = '9px system-ui, sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText('zoom in to compare the reference sequence', 2, h - 3);
      }
      cv.dataset.gbMotifLetters = String(n);
    };
    draw();

    const meta = document.createElement('p');
    meta.className = 'vp-notes gb-motif__meta';
    const bits = entry.bits!.reduce((s, v) => s + v, 0);
    meta.textContent = `JASPAR ${entry.matrix}`
      + (entry.matchedVia ? ` (as ${entry.matchedVia})` : '')
      + ` · ${entry.length} bp · ${bits.toFixed(1)} bits total`
      + (entry.class ? ` · ${entry.class}` : '')
      + (entry.dataType ? ` · ${entry.dataType}` : '')
      + (entry.pubmed ? ` · PMID ${entry.pubmed}` : '');
    box.appendChild(meta);
    box.dataset.gbMotifFor = name;
    box.dataset.gbMotifHas = '1';
  }

  // -------------------------------------------------------------------------------------------
  // Frame scheduling
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
  const currentState = () => ({
    view,
    tracks: availableLanes().filter((id) => enabled.get(id)),
    roi,
  });

  function setView(next: View, opts: { push?: boolean; hash?: boolean } = {}): void {
    const info = chromInfo(next.chrom);
    if (!info) return;
    const v = clampView(next.start, next.end, info.length);
    view = { chrom: next.chrom, ...v };
    if (opts.push !== false) history = historyPush(history, view);
    if (chromSel && chromSel.value !== view.chrom) chromSel.value = view.chrom;
    if (locusInput && document.activeElement !== locusInput) locusInput.value = formatLocus(view);
    host.dataset.gbView = formatLocus(view);
    if (opts.hash !== false) writeHash();

    const fullLink = host.querySelector<HTMLAnchorElement>('[data-gb-full-link]');
    if (fullLink) {
      fullLink.href = `/shorkie-lab/genome/#${encodeViewState(currentState())}`;
    }

    schedule();
  }

  function writeHash(): void {
    if (host.dataset.gbNoHash === '1' || host.dataset.gbMinimal === '1') return;
    const hash = `#${encodeViewState(currentState())}`;
    if (window.location.hash !== hash) {
      window.history.replaceState(null, '', `${window.location.pathname}${hash}`);
    }
  }

  function zoom(factor: number, anchorBp?: number): void {
    const info = chromInfo(view.chrom);
    if (!info) return;
    const anchor = anchorBp ?? (view.start + view.end) / 2;
    setView({ chrom: view.chrom, ...zoomAbout(view.start, view.end, factor, anchor, info.length) });
  }

  function syncButtons(): void {
    const b = $<HTMLButtonElement>('[data-gb-back]');
    const f = $<HTMLButtonElement>('[data-gb-fwd]');
    if (b) b.disabled = !canGoBack(history);
    if (f) f.disabled = !canGoForward(history);
    host.dataset.gbHistory = `${history.at + 1}/${history.entries.length}`;
    if (roiBox) {
      roiBox.textContent = roi
        ? `marked ${view.chrom}:${(roi.start + 1).toLocaleString()}–${roi.end.toLocaleString()}`
        : '';
    }
    const mark = $<HTMLButtonElement>('[data-gb-mark]');
    if (mark) mark.textContent = roi ? 'clear mark' : 'mark region';
  }

  // -------------------------------------------------------------------------------------------
  // Pointer: drag pans, drag on the ruler selects, shift-drag anywhere selects
  // -------------------------------------------------------------------------------------------
  let mode: 'none' | 'pan' | 'brush' = 'none';
  let dragX = 0;
  let dragStart = 0;
  let anchorBp = 0;

  /**
   * Live pointers on the track, so a second finger can turn a pan into a pinch.
   *
   * A phone has no wheel and no keyboard, so pinch is the only gesture anyone will try to zoom
   * with -- and `.gb-track` sets `touch-action: none`, which means the browser's own pinch is
   * already suppressed here and nothing was replacing it.
   */
  const pointers = new Map<number, { x: number; y: number }>();
  let pinch: { dist: number; anchorBp: number; startStart: number; startEnd: number } | null = null;

  trackCanvas.addEventListener('pointerdown', (e) => {
    const w = Math.max(1, Math.round(trackCanvas.clientWidth));
    const rect = trackCanvas.getBoundingClientRect();
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    // Never let this throw past the gesture logic. A synthetic pointer has no active pointer, so
    // this raises NotFoundError and aborted the handler before the two-finger branch below could
    // run -- which is how a pinch silently degraded into a one-finger pan.
    try { trackCanvas.setPointerCapture(e.pointerId); } catch { /* not a real pointer */ }

    if (pointers.size === 2) {
      // The second finger takes over. Whatever the first was doing is abandoned rather than
      // finished, so a pan does not commit a stray view as the pinch begins.
      const [a, b] = [...pointers.values()];
      const mid = pointMidpoint(a.x, a.y, b.x, b.y);
      pinch = {
        dist: pointDistance(a.x, a.y, b.x, b.y),
        anchorBp: bpOfX(mid.x - rect.left, w),
        startStart: view.start,
        startEnd: view.end,
      };
      mode = 'none';
      brush = null;
      schedule();
      return;
    }
    if (pointers.size > 2) return;

    const lane = laneAt(lanes, e.clientY - rect.top);
    // IGV's convention: the ruler is the selection surface and the tracks are the pan surface, so
    // neither needs a mode toggle. Shift-drag brushes anywhere, for anyone who does not know that.
    mode = (lane?.kind === 'ruler' || e.shiftKey) ? 'brush' : 'pan';
    dragX = e.clientX;
    dragStart = view.start;
    anchorBp = bpOfX(e.clientX - rect.left, w);
    brush = null;
    trackCanvas.style.cursor = mode === 'brush' ? 'ew-resize' : 'grabbing';
  });

  trackCanvas.addEventListener('pointermove', (e) => {
    const w = Math.max(1, Math.round(trackCanvas.clientWidth));
    const rect = trackCanvas.getBoundingClientRect();
    const inner = Math.max(1, w - padLeft(w) - PAD_RIGHT);
    const bpPerPx = (view.end - view.start) / inner;

    if (pointers.has(e.pointerId)) pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pinch && pointers.size >= 2) {
      const [a, b] = [...pointers.values()];
      // Measured against the span the pinch STARTED from, not the current one: applying a factor
      // to an already-zoomed view compounds it every frame and the gesture runs away.
      const factor = pinchZoom(pinch.dist, pointDistance(a.x, a.y, b.x, b.y));
      if (factor !== null) {
        const info = chromInfo(view.chrom);
        if (info) {
          const width = pinch.startEnd - pinch.startStart;
          const next = zoomAbout(pinch.startStart, pinch.startStart + width, factor,
                                 pinch.anchorBp, info.length);
          setView({ chrom: view.chrom, ...next }, { push: false, hash: false });
        }
      }
      return;
    }

    if (mode === 'pan') {
      const shift = (dragX - e.clientX) * bpPerPx;
      const width = view.end - view.start;
      // Panning does not push history on every frame: it pushes once on pointerup, or "back" would
      // step through 200 near-identical views.
      setView({ chrom: view.chrom, start: dragStart + shift, end: dragStart + shift + width },
              { push: false, hash: false });
      return;
    }
    if (mode === 'brush') {
      // Three pixels' worth of base pairs is the "click, not a selection" threshold, expressed at
      // the current scale rather than as a constant: 3 px is 2 kb at chromosome zoom and 0.4 bp at
      // base zoom, and a fixed bp threshold would be wrong at one end or the other.
      brush = brushRegion(anchorBp, bpOfX(e.clientX - rect.left, w), bpPerPx * 3);
      schedule();
      return;
    }
    const bp = bpOfX(e.clientX - rect.left, w);
    hoverBp = bp >= view.start && bp <= view.end ? bp : null;
    updateHover(e.clientX - rect.left, e.clientY - rect.top);
    schedule();
  });

  function updateHover(x: number, y: number): void {
    if (hoverBp === null) {
      if (hoverOut) hoverOut.textContent = '';
      if (tooltip) tooltip.setAttribute('hidden', '');
      return;
    }
    const lane = laneAt(lanes, y);
    const at = `${view.chrom}:${Math.round(hoverBp + 1).toLocaleString('en-US')}`;
    let detail: string | null = null;
    if (lane?.kind === 'features') detail = featureAt(hoverBp, lane.id, y - lane.top);
    else if (lane?.kind === 'genes') detail = geneAt(hoverBp);
    else if (lane?.kind === 'score') detail = scoreAt(hoverBp, lane.id);
    if (!detail) detail = geneAt(hoverBp);
    if (hoverOut) hoverOut.textContent = detail ? `${at} · ${detail}` : at;
    if (tooltip) {
      if (detail) {
        tooltip.textContent = `${at} · ${detail}`;
        tooltip.removeAttribute('hidden');
        const box = trackCanvas!.getBoundingClientRect();
        tooltip.style.left = `${Math.min(Math.max(8, x), Math.max(8, box.width - 24))}px`;
        tooltip.style.top = `${y + 18}px`;
      } else {
        tooltip.setAttribute('hidden', '');
      }
    }
  }

  const endDrag = (e: PointerEvent) => {
    pointers.delete(e.pointerId);
    try { trackCanvas.releasePointerCapture(e.pointerId); } catch { /* already released */ }
    if (pinch) {
      // A pinch ends when it drops below two fingers. The view is already where the gesture left
      // it; this only records it in the history and the URL, once, rather than per frame.
      if (pointers.size < 2) {
        pinch = null;
        history = historyPush(history, view);
        writeHash();
        syncButtons();
      }
      return;
    }
    if (mode === 'none') return;
    const was = mode;
    mode = 'none';
    trackCanvas.style.cursor = 'grab';
    if (was === 'pan') {
      // A pan that never moved is a CLICK, and on a binding-site box a click asks what the factor
      // recognises. Checking the distance rather than adding a separate click listener keeps the
      // two gestures from both firing on the same press.
      if (Math.abs(e.clientX - dragX) < 4) {
        const w = Math.max(1, Math.round(trackCanvas.clientWidth));
        const rect = trackCanvas.getBoundingClientRect();
        const lane = laneAt(lanes, e.clientY - rect.top);
        if (lane?.kind === 'features' && lane.id.startsWith('tfbs')) {
          const bp = bpOfX(e.clientX - rect.left, w);
          const { items, rows } = laneFeatures(lane.id);
          const row = Math.max(0, Math.min(FEATURE_MAX_ROWS - 1,
            Math.floor((e.clientY - rect.top - lane.top - 2) / FEATURE_ROW_H)));
          const i = items.findIndex((f, k) => bp >= f.start && bp < f.end && rows[k] === row);
          const j = i >= 0 ? i : items.findIndex((f) => bp >= f.start && bp < f.end);
          if (j >= 0) showMotif(items[j].name, items[j].start, items[j].end);
        }
      }
      history = historyPush(history, view);
      writeHash();
      syncButtons();
    } else if (was === 'brush' && brush) {
      const sel = brush;
      brush = null;
      setView({ chrom: view.chrom, start: sel.start,
                end: Math.max(sel.start + MIN_VIEW_BP, sel.end) });
    } else {
      brush = null;
      schedule();
    }
  };
  trackCanvas.addEventListener('pointerup', endDrag);
  trackCanvas.addEventListener('pointercancel', endDrag);
  trackCanvas.addEventListener('pointerleave', () => {
    hoverBp = null;
    if (hoverOut) hoverOut.textContent = '';
    if (tooltip) tooltip.setAttribute('hidden', '');
    schedule();
  });

  trackCanvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    const rect = trackCanvas.getBoundingClientRect();
    const w = Math.max(1, Math.round(trackCanvas.clientWidth));
    zoom(e.deltaY > 0 ? 1.25 : 0.8, bpOfX(e.clientX - rect.left, w));
  }, { passive: false });

  /**
   * The overview strip is the SELECTION surface: drag a region on it and the view zooms to it; a
   * click still centres.
   *
   * This is where every genome browser puts region selection, and putting it here rather than on
   * the main panel avoids the gesture conflict entirely -- the panel keeps drag-to-pan, which is
   * the more frequent action while reading. The "this was a click, not a selection" threshold is
   * the same `brushRegion` rule the ruler uses, expressed at the STRIP's scale: the strip always
   * spans a whole chromosome, so 4 px of it is several kb.
   */
  const miniBpAt = (clientX: number): number => {
    const info = chromInfo(view.chrom);
    if (!info) return 0;
    const rect = miniCanvas.getBoundingClientRect();
    const mw = Math.max(1, Math.round(miniCanvas.clientWidth));
    const inner = Math.max(1, mw - padLeft(mw) - PAD_RIGHT);
    const frac = (clientX - rect.left - padLeft(mw)) / inner;
    return Math.max(0, Math.min(1, frac)) * info.length;
  };
  const miniBpPerPx = (): number => {
    const info = chromInfo(view.chrom);
    const mw = Math.max(1, Math.round(miniCanvas.clientWidth));
    return (info?.length ?? 1) / Math.max(1, mw - padLeft(mw) - PAD_RIGHT);
  };

  let miniDown = false;
  let miniAnchor = 0;
  miniCanvas.addEventListener('pointerdown', (e) => {
    miniDown = true;
    miniAnchor = miniBpAt(e.clientX);
    miniBrush = null;
    miniCanvas.setPointerCapture(e.pointerId);
  });
  miniCanvas.addEventListener('pointermove', (e) => {
    if (!miniDown) return;
    miniBrush = brushRegion(miniAnchor, miniBpAt(e.clientX), miniBpPerPx() * 4);
    schedule();
  });
  const endMini = (e: PointerEvent) => {
    if (!miniDown) return;
    miniDown = false;
    try { miniCanvas.releasePointerCapture(e.pointerId); } catch { /* already released */ }
    const sel = miniBrush;
    miniBrush = null;
    if (sel) {
      setView({ chrom: view.chrom, start: sel.start,
                end: Math.max(sel.start + MIN_VIEW_BP, sel.end) });
    } else {
      // Below the threshold it was a click: centre the current view there, as before.
      const half = (view.end - view.start) / 2;
      const centre = miniBpAt(e.clientX);
      setView({ chrom: view.chrom, start: centre - half, end: centre + half });
    }
  };
  miniCanvas.addEventListener('pointerup', endMini);
  miniCanvas.addEventListener('pointercancel', () => { miniDown = false; miniBrush = null; schedule(); });

  // -------------------------------------------------------------------------------------------
  // Controls
  // -------------------------------------------------------------------------------------------
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
  $<HTMLButtonElement>('[data-gb-whole]')?.addEventListener('click', () => {
    const info = chromInfo(view.chrom);
    if (info) setView({ chrom: view.chrom, start: 0, end: info.length });
  });
  $<HTMLButtonElement>('[data-gb-back]')?.addEventListener('click', () => {
    const r = historyBack(history);
    if (!r) return;
    history = r.history;
    setView(r.view, { push: false });
  });
  $<HTMLButtonElement>('[data-gb-fwd]')?.addEventListener('click', () => {
    const r = historyForward(history);
    if (!r) return;
    history = r.history;
    setView(r.view, { push: false });
  });
  $<HTMLButtonElement>('[data-gb-mark]')?.addEventListener('click', () => {
    roi = roi ? null : { start: view.start, end: view.end };
    writeHash();
    schedule();
  });
  $<HTMLButtonElement>('[data-gb-export]')?.addEventListener('click', () => {
    // One image of the whole view: the overview strip above the track stack, which is what a reader
    // would screenshot by hand anyway. This is a normal route, not an artifact viewer, so a
    // script-driven download works.
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const out = document.createElement('canvas');
    out.width = Math.max(miniCanvas.width, trackCanvas.width);
    out.height = miniCanvas.height + trackCanvas.height + Math.round(20 * dpr);
    const cx = out.getContext('2d');
    if (!cx) return;
    cx.fillStyle = css('--color-bg', '#ffffff');
    cx.fillRect(0, 0, out.width, out.height);
    cx.drawImage(miniCanvas, 0, 0);
    cx.drawImage(trackCanvas, 0, miniCanvas.height);
    cx.setTransform(dpr, 0, 0, dpr, 0, 0);
    cx.fillStyle = css('--color-muted', '#6b7280');
    cx.font = '10px system-ui, sans-serif';
    cx.fillText(`${formatLocus(view)} · Shorkie_LM genome browser · khchao.com`,
                6, (miniCanvas.height + trackCanvas.height) / dpr + 13);
    const a = document.createElement('a');
    a.download = `${formatLocus(view).replace(/[:,]/g, '_')}.png`;
    a.href = out.toDataURL('image/png');
    a.click();
  });

  $<HTMLButtonElement>('[data-gb-autoscale]')?.addEventListener('click', (e) => {
    autoscale = !autoscale;
    const btn = e.currentTarget as HTMLButtonElement;
    btn.setAttribute('aria-pressed', String(autoscale));
    btn.classList.toggle('is-on', autoscale);
    // NOT `gbAutoscale`: the button is `[data-gb-autoscale]`, and a host dataset key of the same
    // name makes that selector match two elements. Third instance of this collision in this repo.
    host.dataset.gbAutoscaleOn = String(autoscale);
    paintTrack();
  });

  $<HTMLButtonElement>('[data-gb-export-csv]')?.addEventListener('click', () => {
    // The DATA behind the view, at the level it is being drawn at -- not at some canonical
    // resolution the reader did not choose. The header names the bin size for each column, because
    // a bin mean and a per-base value are different numbers and a file carrying neither units nor
    // a bin size is a trap the moment it leaves the browser.
    if (!index) return;
    const specs = scoreTracks();
    if (!specs.length) return;
    const w = Math.max(1, Math.round(trackCanvas.clientWidth));
    const inner = Math.max(1, w - padLeft(w) - PAD_RIGHT);
    const bpPerPx = (view.end - view.start) / inner;
    // One row per bin of the COARSEST enabled track, so every column is a real stored value rather
    // than one track's number repeated down a finer grid.
    const lvls = specs.map((s) => levelForBpPerPixel(bpPerPx, levelsForTrack(s, index!.levels)));
    const binBp = Math.max(...lvls.map((l) => l.binBp));
    const start = Math.floor(view.start / binBp) * binBp;
    const n = Math.ceil((view.end - start) / binBp);
    const cols = specs.map((s, i) => {
      const c = sampleBins(s, lvls[i], start, n, binBp);
      return c;
    });
    const rows = exportRows(view.chrom, start, binBp,
      specs.map((s) => ({ id: s.id, units: s.units })), cols);
    const head = [
      `# ${formatLocus(view)} · ${index.genome} · khchao.com/shorkie-lab/genome/`,
      `# ${binBp === 1 ? 'per base' : `bin ${binBp} bp, values are bin means`}`,
      ...specs.map((s, i) => `# ${s.id}: ${s.label} — ${s.detail}`
        + (lvls[i].binBp < binBp ? ` (stored at ${lvls[i].binBp} bp, re-binned)` : '')),
    ];
    const blob = new Blob([`${[...head, ...rows].join('\n')}\n`], { type: 'text/csv' });
    const a = document.createElement('a');
    a.download = `${formatLocus(view).replace(/[:,]/g, '_')}.csv`;
    a.href = URL.createObjectURL(blob);
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  });

  if (chromSel) {
    // The track panel is a drawer on a phone (see the 560px block in variantPlayground.css) and a
  // column everywhere else; the button only exists at that width, so this is a no-op elsewhere.
  $<HTMLButtonElement>('[data-gb-panel-toggle]')?.addEventListener('click', (e) => {
    const btn = e.currentTarget as HTMLButtonElement;
    const layout = host.querySelector('.gb-layout');
    if (!layout) return;
    const open = layout.classList.toggle('is-panel-open');
    btn.setAttribute('aria-expanded', String(open));
    host.dataset.gbPanelOpen = open ? '1' : '0';
  });

  chromSel.addEventListener('change', () => {
      const info = chromInfo(chromSel.value);
      if (info) setView({ chrom: chromSel.value, start: 0, end: info.length });
    });
  }

  regionSel?.addEventListener('change', () => {
    const v = searchLocus(regionSel.value, searchIndex, index?.chroms ?? []);
    if (v) setView(v);
    regionSel.selectedIndex = 0;
  });

  if (locusInput) {
    const go = () => {
      const v = searchLocus(locusInput.value, searchIndex, index?.chroms ?? []);
      if (!v) {
        locusInput.setAttribute('aria-invalid', 'true');
        return;
      }
      locusInput.removeAttribute('aria-invalid');
      setView(v);
    };
    locusInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });
    locusInput.addEventListener('input', () => locusInput.removeAttribute('aria-invalid'));
    $<HTMLButtonElement>('[data-gb-go]')?.addEventListener('click', go);
  }

  $<HTMLButtonElement>('[data-gb-reset]')?.addEventListener('click', () => {
    const start = searchLocus(host.dataset.gbDefault || 'chrVII:882,012-884,610', searchIndex, index?.chroms ?? []);
    if (start) setView(start);
  });

  host.addEventListener('keydown', (e) => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
    const width = view.end - view.start;
    if (e.key === 'ArrowLeft') {
      setView({ chrom: view.chrom, start: view.start - width * 0.2, end: view.end - width * 0.2 });
    } else if (e.key === 'ArrowRight') {
      setView({ chrom: view.chrom, start: view.start + width * 0.2, end: view.end + width * 0.2 });
    } else if (e.key === '+' || e.key === '=') zoom(0.5);
    else if (e.key === '-') zoom(2);
    else if (e.key === '[') {
      const r = historyBack(history);
      if (r) { history = r.history; setView(r.view, { push: false }); }
    } else if (e.key === ']') {
      const r = historyForward(history);
      if (r) { history = r.history; setView(r.view, { push: false }); }
    } else return;
    e.preventDefault();
  });

  // -------------------------------------------------------------------------------------------
  // The track panel
  // -------------------------------------------------------------------------------------------
  function buildPanel(): void {
    if (!panelBox || !index) return;
    panelBox.textContent = '';
    const group = (title: string, hint?: string) => {
      const h = document.createElement('p');
      h.className = 'gb-panel__head';
      h.textContent = title;
      panelBox.appendChild(h);
      if (hint) {
        // The heading carries a MODEL NAME, which must stay cased and unabbreviated; the
        // explanation goes on its own line rather than making the heading a three-line sentence.
        const s = document.createElement('p');
        s.className = 'gb-panel__hint';
        s.textContent = hint;
        panelBox.appendChild(s);
      }
    };
    const docsBlock = (d: LaneDocs | undefined): HTMLElement | null => {
      if (!d) return null;
      const det = document.createElement('details');
      det.className = 'gb-docs';
      const sum = document.createElement('summary');
      sum.textContent = 'what this is';
      det.appendChild(sum);
      for (const [k, v] of [
        ['Source', d.source], ['Measures', d.measures],
        ['How to read it', d.read], ['What it does not mean', d.caveat],
      ] as [string, string][]) {
        const para = document.createElement('p');
        const b = document.createElement('strong');
        b.textContent = `${k}. `;
        para.append(b, document.createTextNode(v));
        det.appendChild(para);
      }
      return det;
    };

    const row = (id: string, label: string, hint: string, extra?: HTMLElement,
                 docs?: LaneDocs) => {
      const l = document.createElement('label');
      l.className = 'gb-panel__row';
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = !!enabled.get(id);
      cb.dataset.gbToggle = id;
      cb.addEventListener('change', () => {
        enabled.set(id, cb.checked);
        writeHash();
        schedule();
      });
      const span = document.createElement('span');
      span.className = 'gb-panel__label';
      span.textContent = label;
      l.append(cb, span);
      if (hint) l.title = hint;
      if (extra) l.appendChild(extra);
      panelBox.appendChild(l);
      const d = docsBlock(docs);
      if (d) panelBox.appendChild(d);
    };

    // The presets first: they are how a reader with no map gets to a useful view in one click.
    const pbar = document.createElement('div');
    pbar.className = 'gb-panel__presets';
    const plabel = document.createElement('p');
    plabel.className = 'gb-panel__head';
    plabel.textContent = 'Views';
    panelBox.append(plabel, pbar);
    const known = new Set(availableLanes());
    for (const preset of PRESETS) {
      const lanes = preset.lanes.filter((id) => known.has(id));
      if (lanes.length < 2) continue;         // a preset whose tracks this build lacks
      // A preset that would still render but no longer mean what its label says is dropped, not
      // degraded: "attribution methods" showing one method is a worse answer than no button.
      if (preset.requires?.some((id) => !known.has(id))) continue;
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'gb-preset';
      b.textContent = preset.label;
      b.title = preset.hint;
      b.dataset.gbPreset = preset.id;
      b.addEventListener('click', () => {
        applyTracks(lanes);
        writeHash();
        schedule();
      });
      pbar.appendChild(b);
    }

    // Score tracks, grouped by which network they came from. A flat list of nine hides the one
    // thing a reader most needs to know: two of these models predict opposite quantities, and a
    // gene body is high on both for unrelated reasons.
    // Seeded in the generator's own order, so the two models sit next to each other and the
    // controls come last. Insertion order alone follows `index.tracks`, which interleaves the
    // comparative lanes between the two networks -- the one arrangement that hides the contrast.
    const byGroup = new Map<string, TrackSpec[]>(
      Object.keys(index.groupLabels ?? {}).map((g) => [g, [] as TrackSpec[]]));
    for (const t of index.tracks) {
      if (laneHidden(t.id)) continue;
      const g = t.group ?? 'other';
      if (!byGroup.has(g)) byGroup.set(g, []);
      byGroup.get(g)!.push(t);
    }
    for (const [g, list] of [...byGroup]) if (!list.length) byGroup.delete(g);
    for (const [gid, specs] of byGroup) {
      const gl = index.groupLabels?.[gid];
      group(gl?.label ?? 'Score tracks', gl?.hint);
      for (const t of specs) {
        const h = document.createElement('input');
        h.type = 'range';
        h.className = 'gb-panel__h';
        h.min = '60';
        h.max = '220';
        h.step = '10';
        h.value = String(laneHeight.get(t.id) ?? 110);
        h.dataset.gbHeight = t.id;
        h.setAttribute('aria-label', `${t.label} lane height`);
        h.addEventListener('input', () => {
          laneHeight.set(t.id, Number(h.value));
          schedule();
        });
        row(t.id, t.label, `${t.detail} — ${t.note}`, h, t.docs);
      }
    }

    group('Annotation');
    if (!laneHidden('genes')) row('genes', 'Genes', 'SGD gene models; introns are drawn as gaps');
    if (!laneHidden('sequence')) row('sequence', 'Sequence letters', 'the reference, at base zoom');
    for (const f of FEATURE_LANES) {
      if (laneHidden(f.id)) continue;
      row(f.id, f.label, f.hint, undefined, f.docs);
    }
  }

  function applyTracks(ids: string[]): void {
    for (const id of availableLanes()) enabled.set(id, ids.includes(id));
    buildPanel();
  }

  // -------------------------------------------------------------------------------------------
  // Repaints that are not navigation
  // -------------------------------------------------------------------------------------------
  /**
   * Document- and window-level listeners, removed once this controller's host leaves the DOM.
   *
   * This page is `bare`, so the host is destroyed on every navigation away and rebuilt on the way
   * back -- which means `mount` runs again and `initGenomeBrowser` installs a SECOND set of these.
   * The `dataset` guard only stops a double-bind on the *same* element; it cannot see the previous
   * controller, whose listeners keep firing into a closure holding a detached canvas.
   */
  const selfRemoving = (target: EventTarget, type: string, fn: () => void) => {
    const wrapped = () => {
      if (!host.isConnected) { target.removeEventListener(type, wrapped); return; }
      fn();
    };
    target.addEventListener(type, wrapped);
  };

  selfRemoving(document, 'khc:theme-change', () => schedule());

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
    const s = decodeViewState(window.location.hash, index?.chroms ?? []);
    if (s.tracks) applyTracks(s.tracks);
    if (s.roi !== undefined) roi = s.roi;
    if (s.view) setView(s.view, { hash: false });
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
    // chrI, chrII, ... chrXVI, chrM -- not by length, which reads chrIV, chrXV, chrVII and makes a
    // reader hunt for chrII, and not by name, which puts chrIX before chrV.
    index.chroms.sort((a, b) => chromOrder(a.name, b.name));

    if (chromSel) {
      chromSel.replaceChildren();
      for (const c of index.chroms) {
        const o = document.createElement('option');
        o.value = c.name;
        o.textContent = `${c.name} · ${formatSpan(c.length)} · ${c.genes} genes`;
        chromSel.appendChild(o);
      }
    }

    const isMinimal = host.dataset.gbMinimal === '1' || host.dataset.gbNoHash === '1';
    // A host that names its own tracks (the homepage showcase) always wins. Otherwise the default
    // set depends on how much room there is: the laptop set stacks to ~340 px of canvas, which on
    // a 664 px phone viewport pushes the track below the fold before a single base is visible.
    const narrow = (trackCanvas.clientWidth || window.innerWidth) < PHONE_W;
    host.dataset.gbNarrow = narrow ? '1' : '0';
    const initialTracks = host.dataset.gbTracks
      ? host.dataset.gbTracks.split(',').map((s) => s.trim()).filter(Boolean)
      : (narrow ? DEFAULT_ON_NARROW : DEFAULT_ON);

    for (const id of initialTracks) if (!laneHidden(id)) enabled.set(id, true);

    const hash = !isMinimal ? decodeViewState(window.location.hash, index.chroms) : { tracks: [], view: null, roi: null };
    if (hash.tracks?.length) applyTracks(hash.tracks);
    else buildPanel();
    if (hash.roi) roi = hash.roi;

    const start = hash.view
      ?? searchLocus(host.dataset.gbDefault || 'chrVII:882,012-884,610', null, index.chroms)
      ?? { chrom: index.chroms[0].name, start: 0, end: Math.min(20000, index.chroms[0].length) };
    lastW = trackCanvas.clientWidth;
    setView(start, { hash: !hash.view && !isMinimal });
    host.dataset.gbReady = '1';

    // Quick jump chips
    const allChips = host.querySelectorAll<HTMLElement>('[data-gb-chip]');
    allChips.forEach((chip) => {
      chip.addEventListener('click', () => {
        const query = chip.dataset.gbChip;
        if (query && index) {
          const target = searchLocus(query, searchIndex, index.chroms);
          if (target) {
            allChips.forEach((c) => c.classList.remove('is-active'));
            chip.classList.add('is-active');
            setView(target, { hash: !isMinimal });
          }
        }
      });
    });

    // The search index is small and every search needs it, but nothing on screen waits for it.
    void fetch(`${DATA}/search.json`)
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null)
      .then((s: SearchIndex | null) => {
        searchIndex = s;
        host.dataset.gbSearch = String(s?.genes.length ?? 0);
      });

    void fetch(`${DATA}/motifs.json`)
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null)
      .then((m: MotifFile | null) => {
        motifs = m;
        host.dataset.gbMotifs = String(Object.keys(m?.factors ?? {}).length);
      });
  })();

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
