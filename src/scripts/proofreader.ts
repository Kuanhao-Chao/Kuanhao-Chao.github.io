import {
  createGame,
  start,
  pause,
  step,
  fire,
  firePulse,
  setAimAssist,
  turnBy,
  proofResult,
  TUNING,
  type GameState,
  type StepInput,
} from '../lib/proofreader';
import { CAMPAIGNS } from '../lib/arcade';
import { mountArcade } from './arcadeBrowser';
import { drawProofreader, pixelPalette } from './arcadePixels';
import { setLabel } from '../lib/domLabel';

interface ProofreaderTestApi {
  state(): GameState;
  start(): void;
  restart(): void;
  tick(frames?: number): void;
  setInput(input: Partial<StepInput>): void;
  turn(rad: number): void;
  fire(): boolean;
  pause(): void;
  resume(): void;
  endRun(): void;
  share(): Promise<void>;
  isRunning(): boolean;
}
declare global {
  interface Window {
    __proofreader?: ProofreaderTestApi;
    __proofreaderInstances?: number;
  }
}
export interface ProofreaderController {
  destroy(): void;
}

export function initProofreader(parent: ParentNode = document): ProofreaderController | null {
  const root = parent.querySelector<HTMLElement>('[data-arcade-game="proofreader"]');
  const canvas = root?.querySelector<HTMLCanvasElement>('[data-proof-canvas]');
  if (!root || !canvas || canvas.dataset.proofReady || !canvas.getContext('2d')) return null;
  canvas.dataset.proofReady = 'true';
  let state = createGame(1);
  const input: StepInput = { forward: 0, strafe: 0, turn: 0, fire: false, pulse: false };
  const held = new Set<string>();
  let mouseX: number | null = null;
  let locked = false;
  const pointers = new Map<
    number,
    { side: 'move' | 'look'; x: number; y: number; lastX: number }
  >();
  let stick: { x: number; y: number; dx: number; dy: number } | null = null;
  let pendingEvents: string[] = [];
  let mouseFire = false;
  let buttonFire = false;
  function syncFire() {
    input.fire = held.has('fire') || mouseFire || buttonFire;
    root?.querySelector('[data-proof-fire]')?.setAttribute('aria-pressed', String(input.fire));
  }
  function release() {
    held.clear();
    pointers.clear();
    stick = null;
    mouseX = null;
    mouseFire = false;
    buttonFire = false;
    Object.assign(input, { forward: 0, strafe: 0, turn: 0, fire: false, pulse: false });
    syncFire();
  }
  function keyboard() {
    input.forward = Number(held.has('forward')) - Number(held.has('back'));
    input.strafe = Number(held.has('right')) - Number(held.has('left'));
    input.turn = Number(held.has('turnRight')) - Number(held.has('turnLeft'));
    syncFire();
    input.pulse = held.has('pulse');
  }
  const runtime = mountArcade(root, {
    game: 'proofreader',
    prefix: 'proof',
    width: 320,
    height: 240,
    stepSeconds: 1 / 120,
    bindings: {
      forward: 'w',
      back: 's',
      left: 'a',
      right: 'd',
      turnLeft: 'ArrowLeft',
      turnRight: 'ArrowRight',
      fire: ' ',
      pulse: 'f',
    },
    aliases: { ArrowUp: 'forward', ArrowDown: 'back', q: 'turnLeft', e: 'turnRight' },
    create(options) {
      release();
      pendingEvents = [];
      state = createGame(options.seed, 17, 17, options);
    },
    status: () => state.status,
    start: () => start(state),
    pause: () => pause(state),
    release,
    input(action, down) {
      if (action === 'fire' && runtime.settings.toggle) {
        if (down) {
          if (held.has(action)) held.delete(action);
          else held.add(action);
        }
      } else if (down) held.add(action);
      else held.delete(action);
      if (action === 'fire' || action === 'pulse') {
        syncFire();
        input.pulse = held.has('pulse');
      } else keyboard();
    },
    settings(settings) {
      setAimAssist(state, settings.assist);
    },
    step(dt) {
      step(state, dt, input);
      pendingEvents.push(...state.events);
    },
    events: () => pendingEvents.splice(0),
    draw(ctx, settings, reduced) {
      drawProofreader(ctx, state, settings.palette, reduced);
      if (stick) {
        const p = pixelPalette(settings.palette);
        ctx.strokeStyle = p.accent;
        ctx.lineWidth = 2;
        ctx.strokeRect(stick.x - 20, stick.y - 20, 40, 40);
        ctx.fillStyle = p.accent;
        ctx.fillRect(stick.x + stick.dx - 5, stick.y + stick.dy - 5, 10, 10);
      }
    },
    result: () => proofResult(state),
    hud() {
      const stage = CAMPAIGNS.proofreader[state.run.stage - 1];
      return {
        health: String(Math.max(0, Math.round(state.player.health))),
        ammo: `${state.player.ammo} / ${TUNING.maxAmmo}`,
        wave: String(state.wave),
        score: String(state.score),
        sequence: state.sequence.join(' · ') || '—',
        objective:
          state.run.mode === 'classic'
            ? ' · Endless survival'
            : ` · ${stage.name} · Relays ${state.relays.filter((r) => r.active).length}/${state.relays.length} · ${state.exit.open ? 'Exit OPEN' : 'Clear threats to open exit'}`,
      };
    },
  });
  function beginIfNeeded() {
    if (state.status !== 'playing') runtime.begin();
  }
  function shoot(pulse = false) {
    const fired = pulse ? firePulse(state) : fire(state).fired;
    if (fired) runtime.sound(state.lastEvent);
    runtime.notify();
    return fired;
  }
  runtime.listen<PointerEvent>(canvas, 'pointerdown', (event) => {
    if (event.button > 0) return;
    beginIfNeeded();
    canvas.focus({ preventScroll: true });
    try {
      canvas.setPointerCapture(event.pointerId);
    } catch {}
    if (event.pointerType === 'mouse') {
      mouseX = event.clientX;
      mouseFire = runtime.settings.toggle ? !mouseFire : true;
      syncFire();
      if (input.fire) shoot();
      return;
    }
    const rect = canvas.getBoundingClientRect();
    const side = event.clientX - rect.left < rect.width / 2 ? 'move' : 'look';
    if ([...pointers.values()].some((p) => p.side === side)) return;
    pointers.set(event.pointerId, {
      side,
      x: event.clientX,
      y: event.clientY,
      lastX: event.clientX,
    });
  });
  runtime.listen<PointerEvent>(canvas, 'pointermove', (event) => {
    if (state.status !== 'playing') return;
    if (event.pointerType === 'mouse') {
      if (locked) return; // locked movement is received on document, including off-canvas motion
      if (mouseX !== null) {
        turnBy(state, (event.clientX - mouseX) * 0.0075 * runtime.settings.sensitivity);
        mouseX = event.clientX;
        runtime.notify();
      }
      return;
    }
    const pointer = pointers.get(event.pointerId);
    if (!pointer) return;
    if (pointer.side === 'look') {
      turnBy(state, (event.clientX - pointer.lastX) * 0.0075 * runtime.settings.sensitivity);
      pointer.lastX = event.clientX;
    } else {
      const dx = event.clientX - pointer.x;
      const dy = event.clientY - pointer.y;
      const active = Math.hypot(dx, dy) >= runtime.settings.deadZone;
      input.forward = active ? Math.max(-1, Math.min(1, -dy / 56)) : 0;
      input.strafe = active ? Math.max(-1, Math.min(1, dx / 56)) : 0;
      const rect = canvas.getBoundingClientRect();
      stick = {
        x: ((pointer.x - rect.left) / rect.width) * 320,
        y: ((pointer.y - rect.top) / rect.height) * 240,
        dx: Math.max(-20, Math.min(20, dx / 3)),
        dy: Math.max(-20, Math.min(20, dy / 3)),
      };
    }
    runtime.notify();
  });
  const pointerEnd = (event: PointerEvent) => {
    if (event.pointerType === 'mouse' && mouseX !== null) {
      if (!runtime.settings.toggle || event.type !== 'pointerup') mouseFire = false;
      syncFire();
      mouseX = null;
    }
    const pointer = pointers.get(event.pointerId);
    if (pointer?.side === 'move') {
      input.forward = 0;
      input.strafe = 0;
      stick = null;
    }
    pointers.delete(event.pointerId);
    runtime.notify();
  };
  for (const event of ['pointerup', 'pointercancel', 'lostpointercapture'])
    runtime.listen<PointerEvent>(canvas, event, pointerEnd);
  const fireButton = root.querySelector<HTMLButtonElement>('[data-proof-fire]')!;
  let lastPointer = -Infinity;
  runtime.listen<PointerEvent>(fireButton, 'pointerdown', (event) => {
    event.preventDefault();
    lastPointer = performance.now();
    beginIfNeeded();
    try {
      fireButton.setPointerCapture(event.pointerId);
    } catch {}
    buttonFire = runtime.settings.toggle ? !buttonFire : true;
    syncFire();
    fireButton.setAttribute('aria-pressed', String(input.fire));
    if (input.fire) shoot();
  });
  for (const name of ['pointerup', 'pointercancel', 'lostpointercapture'])
    runtime.listen(fireButton, name, () => {
      lastPointer = performance.now();
      if (!runtime.settings.toggle || name === 'pointercancel') buttonFire = false;
      syncFire();
      fireButton.setAttribute('aria-pressed', String(input.fire));
    });
  runtime.listen(fireButton, 'click', () => {
    if (performance.now() - lastPointer > 700) {
      beginIfNeeded();
      if (runtime.settings.toggle) {
        buttonFire = !buttonFire;
        syncFire();
      } else shoot();
      runtime.notify();
    }
  });
  runtime.listen(root.querySelector('[data-proof-pulse]')!, 'click', () => {
    beginIfNeeded();
    shoot(true);
  });
  const lockButton = root.querySelector<HTMLButtonElement>('[data-proof-lock]')!;
  runtime.listen(lockButton, 'click', () => {
    if (locked) document.exitPointerLock();
    else {
      beginIfNeeded();
      try {
        void canvas.requestPointerLock()?.catch(() => {});
      } catch {}
    }
  });
  runtime.listen(document, 'pointerlockchange', () => {
    const before = locked;
    locked = document.pointerLockElement === canvas;
    setLabel(lockButton, locked ? 'Release mouse · Esc' : 'Lock mouse');
    if (before && !locked) runtime.pause();
  });
  runtime.listen<MouseEvent>(document, 'mousemove', (event) => {
    if (locked && state.status === 'playing') {
      turnBy(
        state,
        Math.max(-60, Math.min(60, event.movementX)) * 0.0025 * runtime.settings.sensitivity
      );
      runtime.notify();
    }
  });
  runtime.listen(document, 'pointerlockerror', () => {
    setLabel(lockButton, 'Mouse lock unavailable · drag to aim');
  });
  window.__proofreaderInstances = (window.__proofreaderInstances ?? 0) + 1;
  window.__proofreader = {
    state: () => state,
    start: runtime.begin,
    restart: runtime.restart,
    tick(frames = 1) {
      for (let i = 0; i < Math.max(1, Math.min(36000, frames)); i++) step(state, 1 / 120, input);
      runtime.notify();
    },
    setInput: (partial) => Object.assign(input, partial),
    turn(rad) {
      turnBy(state, rad);
      runtime.notify();
    },
    fire: () => shoot(),
    pause: runtime.pause,
    resume: runtime.begin,
    isRunning: runtime.running,
    endRun() {
      state.player.health = 0;
      state.status = 'over';
      runtime.notify();
    },
    share: runtime.share,
  };
  return {
    destroy() {
      runtime.destroy();
      delete canvas.dataset.proofReady;
      window.__proofreaderInstances = Math.max(0, (window.__proofreaderInstances ?? 1) - 1);
      if (!window.__proofreaderInstances) delete window.__proofreader;
    },
  };
}
