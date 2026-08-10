/**
 * DOM controller for the /terminal/ shell.
 *
 * Owns everything the pure engine (`src/lib/terminal.ts`) deliberately does not:
 * the keyboard, the lazy `/terminal.json` fetch, wall-clock time, scrolling, and
 * turning `Line[]` into nodes.
 *
 * Output is built with `createElement` + `textContent` only — never by assembling
 * markup strings. A terminal echoes text the visitor typed, so that is the whole
 * XSS story, and it is also what keeps `npm run audit:security` green.
 */

import {
  COMMANDS,
  NEEDS_INDEX,
  bootLines,
  buildContext,
  complete,
  dnaFrame,
  createShell,
  exec,
  historyStep,
  motd,
  offlineAnswer,
  parseArgv,
  prompt,
  stripThinking,
  wrapText,
  type Line,
  type ShellState,
  type TermIndex,
} from '../lib/terminal';
import { askEndpoint } from '../data/site';

export interface TerminalController {
  destroy: () => void;
}

/** One scripted step of the homepage demo: a command and its precomputed output. */
export interface DemoStep {
  cmd: string;
  out: string[];
}

export interface TerminalOptions {
  /** The DNA boot sequence. Off for the inline homepage mounting. */
  boot?: boolean;
  /**
   * Auto-typed demo, used until the visitor touches the shell. The output is
   * precomputed at build time, so an inline mounting costs no index fetch until
   * someone actually interacts with it.
   */
  demo?: DemoStep[];
  /** Where `exit` goes. The homepage sends it to the full-screen shell. */
  exitHref?: string;
}

const INDEX_URL = '/terminal.json';

export function initTerminal(
  root: ParentNode = document,
  options: TerminalOptions = {}
): TerminalController | null {
  const { boot = true, demo = [], exitHref = '/' } = options;
  const shellEl = root.querySelector<HTMLElement>('[data-terminal]');
  if (!shellEl) return null;
  if (shellEl.dataset.terminalReady === 'true') return null;
  shellEl.dataset.terminalReady = 'true';

  const screen = shellEl.querySelector<HTMLElement>('[data-terminal-screen]');
  const input = shellEl.querySelector<HTMLInputElement>('[data-terminal-input]');
  const promptEl = shellEl.querySelector<HTMLElement>('[data-terminal-prompt]');
  if (!screen || !input || !promptEl) return null;

  const state: ShellState = createShell(null);
  let indexPromise: Promise<TermIndex | null> | null = null;
  let busy = false;
  let skipBoot: (() => void) | null = null;
  const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  // A 76-column banner only pans on a phone, so the engine stacks it instead.
  const isNarrow = () => window.innerWidth < 700;

  // ------------------------------------------------------------- rendering --

  function lineEl(line: Line): HTMLElement {
    const el = document.createElement('div');
    el.className = line.tone ? `term-line term-${line.tone}` : 'term-line';
    if (line.prefix) {
      const badge = document.createElement('span');
      badge.className = 'term-ok';
      badge.textContent = line.prefix;
      el.append(badge, document.createTextNode(line.text));
      return el;
    }
    if (line.href) {
      const a = document.createElement('a');
      a.className = 'term-link';
      a.href = line.href;
      a.textContent = line.text;
      if (/^https?:/i.test(line.href)) {
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
      }
      el.appendChild(a);
    } else {
      // A zero-width space keeps blank lines from collapsing to zero height.
      el.textContent = line.text === '' ? '​' : line.text;
    }
    return el;
  }

  function writeLine(line: Line): HTMLElement {
    const el = lineEl(line);
    screen!.appendChild(el);
    return el;
  }

  const write = (lines: Line[]) => lines.forEach(writeLine);

  function echoCommand(text: string) {
    const el = document.createElement('div');
    el.className = 'term-line term-echo';
    const ps1 = document.createElement('span');
    ps1.className = 'term-ps1';
    ps1.textContent = `${prompt(state)} `;
    const cmd = document.createElement('span');
    cmd.textContent = text;
    el.append(ps1, cmd);
    screen!.appendChild(el);
  }

  function scrollToEnd() {
    screen!.scrollTop = screen!.scrollHeight;
  }

  function setBusy(next: boolean) {
    busy = next;
    input!.disabled = next;
    shellEl!.classList.toggle('is-busy', next);
    if (!next) input!.focus({ preventScroll: true });
  }

  const refreshPrompt = () => {
    promptEl!.textContent = prompt(state);
  };

  // ----------------------------------------------------------------- index --

  /** Fetched on first need, so the banner paints without waiting on the network. */
  function loadIndex(): Promise<TermIndex | null> {
    if (!indexPromise) {
      indexPromise = fetch(INDEX_URL)
        .then((res) => (res.ok ? (res.json() as Promise<TermIndex>) : null))
        .then((data) => {
          state.index = data;
          return data;
        })
        .catch(() => null);
    }
    return indexPromise;
  }

  // ------------------------------------------------------------- effects ----

  function runEffect(effect: NonNullable<ReturnType<typeof exec>['effect']>) {
    switch (effect.type) {
      case 'clear':
        while (screen!.firstChild) screen!.removeChild(screen!.firstChild);
        break;
      case 'navigate':
        if (/^https?:/i.test(effect.href)) window.open(effect.href, '_blank', 'noopener,noreferrer');
        else window.setTimeout(() => window.location.assign(effect.href), reduced ? 0 : 260);
        break;
      case 'exit':
        window.setTimeout(() => window.location.assign(exitHref), reduced ? 0 : 420);
        break;
      case 'ask':
        void answer(effect.question);
        break;
    }
  }

  /**
   * Try the free Workers AI endpoint, fall back to the in-browser index.
   *
   * The fallback is unconditional — no endpoint configured, non-2xx, rate limited,
   * out of daily Neurons, offline, or an empty answer all land in the same place.
   * `ask` must never dead-end.
   */
  async function answer(question: string) {
    setBusy(true);
    const status = writeLine({ text: 'searching…', tone: 'dim' });
    scrollToEnd();

    const index = await loadIndex();
    if (!index) {
      status.remove();
      write([{ text: 'ask: knowledge index unavailable — try reloading.', tone: 'err' }, { text: '' }]);
      setBusy(false);
      scrollToEnd();
      return;
    }

    let answered = false;
    if (askEndpoint) {
      status.textContent = 'thinking…';
      answered = await streamFromModel(question, index, status);
    }
    if (!answered) {
      status.remove();
      write(offlineAnswer(index, question));
    }

    write([{ text: '' }]);
    setBusy(false);
    scrollToEnd();
  }

  /** Returns true only if the model produced a usable answer. */
  async function streamFromModel(question: string, index: TermIndex, status: HTMLElement) {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 20_000);
    try {
      const res = await fetch(askEndpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ question, context: buildContext(index, question) }),
        signal: controller.signal,
      });
      if (!res.ok || !res.body) return false;

      status.remove();
      const block = document.createElement('div');
      screen!.appendChild(block);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let sse = '';
      let text = '';

      const paint = () => {
        const lines = wrapText(stripThinking(text));
        while (block.childNodes.length > lines.length) block.lastChild!.remove();
        lines.forEach((line, i) => {
          const el = (block.childNodes[i] as HTMLElement) ?? block.appendChild(lineEl({ text: '' }));
          el.textContent = line === '' ? '​' : line;
        });
        scrollToEnd();
      };

      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        sse += decoder.decode(value, { stream: true });
        const events = sse.split('\n');
        sse = events.pop() ?? '';
        for (const line of events) {
          if (!line.startsWith('data:')) continue;
          const payload = line.slice(5).trim();
          if (!payload || payload === '[DONE]') continue;
          try {
            const delta = JSON.parse(payload) as { response?: string };
            if (delta.response) {
              text += delta.response;
              paint();
            }
          } catch {
            /* a partial JSON frame; the next chunk completes it */
          }
        }
      }

      if (!stripThinking(text).trim()) {
        block.remove();
        return false;
      }
      paint();
      return true;
    } catch {
      return false;
    } finally {
      window.clearTimeout(timeout);
    }
  }

  // ------------------------------------------------------------ submitting --

  async function submit(raw: string) {
    echoCommand(raw);
    input!.value = '';

    const name = parseArgv(raw.trim())[0] ?? '';
    const needsIndex = state.chatMode || NEEDS_INDEX.has(name) || !COMMANDS[name];
    if (needsIndex && !state.index) {
      setBusy(true);
      await loadIndex();
      setBusy(false);
    }

    const { lines, effect } = exec(state, raw, new Date(), isNarrow());
    write(lines);
    if (lines.length) write([{ text: '' }]);
    refreshPrompt();
    if (effect) runEffect(effect);
    scrollToEnd();
  }

  // -------------------------------------------------------------- keyboard --

  function onKeyDown(event: KeyboardEvent) {
    if (busy) {
      event.preventDefault();
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      void submit(input!.value);
      return;
    }
    if (event.key === 'Tab') {
      event.preventDefault();
      const { value, options } = complete(state, input!.value);
      input!.value = value;
      if (options.length) {
        echoCommand(input!.value);
        write([{ text: options.join('   '), tone: 'dim' }, { text: '' }]);
        scrollToEnd();
      }
      return;
    }
    if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      event.preventDefault();
      input!.value = historyStep(state, event.key === 'ArrowUp' ? -1 : 1, input!.value);
      // Put the caret at the end so editing a recalled line feels native.
      window.requestAnimationFrame(() => input!.setSelectionRange(input!.value.length, input!.value.length));
      return;
    }
    if (event.ctrlKey && (event.key === 'c' || event.key === 'C')) {
      event.preventDefault();
      echoCommand(`${input!.value}^C`);
      input!.value = '';
      scrollToEnd();
      return;
    }
    if (event.ctrlKey && (event.key === 'l' || event.key === 'L')) {
      event.preventDefault();
      while (screen!.firstChild) screen!.removeChild(screen!.firstChild);
      return;
    }
    if (event.ctrlKey && (event.key === 'u' || event.key === 'U')) {
      event.preventDefault();
      input!.value = '';
    }
  }

  /** Clicking anywhere in the shell focuses the caret — unless text is selected. */
  function onShellClick(event: MouseEvent) {
    if ((event.target as HTMLElement)?.closest('a')) return;
    if (window.getSelection()?.toString()) return;
    input!.focus({ preventScroll: true });
  }

  // ----------------------------------------------------------------- boot ---

  // Identity + counts are inlined into the page at build time, so the boot log and
  // banner paint on the first frame and never wait on the index fetch.
  const bootIndex = {
    ...(JSON.parse(shellEl.dataset.terminalBoot ?? '{}') as TermIndex),
    fs: {},
    chunks: [],
  } as TermIndex;

  let bootRaf = 0;
  let bootTimer = 0;
  let booting = true;

  function printBanner() {
    write(motd(bootIndex, new Date(), isNarrow()));
    refreshPrompt();
    booting = false;
    input!.focus({ preventScroll: true });
    scrollToEnd();
  }

  /**
   * A short POST-style boot with the helix spinning beside it. Skippable by any
   * key, click or tap, and skipped entirely under `prefers-reduced-motion` — the
   * site kills all animation in that mode, so honour it rather than fight it.
   *
   * No `visibilitychange` handling on purpose: rAF simply does not fire in a hidden
   * tab, so the helix pauses for free while the log finishes on its timers.
   */
  function runBoot() {
    const log = bootLines(bootIndex);

    if (reduced) {
      const wrap = buildBootShell();
      wrap.dna.textContent = dnaFrame(1.2).join('\n');
      for (const line of log) wrap.log.appendChild(lineEl(line));
      printBanner();
      return;
    }

    const wrap = buildBootShell();
    let phase = 0;
    let last = 0;
    const spin = (ts: number) => {
      if (!last) last = ts;
      phase += (ts - last) / 340;
      last = ts;
      wrap.dna.textContent = dnaFrame(phase).join('\n');
      bootRaf = requestAnimationFrame(spin);
    };
    bootRaf = requestAnimationFrame(spin);

    let i = 0;
    const emit = () => {
      if (i >= log.length) return finishBoot();
      wrap.log.appendChild(lineEl(log[i++]));
      scrollToEnd();
      bootTimer = window.setTimeout(emit, 105);
    };
    bootTimer = window.setTimeout(emit, 70);

    function finishBoot() {
      window.clearTimeout(bootTimer);
      cancelAnimationFrame(bootRaf);
      bootRaf = 0;
      // Leave the last frame frozen — it reads as a logo above the banner.
      document.removeEventListener('keydown', onSkip, true);
      shellEl!.removeEventListener('pointerdown', onSkip, true);
      printBanner();
    }

    function onSkip() {
      if (!booting) return;
      while (i < log.length) wrap.log.appendChild(lineEl(log[i++]));
      finishBoot();
    }

    document.addEventListener('keydown', onSkip, true);
    shellEl!.addEventListener('pointerdown', onSkip, true);
    skipBoot = onSkip;
  }

  function buildBootShell() {
    const wrap = document.createElement('div');
    wrap.className = 'term-boot';
    const dna = document.createElement('pre');
    dna.className = 'term-boot-dna';
    dna.setAttribute('aria-hidden', 'true');
    const log = document.createElement('div');
    log.className = 'term-boot-log';
    wrap.append(dna, log);
    screen!.appendChild(wrap);
    return { dna, log };
  }

  // ----------------------------------------------------------------- demo ---

  let demoTimer = 0;
  let demoRunning = false;

  /**
   * Type a scripted demo into the real input, then hand the shell over the instant
   * the visitor touches it.
   *
   * Takeover has to land *before* the keystroke it reacts to, or the demo's
   * half-typed command and the visitor's first character interleave into gibberish.
   * Hence a capture-phase listener that clears the field synchronously and then
   * lets the event continue to the normal handler.
   */
  function runDemo() {
    demoRunning = true;
    let step = 0;
    let char = 0;
    let phase: 'typing' | 'output' = 'typing';

    const tick = () => {
      if (!demoRunning) return;
      const current = demo[step % demo.length];
      if (phase === 'typing') {
        if (char < current.cmd.length) {
          input!.value = current.cmd.slice(0, ++char);
          demoTimer = window.setTimeout(tick, 55);
          return;
        }
        phase = 'output';
        demoTimer = window.setTimeout(tick, 300);
        return;
      }
      echoCommand(current.cmd);
      input!.value = '';
      for (const line of current.out) writeLine({ text: line, tone: 'dim' });
      writeLine({ text: '' });
      scrollToEnd();
      step += 1;
      char = 0;
      phase = 'typing';
      // Wipe the transcript before looping so the card never grows unbounded.
      if (step % demo.length === 0) {
        demoTimer = window.setTimeout(() => {
          if (!demoRunning) return;
          while (screen!.firstChild) screen!.removeChild(screen!.firstChild);
          tick();
        }, 2200);
        return;
      }
      demoTimer = window.setTimeout(tick, 1200);
    };

    demoTimer = window.setTimeout(tick, 400);
  }

  function takeOver() {
    if (!demoRunning) return;
    demoRunning = false;
    window.clearTimeout(demoTimer);
    input!.value = '';
    document.removeEventListener('keydown', takeOver, true);
    shellEl!.removeEventListener('pointerdown', takeOver, true);
    writeLine({ text: '— ready. type `help`, or `ask` a question —', tone: 'ok' });
    writeLine({ text: '' });
    scrollToEnd();
    // The visitor opted in, so it is now fair to pull the knowledge index.
    void loadIndex();
  }

  input.addEventListener('keydown', onKeyDown);
  shellEl.addEventListener('click', onShellClick);

  if (boot) {
    runBoot();
    // Warm the index in the background while the boot plays.
    window.setTimeout(() => void loadIndex(), 120);
  } else {
    booting = false;
    refreshPrompt();
    if (demo.length && !reduced) {
      document.addEventListener('keydown', takeOver, true);
      shellEl.addEventListener('pointerdown', takeOver, true);
      runDemo();
    } else if (demo.length) {
      // Reduced motion: show the finished demo rather than animating into it.
      for (const stepDef of demo) {
        echoCommand(stepDef.cmd);
        for (const line of stepDef.out) writeLine({ text: line, tone: 'dim' });
        writeLine({ text: '' });
      }
    }
  }

  // A Playwright hook, matching the games' `window.__<name>` convention.
  (window as unknown as Record<string, unknown>).__terminal = {
    submit: (line: string) => submit(line),
    state,
    text: () => screen.textContent ?? '',
    booting: () => booting,
    skipBoot: () => skipBoot?.(),
    demoing: () => demoRunning,
    takeOver: () => takeOver(),
  };

  return {
    destroy() {
      window.clearTimeout(bootTimer);
      window.clearTimeout(demoTimer);
      demoRunning = false;
      document.removeEventListener('keydown', takeOver, true);
      shellEl.removeEventListener('pointerdown', takeOver, true);
      if (bootRaf) cancelAnimationFrame(bootRaf);
      input.removeEventListener('keydown', onKeyDown);
      shellEl.removeEventListener('click', onShellClick);
      delete (window as unknown as Record<string, unknown>).__terminal;
      shellEl.dataset.terminalReady = '';
    },
  };
}
