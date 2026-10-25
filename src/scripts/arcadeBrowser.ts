import {
  CAMPAIGNS,
  challengeUrl,
  decodeProgress,
  parseRunOptions,
  recordKey,
  recordResult,
  rulesVersion,
  isProofreader,
  type ArcadeGame,
  type RunOptions,
  type RunResult,
  type RunStatus,
} from '../lib/arcade';
import { createGameClock } from '../lib/gameClock';
import { arcadeStorageKeys, copyClassicSaves } from '../lib/arcadeStorage';
import { setLabel } from '../lib/domLabel';

export interface ArcadeSettings {
  sound: boolean;
  volume: number;
  palette: number;
  speed: number;
  assist: boolean;
  toggle: boolean;
  sensitivity: number;
  deadZone: number;
  bindings: Record<string, string>;
  graphics: 'auto' | 'low' | 'high';
  fov: number;
  motion: number;
}
export interface ArcadePresentation {
  draw(settings: ArcadeSettings, reduced: boolean, timestamp: number, alpha: number): void;
  resize(): void;
  dispose(): void;
}
export interface ArcadeDriver {
  game: ArcadeGame;
  prefix: string;
  width: number;
  height: number;
  stepSeconds: number;
  bindings: Record<string, string>;
  aliases?: Record<string, string>;
  create(options: RunOptions): void;
  status(): RunStatus;
  start(): void;
  pause(): void;
  release(): void;
  input(action: string, down: boolean): void;
  step(dt: number): void;
  draw?(
    ctx: CanvasRenderingContext2D,
    settings: ArcadeSettings,
    reduced: boolean,
    timestamp: number
  ): void;
  presentation?(canvas: HTMLCanvasElement): ArcadePresentation;
  retry?(): boolean;
  result(): RunResult;
  hud(): Record<string, string>;
  events(): readonly string[];
  settings?(settings: ArcadeSettings): void;
}

// Survives Astro navigation when browser storage is denied; never stores an active run.
const memory = new Map<string, string>();
function read(key: string) {
  try {
    return localStorage.getItem(key) ?? memory.get(key) ?? null;
  } catch {
    return memory.get(key) ?? null;
  }
}
function write(key: string, value: string) {
  memory.set(key, value);
  try {
    localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}
const clamp = (value: unknown, fallback: number, min: number, max: number) =>
  typeof value === 'number' && Number.isFinite(value)
    ? Math.min(max, Math.max(min, value))
    : fallback;

export function mountArcade(root: HTMLElement, driver: ArcadeDriver) {
  const canvas = root.querySelector<HTMLCanvasElement>(`[data-${driver.prefix}-canvas]`)!;
  // A canvas cannot switch from 2D to WebGL: the adapter owns context creation.
  const presentation = driver.presentation
    ? driver.presentation(canvas)
    : (() => {
        const ctx = canvas.getContext('2d');
        if (!ctx || !driver.draw) throw new Error('Canvas presentation unavailable');
        canvas.width = driver.width;
        canvas.height = driver.height;
        return {
          draw(settings: ArcadeSettings, reduced: boolean, time: number) {
            ctx.imageSmoothingEnabled = false;
            driver.draw!(ctx, settings, reduced, time);
          },
          resize() {},
          dispose() {},
        };
      })();
  const abort = new AbortController();
  const { signal } = abort;
  const listen = <E extends Event>(
    target: EventTarget,
    type: string,
    callback: (event: E) => void,
    options: AddEventListenerOptions = {}
  ) => target.addEventListener(type, callback as EventListener, { ...options, signal });
  const q = <T extends HTMLElement = HTMLElement>(selector: string) =>
    root.querySelector<T>(selector);
  const version = rulesVersion(driver.game);
  const proofreader = isProofreader(driver.game);
  const { progress: progressKey, settings: settingsKey } = arcadeStorageKeys(driver.game);
  const storageAvailable = driver.game !== 'proofreader-classic' || copyClassicSaves(read, write);
  let progress = decodeProgress(read(progressKey), version);
  let options = parseRunOptions(
    driver.game,
    location.search,
    progress.unlocked,
    (Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0
  );
  let stored: Partial<ArcadeSettings> = {};
  try {
    stored = JSON.parse(read(settingsKey) ?? '{}') ?? {};
    if (version === 3 && !read(settingsKey)) {
      const previous = JSON.parse(read(`khc-arcade-${driver.game}-settings-v2`) ?? '{}');
      const { sound, volume, speed, assist, sensitivity, deadZone } = previous ?? {};
      stored = { sound, volume, speed, assist, sensitivity, deadZone };
    }
  } catch {}
  const bindings = { ...driver.bindings };
  if (stored.bindings && typeof stored.bindings === 'object')
    for (const action of Object.keys(bindings)) {
      const value = stored.bindings[action];
      if (
        typeof value === 'string' &&
        value.length > 0 &&
        value.length <= 20 &&
        !['Escape', 'Enter', 'p', 'Tab'].includes(value)
      )
        bindings[action] = value;
    }
  if (new Set(Object.values(bindings)).size !== Object.keys(bindings).length)
    Object.assign(bindings, driver.bindings);
  const settings: ArcadeSettings = {
    sound:
      stored.sound === true ||
      (stored.sound === undefined &&
        proofreader &&
        read('khc-proofreader-sound') === 'on'),
    volume: clamp(stored.volume, 0.25, 0, 1),
    palette: Math.floor(clamp(stored.palette, 0, 0, 3)),
    speed: clamp(stored.speed, 1, 0.5, 1),
    assist:
      typeof stored.assist === 'boolean'
        ? stored.assist
        : proofreader && matchMedia('(pointer: coarse)').matches,
    toggle: stored.toggle === true,
    sensitivity: clamp(stored.sensitivity, 1, 0.5, 2),
    deadZone: clamp(stored.deadZone, 8, 4, 24),
    bindings,
    graphics: stored.graphics === 'low' || stored.graphics === 'high' ? stored.graphics : 'auto',
    fov: clamp(stored.fov, 75, 60, 95),
    motion: clamp(stored.motion, 0.35, 0, 1),
  };
  if (settings.palette > Math.floor(progress.cleared.length / 2)) settings.palette = 0;
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  let reduced = motion.matches;
  let raf = 0;
  let lastFrame = 0;
  let lastPaint = 0;
  let alpha = 1;
  let recorded = false;
  let assisted = false;
  let destroyed = false;
  let message = '';
  let audio: AudioContext | null = null;
  let shotNoise: AudioBuffer | null = null;
  let focusTimer = 0;
  const clock = createGameClock(driver.stepSeconds, 12);
  const pressed = new Map<string, string>();
  const legacyKey =
    driver.game === 'jetpack' ? 'khc-jetpack-joyride-best'
      : proofreader ? 'khc-proofreader-best' : `khc-${driver.game}-best`;
  const previousEdition = version === 3 ? decodeProgress(read('khc-arcade-proofreader-v2')) : null;
  const oldScore = Math.max(
    Number(read(legacyKey)) || 0,
    ...Object.values(previousEdition?.records ?? {}).map((r) => r.score)
  );
  const legacyBest = Number.isFinite(oldScore) && oldScore > 0 ? oldScore : 0;
  setLabel(
    q('[data-arcade-legacy]'),
    legacyBest > 0
      ? `Previous-edition best: ${legacyBest.toLocaleString()}. New rules use separate records.`
      : 'Records stay on this browser. Practice does not create records.'
  );
  const modeSelect = q<HTMLSelectElement>('[data-arcade-mode]')!;
  const linkVersion = new URLSearchParams(location.search).get('rules');
  if (proofreader && linkVersion && linkVersion !== String(version)) {
    setLabel(
      q('[data-arcade-legacy]'),
      version === 3
        ? 'This challenge belongs to another edition. You are playing Proofreader 3D v3; old maps and scores are not comparable.'
        : 'This challenge belongs to another edition. You are playing Proofreader Classic v2; 3D maps and scores are not comparable.'
    );
  }
  const stageSelect = q<HTMLSelectElement>('[data-arcade-stage]')!;
  const difficultySelect = q<HTMLSelectElement>('[data-arcade-difficulty]')!;

  function sound(event: string) {
    if (!settings.sound || !audio || audio.state !== 'running') return;
    const pitches: Record<string, number> = {
      fire: 160,
      hit: 110,
      hurt: 90,
      kill: 480,
      eat: 660,
      coin: 740,
      pickup: 520,
      shield: 540,
      magnet: 420,
      near: 900,
      bonus: 900,
      motif: 880,
      relay: 780,
      won: 1040,
      over: 70,
      wrong: 140,
      wave: 300,
      scatter: 100,
      pulse: 70,
      reload: 260,
      switch: 360,
      checkpoint: 880,
      jump: 240,
    };
    const pitch = pitches[event];
    if (!pitch) return;
    const osc = audio.createOscillator();
    const gain = audio.createGain();
    const proofShot = driver.game === 'proofreader' && ['fire', 'scatter', 'pulse'].includes(event);
    osc.type =
      driver.game === 'proofreader'
        ? event === 'pulse'
          ? 'triangle'
          : 'sine'
        : event === 'fire'
          ? 'triangle'
          : 'square';
    osc.frequency.setValueAtTime(pitch, audio.currentTime);
    osc.frequency.exponentialRampToValueAtTime(
      Math.max(40, pitch * (event === 'won' ? 1.5 : 0.65)),
      audio.currentTime + 0.1
    );
    gain.gain.setValueAtTime(settings.volume * 0.045, audio.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + 0.13);
    osc.connect(gain);
    gain.connect(audio.destination);
    osc.onended = () => {
      osc.disconnect();
      gain.disconnect();
    };
    osc.start();
    osc.stop(audio.currentTime + 0.14);
    if (proofShot) {
      if (!shotNoise) {
        shotNoise = audio.createBuffer(1, Math.floor(audio.sampleRate * 0.07), audio.sampleRate);
        const channel = shotNoise.getChannelData(0);
        for (let i = 0; i < channel.length; i++)
          channel[i] = Math.sin(i * 127.1) * Math.cos(i * 311.7) * (1 - i / channel.length);
      }
      const source = audio.createBufferSource(),
        filter = audio.createBiquadFilter(),
        envelope = audio.createGain();
      source.buffer = shotNoise;
      filter.type = 'lowpass';
      filter.frequency.value = event === 'scatter' ? 2400 : event === 'pulse' ? 650 : 1600;
      envelope.gain.setValueAtTime(
        settings.volume * (event === 'scatter' ? 0.07 : 0.04),
        audio.currentTime
      );
      envelope.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + 0.07);
      source.connect(filter);
      filter.connect(envelope);
      envelope.connect(audio.destination);
      source.onended = () => {
        source.disconnect();
        filter.disconnect();
        envelope.disconnect();
      };
      source.start();
    }
  }
  function unlockAudio() {
    if (!settings.sound) return;
    try {
      audio ??= new AudioContext();
      void audio.resume().catch(() => {});
    } catch {}
  }
  function storageNotice() {
    setLabel(
      q('[data-arcade-storage]'),
      'Browser storage is unavailable. Progress is kept for this visit only.'
    );
  }
  function saveSettings() {
    if (!write(settingsKey, JSON.stringify(settings))) storageNotice();
    driver.settings?.(settings);
    assisted ||= settings.speed < 1 || (proofreader && settings.assist);
  }
  function controls() {
    modeSelect.value = options.mode;
    stageSelect.value = String(options.stage);
    difficultySelect.value = options.difficulty;
    root.querySelectorAll<HTMLOptionElement>('[data-arcade-stage] option').forEach((item, i) => {
      item.disabled = options.mode !== 'practice' && i + 1 > progress.unlocked;
    });
    root.querySelectorAll<HTMLButtonElement>('[data-arcade-stage-button]').forEach((button, i) => {
      button.disabled = options.mode !== 'practice' && i + 1 > progress.unlocked;
      button.setAttribute('aria-pressed', String(i + 1 === options.stage));
      const record =
        progress.records[recordKey({ ...options, mode: 'campaign', stage: i + 1 }, assisted)];
      setLabel(
        button.querySelector('[data-arcade-stars]'),
        record ? record.medals.map((m) => (m ? '★' : '☆')).join('') : '☆☆☆'
      );
    });
    root.querySelectorAll<HTMLOptionElement>('[data-arcade-palette] option').forEach((item, i) => {
      item.disabled = i > Math.floor(progress.cleared.length / 2);
    });
    const staged = options.mode === 'campaign' || options.mode === 'practice';
    q('[data-arcade-map]')!.hidden = !staged;
    stageSelect.closest<HTMLElement>('label')!.hidden = !staged;
    setLabel(
      q('[data-arcade-brief]'),
      staged
        ? CAMPAIGNS[driver.game][options.stage - 1].lesson
        : options.mode === 'motif'
          ? 'Follow the target sequence. A wrong base resets the motif streak, not the run.'
          : 'Instant play. A seed link lets a friend replay the same challenge.'
    );
  }
  function makeReady() {
    release();
    clock.reset();
    lastFrame = 0;
    recorded = false;
    message = '';
    assisted = settings.speed < 1 || (proofreader && settings.assist);
    driver.create(options);
    driver.settings?.(settings);
    controls();
    sync();
    paint();
  }
  function begin() {
    unlockAudio();
    if (driver.status() === 'over' && driver.retry?.()) {
      recorded = false;
      release();
    } else if (driver.status() === 'over' || driver.status() === 'won') makeReady();
    driver.start();
    lastFrame = 0;
    clock.reset();
    message = '';
    canvas.focus({ preventScroll: true });
    sync();
    wake();
  }
  function release() {
    pressed.clear();
    driver.release();
  }
  function pause() {
    if (driver.status() !== 'playing') return;
    driver.pause();
    release();
    if (document.pointerLockElement === canvas) document.exitPointerLock();
    if (audio?.state === 'running') void audio.suspend().catch(() => {});
    lastFrame = 0;
    clock.reset();
    sync();
    paint();
  }
  function togglePause() {
    if (driver.status() === 'playing') pause();
    else if (driver.status() === 'paused') begin();
  }
  function restart() {
    makeReady();
    begin();
  }
  function paint(time = performance.now()) {
    if (destroyed) return;
    presentation.draw(settings, reduced, time, alpha);
  }
  function sync() {
    const status = driver.status();
    root.dataset.arcadeStatus = status;
    root.dataset.arcadeMode = options.mode;
    if ((status === 'won' || status === 'over') && !recorded) {
      release();
      recorded = true;
      progress = recordResult(progress, options, driver.result(), assisted);
      if (!write(progressKey, JSON.stringify(progress))) storageNotice();
      controls();
      sound(status);
    }
    for (const [name, value] of Object.entries(driver.hud()))
      setLabel(q(`[data-${driver.prefix}-${name}]`), value);
    const record = progress.records[recordKey(options, assisted)];
    setLabel(q(`[data-${driver.prefix}-best]`), String(record?.score ?? 0));
    setLabel(
      q('[data-arcade-run-label]'),
      `${options.mode === 'classic' ? 'Quick play' : options.mode} · ${options.difficulty}${assisted ? ' · assisted' : ''}`
    );
    const busy = status === 'playing' || status === 'paused';
    for (const field of [modeSelect, stageSelect, difficultySelect]) field.disabled = busy;
    root.querySelectorAll<HTMLButtonElement>('[data-arcade-stage-button]').forEach((button, i) => {
      button.disabled = busy || (options.mode !== 'practice' && i + 1 > progress.unlocked);
    });
    const pauseButton = q<HTMLButtonElement>(`[data-${driver.prefix}-pause]`)!;
    pauseButton.disabled = !busy;
    setLabel(pauseButton, status === 'paused' ? 'Resume' : 'Pause');
    const share = q<HTMLButtonElement>(`[data-${driver.prefix}-share]`);
    if (share) share.disabled = status !== 'over' && status !== 'won';
    setLabel(q(`[data-${driver.prefix}-sound]`), settings.sound ? 'Sound on' : 'Sound off');
    q(`[data-${driver.prefix}-sound]`)?.setAttribute('aria-pressed', String(settings.sound));
    q('[data-arcade-setup]')!.hidden = busy;
    const overlay = q('[data-arcade-overlay]')!;
    overlay.hidden = status === 'playing';
    const stage = CAMPAIGNS[driver.game][options.stage - 1];
    setLabel(
      q('[data-arcade-overlay-title]'),
      status === 'ready'
        ? options.mode === 'campaign' || options.mode === 'practice'
          ? stage.name
          : options.mode === 'motif'
            ? 'Motif Hunt'
            : 'Quick play'
        : status === 'paused'
          ? 'Paused'
          : status === 'won'
            ? 'Stage clear!'
            : 'Try another route'
    );
    setLabel(
      q('[data-arcade-overlay-detail]'),
      status === 'ready'
        ? options.mode === 'campaign' || options.mode === 'practice'
          ? stage.lesson
          : 'Choose your moment. Ready when you are.'
        : status === 'paused'
          ? 'Inputs released. Resume when you are ready.'
          : driver.result().detail
    );
    setLabel(
      q('[data-arcade-primary]'),
      status === 'ready'
        ? 'Start'
        : status === 'paused'
          ? 'Resume'
          : status === 'over' && driver.retry && options.mode !== 'classic'
            ? 'Retry checkpoint'
            : 'Retry'
    );
    q('[data-arcade-home]')!.hidden = status === 'ready';
    q('[data-arcade-next]')!.hidden =
      status !== 'won' || options.mode !== 'campaign' || options.stage >= 6;
    setLabel(
      q('[data-arcade-medals]'),
      status === 'won'
        ? options.mode === 'practice'
          ? 'Practice clear · no records'
          : driver
              .result()
              .medals.map(
                (m, i) =>
                  `${m ? '★' : '☆'} ${driver.game === 'snake' ? ['Clear', 'Par time', 'Bonus chip'][i] : proofreader ? ['Clear', '70% accuracy', 'No damage'][i] : ['Clear', 'Base quota', 'No shield lost'][i]}`
              )
              .join(' · ')
        : ''
    );
    const line =
      message ||
      (status === 'playing'
        ? 'Playing · P pauses; Stage menu changes modes.'
        : status === 'ready'
          ? 'Start with the button, keyboard, or playfield.'
          : status === 'paused'
            ? 'Paused · Resume or choose Stage menu.'
            : driver.result().detail);
    setLabel(q(`[data-${driver.prefix}-status]`), line);
  }
  function frame(time: number) {
    raf = 0;
    if (destroyed || driver.status() !== 'playing') return;
    const dt = lastFrame ? Math.max(0, (time - lastFrame) / 1000) : 0;
    lastFrame = time;
    alpha = clock.advance(dt * settings.speed, (step) => {
      if (driver.status() === 'playing') {
        driver.step(step);
        for (const event of driver.events()) if (event !== 'won' && event !== 'over') sound(event);
      }
    });
    if (time - lastPaint >= 1000 / 60 - 1 || driver.status() !== 'playing') {
      paint(time);
      sync();
      lastPaint = time;
    }
    if (driver.status() === 'playing') wake();
  }
  function wake() {
    if (!destroyed && !raf && driver.status() === 'playing') raf = requestAnimationFrame(frame);
  }
  function notify() {
    sync();
    paint();
    wake();
  }
  async function share() {
    const url = new URL(challengeUrl(location.pathname, options, version), location.origin).href;
    const result = driver.result();
    const text = `${document.title.split(' · ')[0]} · ${result.score} points${assisted ? ' (assisted)' : ''} · ${result.detail}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: document.title, text, url });
        message = 'Result shared';
      } else {
        await navigator.clipboard.writeText(`${text} ${url}`);
        message = 'Result copied';
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      message = `Sharing unavailable. Challenge: ${url}`;
    }
    sync();
  }

  function select() {
    options = parseRunOptions(
      driver.game,
      `mode=${modeSelect.value}&stage=${stageSelect.value}&difficulty=${difficultySelect.value}&seed=${options.seed}`,
      progress.unlocked,
      options.seed
    );
    makeReady();
  }
  listen(modeSelect, 'change', select);
  listen(stageSelect, 'change', select);
  listen(difficultySelect, 'change', select);
  root.querySelectorAll<HTMLButtonElement>('[data-arcade-stage-button]').forEach((button) =>
    listen(button, 'click', () => {
      stageSelect.value = button.dataset.arcadeStageButton!;
      select();
    })
  );
  listen(q('[data-arcade-primary]')!, 'click', begin);
  listen<MouseEvent>(q('[data-arcade-overlay]')!, 'click', (event) => {
    if (!(event.target instanceof Element) || !event.target.closest('button')) begin();
  });
  listen(q('[data-arcade-home]')!, 'click', makeReady);
  listen(q('[data-arcade-next]')!, 'click', () => {
    options = {
      ...options,
      stage: Math.min(6, options.stage + 1),
      seed: CAMPAIGNS[driver.game][Math.min(5, options.stage)].seed,
    };
    makeReady();
    begin();
  });
  listen(q(`[data-${driver.prefix}-pause]`)!, 'click', togglePause);
  listen(q(`[data-${driver.prefix}-restart]`)!, 'click', restart);
  listen(q(`[data-${driver.prefix}-sound]`)!, 'click', () => {
    settings.sound = !settings.sound;
    saveSettings();
    if (settings.sound) unlockAudio();
    else void audio?.suspend().catch(() => {});
    sync();
  });
  const shareButton = q(`[data-${driver.prefix}-share]`);
  if (shareButton) listen(shareButton, 'click', () => void share());
  const settingsInputs: Record<string, keyof ArcadeSettings> = {
    volume: 'volume',
    palette: 'palette',
    speed: 'speed',
    sensitivity: 'sensitivity',
    deadzone: 'deadZone',
    assist: 'assist',
    toggle: 'toggle',
    graphics: 'graphics',
    fov: 'fov',
    motion: 'motion',
  };
  for (const [name, field] of Object.entries(settingsInputs)) {
    const input = q<HTMLInputElement>(`[data-arcade-${name}]`);
    if (!input) continue;
    if (input.type === 'checkbox') input.checked = Boolean(settings[field]);
    else input.value = String(settings[field]);
    listen(input, 'change', () => {
      if (input.type === 'checkbox')
        (settings as unknown as Record<string, unknown>)[field] = input.checked;
      else
        (settings as unknown as Record<string, unknown>)[field] =
          field === 'graphics' ? input.value : Number(input.value);
      saveSettings();
      controls();
      notify();
    });
  }
  const bindingList = q('[data-arcade-bindings]')!;
  let remapping: string | null = null;
  const bindingButtons = new Map<string, HTMLButtonElement>();
  for (const [action, key] of Object.entries(settings.bindings)) {
    const label = document.createElement('label');
    label.textContent = action.replace(/[A-Z]/g, (c) => ` ${c.toLowerCase()}`);
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = key === ' ' ? 'Space' : key;
    button.setAttribute('aria-label', `Remap ${label.textContent}: ${button.textContent}`);
    listen(button, 'click', () => {
      pause();
      remapping = action;
      setLabel(button, 'Press a key…');
    });
    label.append(button);
    bindingList.append(label);
    bindingButtons.set(action, button);
  }
  listen<KeyboardEvent>(root, 'keydown', (event) => {
    if (remapping) {
      event.preventDefault();
      event.stopPropagation();
      const action = remapping;
      remapping = null;
      if (
        !['Escape', 'Enter', 'Tab', 'p'].includes(event.key) &&
        event.key.length <= 20 &&
        !event.ctrlKey &&
        !event.metaKey &&
        !event.altKey
      ) {
        const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
        const other = Object.keys(settings.bindings).find(
          (a) => a !== action && settings.bindings[a] === key
        );
        if (other) {
          settings.bindings[other] = settings.bindings[action];
          setLabel(
            bindingButtons.get(other),
            settings.bindings[other] === ' ' ? 'Space' : settings.bindings[other]
          );
          bindingButtons
            .get(other)
            ?.setAttribute(
              'aria-label',
              `Remap ${other}: ${settings.bindings[other] === ' ' ? 'Space' : settings.bindings[other]}`
            );
        }
        settings.bindings[action] = key;
        saveSettings();
      }
      setLabel(
        bindingButtons.get(action),
        settings.bindings[action] === ' ' ? 'Space' : settings.bindings[action]
      );
      bindingButtons
        .get(action)
        ?.setAttribute(
          'aria-label',
          `Remap ${action}: ${settings.bindings[action] === ' ' ? 'Space' : settings.bindings[action]}`
        );
      return;
    }
    const target = event.target instanceof Element ? event.target : null;
    if (
      target?.closest('button,input,select,textarea,a,[contenteditable]') ||
      event.ctrlKey ||
      event.metaKey ||
      event.altKey ||
      event.defaultPrevented
    )
      return;
    const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
    if (key === 'p' || key === 'Escape') {
      event.preventDefault();
      togglePause();
      return;
    }
    if (key === 'Enter') {
      event.preventDefault();
      if (driver.status() !== 'playing') begin();
      return;
    }
    let action = Object.keys(settings.bindings).find((a) => settings.bindings[a] === key);
    if (!action && driver.aliases?.[key]) {
      const alias = driver.aliases[key];
      if (settings.bindings[alias] === driver.bindings[alias]) action = alias;
    }
    if (!action) return;
    event.preventDefault();
    if (event.repeat) return;
    if (driver.status() !== 'playing') begin();
    pressed.set(event.code || event.key, action);
    driver.input(action, true);
    notify();
  });
  listen<KeyboardEvent>(window, 'keyup', (event) => {
    const key = event.code || event.key;
    const action = pressed.get(key);
    if (!action) return;
    pressed.delete(key);
    driver.input(action, false);
    notify();
  });
  listen(window, 'blur', pause);
  listen<CustomEvent<{ focused: boolean }>>(root, 'khc:game-focus-change', (event) => {
    if (!event.detail.focused) pause();
  });
  listen(document, 'visibilitychange', () => {
    if (document.hidden) pause();
  });
  // Native focusout can run a microtask while activeElement is temporarily BODY,
  // before focusin on another game control. Pausing then makes Pause resume instead.
  listen<FocusEvent>(root, 'focusout', (event) => {
    if (event.relatedTarget instanceof Node) {
      if (!root.contains(event.relatedTarget)) pause();
      return;
    }
    clearTimeout(focusTimer);
    focusTimer = window.setTimeout(() => {
      focusTimer = 0;
      if (!destroyed && !root.contains(document.activeElement)) pause();
    }, 0);
  });
  listen(document, 'khc:theme-change', () => paint());
  listen(motion, 'change', () => {
    reduced = motion.matches;
    paint();
  });
  const resize = new ResizeObserver(() => {
    presentation.resize();
    paint();
  });
  resize.observe(canvas);
  const visibility = new IntersectionObserver((entries) => {
    if (!entries[0]?.isIntersecting) pause();
  });
  visibility.observe(canvas);
  makeReady();
  if (!storageAvailable) storageNotice();
  return {
    canvas,
    settings,
    listen,
    options: () => options,
    begin,
    restart,
    pause,
    togglePause,
    notify,
    share,
    sound,
    best: () => progress.records[recordKey(options, assisted)]?.score ?? 0,
    running: () => driver.status() === 'playing' && !destroyed,
    destroy() {
      if (destroyed) return;
      destroyed = true;
      cancelAnimationFrame(raf);
      clearTimeout(focusTimer);
      raf = 0;
      release();
      abort.abort();
      resize.disconnect();
      visibility.disconnect();
      presentation.dispose();
      if (document.pointerLockElement === canvas) document.exitPointerLock();
      void audio?.close().catch(() => {});
    },
  };
}
