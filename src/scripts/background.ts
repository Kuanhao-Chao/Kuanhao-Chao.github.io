import {
  BACKGROUND_DEFAULT_KEY,
  BACKGROUND_KEY,
  DEFAULT_SCENE,
  DEFAULT_SCENE_VERSION,
  MOTIONS,
  SCENES,
  backgroundRouteAllowed,
  resolveBackground,
  type BackgroundPreference,
} from '../lib/backgroundModel';
import { setLabel } from '../lib/domLabel';
import {
  SOFT_SELECTOR,
  SOLID_SELECTOR,
  readVeil,
  softEraseAlpha,
  type VeilKind,
} from '../lib/readingVeil';
import { getLivingCellsEngine } from '../lib/livingCellsEngine';
import type { SceneRenderer } from '../lib/sceneRenderer';
import {
  MORPH_STAGES,
  stageDescription,
  storyProgress,
  type MorphChapter,
} from '../lib/morphStory';

let preference: BackgroundPreference = { scene: DEFAULT_SCENE, motion: 'ambient' };
let renderer: SceneRenderer | null = null;
let canvas: HTMLCanvasElement | null = null;
let generation = 0;
let installed = false;
let resizeObserver: ResizeObserver | null = null;
let maskRaf = 0;
let bounds: Array<{ x: number; y: number; w: number; h: number; kind: VeilKind }> = [];
let mask: HTMLCanvasElement | null = null;
// The soft boxes are painted here, opaque, and laid on `mask` once; `veil` is 0 off the homepage.
let veilLayer: HTMLCanvasElement | null = null;
let veil = 0;
let demo: SceneRenderer | null = null;
let demoGeneration = 0;
let demoPlaying = false;
let demoInterval = 0;
let demoObserver: ResizeObserver | null = null;
let dialog: HTMLDialogElement | null = null;
let focusBefore: HTMLElement | null = null;
let scrollBefore = '';
let selecting = false;
let storyChapters: MorphChapter[] = [];
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const active = () =>
  backgroundRouteAllowed(location.pathname) && !!document.querySelector('[data-site-bg-canvas]');
const $ = <T extends HTMLElement>(selector: string) => document.querySelector<T>(selector);

function readPreference() {
  try {
    preference = resolveBackground(
      localStorage.getItem(BACKGROUND_KEY),
      localStorage.getItem('khc-cell-mode'),
      localStorage.getItem(BACKGROUND_DEFAULT_KEY)
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
  setLabel(
    $('[data-background-hint]'),
    preference.scene === 'off'
      ? 'All decorative backgrounds are hidden.'
      : reduced()
        ? 'Reduced motion is enabled. Showing a still composition.'
        : preference.motion === 'paused'
          ? 'The scene is paused. Your reading stays still.'
          : preference.motion === 'calm'
            ? 'Gentler motion and lower contrast while you read.'
            : 'Quiet motion in the background. Your choice is remembered.'
  );
  const explore = $<HTMLButtonElement>('[data-background-explore]');
  if (explore) {
    explore.disabled = preference.scene === 'off' || !active();
    setLabel(explore, preference.scene === 'cells' ? 'Open Cell Lab ↗' : 'Explore background ↗');
  }
}
function applyAmbientRunning() {
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
}
function applyRunning() {
  applyAmbientRunning();
  demo?.setRunning(demoPlaying && !document.hidden && !reduced());
}
function collectBounds() {
  bounds = [];
  if (!canvas || !renderer) return;
  // Homepage only: every other page keeps the fully cleared reading area.
  veil = readVeil(
    getComputedStyle(document.documentElement).getPropertyValue('--art-through'),
    location.pathname === '/'
  );
  const collect = (selector: string, kind: VeilKind) =>
    document.querySelectorAll<HTMLElement>(selector).forEach((element) => {
      if (element.closest('[data-background-dialog]')) return;
      // Closed <details> descendants can retain nonempty client rects in some
      // engines even though only their summary is painted. Do not erase art for them.
      if (element.closest('details:not([open]) > :not(summary)')) return;
      // A veiled card is translucent in CSS. Erasing the art behind its text as well would
      // attenuate it twice (0.3 x 0.3), so text inside one is left to the card.
      if (kind === 'soft' && element.closest('[data-veiled]')) return;
      for (const r of element.getClientRects()) {
        if (r.width && r.height)
          bounds.push({ x: r.left + scrollX, y: r.top + scrollY, w: r.width, h: r.height, kind });
      }
    });
  collect(SOFT_SELECTOR, veil > 0 ? 'soft' : 'solid');
  collect(SOLID_SELECTOR, 'solid');
  // A canvas has no elements to inspect: publish what the mask is made of for the audit.
  canvas.dataset.bgVeil = veil.toFixed(2);
  canvas.dataset.bgSoft = String(bounds.filter((rect) => rect.kind === 'soft').length);
  canvas.dataset.bgSolid = String(bounds.filter((rect) => rect.kind === 'solid').length);
  storyChapters = [];
  for (const stage of MORPH_STAGES) {
    const element = document.querySelector<HTMLElement>(`[data-background-stage="${stage.id}"]`);
    const rect = element?.getBoundingClientRect();
    if (rect && rect.height)
      storyChapters.push({
        id: stage.id,
        center: rect.top + scrollY + rect.height / 2,
        holdRadius: Math.min(64, rect.height * 0.2),
      });
  }
  paintMask();
}
function updateStory() {
  if (!renderer?.setProgress || preference.scene !== 'morph') return;
  const progress =
    storyChapters.length === MORPH_STAGES.length
      ? storyProgress(scrollY + innerHeight / 2, storyChapters)
      : 0.5;
  if (Math.abs((renderer.getProgress?.() ?? -1) - progress) > 0.002) renderer.setProgress(progress);
}
function paintRects(ctx: CanvasRenderingContext2D, kind: VeilKind, w: number, h: number) {
  ctx.shadowColor = '#000';
  ctx.shadowBlur = 18;
  ctx.fillStyle = '#000';
  for (const rect of bounds) {
    if (rect.kind !== kind) continue;
    const x = rect.x - scrollX,
      y = rect.y - scrollY;
    if (y > h + 30 || y + rect.h < -30 || x > w + 30 || x + rect.w < -30) continue;
    ctx.fillRect(x - 6, y - 6, rect.w + 12, rect.h + 12);
  }
  ctx.shadowBlur = 0;
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
  if (veil > 0 && veilLayer && w && h) {
    // The union of the soft boxes, painted opaque on a layer of its own and laid on the mask ONCE at
    // (1 - veil). Painting each box at that alpha would stack wherever boxes nest (a p in an li in
    // an a) and darken to 1 - veil^n, which is the solid clearance this exists to relax.
    if (veilLayer.width !== w || veilLayer.height !== h) {
      veilLayer.width = w;
      veilLayer.height = h;
    }
    const layer = veilLayer.getContext('2d');
    if (layer) {
      layer.clearRect(0, 0, w, h);
      paintRects(layer, 'soft', w, h);
      ctx.globalAlpha = softEraseAlpha(veil);
      ctx.drawImage(veilLayer, 0, 0);
      ctx.globalAlpha = 1;
    }
  }
  // Objects, controls, media, the terminal and the chrome stay fully cleared, on top of the veil.
  paintRects(ctx, 'solid', w, h);
  updateStory();
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
/** Only exposed artwork reacts; never capture a control, text selection, or touch scroll. */
function ambientPoint(event: PointerEvent) {
  if (
    preference.scene !== 'morph' ||
    !renderer ||
    !canvas ||
    dialog?.open ||
    preference.motion === 'paused' ||
    reduced() ||
    document.hidden ||
    selecting ||
    location.pathname !== '/' ||
    getSelection()?.toString()
  )
    return null;
  const target = event.target instanceof Element ? event.target : null;
  if (
    target?.closest(
      'a, button, input, select, textarea, summary, [contenteditable], [role="button"], [data-background-protected], [data-terminal]'
    )
  )
    return null;
  const x = event.clientX + scrollX,
    y = event.clientY + scrollY;
  if (bounds.some((r) => x >= r.x - 8 && x <= r.x + r.w + 8 && y >= r.y - 8 && y <= r.y + r.h + 8))
    return null;
  const rect = canvas.getBoundingClientRect();
  return { x: event.clientX - rect.left, y: event.clientY - rect.top };
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
  veilLayer = null;
  veil = 0;
  bounds = [];
  storyChapters = [];
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
      const { createMorphRenderer } = await import('../lib/morphRenderer');
      if (token !== generation || !canvas) return;
      canvas.hidden = false;
      canvas.dataset.bgScene = preference.scene;
      delete canvas.dataset.bgFallback;
      renderer = createMorphRenderer(
        canvas,
        false,
        location.pathname === '/',
        location.pathname === '/' && scrollY < 40 && !reduced() && preference.motion === 'ambient'
      );
      renderer.setMotion(preference.motion);
      mask = document.createElement('canvas');
      veilLayer = document.createElement('canvas');
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
    status.setAttribute('aria-live', announce ? 'polite' : 'off');
    setLabel(status, demo?.status() || '');
  }
  const play = $<HTMLButtonElement>('[data-background-play]');
  if (play) {
    // setLabel, not textContent: replacing this button's text node every 500 ms made WebKit drop
    // any click that straddled a refresh (see src/lib/domLabel.ts).
    setLabel(play, demoPlaying ? 'Pause' : 'Play');
    play.disabled = reduced();
  }
  const stir = $<HTMLButtonElement>('[data-background-stir]');
  if (stir) stir.disabled = reduced();
  const progress = demo?.getProgress?.();
  const scrub = $<HTMLInputElement>('[data-background-scrub]');
  if (scrub && progress !== undefined) {
    scrub.value = String(progress);
    scrub.setAttribute('aria-valuetext', stageDescription(progress));
  }
  document.querySelectorAll<HTMLButtonElement>('[data-background-form]').forEach((button) => {
    const selected =
      progress !== undefined && Math.abs(progress - Number(button.dataset.backgroundForm)) < 0.08;
    button.setAttribute('aria-pressed', String(selected));
  });
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
  $('[data-background-demo-title]')!.textContent = 'Sequence to Function';
  $('[data-background-description]')!.textContent =
    'Explore seven particle forms: DNA, RNA, folded protein, cell, expression profile, neural model and probability distribution. Move your pointer while playing to shift the view, or tap or use Stir particles. Scrub between forms and show structure labels for a closer look.';
  $('[data-background-morph-legend]')!.hidden = false;
  $('[data-background-morph-controls]')!.hidden = false;
  const structureLabels = $<HTMLInputElement>('[data-background-labels]');
  if (structureLabels) structureLabels.checked = false;
  surface.setAttribute(
    'aria-label',
    'Seven particle forms: DNA, RNA, folded protein, cell, expression profile, neural model and probability distribution; controls below'
  );
  notify();
  applyRunning();
  try {
    const { createMorphRenderer } = await import('../lib/morphRenderer');
    if (token !== demoGeneration || !dialog?.open) return;
    demo = createMorphRenderer(surface, true);
    demoPlaying = !reduced();
    applyRunning();
    updateDemoStatus(true);
    demoObserver = new ResizeObserver(() => demo?.resize());
    demoObserver.observe(surface);
    demoInterval = window.setInterval(() => {
      if (!document.hidden) updateDemoStatus();
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
  host.querySelectorAll<HTMLButtonElement>('[data-background-form]').forEach((button) => {
    button.addEventListener('click', () => {
      demoPlaying = false;
      applyRunning();
      demo?.setProgress?.(Number(button.dataset.backgroundForm), { transition: 'smooth' });
      updateDemoStatus(true);
    });
  });
  host
    .querySelector<HTMLInputElement>('[data-background-scrub]')
    ?.addEventListener('input', (event) => {
      demoPlaying = false;
      applyRunning();
      demo?.setProgress?.(Number((event.target as HTMLInputElement).value), {
        transition: 'immediate',
      });
      updateDemoStatus(true);
    });
  host
    .querySelector<HTMLInputElement>('[data-background-labels]')
    ?.addEventListener('change', (event) => {
      demo?.configure({ labels: (event.target as HTMLInputElement).checked });
      updateDemoStatus(true);
    });
  host.querySelector('[data-background-stir]')?.addEventListener('click', () => {
    const surface = $<HTMLCanvasElement>('[data-background-demo-canvas]');
    if (surface) demo?.interact(surface.clientWidth / 2, surface.clientHeight / 2);
  });
  const surface = host.querySelector<HTMLCanvasElement>('[data-background-demo-canvas]')!;
  let down: { x: number; y: number } | null = null;
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
    updateDemoStatus(true);
  });
  surface.addEventListener(
    'pointermove',
    (e) => {
      if (e.pointerType === 'mouse' && preference.scene === 'morph' && demoPlaying) {
        const r = surface.getBoundingClientRect();
        demo?.setPointer?.({ x: e.clientX - r.left, y: e.clientY - r.top });
        return;
      }
    },
    { passive: true }
  );
  surface.addEventListener('pointerleave', () => demo?.setPointer?.(null));
}

export function initBackground() {
  if (installed) return;
  installed = true;
  readPreference();
  // Migrate once, before Cell Lab can overwrite its separate legacy mode key. The flag records
  // that this release's default has been applied, so from here on a saved Cells is a choice.
  try {
    localStorage.setItem(BACKGROUND_KEY, JSON.stringify(preference));
    localStorage.setItem(BACKGROUND_DEFAULT_KEY, DEFAULT_SCENE_VERSION);
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
  // Updating explorer text can change selection; it must not cancel its explicit transitions.
  document.addEventListener('selectionchange', applyAmbientRunning);
  let ambientDown: {
    x: number;
    y: number;
    scroll: number;
    time: number;
    generation: number;
  } | null = null;
  document.addEventListener(
    'pointermove',
    (event) => {
      if (event.pointerType === 'mouse') renderer?.setPointer?.(ambientPoint(event));
      if (
        ambientDown &&
        Math.hypot(event.clientX - ambientDown.x, event.clientY - ambientDown.y) > 8
      )
        ambientDown = null;
    },
    { passive: true }
  );
  document.addEventListener(
    'pointerdown',
    (event) => {
      ambientDown =
        event.button === 0 && ambientPoint(event)
          ? {
              x: event.clientX,
              y: event.clientY,
              scroll: scrollY,
              time: performance.now(),
              generation,
            }
          : null;
    },
    { passive: true }
  );
  document.addEventListener(
    'pointerup',
    (event) => {
      const start = ambientDown;
      ambientDown = null;
      const point = ambientPoint(event);
      if (
        point &&
        start &&
        start.generation === generation &&
        performance.now() - start.time < 600 &&
        Math.abs(scrollY - start.scroll) < 3 &&
        Math.hypot(event.clientX - start.x, event.clientY - start.y) <= 8
      )
        renderer?.interact(point.x, point.y);
    },
    { passive: true }
  );
  document.addEventListener(
    'pointercancel',
    () => {
      ambientDown = null;
    },
    { passive: true }
  );
  document.documentElement.addEventListener('pointerleave', () => renderer?.setPointer?.(null));
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
  // Sections marked [data-reveal] ease up by 10px as they scroll into view (global.css). Their boxes
  // are measured with that transform in effect, so until something re-measured them the mask sat
  // 10px low: the top edge of an image or the genome browser was only half cleared, and the veil's
  // feathered edge sat below its text. A transform changes no layout, so neither the resize
  // observer nor a resize event notices; the end of the transition is the moment the boxes settle.
  document.addEventListener(
    'transitionend',
    (event) => {
      if (event.propertyName === 'transform' && (event.target as Element).matches?.('[data-reveal]'))
        collectBounds();
    },
    true
  );
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
