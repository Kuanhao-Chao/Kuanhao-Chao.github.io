import {
  createGame,
  start,
  pause,
  step,
  turn,
  mulberry32,
  tickInterval,
  snakeResult,
  type GameState,
  type Dir,
  type Point,
} from '../lib/snake';
import { CAMPAIGNS } from '../lib/arcade';
import { mountArcade } from './arcadeBrowser';
import { drawSnake } from './arcadePixels';

interface SnakeTestApi {
  state(): GameState;
  status(): GameState['status'];
  score(): number;
  best(): number;
  start(): void;
  restart(): void;
  turn(direction: Dir): void;
  tick(): void;
  pause(): void;
  resume(): void;
  isRunning(): boolean;
}
declare global {
  interface Window {
    __snake?: SnakeTestApi;
    __snakeInstances?: number;
  }
}
export interface SnakeController {
  destroy(): void;
}

export function initSnake(parent: ParentNode = document): SnakeController | null {
  const root = parent.querySelector<HTMLElement>('[data-arcade-game="snake"]');
  const canvas = root?.querySelector<HTMLCanvasElement>('[data-snake-canvas]');
  if (!root || !canvas || canvas.dataset.snakeReady || !canvas.getContext('2d')) return null;
  canvas.dataset.snakeReady = 'true';
  let rng = mulberry32(1);
  let state = createGame({ cols: 17, rows: 17 }, rng);
  let previous: Point[] = state.snake.map((p) => ({ ...p }));
  let moveAccumulator = 0;
  let movedAt = 0;
  let pendingEvents: string[] = [];
  let touch: { id: number; x: number; y: number; moved: boolean } | null = null;
  function tick() {
    previous = state.snake.map((p) => ({ ...p }));
    step(state, rng);
    movedAt = performance.now();
    pendingEvents.push(...state.events);
  }
  const runtime = mountArcade(root, {
    game: 'snake',
    prefix: 'snake',
    width: 272,
    height: 272,
    stepSeconds: 1 / 60,
    bindings: { up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight' },
    aliases: { w: 'up', s: 'down', a: 'left', d: 'right' },
    create(options) {
      rng = mulberry32(options.seed);
      state = createGame({ cols: 17, rows: 17, run: options }, rng);
      previous = state.snake.map((p) => ({ ...p }));
      moveAccumulator = 0;
      pendingEvents = [];
    },
    status: () => state.status,
    start: () => start(state),
    pause: () => pause(state),
    release() {
      touch = null;
      state.turnQueue = [];
      state.pendingDir = null;
    },
    input(action, down) {
      if (down) turn(state, action as Dir);
    },
    step(dt) {
      moveAccumulator += dt * 1000;
      if (moveAccumulator + 0.001 >= tickInterval(state)) {
        moveAccumulator -= tickInterval(state);
        tick();
      }
    },
    events: () => pendingEvents.splice(0),
    result: () => snakeResult(state),
    draw(ctx, settings, reduced, timestamp) {
      drawSnake(ctx, state, settings.palette, reduced, previous, timestamp - movedAt);
    },
    hud() {
      return {
        score: String(state.score),
        goal:
          state.run.mode === 'classic'
            ? '∞'
            : state.run.mode === 'motif'
              ? `${state.motifs} motifs`
              : String(CAMPAIGNS.snake[state.run.stage - 1].goal),
        time: (state.elapsedMs / 1000).toFixed(1),
        strand: state.sequence.slice(-28).join(' · ') || '—',
        target:
          state.run.mode === 'motif'
            ? state.target.map((b, i) => `${i < state.matched ? '✓' : ''}${b}`).join(' ')
            : 'Choose Motif Hunt to match a target sequence',
      };
    },
  });
  function steer(direction: Dir) {
    if (state.status !== 'playing') runtime.begin();
    turn(state, direction);
    runtime.notify();
  }
  runtime.listen<PointerEvent>(canvas, 'pointerdown', (event) => {
    if (event.button > 0 || touch) return;
    if (state.status !== 'playing') runtime.begin();
    canvas.focus({ preventScroll: true });
    touch = { id: event.pointerId, x: event.clientX, y: event.clientY, moved: false };
    try {
      canvas.setPointerCapture(event.pointerId);
    } catch {}
  });
  runtime.listen<PointerEvent>(canvas, 'pointermove', (event) => {
    if (!touch || touch.id !== event.pointerId) return;
    const dx = event.clientX - touch.x;
    const dy = event.clientY - touch.y;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 12) return;
    steer(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up');
    touch.x = event.clientX;
    touch.y = event.clientY;
    touch.moved = true;
  });
  for (const name of ['pointerup', 'pointercancel', 'lostpointercapture'])
    runtime.listen<PointerEvent>(canvas, name, (event) => {
      if (touch?.id === event.pointerId) touch = null;
    });
  root.querySelectorAll<HTMLButtonElement>('[data-snake-dir]').forEach((button) => {
    let lastPointer = 0;
    runtime.listen<PointerEvent>(button, 'pointerdown', (event) => {
      event.preventDefault();
      lastPointer = performance.now();
      steer(button.dataset.snakeDir as Dir);
    });
    runtime.listen(button, 'click', () => {
      if (performance.now() - lastPointer > 700) steer(button.dataset.snakeDir as Dir);
    });
  });
  // Space remains a familiar pause shortcut without stealing native button activation.
  runtime.listen<KeyboardEvent>(root, 'keydown', (event) => {
    if (
      event.key !== ' ' ||
      event.defaultPrevented ||
      (event.target instanceof Element && event.target.closest('button,input,select,textarea,a'))
    )
      return;
    event.preventDefault();
    if (state.status === 'ready' || state.status === 'over' || state.status === 'won')
      runtime.begin();
    else runtime.togglePause();
  });
  window.__snakeInstances = (window.__snakeInstances ?? 0) + 1;
  window.__snake = {
    state: () => state,
    status: () => state.status,
    score: () => state.score,
    best: runtime.best,
    start: runtime.begin,
    restart: runtime.restart,
    turn(direction) {
      turn(state, direction);
      runtime.notify();
    },
    tick() {
      if (state.status === 'ready') start(state);
      tick();
      runtime.notify();
    },
    pause: runtime.pause,
    resume: runtime.begin,
    isRunning: runtime.running,
  };
  return {
    destroy() {
      runtime.destroy();
      delete canvas.dataset.snakeReady;
      window.__snakeInstances = Math.max(0, (window.__snakeInstances ?? 1) - 1);
      if (!window.__snakeInstances) delete window.__snake;
    },
  };
}
