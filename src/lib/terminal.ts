/**
 * Pure terminal engine — no DOM, no timers, no fetch, no rendering.
 *
 * Every command is a pure function of an explicit `ShellState` plus the knowledge
 * index served by `/terminal.json`, so the whole shell is unit-testable (see
 * `terminal.test.ts`). Rendering, keyboard input, the index fetch, and wall-clock
 * time live in the controller (`src/scripts/terminal.ts`); anything that needs the
 * clock takes an injected `now`, so a given input reproduces a given transcript.
 *
 * Output is a `Line[]` — never a markup string. The controller turns each line into
 * a text node (and `href` into a real anchor), which is both the house style and the
 * only safe way to echo text the visitor typed.
 */

// ------------------------------------------------------------------ types ---

/**
 * `art` is a layout tone, not just a colour: the block-glyph logo only forms solid
 * letterforms at line-height 1, so those rows opt out of the screen's normal leading.
 */
export type Tone = 'out' | 'dim' | 'accent' | 'err' | 'ok' | 'head' | 'art';

export interface Line {
  text: string;
  tone?: Tone;
  /** When set the line renders as a link. Internal paths route via ClientRouter. */
  href?: string;
  /** Rendered before `text` in the success colour — the boot log's `[  OK  ]`. */
  prefix?: string;
}

export interface FsNode {
  title: string;
  body: string;
  href?: string;
  kind: string;
}

export interface Chunk {
  path: string;
  title: string;
  href?: string;
  kind: string;
  text: string;
}

export interface TermIndex {
  generatedAt: string;
  identity: {
    name: string;
    nameZh: string;
    role: string;
    email: string;
    tagline: string;
    philosophy: string;
    bio: string;
    jobTitle: string;
    worksFor: string;
    alumniOf: string[];
    knowsAbout: string[];
    alternateNames: string[];
    socials: { key: string; label: string; href: string }[];
  };
  stats: Record<string, string | number>;
  fs: Record<string, FsNode>;
  chunks: Chunk[];
}

export type Effect =
  | { type: 'clear' }
  | { type: 'navigate'; href: string }
  | { type: 'ask'; question: string }
  | { type: 'theme'; mode: 'light' | 'dark' | 'toggle' }
  | { type: 'exit' };

export interface ExecResult {
  lines: Line[];
  effect?: Effect;
}

export interface ShellState {
  cwd: string;
  history: string[];
  /** Cursor into `history` for ↑/↓; equals history.length when composing fresh. */
  histIndex: number;
  /** `chat` mode keeps every bare line going to the bot instead of the parser. */
  chatMode: boolean;
  index: TermIndex | null;
}

export const HOME = '/home/khc';
export const USER = 'khc';
export const HOST = 'genome';

/** Illumina AI Lab start date — the shell's notional boot time for `uptime`. */
const BOOT_ISO = '2025-08-01T09:00:00Z';

export function createShell(index: TermIndex | null = null): ShellState {
  return { cwd: HOME, history: [], histIndex: 0, chatMode: false, index };
}

export const prompt = (state: ShellState) =>
  state.chatMode ? 'ask>' : `${USER}@${HOST}:${shortCwd(state.cwd)}$`;

export const shortCwd = (cwd: string) =>
  cwd === HOME ? '~' : cwd.startsWith(`${HOME}/`) ? `~${cwd.slice(HOME.length)}` : cwd;

// ----------------------------------------------------------------- parsing ---

/** Split a command line into argv, honouring single and double quotes. */
export function parseArgv(input: string): string[] {
  const argv: string[] = [];
  let cur = '';
  let quote: '"' | "'" | null = null;
  let started = false;
  for (const ch of input.trim()) {
    if (quote) {
      if (ch === quote) quote = null;
      else cur += ch;
      started = true;
    } else if (ch === '"' || ch === "'") {
      quote = ch;
      started = true;
    } else if (/\s/.test(ch)) {
      if (started) argv.push(cur);
      cur = '';
      started = false;
    } else {
      cur += ch;
      started = true;
    }
  }
  if (started) argv.push(cur);
  return argv;
}

// -------------------------------------------------------------- filesystem ---

/** Resolve `arg` against `cwd`, collapsing `.`/`..`/`~` and trailing slashes. */
export function resolvePath(cwd: string, arg?: string): string {
  if (!arg || arg === '~') return HOME;
  let base: string[];
  if (arg.startsWith('/')) base = [];
  else if (arg.startsWith('~/')) {
    base = HOME.split('/').filter(Boolean);
    arg = arg.slice(2);
  } else base = cwd.split('/').filter(Boolean);

  for (const part of arg.split('/')) {
    if (!part || part === '.') continue;
    if (part === '..') base.pop();
    else base.push(part);
  }
  return `/${base.join('/')}`;
}

const parentOf = (path: string) => path.slice(0, path.lastIndexOf('/')) || '/';
const baseOf = (path: string) => path.slice(path.lastIndexOf('/') + 1);

/** Every directory implied by the flat path map, so `fs` needs no dir entries. */
export function directories(index: TermIndex): Set<string> {
  const dirs = new Set<string>(['/', '/home', HOME]);
  for (const path of Object.keys(index.fs)) {
    let dir = parentOf(path);
    while (dir && dir !== '/' && !dirs.has(dir)) {
      dirs.add(dir);
      dir = parentOf(dir);
    }
  }
  return dirs;
}

export interface Entry {
  name: string;
  path: string;
  dir: boolean;
  title?: string;
}

export function listDir(index: TermIndex, path: string, showHidden = false): Entry[] | null {
  const dirs = directories(index);
  if (!dirs.has(path)) return null;
  const seen = new Map<string, Entry>();
  for (const dir of dirs) {
    if (dir !== path && parentOf(dir) === path) {
      seen.set(baseOf(dir), { name: baseOf(dir), path: dir, dir: true });
    }
  }
  for (const [filePath, node] of Object.entries(index.fs)) {
    if (parentOf(filePath) === path) {
      seen.set(baseOf(filePath), {
        name: baseOf(filePath),
        path: filePath,
        dir: false,
        title: node.title,
      });
    }
  }
  return [...seen.values()]
    .filter((e) => showHidden || !e.name.startsWith('.'))
    .sort((a, b) => (a.dir === b.dir ? a.name.localeCompare(b.name) : a.dir ? -1 : 1));
}

// ------------------------------------------------------------- retrieval ----

const STOPWORDS = new Set(
  ('a an and are as at be but by do does for from has have how i in is it its of on or so ' +
    'that the their there these this to was what when where which who whom why will with you your ' +
    'tell me can could would should did his him he she they them')
    .split(/\s+/)
    .filter(Boolean)
);

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9+.-]+/)
    .map((t) => t.replace(/^[.-]+|[.-]+$/g, ''))
    .filter((t) => t.length > 1 && !STOPWORDS.has(t));
}

/**
 * Vocabulary bridges for the handful of questions people actually ask a personal
 * site. "Who does he work for?" survives tokenizing as just `work`, which appears
 * in no CV entry but in plenty of news blurbs — so the literal match is the wrong
 * answer. Expansions are scored at half weight, so they steer without overpowering
 * a genuine term match.
 */
const EXPANSIONS: Record<string, string[]> = {
  work: ['illumina', 'scientist', 'experience'],
  works: ['illumina', 'scientist', 'experience'],
  working: ['illumina', 'scientist', 'experience'],
  job: ['illumina', 'scientist', 'experience'],
  employer: ['illumina', 'experience'],
  company: ['illumina', 'experience'],
  role: ['illumina', 'scientist', 'experience'],
  career: ['experience', 'education'],
  phd: ['hopkins', 'dissertation', 'education'],
  doctorate: ['hopkins', 'dissertation', 'education'],
  study: ['education', 'hopkins'],
  studied: ['education', 'hopkins'],
  school: ['education', 'hopkins'],
  university: ['education', 'hopkins'],
  advisor: ['salzberg', 'pertea', 'education'],
  email: ['contact'],
  reach: ['contact', 'email'],
  hire: ['contact', 'experience'],
  award: ['honors'],
  awards: ['honors'],
  prize: ['honors'],
};

/** Query terms with their expansions, each carrying a weight. */
function expandQuery(query: string): Map<string, number> {
  const weights = new Map<string, number>();
  for (const term of tokenize(query)) {
    weights.set(term, 1);
    for (const extra of EXPANSIONS[term] ?? []) {
      if (!weights.has(extra)) weights.set(extra, 0.5);
    }
  }
  return weights;
}

/**
 * Strip a passage down to prose worth quoting: markdown links become their label,
 * bare URLs go, and `Code:`/`DOI:`-style metadata rows drop out entirely. Without
 * this the answer to "what does LiftOn do?" is a pair of GitHub URLs, because those
 * lines genuinely do contain the query term.
 */
export function cleanProse(text: string): string {
  return text
    .split('\n')
    .map((line) =>
      line
        .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
        .replace(/https?:\/\/\S+/g, '')
        .replace(/\s{2,}/g, ' ')
        .trim()
    )
    // Drop rows that were nothing but a URL — `Code: https://…` becomes a bare
    // `Code:` label. Order matters: strip URLs first, then discard what's left, so
    // a genuinely informative `Email: …` row survives.
    .filter((line) => line && !/^[A-Za-z][A-Za-z ]{0,14}:$/.test(line))
    .join('\n');
}

interface Stats {
  df: Map<string, number>;
  tokens: string[][];
  avgLen: number;
}
const statsCache = new WeakMap<TermIndex, Stats>();

function corpusStats(index: TermIndex): Stats {
  const cached = statsCache.get(index);
  if (cached) return cached;
  const tokens = index.chunks.map((c) => tokenize(c.text));
  const df = new Map<string, number>();
  for (const list of tokens) {
    for (const term of new Set(list)) df.set(term, (df.get(term) ?? 0) + 1);
  }
  const avgLen = tokens.reduce((sum, t) => sum + t.length, 0) / Math.max(1, tokens.length);
  const stats = { df, tokens, avgLen };
  statsCache.set(index, stats);
  return stats;
}

export interface Hit {
  chunk: Chunk;
  score: number;
}

/**
 * Per-kind ranking weight. News items are one-line blurbs, and BM25's length
 * normalization would otherwise let "LiftOn v1.0.0 is released" outrank the LiftOn
 * page itself for the query "what does LiftOn do". News stays findable, just not
 * preferred over the canonical entry.
 */
const KIND_WEIGHT: Record<string, number> = { news: 0.55 };

/** BM25 over the chunk corpus, with a title-match boost. Deterministic. */
export function search(index: TermIndex, query: string, limit = 5): Hit[] {
  const weights = expandQuery(query);
  if (!weights.size) return [];
  const { df, tokens, avgLen } = corpusStats(index);
  const N = index.chunks.length;
  const k1 = 1.5;
  const b = 0.75;

  const hits: Hit[] = index.chunks.map((chunk, i) => {
    const docTokens = tokens[i];
    const len = docTokens.length || 1;
    const titleTokens = new Set(tokenize(chunk.title));
    let score = 0;
    for (const [term, weight] of weights) {
      const tf = docTokens.reduce((n, t) => (t === term ? n + 1 : n), 0);
      if (!tf) continue;
      const idf = Math.log(1 + (N - (df.get(term) ?? 0) + 0.5) / ((df.get(term) ?? 0) + 0.5));
      score += weight * idf * ((tf * (k1 + 1)) / (tf + k1 * (1 - b + (b * len) / avgLen)));
      if (titleTokens.has(term)) score += weight * idf * 0.8;
    }
    return { chunk, score: score * (KIND_WEIGHT[chunk.kind] ?? 1) };
  });

  return hits
    .filter((h) => h.score > 0)
    .sort((a, b2) => b2.score - a.score || a.chunk.path.localeCompare(b2.chunk.path))
    .slice(0, limit);
}

// --------------------------------------------------------------- banners ----

const LOGO = [
  '  ██╗  ██╗██╗  ██╗ ██████╗',
  '  ██║ ██╔╝██║  ██║██╔════╝',
  '  █████╔╝ ███████║██║',
  '  ██╔═██╗ ██╔══██║██║',
  '  ██║  ██╗██║  ██║╚██████╗',
  '  ╚═╝  ╚═╝╚═╝  ╚═╝ ╚═════╝',
];

const stamp = (now: Date) =>
  now.toUTCString().replace('GMT', 'UTC');

/**
 * `narrow` stacks the banner instead of setting it beside the logo. The wide form is
 * ~76 columns, which a phone can only pan across — and a login banner the visitor has
 * to drag sideways to read is a bad first frame. The controller decides by viewport.
 */
/**
 * Hard-wrap prose to `width` columns. The screen is `white-space: pre` so the model
 * can't be trusted to produce terminal-shaped lines — long paragraphs would run off
 * the right edge instead of reflowing. Existing newlines are preserved; a word
 * longer than the column budget is left intact rather than broken mid-token.
 */
export function wrapText(text: string, width = 76): string[] {
  const out: string[] = [];
  for (const paragraph of text.split('\n')) {
    if (!paragraph.trim()) {
      out.push('');
      continue;
    }
    let line = '';
    for (const word of paragraph.trim().split(/\s+/)) {
      if (!line) line = word;
      else if (line.length + 1 + word.length <= width) line += ` ${word}`;
      else {
        out.push(line);
        line = word;
      }
    }
    if (line) out.push(line);
  }
  return out;
}

/** Qwen3 emits a reasoning block unless suppressed; never show it to the visitor. */
export function stripThinking(text: string): string {
  return text
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/<think>[\s\S]*$/i, '')
    .trim();
}

/**
 * The sentences in `text` that actually address `query`, in their original order.
 *
 * This is what separates an answer from a lookup: the top passage is usually right
 * but its first lines are rarely the part you asked about. Scoring is overlap with
 * the query's terms, lightly normalised by length so a long sentence doesn't win on
 * volume alone; ties keep document order so the result still reads as prose.
 */
export function pickSentences(text: string, query: string, n = 3): string[] {
  const terms = new Set(expandQuery(query).keys());
  if (!terms.size) return [];

  const sentences = cleanProse(text)
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.replace(/\s+/g, ' ').trim())
    // Three words is the floor for something that reads as a statement rather than
    // a leftover label; anything shorter is a heading, not an answer.
    .filter((s) => s.length > 12 && s.split(/\s+/).length >= 3);

  const scored = sentences.map((sentence, order) => {
    const words = tokenize(sentence);
    const hits = words.filter((w) => terms.has(w)).length;
    return { sentence, order, score: hits === 0 ? 0 : hits / Math.sqrt(words.length || 1) };
  });

  return scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score || a.order - b.order)
    .slice(0, n)
    .sort((a, b) => a.order - b.order)
    .map((s) => s.sentence);
}

/** The retrieved passages sent to the model as CONTEXT. */
export function buildContext(index: TermIndex, question: string, limit = 6): string {
  return search(index, question, limit)
    .map(({ chunk }) => `## ${chunk.title} (${chunk.path.replace(HOME, '~')})\n${chunk.text}`)
    .join('\n\n');
}

// ------------------------------------------------------------- DNA helix ----

/** Base pairs cycled down the helix, so the rungs read as real complements. */
const PAIRS: readonly (readonly [string, string])[] = [
  ['A', 'T'],
  ['G', 'C'],
  ['T', 'A'],
  ['C', 'G'],
];

/**
 * One frame of a rotating DNA double helix, as `rows` lines of exactly `width`
 * characters.
 *
 * The two strands are a sine and its antiphase, so they cross twice per turn; the
 * sign of the cosine says which one is nearer the viewer, and the near strand takes
 * the uppercase base while the far one takes lowercase. That single trick is what
 * makes a flat monospace grid read as depth. Where the strands meet the rung
 * collapses to a crossing glyph rather than drawing a zero-length bond.
 *
 * Pure and total: same phase in, same frame out, always `rows × width`.
 */
export function dnaFrame(phase: number, rows = 6, width = 11): string[] {
  const cx = (width - 1) / 2;
  const amp = cx - 1;
  const out: string[] = [];
  for (let r = 0; r < rows; r++) {
    const t = r * 0.62 + phase;
    const sin = Math.sin(t);
    const x1 = Math.round(cx + amp * sin);
    const x2 = Math.round(cx - amp * sin);
    const [a, b] = PAIRS[r % PAIRS.length];
    const nearIsFirst = Math.cos(t) >= 0;
    const line = new Array<string>(width).fill(' ');
    const lo = Math.min(x1, x2);
    const hi = Math.max(x1, x2);
    if (hi - lo <= 1) {
      line[Math.round(cx)] = '╳';
    } else {
      for (let x = lo + 1; x < hi; x++) line[x] = '─';
      line[x1] = nearIsFirst ? a : a.toLowerCase();
      line[x2] = nearIsFirst ? b.toLowerCase() : b;
    }
    out.push(line.join(''));
  }
  return out;
}

// ------------------------------------------------------------ boot pipeline --

/**
 * One step of the boot's assembly-then-annotation pipeline.
 *
 * The stages are a real workflow — reads → k-mers → contigs → scaffolds → polish,
 * then mask → lift over → refine splice sites → index — and steps 7 and 8 run the
 * tools this site is about. Deliberately *not* a census of publications and talks:
 * the login screen describes the work rather than counting it. `neofetch` still
 * prints the counts for anyone who asks for them.
 *
 * The figures are plausible for a human HiFi assembly and none of them is a claim
 * about Kuan-Hao; they are set dressing for a fictional `khcOS` boot.
 */
export interface Stage {
  key: string;
  label: string;
  detail: string;
  /** Shorter detail for phones, where the row has ~20 fewer columns to play with. */
  short: string;
}

const STAGES: readonly Stage[] = [
  { key: 'reads', label: 'reads', detail: '1.4 M HiFi · N50 18.6 kb', short: '1.4 M HiFi' },
  { key: 'kmers', label: 'k-mers', detail: 'Meryl · k=31', short: 'k=31' },
  { key: 'assemble', label: 'assemble', detail: 'hifiasm · 412 contigs', short: 'hifiasm' },
  { key: 'scaffold', label: 'scaffold', detail: 'Hi-C · YaHS · 24 chr', short: 'Hi-C · YaHS' },
  { key: 'polish', label: 'polish', detail: 'Merqury · QV 52.4', short: 'QV 52.4' },
  { key: 'mask', label: 'repeat-mask', detail: 'RepeatMasker · 54.1 %', short: '54.1 %' },
  { key: 'lift', label: 'lift-over', detail: 'LiftOn · GRCh38 → CHM13', short: 'LiftOn' },
  { key: 'splice', label: 'splice-refine', detail: 'Splam + OpenSpliceAI', short: 'Splam' },
  { key: 'index', label: 'index', detail: 'knowledge base · ~/', short: '~/' },
];

export const pipelineStages = (): readonly Stage[] => STAGES;

/** Widest label, so every bar starts in the same column. */
const LABEL_W = Math.max(...STAGES.map((s) => s.label.length));

/**
 * A `width`-cell bar filled to `fraction`, always exactly `width` characters.
 *
 * `█` and `░` are both Block Elements and the KHC logo already proves this font
 * stack renders that block at one cell, so the columns stay square.
 */
export function progressBar(fraction: number, width = 20): string {
  const clamped = Math.max(0, Math.min(1, Number.isFinite(fraction) ? fraction : 0));
  const filled = Math.round(clamped * width);
  return '█'.repeat(filled) + '░'.repeat(width - filled);
}

/** One pipeline row. The detail appears only once the stage has finished. */
export function stageLine(
  stage: Stage,
  i: number,
  total: number,
  fraction: number,
  narrow = false
): string {
  const bar = progressBar(fraction, narrow ? 10 : 20);
  const detail = fraction >= 1 ? (narrow ? stage.short : stage.detail) : '';
  const label = stage.label.padEnd(narrow ? stage.label.length : LABEL_W);
  return `  [${i + 1}/${total}] ${label}  ${bar}${detail ? `  ${detail}` : ''}`;
}

/** Header, then one line per stage, then the completion report. */
export function bootHeader(): Line[] {
  return [
    { text: 'khcOS 1.0.0 (GNU/Linux 6.6.0-genome-amd64)', tone: 'dim' },
    { text: 'genome assembly + annotation · GRCh38.p14 → T2T-CHM13v2.0', tone: 'dim' },
    { text: '' },
  ];
}

export function bootFooter(): Line[] {
  return [
    { text: '' },
    { prefix: '[  OK  ]', text: ' assembly · 3.1 Gb in 24 scaffolds · QV 52.4' },
    { prefix: '[  OK  ]', text: ' annotation · BUSCO 98.7 % · LiftOn + Splam' },
    { prefix: '[  OK  ]', text: ' knowledge base mounted at /home/khc' },
    { text: 'starting ksh …', tone: 'dim' },
    { text: '' },
  ];
}

/**
 * The whole boot log in its finished state — what reduced-motion visitors see, and
 * what the tests assert against. The controller animates the same rows.
 */
export function bootLines(narrow = false): Line[] {
  return [
    ...bootHeader(),
    ...STAGES.map((stage, i) => ({ text: stageLine(stage, i, STAGES.length, 1, narrow) })),
    ...bootFooter(),
  ];
}

/**
 * The login banner: logo, who you have reached, and how to start.
 *
 * It deliberately does **not** tabulate publications, talks, software and review
 * venues. A login screen that recites someone's counts at you reads as a CV in a
 * costume; `neofetch` prints them on request, which is where a stat block belongs.
 */
export function motd(index: TermIndex, now: Date, width: number | boolean = false): Line[] {
  const narrow = typeof width === 'number' ? width < 70 : width;
  const id = index.identity;
  const side = [
    `khchao.com  ·  ${id.name} (${id.nameZh})`,
    id.role,
    `Ph.D. Computer Science, ${id.alumniOf[0]}`,
    '',
    'khcOS 1.0.0 (GNU/Linux 6.6.0-genome-amd64)',
    'Reference: T2T-CHM13v2.0 · GRCh38.p14',
  ];

  const lines: Line[] = [
    { text: `Last login: ${stamp(now)} from 127.0.0.1`, tone: 'dim' },
    { text: '' },
  ];

  if (narrow) {
    for (const art of LOGO) lines.push({ text: art, tone: 'art' });
    lines.push({ text: '' });
    for (const text of side.filter(Boolean)) lines.push({ text: `  ${text}`, tone: 'head' });
  } else {
    LOGO.forEach((art, i) => {
      lines.push({ text: `${art.padEnd(30)}${side[i] ?? ''}`, tone: 'art' });
    });
  }

  lines.push(
    { text: '' },
    { text: ' Type `help` for the command list, `ask <question>` to talk to the bot,', tone: 'dim' },
    { text: ' `neofetch` for the system summary, or `theme` to change the lights.', tone: 'dim' },
    { text: '' }
  );
  return lines;
}

// -------------------------------------------------------------- commands ----

interface Cmd {
  summary: string;
  usage?: string;
  needsIndex?: boolean;
  run: (ctx: Ctx) => ExecResult | Line[];
}

interface Ctx {
  state: ShellState;
  index: TermIndex;
  argv: string[];
  args: string[];
  flags: Set<string>;
  now: Date;
  /** Measured monospace columns available in the terminal pane. */
  columns: number;
  /** Viewport is too narrow for two-column output; stack instead. */
  narrow: boolean;
}

const err = (text: string): Line[] => [{ text, tone: 'err' }];
const ok = (text: string): Line[] => [{ text, tone: 'ok' }];
const bodyLines = (body: string, tone?: Tone): Line[] =>
  body.split('\n').map((text) => ({ text, tone }));

/**
 * Read a known file defensively. The shortcut commands (`about`, `cv`, …) point at
 * paths the endpoint always emits, but a shell that throws is far worse than one
 * that prints a diagnostic — so a missing node degrades instead of crashing.
 */
const fileLines = (index: TermIndex, path: string, tone?: Tone): Line[] => {
  const node = index.fs[path];
  return node ? bodyLines(node.body, tone) : err(`${baseOf(path)}: not available in this index`);
};

function hitLines(hits: Hit[]): Line[] {
  if (!hits.length) return [{ text: 'No matches.', tone: 'dim' }];
  const lines: Line[] = [];
  for (const { chunk } of hits) {
    lines.push({ text: chunk.path.replace(HOME, '~'), tone: 'accent' });
    lines.push({ text: `    ${chunk.title}` });
    if (chunk.href) lines.push({ text: `    open ${chunk.href}`, tone: 'dim', href: chunk.href });
  }
  return lines;
}

/**
 * The offline brain: a retrieval answer assembled entirely in the browser.
 *
 * Phase 1 uses this for every `ask`. Phase 2 calls Claude instead and falls back
 * here whenever the endpoint is unreachable, so `ask` never dead-ends. It reads
 * like `apropos` — honest about being a lookup rather than pretending to converse.
 */
export function offlineAnswer(index: TermIndex, question: string): Line[] {
  const hits = search(index, question, 4);
  if (!hits.length) return noAnswer(index, question);

  const terms = new Set(tokenize(question));
  const lines: Line[] = [];
  const cited: Hit[] = [];
  // A paper, its talk and its news item often share a title verbatim; quoting the
  // same sentence three times reads as a bug, not as corroboration.
  const said = new Set<string>();

  // Draw from the top few passages rather than dumping one, so a question that
  // spans a tool and its paper gets both halves of the answer.
  for (const hit of hits.slice(0, 3)) {
    // Only read the file when the chunk *is* that file: several chunks (news items)
    // share one digest path, and printing the digest would answer a different question.
    const node = hit.chunk.kind === 'file' ? index.fs[hit.chunk.path] : undefined;
    const source = node?.body ?? hit.chunk.text;
    const lead = cited.length === 0;
    let picked = pickSentences(source, question, lead ? 3 : 1);

    // Publications and talks are metadata cards, not prose — their only sentence is
    // the title, which alone is a thin answer. Show the card instead.
    if (lead && node && picked.length < 2) {
      picked = cleanProse(node.body).split('\n').filter(Boolean).slice(0, 4);
    }
    picked = picked.filter((s) => {
      const key = s.toLowerCase().replace(/\W+/g, ' ').trim();
      if (said.has(key)) return false;
      said.add(key);
      return true;
    });
    if (!picked.length) continue;

    cited.push(hit);
    for (const sentence of wrapText(picked.join(lead && node ? '\n' : ' '))) {
      lines.push({ text: sentence });
    }
    lines.push({ text: '' });
  }

  // Every passage scored but none produced a sentence worth quoting — fall back to
  // the top passage's own text so the answer is never empty.
  if (!lines.length) {
    const fallback = hits[0];
    cited.push(fallback);
    for (const line of wrapText(fallback.chunk.text)) lines.push({ text: line });
    lines.push({ text: '' });
  }

  lines.push({ text: 'sources', tone: 'dim' });
  for (const { chunk } of cited) {
    // Titles run long; the path is the useful half, so clip the title to keep the
    // whole row inside the terminal's 76-column budget.
    const path = chunk.path.replace(HOME, '~');
    const room = 74 - path.length - 5;
    const title = chunk.title.length > room ? `${chunk.title.slice(0, room - 1)}…` : chunk.title;
    lines.push({
      text: `  ${title}  ·  ${path}`,
      tone: 'dim',
      ...(chunk.href ? { href: chunk.href } : {}),
    });
  }
  if (terms.size) {
    lines.push({ text: '', tone: 'dim' });
    lines.push({ text: `  grep ${[...terms].slice(0, 2).join(' ')}   for every match`, tone: 'dim' });
  }
  return lines;
}

/** Nothing scored. Point at the nearest real topic rather than shrugging. */
function noAnswer(index: TermIndex, question: string): Line[] {
  const asked = new Set(tokenize(question));
  const vocabulary = [...index.identity.knowsAbout, ...index.identity.alternateNames];
  const near = vocabulary.find((topic) => tokenize(topic).some((t) => asked.has(t)));
  return [
    { text: "Nothing in the index matches that.", tone: 'dim' },
    ...(near
      ? [{ text: `Closest topic I do have: ${near} — try \`ask ${near.toLowerCase()}\`.`, tone: 'dim' as Tone }]
      : [{ text: 'Try `ls ~` to see what is here, or `ask splice sites`.', tone: 'dim' as Tone }]),
  ];
}

export const COMMANDS: Record<string, Cmd> = {
  help: {
    summary: 'list available commands',
    run: () => {
      const groups: [string, string[]][] = [
        ['filesystem', ['ls', 'cd', 'pwd', 'cat', 'tree', 'find', 'grep']],
        ['about me', ['whoami', 'about', 'man', 'which', 'contact', 'cv', 'news']],
        ['system', ['uname', 'uptime', 'date', 'neofetch', 'theme', 'history', 'clear', 'echo']],
        ['navigate', ['open', 'exit']],
        ['chatbot', ['ask', 'chat']],
        ['genomics', ['blastn', 'samtools', 'splice']],
      ];
      const lines: Line[] = [
        { text: 'khcOS shell — a navigable CLI over everything on this site.', tone: 'head' },
        { text: '' },
      ];
      for (const [group, names] of groups) {
        lines.push({ text: `  ${group}`, tone: 'accent' });
        for (const name of names) {
          lines.push({ text: `    ${name.padEnd(10)} ${COMMANDS[name]?.summary ?? ''}` });
        }
        lines.push({ text: '' });
      }
      lines.push(
        { text: '  Tab completes, ↑/↓ walks history, Ctrl-L clears, Ctrl-C abandons a line.', tone: 'dim' },
        { text: '  Try: `ask what does LiftOn do?`  ·  `cat ~/about.txt`  ·  `neofetch`', tone: 'dim' }
      );
      return lines;
    },
  },

  ls: {
    summary: 'list directory contents',
    usage: 'ls [-l] [-a] [path]',
    needsIndex: true,
    run: ({ index, state, args, flags, columns }) => {
      // `.`, not undefined: a bare `ls` lists the *working* directory, whereas
      // resolvePath treats a missing argument as "go home" (which is what `cd` wants).
      const path = resolvePath(state.cwd, args[0] ?? '.');
      const entries = listDir(index, path, flags.has('a'));
      if (!entries) {
        return index.fs[path]
          ? [{ text: baseOf(path) }]
          : err(`ls: cannot access '${args[0] ?? path}': No such file or directory`);
      }
      if (!flags.has('l')) {
        if (columns < 60) return entries.map((e) => ({ text: e.dir ? `${e.name}/` : e.name }));
        return [{ text: entries.map((e) => (e.dir ? `${e.name}/` : e.name)).join('   ') }];
      }
      if (columns < 72) {
        return entries.flatMap((e) => [
          {
            text: `${e.dir ? 'd' : '-'}  ${USER}  ${e.dir ? '-' : String(index.fs[e.path].body.length).padStart(6)}  ${e.dir ? `${e.name}/` : e.name}`,
          },
          ...(e.title && !e.dir ? [{ text: `    — ${e.title}`, tone: 'dim' as Tone }] : []),
        ]);
      }
      return entries.map((e) => ({
        text: `${e.dir ? 'drwxr-xr-x' : '-rw-r--r--'}  ${USER}  ${(e.dir ? '-' : String(index.fs[e.path].body.length)).padStart(6)}  ${e.dir ? `${e.name}/` : e.name}${e.title && !e.dir ? `  — ${e.title}` : ''}`,
      }));
    },
  },

  cd: {
    summary: 'change the working directory',
    usage: 'cd [path]',
    needsIndex: true,
    run: ({ index, state, args }) => {
      const path = resolvePath(state.cwd, args[0]);
      if (!directories(index).has(path)) {
        return err(`cd: ${args[0] ?? path}: No such file or directory`);
      }
      state.cwd = path;
      return [];
    },
  },

  pwd: { summary: 'print the working directory', run: ({ state }) => [{ text: state.cwd }] },

  cat: {
    summary: 'print a file',
    usage: 'cat <file>',
    needsIndex: true,
    run: ({ index, state, args }) => {
      if (!args.length) return err('cat: missing operand');
      const lines: Line[] = [];
      for (const arg of args) {
        const path = resolvePath(state.cwd, arg);
        const node = index.fs[path];
        if (!node) {
          lines.push(...err(`cat: ${arg}: No such file or directory`));
          continue;
        }
        lines.push(...bodyLines(node.body));
        if (node.href) {
          lines.push({ text: '' }, { text: `→ ${node.href}`, tone: 'accent', href: node.href });
        }
      }
      return lines;
    },
  },

  tree: {
    summary: 'show the directory tree',
    needsIndex: true,
    run: ({ index, state, args }) => {
      const root = resolvePath(state.cwd, args[0] ?? '.');
      if (!directories(index).has(root)) return err(`tree: ${args[0] ?? root}: Not a directory`);
      const lines: Line[] = [{ text: shortCwd(root), tone: 'accent' }];
      let files = 0;
      let dirs = 0;
      const walk = (dir: string, prefix: string) => {
        const entries = listDir(index, dir) ?? [];
        entries.forEach((e, i) => {
          const last = i === entries.length - 1;
          lines.push({ text: `${prefix}${last ? '└── ' : '├── '}${e.dir ? `${e.name}/` : e.name}` });
          if (e.dir) {
            dirs++;
            walk(e.path, `${prefix}${last ? '    ' : '│   '}`);
          } else files++;
        });
      };
      walk(root, '');
      lines.push({ text: '' }, { text: `${dirs} directories, ${files} files`, tone: 'dim' });
      return lines;
    },
  },

  find: {
    summary: 'find files whose name matches',
    usage: 'find <pattern>',
    needsIndex: true,
    run: ({ index, args }) => {
      if (!args.length) return err('find: missing pattern');
      const needle = args.join(' ').toLowerCase();
      const found = Object.keys(index.fs)
        .filter((p) => p.toLowerCase().includes(needle))
        .sort();
      return found.length
        ? found.map((p) => ({ text: p.replace(HOME, '~') }))
        : [{ text: 'No files matched.', tone: 'dim' }];
    },
  },

  grep: {
    summary: 'search the corpus for a pattern',
    usage: 'grep <pattern>',
    needsIndex: true,
    run: ({ index, args }) => {
      if (!args.length) return err('grep: missing pattern');
      return hitLines(search(index, args.join(' '), 8));
    },
  },

  whoami: {
    summary: 'print the current user',
    needsIndex: true,
    run: ({ index }) => [
      { text: USER },
      { text: `${index.identity.name} (${index.identity.nameZh}) — ${index.identity.role}`, tone: 'dim' },
    ],
  },

  about: {
    summary: 'a short biography',
    needsIndex: true,
    run: ({ index }) => fileLines(index, `${HOME}/about.txt`),
  },

  contact: {
    summary: 'how to reach me',
    needsIndex: true,
    run: ({ index }) => fileLines(index, `${HOME}/contact.txt`),
  },

  news: {
    summary: 'recent updates',
    needsIndex: true,
    run: ({ index }) => [
      ...fileLines(index, `${HOME}/news.txt`),
      { text: '' },
      { text: '→ /news/', tone: 'accent', href: '/news/' },
    ],
  },

  cv: {
    summary: 'experience, education, honors',
    needsIndex: true,
    run: ({ index }) => {
      const lines: Line[] = [];
      for (const name of ['experience', 'education', 'honors']) {
        const node = index.fs[`${HOME}/cv/${name}.txt`];
        if (!node) continue;
        lines.push({ text: node.title.toUpperCase(), tone: 'accent' }, ...bodyLines(node.body), { text: '' });
      }
      lines.push({ text: '→ /cv/ for the full PDF', tone: 'accent', href: '/cv/' });
      return lines;
    },
  },

  man: {
    summary: 'manual page for a topic',
    usage: 'man <topic>',
    needsIndex: true,
    run: ({ index, args }) => {
      if (!args.length) return err('What manual page do you want? Try `man khc`.');
      const topic = args.join(' ').toLowerCase();
      if (topic === 'khc' || topic === 'kuan-hao' || topic === 'chao') {
        const id = index.identity;
        return [
          { text: 'KHC(1)                      khcOS Manual                      KHC(1)', tone: 'dim' },
          { text: '' },
          { text: 'NAME', tone: 'accent' },
          { text: `    ${id.name} — ${id.jobTitle}, ${id.worksFor}` },
          { text: '' },
          { text: 'SYNOPSIS', tone: 'accent' },
          { text: `    ${id.tagline}` },
          { text: '' },
          { text: 'DESCRIPTION', tone: 'accent' },
          ...bodyLines(`    ${id.bio}`.replace(/(.{86}) /g, '$1\n    ')),
          { text: '' },
          { text: 'SEE ALSO', tone: 'accent' },
          { text: `    ${id.knowsAbout.join(', ')}` },
        ];
      }
      const hits = search(index, topic, 1);
      if (!hits.length) return err(`No manual entry for ${topic}`);
      const node = index.fs[hits[0].chunk.path];
      return node
        ? [
            { text: `${hits[0].chunk.title.toUpperCase()}`, tone: 'accent' },
            { text: '' },
            ...bodyLines(node.body),
          ]
        : hitLines(hits);
    },
  },

  which: {
    summary: 'locate a software tool',
    usage: 'which <tool>',
    needsIndex: true,
    run: ({ index, args }) => {
      if (!args.length) return err('which: missing operand');
      const needle = args[0].toLowerCase();
      const path = Object.keys(index.fs).find(
        (p) => p.startsWith(`${HOME}/software/`) && baseOf(p).slice(0, -4) === needle
      );
      if (!path) return err(`which: no ${args[0]} in (~/software)`);
      const node = index.fs[path];
      return [
        { text: path.replace(HOME, '~') },
        ...bodyLines(node.body, 'dim'),
        ...(node.href ? [{ text: `→ ${node.href}`, tone: 'accent' as Tone, href: node.href }] : []),
      ];
    },
  },

  uname: {
    summary: 'print system information',
    usage: 'uname [-a]',
    run: ({ flags }) =>
      flags.has('a')
        ? [{ text: 'khcOS 1.0.0 genome 6.6.0-genome-amd64 #1 SMP T2T-CHM13v2.0 x86_64 GNU/Linux' }]
        : [{ text: 'khcOS' }],
  },

  uptime: {
    summary: 'how long this shell has been running',
    run: ({ now }) => {
      const days = Math.floor((now.getTime() - Date.parse(BOOT_ISO)) / 86_400_000);
      const time = now.toISOString().slice(11, 19);
      return [
        { text: ` ${time} up ${days} days,  1 user,  load average: 0.42, 0.71, 1.03` },
        { text: ' (booted the day the Illumina AI Lab job started)', tone: 'dim' },
      ];
    },
  },

  date: { summary: 'print the current date', run: ({ now }) => [{ text: stamp(now) }] },

  /**
   * The shell's own way to reach the site's light/dark switch. `/terminal/` renders
   * through `BaseLayout`'s `bare` mode, which drops the header and with it the theme
   * toggle — so without this the full-screen shell would be the one page on the site
   * you cannot change the lights from. Returning an effect keeps the engine pure; the
   * controller is what touches `window.__khcTheme`.
   */
  theme: {
    summary: 'switch between the light and dark theme',
    usage: 'theme [light|dark]',
    run: ({ args }) => {
      const mode = (args[0] ?? '').toLowerCase();
      if (!mode) return { lines: [], effect: { type: 'theme', mode: 'toggle' } };
      if (mode === 'light' || mode === 'dark') {
        return { lines: [], effect: { type: 'theme', mode } };
      }
      return [{ text: `theme: no such theme: ${args[0]} (try light or dark)`, tone: 'err' }];
    },
  },

  echo: { summary: 'write arguments to output', run: ({ args }) => [{ text: args.join(' ') }] },

  history: {
    summary: 'show command history',
    run: ({ state }) =>
      state.history.length
        ? state.history.map((cmd, i) => ({ text: `${String(i + 1).padStart(4)}  ${cmd}` }))
        : [{ text: 'No history yet.', tone: 'dim' }],
  },

  clear: { summary: 'clear the screen', run: () => ({ lines: [], effect: { type: 'clear' } }) },

  neofetch: {
    summary: 'system summary with the logo',
    needsIndex: true,
    run: ({ index, now, narrow }) => {
      const id = index.identity;
      const s = index.stats;
      const info = [
        `${USER}@${HOST}`,
        '─────────────────────────',
        `OS:        khcOS 1.0.0 x86_64`,
        `Host:      khchao.com`,
        `Kernel:    6.6.0-genome-amd64`,
        `Uptime:    ${Math.floor((now.getTime() - Date.parse(BOOT_ISO)) / 86_400_000)} days`,
        `Shell:     ksh (khc shell)`,
        `Role:      ${id.jobTitle}, ${id.worksFor}`,
        `Papers:    ${s.publications}`,
        `Talks:     ${s.talks}`,
        `Software:  ${s.software}`,
        `Reference: T2T-CHM13v2.0`,
      ];
      const lines: Line[] = [];
      if (narrow) {
        for (const art of LOGO) lines.push({ text: art, tone: 'art' });
        lines.push({ text: '' });
        for (const text of info) lines.push({ text });
        return lines;
      }
      const height = Math.max(LOGO.length, info.length);
      for (let i = 0; i < height; i++) {
        lines.push({
          text: `${(LOGO[i] ?? '').padEnd(30)}${info[i] ?? ''}`,
          tone: i < LOGO.length ? 'art' : 'out',
        });
      }
      return lines;
    },
  },

  open: {
    summary: 'open a page on the site',
    usage: 'open <path|file>',
    needsIndex: true,
    run: ({ index, state, args }) => {
      if (!args.length) return err('open: missing operand');
      const arg = args[0];
      const node = index.fs[resolvePath(state.cwd, arg)];
      const href = node?.href ?? (arg.startsWith('/') ? arg : null);
      if (!href) return err(`open: ${arg}: nothing to open`);
      return { lines: [{ text: `Opening ${href} …`, tone: 'dim' }], effect: { type: 'navigate', href } };
    },
  },

  exit: {
    summary: 'leave the shell',
    run: ({ state }) => {
      if (state.chatMode) {
        state.chatMode = false;
        return ok('Left chat mode.');
      }
      return { lines: [{ text: 'logout', tone: 'dim' }], effect: { type: 'exit' } };
    },
  },

  ask: {
    summary: 'ask the bot anything about me',
    usage: 'ask <question>',
    needsIndex: true,
    run: ({ args }) => {
      const question = args.join(' ').trim();
      if (!question) return err('ask: what would you like to know? e.g. `ask what is LiftOn?`');
      return { lines: [], effect: { type: 'ask', question } };
    },
  },

  chat: {
    summary: 'enter interactive chat mode',
    needsIndex: true,
    run: ({ state }) => {
      state.chatMode = true;
      return [
        { text: 'Chat mode. Every line goes to the bot; `exit` returns to the shell.', tone: 'ok' },
      ];
    },
  },

  blastn: {
    summary: 'align a query against the corpus',
    usage: 'blastn <query>',
    needsIndex: true,
    run: ({ index, args, columns }) => {
      const query = args.join(' ').trim();
      if (!query) return err('blastn: missing query');
      const hits = search(index, query, 6);
      const lines: Line[] = [
        { text: 'BLASTN 2.16.0+', tone: 'dim' },
        { text: '' },
        { text: `Query= ${query}` },
        { text: `Length=${query.length}` },
        { text: '' },
      ];
      if (!hits.length) {
        lines.push({ text: '***** No hits found *****', tone: 'dim' });
        return lines;
      }
      if (columns >= 72) {
        lines.push(
          { text: '                                                        Score     E' },
          { text: 'Sequences producing significant alignments:             (Bits)  Value' },
          { text: '' }
        );
      } else {
        lines.push({ text: 'Sequences producing significant alignments:', tone: 'dim' }, { text: '' });
      }
      const top = hits[0].score || 1;
      for (const { chunk, score } of hits) {
        const bits = Math.round(60 + (score / top) * 380);
        const evalue = (1e-4 * Math.exp(-score)).toExponential(0).replace('e-', 'e-');
        if (columns < 72) {
          lines.push(
            { text: `  ${chunk.path.replace(HOME, '~')}`, tone: 'accent', href: chunk.href },
            { text: `    Score ${bits} · E ${evalue}`, tone: 'dim' }
          );
        } else {
          const label = `  ${chunk.path.replace(HOME, '~')}`.slice(0, 54).padEnd(54);
          lines.push({ text: `${label}${String(bits).padStart(6)}  ${evalue}`, href: chunk.href });
        }
      }
      return lines;
    },
  },

  samtools: {
    summary: 'flagstat over the site corpus',
    usage: 'samtools flagstat',
    needsIndex: true,
    run: ({ index, args }) => {
      if (args[0] && args[0] !== 'flagstat') return err(`samtools: unrecognized command '${args[0]}'`);
      const s = index.stats;
      const total = index.chunks.length;
      return [
        { text: `${total} + 0 in total (QC-passed reads + QC-failed reads)` },
        { text: `${s.publications} + 0 primary` },
        { text: `${s.software} + 0 supplementary` },
        { text: `${total} + 0 mapped (100.00% : N/A)` },
        { text: `${s.talks} + 0 paired in sequencing` },
        { text: `${s.posts} + 0 properly paired (100.00% : N/A)` },
        { text: '0 + 0 singletons (0.00% : N/A)', tone: 'dim' },
      ];
    },
  },

  splice: {
    summary: 'score a sequence for splice sites',
    usage: 'splice <ACGT…>',
    run: ({ args }) => {
      const seq = (args[0] ?? '').toUpperCase().replace(/[^ACGT]/g, '');
      if (!seq) return err('splice: give me a nucleotide sequence, e.g. `splice ACGTAGGTAAGC`');
      // Deterministic toy scores keyed off the canonical GT…AG dinucleotides.
      const donor = seq.includes('GT') ? 0.62 + (seq.indexOf('GT') % 7) / 20 : 0.03;
      const acceptor = seq.includes('AG') ? 0.58 + (seq.indexOf('AG') % 7) / 20 : 0.02;
      return [
        { text: `sequence  ${seq}` },
        { text: `length    ${seq.length} nt` },
        { text: '' },
        { text: `donor    (GT)  ${donor.toFixed(3)}`, tone: donor > 0.5 ? 'ok' : 'dim' },
        { text: `acceptor (AG)  ${acceptor.toFixed(3)}`, tone: acceptor > 0.5 ? 'ok' : 'dim' },
        { text: '' },
        { text: 'Toy scores. The real model is OpenSpliceAI — `which openspliceai`.', tone: 'dim' },
      ];
    },
  },

  sudo: {
    summary: 'execute a command as another user',
    run: ({ argv }) => [
      { text: `${USER} is not in the sudoers file.  This incident will be reported.`, tone: 'err' },
      ...(argv.length > 1 ? [{ text: '(nice try)', tone: 'dim' as Tone }] : []),
    ],
  },
};

/** Commands that cannot run before `/terminal.json` has loaded. */
export const NEEDS_INDEX = new Set(
  Object.entries(COMMANDS)
    .filter(([, cmd]) => cmd.needsIndex)
    .map(([name]) => name)
);

// --------------------------------------------------------------- dispatch ---

export function exec(
  state: ShellState,
  input: string,
  now: Date = new Date(),
  width: number | boolean = 80
): ExecResult {
  const columns = typeof width === 'number' ? Math.max(24, Math.floor(width)) : width ? 48 : 80;
  const narrow = columns < 70;
  const line = input.trim();
  if (line) {
    state.history.push(line);
    state.histIndex = state.history.length;
  }
  if (!line) return { lines: [] };

  // In chat mode every bare line is a question unless it is `exit`.
  if (state.chatMode && line !== 'exit' && !line.startsWith('/')) {
    return { lines: [], effect: { type: 'ask', question: line } };
  }

  const argv = parseArgv(line.replace(/^\//, ''));
  const name = argv[0];
  const cmd = COMMANDS[name];
  if (!cmd) {
    const near = Object.keys(COMMANDS).filter((c) => c.startsWith(name[0] ?? ''));
    return {
      lines: [
        { text: `${name}: command not found`, tone: 'err' },
        ...(near.length ? [{ text: `Did you mean: ${near.join(', ')}?`, tone: 'dim' as Tone }] : []),
        { text: 'Type `help` for the command list.', tone: 'dim' },
      ],
    };
  }
  if (cmd.needsIndex && !state.index) {
    return { lines: [{ text: `${name}: knowledge index unavailable`, tone: 'err' }] };
  }

  const rest = argv.slice(1);
  const flags = new Set<string>();
  const args: string[] = [];
  for (const token of rest) {
    if (/^-[a-z]+$/i.test(token)) for (const ch of token.slice(1)) flags.add(ch);
    else args.push(token);
  }

  const out = cmd.run({ state, index: state.index as TermIndex, argv, args, flags, now, columns, narrow });
  return Array.isArray(out) ? { lines: out } : out;
}

// ------------------------------------------------------------ completion ----

/** Tab completion over command names and, for later words, filesystem paths. */
export function complete(state: ShellState, input: string): { value: string; options: string[] } {
  const trailingSpace = /\s$/.test(input);
  const argv = parseArgv(input);
  const word = trailingSpace ? '' : (argv[argv.length - 1] ?? '');

  let options: string[];
  if (argv.length <= 1 && !trailingSpace) {
    options = Object.keys(COMMANDS).filter((c) => c.startsWith(word)).sort();
  } else if (state.index) {
    const slash = word.lastIndexOf('/');
    const dirPart = slash >= 0 ? word.slice(0, slash + 1) : '';
    const leaf = slash >= 0 ? word.slice(slash + 1) : word;
    const entries = listDir(state.index, resolvePath(state.cwd, dirPart || '.'), leaf.startsWith('.'));
    options = (entries ?? [])
      .filter((e) => e.name.startsWith(leaf))
      .map((e) => `${dirPart}${e.name}${e.dir ? '/' : ''}`);
  } else options = [];

  if (options.length === 0) return { value: input, options: [] };

  // Extend to the longest common prefix so repeated Tab keeps making progress.
  let common = options[0];
  for (const option of options) {
    while (!option.startsWith(common)) common = common.slice(0, -1);
  }
  const prefix = trailingSpace ? input : input.slice(0, input.length - word.length);
  const value = options.length === 1 && !common.endsWith('/') ? `${prefix}${common} ` : `${prefix}${common}`;
  return { value, options: options.length > 1 ? options : [] };
}

/** ↑/↓ through history. Returns the line to place in the input. */
export function historyStep(state: ShellState, direction: -1 | 1, draft: string): string {
  if (!state.history.length) return draft;
  const next = state.histIndex + direction;
  if (next < 0) return state.history[0];
  if (next >= state.history.length) {
    state.histIndex = state.history.length;
    return '';
  }
  state.histIndex = next;
  return state.history[next];
}
