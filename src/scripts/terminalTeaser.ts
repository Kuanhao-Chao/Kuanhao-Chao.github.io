/**
 * The homepage terminal teaser: types a scripted demo on a loop.
 *
 * Deliberately *not* a shell — it is a link that looks alive. The real thing is one
 * click away at /terminal/, and keeping this read-only means the homepage never
 * pays for the 135 KB knowledge index.
 *
 * The script itself is rendered into the markup at build time from the same data
 * the shell uses, so the teaser can't quote something the shell wouldn't.
 */

export interface TeaserController {
  destroy: () => void;
}

interface Step {
  cmd: string;
  out: string[];
}

const TYPE_MS = 55;
const HOLD_AFTER_CMD = 260;
const HOLD_AFTER_OUT = 1500;
const LINE_MS = 90;

export function initTerminalTeaser(root: ParentNode = document): TeaserController | null {
  const host = root.querySelector<HTMLElement>('[data-teaser]');
  if (!host) return null;
  if (host.dataset.teaserReady === 'true') return null;
  host.dataset.teaserReady = 'true';

  const screen = host.querySelector<HTMLElement>('[data-teaser-screen]');
  if (!screen) return null;

  let steps: Step[] = [];
  try {
    steps = JSON.parse(host.dataset.teaserScript ?? '[]') as Step[];
  } catch {
    steps = [];
  }
  if (!steps.length) return null;

  const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  let timer = 0;
  let stopped = false;
  let visible = true;

  const clear = () => {
    while (screen.firstChild) screen.removeChild(screen.firstChild);
  };

  function row(text: string, cls?: string): HTMLElement {
    const el = document.createElement('div');
    el.className = cls ? `teaser-line ${cls}` : 'teaser-line';
    el.textContent = text === '' ? '​' : text;
    screen!.appendChild(el);
    return el;
  }

  function promptRow(): { el: HTMLElement; body: Text } {
    const el = document.createElement('div');
    el.className = 'teaser-line teaser-cmd';
    const ps1 = document.createElement('span');
    ps1.className = 'teaser-ps1';
    ps1.textContent = 'khc@genome:~$ ';
    const body = document.createTextNode('');
    el.append(ps1, body);
    screen!.appendChild(el);
    return { el, body };
  }

  /** Render the whole demo at once — the reduced-motion and off-screen fallback. */
  function renderStatic() {
    clear();
    for (const step of steps) {
      promptRow().body.data = step.cmd;
      for (const line of step.out) row(line, 'teaser-out');
      row('');
    }
  }

  const wait = (ms: number) => new Promise<void>((res) => (timer = window.setTimeout(res, ms)));

  async function loop() {
    while (!stopped) {
      clear();
      for (const step of steps) {
        if (stopped) return;
        const { body } = promptRow();
        for (const ch of step.cmd) {
          if (stopped) return;
          body.data += ch;
          await wait(TYPE_MS);
        }
        await wait(HOLD_AFTER_CMD);
        for (const line of step.out) {
          if (stopped) return;
          row(line, 'teaser-out');
          await wait(LINE_MS);
        }
        row('');
        await wait(HOLD_AFTER_OUT);
      }
    }
  }

  // Pause while off-screen so an unread homepage isn't animating in the background.
  const io =
    typeof IntersectionObserver !== 'undefined'
      ? new IntersectionObserver(
          (entries) => {
            visible = entries.some((e) => e.isIntersecting);
            if (!visible) {
              stopped = true;
              window.clearTimeout(timer);
            } else if (!reduced && stopped) {
              stopped = false;
              void loop();
            }
          },
          { threshold: 0.15 }
        )
      : null;

  if (reduced) {
    renderStatic();
  } else {
    io?.observe(host);
    if (!io) void loop();
    else if (visible) void loop();
  }

  return {
    destroy() {
      stopped = true;
      window.clearTimeout(timer);
      io?.disconnect();
      host.dataset.teaserReady = '';
    },
  };
}
