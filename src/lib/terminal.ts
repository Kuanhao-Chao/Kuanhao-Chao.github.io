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
  | { type: 'theme'; mode: 'light' | 'dark' | 'toggle' | 'crt' }
  | { type: 'sound'; mode: 'on' | 'off' | 'toggle' | 'bell' }
  | { type: 'copy'; text?: string }
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

interface CodonEntry {
  one: string;
  three: string;
  name: string;
  type: string;
  prop: string;
  mw: number;
  start?: boolean;
  stop?: boolean;
}

export const CODON_TABLE: Record<string, CodonEntry> = {
  TTT: { one: 'F', three: 'Phe', name: 'Phenylalanine', type: 'Hydrophobic / Aromatic', prop: 'Non-polar', mw: 165.2 },
  TTC: { one: 'F', three: 'Phe', name: 'Phenylalanine', type: 'Hydrophobic / Aromatic', prop: 'Non-polar', mw: 165.2 },
  TTA: { one: 'L', three: 'Leu', name: 'Leucine', type: 'Hydrophobic / Aliphatic', prop: 'Non-polar', mw: 131.2 },
  TTG: { one: 'L', three: 'Leu', name: 'Leucine', type: 'Hydrophobic / Aliphatic', prop: 'Non-polar', mw: 131.2 },
  CTT: { one: 'L', three: 'Leu', name: 'Leucine', type: 'Hydrophobic / Aliphatic', prop: 'Non-polar', mw: 131.2 },
  CTC: { one: 'L', three: 'Leu', name: 'Leucine', type: 'Hydrophobic / Aliphatic', prop: 'Non-polar', mw: 131.2 },
  CTA: { one: 'L', three: 'Leu', name: 'Leucine', type: 'Hydrophobic / Aliphatic', prop: 'Non-polar', mw: 131.2 },
  CTG: { one: 'L', three: 'Leu', name: 'Leucine', type: 'Hydrophobic / Aliphatic', prop: 'Non-polar', mw: 131.2 },
  ATT: { one: 'I', three: 'Ile', name: 'Isoleucine', type: 'Hydrophobic / Aliphatic', prop: 'Non-polar', mw: 131.2 },
  ATC: { one: 'I', three: 'Ile', name: 'Isoleucine', type: 'Hydrophobic / Aliphatic', prop: 'Non-polar', mw: 131.2 },
  ATA: { one: 'I', three: 'Ile', name: 'Isoleucine', type: 'Hydrophobic / Aliphatic', prop: 'Non-polar', mw: 131.2 },
  ATG: { one: 'M', three: 'Met', name: 'Methionine', type: 'Hydrophobic / Sulfur', prop: 'Non-polar', mw: 149.2, start: true },
  GTT: { one: 'V', three: 'Val', name: 'Valine', type: 'Hydrophobic / Aliphatic', prop: 'Non-polar', mw: 117.1 },
  GTC: { one: 'V', three: 'Val', name: 'Valine', type: 'Hydrophobic / Aliphatic', prop: 'Non-polar', mw: 117.1 },
  GTA: { one: 'V', three: 'Val', name: 'Valine', type: 'Hydrophobic / Aliphatic', prop: 'Non-polar', mw: 117.1 },
  GTG: { one: 'V', three: 'Val', name: 'Valine', type: 'Hydrophobic / Aliphatic', prop: 'Non-polar', mw: 117.1 },
  TCT: { one: 'S', three: 'Ser', name: 'Serine', type: 'Polar / Hydroxyl', prop: 'Neutral polar', mw: 105.1 },
  TCC: { one: 'S', three: 'Ser', name: 'Serine', type: 'Polar / Hydroxyl', prop: 'Neutral polar', mw: 105.1 },
  TCA: { one: 'S', three: 'Ser', name: 'Serine', type: 'Polar / Hydroxyl', prop: 'Neutral polar', mw: 105.1 },
  TCG: { one: 'S', three: 'Ser', name: 'Serine', type: 'Polar / Hydroxyl', prop: 'Neutral polar', mw: 105.1 },
  CCT: { one: 'P', three: 'Pro', name: 'Proline', type: 'Cyclic imino', prop: 'Non-polar', mw: 115.1 },
  CCC: { one: 'P', three: 'Pro', name: 'Proline', type: 'Cyclic imino', prop: 'Non-polar', mw: 115.1 },
  CCA: { one: 'P', three: 'Pro', name: 'Proline', type: 'Cyclic imino', prop: 'Non-polar', mw: 115.1 },
  CCG: { one: 'P', three: 'Pro', name: 'Proline', type: 'Cyclic imino', prop: 'Non-polar', mw: 115.1 },
  ACT: { one: 'T', three: 'Thr', name: 'Threonine', type: 'Polar / Hydroxyl', prop: 'Neutral polar', mw: 119.1 },
  ACC: { one: 'T', three: 'Thr', name: 'Threonine', type: 'Polar / Hydroxyl', prop: 'Neutral polar', mw: 119.1 },
  ACA: { one: 'T', three: 'Thr', name: 'Threonine', type: 'Polar / Hydroxyl', prop: 'Neutral polar', mw: 119.1 },
  ACG: { one: 'T', three: 'Thr', name: 'Threonine', type: 'Polar / Hydroxyl', prop: 'Neutral polar', mw: 119.1 },
  GCT: { one: 'A', three: 'Ala', name: 'Alanine', type: 'Hydrophobic / Aliphatic', prop: 'Non-polar', mw: 89.1 },
  GCC: { one: 'A', three: 'Ala', name: 'Alanine', type: 'Hydrophobic / Aliphatic', prop: 'Non-polar', mw: 89.1 },
  GCA: { one: 'A', three: 'Ala', name: 'Alanine', type: 'Hydrophobic / Aliphatic', prop: 'Non-polar', mw: 89.1 },
  GCG: { one: 'A', three: 'Ala', name: 'Alanine', type: 'Hydrophobic / Aliphatic', prop: 'Non-polar', mw: 89.1 },
  TAT: { one: 'Y', three: 'Tyr', name: 'Tyrosine', type: 'Aromatic / Phenol', prop: 'Neutral polar', mw: 181.2 },
  TAC: { one: 'Y', three: 'Tyr', name: 'Tyrosine', type: 'Aromatic / Phenol', prop: 'Neutral polar', mw: 181.2 },
  TAA: { one: '*', three: 'Ochre', name: 'Stop Codon', type: 'Termination', prop: 'N/A', mw: 0, stop: true },
  TAG: { one: '*', three: 'Amber', name: 'Stop Codon', type: 'Termination', prop: 'N/A', mw: 0, stop: true },
  CAT: { one: 'H', three: 'His', name: 'Histidine', type: 'Basic / Imidazole', prop: 'Positive charge', mw: 155.2 },
  CAC: { one: 'H', three: 'His', name: 'Histidine', type: 'Basic / Imidazole', prop: 'Positive charge', mw: 155.2 },
  CAA: { one: 'Q', three: 'Gln', name: 'Glutamine', type: 'Polar / Amide', prop: 'Neutral polar', mw: 146.1 },
  CAG: { one: 'Q', three: 'Gln', name: 'Glutamine', type: 'Polar / Amide', prop: 'Neutral polar', mw: 146.1 },
  AAT: { one: 'N', three: 'Asn', name: 'Asparagine', type: 'Polar / Amide', prop: 'Neutral polar', mw: 132.1 },
  AAC: { one: 'N', three: 'Asn', name: 'Asparagine', type: 'Polar / Amide', prop: 'Neutral polar', mw: 132.1 },
  AAA: { one: 'K', three: 'Lys', name: 'Lysine', type: 'Basic / Amino', prop: 'Positive charge', mw: 146.2 },
  AAG: { one: 'K', three: 'Lys', name: 'Lysine', type: 'Basic / Amino', prop: 'Positive charge', mw: 146.2 },
  GAT: { one: 'D', three: 'Asp', name: 'Aspartic Acid', type: 'Acidic / Carboxyl', prop: 'Negative charge', mw: 133.1 },
  GAC: { one: 'D', three: 'Asp', name: 'Aspartic Acid', type: 'Acidic / Carboxyl', prop: 'Negative charge', mw: 133.1 },
  GAA: { one: 'E', three: 'Glu', name: 'Glutamic Acid', type: 'Acidic / Carboxyl', prop: 'Negative charge', mw: 147.1 },
  GAG: { one: 'E', three: 'Glu', name: 'Glutamic Acid', type: 'Acidic / Carboxyl', prop: 'Negative charge', mw: 147.1 },
  TGT: { one: 'C', three: 'Cys', name: 'Cysteine', type: 'Thiol / Disulfide', prop: 'Neutral polar', mw: 121.2 },
  TGC: { one: 'C', three: 'Cys', name: 'Cysteine', type: 'Thiol / Disulfide', prop: 'Neutral polar', mw: 121.2 },
  TGA: { one: '*', three: 'Opal', name: 'Stop Codon', type: 'Termination', prop: 'N/A', mw: 0, stop: true },
  TGG: { one: 'W', three: 'Trp', name: 'Tryptophan', type: 'Aromatic / Indole', prop: 'Non-polar', mw: 204.2 },
  CGT: { one: 'R', three: 'Arg', name: 'Arginine', type: 'Basic / Guanidinium', prop: 'Positive charge', mw: 174.2 },
  CGC: { one: 'R', three: 'Arg', name: 'Arginine', type: 'Basic / Guanidinium', prop: 'Positive charge', mw: 174.2 },
  CGA: { one: 'R', three: 'Arg', name: 'Arginine', type: 'Basic / Guanidinium', prop: 'Positive charge', mw: 174.2 },
  CGG: { one: 'R', three: 'Arg', name: 'Arginine', type: 'Basic / Guanidinium', prop: 'Positive charge', mw: 174.2 },
  AGT: { one: 'S', three: 'Ser', name: 'Serine', type: 'Polar / Hydroxyl', prop: 'Neutral polar', mw: 105.1 },
  AGC: { one: 'S', three: 'Ser', name: 'Serine', type: 'Polar / Hydroxyl', prop: 'Neutral polar', mw: 105.1 },
  AGA: { one: 'R', three: 'Arg', name: 'Arginine', type: 'Basic / Guanidinium', prop: 'Positive charge', mw: 174.2 },
  AGG: { one: 'R', three: 'Arg', name: 'Arginine', type: 'Basic / Guanidinium', prop: 'Positive charge', mw: 174.2 },
  GGT: { one: 'G', three: 'Gly', name: 'Glycine', type: 'Small / Flexible', prop: 'Non-polar', mw: 75.1 },
  GGC: { one: 'G', three: 'Gly', name: 'Glycine', type: 'Small / Flexible', prop: 'Non-polar', mw: 75.1 },
  GGA: { one: 'G', three: 'Gly', name: 'Glycine', type: 'Small / Flexible', prop: 'Non-polar', mw: 75.1 },
  GGG: { one: 'G', three: 'Gly', name: 'Glycine', type: 'Small / Flexible', prop: 'Non-polar', mw: 75.1 },
};

function translateDna(dna: string): string {
  const clean = dna.toUpperCase().replace(/U/g, 'T').replace(/[^ACGT]/g, '');
  let aa = '';
  for (let i = 0; i + 3 <= clean.length; i += 3) {
    const codon = clean.slice(i, i + 3);
    const entry = CODON_TABLE[codon];
    aa += entry ? entry.one : 'X';
  }
  return aa;
}

function parseInterval(str: string): { chr: string; start: number; end: number } | null {
  const match = str.trim().match(/^([^:]+):(\d+)-(\d+)$/);
  if (!match) return null;
  return {
    chr: match[1],
    start: parseInt(match[2], 10),
    end: parseInt(match[3], 10),
  };
}

export function alignNeedlemanWunsch(
  seq1: string,
  seq2: string,
  match = 1,
  mismatch = -1,
  gap = -2
): {
  score: number;
  aligned1: string;
  aligned2: string;
  matchLine: string;
  identity: number;
  length: number;
} {
  const s1 = seq1.toUpperCase();
  const s2 = seq2.toUpperCase();
  const m = s1.length;
  const n = s2.length;

  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i * gap;
  for (let j = 0; j <= n; j++) dp[0][j] = j * gap;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const scoreDiag = dp[i - 1][j - 1] + (s1[i - 1] === s2[j - 1] ? match : mismatch);
      const scoreUp = dp[i - 1][j] + gap;
      const scoreLeft = dp[i][j - 1] + gap;
      dp[i][j] = Math.max(scoreDiag, scoreUp, scoreLeft);
    }
  }

  let aligned1 = '';
  let aligned2 = '';
  let i = m;
  let j = n;

  while (i > 0 || j > 0) {
    if (
      i > 0 &&
      j > 0 &&
      dp[i][j] === dp[i - 1][j - 1] + (s1[i - 1] === s2[j - 1] ? match : mismatch)
    ) {
      aligned1 = s1[i - 1] + aligned1;
      aligned2 = s2[j - 1] + aligned2;
      i--;
      j--;
    } else if (i > 0 && dp[i][j] === dp[i - 1][j] + gap) {
      aligned1 = s1[i - 1] + aligned1;
      aligned2 = '-' + aligned2;
      i--;
    } else {
      aligned1 = '-' + aligned1;
      aligned2 = s2[j - 1] + aligned2;
      j--;
    }
  }

  let matchLine = '';
  let matches = 0;
  for (let k = 0; k < aligned1.length; k++) {
    if (aligned1[k] === aligned2[k]) {
      matchLine += '|';
      matches++;
    } else if (aligned1[k] === '-' || aligned2[k] === '-') {
      matchLine += ' ';
    } else {
      matchLine += '.';
    }
  }

  const identity = aligned1.length > 0 ? (matches / aligned1.length) * 100 : 0;
  return {
    score: dp[m][n],
    aligned1,
    aligned2,
    matchLine,
    identity,
    length: aligned1.length,
  };
}

export const COMMANDS: Record<string, Cmd> = {
  help: {
    summary: 'list available commands',
    run: () => {
      const groups: [string, string[]][] = [
        ['filesystem', ['ls', 'cd', 'pwd', 'cat', 'head', 'tail', 'wc', 'sort', 'uniq', 'less', 'tree', 'find', 'grep']],
        ['genomics', ['seqkit', 'gffbase', 'align', 'fastqc', 'codon', 'bedtools', 'blastn', 'samtools', 'splice']],
        ['content', ['about', 'publications', 'software', 'talks', 'posts', 'research', 'projects', 'news', 'cv', 'contact', 'socials']],
        ['system', ['uname', 'uptime', 'top', 'date', 'cal', 'curl', 'env', 'neofetch', 'theme', 'crt', 'sound', 'history', 'clear', 'echo']],
        ['toys & games', ['cowsay', 'fortune', 'matrix', 'games', 'snake', 'tetris']],
        ['navigate', ['open', 'exit']],
        ['chatbot', ['ask', 'chat']],
      ];
      const lines: Line[] = [
        { text: 'khcOS shell — a navigable CLI over everything on this site.', tone: 'head' },
        { text: '' },
      ];
      for (const [group, names] of groups) {
        lines.push({ text: `  ${group}`, tone: 'accent' });
        for (const name of names) {
          lines.push({ text: `    ${name.padEnd(14)} ${COMMANDS[name]?.summary ?? ''}` });
        }
        lines.push({ text: '' });
      }
      lines.push(
        { text: '  Tab completes, ↑/↓ history, pipes `|` chain filters (`grep`, `head`, `wc`, `sort`).', tone: 'dim' },
        { text: '  Try: `align ACGTAGCTA ACGTCGCTA` · `cat ~/news.txt | grep 2025` · `curl wttr.in` · `cal`', tone: 'dim' }
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

  head: {
    summary: 'output the first part of files',
    usage: 'head [-n lines] <file>',
    needsIndex: true,
    run: ({ index, state, argv }) => {
      let n = 10;
      const fileArgs: string[] = [];
      const rest = argv.slice(1);
      for (let i = 0; i < rest.length; i++) {
        if (rest[i] === '-n' && rest[i + 1]) {
          n = Math.max(1, parseInt(rest[i + 1], 10) || 10);
          i++;
        } else if (/^-n\d+$/.test(rest[i])) {
          n = Math.max(1, parseInt(rest[i].slice(2), 10) || 10);
        } else if (/^-\d+$/.test(rest[i])) {
          n = Math.max(1, parseInt(rest[i].slice(1), 10) || 10);
        } else {
          fileArgs.push(rest[i]);
        }
      }
      if (!fileArgs.length) return err('head: missing file operand');
      const lines: Line[] = [];
      for (const arg of fileArgs) {
        const path = resolvePath(state.cwd, arg);
        const node = index.fs[path];
        if (!node) {
          lines.push(...err(`head: cannot open '${arg}' for reading: No such file or directory`));
          continue;
        }
        const rawLines = node.body.split('\n');
        lines.push(...bodyLines(rawLines.slice(0, n).join('\n')));
      }
      return lines;
    },
  },

  tail: {
    summary: 'output the last part of files',
    usage: 'tail [-n lines] <file>',
    needsIndex: true,
    run: ({ index, state, argv }) => {
      let n = 10;
      const fileArgs: string[] = [];
      const rest = argv.slice(1);
      for (let i = 0; i < rest.length; i++) {
        if (rest[i] === '-n' && rest[i + 1]) {
          n = Math.max(1, parseInt(rest[i + 1], 10) || 10);
          i++;
        } else if (/^-n\d+$/.test(rest[i])) {
          n = Math.max(1, parseInt(rest[i].slice(2), 10) || 10);
        } else if (/^-\d+$/.test(rest[i])) {
          n = Math.max(1, parseInt(rest[i].slice(1), 10) || 10);
        } else {
          fileArgs.push(rest[i]);
        }
      }
      if (!fileArgs.length) return err('tail: missing file operand');
      const lines: Line[] = [];
      for (const arg of fileArgs) {
        const path = resolvePath(state.cwd, arg);
        const node = index.fs[path];
        if (!node) {
          lines.push(...err(`tail: cannot open '${arg}' for reading: No such file or directory`));
          continue;
        }
        const rawLines = node.body.split('\n');
        lines.push(...bodyLines(rawLines.slice(-n).join('\n')));
      }
      return lines;
    },
  },

  wc: {
    summary: 'print newline, word, and byte counts',
    usage: 'wc [-l|-w|-c] <file>',
    needsIndex: true,
    run: ({ index, state, args, flags }) => {
      if (!args.length) return err('wc: missing file operand');
      const lines: Line[] = [];
      for (const arg of args) {
        const path = resolvePath(state.cwd, arg);
        const node = index.fs[path];
        if (!node) {
          lines.push(...err(`wc: ${arg}: No such file or directory`));
          continue;
        }
        const l = node.body.split('\n').length;
        const w = node.body.trim() ? node.body.trim().split(/\s+/).length : 0;
        const c = new TextEncoder().encode(node.body).length;
        const parts: string[] = [];
        if (flags.has('l')) parts.push(String(l).padStart(7));
        if (flags.has('w')) parts.push(String(w).padStart(7));
        if (flags.has('c') || flags.has('m')) parts.push(String(c).padStart(7));
        if (!parts.length) parts.push(String(l).padStart(7), String(w).padStart(7), String(c).padStart(7));
        lines.push({ text: `${parts.join(' ')} ${arg}` });
      }
      return lines;
    },
  },

  sort: {
    summary: 'sort lines of text files',
    usage: 'sort [-r] <file>',
    needsIndex: true,
    run: ({ index, state, argv }) => {
      const rest = argv.slice(1);
      const reverse = rest.includes('-r');
      const files = rest.filter((f) => !f.startsWith('-'));
      if (!files.length) return err('sort: missing file operand');
      const lines: Line[] = [];
      for (const arg of files) {
        const path = resolvePath(state.cwd, arg);
        const node = index.fs[path];
        if (!node) {
          lines.push(...err(`sort: cannot read '${arg}': No such file or directory`));
          continue;
        }
        const raw = node.body.split('\n');
        raw.sort((a, b) => a.localeCompare(b));
        if (reverse) raw.reverse();
        lines.push(...bodyLines(raw.join('\n')));
      }
      return lines;
    },
  },

  uniq: {
    summary: 'report or omit repeated lines',
    usage: 'uniq <file>',
    needsIndex: true,
    run: ({ index, state, argv }) => {
      const rest = argv.slice(1);
      const files = rest.filter((f) => !f.startsWith('-'));
      if (!files.length) return err('uniq: missing file operand');
      const lines: Line[] = [];
      for (const arg of files) {
        const path = resolvePath(state.cwd, arg);
        const node = index.fs[path];
        if (!node) {
          lines.push(...err(`uniq: cannot read '${arg}': No such file or directory`));
          continue;
        }
        const raw = node.body.split('\n');
        const unique: string[] = [];
        for (let i = 0; i < raw.length; i++) {
          if (i === 0 || raw[i] !== raw[i - 1]) unique.push(raw[i]);
        }
        lines.push(...bodyLines(unique.join('\n')));
      }
      return lines;
    },
  },

  less: {
    summary: 'view file contents with paging',
    usage: 'less <file>',
    needsIndex: true,
    run: ({ index, state, args }) => {
      if (!args.length) return err('less: missing file operand');
      return COMMANDS.cat.run({ state, index, argv: ['cat', ...args], args, flags: new Set(), now: new Date(), columns: 80, narrow: false });
    },
  },

  more: {
    summary: 'view file contents with paging',
    usage: 'more <file>',
    needsIndex: true,
    run: ({ index, state, args }) => {
      if (!args.length) return err('more: missing file operand');
      return COMMANDS.cat.run({ state, index, argv: ['cat', ...args], args, flags: new Set(), now: new Date(), columns: 80, narrow: false });
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

  publications: {
    summary: 'list publications with direct links',
    needsIndex: true,
    run: ({ index }) => {
      const pubs = Object.entries(index.fs)
        .filter(([p]) => p.startsWith(`${HOME}/publications/`))
        .map(([, node]) => node);
      const lines: Line[] = [{ text: 'PUBLICATIONS', tone: 'head' }, { text: '' }];
      for (const pub of pubs) {
        lines.push({ text: pub.title, tone: 'accent' }, ...bodyLines(pub.body, 'dim'));
        if (pub.href) lines.push({ text: `→ ${pub.href}`, tone: 'accent', href: pub.href });
        lines.push({ text: '' });
      }
      return lines;
    },
  },

  software: {
    summary: 'list open-source research software',
    needsIndex: true,
    run: ({ index }) => {
      const tools = Object.entries(index.fs)
        .filter(([p]) => p.startsWith(`${HOME}/software/`))
        .map(([, node]) => node);
      const lines: Line[] = [{ text: 'RESEARCH SOFTWARE', tone: 'head' }, { text: '' }];
      for (const tool of tools) {
        lines.push({ text: tool.title, tone: 'accent' }, ...bodyLines(tool.body, 'dim'));
        if (tool.href) lines.push({ text: `→ ${tool.href}`, tone: 'accent', href: tool.href });
        lines.push({ text: '' });
      }
      return lines;
    },
  },

  talks: {
    summary: 'list presentations and talks',
    needsIndex: true,
    run: ({ index }) => {
      const talksList = Object.entries(index.fs)
        .filter(([p]) => p.startsWith(`${HOME}/talks/`))
        .map(([, node]) => node);
      const lines: Line[] = [{ text: 'TALKS & PRESENTATIONS', tone: 'head' }, { text: '' }];
      for (const talk of talksList.slice(0, 10)) {
        lines.push({ text: talk.title, tone: 'accent' }, ...bodyLines(talk.body, 'dim'), { text: '' });
      }
      lines.push({ text: '→ /talks/ for all talks & slides', tone: 'accent', href: '/talks/' });
      return lines;
    },
  },

  posts: {
    summary: 'list technical blog posts',
    needsIndex: true,
    run: ({ index }) => {
      const postList = Object.entries(index.fs)
        .filter(([p]) => p.startsWith(`${HOME}/posts/`))
        .map(([, node]) => node);
      const lines: Line[] = [{ text: 'BLOG POSTS & TECHNICAL DEEP DIVES', tone: 'head' }, { text: '' }];
      for (const post of postList) {
        lines.push({ text: post.title, tone: 'accent' });
        if (post.href) lines.push({ text: `→ ${post.href}`, tone: 'accent', href: post.href });
        lines.push({ text: '' });
      }
      return lines;
    },
  },

  research: {
    summary: 'list research focus areas',
    needsIndex: true,
    run: ({ index }) => {
      const rList = Object.entries(index.fs)
        .filter(([p]) => p.startsWith(`${HOME}/research/`))
        .map(([, node]) => node);
      const lines: Line[] = [{ text: 'RESEARCH THEMES', tone: 'head' }, { text: '' }];
      for (const r of rList) {
        lines.push({ text: r.title, tone: 'accent' });
        if (r.href) lines.push({ text: `→ ${r.href}`, tone: 'accent', href: r.href });
        lines.push({ text: '' });
      }
      return lines;
    },
  },

  projects: {
    summary: 'list research and software projects',
    needsIndex: true,
    run: ({ index }) => [
      ...fileLines(index, `${HOME}/projects.txt`),
      { text: '' },
      { text: '→ /projects/', tone: 'accent', href: '/projects/' },
    ],
  },

  socials: {
    summary: 'links to social and scholarly profiles',
    needsIndex: true,
    run: ({ index }) => {
      const lines: Line[] = [{ text: 'SCHOLAR & SOCIAL PROFILES', tone: 'head' }, { text: '' }];
      for (const s of index.identity.socials) {
        lines.push({ text: `  ${s.label.padEnd(16)} ${s.href}`, href: s.href });
      }
      return lines;
    },
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

  top: {
    summary: 'display cluster and node resource statistics',
    run: ({ now }) => {
      const time = now.toISOString().slice(11, 19);
      return [
        { text: `top - ${time} up 280 days, 1 user, load average: 4.12, 3.85, 3.40`, tone: 'head' },
        { text: 'Tasks: 142 total, 4 running, 138 sleeping, 0 stopped, 0 zombie' },
        { text: '%Cpu(s): 78.4 us,  6.2 sy,  0.0 ni, 14.8 id,  0.4 wa,  0.2 hi' },
        { text: 'MiB Mem : 524288 total, 412800 used, 111488 free,  32768 buff/cache' },
        { text: 'GPU 0..3: 4x NVIDIA H100 80GB SXM5 [Util: 94% · VRAM: 72GB/80GB · Temp: 58°C]', tone: 'ok' },
        { text: '' },
        { text: '  PID USER      PR  NI    VIRT    RES    SHR S  %CPU  %MEM     TIME+ COMMAND' },
        { text: ' 1042 khc       20   0  142.4g  64.2g  12.4g R 380.0  12.2 412:18.04 shorkie_train.py' },
        { text: ' 1088 khc       20   0   84.2g  32.1g   8.2g R 190.5   6.1 128:44.12 openspliceai_infer' },
        { text: ' 1120 khc       20   0   48.0g  24.0g   4.1g R 100.0   4.5  82:12.30 lifton_eval.py' },
        { text: ' 1144 khc       20   0   18.2g   8.4g   2.0g S  48.0   1.6  14:05.18 gffbase_ingest' },
        { text: ' 1201 khc       20   0    2.4g   1.1g   0.4g S   2.0   0.2   0:14.22 duckdb_worker' },
      ];
    },
  },

  seqkit: {
    summary: 'fast sequence manipulation & stats',
    usage: 'seqkit <stats|rc|translate|gc> <sequence>',
    run: ({ args }) => {
      const sub = (args[0] ?? '').toLowerCase();
      const rawSeq = args.slice(1).join('').toUpperCase().replace(/\s+/g, '');
      if (!sub || sub === 'help') {
        return [
          { text: 'seqkit — ultra-fast sequence toolkit', tone: 'head' },
          { text: '  seqkit stats <seq>      length, GC%, nucleotide composition' },
          { text: '  seqkit rc <seq>         reverse complement' },
          { text: '  seqkit translate <seq>  translate nucleotide to amino acid sequence' },
          { text: '  seqkit gc <seq>         compute GC content percentage' },
        ];
      }
      if (!rawSeq) return err(`seqkit: missing sequence for '${sub}'`);
      if (sub === 'stats') {
        const a = (rawSeq.match(/A/g) || []).length;
        const c = (rawSeq.match(/C/g) || []).length;
        const g = (rawSeq.match(/G/g) || []).length;
        const t = (rawSeq.match(/[TU]/g) || []).length;
        const other = rawSeq.length - (a + c + g + t);
        const gc = rawSeq.length ? (((c + g) / rawSeq.length) * 100).toFixed(2) : '0.00';
        return [
          { text: 'format    DNA' },
          { text: `length    ${rawSeq.length} bp` },
          { text: `GC (%)    ${gc}%`, tone: 'ok' },
          { text: `bases     A: ${a} (${((a / rawSeq.length) * 100).toFixed(1)}%)  C: ${c} (${((c / rawSeq.length) * 100).toFixed(1)}%)  G: ${g} (${((g / rawSeq.length) * 100).toFixed(1)}%)  T: ${t} (${((t / rawSeq.length) * 100).toFixed(1)}%)${other ? `  other: ${other}` : ''}` },
        ];
      }
      if (sub === 'rc') {
        const comp: Record<string, string> = {
          A: 'T', T: 'A', U: 'A', C: 'G', G: 'C',
          R: 'Y', Y: 'R', S: 'S', W: 'W', K: 'M', M: 'K',
          B: 'V', V: 'B', D: 'H', H: 'D', N: 'N',
        };
        const rc = rawSeq.split('').reverse().map((b) => comp[b] ?? b).join('');
        return [
          { text: `5' ${rawSeq} 3' (original)`, tone: 'dim' },
          { text: `5' ${rc} 3' (reverse complement)`, tone: 'ok' },
        ];
      }
      if (sub === 'translate') {
        const aa = translateDna(rawSeq);
        return [
          { text: `nt: ${rawSeq}`, tone: 'dim' },
          { text: `aa: ${aa}`, tone: 'ok' },
          { text: `length: ${aa.length} aa`, tone: 'dim' },
        ];
      }
      if (sub === 'gc') {
        const c = (rawSeq.match(/C/g) || []).length;
        const g = (rawSeq.match(/G/g) || []).length;
        const gc = rawSeq.length ? (((c + g) / rawSeq.length) * 100).toFixed(2) : '0.00';
        return [{ text: `GC content: ${gc}% (${c + g}/${rawSeq.length} bp)`, tone: 'ok' }];
      }
      return err(`seqkit: unknown subcommand '${sub}'. Try stats, rc, translate, or gc.`);
    },
  },

  gffbase: {
    summary: 'SIMD Rust + DuckDB genomic database engine',
    usage: 'gffbase <info|query|benchmark>',
    run: ({ args }) => {
      const sub = (args[0] ?? 'info').toLowerCase();
      if (sub === 'info') {
        return [
          { text: 'GFFBase v0.2.0 — High-performance genomic-annotation engine', tone: 'head' },
          { text: 'Architecture:', tone: 'accent' },
          { text: '  Parser:   SIMD-accelerated Rust with zero-allocation line splits' },
          { text: '  Storage:  DuckDB columnar engine with multi-interval R-tree & B-tree spatial indices' },
          { text: '  Handoff:  PyArrow zero-copy RecordBatch interface for ML & feature extraction' },
          { text: '  API:      Drop-in replacement for gffutils with 10-100x ingest speedups' },
          { text: '' },
          { text: 'Try: `gffbase query chr17:43044295-43125483`  ·  `gffbase benchmark`', tone: 'dim' },
          { text: '→ https://khchao.com/gffbase/', tone: 'accent', href: 'https://khchao.com/gffbase/' },
        ];
      }
      if (sub === 'query' || sub === 'region') {
        const region = args[1] || 'chr17:43044295-43125483';
        return [
          { text: `[GFFBase Query] region: ${region}  (R-tree spatial index)`, tone: 'head' },
          { text: 'Backend: DuckDB in-memory columnar slice · Zero-copy Arrow Table (0.12 ms)', tone: 'dim' },
          { text: '' },
          { text: 'feature_id       type        start       end         strand  parent_id' },
          { text: '──────────────────────────────────────────────────────────────────────────' },
          { text: 'ENSG00000012048  gene        43044295    43125483    -       .' },
          { text: 'ENST00000357654  mRNA        43044295    43125483    -       ENSG00000012048' },
          { text: 'ENSE00003527960  exon        43125271    43125483    -       ENST00000357654' },
          { text: 'ENSE00003556503  exon        43063873    43063953    -       ENST00000357654' },
          { text: 'ENSE00003598734  exon        43044295    43045802    -       ENST00000357654' },
          { text: '' },
          { text: 'Returned 5 features in 0.12 ms (BRCA1 locus).', tone: 'ok' },
        ];
      }
      if (sub === 'benchmark' || sub === 'bench') {
        return [
          { text: 'GFFBase vs Legacy gffutils Ingest Benchmark (GENCODE v49 Human)', tone: 'head' },
          { text: 'Corpus                  gffutils (SQLite)   GFFBase (DuckDB+SIMD)   Speedup' },
          { text: '───────────────────────────────────────────────────────────────────────────' },
          { text: 'GENCODE GTF (3.4M rows) 4m 12s              6.8s                    37.1×', tone: 'ok' },
          { text: 'GENCODE GFF3 (3.4M)     2m 45s              4.2s                    39.3×', tone: 'ok' },
          { text: 'RefSeq GFF3 (2.8M)      2m 10s              3.5s                    37.1×', tone: 'ok' },
          { text: 'MANE Select (0.6M)      41.2s               1.1s                    37.5×', tone: 'ok' },
          { text: 'Zero-copy Arrow fetch   N/A (Python objs)   18.4 ms (100k exons)    Instant', tone: 'accent' },
        ];
      }
      return err(`gffbase: unknown subcommand '${sub}'. Try info, query, or benchmark.`);
    },
  },

  codon: {
    summary: 'genetic code and amino acid lookup',
    usage: 'codon <codon|amino_acid>',
    run: ({ args }) => {
      if (!args.length) return err('codon: give me a codon (e.g. `codon ATG`) or amino acid (e.g. `codon Trp`)');
      const query = args[0].toUpperCase().trim();
      if (query.length === 3 && /^[ACGTU]{3}$/.test(query)) {
        const standardCodon = query.replace(/U/g, 'T');
        const info = CODON_TABLE[standardCodon];
        if (info) {
          return [
            { text: `Codon:       ${query}`, tone: 'head' },
            { text: `Amino acid:  ${info.name} (${info.one} / ${info.three})` },
            { text: `Type:        ${info.type}` },
            { text: `Properties:  ${info.prop}` },
            { text: `Mass:        ${info.mw} Da` },
            ...(info.start ? [{ text: 'Special:     Start codon (AUG/ATG)', tone: 'ok' as Tone }] : []),
            ...(info.stop ? [{ text: 'Special:     Stop codon', tone: 'accent' as Tone }] : []),
          ];
        }
      }
      const aaInfo = Object.values(CODON_TABLE).find(
        (c) => c.one === query || c.three.toUpperCase() === query || c.name.toUpperCase() === query
      );
      if (aaInfo) {
        const codons = Object.entries(CODON_TABLE)
          .filter(([, v]) => v.one === aaInfo.one)
          .map(([k]) => k);
        return [
          { text: `Amino Acid:  ${aaInfo.name} (${aaInfo.one} / ${aaInfo.three})`, tone: 'head' },
          { text: `Codons (${codons.length}): ${codons.join(', ')}`, tone: 'ok' },
          { text: `Type:        ${aaInfo.type}` },
          { text: `Properties:  ${aaInfo.prop}` },
          { text: `Mass:        ${aaInfo.mw} Da` },
        ];
      }
      return err(`codon: '${args[0]}' not recognized as a codon or amino acid.`);
    },
  },

  bedtools: {
    summary: 'genomic interval arithmetic utilities',
    usage: 'bedtools <intersect|merge|jaccard> -a <chr:start-end> -b <chr:start-end>',
    run: ({ argv }) => {
      const rest = argv.slice(1);
      const sub = (rest[0] ?? 'intersect').toLowerCase();
      if (sub === 'intersect') {
        let a = '';
        let b = '';
        for (let i = 1; i < rest.length; i++) {
          if (rest[i] === '-a' && rest[i + 1]) a = rest[++i];
          else if (rest[i] === '-b' && rest[i + 1]) b = rest[++i];
          else if (!a && !rest[i].startsWith('-')) a = rest[i];
          else if (!b && !rest[i].startsWith('-')) b = rest[i];
        }
        if (!a || !b) {
          a = a || 'chr1:1000-2500';
          b = b || 'chr1:2000-3500';
        }
        const pA = parseInterval(a);
        const pB = parseInterval(b);
        if (!pA || !pB || pA.chr !== pB.chr) {
          return err('bedtools intersect: intervals must be on same chromosome (e.g. chr1:100-300)');
        }
        const oStart = Math.max(pA.start, pB.start);
        const oEnd = Math.min(pA.end, pB.end);
        if (oStart < oEnd) {
          return [
            { text: `A:  ${a}`, tone: 'dim' },
            { text: `B:  ${b}`, tone: 'dim' },
            { text: `Overlap: ${pA.chr}:${oStart}-${oEnd} (${oEnd - oStart} bp)`, tone: 'ok' },
          ];
        }
        return [
          { text: `A: ${a}  B: ${b}`, tone: 'dim' },
          { text: 'No intersection found (0 bp overlap).', tone: 'accent' },
        ];
      }
      if (sub === 'merge') {
        return [
          { text: 'bedtools merge:', tone: 'head' },
          { text: '  chr1:100-200, chr1:180-300 ➔ chr1:100-300 (merged 2 intervals)', tone: 'ok' },
        ];
      }
      return err('bedtools: supported subcommands: intersect, merge');
    },
  },

  cowsay: {
    summary: 'speaking ASCII creature',
    usage: 'cowsay [-d] <message>',
    run: ({ args, flags }) => {
      const msg = args.join(' ').trim() || 'Build what you need, use what you build.';
      const len = msg.length;
      const border = '─'.repeat(len + 2);
      if (flags.has('d')) {
        return [
          { text: ` ┌${border}┐` },
          { text: ` │ ${msg} │` },
          { text: ` └${border}┘` },
          { text: '   \\' },
          { text: '    \\ . - . - . - . - .' },
          { text: '      |  (o)       (o) |' },
          { text: '      \\       ^       /' },
          { text: '       ` - - - - - - \'' },
          { text: '         /|  DNA  |\\' },
          { text: '        (_|       |_)' },
        ];
      }
      return [
        { text: ` ┌${border}┐` },
        { text: ` │ ${msg} │` },
        { text: ` └${border}┘` },
        { text: '   \\' },
        { text: '    \\   ^__^' },
        { text: '        (oo)\\_______' },
        { text: '        (__)\\       )\\/\\' },
        { text: '            ||----w |' },
        { text: '            ||     ||' },
      ];
    },
  },

  fortune: {
    summary: 'insightful quote on genomics & science',
    run: ({ now }) => {
      const quotes = [
        '“Build what you need, use what you build.” — Kuan-Hao Chao',
        '“Progress in science depends on new techniques, new discoveries, and new ideas, probably in that order.” — Sydney Brenner',
        '“Biology is the study of complex things that appear to have been designed with a purpose.” — Richard Dawkins',
        '“Genomics is not a luxury for high-income countries; it is a fundamental tool for understanding all biology.” — Mihaela Pertea',
        '“The goal of bioinformatics is to turn sequence data into biological knowledge.” — Steven Salzberg',
        '“We used to think our fate was in the stars. Now we know, in large measure, our fate is in our genes.” — James Watson',
        '“Mathematics is the language with which God has written the universe; computation is how we read it.” — Galileo Galilei',
      ];
      const idx = Math.abs(now.getTime() % quotes.length);
      return [{ text: quotes[idx], tone: 'ok' }];
    },
  },

  matrix: {
    summary: 'display DNA matrix stream',
    run: () => {
      const lines: Line[] = [{ text: 'Initializing genomic stream…', tone: 'head' }];
      const alphabet = ['A', 'C', 'G', 'T', ' '];
      for (let r = 0; r < 8; r++) {
        let row = '';
        for (let c = 0; c < 64; c++) {
          row += alphabet[Math.floor(Math.random() * alphabet.length)];
        }
        lines.push({ text: row, tone: r % 2 === 0 ? 'ok' : 'accent' });
      }
      return lines;
    },
  },

  games: {
    summary: 'browser games launcher',
    needsIndex: true,
    run: ({ index }) => [
      ...fileLines(index, `${HOME}/.config/side-projects.txt`),
      { text: '' },
      { text: 'Type `snake` or `tetris` to play right in your browser!', tone: 'ok' },
      { text: '→ /software/#side-projects', tone: 'accent', href: '/software/' },
    ],
  },

  snake: {
    summary: 'play Snake game',
    run: () => ({ lines: [{ text: 'Opening Snake game…', tone: 'ok' }], effect: { type: 'navigate', href: '/software/' } }),
  },

  tetris: {
    summary: 'play Tetris game',
    run: () => ({ lines: [{ text: 'Opening Tetris game…', tone: 'ok' }], effect: { type: 'navigate', href: '/software/' } }),
  },

  align: {
    summary: 'Needleman-Wunsch pairwise sequence alignment',
    usage: 'align <seq1> <seq2> [-m match] [-x mismatch] [-g gap]',
    run: ({ argv }) => {
      const rest = argv.slice(1);
      let seq1 = '';
      let seq2 = '';
      let match = 1;
      let mismatch = -1;
      let gap = -2;
      for (let i = 0; i < rest.length; i++) {
        if (rest[i] === '-m' && rest[i + 1]) match = parseInt(rest[++i], 10) || 1;
        else if (rest[i] === '-x' && rest[i + 1]) mismatch = parseInt(rest[++i], 10) || -1;
        else if (rest[i] === '-g' && rest[i + 1]) gap = parseInt(rest[++i], 10) || -2;
        else if (!seq1 && !rest[i].startsWith('-')) seq1 = rest[i].toUpperCase().replace(/[^ACGTU]/g, '');
        else if (!seq2 && !rest[i].startsWith('-')) seq2 = rest[i].toUpperCase().replace(/[^ACGTU]/g, '');
      }
      if (!seq1 || !seq2) {
        seq1 = seq1 || 'ACGTACGTAGCTA';
        seq2 = seq2 || 'ACGTCGTAGCTA';
      }
      const res = alignNeedlemanWunsch(seq1, seq2, match, mismatch, gap);
      return [
        { text: 'Global Pairwise Alignment (Needleman-Wunsch)', tone: 'head' },
        { text: `Score: ${res.score}  ·  Length: ${res.length} bp  ·  Identity: ${res.identity.toFixed(1)}%`, tone: 'ok' },
        { text: '' },
        { text: `Query:  1  ${res.aligned1.split('').join(' ')}  ${seq1.length}` },
        { text: `           ${res.matchLine.split('').join(' ')}`, tone: 'accent' },
        { text: `Target: 1  ${res.aligned2.split('').join(' ')}  ${seq2.length}` },
      ];
    },
  },

  fastqc: {
    summary: 'per-base sequence quality and GC analysis',
    usage: 'fastqc <sequence>',
    run: ({ args }) => {
      const rawSeq = args.join('').toUpperCase().replace(/[^ACGT]/g, '');
      const seq = rawSeq || 'GATCGATCGATCGATCGATCAGGTAGGTATCGATCGATC';
      const len = seq.length;
      const gc = (((seq.match(/[CG]/g) || []).length / len) * 100).toFixed(1);
      return [
        { text: 'FastQC v0.12.1 — Comprehensive Quality Report', tone: 'head' },
        { text: `Sequence length: ${len} bp  ·  %GC: ${gc}%  ·  Overall: PASS`, tone: 'ok' },
        { text: '' },
        { text: 'Per-Base Sequence Quality (Q30+ Phred Scores):', tone: 'accent' },
        { text: '  Q40 ┌────────────────────────────────────────┐' },
        { text: '  Q36 │ ██████████████████████████████████████ │ (Very good)' },
        { text: '  Q30 ├┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┤ (Benchmark threshold)' },
        { text: '  Q20 │ ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░ │' },
        { text: '      └┴──┴──┴──┴──┴──┴──┴──┴──┴──┴──┴──┴──┴──┴┘' },
        { text: '       1  4  8  12 16 20 24 28 32 36 40' },
        { text: '' },
        { text: 'Per-Base Sequence Content:', tone: 'accent' },
        {
          text:
            `  A: ${(((seq.match(/A/g) || []).length / len) * 100).toFixed(1)}%  ` +
            `C: ${(((seq.match(/C/g) || []).length / len) * 100).toFixed(1)}%  ` +
            `G: ${(((seq.match(/G/g) || []).length / len) * 100).toFixed(1)}%  ` +
            `T: ${(((seq.match(/T/g) || []).length / len) * 100).toFixed(1)}%`,
        },
        { text: 'Adapter Contamination: 0.00% (None detected)', tone: 'ok' },
      ];
    },
  },

  cal: {
    summary: 'display a calendar',
    usage: 'cal [month] [year]',
    run: ({ args, now }) => {
      const year = parseInt(args[1] || args[0], 10) || now.getUTCFullYear();
      const month = args.length === 2 ? parseInt(args[0], 10) - 1 : now.getUTCMonth();
      const monthNames = [
        'January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December'
      ];
      const header = `${monthNames[month]} ${year}`;
      const pad = Math.max(0, Math.floor((20 - header.length) / 2));
      const lines: Line[] = [
        { text: ' '.repeat(pad) + header, tone: 'head' },
        { text: 'Su Mo Tu We Th Fr Sa', tone: 'accent' },
      ];
      const firstDay = new Date(Date.UTC(year, month, 1)).getUTCDay();
      const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
      let row = '   '.repeat(firstDay);
      for (let day = 1; day <= daysInMonth; day++) {
        const isToday =
          day === now.getUTCDate() &&
          month === now.getUTCMonth() &&
          year === now.getUTCFullYear();
        const cell = String(day).padStart(2);
        row += (isToday ? `[${cell}]` : ` ${cell}`);
        if ((firstDay + day) % 7 === 0 || day === daysInMonth) {
          lines.push({ text: row.trimEnd() });
          row = '';
        }
      }
      return lines;
    },
  },

  curl: {
    summary: 'transfer data from or to a server',
    usage: 'curl <url>',
    run: ({ args }) => {
      const url = (args[0] ?? '').toLowerCase();
      if (!url) return err('curl: try `curl wttr.in` or `curl khchao.com`');
      if (url.includes('wttr.in') || url === 'weather') {
        return [
          { text: 'Weather report: San Diego, CA (Illumina AI Lab)', tone: 'head' },
          { text: '   \\  /       Partly cloudy' },
          { text: ' _ /""\\ _    72 °F (22 °C)' },
          { text: '   \\__/       Wind: 8 mph WSW' },
          { text: '   /  \\       Humidity: 62% · UV: 6' },
          { text: '' },
          { text: 'Weather report: Baltimore, MD (Johns Hopkins University)', tone: 'head' },
          { text: '  \\  /        Sunny' },
          { text: ' _ /""\\ _    78 °F (25 °C)' },
          { text: '   \\__/       Wind: 5 mph NE' },
        ];
      }
      if (url.includes('github') || url.includes('gffbase')) {
        return [
          { text: 'HTTP/2 200 OK', tone: 'dim' },
          { text: 'server: GitHub.com' },
          { text: 'content-type: application/json; charset=utf-8' },
          { text: '' },
          { text: '{\n  "owner": "Kuanhao-Chao",\n  "repo": "gffbase",\n  "stars": 128,\n  "language": "Rust / DuckDB"\n}', tone: 'ok' },
        ];
      }
      return [
        { text: `HTTP/2 200 OK (${url})`, tone: 'ok' },
        { text: '<!DOCTYPE html><html><head><title>khchao.com</title></head>' },
        { text: '<body>Kuan-Hao Chao — Senior Deep Learning/AI Engineer</body></html>' },
      ];
    },
  },

  env: {
    summary: 'print environment variables',
    run: () => [
      { text: 'USER=khc' },
      { text: 'HOST=genome' },
      { text: 'SHELL=/bin/ksh' },
      { text: 'HOME=/home/khc' },
      { text: 'TERM=xterm-256color' },
      { text: 'CUDA_VISIBLE_DEVICES=0,1,2,3' },
      { text: 'NVIDIA_VISIBLE_DEVICES=all' },
      { text: 'GENOME_REF=T2T-CHM13v2.0' },
      { text: 'SLURM_JOB_ID=849201' },
      { text: 'SLURM_NODELIST=illumina-ai-node-[01-04]' },
      { text: 'PATH=/home/khc/software:/usr/local/bin:/usr/bin:/bin' },
    ],
  },

  crt: {
    summary: 'toggle vintage CRT scanline display',
    run: () => ({ lines: [{ text: 'Toggling CRT phosphor mode…', tone: 'ok' }], effect: { type: 'theme', mode: 'crt' } }),
  },

  sound: {
    summary: 'toggle mechanical keyboard audio clicks',
    usage: 'sound [on|off|bell]',
    run: ({ args }) => {
      const mode = (args[0] ?? 'toggle').toLowerCase();
      if (mode === 'on' || mode === 'off' || mode === 'toggle' || mode === 'bell') {
        return { lines: [{ text: `Sound mode: ${mode}`, tone: 'ok' }], effect: { type: 'sound', mode } };
      }
      return [{ text: 'sound: use `sound on`, `sound off`, or `sound bell`', tone: 'err' }];
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

  algorithms: {
    summary: 'interactive algorithm visualizers',
    run: () => ({
      lines: [
        { text: 'Opening Bioinformatics Algorithm Catalog…', tone: 'ok' },
        { text: '→ /algorithms/', tone: 'accent', href: '/algorithms/' },
      ],
      effect: { type: 'navigate', href: '/algorithms/' },
    }),
  },

  minimap2: {
    summary: 'launch Minimap2 minimizer chaining visualizer',
    run: () => ({
      lines: [
        { text: 'Opening Minimap2 Minimizer Sampling & Chaining Visualizer…', tone: 'ok' },
        { text: '→ /algorithms/minimap2/', tone: 'accent', href: '/algorithms/minimap2/' },
      ],
      effect: { type: 'navigate', href: '/algorithms/minimap2/' },
    }),
  },

  fmindex: {
    summary: 'launch FM-Index & BWT backward search visualizer',
    run: () => ({
      lines: [
        { text: 'Opening FM-Index & BWT Backward Search Visualizer…', tone: 'ok' },
        { text: '→ /algorithms/fm-index/', tone: 'accent', href: '/algorithms/fm-index/' },
      ],
      effect: { type: 'navigate', href: '/algorithms/fm-index/' },
    }),
  },

  pairwise: {
    summary: 'launch Needleman-Wunsch & Smith-Waterman pairwise alignment sandbox',
    run: () => ({
      lines: [
        { text: 'Opening Pairwise Alignment Dynamic Programming Sandbox…', tone: 'ok' },
        { text: '→ /algorithms/pairwise/', tone: 'accent', href: '/algorithms/pairwise/' },
      ],
      effect: { type: 'navigate', href: '/algorithms/pairwise/' },
    }),
  },

  wfa: {
    summary: 'launch Wavefront Alignment Algorithm (WFA) visualizer',
    run: () => ({
      lines: [
        { text: 'Opening Wavefront Alignment Algorithm (WFA) Visualizer…', tone: 'ok' },
        { text: '→ /algorithms/wfa/', tone: 'accent', href: '/algorithms/wfa/' },
      ],
      effect: { type: 'navigate', href: '/algorithms/wfa/' },
    }),
  },

  debruijn: {
    summary: 'launch De Bruijn Graph & Eulerian Path genome assembly sandbox',
    run: () => ({
      lines: [
        { text: 'Opening De Bruijn Graph & Eulerian Path Assembly Sandbox…', tone: 'ok' },
        { text: '→ /algorithms/debruijn/', tone: 'accent', href: '/algorithms/debruijn/' },
      ],
      effect: { type: 'navigate', href: '/algorithms/debruijn/' },
    }),
  },

  stringgraph: {
    summary: 'launch String Graphs & Overlap-Layout-Consensus (OLC) visualizer',
    run: () => ({
      lines: [
        { text: 'Opening String Graphs & Overlap-Layout-Consensus (OLC) Visualizer…', tone: 'ok' },
        { text: '→ /algorithms/string-graph/', tone: 'accent', href: '/algorithms/string-graph/' },
      ],
      effect: { type: 'navigate', href: '/algorithms/string-graph/' },
    }),
  },

  phmm: {
    summary: 'launch Profile Hidden Markov Models (pHMMs) Plan 7 visualizer',
    run: () => ({
      lines: [
        { text: 'Opening Profile Hidden Markov Models (pHMMs) Visualizer…', tone: 'ok' },
        { text: '→ /algorithms/phmm/', tone: 'accent', href: '/algorithms/phmm/' },
      ],
      effect: { type: 'navigate', href: '/algorithms/phmm/' },
    }),
  },

  ghmm: {
    summary: 'launch Generalized Hidden Markov Models (GHMMs) gene finding visualizer',
    run: () => ({
      lines: [
        { text: 'Opening Generalized Hidden Markov Models (GHMMs) Gene Finder…', tone: 'ok' },
        { text: '→ /algorithms/ghmm/', tone: 'accent', href: '/algorithms/ghmm/' },
      ],
      effect: { type: 'navigate', href: '/algorithms/ghmm/' },
    }),
  },

  sudo: {
    summary: 'execute a command as another user',
    run: ({ argv }) => [
      { text: `${USER} is not in the sudoers file.  This incident will be reported.`, tone: 'err' },
      ...(argv.length > 1 ? [{ text: '(nice try)', tone: 'dim' as Tone }] : []),
    ],
  },
};

/** Known command aliases that resolve directly to existing shell commands. */
export const ALIASES: Record<string, string> = {
  ll: 'ls -l',
  la: 'ls -la',
  cls: 'clear',
  q: 'exit',
  '?': 'help',
  pubs: 'publications',
  blog: 'posts',
  htop: 'top',
  links: 'socials',
  printenv: 'env',
  wget: 'curl',
  weather: 'curl wttr.in',
  nw: 'align',
  sw: 'pairwise',
  scanlines: 'crt',
  minimizer: 'minimap2',
  chaining: 'minimap2',
  bwt: 'fmindex',
  wavefront: 'wfa',
  eulerian: 'debruijn',
  assemble: 'debruijn',
  dbg: 'debruijn',
  olc: 'stringgraph',
  hifiasm: 'stringgraph',
  flye: 'stringgraph',
  canu: 'stringgraph',
  hmmer: 'phmm',
  pfam: 'phmm',
  viterbi: 'phmm',
  genscan: 'ghmm',
  augustus: 'ghmm',
  gene: 'ghmm',
  genehunt: 'ghmm',
};

/** Commands that cannot run before `/terminal.json` has loaded. */
export const NEEDS_INDEX = new Set(
  Object.entries(COMMANDS)
    .filter(([, cmd]) => cmd.needsIndex)
    .map(([name]) => name)
);

// --------------------------------------------------------------- dispatch ---

export function splitPipeline(input: string): string[] {
  const stages: string[] = [];
  let current = '';
  let inSingle = false;
  let inDouble = false;
  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (ch === "'" && !inDouble) inSingle = !inSingle;
    else if (ch === '"' && !inSingle) inDouble = !inDouble;
    else if (ch === '|' && !inSingle && !inDouble) {
      if (current.trim()) stages.push(current.trim());
      current = '';
      continue;
    }
    current += ch;
  }
  if (current.trim()) stages.push(current.trim());
  return stages;
}

export function applyPipeFilter(
  lines: Line[],
  stageCmd: string,
  _state: ShellState,
  _index: TermIndex | null
): Line[] {
  const argv = parseArgv(stageCmd);
  const name = argv[0]?.toLowerCase();
  const rest = argv.slice(1);

  if (name === 'grep') {
    let ignoreCase = true;
    let invert = false;
    let pattern = '';
    for (let i = 0; i < rest.length; i++) {
      if (rest[i] === '-i') ignoreCase = true;
      else if (rest[i] === '-v') invert = true;
      else if (!pattern && !rest[i].startsWith('-')) pattern = rest[i];
    }
    if (!pattern) return lines;
    const pat = ignoreCase ? pattern.toLowerCase() : pattern;
    return lines.filter((line) => {
      const match = (ignoreCase ? line.text.toLowerCase() : line.text).includes(pat);
      return invert ? !match : match;
    });
  }

  if (name === 'head') {
    let n = 10;
    for (let i = 0; i < rest.length; i++) {
      if (rest[i] === '-n' && rest[i + 1]) n = Math.max(1, parseInt(rest[++i], 10) || 10);
      else if (/^-n\d+$/.test(rest[i])) n = Math.max(1, parseInt(rest[i].slice(2), 10) || 10);
      else if (/^-\d+$/.test(rest[i])) n = Math.max(1, parseInt(rest[i].slice(1), 10) || 10);
    }
    return lines.slice(0, n);
  }

  if (name === 'tail') {
    let n = 10;
    for (let i = 0; i < rest.length; i++) {
      if (rest[i] === '-n' && rest[i + 1]) n = Math.max(1, parseInt(rest[++i], 10) || 10);
      else if (/^-n\d+$/.test(rest[i])) n = Math.max(1, parseInt(rest[i].slice(2), 10) || 10);
      else if (/^-\d+$/.test(rest[i])) n = Math.max(1, parseInt(rest[i].slice(1), 10) || 10);
    }
    return lines.slice(-n);
  }

  if (name === 'wc') {
    const l = lines.length;
    const allText = lines.map((l) => l.text).join('\n');
    const w = allText.trim() ? allText.trim().split(/\s+/).length : 0;
    const c = new TextEncoder().encode(allText).length;
    const isL = rest.includes('-l');
    const isW = rest.includes('-w');
    const isC = rest.includes('-c') || rest.includes('-m');
    const parts: string[] = [];
    if (isL) parts.push(String(l).padStart(7));
    if (isW) parts.push(String(w).padStart(7));
    if (isC) parts.push(String(c).padStart(7));
    if (!parts.length) parts.push(String(l).padStart(7), String(w).padStart(7), String(c).padStart(7));
    return [{ text: parts.join(' ') }];
  }

  if (name === 'sort') {
    const reverse = rest.includes('-r');
    const sorted = [...lines].sort((a, b) => a.text.localeCompare(b.text));
    return reverse ? sorted.reverse() : sorted;
  }

  if (name === 'uniq') {
    const filtered: Line[] = [];
    for (let i = 0; i < lines.length; i++) {
      if (i === 0 || lines[i].text !== lines[i - 1].text) {
        filtered.push(lines[i]);
      }
    }
    return filtered;
  }

  return lines;
}

function execSingle(
  state: ShellState,
  cmdLine: string,
  now: Date,
  columns: number,
  narrow: boolean
): ExecResult {
  const rawArgv = parseArgv(cmdLine.replace(/^\//, ''));
  const first = rawArgv[0]?.toLowerCase() ?? '';
  const aliasExpansion = ALIASES[first];
  const argv = aliasExpansion
    ? parseArgv(`${aliasExpansion} ${rawArgv.slice(1).join(' ')}`.trim())
    : rawArgv;

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

  const pipeline = splitPipeline(line);
  if (pipeline.length > 1) {
    const firstResult = execSingle(state, pipeline[0], now, columns, narrow);
    let currentLines = firstResult.lines;
    for (let i = 1; i < pipeline.length; i++) {
      currentLines = applyPipeFilter(currentLines, pipeline[i], state, state.index);
    }
    return { lines: currentLines, effect: firstResult.effect };
  }

  return execSingle(state, line, now, columns, narrow);
}

// ------------------------------------------------------------ completion ----

/** Tab completion over command names, aliases, and, for later words, filesystem paths. */
export function complete(state: ShellState, input: string): { value: string; options: string[] } {
  const trailingSpace = /\s$/.test(input);
  const argv = parseArgv(input);
  const word = trailingSpace ? '' : (argv[argv.length - 1] ?? '');

  let options: string[];
  if (argv.length <= 1 && !trailingSpace) {
    const allNames = [...Object.keys(COMMANDS), ...Object.keys(ALIASES)];
    options = [...new Set(allNames)].filter((c) => c.startsWith(word)).sort();
  } else if (argv.length === 2 && !trailingSpace && argv[0] === 'seqkit') {
    options = ['stats', 'rc', 'translate', 'gc'].filter((s) => s.startsWith(word)).sort();
  } else if (argv.length === 2 && !trailingSpace && argv[0] === 'gffbase') {
    options = ['info', 'query', 'benchmark'].filter((s) => s.startsWith(word)).sort();
  } else if (argv.length === 2 && !trailingSpace && argv[0] === 'bedtools') {
    options = ['intersect', 'merge'].filter((s) => s.startsWith(word)).sort();
  } else if (argv.length === 2 && !trailingSpace && argv[0] === 'theme') {
    options = ['light', 'dark', 'toggle', 'crt'].filter((s) => s.startsWith(word)).sort();
  } else if (argv.length === 2 && !trailingSpace && argv[0] === 'sound') {
    options = ['on', 'off', 'bell', 'toggle'].filter((s) => s.startsWith(word)).sort();
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

