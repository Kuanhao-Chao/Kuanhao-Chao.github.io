import {
  createGame,
  start,
  pause,
  step,
  setThrust,
  jetpackResult,
  type GameState,
  type Base,
} from '../lib/jetpackJoyride';
import { mountArcade } from './arcadeBrowser';
import { drawJetpack } from './arcadePixels';

interface JetpackTestApi {
  state(): GameState;
  status(): GameState['status'];
  bases(): number;
  coins(): number;
  best(): number;
  start(): void;
  restart(): void;
  pause(): void;
  resume(): void;
  setThrust(on: boolean): void;
  tick(frames?: number): void;
  spawnHazard(kind?: 'zapper' | 'laser' | 'missile', y?: number): void;
  spawnCoin(base?: Base, y?: number): void;
  spawnShield(y?: number): void;
  endRun(): void;
  isRunning(): boolean;
}
declare global {
  interface Window {
    __jetpackJoyride?: JetpackTestApi;
    __jetpackJoyrideInstances?: number;
  }
}
export interface JetpackJoyrideController {
  destroy(): void;
}

export function initJetpackJoyride(parent: ParentNode = document): JetpackJoyrideController | null {
  const root = parent.querySelector<HTMLElement>('[data-arcade-game="jetpack"]');
  const canvas = root?.querySelector<HTMLCanvasElement>('[data-jetpack-canvas]');
  if (!root || !canvas || canvas.dataset.jetpackReady || !canvas.getContext('2d')) return null;
  canvas.dataset.jetpackReady = 'true';
  let state = createGame(1);
  const held = new Set<string>();
  let toggled = false;
  let activePointer: number | null = null;
  let pendingEvents: string[] = [];
  let pulseTimer = 0;
  const syncThrust = () => {
    setThrust(state, toggled || held.size > 0);
    root
      ?.querySelector('[data-jetpack-thrust]')
      ?.setAttribute('aria-pressed', String(state.flyer.thrusting));
  };
  const runtime = mountArcade(root, {
    game: 'jetpack',
    prefix: 'jetpack',
    width: 384,
    height: 256,
    stepSeconds: 1 / 60,
    bindings: { thrust: ' ' },
    aliases: { ArrowUp: 'thrust', w: 'thrust' },
    create(options) {
      const expert = options.difficulty === 'expert';
      state = createGame(
        options.seed,
        {
          width: 960,
          height: 640,
          groundY: 596,
          startSpeed: expert ? 360 : 300,
          maxSpeed: expert ? 650 : 540,
          speedRamp: expert ? 2 : 1.6,
          initialGap: 960,
        },
        options
      );
      if (options.mode === 'campaign' || options.mode === 'practice') state.flyer.shielded = true;
      held.clear();
      toggled = false;
      activePointer = null;
      pendingEvents = [];
    },
    status: () => state.status,
    start: () => start(state),
    pause: () => pause(state),
    release() {
      held.clear();
      toggled = false;
      activePointer = null;
      clearTimeout(pulseTimer);
      pulseTimer = 0;
      syncThrust();
    },
    input(_action, down) {
      if (runtime.settings.toggle) {
        if (down) toggled = !toggled;
      } else if (down) held.add('key');
      else held.delete('key');
      syncThrust();
    },
    step(dt) {
      step(state, dt * 1000);
      pendingEvents.push(...state.events);
    },
    events: () => pendingEvents.splice(0),
    result: () => jetpackResult(state),
    draw(ctx, settings, reduced) {
      drawJetpack(ctx, state, settings.palette, reduced);
    },
    hud: () => ({
      score: String(state.score),
      bases: String(state.bases),
      coins: String(state.coinCount),
      gear: `${state.flyer.shielded ? 'S' : '—'}${state.magnetMs > 0 ? ' M' : ''}`,
    }),
  });
  const thrustButton = root.querySelector<HTMLButtonElement>('[data-jetpack-thrust]')!;
  function engage(source: string) {
    if (state.status !== 'playing') runtime.begin();
    if (runtime.settings.toggle) toggled = !toggled;
    else held.add(source);
    syncThrust();
    thrustButton.setAttribute('aria-pressed', String(state.flyer.thrusting));
    runtime.notify();
  }
  function disengage(source: string, cancelled = false) {
    held.delete(source);
    if (cancelled) toggled = false;
    syncThrust();
    thrustButton.setAttribute('aria-pressed', String(state.flyer.thrusting));
    runtime.notify();
  }
  runtime.listen<PointerEvent>(canvas, 'pointerdown', (event) => {
    if (event.button > 0 || activePointer !== null) return;
    engage('pointer');
    activePointer = event.pointerId;
    canvas.focus({ preventScroll: true });
    try {
      canvas.setPointerCapture(event.pointerId);
    } catch {}
  });
  for (const name of ['pointerup', 'pointercancel', 'lostpointercapture'])
    runtime.listen<PointerEvent>(canvas, name, (event) => {
      if (activePointer !== event.pointerId) return;
      activePointer = null;
      disengage('pointer', name !== 'pointerup');
    });
  let lastPointer = -Infinity;
  runtime.listen<PointerEvent>(thrustButton, 'pointerdown', (event) => {
    event.preventDefault();
    engage('button');
    lastPointer = performance.now();
    try {
      thrustButton.setPointerCapture(event.pointerId);
    } catch {}
  });
  for (const name of ['pointerup', 'pointercancel', 'lostpointercapture'])
    runtime.listen(thrustButton, name, () => {
      lastPointer = performance.now();
      disengage('button', name === 'pointercancel');
    });
  // Native keyboard activation can be held as well as clicked; no setTimeout pulse can stick.
  runtime.listen<KeyboardEvent>(thrustButton, 'keydown', (event) => {
    if ((event.key === ' ' || event.key === 'Enter') && !event.repeat) {
      event.preventDefault();
      engage('button-key');
    }
  });
  runtime.listen<KeyboardEvent>(thrustButton, 'keyup', (event) => {
    if (event.key === ' ' || event.key === 'Enter') {
      event.preventDefault();
      disengage('button-key');
    }
  });
  runtime.listen<KeyboardEvent>(window, 'keyup', (event) => {
    if ((event.key === ' ' || event.key === 'Enter') && held.has('button-key')) {
      lastPointer = performance.now();
      disengage('button-key');
    }
  });
  runtime.listen(thrustButton, 'click', () => {
    if (performance.now() - lastPointer <= 700) return;
    if (state.status !== 'playing') runtime.begin();
    if (runtime.settings.toggle) {
      toggled = !toggled;
      syncThrust();
    } else {
      held.add('assistive-click');
      syncThrust();
      clearTimeout(pulseTimer);
      pulseTimer = window.setTimeout(() => {
        held.delete('assistive-click');
        syncThrust();
        pulseTimer = 0;
        runtime.notify();
      }, 260);
    }
    runtime.notify();
  });
  window.__jetpackJoyrideInstances = (window.__jetpackJoyrideInstances ?? 0) + 1;
  window.__jetpackJoyride = {
    state: () => state,
    status: () => state.status,
    bases: () => state.bases,
    coins: () => state.coinCount,
    best: runtime.best,
    start: runtime.begin,
    restart: runtime.restart,
    pause: runtime.pause,
    resume: runtime.begin,
    isRunning: runtime.running,
    setThrust(on) {
      if (on) held.add('test');
      else held.delete('test');
      syncThrust();
    },
    tick(frames = 1) {
      if (state.status === 'ready') start(state);
      for (let i = 0; i < Math.max(1, Math.min(36000, frames)) && state.status === 'playing'; i++)
        step(state, 1000 / 60);
      runtime.notify();
    },
    spawnHazard(kind = 'zapper', y = state.flyer.y) {
      const id = state.nextId++;
      if (kind === 'laser')
        state.lasers.push({ id, kind, y, thickness: 26, phase: 'active', timer: 620 });
      else if (kind === 'missile')
        state.missiles.push({
          id,
          kind,
          x: state.flyer.x,
          y,
          vx: 0,
          vy: 0,
          radius: 14,
          phase: 'active',
          timer: 0,
        });
      else
        state.zappers.push({
          id,
          kind,
          cx: state.flyer.x,
          cy: y,
          halfLen: 60,
          angle: Math.PI / 2,
          spin: 0,
          thickness: 12,
        });
    },
    spawnCoin(base = 'A', y = state.flyer.y) {
      state.coins.push({ id: state.nextId++, x: state.flyer.x, y, radius: 12, base });
    },
    spawnShield(y = state.flyer.y) {
      state.powerUps.push({ id: state.nextId++, x: state.flyer.x, y, radius: 16, kind: 'shield' });
    },
    endRun() {
      state.status = 'over';
      state.flyer.thrusting = false;
      runtime.notify();
    },
  };
  return {
    destroy() {
      runtime.destroy();
      delete canvas.dataset.jetpackReady;
      window.__jetpackJoyrideInstances = Math.max(0, (window.__jetpackJoyrideInstances ?? 1) - 1);
      if (!window.__jetpackJoyrideInstances) delete window.__jetpackJoyride;
    },
  };
}
