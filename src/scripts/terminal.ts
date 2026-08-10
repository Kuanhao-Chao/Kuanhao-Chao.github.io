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
  complete,
  createShell,
  exec,
  historyStep,
  motd,
  offlineAnswer,
  parseArgv,
  prompt,
  type Line,
  type ShellState,
  type TermIndex,
} from '../lib/terminal';

export interface TerminalController {
  destroy: () => void;
}

const INDEX_URL = '/terminal.json';

export function initTerminal(root: ParentNode = document): TerminalController | null {
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
  const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  // A 76-column banner only pans on a phone, so the engine stacks it instead.
  const isNarrow = () => window.innerWidth < 700;

  // ------------------------------------------------------------- rendering --

  function writeLine(line: Line): HTMLElement {
    const el = document.createElement('div');
    el.className = line.tone ? `term-line term-${line.tone}` : 'term-line';
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
        window.setTimeout(() => window.location.assign('/'), reduced ? 0 : 420);
        break;
      case 'ask':
        void answer(effect.question);
        break;
    }
  }

  /**
   * Phase 1: answer from the in-browser index. Phase 2 will try the Claude
   * endpoint first and fall back to exactly this call when it is unreachable.
   */
  async function answer(question: string) {
    setBusy(true);
    const thinking = writeLine({ text: 'searching…', tone: 'dim' });
    scrollToEnd();
    const index = await loadIndex();
    thinking.remove();
    write(
      index
        ? offlineAnswer(index, question)
        : [{ text: 'ask: knowledge index unavailable — try reloading.', tone: 'err' }]
    );
    write([{ text: '' }]);
    setBusy(false);
    scrollToEnd();
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

  input.addEventListener('keydown', onKeyDown);
  shellEl.addEventListener('click', onShellClick);

  write(
    motd(
      {
        // The banner needs only identity + stats; both are inlined into the page at
        // build time, so it paints instantly and never waits on the index fetch.
        ...(JSON.parse(shellEl.dataset.terminalBoot ?? '{}') as TermIndex),
        fs: {},
        chunks: [],
      } as TermIndex,
      new Date(),
      isNarrow()
    )
  );
  refreshPrompt();
  input.focus({ preventScroll: true });

  // Warm the index in the background once the banner is on screen.
  window.setTimeout(() => void loadIndex(), 120);

  // A Playwright hook, matching the games' `window.__<name>` convention.
  (window as unknown as Record<string, unknown>).__terminal = {
    submit: (line: string) => submit(line),
    state,
    text: () => screen.textContent ?? '',
  };

  return {
    destroy() {
      input.removeEventListener('keydown', onKeyDown);
      shellEl.removeEventListener('click', onShellClick);
      delete (window as unknown as Record<string, unknown>).__terminal;
      shellEl.dataset.terminalReady = '';
    },
  };
}
