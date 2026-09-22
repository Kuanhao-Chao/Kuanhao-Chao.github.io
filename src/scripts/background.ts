import {
  BACKGROUND_KEY,
  MOTIONS,
  SCENES,
  backgroundRouteAllowed,
  resolveBackground,
  type BackgroundPreference,
} from '../lib/backgroundModel';
import { getLivingCellsEngine } from '../lib/livingCellsEngine';
import type { SceneRenderer } from '../lib/backgroundRenderer';

let preference: BackgroundPreference = { scene: 'cells', motion: 'ambient' };
let renderer: SceneRenderer | null = null;
let canvas: HTMLCanvasElement | null = null;
let generation = 0;
let installed = false;
let resizeObserver: ResizeObserver | null = null;
let maskRaf = 0;
let bounds: Array<{ x: number; y: number; w: number; h: number }> = [];
let mask: HTMLCanvasElement | null = null;
let demo: SceneRenderer | null = null;
let demoGeneration = 0;
let demoPlaying = false;
let demoInterval = 0;
let demoObserver: ResizeObserver | null = null;
let dialog: HTMLDialogElement | null = null;
let focusBefore: HTMLElement | null = null;
let scrollBefore = '';
let selecting = false;
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const active = () =>
  backgroundRouteAllowed(location.pathname) && !!document.querySelector('[data-site-bg-canvas]');
const $ = <T extends HTMLElement>(selector: string) => document.querySelector<T>(selector);

function readPreference() {
  try {
    preference = resolveBackground(
      localStorage.getItem(BACKGROUND_KEY),
      localStorage.getItem('khc-cell-mode')
    );
  } catch {
    /* Keep the in-memory choice when storage is unavailable. */
  }
}
function notify() {
  const root = document.documentElement;
  root.dataset.backgroundScene = preference.scene;
  root.dataset.backgroundMotion = preference.motion;
  root.dataset.backgroundExploring = String(!!dialog?.open);
  document.dispatchEvent(
    new CustomEvent('khc:background-change', {
      detail: { ...preference, exploring: !!dialog?.open },
    })
  );
  for (const [attribute, selected] of [
    ['scene', preference.scene],
    ['motion', preference.motion],
  ]) {
    document
      .querySelectorAll<HTMLButtonElement>(`button[data-background-${attribute}]`)
      .forEach((button) => {
        const checked = button.getAttribute(`data-background-${attribute}`) === selected;
        button.setAttribute('aria-checked', String(checked));
        button.tabIndex = checked ? 0 : -1;
        button.disabled = attribute === 'motion' && preference.scene === 'off';
      });
  }
  const hint = $('[data-background-hint]');
  if (hint)
    hint.textContent =
      preference.scene === 'off'
        ? 'All decorative backgrounds are hidden.'
        : reduced()
          ? 'Reduced motion is enabled. Showing a still composition.'
          : preference.motion === 'paused'
            ? 'The scene is paused. Your reading stays still.'
            : preference.motion === 'calm'
              ? 'Gentler motion and lower contrast while you read.'
              : 'Quiet motion in the background. Your choice is remembered.';
  const explore = $<HTMLButtonElement>('[data-background-explore]');
  if (explore) {
    explore.disabled = preference.scene === 'off' || !active();
    explore.textContent = preference.scene === 'cells' ? 'Open Cell Lab ↗' : 'Explore background ↗';
  }
}
function applyRunning() {
  const suspended =
    !active() ||
    document.hidden ||
    !!dialog?.open ||
    selecting ||
    preference.motion === 'paused' ||
    reduced();
  if (preference.scene === 'cells' && active())
    getLivingCellsEngine().setBackgroundSuspended(suspended);
  renderer?.setRunning(!suspended && !getSelection()?.toString());
  demo?.setRunning(demoPlaying && !document.hidden && !reduced());
}
function collectBounds() {
  bounds = [];
  if (!canvas || !renderer) return;
  const selector =
    'main h1, main h2, main h3, main h4, main h5, main h6, main a, main label, main p, main li, main dt, main dd, main blockquote, main pre, main table, main button, main input, main select, main summary, main img, main canvas, main iframe, main video, main audio, main [data-terminal], main [data-cell-protected], main [data-background-protected], header.site-header, footer';
  document.querySelectorAll<HTMLElement>(selector).forEach((element) => {
    if (element.closest('[data-background-dialog]')) return;
    for (const r of element.getClientRects()) {
      if (r.width && r.height)
        bounds.push({ x: r.left + scrollX, y: r.top + scrollY, w: r.width, h: r.height });
    }
  });
  paintMask();
}
function paintMask() {
  maskRaf = 0;
  if (!canvas || !renderer || !mask) return;
  const w = canvas.clientWidth,
    h = canvas.clientHeight;
  if (mask.width !== w || mask.height !== h) {
    mask.width = w;
    mask.height = h;
  }
  const ctx = mask.getContext('2d');
  if (!ctx) return;
  ctx.clearRect(0, 0, w, h);
  for (const rect of bounds) {
    const x = rect.x - scrollX,
      y = rect.y - scrollY;
    if (y > h + 30 || y + rect.h < -30 || x > w + 30 || x + rect.w < -30) continue;
    ctx.shadowColor = '#000';
    ctx.shadowBlur = 18;
    ctx.fillStyle = '#000';
    ctx.fillRect(x - 6, y - 6, rect.w + 12, rect.h + 12);
  }
  ctx.shadowBlur = 0;
  // The fixed header does not move with the document-coordinate boxes above.
  const header = $('.site-header');
  if (header) {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, w, header.offsetHeight + 6);
  }
  renderer.setMask(mask);
}
function scheduleMask() {
  if (renderer && !maskRaf) maskRaf = requestAnimationFrame(paintMask);
}
function detach() {
  generation++;
  selecting = false;
  closeDemo();
  resizeObserver?.disconnect();
  resizeObserver = null;
  renderer?.dispose();
  renderer = null;
  getLivingCellsEngine().detach();
  canvas = null;
  mask = null;
  bounds = [];
  cancelAnimationFrame(maskRaf);
  maskRaf = 0;
}
async function attach() {
  const token = ++generation;
  renderer?.dispose();
  renderer = null;
  resizeObserver?.disconnect();
  resizeObserver = null;
  canvas = $<HTMLCanvasElement>('[data-art-bg-canvas]');
  const cells = $<HTMLCanvasElement>('[data-site-bg-canvas]');
  notify();
  if (canvas) canvas.hidden = true;
  if (cells) cells.hidden = true;
  // Dedicated labs own the singleton on their route, regardless of listener order.
  if (!active()) return;
  getLivingCellsEngine().detach();
  if (!canvas || !cells || preference.scene === 'off') return;
  if (preference.scene === 'cells') {
    cells.hidden = false;
    const engine = getLivingCellsEngine();
    engine.setMode(preference.motion === 'calm' ? 'calm' : 'ambient');
    engine.setBackgroundSuspended(preference.motion === 'paused' || reduced() || !!dialog?.open);
    engine.attach(cells);
  } else {
    try {
      const { createSceneRenderer } = await import('../lib/backgroundRenderer');
      if (token !== generation || !canvas) return;
      canvas.hidden = false;
      canvas.dataset.bgScene = preference.scene;
      delete canvas.dataset.bgFallback;
      renderer = createSceneRenderer(canvas, preference.scene);
      renderer.setMotion(preference.motion);
      mask = document.createElement('canvas');
      collectBounds();
      resizeObserver = new ResizeObserver(collectBounds);
      resizeObserver.observe(document.body);
      applyRunning();
    } catch {
      if (token !== generation) return;
      if (canvas) canvas.hidden = true;
      const hint = $('[data-background-hint]');
      if (hint) hint.textContent = 'This background could not load. Choose another scene to retry.';
    }
  }
  applyRunning();
}
async function select(patch: Partial<BackgroundPreference>) {
  closeDemo();
  const oldScene = preference.scene;
  preference = { ...preference, ...patch };
  try {
    localStorage.setItem(BACKGROUND_KEY, JSON.stringify(preference));
  } catch {
    /* Session-only preference. */
  }
  if (!active() || (oldScene === preference.scene && !selecting)) {
    notify();
    if (active()) {
      if (preference.scene === 'cells' && preference.motion !== 'paused')
        getLivingCellsEngine().setMode(preference.motion === 'calm' ? 'calm' : 'ambient');
      renderer?.setMotion(preference.motion);
      applyRunning();
    }
    return;
  }
  const token = ++generation;
  selecting = true;
  renderer?.setRunning(false);
  getLivingCellsEngine().setBackgroundSuspended(true);
  document.documentElement.dataset.backgroundSwitching = 'true';
  notify();
  if (!reduced()) await new Promise((resolve) => setTimeout(resolve, 140));
  if (token !== generation) return;
  selecting = false;
  await attach();
  if (token + 1 === generation) document.documentElement.dataset.backgroundSwitching = 'false';
}
function updateDemoStatus(announce = false) {
  const status = $('[data-background-demo-status]');
  if (status) {
    status.setAttribute('aria-live', announce || !demoPlaying ? 'polite' : 'off');
    status.textContent = demo?.status() || '';
  }
  const play = $<HTMLButtonElement>('[data-background-play]');
  if (play) {
    play.textContent = demoPlaying ? 'Pause' : 'Play';
    play.disabled = reduced();
  }
}
function closeDemo() {
  demoGeneration++;
  demo?.dispose();
  demo = null;
  demoObserver?.disconnect();
  demoObserver = null;
  clearInterval(demoInterval);
  demoInterval = 0;
  if (dialog) {
    const old = dialog;
    dialog = null;
    old.close();
    document.body.style.overflow = scrollBefore;
    if (focusBefore?.isConnected) focusBefore.focus({ preventScroll: true });
    focusBefore = null;
    notify();
    applyRunning();
  }
}
async function openDemo() {
  if (preference.scene === 'cells') {
    location.assign('/lab/');
    return;
  }
  if (!active() || preference.scene === 'off' || dialog?.open) return;
  const scene = preference.scene;
  const host = $<HTMLDialogElement>('[data-background-dialog]');
  const surface = $<HTMLCanvasElement>('[data-background-demo-canvas]');
  if (!host || !surface) return;
  const token = ++demoGeneration;
  focusBefore = document.activeElement as HTMLElement;
  const appearance = $<HTMLButtonElement>('[data-top-theme-btn]');
  if (appearance?.getAttribute('aria-expanded') === 'true') {
    focusBefore = appearance;
    appearance.click();
  }
  dialog = host;
  scrollBefore = document.body.style.overflow;
  document.body.style.overflow = 'hidden';
  host.showModal();
  $('[data-background-close]')?.focus();
  $('[data-background-demo-title]')!.textContent =
    scene === 'flow' ? 'Flow Field' : 'Learning Landscape';
  $('[data-background-description]')!.textContent =
    scene === 'flow'
      ? 'Fine strands follow a smooth curl field. Move over the canvas, tap, or add a temporary vortex. This is procedural computational art.'
      : 'An illustrative two-dimensional objective: L(x,y) = ¼(x² − 1)² + ½(y − 0.35x)². Compare two optimizers on the same terrain. This is a toy function, not a trained model’s loss surface.';
  $('[data-background-flow-controls]')!.hidden = scene !== 'flow';
  $('[data-background-landscape-controls]')!.hidden = scene !== 'landscape';
  $('[data-background-legend]')!.hidden = scene !== 'landscape';
  surface.setAttribute(
    'aria-label',
    scene === 'flow'
      ? 'Flow field with temporary interactive vortices'
      : 'Contour map comparing gradient descent and momentum; coordinate controls below'
  );
  for (const [key, value] of [
    ['strength', '1'],
    ['rate', '0.035'],
    ['method', 'both'],
    ['x', '0.45'],
    ['y', '1.65'],
  ]) {
    const input = $<HTMLInputElement>(`[data-background-${key}]`);
    if (input) input.value = value;
  }
  notify();
  applyRunning();
  try {
    const { createSceneRenderer } = await import('../lib/backgroundRenderer');
    if (token !== demoGeneration || !dialog?.open) return;
    demo = createSceneRenderer(surface, scene, true);
    demoPlaying = !reduced();
    applyRunning();
    updateDemoStatus(true);
    demoObserver = new ResizeObserver(() => demo?.resize());
    demoObserver.observe(surface);
    demoInterval = window.setInterval(() => {
      if (!document.hidden && demoPlaying) updateDemoStatus();
    }, 500);
  } catch {
    if (token !== demoGeneration) return;
    $('[data-background-demo-status]')!.textContent =
      'The demonstration could not load. Close and reopen to retry.';
  }
}

function bindDemo() {
  const host = $<HTMLDialogElement>('[data-background-dialog]');
  if (!host || host.dataset.bound) return;
  host.dataset.bound = 'true';
  host.addEventListener('cancel', (event) => {
    event.preventDefault();
    closeDemo();
  });
  host.addEventListener('close', () => {
    if (dialog === host && !host.open) closeDemo();
  });
  host.querySelector('[data-background-close]')?.addEventListener('click', closeDemo);
  host.querySelector('[data-background-play]')?.addEventListener('click', () => {
    demoPlaying = !demoPlaying && !reduced();
    applyRunning();
    updateDemoStatus(true);
  });
  host.querySelector('[data-background-step]')?.addEventListener('click', () => {
    demoPlaying = false;
    applyRunning();
    demo?.step();
    updateDemoStatus(true);
  });
  host.querySelector('[data-background-reset]')?.addEventListener('click', () => {
    demo?.reset();
    updateDemoStatus(true);
  });
  host.querySelector('[data-background-vortex]')?.addEventListener('click', () => {
    const surface = $<HTMLCanvasElement>('[data-background-demo-canvas]');
    if (surface) {
      demo?.interact(surface.clientWidth / 2, surface.clientHeight / 2);
      if (!demoPlaying) demo?.step();
      updateDemoStatus(true);
    }
  });
  host.querySelector('[data-background-strength]')?.addEventListener('input', (event) => {
    demo?.configure({ strength: Number((event.target as HTMLInputElement).value) });
  });
  host.querySelector('[data-background-method]')?.addEventListener('change', (event) => {
    demo?.configure({ method: (event.target as HTMLSelectElement).value });
    updateDemoStatus(true);
  });
  host.querySelector('[data-background-rate]')?.addEventListener('change', (event) => {
    const input = event.target as HTMLInputElement;
    if (input.checkValidity() && input.value) demo?.configure({ rate: Number(input.value) });
    else input.reportValidity();
  });
  host.querySelector('[data-background-start]')?.addEventListener('click', () => {
    const x = $<HTMLInputElement>('[data-background-x]')!,
      y = $<HTMLInputElement>('[data-background-y]')!;
    if (!x.value || !y.value || !x.reportValidity() || !y.reportValidity()) return;
    demo?.configure({ start: { x: Number(x.value), y: Number(y.value) } });
    updateDemoStatus(true);
  });
  const surface = host.querySelector<HTMLCanvasElement>('[data-background-demo-canvas]')!;
  let down: { x: number; y: number } | null = null,
    lastVortex = 0;
  surface.addEventListener('pointerdown', (e) => {
    down = { x: e.clientX, y: e.clientY };
  });
  surface.addEventListener('pointercancel', () => {
    down = null;
  });
  surface.addEventListener('pointerup', (e) => {
    const start = down;
    down = null;
    if (!start || Math.hypot(e.clientX - start.x, e.clientY - start.y) > 8) return;
    const r = surface.getBoundingClientRect();
    demo?.interact(e.clientX - r.left, e.clientY - r.top);
    if (!demoPlaying && preference.scene === 'flow') demo?.step();
    updateDemoStatus(true);
  });
  surface.addEventListener(
    'pointermove',
    (e) => {
      if (
        e.pointerType !== 'mouse' ||
        preference.scene !== 'flow' ||
        !demoPlaying ||
        performance.now() - lastVortex < 450
      )
        return;
      lastVortex = performance.now();
      const r = surface.getBoundingClientRect();
      demo?.interact(e.clientX - r.left, e.clientY - r.top);
    },
    { passive: true }
  );
}

export function initBackground() {
  if (installed) return;
  installed = true;
  readPreference();
  // Migrate once, before Cell Lab can overwrite its separate legacy mode key.
  try {
    localStorage.setItem(BACKGROUND_KEY, JSON.stringify(preference));
  } catch {}
  const onPage = () => {
    document.documentElement.dataset.backgroundSwitching = 'false';
    bindDemo();
    void attach();
  };
  document.addEventListener('click', (event) => {
    const target = (event.target as Element)?.closest<HTMLButtonElement>(
      'button[data-background-scene], button[data-background-motion], button[data-background-explore]'
    );
    if (!target || target.disabled) return;
    const scene = target.dataset.backgroundScene,
      motion = target.dataset.backgroundMotion;
    if (scene && SCENES.includes(scene as BackgroundPreference['scene']))
      void select({ scene: scene as BackgroundPreference['scene'] });
    else if (motion && MOTIONS.includes(motion as BackgroundPreference['motion']))
      void select({ motion: motion as BackgroundPreference['motion'] });
    else if (target.hasAttribute('data-background-explore')) void openDemo();
  });
  document.addEventListener('keydown', (event) => {
    const target = (event.target as Element)?.closest<HTMLElement>(
      'button[data-background-scene], button[data-background-motion]'
    );
    if (
      !target ||
      !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)
    )
      return;
    const options = [
      ...target.parentElement!.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'),
    ];
    if (!options.length) return;
    event.preventDefault();
    const index = options.indexOf(target as HTMLButtonElement);
    const next =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? options.length - 1
          : (index + (['ArrowLeft', 'ArrowUp'].includes(event.key) ? -1 : 1) + options.length) %
            options.length;
    options[next].focus();
    options[next].click();
  });
  document.addEventListener('astro:before-swap', (event) => {
    // Carry the in-memory preference through navigation even if storage is blocked.
    const next = (event as Event & { newDocument: Document }).newDocument.documentElement;
    next.dataset.backgroundScene = preference.scene;
    next.dataset.backgroundMotion = preference.motion;
    detach();
  });
  document.addEventListener('astro:page-load', onPage);
  document.addEventListener('visibilitychange', applyRunning);
  document.addEventListener('selectionchange', () => {
    if (getSelection()?.toString()) {
      renderer?.setRunning(false);
    } else applyRunning();
  });
  for (const event of ['khc:theme-change', 'khc:crt-change'])
    document.addEventListener(event, () => {
      renderer?.refreshPalette();
      demo?.refreshPalette();
    });
  matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change', () => {
    if (reduced()) demoPlaying = false;
    notify();
    applyRunning();
    updateDemoStatus();
  });
  window.addEventListener(
    'resize',
    () => {
      renderer?.resize();
      collectBounds();
    },
    { passive: true }
  );
  window.addEventListener('scroll', scheduleMask, { passive: true });
  document.addEventListener('toggle', collectBounds, true);
  window.addEventListener('storage', (event) => {
    if (event.key === BACKGROUND_KEY) {
      closeDemo();
      selecting = false;
      document.documentElement.dataset.backgroundSwitching = 'false';
      readPreference();
      void attach();
    }
  });
  void document.fonts.ready.then(collectBounds);
  onPage();
}
