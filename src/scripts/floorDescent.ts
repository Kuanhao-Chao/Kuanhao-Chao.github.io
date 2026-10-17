import {
  createGame,
  start,
  pause,
  step,
  forecast,
  type GameState,
  type RunOptions,
  type Input,
} from '../lib/floorDescent';
import {
  createSaveStore,
  readChallenge,
  challengeQuery,
  formatTime,
} from '../lib/floorDescentSave';
import { messages, type TextKey } from '../lib/floorDescentText';
import { createGameClock } from '../lib/gameClock';
import { setLabel } from '../lib/domLabel';
import { createDescentRenderer } from './floorDescentRenderer';

export interface FloorDescentController {
  state: () => GameState;
  input: (input: Input) => void;
  tick: (frames: number) => void;
  forecast: typeof forecast;
  pause: () => void;
  resume: () => void;
  restart: () => void;
  graphics: () => ReturnType<ReturnType<typeof createDescentRenderer>['stats']> & {
    reducedEffects: boolean;
    running: boolean;
  };
  destroy: () => void;
}
declare global {
  interface Window {
    __floorDescent?: FloorDescentController;
    __floorDescentInstances?: number;
  }
}

/** Browser lifecycle, input, and persistence. The engine stays browser-independent. */
export function initFloorDescent(doc: Document): FloorDescentController | null {
  const root = doc.querySelector<HTMLElement>('[data-descent-root]');
  if (!root) return null;
  const q = <T extends HTMLElement = HTMLElement>(name: string) =>
    root.querySelector<T>(`[data-descent-${name}]`)!;
  const canvas = q<HTMLCanvasElement>('canvas'),
    abort = new AbortController(),
    { signal } = abort;
  let renderer: ReturnType<typeof createDescentRenderer>;
  try {
    renderer = createDescentRenderer(canvas);
  } catch {
    q('status').textContent = messages('en').noCanvas;
    return null;
  }
  let storage: Storage | null = null;
  try {
    storage = window.localStorage;
  } catch {
    /* memory-only adapter */
  }
  const save = createSaveStore(storage),
    motion = window.matchMedia('(prefers-reduced-motion: reduce)'),
    clock = createGameClock(1 / 120, 12);
  const randomSeed = () => {
    const n = new Uint32Array(1);
    crypto.getRandomValues(n);
    return n[0];
  };
  const challenge = readChallenge(window.location.search, randomSeed());
  let s = createGame(challenge.options),
    unsupported = challenge.unsupported,
    raf = 0,
    lastFrame = 0,
    lastHud = -1,
    disposed = false,
    offscreen = false;
  let sound: AudioContext | null = null,
    recorded = false,
    dashQueued = false,
    milestone = false;
  const keys = new Set<string>(),
    pointers = new Map<number, { direction: number; element: HTMLElement; inside: boolean }>();
  const mode = q<HTMLSelectElement>('mode'),
    seed = q<HTMLInputElement>('seed'),
    checkpoint = q<HTMLSelectElement>('checkpoint');
  const primary = q<HTMLButtonElement>('primary'),
    pauseButton = q<HTMLButtonElement>('pause'),
    left = q<HTMLButtonElement>('left'),
    right = q<HTMLButtonElement>('right'),
    dash = q<HTMLButtonElement>('dash');
  const overlay = q('overlay'),
    pips = q('pips'),
    hudHealth = q('health'),
    hudFloor = q('floor'),
    hudTime = q('time');
  const locale = q<HTMLSelectElement>('language'),
    touchMode = q<HTMLSelectElement>('touch-mode'),
    quiet = q<HTMLInputElement>('quiet');
  const dictionary = () => messages(save.settings.locale),
    reduced = () => motion.matches || save.settings.reducedEffects;
  function stopLoop() {
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    lastFrame = 0;
    clock.reset();
  }
  function clearInput() {
    keys.clear();
    for (const [id, p] of pointers)
      if (p.element.hasPointerCapture(id)) p.element.releasePointerCapture(id);
    pointers.clear();
    dashQueued = false;
    left.classList.remove('is-held');
    right.classList.remove('is-held');
  }
  function announce(message: string) {
    setLabel(q('status'), message);
  }
  function notice() {
    const t = dictionary(),
      parts = [unsupported ? t.versionNotice : '', !save.available ? t.storageNotice : ''].filter(
        Boolean
      );
    q('notice').hidden = !parts.length;
    setLabel(q('notice'), parts.join(' '));
  }
  function translateTools() {
    const t = dictionary();
    setLabel(root!.querySelector('.game-tools-label'), t.tools);
    setLabel(
      root!.querySelector('[data-game-focus]'),
      root!.classList.contains('game-focus-view') ? t.exitFocus : t.focus
    );
    setLabel(
      root!.querySelector('[data-game-fullscreen]'),
      doc.fullscreenElement === root ? t.exitFullscreen : t.fullscreen
    );
  }
  function translate() {
    const t = dictionary();
    root!.lang = save.settings.locale;
    root!.setAttribute('aria-label', t.title);
    root!
      .querySelectorAll<HTMLElement>('[data-descent-text]')
      .forEach((el) => setLabel(el, t[el.dataset.descentText as TextKey]));
    root!
      .querySelectorAll<HTMLElement>('[data-descent-label]')
      .forEach((el) => el.setAttribute('aria-label', t[el.dataset.descentLabel as TextKey]));
    canvas.setAttribute('aria-label', t.canvasLabel);
    locale.setAttribute('aria-label', t.language);
    root!.querySelector('.descent-map')?.setAttribute('aria-label', t.expeditionMap);
    seed.title = mode.title = t.modeHint;
    locale.value = save.settings.locale;
    touchMode.value = save.settings.touch;
    quiet.checked = save.settings.reducedEffects;
    translateTools();
    notice();
    updateHud();
  }
  async function unlockSound() {
    if (!save.settings.sound) return;
    try {
      sound ??= new AudioContext();
      if (sound.state === 'suspended') await sound.resume();
    } catch {
      /* Sound is optional; the game never depends on it. */
    }
  }
  function tone(event: string) {
    if (!save.settings.sound || !sound || sound.state !== 'running') return;
    const notes: Record<string, number> = {
      land: 210,
      spring: 550,
      hurt: 110,
      heal: 760,
      dash: 330,
      shield: 850,
      slow: 650,
      'shield-break': 160,
      won: 1046,
    };
    const frequency = notes[event];
    if (!frequency) return;
    const oscillator = sound.createOscillator(),
      gain = sound.createGain(),
      at = sound.currentTime;
    oscillator.type = event === 'hurt' ? 'triangle' : 'sine';
    oscillator.frequency.setValueAtTime(frequency, at);
    oscillator.frequency.exponentialRampToValueAtTime(frequency * 0.65, at + 0.09);
    gain.gain.setValueAtTime(0, at);
    gain.gain.linearRampToValueAtTime(0.035, at + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.13);
    oscillator.connect(gain);
    gain.connect(sound.destination);
    oscillator.start(at);
    oscillator.stop(at + 0.14);
    oscillator.onended = () => {
      oscillator.disconnect();
      gain.disconnect();
    };
  }
  function updateHud() {
    const t = dictionary(),
      p = s.player,
      playing = s.status === 'playing';
    root!.dataset.descentRunStatus = s.status;
    setLabel(hudHealth, `${p.health}/10`);
    Array.from(pips.children).forEach((pip, i) => pip.classList.toggle('empty', i >= p.health));
    pips.classList.toggle('low', p.health <= 4);
    setLabel(
      hudFloor,
      String(s.floor).padStart(2, '0') + (s.options.mode === 'trial' ? ' / 100' : '')
    );
    setLabel(hudTime, formatTime(s.time));
    hudHealth.setAttribute('aria-label', `${t.health}: ${p.health}/10`);
    mode.disabled =
      seed.disabled =
      checkpoint.disabled =
      q<HTMLButtonElement>('new').disabled =
        playing;
    pauseButton.disabled = s.status === 'ready' || s.status === 'won' || s.status === 'over';
    setLabel(pauseButton, s.status === 'paused' ? t.resume : t.pause);
    left.disabled = right.disabled = !playing;
    dash.hidden = s.options.mode !== 'remix';
    dash.disabled = !playing || p.dashCooldown > 0;
    dash.title = p.dashCooldown > 0 ? `${t.dashWait}: ${p.dashCooldown.toFixed(1)}s` : t.dashReady;
    q('cooldown').style.transform = `scaleX(${1 - p.dashCooldown / 4})`;
    q('checkpoint-field').hidden = s.options.mode !== 'practice';
    const soundButton = q<HTMLButtonElement>('sound');
    setLabel(soundButton, save.settings.sound ? t.soundOn : t.soundOff);
    soundButton.setAttribute('aria-pressed', String(save.settings.sound));
    setLabel(q('current-mode'), t[s.options.mode]);
    setLabel(q('mode-description'), t[`${s.options.mode}Description`]);
    const best = save.best(s.options.mode, s.options.seed);
    setLabel(
      q('best'),
      s.options.mode === 'practice'
        ? t.unranked
        : best
          ? s.options.mode === 'trial'
            ? `${formatTime(best.seconds)} · #${best.seed}`
            : `${best.floor} ${t.floorUnit}`
          : t.noRecord
    );
    root!
      .querySelectorAll<HTMLElement>('[data-descent-region]')
      .forEach((el) =>
        el.classList.toggle(
          'active',
          Number(el.dataset.descentRegion) === Math.min(4, Math.floor(s.floor / 20))
        )
      );
    q('shield').hidden = !p.shield;
    q('shield').title = t.shield;
    q('slow').hidden = s.slowFor <= 0;
    q('slow').title = `${t.slow}: ${s.slowFor.toFixed(1)}s`;
    overlay.hidden = playing;
    if (!playing) {
      const end = s.status === 'over' || s.status === 'won';
      setLabel(
        q('overlay-title'),
        s.status === 'won'
          ? t.won
          : s.status === 'over'
            ? t.over
            : s.status === 'paused'
              ? t.paused
              : t.ready
      );
      setLabel(
        q('overlay-body'),
        s.status === 'won'
          ? t.wonBody
          : s.status === 'over'
            ? t[s.cause || 'fall']
            : s.status === 'paused'
              ? t.pausedBody
              : t.readyBody
      );
      q('result').hidden = !end;
      setLabel(q('result'), `${s.floor} ${t.floorUnit} · ${formatTime(s.time)}`);
      setLabel(primary, s.status === 'paused' ? t.resume : end ? t.playAgain : t.start);
    }
  }
  function draw(alpha = 1) {
    if (!disposed) renderer.draw(s, alpha, reduced(), dictionary());
  }
  function settle() {
    if (s.status === 'over' || s.status === 'won') {
      if (!recorded) {
        save.record(s);
        recorded = true;
        announce(s.status === 'won' ? dictionary().won : dictionary()[s.cause || 'fall']);
        notice();
      }
      stopLoop();
      clearInput();
      updateHud();
      draw();
    }
    if (s.floor >= 100 && !milestone && s.options.mode === 'classic') {
      milestone = true;
      announce(dictionary().milestone);
    }
  }
  function simulate(input: Input, dt: number) {
    if (s.status !== 'playing') return;
    step(s, input, dt);
    for (const event of s.events) {
      tone(event);
      if (event === 'shield') announce(dictionary().shield);
      if (event === 'slow') announce(dictionary().slow);
    }
    settle();
  }
  function steering() {
    let value =
      (keys.has('arrowright') || keys.has('d') || keys.has('button-right') ? 1 : 0) -
      (keys.has('arrowleft') || keys.has('a') || keys.has('button-left') ? 1 : 0);
    for (const p of pointers.values()) if (p.inside) value += p.direction;
    return Math.max(-1, Math.min(1, value));
  }
  function frame(now: number) {
    raf = 0;
    if (disposed || s.status !== 'playing') return;
    const alpha = clock.advance(Math.max(0, (now - lastFrame) / 1000), (dt) => {
      const dash = dashQueued;
      dashQueued = false;
      simulate({ steer: steering(), dash }, dt);
    });
    lastFrame = now;
    draw(alpha);
    if (s.time - lastHud > 0.08) {
      updateHud();
      lastHud = s.time;
    }
    if (s.status === 'playing') raf = requestAnimationFrame(frame);
  }
  function begin() {
    if (doc.hidden) return;
    if (s.status === 'playing') return;
    if (s.status === 'won' || s.status === 'over') reset(s.options);
    const box = canvas.getBoundingClientRect();
    if (Math.min(innerHeight, box.bottom) - Math.max(0, box.top) < box.height * 0.05)
      canvas.scrollIntoView({ block: 'center', behavior: 'instant' });
    offscreen = false;
    start(s);
    clearInput();
    clock.reset();
    lastFrame = performance.now();
    lastHud = -1;
    updateHud();
    draw();
    canvas.focus({ preventScroll: true });
    void unlockSound();
    if (!raf) raf = requestAnimationFrame(frame);
    announce(s.options.mode === 'remix' ? dictionary().remixHint : dictionary().controlsHint);
  }
  function suspend(automatic = false) {
    if (s.status !== 'playing') return;
    pause(s);
    stopLoop();
    clearInput();
    void sound?.suspend().catch(() => {});
    updateHud();
    draw();
    announce(automatic ? dictionary().autoPaused : dictionary().pausedBody);
  }
  function reset(options: RunOptions) {
    stopLoop();
    clearInput();
    s = createGame(options);
    recorded = false;
    milestone = false;
    lastHud = -1;
    mode.value = s.options.mode;
    seed.value = String(s.options.seed);
    checkpoint.value = String(s.options.startFloor ?? 0);
    q('copy').hidden = true;
    updateHud();
    draw();
    announce(dictionary().readyBody);
  }
  function replaceChallenge() {
    try {
      history.replaceState(history.state, '', window.location.pathname + challengeQuery(s.options));
    } catch {
      /* optional URL convenience */
    }
  }
  function retry() {
    reset(s.options);
    canvas.scrollIntoView({ block: 'center', behavior: 'instant' });
    begin();
  }
  primary.addEventListener('click', begin, { signal });
  pauseButton.addEventListener('click', () => (s.status === 'paused' ? begin() : suspend()), {
    signal,
  });
  q('retry').addEventListener('click', retry, { signal });
  function chooseCourse() {
    if (s.status === 'playing') return;
    if (!/^\d{1,10}$/.test(seed.value) || Number(seed.value) > 4294967295) {
      seed.setCustomValidity(dictionary().seedError);
      seed.reportValidity();
      return;
    }
    seed.setCustomValidity('');
    unsupported = false;
    reset(
      readChallenge(
        `?mode=${mode.value}&seed=${seed.value}&start=${checkpoint.value}`,
        s.options.seed
      ).options
    );
    replaceChallenge();
    notice();
  }
  mode.addEventListener('change', chooseCourse, { signal });
  seed.addEventListener('change', chooseCourse, { signal });
  checkpoint.addEventListener('change', chooseCourse, { signal });
  seed.addEventListener('input', () => seed.setCustomValidity(''), { signal });
  q('new').addEventListener(
    'click',
    () => {
      if (s.status === 'playing') return;
      unsupported = false;
      reset({ ...s.options, seed: randomSeed() });
      replaceChallenge();
      notice();
    },
    { signal }
  );
  locale.addEventListener('focus', () => suspend(), { signal });
  locale.addEventListener(
    'change',
    () => {
      suspend();
      save.configure({ locale: locale.value === 'zh-Hant' ? 'zh-Hant' : 'en' });
      translate();
      draw();
      announce(s.status === 'paused' ? dictionary().pausedBody : dictionary().readyBody);
    },
    { signal }
  );
  touchMode.addEventListener(
    'change',
    () => {
      suspend();
      save.configure({ touch: touchMode.value === 'halves' ? 'halves' : 'buttons' });
      notice();
    },
    { signal }
  );
  quiet.addEventListener(
    'change',
    () => {
      suspend();
      save.configure({ reducedEffects: quiet.checked });
      notice();
      draw();
    },
    { signal }
  );
  q('sound').addEventListener(
    'click',
    () => {
      suspend();
      save.configure({ sound: !save.settings.sound });
      if (save.settings.sound) void unlockSound();
      else void sound?.suspend().catch(() => {});
      updateHud();
      notice();
    },
    { signal }
  );
  q('share').addEventListener(
    'click',
    async () => {
      suspend();
      const link = new URL(
        window.location.pathname + challengeQuery(s.options),
        window.location.origin
      ).href;
      try {
        await navigator.clipboard.writeText(link);
        if (!disposed) announce(dictionary().shareDone);
      } catch {
        if (!disposed) {
          q('copy').hidden = false;
          q<HTMLInputElement>('copy-value').value = link;
          q<HTMLInputElement>('copy-value').select();
          announce(dictionary().shareFailed);
        }
      }
    },
    { signal }
  );
  function markPointers() {
    left.classList.toggle(
      'is-held',
      [...pointers.values()].some((p) => p.inside && p.direction < 0)
    );
    right.classList.toggle(
      'is-held',
      [...pointers.values()].some((p) => p.inside && p.direction > 0)
    );
  }
  for (const [button, direction] of [
    [left, -1],
    [right, 1],
  ] as const) {
    button.addEventListener(
      'pointerdown',
      (event) => {
        if (s.status !== 'playing') return;
        event.preventDefault();
        pointers.set(event.pointerId, { direction, element: button, inside: true });
        try {
          button.setPointerCapture(event.pointerId);
        } catch {
          /* synthetic audit pointers have no native capture */
        }
        markPointers();
      },
      { signal }
    );
    button.addEventListener(
      'pointermove',
      (event) => {
        const p = pointers.get(event.pointerId);
        if (!p) return;
        const b = button.getBoundingClientRect();
        p.inside =
          event.clientX >= b.left &&
          event.clientX <= b.right &&
          event.clientY >= b.top &&
          event.clientY <= b.bottom;
        markPointers();
      },
      { signal }
    );
    button.addEventListener(
      'keydown',
      (event) => {
        if ([' ', 'Enter'].includes(event.key) && s.status === 'playing') {
          event.preventDefault();
          keys.add(direction < 0 ? 'button-left' : 'button-right');
        }
      },
      { signal }
    );
    button.addEventListener(
      'keyup',
      () => {
        keys.delete(direction < 0 ? 'button-left' : 'button-right');
      },
      { signal }
    );
    button.addEventListener(
      'blur',
      () => {
        keys.delete(direction < 0 ? 'button-left' : 'button-right');
      },
      { signal }
    );
  }
  canvas.addEventListener(
    'pointerdown',
    (event) => {
      if (s.status !== 'playing' || save.settings.touch !== 'halves') return;
      event.preventDefault();
      const box = canvas.getBoundingClientRect();
      pointers.set(event.pointerId, {
        direction: event.clientX < box.x + box.width / 2 ? -1 : 1,
        element: canvas,
        inside: true,
      });
      try {
        canvas.setPointerCapture(event.pointerId);
      } catch {
        /* audit pointer */
      }
      markPointers();
    },
    { signal }
  );
  canvas.addEventListener(
    'pointermove',
    (event) => {
      const p = pointers.get(event.pointerId);
      if (!p) return;
      const box = canvas.getBoundingClientRect();
      p.inside =
        event.clientX >= box.left &&
        event.clientX <= box.right &&
        event.clientY >= box.top &&
        event.clientY <= box.bottom;
      p.direction = event.clientX < box.x + box.width / 2 ? -1 : 1;
      markPointers();
    },
    { signal }
  );
  function release(event: PointerEvent) {
    pointers.delete(event.pointerId);
    markPointers();
  }
  for (const name of ['pointerup', 'pointercancel', 'lostpointercapture'] as const)
    window.addEventListener(name, release, { signal });
  dash.addEventListener(
    'pointerdown',
    (event) => {
      if (!dash.disabled) {
        event.preventDefault();
        dashQueued = true;
      }
    },
    { signal }
  );
  dash.addEventListener(
    'click',
    (event) => {
      if (event.detail === 0 && !dash.disabled) dashQueued = true;
    },
    { signal }
  );
  window.addEventListener(
    'keydown',
    (event) => {
      if (
        event.defaultPrevented ||
        !(event.target instanceof Element) ||
        !root!.contains(event.target) ||
        event.target.closest('input,select,textarea,button,summary,a,[contenteditable]')
      )
        return;
      const key = event.key.toLowerCase();
      if (['arrowleft', 'arrowright', 'a', 'd'].includes(key)) {
        if (s.status === 'playing') {
          event.preventDefault();
          keys.add(key);
        }
        return;
      }
      if (key === 'enter' && !event.repeat) {
        event.preventDefault();
        begin();
      } else if ((key === 'p' || key === 'escape') && !event.repeat) {
        event.preventDefault();
        s.status === 'paused' ? begin() : suspend();
      } else if ((key === ' ' || key === 'j') && s.options.mode === 'remix') {
        event.preventDefault();
        if (!event.repeat) dashQueued = true;
      }
    },
    { signal }
  );
  window.addEventListener('keyup', (event) => keys.delete(event.key.toLowerCase()), { signal });
  window.addEventListener('blur', () => suspend(true), { signal });
  doc.addEventListener(
    'visibilitychange',
    () => {
      if (doc.hidden) suspend(true);
    },
    { signal }
  );
  const intersection = new IntersectionObserver(
    (entries) => {
      offscreen = entries[0].intersectionRatio < 0.05;
      if (offscreen) suspend(true);
    },
    { threshold: [0, 0.05] }
  );
  intersection.observe(canvas);
  const resize = new ResizeObserver(() => {
    renderer.resize();
    draw();
  });
  resize.observe(canvas);
  root.querySelector('[data-game-fullscreen]')?.addEventListener(
    'click',
    (event) => {
      if (doc.fullscreenElement === root) {
        event.preventDefault();
        event.stopImmediatePropagation();
        void doc.exitFullscreen().catch(() => {});
      }
    },
    { signal, capture: true }
  );
  root.addEventListener(
    'khc:game-focus-change',
    () => {
      suspend(true);
      translateTools();
      setLabel(
        root!.querySelector('[data-game-announcement]'),
        root!.classList.contains('game-focus-view') ? dictionary().focus : dictionary().exitFocus
      );
      renderer.resize();
      draw();
    },
    { signal }
  );
  doc.addEventListener('fullscreenchange', translateTools, { signal });
  motion.addEventListener(
    'change',
    () => {
      suspend(true);
      draw();
    },
    { signal }
  );
  const api: FloorDescentController = {
    state: () => structuredClone(s),
    forecast,
    input: (input) => {
      simulate(input, 1 / 120);
      if (s.time - lastHud > 0.1) {
        updateHud();
        lastHud = s.time;
      }
    },
    tick: (frames) => {
      for (let i = 0; i < Math.max(0, Math.min(1200, Math.floor(frames))); i++) {
        const dash = dashQueued;
        dashQueued = false;
        simulate({ steer: steering(), dash }, 1 / 120);
      }
      updateHud();
      draw();
    },
    pause: () => suspend(),
    resume: begin,
    restart: retry,
    graphics: () => ({ ...renderer.stats(), reducedEffects: reduced(), running: !!raf }),
    destroy() {
      if (disposed) return;
      disposed = true;
      stopLoop();
      clearInput();
      abort.abort();
      resize.disconnect();
      intersection.disconnect();
      void sound?.close().catch(() => {});
      if (window.__floorDescent === api) delete window.__floorDescent;
      window.__floorDescentInstances = Math.max(0, (window.__floorDescentInstances ?? 1) - 1);
    },
  };
  reset(s.options);
  translate();
  renderer.resize();
  draw();
  window.__floorDescent = api;
  window.__floorDescentInstances = (window.__floorDescentInstances ?? 0) + 1;
  return api;
}
