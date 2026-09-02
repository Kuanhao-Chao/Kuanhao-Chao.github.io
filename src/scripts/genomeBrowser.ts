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
  xOfBp as xOfBpPure, bpOfX as bpOfXPure, formatLocus, formatSpan, rulerTicks,
  laneLayout, laneAt, brushRegion, featureDensity, searchLocus, chromOrder,
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

/** Below this many pixels a base, letters are unreadable and the track draws bars instead. */
const LETTER_MIN_PX = 7;

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
const padLeft = (w: number) => (w < 560 ? 34 : 62);

/** Full height of the overview strip, in bits. A locator scale, not the plot's. */
const MINI_MAX = 0.5;

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
  /** Short qualifier drawn on the lane. Empty for the one track that IS a prediction. */
  laneTag?: string;
  /** Written in `make_genome_tiles.py`, which refuses to build without all four fields. */
  docs?: LaneDocs;
}

interface IndexFile {
  genome: string;
  levels: Level[];
  tileBins: number;
  noDataByte: number;
  tracks: TrackSpec[];
  comparison?: Record<string, unknown>;
  window: Record<string, unknown>;
  chroms: (ChromInfo & {
    genes: number;
    tracks: Record<string, { scored: number; mean: number | null }>;
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
  const hoverOut = $('[data-gb-hover]');
  const panelBox = $('[data-gb-panel]');
  const tooltip = $('[data-gb-tooltip]');
  const roiBox = $('[data-gb-roi]');
  if (!trackCanvas || !miniCanvas || !chromSel || !locusInput) return;

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
  const enabled = new Map<string, boolean>();
  const laneHeight = new Map<string, number>([
    ['lm-masked', isCompact ? 90 : 118],
    ['lm-unmasked', isCompact ? 90 : 118],
    ['phastcons', isCompact ? 72 : 96],
  ]);

  const scoreTracks = (): TrackSpec[] => (index?.tracks ?? []).filter((t) => enabled.get(t.id));

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

  /** A stored byte back to its value. Byte 0 is no data, so values live in 1..255. */
  const dequant = (byte: number, lo: number, hi: number) => ((byte - 1) / 254) * (hi - lo) + lo;

  /**
   * Aggregate one track's bins under each pixel column.
   *
   * The three rows are carried separately all the way to the pixel: a column's min is the smallest
   * of its bins' minima, not the minimum of their means. Collapsing to the mean first is what makes
   * a pyramid smooth away the spikes it exists to preserve.
   */
  function sample(trackId: string, lvl: Level, inner: number, axis: [number, number]): Column[] {
    const info = chromInfo(view.chrom);
    const cols: Column[] = new Array(inner);
    const bpPerPx = (view.end - view.start) / inner;
    const tileBins = index?.tileBins ?? 65536;
    const nBins = info ? Math.ceil(info.length / lvl.binBp) : 0;
    const [lo, hi] = axis;

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
        const vlo = dequant(b0, lo, hi);
        const vhi = dequant(b1 || b0, lo, hi);
        const vme = dequant(b2 || b0, lo, hi);
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

    const lvl = index.levels[index.levels.length - 1];
    const spec = index.tracks.find((t) => enabled.get(t.id)) ?? index.tracks[0];
    const nBins = Math.ceil(info.length / lvl.binBp);
    const t = spec ? tile(`${view.chrom}/${spec.id}/L${lvl.level}/0`) : null;

    ctx.strokeStyle = rule;
    ctx.lineWidth = 1;
    ctx.strokeRect(padLeft(w) + 0.5, 4.5, inner - 1, MINIMAP_H - 13);

    if (t && spec) {
      const top = 5;
      const h = MINIMAP_H - 14;
      const full = spec.units === 'bits' ? MINI_MAX : spec.axis[1];
      ctx.fillStyle = muted;
      ctx.globalAlpha = 0.75;
      for (let x = 0; x < inner; x += 1) {
        const b0 = Math.floor((x / inner) * nBins);
        const b1 = Math.max(b0 + 1, Math.ceil(((x + 1) / inner) * nBins));
        let sum = 0; let n = 0;
        for (let b = b0; b < b1 && b < t.cols; b += 1) {
          const byte = t.rows === 1 ? t.data[b] : t.data[2 * t.cols + b];
          if (byte === 0) continue;
          sum += dequant(byte, spec.axis[0], spec.axis[1]);
          n += 1;
        }
        if (!n) continue;
        const bh = Math.min(h, (sum / n / full) * h);
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
    if ((view.end - view.start) / inner <= 1 / LETTER_MIN_PX && enabled.get('sequence')) {
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
    let geneTally: Record<string, unknown> = {};
    let letters = 0;
    const featureCounts: Record<string, number> = {};

    for (const lane of lanes) {
      if (lane.kind === 'ruler') drawRuler(ctx, lane, w, inner, col);
      else if (lane.kind === 'score') {
        const spec = index.tracks.find((t) => t.id === lane.id);
        if (spec) drawn += drawScore(ctx, lane, spec, lvl, w, inner, col);
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

    cv.dataset.gbLevel = String(lvl.binBp);
    cv.dataset.gbDrawn = String(drawn);
    cv.dataset.gbGeneTrack = JSON.stringify(geneTally);
    cv.dataset.gbTiles = String(tiles.size);
    cv.dataset.gbMode = letters > 0 ? 'letters' : 'bars';
    cv.dataset.gbLanes = JSON.stringify(lanes.map((l) => l.id));
    cv.dataset.gbScoreTracks = String(scoreTracks().length);
    cv.dataset.gbFeatures = JSON.stringify(featureCounts);
    cv.dataset.gbFeatureMode =
      (view.end - view.start) > FEATURE_DETAIL_BP ? 'density' : 'detail';
    cv.dataset.gbRoi = roi ? `${roi.start}-${roi.end}` : '';

    if (levelOut) {
      const anyFeature = lanes.some((l) => l.kind === 'features');
      levelOut.textContent = (lvl.binBp === 1
        ? (letters > 0 ? 'per base, letters' : 'per base')
        : `${lvl.binBp.toLocaleString()} bp bins · min/mean/max`)
        + (anyFeature
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
    const [lo, hi] = spec.axis;
    const h = lane.height - 12;
    const top = lane.top;
    const yOf = (v: number) => top + h - ((Math.max(lo, Math.min(hi, v)) - lo) / (hi - lo)) * h;
    const cols = sample(spec.id, lvl, inner, spec.axis);
    const seq = spec.units === 'bits' && (view.end - view.start) / inner <= 1 / LETTER_MIN_PX
      ? sequence() : null;

    // Gridlines and the axis, per lane: every score lane prints its OWN range and units, because
    // 0-2 bits and a 0-1 posterior are not the same ruler and a shared axis would say they are.
    ctx.strokeStyle = col.rule;
    ctx.setLineDash([2, 3]);
    const gridCount = 4;
    for (let g = 1; g < gridCount; g += 1) {
      const v = lo + ((hi - lo) * g) / gridCount;
      ctx.beginPath();
      ctx.moveTo(padLeft(w), Math.round(yOf(v)) + 0.5);
      ctx.lineTo(padLeft(w) + inner, Math.round(yOf(v)) + 0.5);
      ctx.stroke();
    }
    ctx.setLineDash([]);
    ctx.fillStyle = col.muted;
    ctx.font = '9px system-ui, sans-serif';
    ctx.textAlign = 'right';
    for (let g = 0; g <= gridCount; g += 2) {
      const v = lo + ((hi - lo) * g) / gridCount;
      ctx.fillText(v.toFixed(1), padLeft(w) - 5, yOf(v) + 3);
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
      for (let i = 0; i < seq.length; i += 1) {
        const b = seq[i];
        const c = cols[Math.min(cols.length - 1, Math.floor(i * bw))];
        if (!b || !c?.have) continue;
        const sy = ((Math.max(lo, Math.min(hi, c.mean)) - lo) / (hi - lo)) * h * LOGO_GLOBSCALE;
        if (sy < 0.12) continue;
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
        if (!c.have) continue;                    // no data: a GAP, never a zero-height bar
        drawn += 1;
        const yMean = yOf(c.mean);
        const yMax = yOf(c.max);
        const yMin = yOf(c.min);
        ctx.globalAlpha = 0.9;
        ctx.fillStyle = tone;
        ctx.fillRect(padLeft(w) + x, yMean, 1, top + h - yMean);
        // The maximum is a MARK, not a filled extension. Filling from the mean up to the max is the
        // BigWig convention and it inverts the reading here: a 512 bp bin almost always contains
        // one near-determined base, so the fill blankets 90% of the plot.
        if (yMax < yMean - 1) {
          ctx.globalAlpha = 0.4;
          ctx.fillRect(padLeft(w) + x, yMax, 1, 1.5);
        }
        if (yMin > yMean + 1.5) {
          ctx.globalAlpha = 0.5;
          ctx.fillStyle = col.ink;
          ctx.fillRect(padLeft(w) + x, yMin, 1, 1);
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

  /** Lane names live in the gutter, so they are drawn outside the plot-area clip. */
  function drawGeneGutter(
    ctx: CanvasRenderingContext2D, lane: Lane, w: number, col: Record<string, string>,
  ): void {
    ctx.textAlign = 'right';
    ctx.fillStyle = col.muted;
    ctx.font = '10px system-ui, sans-serif';
    ctx.fillText('genes', padLeft(w) - 5, lane.top + GENE_ROW_H / 2 + 3);
  }

  function drawFeatureGutter(
    ctx: CanvasRenderingContext2D, lane: Lane, w: number, col: Record<string, string>,
  ): void {
    ctx.textAlign = 'right';
    ctx.fillStyle = col.muted;
    ctx.font = '9px system-ui, sans-serif';
    ctx.fillText(FEATURE_LANES.find((f) => f.id === lane.id)?.short ?? lane.id,
                 padLeft(w) - 5, lane.top + lane.height - 5);
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
    const lvl = levelForBpPerPixel((view.end - view.start) / inner, index.levels);
    const bin = Math.floor(Math.floor(bp) / lvl.binBp);
    const ti = Math.floor(bin / index.tileBins);
    const t = tile(`${view.chrom}/${trackId}/L${lvl.level}/${ti}`);
    if (!t) return null;
    const c = bin - ti * index.tileBins;
    if (c < 0 || c >= t.cols) return null;
    // Byte 0 is no data, and saying so is the point of reserving it.
    const byte = t.rows === 1 ? t.data[c] : t.data[2 * t.cols + c];
    if (byte === 0) return `${spec.short}: no data (not aligned)`;
    const v = dequant(byte, spec.axis[0], spec.axis[1]).toFixed(3);
    return lvl.binBp === 1
      ? `${spec.short} ${v} ${spec.units}`
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
    tracks: ALL_LANES(index).filter((id) => enabled.get(id)),
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

  trackCanvas.addEventListener('pointerdown', (e) => {
    const w = Math.max(1, Math.round(trackCanvas.clientWidth));
    const rect = trackCanvas.getBoundingClientRect();
    const lane = laneAt(lanes, e.clientY - rect.top);
    // IGV's convention: the ruler is the selection surface and the tracks are the pan surface, so
    // neither needs a mode toggle. Shift-drag brushes anywhere, for anyone who does not know that.
    mode = (lane?.kind === 'ruler' || e.shiftKey) ? 'brush' : 'pan';
    dragX = e.clientX;
    dragStart = view.start;
    anchorBp = bpOfX(e.clientX - rect.left, w);
    brush = null;
    trackCanvas.setPointerCapture(e.pointerId);
    trackCanvas.style.cursor = mode === 'brush' ? 'ew-resize' : 'grabbing';
  });

  trackCanvas.addEventListener('pointermove', (e) => {
    const w = Math.max(1, Math.round(trackCanvas.clientWidth));
    const rect = trackCanvas.getBoundingClientRect();
    const inner = Math.max(1, w - padLeft(w) - PAD_RIGHT);
    const bpPerPx = (view.end - view.start) / inner;
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
    if (mode === 'none') return;
    const was = mode;
    mode = 'none';
    trackCanvas.style.cursor = 'grab';
    try { trackCanvas.releasePointerCapture(e.pointerId); } catch { /* already released */ }
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

  chromSel.addEventListener('change', () => {
    const info = chromInfo(chromSel.value);
    if (info) setView({ chrom: chromSel.value, start: 0, end: info.length });
  });

  regionSel?.addEventListener('change', () => {
    const v = searchLocus(regionSel.value, searchIndex, index?.chroms ?? []);
    if (v) setView(v);
    regionSel.selectedIndex = 0;
  });

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
    const group = (title: string) => {
      const h = document.createElement('p');
      h.className = 'gb-panel__head';
      h.textContent = title;
      panelBox.appendChild(h);
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

    group('Score tracks');
    for (const t of index.tracks) {
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

    group('Annotation');
    row('genes', 'Genes', 'SGD gene models; introns are drawn as gaps');
    row('sequence', 'Sequence letters', 'the reference, at base zoom');
    for (const f of FEATURE_LANES) row(f.id, f.label, f.hint, undefined, f.docs);
  }

  function applyTracks(ids: string[]): void {
    for (const id of ALL_LANES(index)) enabled.set(id, ids.includes(id));
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

    chromSel.replaceChildren();
    for (const c of index.chroms) {
      const o = document.createElement('option');
      o.value = c.name;
      o.textContent = `${c.name} · ${formatSpan(c.length)} · ${c.genes} genes`;
      chromSel.appendChild(o);
    }

    const isMinimal = host.dataset.gbMinimal === '1' || host.dataset.gbNoHash === '1';
    const initialTracks = host.dataset.gbTracks
      ? host.dataset.gbTracks.split(',').map((s) => s.trim()).filter(Boolean)
      : DEFAULT_ON;

    for (const id of initialTracks) enabled.set(id, true);

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
    host.querySelectorAll<HTMLElement>('[data-gb-chip]').forEach((chip) => {
      chip.addEventListener('click', () => {
        const query = chip.dataset.gbChip;
        if (query && index) {
          const target = searchLocus(query, searchIndex, index.chroms);
          if (target) setView(target, { hash: !isMinimal });
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
