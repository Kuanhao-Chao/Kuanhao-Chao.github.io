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
  const terms = tokenize(query);
  if (!terms.length) return [];
  const { df, tokens, avgLen } = corpusStats(index);
  const N = index.chunks.length;
  const k1 = 1.5;
  const b = 0.75;

  const hits: Hit[] = index.chunks.map((chunk, i) => {
    const docTokens = tokens[i];
    const len = docTokens.length || 1;
    const titleTokens = new Set(tokenize(chunk.title));
    let score = 0;
    for (const term of new Set(terms)) {
      const tf = docTokens.reduce((n, t) => (t === term ? n + 1 : n), 0);
      if (!tf) continue;
      const idf = Math.log(1 + (N - (df.get(term) ?? 0) + 0.5) / ((df.get(term) ?? 0) + 0.5));
      score += idf * ((tf * (k1 + 1)) / (tf + k1 * (1 - b + (b * len) / avgLen)));
      if (titleTokens.has(term)) score += idf * 0.8;
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

const pad = (label: string, width = 20) => `${label} ${'.'.repeat(Math.max(1, width - label.length))}`;

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

/** The boot log. Counts come from the index, so the log can't claim what isn't there. */
export function bootLines(index: TermIndex): Line[] {
  const s = index.stats;
  return [
    { text: 'khcOS 1.0.0 (GNU/Linux 6.6.0-genome-amd64)', tone: 'dim' },
    { prefix: '[  OK  ]', text: ' mounted /home/khc' },
    { prefix: '[  OK  ]', text: ' loaded reference GRCh38.p14 · T2T-CHM13v2.0' },
    { prefix: '[  OK  ]', text: ' warmed splice models (3 resident)' },
    { prefix: '[  OK  ]', text: ` annotated ${s.publications} publications · ${s.talks} talks` },
    { prefix: '[  OK  ]', text: ' knowledge index ready' },
    { text: 'starting ksh …', tone: 'dim' },
    { text: '' },
  ];
}

export function motd(index: TermIndex, now: Date, narrow = false): Line[] {
  const id = index.identity;
  const s = index.stats;
  const side = [
    `khchao.com  ·  ${id.name} (${id.nameZh})`,
    id.role,
    `Ph.D. Computer Science, ${id.alumniOf[0]}`,
    '',
    'khcOS 1.0.0 (GNU/Linux 6.6.0-genome-amd64)',
    'Reference: T2T-CHM13v2.0 · GRCh38.p14',
  ];
  const stats: [string, string | number][] = [
    ['Publications', s.publications],
    ['Talks', s.talks],
    ['Software released', s.software],
    ['Research areas', s.research],
    ['Reference genome', 'loaded'],
    ['Splice models', '3 resident'],
    ['Annotation', 'OK'],
    ['Peer review', `${s.reviewing} venues`],
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

  lines.push({ text: '' }, { text: ` System information as of ${stamp(now)}`, tone: 'dim' }, { text: '' });

  if (narrow) {
    for (const [label, value] of stats) lines.push({ text: `   ${pad(label)} ${value}` });
  } else {
    for (let i = 0; i < 4; i++) {
      const [aLabel, aValue] = stats[i];
      const [bLabel, bValue] = stats[i + 4];
      lines.push({ text: `   ${pad(aLabel)} ${String(aValue).padEnd(8)}${pad(bLabel)} ${bValue}` });
    }
  }

  lines.push(
    { text: '' },
    { text: ' Type `help` for the command list, `ask <question>` to talk to the bot,', tone: 'dim' },
    { text: ' or `neofetch` if you just want to look at the logo again.', tone: 'dim' },
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
  const hits = search(index, question, 3);
  if (!hits.length) {
    return [
      { text: "I don't have anything indexed for that.", tone: 'dim' },
      { text: 'Try a topic like `ask splice sites`, or run `ls ~` to browse.', tone: 'dim' },
    ];
  }

  const [best, ...rest] = hits;
  // Only read the file when the chunk *is* that file. Several chunks (news items)
  // share one digest path, and printing the digest would answer a different question.
  const node = best.chunk.kind === 'file' ? index.fs[best.chunk.path] : undefined;
  const excerpt = (node?.body ?? best.chunk.text)
    .split('\n')
    .filter((l) => l.trim())
    .slice(0, 6)
    .join('\n');

  const lines: Line[] = [
    { text: best.chunk.title, tone: 'accent' },
    ...bodyLines(excerpt),
  ];
  if (best.chunk.href) {
    lines.push({ text: '' }, { text: `→ ${best.chunk.href}`, tone: 'accent', href: best.chunk.href });
  }
  if (rest.length) {
    lines.push(
      { text: '' },
      { text: 'Related:', tone: 'dim' },
      ...rest.map((h) => ({
        text: `  ${h.chunk.title}  (${h.chunk.path.replace(HOME, '~')})`,
        tone: 'dim' as Tone,
      }))
    );
  }
  return lines;
}

export const COMMANDS: Record<string, Cmd> = {
  help: {
    summary: 'list available commands',
    run: () => {
      const groups: [string, string[]][] = [
        ['filesystem', ['ls', 'cd', 'pwd', 'cat', 'tree', 'find', 'grep']],
        ['about me', ['whoami', 'about', 'man', 'which', 'contact', 'cv', 'news']],
        ['system', ['uname', 'uptime', 'date', 'neofetch', 'history', 'clear', 'echo']],
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
    run: ({ index, state, args, flags }) => {
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
        return [{ text: entries.map((e) => (e.dir ? `${e.name}/` : e.name)).join('   ') }];
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
    run: ({ index, args }) => {
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
      lines.push(
        { text: '                                                        Score     E' },
        { text: 'Sequences producing significant alignments:             (Bits)  Value' },
        { text: '' }
      );
      const top = hits[0].score || 1;
      for (const { chunk, score } of hits) {
        const bits = Math.round(60 + (score / top) * 380);
        const evalue = (1e-4 * Math.exp(-score)).toExponential(0).replace('e-', 'e-');
        const label = `  ${chunk.path.replace(HOME, '~')}`.slice(0, 54).padEnd(54);
        lines.push({ text: `${label}${String(bits).padStart(6)}  ${evalue}`, href: chunk.href });
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
  narrow = false
): ExecResult {
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

  const out = cmd.run({ state, index: state.index as TermIndex, argv, args, flags, now, narrow });
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
