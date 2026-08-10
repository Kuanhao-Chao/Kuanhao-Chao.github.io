import { describe, it, expect } from 'vitest';
import {
  COMMANDS,
  HOME,
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
  prompt,
  resolvePath,
  search,
  shortCwd,
  tokenize,
  type TermIndex,
} from './terminal';

// A miniature stand-in for /terminal.json — same shape, four files, three dirs.
const fixture = (): TermIndex => ({
  generatedAt: '2026-08-10T00:00:00.000Z',
  identity: {
    name: 'Kuan-Hao Chao',
    nameZh: '趙冠豪',
    role: 'Senior Deep Learning Scientist, Illumina AI Lab',
    email: 'kuanhao.chao@gmail.com',
    tagline: 'Building machine learning for genomics.',
    philosophy: 'Build what you need, use what you build.',
    bio: 'I build machine learning for genomics.',
    jobTitle: 'Senior Deep Learning Scientist',
    worksFor: 'Illumina',
    alumniOf: ['Johns Hopkins University', 'National Taiwan University'],
    knowsAbout: ['Genomics', 'Deep learning'],
    alternateNames: ['趙冠豪', 'Kuanhao Chao'],
    socials: [{ key: 'github', label: 'GitHub', href: 'https://github.com/Kuanhao-Chao' }],
  },
  stats: { publications: 15, talks: 22, software: 6, research: 5, posts: 8, news: 49, reviewing: 13 },
  fs: {
    [`${HOME}/about.txt`]: { title: 'About', body: 'About me.\nSecond line.', href: '/', kind: 'file' },
    [`${HOME}/news.txt`]: { title: 'Recent news', body: '2026-08-06  Cell paper', href: '/news/', kind: 'file' },
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

describe('motd', () => {
  it('renders the banner with live counts and no empty placeholders', () => {
    const text = joined(motd(fixture(), new Date('2026-08-10T12:00:00Z')));
    expect(text).toContain('Kuan-Hao Chao');
    expect(text).toContain('khcOS 1.0.0');
    expect(text).toMatch(/Publications \.+ 15/);
    expect(text).not.toContain('undefined');
    expect(text).not.toContain('NaN');
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

describe('the offline brain', () => {
  it('quotes the winning chunk, not the digest that shares its path', () => {
    const lines = offlineAnswer(fixture(), 'LiftOn v1.0.0 released');
    const text = joined(lines);
    // The digest body is the news file's own content; it must not be the answer.
    if (lines[0].text === 'LiftOn v1.0.0 is released') {
      expect(text).not.toContain('2026-08-06  Cell paper');
    }
  });

  it('leads with the best-matching entry and links it', () => {
    const lines = offlineAnswer(fixture(), 'what does LiftOn do?');
    expect(lines[0].text).toBe('LiftOn');
    expect(lines.some((l) => l.href === '/publications/lifton/')).toBe(true);
  });

  it('lists the runners-up as related', () => {
    expect(joined(offlineAnswer(fixture(), 'genomics annotation splice'))).toContain('Related:');
  });

  it('says so plainly when it has nothing, instead of inventing an answer', () => {
    const lines = offlineAnswer(fixture(), 'quantum chromodynamics');
    expect(lines[0].text).toContain("don't have anything indexed");
  });

  it('handles a stopword-only question without throwing', () => {
    expect(() => offlineAnswer(fixture(), 'what is the')).not.toThrow();
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

  it('sudo refuses, as it should', () => {
    expect(exec(shell(), 'sudo rm -rf /').lines[0].text).toContain('not in the sudoers file');
  });
});
