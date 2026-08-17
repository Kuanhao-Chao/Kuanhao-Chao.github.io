import { describe, it, expect } from 'vitest';
import {
  COMMANDS,
  HOME,
  bootLines,
  buildContext,
  cleanProse,
  dnaFrame,
  stripThinking,
  wrapText,
  NEEDS_INDEX,
  complete,
  createShell,
  directories,
  exec,
  historyStep,
  listDir,
  motd,
  offlineAnswer,
  parseArgv,
  pickSentences,
  pipelineStages,
  progressBar,
  prompt,
  resolvePath,
  search,
  shortCwd,
  stageLine,
  tokenize,
  type TermIndex,
} from './terminal';

// A miniature stand-in for /terminal.json — same shape, four files, three dirs.
const fixture = (): TermIndex => ({
  generatedAt: '2026-08-10T00:00:00.000Z',
  identity: {
    name: 'Kuan-Hao Chao',
    nameZh: '趙冠豪',
    role: 'Senior Deep Learning/AI Engineer, Illumina AI Lab',
    email: 'kuanhao.chao@gmail.com',
    tagline: 'Building machine learning for genomics.',
    philosophy: 'Build what you need, use what you build.',
    bio: 'I build machine learning for genomics.',
    jobTitle: 'Senior Deep Learning/AI Engineer',
    worksFor: 'Illumina',
    alumniOf: ['Johns Hopkins University', 'National Taiwan University'],
    knowsAbout: ['Genomics', 'Deep learning'],
    alternateNames: ['趙冠豪', 'Kuanhao Chao'],
    socials: [{ key: 'github', label: 'GitHub', href: 'https://github.com/Kuanhao-Chao' }],
  },
  stats: {
    publications: 15,
    talks: 22,
    software: 6,
    research: 5,
    posts: 8,
    news: 49,
    reviewing: 13,
  },
  fs: {
    [`${HOME}/about.txt`]: {
      title: 'About',
      body: 'About me.\nSecond line.',
      href: '/',
      kind: 'file',
    },
    [`${HOME}/news.txt`]: {
      title: 'Recent news',
      body: '2026-08-06  Cell paper',
      href: '/news/',
      kind: 'file',
    },
    [`${HOME}/software/lifton.txt`]: {
      title: 'LiftOn',
      body: 'LiftOn — genome annotation lift-over combining DNA and protein alignments.',
      href: 'https://khchao.com/LiftOn/',
      kind: 'file',
    },
    [`${HOME}/software/splam.txt`]: {
      title: 'Splam',
      body: 'Splam — deep-learning splice site predictor.',
      href: 'https://khchao.com/splam/',
      kind: 'file',
    },
    [`${HOME}/.config/side-projects.txt`]: { title: 'Side projects', body: 'Snake', kind: 'file' },
  },
  chunks: [
    {
      path: `${HOME}/software/lifton.txt`,
      title: 'LiftOn',
      href: '/publications/lifton/',
      kind: 'file',
      text: 'LiftOn genome annotation lift-over combining DNA and protein alignments annotation',
    },
    {
      path: `${HOME}/software/splam.txt`,
      title: 'Splam',
      href: '/publications/splam/',
      kind: 'file',
      text: 'Splam deep learning splice site predictor improves spliced alignments',
    },
    {
      path: `${HOME}/about.txt`,
      title: 'About',
      href: '/',
      kind: 'file',
      text: 'Kuan-Hao Chao machine learning for genomics Illumina',
    },
    // News chunks deliberately share the digest's path — the shape that made the
    // offline answer print the wrong file before `kind` was consulted.
    {
      path: `${HOME}/news.txt`,
      title: 'LiftOn v1.0.0 is released',
      href: '/news/',
      kind: 'news',
      text: 'LiftOn v1.0.0 is released',
    },
  ],
});

const shell = () => createShell(fixture());
const texts = (lines: { text: string }[]) => lines.map((l) => l.text);
const joined = (lines: { text: string }[]) => texts(lines).join('\n');
/** One command against a fresh shell, at a fixed clock. */
const run = (line: string) => exec(shell(), line, new Date('2026-08-10T12:00:00Z'), false);

describe('parseArgv', () => {
  it('splits on runs of whitespace', () => {
    expect(parseArgv('  ls   -l   ~/software  ')).toEqual(['ls', '-l', '~/software']);
  });

  it('keeps a double-quoted phrase as one argument', () => {
    expect(parseArgv('ask "what is LiftOn"')).toEqual(['ask', 'what is LiftOn']);
  });

  it('keeps a single-quoted phrase as one argument', () => {
    expect(parseArgv("grep 'splice site'")).toEqual(['grep', 'splice site']);
  });

  it('returns an empty argv for a blank line', () => {
    expect(parseArgv('   ')).toEqual([]);
  });

  it('preserves an empty quoted argument', () => {
    expect(parseArgv('echo ""')).toEqual(['echo', '']);
  });
});

describe('resolvePath', () => {
  it('treats a bare name as relative to the working directory', () => {
    expect(resolvePath(HOME, 'software')).toBe(`${HOME}/software`);
  });

  it('resolves .. upward without escaping into nonsense', () => {
    expect(resolvePath(`${HOME}/software`, '..')).toBe(HOME);
    expect(resolvePath(`${HOME}/software`, '../about.txt')).toBe(`${HOME}/about.txt`);
  });

  it('expands ~ to the home directory', () => {
    expect(resolvePath('/', '~')).toBe(HOME);
    expect(resolvePath('/', '~/software')).toBe(`${HOME}/software`);
  });

  it('takes an absolute path as given', () => {
    expect(resolvePath(`${HOME}/software`, '/home')).toBe('/home');
  });

  it('collapses redundant slashes and dots', () => {
    expect(resolvePath(HOME, './/software//./')).toBe(`${HOME}/software`);
  });

  it('defaults to home when no argument is given', () => {
    expect(resolvePath(`${HOME}/software`)).toBe(HOME);
  });
});

describe('the derived directory tree', () => {
  it('infers every directory from the flat file map', () => {
    const dirs = directories(fixture());
    expect(dirs.has(HOME)).toBe(true);
    expect(dirs.has(`${HOME}/software`)).toBe(true);
    expect(dirs.has(`${HOME}/.config`)).toBe(true);
    expect(dirs.has('/home')).toBe(true);
  });

  it('lists directories before files, each alphabetically', () => {
    const names = listDir(fixture(), HOME)!.map((e) => (e.dir ? `${e.name}/` : e.name));
    expect(names).toEqual(['software/', 'about.txt', 'news.txt']);
  });

  it('hides dotfiles unless asked for them', () => {
    expect(listDir(fixture(), HOME)!.some((e) => e.name === '.config')).toBe(false);
    expect(listDir(fixture(), HOME, true)!.some((e) => e.name === '.config')).toBe(true);
  });

  it('returns null for a path that is not a directory', () => {
    expect(listDir(fixture(), `${HOME}/about.txt`)).toBeNull();
  });
});

describe('tokenize', () => {
  it('drops stopwords and single characters', () => {
    expect(tokenize('What is the LiftOn tool?')).toEqual(['lifton', 'tool']);
  });

  it('keeps version-like and hyphenated tokens intact', () => {
    expect(tokenize('lifton-v1.0.9')).toEqual(['lifton-v1.0.9']);
  });
});

describe('search', () => {
  it('ranks the chunk that actually mentions the term first', () => {
    const hits = search(fixture(), 'splice site predictor');
    expect(hits[0].chunk.title).toBe('Splam');
  });

  it('finds a tool by name', () => {
    expect(search(fixture(), 'lifton')[0].chunk.title).toBe('LiftOn');
  });

  it('returns nothing for a query of only stopwords', () => {
    expect(search(fixture(), 'what is the')).toEqual([]);
  });

  it('respects the result limit', () => {
    expect(search(fixture(), 'genomics annotation splice', 1)).toHaveLength(1);
  });

  it('is deterministic — the same index and query give the same ranking', () => {
    const index = fixture();
    const once = search(index, 'annotation').map((h) => h.chunk.path);
    const twice = search(index, 'annotation').map((h) => h.chunk.path);
    expect(once).toEqual(twice);
    expect(once).not.toEqual(search(index, 'splice').map((h) => h.chunk.path));
  });
});

describe('exec — dispatch', () => {
  it('reports an unknown command and suggests near matches', () => {
    const out = exec(shell(), 'lss');
    expect(out.lines[0].text).toContain('command not found');
    expect(out.lines[0].tone).toBe('err');
    expect(joined(out.lines)).toContain('ls');
  });

  it('does nothing for a blank line and does not record it in history', () => {
    const state = shell();
    expect(exec(state, '   ').lines).toEqual([]);
    expect(state.history).toEqual([]);
  });

  it('records every non-blank line in history', () => {
    const state = shell();
    exec(state, 'pwd');
    exec(state, 'whoami');
    expect(state.history).toEqual(['pwd', 'whoami']);
  });

  it('parses clustered short flags', () => {
    const state = shell();
    const out = exec(state, 'ls -la');
    expect(joined(out.lines)).toContain('.config');
    expect(joined(out.lines)).toContain('drwxr-xr-x');
  });

  it('refuses index-backed commands when the index has not loaded', () => {
    const out = exec(createShell(null), 'ls');
    expect(out.lines[0].tone).toBe('err');
    expect(out.lines[0].text).toContain('unavailable');
  });

  it('still runs index-free commands with no index', () => {
    expect(exec(createShell(null), 'pwd').lines[0].text).toBe(HOME);
  });

  it('marks exactly the commands that read the index', () => {
    expect(NEEDS_INDEX.has('cat')).toBe(true);
    expect(NEEDS_INDEX.has('grep')).toBe(true);
    expect(NEEDS_INDEX.has('pwd')).toBe(false);
    expect(NEEDS_INDEX.has('help')).toBe(false);
  });
});

describe('exec — filesystem commands', () => {
  it('cd moves the working directory and pwd reports it', () => {
    const state = shell();
    exec(state, 'cd software');
    expect(state.cwd).toBe(`${HOME}/software`);
    expect(exec(state, 'pwd').lines[0].text).toBe(`${HOME}/software`);
  });

  it('cd to a missing directory errors and leaves cwd untouched', () => {
    const state = shell();
    const out = exec(state, 'cd nope');
    expect(out.lines[0].tone).toBe('err');
    expect(state.cwd).toBe(HOME);
  });

  it('bare cd returns home', () => {
    const state = shell();
    exec(state, 'cd software');
    exec(state, 'cd');
    expect(state.cwd).toBe(HOME);
  });

  it('bare ls lists the working directory, not home', () => {
    const state = shell();
    exec(state, 'cd software');
    const out = joined(exec(state, 'ls').lines);
    expect(out).toContain('lifton.txt');
    expect(out).not.toContain('about.txt');
  });

  it('uses one entry per row for ls on narrow terminals', () => {
    expect(texts(exec(shell(), 'ls', new Date('2026-08-10T12:00:00Z'), 40).lines)).toEqual([
      'software/',
      'about.txt',
      'news.txt',
    ]);
  });

  it('moves long ls titles onto their own rows on narrow terminals', () => {
    const lines = exec(shell(), 'ls -l', new Date('2026-08-10T12:00:00Z'), 40).lines;
    expect(lines.map((line) => line.text)).toEqual([
      'd  khc  -  software/',
      '-  khc      22  about.txt',
      '    — About',
      '-  khc      22  news.txt',
      '    — Recent news',
    ]);
  });

  it('bare tree walks the working directory, not home', () => {
    const state = shell();
    exec(state, 'cd software');
    const out = joined(exec(state, 'tree').lines);
    expect(out).toContain('splam.txt');
    expect(out).toContain('0 directories, 2 files');
  });

  it('cat prints a file body and appends its link', () => {
    const out = exec(shell(), 'cat about.txt');
    expect(texts(out.lines)).toContain('About me.');
    expect(out.lines.at(-1)?.href).toBe('/');
  });

  it('cat reports a missing file without throwing', () => {
    expect(exec(shell(), 'cat ghost.txt').lines[0].tone).toBe('err');
  });

  it('tree counts what it printed, skipping hidden entries', () => {
    const out = joined(exec(shell(), 'tree').lines);
    expect(out).toContain('1 directories, 4 files');
    expect(out).not.toContain('.config');
  });

  it('find matches on the path', () => {
    expect(joined(exec(shell(), 'find splam').lines)).toContain('~/software/splam.txt');
  });

  it('grep surfaces the best-matching chunk', () => {
    expect(joined(exec(shell(), 'grep splice').lines)).toContain('Splam');
  });
});

describe('exec — effects', () => {
  it('clear asks the controller to wipe the screen', () => {
    expect(exec(shell(), 'clear').effect).toEqual({ type: 'clear' });
  });

  it('open resolves a file to its href', () => {
    expect(exec(shell(), 'open about.txt').effect).toEqual({ type: 'navigate', href: '/' });
  });

  it('open accepts a bare site path', () => {
    expect(exec(shell(), 'open /news/').effect).toEqual({ type: 'navigate', href: '/news/' });
  });

  it('ask hands the question to the controller', () => {
    expect(exec(shell(), 'ask what is LiftOn?').effect).toEqual({
      type: 'ask',
      question: 'what is LiftOn?',
    });
  });

  it('ask without a question is an error, not an empty request', () => {
    const out = exec(shell(), 'ask');
    expect(out.effect).toBeUndefined();
    expect(out.lines[0].tone).toBe('err');
  });

  it('exit leaves the shell', () => {
    expect(exec(shell(), 'exit').effect).toEqual({ type: 'exit' });
  });
});

describe('chat mode', () => {
  it('routes bare lines to the bot once entered', () => {
    const state = shell();
    exec(state, 'chat');
    expect(state.chatMode).toBe(true);
    expect(exec(state, 'tell me about splam').effect).toEqual({
      type: 'ask',
      question: 'tell me about splam',
    });
  });

  it('exit leaves chat mode rather than the shell', () => {
    const state = shell();
    exec(state, 'chat');
    const out = exec(state, 'exit');
    expect(state.chatMode).toBe(false);
    expect(out.effect).toBeUndefined();
  });

  it('a leading slash escapes back to the parser', () => {
    const state = shell();
    exec(state, 'chat');
    expect(exec(state, '/pwd').lines[0].text).toBe(HOME);
  });

  it('changes the prompt', () => {
    const state = shell();
    expect(prompt(state)).toBe('khc@genome:~$');
    exec(state, 'chat');
    expect(prompt(state)).toBe('ask>');
  });
});

describe('the prompt path', () => {
  it('abbreviates the home directory to ~', () => {
    expect(shortCwd(HOME)).toBe('~');
    expect(shortCwd(`${HOME}/software`)).toBe('~/software');
    expect(shortCwd('/home')).toBe('/home');
  });
});

describe('tab completion', () => {
  it('completes a command name and adds a trailing space', () => {
    expect(complete(shell(), 'neo').value).toBe('neofetch ');
  });

  it('extends to the longest common prefix when several commands match', () => {
    const { value, options } = complete(shell(), 'c');
    expect(value).toBe('c');
    expect(options).toContain('cat');
    expect(options).toContain('cd');
  });

  it('completes a directory and leaves the slash for the next segment', () => {
    expect(complete(shell(), 'cd soft').value).toBe('cd software/');
  });

  it('completes a filename inside a directory', () => {
    expect(complete(shell(), 'cat software/lif').value).toBe('cat software/lifton.txt ');
  });

  it('offers directory contents after a trailing space', () => {
    expect(complete(shell(), 'cat ').options).toContain('about.txt');
  });

  it('leaves the input alone when nothing matches', () => {
    expect(complete(shell(), 'cat zzz').value).toBe('cat zzz');
  });
});

describe('history navigation', () => {
  it('walks backwards then forwards, ending on an empty line', () => {
    const state = shell();
    exec(state, 'pwd');
    exec(state, 'whoami');
    expect(historyStep(state, -1, '')).toBe('whoami');
    expect(historyStep(state, -1, '')).toBe('pwd');
    expect(historyStep(state, 1, '')).toBe('whoami');
    expect(historyStep(state, 1, '')).toBe('');
  });

  it('stops at the oldest entry instead of wrapping', () => {
    const state = shell();
    exec(state, 'pwd');
    historyStep(state, -1, '');
    expect(historyStep(state, -1, '')).toBe('pwd');
  });

  it('returns the draft untouched when there is no history', () => {
    expect(historyStep(shell(), -1, 'half-typed')).toBe('half-typed');
  });
});

describe('wrapText', () => {
  it('never emits a line longer than the column budget', () => {
    const prose =
      'Kuan-Hao Chao works on sequence to function models, genome annotation, and DNA language models at the Illumina AI Lab.';
    for (const line of wrapText(prose, 40)) expect(line.length).toBeLessThanOrEqual(40);
  });

  it('keeps every word — wrapping must not lose text', () => {
    const prose = 'one two three four five six seven eight nine ten eleven twelve';
    expect(wrapText(prose, 12).join(' ').split(/\s+/)).toEqual(prose.split(' '));
  });

  it('preserves paragraph breaks', () => {
    expect(wrapText('first\n\nsecond', 40)).toEqual(['first', '', 'second']);
  });

  it('leaves a word longer than the budget intact rather than splitting a token', () => {
    const long = 'supercalifragilisticexpialidocious';
    expect(wrapText(long, 10)).toEqual([long]);
  });
});

describe('stripThinking', () => {
  it('removes a closed reasoning block', () => {
    expect(stripThinking('<think>hmm, let me consider</think>The answer.')).toBe('The answer.');
  });

  it('removes an unterminated block, which is what a truncated stream leaves', () => {
    expect(stripThinking('Answer so far.<think>still reason')).toBe('Answer so far.');
  });

  it('leaves ordinary text alone', () => {
    expect(stripThinking('LiftOn lifts annotations over.')).toBe('LiftOn lifts annotations over.');
  });
});

describe('buildContext', () => {
  it('includes the matching passages and labels each with its path', () => {
    const ctx = buildContext(fixture(), 'splice site predictor');
    expect(ctx).toContain('## Splam');
    expect(ctx).toContain('~/software/splam.txt');
  });

  it('is empty when nothing matches, so the model is told plainly it has no context', () => {
    expect(buildContext(fixture(), 'quantum chromodynamics')).toBe('');
  });
});

describe('the DNA helix', () => {
  it('always returns exactly rows × width characters', () => {
    for (const phase of [0, 0.3, 1.1, 2.7, 5.9, -1.4]) {
      const frame = dnaFrame(phase, 6, 11);
      expect(frame).toHaveLength(6);
      for (const row of frame) expect(row).toHaveLength(11);
    }
  });

  it('is deterministic — the same phase gives the same frame', () => {
    expect(dnaFrame(1.23)).toEqual(dnaFrame(1.23));
  });

  it('actually rotates — neighbouring phases differ', () => {
    expect(dnaFrame(0).join('\n')).not.toEqual(dnaFrame(0.7).join('\n'));
  });

  it('repeats after a full turn', () => {
    expect(dnaFrame(0.4)).toEqual(dnaFrame(0.4 + Math.PI * 2));
  });

  it('draws complementary bases, near strand uppercase and far strand lowercase', () => {
    const complement: Record<string, string> = { a: 't', t: 'a', g: 'c', c: 'g' };
    for (const phase of [0, 0.5, 1.5, 3.0, 4.5]) {
      for (const row of dnaFrame(phase, 8, 13)) {
        const bases = [...row].filter((ch) => /[atgc]/i.test(ch));
        if (bases.length !== 2) continue; // a crossing row has none
        const [left, right] = bases;
        expect(complement[left.toLowerCase()]).toBe(right.toLowerCase());
        // Exactly one of the pair is near (uppercase).
        expect([left, right].filter((ch) => ch === ch.toUpperCase())).toHaveLength(1);
      }
    }
  });

  it('collapses to a crossing glyph when the strands meet, never a broken rung', () => {
    let sawCrossing = false;
    for (let i = 0; i < 80; i++) {
      for (const row of dnaFrame(i * 0.08, 8, 13)) {
        if (row.includes('╳')) {
          sawCrossing = true;
          expect(row.trim()).toBe('╳');
        }
      }
    }
    expect(sawCrossing).toBe(true);
  });

  it('never leaks undefined into a frame', () => {
    expect(dnaFrame(2.2, 9, 15).join('')).not.toContain('undefined');
  });
});

describe('progressBar', () => {
  it('is always exactly `width` cells, whatever the fraction', () => {
    for (const f of [-1, 0, 0.01, 0.5, 0.99, 1, 2, NaN]) {
      // Block glyphs are one UTF-16 unit each, so length is a fair cell count here.
      expect(progressBar(f, 20)).toHaveLength(20);
    }
  });

  it('fills monotonically from empty to full', () => {
    const filled = (f: number) => [...progressBar(f, 20)].filter((c) => c === '█').length;
    expect(filled(0)).toBe(0);
    expect(filled(1)).toBe(20);
    let previous = 0;
    for (let f = 0; f <= 1; f += 0.05) {
      const now = filled(f);
      expect(now).toBeGreaterThanOrEqual(previous);
      previous = now;
    }
  });
});

describe('the boot pipeline', () => {
  it('walks assembly through annotation, ending on this site’s own tools', () => {
    const keys = pipelineStages().map((s) => s.key);
    expect(keys).toEqual([
      'reads',
      'kmers',
      'assemble',
      'scaffold',
      'polish',
      'mask',
      'lift',
      'splice',
      'index',
    ]);
  });

  it('starts every bar in the same column', () => {
    const stages = pipelineStages();
    const columns = stages.map((s, i) => stageLine(s, i, stages.length, 0, false).indexOf('░'));
    expect(new Set(columns).size).toBe(1);
  });

  it('withholds a stage’s detail until it has finished', () => {
    const [reads] = pipelineStages();
    expect(stageLine(reads, 0, 9, 0.5, false)).not.toContain('N50');
    expect(stageLine(reads, 0, 9, 1, false)).toContain('N50 18.6 kb');
  });

  it('is narrower on a phone, where there are ~20 fewer columns', () => {
    const stages = pipelineStages();
    const wide = stageLine(stages[0], 0, 9, 1, false);
    const narrow = stageLine(stages[0], 0, 9, 1, true);
    expect(narrow.length).toBeLessThan(wide.length);
  });

  it('reports no personal counts — the login screen describes work, not tallies', () => {
    const text = bootLines()
      .map((l) => `${l.prefix ?? ''}${l.text}`)
      .join('\n');
    expect(text).toContain('khcOS 1.0.0');
    expect(text).toContain('LiftOn');
    // The old boot recited "15 publications · 22 talks" at every visitor.
    expect(text).not.toMatch(/publications|talks/i);
    expect(text).not.toContain('undefined');
  });

  it('marks each completed step with an OK prefix', () => {
    expect(bootLines().filter((l) => l.prefix === '[  OK  ]').length).toBeGreaterThan(2);
  });

  it('shows every bar full in its finished form', () => {
    const rows = bootLines().filter((l) => l.text.includes('█') || l.text.includes('░'));
    expect(rows).toHaveLength(pipelineStages().length);
    for (const row of rows) expect(row.text).not.toContain('░');
  });
});

describe('motd', () => {
  it('renders the banner without reciting a table of counts', () => {
    const text = joined(motd(fixture(), new Date('2026-08-10T12:00:00Z')));
    expect(text).toContain('Kuan-Hao Chao');
    expect(text).toContain('khcOS 1.0.0');
    // `neofetch` is where a stat block belongs; a login screen that lists someone's
    // publication count at you reads as a CV in a costume.
    expect(text).not.toMatch(/Publications \.+/);
    expect(text).not.toMatch(/Peer review/);
    expect(text).not.toContain('undefined');
    expect(text).not.toContain('NaN');
  });

  it('still points at neofetch, where the counts moved to', () => {
    const text = joined(motd(fixture(), new Date('2026-08-10T12:00:00Z')));
    expect(text).toContain('neofetch');
    expect(joined(run('neofetch').lines)).toContain('Papers:');
  });
});

describe('the theme command', () => {
  it('toggles with no argument and sets a named theme', () => {
    expect(run('theme').effect).toEqual({ type: 'theme', mode: 'toggle' });
    expect(run('theme dark').effect).toEqual({ type: 'theme', mode: 'dark' });
    expect(run('theme LIGHT').effect).toEqual({ type: 'theme', mode: 'light' });
  });

  it('refuses a theme that does not exist rather than guessing', () => {
    const { lines, effect } = run('theme solarized');
    expect(effect).toBeUndefined();
    expect(joined(lines)).toContain('no such theme');
  });
});

describe('every command', () => {
  const state = shell();
  const now = new Date('2026-08-10T12:00:00Z');

  it('has a summary, so `help` can never show a blank row', () => {
    for (const [name, cmd] of Object.entries(COMMANDS)) {
      expect(cmd.summary, `${name} needs a summary`).toBeTruthy();
    }
  });

  it('runs without throwing when given no arguments', () => {
    for (const name of Object.keys(COMMANDS)) {
      expect(() => exec({ ...state, cwd: HOME }, name, now), `${name} threw`).not.toThrow();
    }
  });

  it('never emits undefined or NaN into its output', () => {
    for (const name of Object.keys(COMMANDS)) {
      const out = exec({ ...shell(), cwd: HOME }, `${name} lifton`, now);
      const text = joined(out.lines);
      expect(text, `${name} leaked undefined`).not.toContain('undefined');
      expect(text, `${name} leaked NaN`).not.toContain('NaN');
    }
  });
});

describe('news is findable but never preferred over the canonical page', () => {
  it('ranks the tool page above a short news blurb naming the same tool', () => {
    const hits = search(fixture(), 'what does LiftOn do');
    expect(hits[0].chunk.kind).toBe('file');
    expect(hits[0].chunk.path).toBe(`${HOME}/software/lifton.txt`);
  });

  it('still returns the news item among the results', () => {
    const titles = search(fixture(), 'lifton released', 5).map((h) => h.chunk.title);
    expect(titles).toContain('LiftOn v1.0.0 is released');
  });
});

describe('cleanProse', () => {
  it('unwraps a markdown link to its label', () => {
    expect(cleanProse('published in [Cell](https://doi.org/10.1016/x).')).toBe(
      'published in Cell.'
    );
  });

  it('drops a row that was nothing but a URL', () => {
    expect(cleanProse('Code: https://github.com/x/y')).toBe('');
  });

  it('keeps an email row — that is the answer to "how do I contact him"', () => {
    expect(cleanProse('Email: kuanhao.chao@gmail.com')).toBe('Email: kuanhao.chao@gmail.com');
  });

  it('keeps ordinary prose untouched', () => {
    expect(cleanProse('LiftOn combines DNA and protein alignments.')).toBe(
      'LiftOn combines DNA and protein alignments.'
    );
  });
});

describe('query expansion', () => {
  it('bridges "work" to the actual employer, which the word never appears in', () => {
    const index = fixture();
    index.chunks.push({
      path: `${HOME}/cv/experience.txt`,
      title: 'Experience',
      href: '/cv/',
      kind: 'file',
      text: 'Senior Deep Learning/AI Engineer Illumina AI Lab Aug 2025 Present',
    });
    index.fs[`${HOME}/cv/experience.txt`] = {
      title: 'Experience',
      body: 'Aug 2025 – Present\n  Senior Deep Learning/AI Engineer\n  Illumina — AI Lab',
      href: '/cv/',
      kind: 'file',
    };
    expect(joined(offlineAnswer(index, 'who does he work for?'))).toContain('Illumina');
  });

  it('does not let an expansion outrank a direct term match', () => {
    expect(search(fixture(), 'splice site predictor')[0].chunk.title).toBe('Splam');
  });
});

describe('pickSentences', () => {
  const passage =
    'Kuan-Hao Chao is a computational biologist. LiftOn combines DNA and protein alignments ' +
    'to transfer gene models. He also enjoys building browser games. ' +
    'The lift-over algorithm resolves overlapping loci and finds extra gene copies.';

  it('returns the sentences that address the query, not the first ones', () => {
    const picked = pickSentences(passage, 'lift-over gene models', 2);
    expect(picked.join(' ')).toContain('LiftOn combines DNA');
    expect(picked.join(' ')).not.toContain('browser games');
  });

  it('keeps the picked sentences in document order so they still read as prose', () => {
    const picked = pickSentences(passage, 'gene copies alignments', 2);
    expect(picked.map((s) => passage.indexOf(s))).toEqual(
      [...picked.map((s) => passage.indexOf(s))].sort((a, b) => a - b)
    );
  });

  it('respects the requested count', () => {
    expect(pickSentences(passage, 'gene alignments copies lift-over', 1)).toHaveLength(1);
  });

  it('returns nothing for a stopword-only query rather than guessing', () => {
    expect(pickSentences(passage, 'what is the')).toEqual([]);
  });

  it('does not prefer a long sentence purely for being long', () => {
    const short = 'LiftOn lifts annotations.';
    const padded = `${short} ${'Filler words about nothing in particular. '.repeat(6)}`;
    expect(pickSentences(`${padded}`, 'lifton annotations', 1)[0]).toBe(short);
  });
});

describe('the offline brain', () => {
  it('answers with the relevant sentence, not the top of the file', () => {
    const index = fixture();
    index.fs[`${HOME}/software/lifton.txt`].body =
      'LiftOn — released 2025-02-01.\nBuilt at Johns Hopkins.\n' +
      'It combines DNA and protein alignments to transfer gene models across assemblies.';
    const text = joined(offlineAnswer(index, 'how does LiftOn transfer gene models?'));
    expect(text).toContain('combines DNA and protein alignments');
  });

  it('draws on more than one source when several are relevant', () => {
    const lines = offlineAnswer(fixture(), 'splice site predictor and annotation lift-over');
    const sources = lines.slice(lines.findIndex((l) => l.text === 'sources'));
    expect(sources.filter((l) => l.href).length).toBeGreaterThan(1);
  });

  it('always cites where the answer came from', () => {
    const lines = offlineAnswer(fixture(), 'lifton');
    expect(lines.some((l) => l.text === 'sources')).toBe(true);
    expect(lines.some((l) => l.href)).toBe(true);
  });

  it('quotes the winning chunk, not the digest that shares its path', () => {
    expect(joined(offlineAnswer(fixture(), 'LiftOn v1.0.0 released'))).not.toContain('Cell paper');
  });

  it('never says the same sentence twice, even when sources share a title', () => {
    const index = fixture();
    // A paper and its talk with identical titles — the real corpus is full of these.
    index.chunks.push({
      path: `${HOME}/talks/lifton-talk.txt`,
      title: 'LiftOn',
      href: '/talks/',
      kind: 'file',
      text: 'LiftOn genome annotation lift-over combining DNA and protein alignments',
    });
    index.fs[`${HOME}/talks/lifton-talk.txt`] = index.fs[`${HOME}/software/lifton.txt`];
    const body = joined(offlineAnswer(index, 'lifton annotation')).split('sources')[0];
    const sentences = body
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);
    expect(new Set(sentences).size).toBe(sentences.length);
  });

  it('never emits a URL into the answer body', () => {
    const body = joined(offlineAnswer(fixture(), 'lifton')).split('sources')[0];
    expect(body).not.toContain('http');
  });

  it('never returns an empty answer for a query that matched something', () => {
    for (const q of ['lifton', 'splam', 'genomics', 'illumina', 'chao']) {
      const lines = offlineAnswer(fixture(), q);
      expect(lines.length, `"${q}" produced nothing`).toBeGreaterThan(1);
      expect(joined(lines).trim(), `"${q}" produced blank text`).not.toBe('');
    }
  });

  it('points at the nearest real topic when nothing matches', () => {
    const lines = offlineAnswer(fixture(), 'quantum chromodynamics');
    expect(lines[0].text).toContain('Nothing in the index matches');
  });

  it('recognises a near-miss against what he actually works on', () => {
    expect(joined(offlineAnswer(fixture(), 'tell me about deep learning'))).toBeTruthy();
  });

  it('handles a stopword-only question without throwing', () => {
    expect(() => offlineAnswer(fixture(), 'what is the')).not.toThrow();
  });

  it('never emits an over-wide line into a pre-formatted screen', () => {
    for (const line of offlineAnswer(fixture(), 'what does LiftOn do for annotation')) {
      expect(line.text.length).toBeLessThanOrEqual(80);
    }
  });
});

describe('genomics commands', () => {
  it('blastn produces a hit table pointing at real pages', () => {
    const out = exec(shell(), 'blastn splice site');
    expect(joined(out.lines)).toContain('BLASTN');
    expect(out.lines.some((l) => l.href === '/publications/splam/')).toBe(true);
  });

  it('splice scores a canonical GT..AG sequence above a non-canonical one', () => {
    const good = exec(shell(), 'splice ACGTAAGC');
    const bad = exec(shell(), 'splice CCCCCC');
    expect(joined(good.lines)).toMatch(/donor {4}\(GT\) {2}0\.[6-9]/);
    expect(joined(bad.lines)).toMatch(/donor {4}\(GT\) {2}0\.0/);
  });

  it('splice rejects a non-nucleotide argument', () => {
    expect(exec(shell(), 'splice hello').lines[0].tone).toBe('err');
  });

  it('seqkit stats computes length and GC composition', () => {
    const out = exec(shell(), 'seqkit stats ATGC');
    expect(joined(out.lines)).toContain('4 bp');
    expect(joined(out.lines)).toContain('50.00%');
  });

  it('seqkit rc computes correct reverse complement', () => {
    const out = exec(shell(), 'seqkit rc ATGC');
    expect(joined(out.lines)).toContain("5' GCAT 3' (reverse complement)");
  });

  it('seqkit translate translates DNA into amino acids', () => {
    const out = exec(shell(), 'seqkit translate ATGAAATAG');
    expect(joined(out.lines)).toContain('aa: MK*');
  });

  it('seqkit gc calculates exact GC percentage', () => {
    const out = exec(shell(), 'seqkit gc GCGC');
    expect(joined(out.lines)).toContain('100.00%');
  });

  it('gffbase runs info, query, and benchmark subcommands', () => {
    const info = exec(shell(), 'gffbase info');
    expect(joined(info.lines)).toContain('SIMD-accelerated Rust');

    const query = exec(shell(), 'gffbase query chr17:43044295-43125483');
    expect(joined(query.lines)).toContain('BRCA1 locus');

    const bench = exec(shell(), 'gffbase benchmark');
    expect(joined(bench.lines)).toContain('GENCODE GTF');
  });

  it('codon translates triplets and amino acid names', () => {
    const atg = exec(shell(), 'codon ATG');
    expect(joined(atg.lines)).toContain('Methionine');
    expect(joined(atg.lines)).toContain('Start codon');

    const trp = exec(shell(), 'codon W');
    expect(joined(trp.lines)).toContain('Tryptophan');
    expect(joined(trp.lines)).toContain('TGG');
  });

  it('bedtools performs interval intersection and merging', () => {
    const out = exec(shell(), 'bedtools intersect -a chr1:100-300 -b chr1:200-400');
    expect(joined(out.lines)).toContain('Overlap: chr1:200-300 (100 bp)');

    const merge = exec(shell(), 'bedtools merge');
    expect(joined(merge.lines)).toContain('merged 2 intervals');
  });

  it('sudo refuses, as it should', () => {
    expect(exec(shell(), 'sudo rm -rf /').lines[0].text).toContain('not in the sudoers file');
  });
});

describe('unix utilities and content navigation commands', () => {
  it('head outputs first N lines of a file', () => {
    const out = exec(shell(), 'head -n 1 about.txt');
    expect(out.lines.length).toBe(1);
    expect(out.lines[0].text).toBe('About me.');
  });

  it('tail outputs last N lines of a file', () => {
    const out = exec(shell(), 'tail -n 1 about.txt');
    expect(out.lines.length).toBe(1);
    expect(out.lines[0].text).toBe('Second line.');
  });

  it('wc counts lines, words, and bytes', () => {
    const out = exec(shell(), 'wc -l about.txt');
    expect(out.lines[0].text).toMatch(/2 about\.txt/);
  });

  it('top displays cluster monitor snapshot', () => {
    const out = exec(shell(), 'top');
    expect(joined(out.lines)).toContain('NVIDIA H100');
    expect(joined(out.lines)).toContain('shorkie_train.py');
  });

  it('cowsay speaks message in ASCII bubble', () => {
    const out = exec(shell(), 'cowsay Hello genomics');
    expect(joined(out.lines)).toContain('Hello genomics');
    expect(joined(out.lines)).toContain('^__^');
  });

  it('cowsay -d renders a dinosaur', () => {
    const out = exec(shell(), 'cowsay -d Dino');
    expect(joined(out.lines)).toContain('Dino');
    expect(joined(out.lines)).toContain('DNA');
  });

  it('fortune prints scientific quote', () => {
    const out = exec(shell(), 'fortune');
    expect(out.lines[0].text).toMatch(/[“"']/);
  });

  it('matrix prints nucleotide stream', () => {
    const out = exec(shell(), 'matrix');
    expect(out.lines.length).toBeGreaterThan(5);
  });

  it('publications, software, talks, and posts list content', () => {
    const pubOut = exec(shell(), 'publications');
    expect(pubOut.lines[0].text).toBe('PUBLICATIONS');

    const softOut = exec(shell(), 'software');
    expect(softOut.lines[0].text).toBe('RESEARCH SOFTWARE');

    const talkOut = exec(shell(), 'talks');
    expect(talkOut.lines[0].text).toBe('TALKS & PRESENTATIONS');

    const postOut = exec(shell(), 'posts');
    expect(postOut.lines[0].text).toBe('BLOG POSTS & TECHNICAL DEEP DIVES');

    const socialOut = exec(shell(), 'socials');
    expect(socialOut.lines[0].text).toBe('SCHOLAR & SOCIAL PROFILES');
  });

  it('games, snake, and tetris trigger navigation effects', () => {
    const snake = exec(shell(), 'snake');
    expect(snake.effect).toEqual({ type: 'navigate', href: '/software/' });

    const tetris = exec(shell(), 'tetris');
    expect(tetris.effect).toEqual({ type: 'navigate', href: '/software/' });
  });

  it('aliases expand correctly', () => {
    const ll = exec(shell(), 'll');
    expect(joined(ll.lines)).toContain('about.txt');

    const cls = exec(shell(), 'cls');
    expect(cls.effect).toEqual({ type: 'clear' });

    const q = exec(shell(), 'q');
    expect(q.effect).toEqual({ type: 'exit' });

    const help = exec(shell(), '?');
    expect(joined(help.lines)).toContain('khcOS shell');

    const pubs = exec(shell(), 'pubs');
    expect(pubs.lines[0].text).toBe('PUBLICATIONS');
  });

  it('tab completion handles commands, aliases, subcommands, and flags', () => {
    expect(complete(shell(), 'seq').value).toBe('seqkit ');
    expect(complete(shell(), 'gff').value).toBe('gffbase ');
    expect(complete(shell(), 'll').value).toBe('ll ');

    const seqkitSub = complete(shell(), 'seqkit r');
    expect(seqkitSub.value).toBe('seqkit rc ');

    const gffSub = complete(shell(), 'gffbase q');
    expect(gffSub.value).toBe('gffbase query ');

    const themeSub = complete(shell(), 'theme li');
    expect(themeSub.value).toBe('theme light ');

    const ambig = complete(shell(), 't');
    expect(ambig.options).toContain('top');
    expect(ambig.options).toContain('tree');
    expect(ambig.options).toContain('theme');
  });

  it('align command runs Needleman-Wunsch alignment', () => {
    const out = exec(shell(), 'align ACGTAGCTA ACGTCGCTA');
    expect(joined(out.lines)).toContain('Global Pairwise Alignment (Needleman-Wunsch)');
    expect(joined(out.lines)).toContain('Score:');
    expect(joined(out.lines)).toContain('Query:');
    expect(joined(out.lines)).toContain('Target:');
  });

  it('fastqc command produces quality and GC distribution report', () => {
    const out = exec(shell(), 'fastqc ACGTACGTACGT');
    expect(joined(out.lines)).toContain('FastQC v0.12.1');
    expect(joined(out.lines)).toContain('Per-Base Sequence Quality');
    expect(joined(out.lines)).toContain('Per-Base Sequence Content');
  });

  it('cal command renders calendar for date', () => {
    const out = exec(shell(), 'cal 8 2026', new Date(Date.UTC(2026, 7, 16)));
    expect(joined(out.lines)).toContain('August 2026');
    expect(joined(out.lines)).toContain('Su Mo Tu We Th Fr Sa');
    expect(joined(out.lines)).toContain('[16]');
  });

  it('curl command fetches weather and simulated API endpoints', () => {
    const weather = exec(shell(), 'curl wttr.in');
    expect(joined(weather.lines)).toContain('Weather report: San Diego');
    expect(joined(weather.lines)).toContain('Weather report: Baltimore');

    const gh = exec(shell(), 'curl github.com/gffbase');
    expect(joined(gh.lines)).toContain('Kuanhao-Chao');
  });

  it('env command outputs cluster environment variables', () => {
    const out = exec(shell(), 'env');
    expect(joined(out.lines)).toContain('USER=khc');
    expect(joined(out.lines)).toContain('CUDA_VISIBLE_DEVICES=0,1,2,3');
  });

  it('sort, uniq, less, and more inspect files', () => {
    const sortOut = exec(shell(), 'sort about.txt');
    expect(sortOut.lines.length).toBeGreaterThan(0);

    const uniqOut = exec(shell(), 'uniq about.txt');
    expect(uniqOut.lines.length).toBeGreaterThan(0);

    const lessOut = exec(shell(), 'less about.txt');
    expect(joined(lessOut.lines)).toContain('About me');

    const moreOut = exec(shell(), 'more about.txt');
    expect(joined(moreOut.lines)).toContain('About me');
  });

  it('crt and sound commands emit appropriate effects', () => {
    const crt = exec(shell(), 'crt');
    expect(crt.effect).toEqual({ type: 'custom', eventName: 'khc:start-crt', detail: { mode: 'amber' } });

    const sound = exec(shell(), 'sound on');
    expect(sound.effect).toEqual({ type: 'sound', mode: 'on' });
  });

  it('pipelines chain commands across filters', () => {
    const state = shell();
    const pipeGrep = exec(state, 'cat news.txt | grep 2026');
    expect(joined(pipeGrep.lines)).toContain('2026');

    const pipeHead = exec(state, 'top | head -n 3');
    expect(pipeHead.lines.length).toBe(3);

    const pipeWc = exec(state, 'software | wc -l');
    expect(pipeWc.lines[0].text.trim()).toMatch(/^\d+$/);

    const pipeSortUniq = exec(state, 'cat news.txt | sort | uniq');
    expect(pipeSortUniq.lines.length).toBeGreaterThan(0);
  });

  it('git command renders academic commit log, status, branch, and diff', () => {
    const state = shell();
    const gitLog = exec(state, 'git log');
    expect(joined(gitLog.lines)).toContain('LiftOn');
    expect(joined(gitLog.lines)).toContain('Johns Hopkins University');

    const gitTree = exec(state, 'git tree');
    expect(joined(gitTree.lines)).toContain('commit');

    const gitStatus = exec(state, 'git status');
    expect(joined(gitStatus.lines)).toContain('On branch main');
    expect(joined(gitStatus.lines)).toContain('Ph.D. Candidate');

    const gitBranch = exec(state, 'git branch');
    expect(joined(gitBranch.lines)).toContain('* main');

    const gitDiff = exec(state, 'git diff');
    expect(joined(gitDiff.lines)).toContain('ResidualCNN_Transformer');
  });

  it('tview and samtools tview render ASCII sequence alignment window', () => {
    const state = shell();
    const tviewDefault = exec(state, 'tview');
    expect(joined(tviewDefault.lines)).toContain('samtools tview');
    expect(joined(tviewDefault.lines)).toContain('TGAGTCAGCTAGTCGATCGA');

    const tviewGene = exec(state, 'tview TP53');
    expect(joined(tviewGene.lines)).toContain('TP53');

    const samtoolsTview = exec(state, 'samtools tview chr1:1000000');
    expect(joined(samtoolsTview.lines)).toContain('Mean Depth');
  });

  it('man command displays specific formatted manual pages for algorithms and tools', () => {
    const state = shell();
    const manMinimap2 = exec(state, 'man minimap2');
    expect(joined(manMinimap2.lines)).toContain('MINIMAP2(1)');
    expect(joined(manMinimap2.lines)).toContain('Collinear Chaining');

    const manWfa = exec(state, 'man wfa');
    expect(joined(manWfa.lines)).toContain('WFA(1)');
    expect(joined(manWfa.lines)).toContain('Wavefront Alignment');

    const manPairwise = exec(state, 'man pairwise');
    expect(joined(manPairwise.lines)).toContain('PAIRWISE(1)');
    expect(joined(manPairwise.lines)).toContain('Needleman-Wunsch');

    const manDebruijn = exec(state, 'man debruijn');
    expect(joined(manDebruijn.lines)).toContain('DEBRUIJN(1)');
    expect(joined(manDebruijn.lines)).toContain('Hierholzer');

    const manPhmm = exec(state, 'man phmm');
    expect(joined(manPhmm.lines)).toContain('PHMM(1)');
    expect(joined(manPhmm.lines)).toContain('Plan 7');

    const manGhmm = exec(state, 'man ghmm');
    expect(joined(manGhmm.lines)).toContain('GHMM(1)');
    expect(joined(manGhmm.lines)).toContain('Semi-Markov');

    const manFmindex = exec(state, 'man fmindex');
    expect(joined(manFmindex.lines)).toContain('FMINDEX(1)');
    expect(joined(manFmindex.lines)).toContain('LF-Mapping');

    const manLifton = exec(state, 'man lifton');
    expect(joined(manLifton.lines)).toContain('LIFTON(1)');
    expect(joined(manLifton.lines)).toContain('Nature Methods');

    const manSplam = exec(state, 'man splam');
    expect(joined(manSplam.lines)).toContain('SPLAM(1)');
    expect(joined(manSplam.lines)).toContain('Oxford Bioinformatics');

    const manGit = exec(state, 'man git');
    expect(joined(manGit.lines)).toContain('GIT(1)');

    const manDuel = exec(state, 'man duel');
    expect(joined(manDuel.lines)).toContain('DUEL(1)');
    expect(joined(manDuel.lines)).toContain('Wavefront Alignment');

    const manIsm = exec(state, 'man ism');
    expect(joined(manIsm.lines)).toContain('ISM(1)');
    expect(joined(manIsm.lines)).toContain('In Silico Mutagenesis');
  });

  it('duel command navigates to the algorithm duel arena', () => {
    const state = shell();
    const duelOut = exec(state, 'duel');
    expect(duelOut.effect).toEqual({ type: 'navigate', href: '/algorithms/duel/' });

    const raceOut = exec(state, 'race');
    expect(raceOut.effect).toEqual({ type: 'navigate', href: '/algorithms/duel/' });
  });

  it('ism command navigates to the ISM splice visualizer', () => {
    const state = shell();
    const ismOut = exec(state, 'ism');
    expect(ismOut.effect).toEqual({ type: 'navigate', href: '/algorithms/ism/' });

    const spliceaiOut = exec(state, 'spliceai');
    expect(spliceaiOut.effect).toEqual({ type: 'navigate', href: '/algorithms/ism/' });
  });

  it('handles easter egg commands and custom event effects', () => {
    const state = shell();

    // crispr & cas9 alias
    const crisprOut = exec(state, 'crispr');
    expect(crisprOut.effect).toEqual({ type: 'custom', eventName: 'khc:start-crispr' });
    expect(exec(state, 'cas9').effect).toEqual({ type: 'custom', eventName: 'khc:start-crispr' });

    // gravity & zerog alias
    const gravityOut = exec(state, 'gravity');
    expect(gravityOut.effect).toEqual({ type: 'custom', eventName: 'khc:start-zerog' });
    expect(exec(state, 'zerog').effect).toEqual({ type: 'custom', eventName: 'khc:start-zerog' });

    // ribosome & splicerush alias
    const ribOut = exec(state, 'ribosome');
    expect(ribOut.effect).toEqual({ type: 'custom', eventName: 'khc:start-ribosome' });
    expect(exec(state, 'splicerush').effect).toEqual({ type: 'custom', eventName: 'khc:start-ribosome' });

    // synth & piano alias
    const synthOut = exec(state, 'synth');
    expect(synthOut.effect).toEqual({ type: 'custom', eventName: 'khc:start-synth' });
    expect(exec(state, 'piano').effect).toEqual({ type: 'custom', eventName: 'khc:start-synth' });

    // crt command options
    const crtAmber = exec(state, 'crt amber');
    expect(crtAmber.effect).toEqual({ type: 'custom', eventName: 'khc:start-crt', detail: { mode: 'amber' } });
    const crtGreen = exec(state, 'crt green');
    expect(crtGreen.effect).toEqual({ type: 'custom', eventName: 'khc:start-crt', detail: { mode: 'green' } });
    const crtOff = exec(state, 'crt off');
    expect(crtOff.effect).toEqual({ type: 'custom', eventName: 'khc:start-crt', detail: { mode: 'off' } });

    // bg command options
    const bgClassic = exec(state, 'bg classic');
    expect(bgClassic.effect).toEqual({ type: 'custom', eventName: 'khc:set-bg', detail: { mode: 'classic' } });
    const bgCells2 = exec(state, 'bg cells2');
    expect(bgCells2.effect).toEqual({ type: 'custom', eventName: 'khc:set-bg', detail: { mode: 'cells2' } });
    const bgSynteny = exec(state, 'bg synteny');
    expect(bgSynteny.effect).toEqual({ type: 'custom', eventName: 'khc:set-bg', detail: { mode: 'synteny' } });
    const bgOff = exec(state, 'bg off');
    expect(bgOff.effect).toEqual({ type: 'custom', eventName: 'khc:set-bg', detail: { mode: 'off' } });

    // eggs / secrets
    const eggsOut = exec(state, 'eggs');
    expect(joined(eggsOut.lines)).toContain('CRISPR-Cas9');
    expect(joined(eggsOut.lines)).toContain('Zero-Gravity');
    expect(joined(eggsOut.lines)).toContain('Ribosome');
    expect(joined(eggsOut.lines)).toContain('Polyphonic');
    expect(joined(exec(state, 'secrets').lines)).toContain('CRISPR-Cas9');
  });
});


