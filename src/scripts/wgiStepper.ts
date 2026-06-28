// Idempotent, multi-instance stepper engine for the Wheeler-graph index visualizations.
// One generic controller wires Prev / Next / Play-pause / Reset + Arrow/Home/End keys, an aria-live
// caption, and a "i / n" readout. Components supply `total`, an `onShow(i)` renderer, and a `caption(i)`.
// View-Transitions safe: per-root `dataset.wgiBound` guard; callers re-run on `astro:page-load`.

export interface StepperOpts {
  total: number;
  onShow: (i: number) => void;
  caption?: (i: number) => string;
  interval?: number;
}

export interface StepperApi {
  show: (i: number) => void;
  stop: () => void;
  setTotal: (t: number) => void;
  readonly step: number;
}

export function mountStepper(root: HTMLElement, opts: StepperOpts): StepperApi | null {
  if (root.dataset.wgiBound === 'true') return (root as any)._wgi ?? null;
  root.dataset.wgiBound = 'true';

  const cap = root.querySelector<HTMLElement>('[data-wgi-caption]');
  const pos = root.querySelector<HTMLElement>('[data-wgi-pos]');
  const btn = (s: string) => root.querySelector<HTMLButtonElement>(`[data-wgi-${s}]`);
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');

  let step = 0;
  let timer = 0;
  let total = Math.max(1, opts.total);

  const setPlay = (on: boolean) => btn('play')?.setAttribute('aria-pressed', on ? 'true' : 'false');

  function show(i: number) {
    step = Math.max(0, Math.min(total - 1, i));
    opts.onShow(step);
    if (cap && opts.caption) cap.textContent = opts.caption(step);
    if (pos) pos.textContent = `${step + 1} / ${total}`;
    btn('prev')?.toggleAttribute('disabled', step === 0);
    btn('next')?.toggleAttribute('disabled', step === total - 1);
  }

  function stop() {
    if (timer) { clearInterval(timer); timer = 0; }
    setPlay(false);
  }

  function play() {
    if (reduce.matches) { show(total - 1); return; } // honor reduced motion: jump to the end
    stop();
    setPlay(true);
    timer = window.setInterval(() => {
      if (step >= total - 1) { stop(); return; }
      show(step + 1);
    }, opts.interval ?? 1600);
  }

  btn('prev')?.addEventListener('click', () => { stop(); show(step - 1); });
  btn('next')?.addEventListener('click', () => { stop(); show(step + 1); });
  btn('reset')?.addEventListener('click', () => { stop(); show(0); });
  btn('play')?.addEventListener('click', () => (timer ? stop() : play()));

  root.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.key === 'ArrowRight') { stop(); show(step + 1); e.preventDefault(); }
    else if (e.key === 'ArrowLeft') { stop(); show(step - 1); e.preventDefault(); }
    else if (e.key === 'Home') { stop(); show(0); e.preventDefault(); }
    else if (e.key === 'End') { stop(); show(total - 1); e.preventDefault(); }
  });

  document.addEventListener('astro:before-swap', stop, { once: true });

  const api: StepperApi = {
    show, stop,
    setTotal(t: number) { total = Math.max(1, t); show(0); },
    get step() { return step; },
  };
  (root as any)._wgi = api;
  show(0);
  return api;
}
