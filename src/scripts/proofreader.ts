import {
  createGame,
  start,
  pause,
  step,
  fire,
  reload,
  interact,
  switchWeapon,
  setAimAssist,
  turnBy,
  retryCheckpoint,
  proofResult,
  pathTo,
  objectiveTarget,
  hasLineOfSight,
  distance,
  normalizeAngle as normalizeAngleForUI,
  WEAPON_IDS,
  WEAPONS,
  IDLE_INPUT,
  type GameState,
  type StepInput,
  type Vec3,
  type WeaponId,
} from '../lib/proofreader';
import { mountArcade } from './arcadeBrowser';
import { createProofreaderPresentation, type ProofPresentation } from './proofreaderScene';
import { setLabel } from '../lib/domLabel';

interface ProofreaderTestApi {
  state(): GameState;
  start(): void;
  restart(): void;
  tick(frames?: number): void;
  setInput(input: Partial<StepInput>): void;
  turn(yaw: number, pitch?: number): void;
  fire(): boolean;
  weapon(id: WeaponId): void;
  interact(): boolean;
  route(to: Vec3): Vec3[];
  visible(a: Vec3, b: Vec3): boolean;
  target(): ReturnType<typeof objectiveTarget>;
  pause(): void;
  resume(): void;
  endRun(): void;
  share(): Promise<void>;
  isRunning(): boolean;
  graphics(): ReturnType<ProofPresentation['stats']>;
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
  if (!root || !canvas || canvas.dataset.proofReady) return null;
  canvas.dataset.proofReady = 'true';
  let state = createGame(1),
    presentation: ProofPresentation | undefined,
    contextLost = false;
  const input: StepInput = { ...IDLE_INPUT },
    held = new Set<string>();
  let mouseFire = false,
    buttonFire = false,
    mouse: { x: number; y: number } | null = null,
    locked = false;
  let move = { x: 0, y: 0 },
    pendingEvents: string[] = [];
  const pointers = new Map<
    number,
    { side: 'move' | 'look'; x: number; y: number; lastX: number; lastY: number }
  >();
  const stick = root.querySelector<HTMLElement>('[data-proof-stick]');
  function syncFire() {
    input.fire = held.has('fire') || mouseFire || buttonFire;
    root?.querySelector('[data-proof-fire]')?.setAttribute('aria-pressed', String(input.fire));
  }
  function keyboard() {
    input.forward = Math.max(
      -1,
      Math.min(1, Number(held.has('forward')) - Number(held.has('back')) + move.y)
    );
    input.strafe = Math.max(
      -1,
      Math.min(1, Number(held.has('right')) - Number(held.has('left')) + move.x)
    );
    input.turn = Number(held.has('turnRight')) - Number(held.has('turnLeft'));
    input.look = Number(held.has('lookUp')) - Number(held.has('lookDown'));
    input.jump = held.has('jump');
    input.sprint = held.has('sprint') || move.y > 0.9;
    input.reload = held.has('reload');
    input.interact = held.has('interact');
    syncFire();
  }
  function release() {
    held.clear();
    pointers.clear();
    move = { x: 0, y: 0 };
    mouse = null;
    mouseFire = buttonFire = false;
    Object.assign(input, {
      ...IDLE_INPUT,
      look: 0,
      jump: false,
      sprint: false,
      reload: false,
      interact: false,
      weapon: undefined,
    });
    if (stick) stick.hidden = true;
    root
      ?.querySelectorAll('[data-proof-jump],[data-proof-sprint]')
      .forEach((button) => button.setAttribute('aria-pressed', 'false'));
    syncFire();
  }
  const primary = root.querySelector<HTMLButtonElement>('[data-arcade-primary]')!;
  let runtime: ReturnType<typeof mountArcade>;
  try {
    runtime = mountArcade(root, {
      game: 'proofreader',
      prefix: 'proof',
      width: 1280,
      height: 720,
      stepSeconds: 1 / 120,
      bindings: {
        forward: 'w',
        back: 's',
        left: 'a',
        right: 'd',
        turnLeft: 'ArrowLeft',
        turnRight: 'ArrowRight',
        lookUp: 'ArrowUp',
        lookDown: 'ArrowDown',
        fire: 'f',
        jump: ' ',
        sprint: 'Shift',
        reload: 'r',
        interact: 'e',
        weapon1: '1',
        weapon2: '2',
        weapon3: '3',
        cycle: 'q',
        map: 'm',
      },
      create(options) {
        release();
        pendingEvents = [];
        state = createGame(options.seed, options);
      },
      presentation(surface) {
        presentation = createProofreaderPresentation(surface, () => state);
        return presentation;
      },
      status: () => state.status,
      start() {
        if (!contextLost) start(state);
      },
      pause: () => pause(state),
      release,
      retry: () => retryCheckpoint(state),
      input(action, down) {
        if (action.startsWith('weapon') && down) {
          switchWeapon(state, WEAPON_IDS[Number(action.at(-1)) - 1]);
          return;
        }
        if (action === 'cycle' && down) {
          cycleWeapon();
          return;
        }
        if (action === 'map' && down) {
          toggleMap();
          return;
        }
        if (action === 'fire' && runtime.settings.toggle) {
          if (down) {
            if (held.has(action)) held.delete(action);
            else held.add(action);
          }
        } else if (down) held.add(action);
        else held.delete(action);
        keyboard();
      },
      settings(settings) {
        setAimAssist(state, settings.assist);
      },
      step(dt) {
        step(state, dt, input);
        pendingEvents.push(...state.events);
        if (pendingEvents.length > 128) pendingEvents.splice(0, pendingEvents.length - 128);
      },
      events: () => pendingEvents.splice(0),
      result: () => proofResult(state),
      hud() {
        const p = state.player,
          w = WEAPONS[p.weapon],
          target = objectiveTarget(state);
        root.dataset.proofWeapon = p.weapon;
        root.dataset.proofHit = String(state.hitFor > 0);
        root.dataset.proofHurt = String(state.damageFor > 0);
        for (const button of root.querySelectorAll<HTMLButtonElement>('[data-proof-weapon]'))
          button.setAttribute('aria-pressed', String(button.dataset.proofWeapon === p.weapon));
        const use = root.querySelector<HTMLButtonElement>('[data-proof-use]');
        if (use) {
          use.disabled = !state.context;
          setLabel(use, state.context ? 'Use · E' : 'Use');
        }
        const compass = root.querySelector<HTMLElement>('[data-proof-bearing]');
        if (compass)
          compass.style.rotate = `${normalizeAngleForUI(Math.atan2(target.position.x - p.position.x, -(target.position.z - p.position.z)) - p.yaw)}rad`;
        const boss = state.enemies.find((e) => e.kind === 'guardian');
        const bossPanel = root.querySelector<HTMLElement>('[data-proof-boss]');
        if (bossPanel) {
          bossPanel.hidden = !boss;
          const meter = bossPanel.querySelector<HTMLProgressElement>('progress');
          if (meter && boss) {
            meter.value = boss.hp;
            meter.max = boss.maxHp;
          }
          setLabel(
            bossPanel.querySelector('span'),
            boss
              ? `Guardian ${boss.phase + 1}/3 · ${state.mission.objectives.includes(boss.phase + 1) ? 'core exposed' : 'shielded — follow relay marker'}`
              : ''
          );
        }
        drawMap();
        return {
          health: String(Math.ceil(p.health)),
          ammo: `${p.magazines[p.weapon]} / ${p.reserves[p.weapon]}`,
          wave: String(state.wave),
          score: String(state.score),
          weapon: w.name,
          reload: p.reloading > 0 ? `Reloading · ${p.reloading.toFixed(1)} s` : '',
          objective: target.label,
          distance: `${Math.round(distance(p.position, target.position))} m ${target.position.y - p.position.y > 2 ? '↑' : target.position.y - p.position.y < -2 ? '↓' : ''}`,
          floor: `${Math.max(1, Math.min(state.level.floors, Math.round(p.position.y / 3.6) + 1))} / ${state.level.floors}`,
          context: state.context ? `E · ${state.context}` : '',
          notice: state.notice,
          checkpoint: `${state.checkpoint?.label ?? 'Mission entry'}${state.retries ? ` · ${state.retries} retries · unranked` : ''}`,
        };
      },
    });
  } catch (error) {
    presentation?.dispose();
    root.dataset.proofUnavailable = 'true';
    setLabel(root.querySelector('[data-arcade-overlay-title]'), '3D graphics unavailable');
    setLabel(
      root.querySelector('[data-arcade-overlay-detail]'),
      'Proofreader requires WebGL2. Try enabling hardware acceleration or using a recent browser. Instructions remain available below.'
    );
    setLabel(primary, 'Retry graphics');
    primary.addEventListener('click', () => location.reload(), { once: true });
    console.warn('Proofreader WebGL initialization failed', error);
    return {
      destroy() {
        delete canvas.dataset.proofReady;
      },
    };
  }
  function begin() {
    if (!contextLost && state.status !== 'playing') runtime.begin();
  }
  function actionSound() {
    for (const e of state.events) runtime.sound(e);
    state.events = [];
    runtime.notify();
  }
  function shoot() {
    const fired = fire(state);
    actionSound();
    return fired;
  }
  function cycleWeapon() {
    switchWeapon(state, WEAPON_IDS[(WEAPON_IDS.indexOf(state.player.weapon) + 1) % 3]);
    runtime.notify();
  }
  function toggleMap() {
    const map = root?.querySelector<HTMLElement>('[data-proof-map-panel]');
    if (map) map.hidden = !map.hidden;
    drawMap();
  }
  function look(dx: number, dy: number, factor = 0.003) {
    turnBy(
      state,
      Math.max(-150, Math.min(150, dx)) * factor * runtime.settings.sensitivity,
      -Math.max(-150, Math.min(150, dy)) * factor * runtime.settings.sensitivity
    );
  }

  runtime.listen<PointerEvent>(canvas, 'pointerdown', (e) => {
    if (e.button > 0) return;
    begin();
    canvas.focus({ preventScroll: true });
    try {
      canvas.setPointerCapture(e.pointerId);
    } catch {}
    if (e.pointerType === 'mouse') {
      mouse = { x: e.clientX, y: e.clientY };
      mouseFire = runtime.settings.toggle ? !mouseFire : true;
      syncFire();
      if (input.fire) shoot();
      return;
    }
    const rect = canvas.getBoundingClientRect(),
      side = e.clientX - rect.left < rect.width * 0.45 ? 'move' : 'look';
    if ([...pointers.values()].some((p) => p.side === side)) return;
    pointers.set(e.pointerId, {
      side,
      x: e.clientX,
      y: e.clientY,
      lastX: e.clientX,
      lastY: e.clientY,
    });
    if (side === 'move' && stick) {
      stick.hidden = false;
      stick.style.left = `${e.clientX - rect.left}px`;
      stick.style.top = `${e.clientY - rect.top}px`;
    }
  });
  runtime.listen<PointerEvent>(canvas, 'pointermove', (e) => {
    if (state.status !== 'playing') return;
    if (e.pointerType === 'mouse') {
      if (mouse && !locked) {
        look(e.clientX - mouse.x, e.clientY - mouse.y);
        mouse = { x: e.clientX, y: e.clientY };
        runtime.notify();
      }
      return;
    }
    const p = pointers.get(e.pointerId);
    if (!p) return;
    if (p.side === 'look') {
      look(e.clientX - p.lastX, e.clientY - p.lastY, 0.004);
      p.lastX = e.clientX;
      p.lastY = e.clientY;
    } else {
      const dx = e.clientX - p.x,
        dy = e.clientY - p.y,
        active = Math.hypot(dx, dy) >= runtime.settings.deadZone;
      move = {
        x: active ? Math.max(-1, Math.min(1, dx / 52)) : 0,
        y: active ? Math.max(-1, Math.min(1, -dy / 52)) : 0,
      };
      keyboard();
      const thumb = stick?.firstElementChild as HTMLElement | null;
      if (thumb)
        thumb.style.translate = `${Math.max(-23, Math.min(23, dx / 2))}px ${Math.max(-23, Math.min(23, dy / 2))}px`;
    }
    runtime.notify();
  });
  const pointerEnd = (e: PointerEvent) => {
    if (e.pointerType === 'mouse') {
      const wasDown = mouse !== null;
      mouse = null;
      if (
        !runtime.settings.toggle ||
        e.type === 'pointercancel' ||
        (e.type === 'lostpointercapture' && wasDown)
      )
        mouseFire = false;
      syncFire();
    }
    if (pointers.get(e.pointerId)?.side === 'move') {
      move = { x: 0, y: 0 };
      if (stick) stick.hidden = true;
      keyboard();
    }
    pointers.delete(e.pointerId);
    runtime.notify();
  };
  for (const name of ['pointerup', 'pointercancel', 'lostpointercapture'])
    runtime.listen<PointerEvent>(canvas, name, pointerEnd);
  runtime.listen<PointerEvent>(window, 'pointerup', (e) => {
    if (e.pointerType === 'mouse' && !runtime.settings.toggle) {
      mouseFire = false;
      syncFire();
    }
  });
  runtime.listen<MouseEvent>(document, 'mousemove', (e) => {
    if (locked && state.status === 'playing') {
      look(e.movementX, e.movementY, 0.0025);
      runtime.notify();
    }
  });
  const lock = root.querySelector<HTMLButtonElement>('[data-proof-lock]')!;
  runtime.listen(lock, 'click', () => {
    if (locked) document.exitPointerLock();
    else {
      begin();
      try {
        void canvas
          .requestPointerLock()
          ?.catch(() => setLabel(lock, 'Drag to aim · lock unavailable'));
      } catch {
        setLabel(lock, 'Drag to aim · lock unavailable');
      }
    }
  });
  runtime.listen(document, 'pointerlockchange', () => {
    const before = locked;
    locked = document.pointerLockElement === canvas;
    setLabel(lock, locked ? 'Release mouse · Esc' : 'Lock mouse');
    if (before && !locked) runtime.pause();
  });
  runtime.listen(document, 'pointerlockerror', () =>
    setLabel(lock, 'Drag to aim · lock unavailable')
  );
  runtime.listen<CustomEvent<{ lost: boolean }>>(canvas, 'proof:context', (e) => {
    contextLost = e.detail.lost;
    runtime.pause();
    primary.disabled = contextLost;
    setLabel(
      root.querySelector('[data-proof-notice]'),
      contextLost
        ? 'Graphics interrupted. Waiting for the browser to restore WebGL.'
        : 'Graphics restored. Select Resume when ready.'
    );
    if (!contextLost) runtime.notify();
  });
  function holdButton(selector: string, action: 'fire' | 'jump' | 'sprint') {
    const button = root?.querySelector<HTMLButtonElement>(selector);
    if (!button) return;
    let lastPointer = -Infinity,
      keyboardHeld = false;
    let activePointer: number | null = null,
      aimPoint: { x: number; y: number } | null = null;
    function set(on: boolean) {
      if (action === 'fire') {
        buttonFire = on;
        syncFire();
      } else {
        if (on) held.add(action);
        else held.delete(action);
        keyboard();
      }
      button?.setAttribute('aria-pressed', String(on));
    }
    runtime.listen<PointerEvent>(button, 'pointerdown', (e) => {
      e.preventDefault();
      lastPointer = performance.now();
      activePointer = e.pointerId;
      aimPoint = { x: e.clientX, y: e.clientY };
      begin();
      try {
        button.setPointerCapture(e.pointerId);
      } catch {}
      set(action === 'fire' && runtime.settings.toggle ? !buttonFire : true);
      if (action === 'fire' && input.fire) shoot();
    });
    runtime.listen<PointerEvent>(button, 'pointermove', (e) => {
      if (
        action === 'fire' &&
        e.pointerType !== 'mouse' &&
        e.pointerId === activePointer &&
        aimPoint &&
        state.status === 'playing'
      ) {
        look(e.clientX - aimPoint.x, e.clientY - aimPoint.y, 0.004);
        aimPoint = { x: e.clientX, y: e.clientY };
        runtime.notify();
      }
    });
    for (const name of ['pointerup', 'pointercancel', 'lostpointercapture'])
      runtime.listen<PointerEvent>(button, name, (e) => {
        if (activePointer !== e.pointerId) return;
        activePointer = null;
        aimPoint = null;
        lastPointer = performance.now();
        if (action !== 'fire' || !runtime.settings.toggle || name !== 'pointerup') set(false);
      });
    runtime.listen<KeyboardEvent>(button, 'keydown', (e) => {
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        if (e.repeat) return;
        begin();
        keyboardHeld = true;
        set(true);
      }
    });
    runtime.listen<KeyboardEvent>(window, 'keyup', (e) => {
      if (keyboardHeld && (e.key === ' ' || e.key === 'Enter')) {
        keyboardHeld = false;
        set(false);
      }
    });
    runtime.listen<MouseEvent>(button, 'click', (e) => {
      if (performance.now() - lastPointer < 700 || (e.detail === 0 && keyboardHeld)) return;
      begin();
      if (action === 'fire') {
        if (runtime.settings.toggle) set(!buttonFire);
        else shoot();
      } else {
        set(true);
        step(state, 1 / 120, input);
        set(false);
      }
      runtime.notify();
    });
  }
  holdButton('[data-proof-fire]', 'fire');
  holdButton('[data-proof-jump]', 'jump');
  holdButton('[data-proof-sprint]', 'sprint');
  runtime.listen(root.querySelector('[data-proof-reload]')!, 'click', () => {
    begin();
    reload(state);
    actionSound();
  });
  runtime.listen(root.querySelector('[data-proof-use]')!, 'click', () => {
    begin();
    interact(state);
    actionSound();
  });
  runtime.listen(root.querySelector('[data-proof-cycle]')!, 'click', () => {
    begin();
    cycleWeapon();
  });
  runtime.listen(root.querySelector('[data-proof-map-toggle]')!, 'click', toggleMap);
  for (const button of root.querySelectorAll<HTMLButtonElement>('[data-proof-weapon]'))
    runtime.listen(button, 'click', () => {
      begin();
      switchWeapon(state, button.dataset.proofWeapon as WeaponId);
      actionSound();
    });
  function drawMap() {
    const surface = root?.querySelector<HTMLCanvasElement>('[data-proof-map]');
    if (!surface || surface.parentElement?.hidden) return;
    const ctx = surface.getContext('2d');
    if (!ctx) return;
    const w = 180,
      h = 200,
      scale = 3.8;
    surface.width = w * 2;
    surface.height = h * 2;
    ctx.scale(2, 2);
    ctx.fillStyle = 'rgba(10,27,40,.94)';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#65818f';
    ctx.lineWidth = 0.7;
    const px = (x: number) => w / 2 + x * scale,
      pz = (z: number) => h / 2 + z * scale;
    for (const solid of state.level.solids) {
      if (solid.surface === 'floor') continue;
      const top = solid.position.y + (solid.kind === 'ramp' ? solid.size.y : solid.size.y / 2);
      if (Math.abs(top - state.player.position.y) > 2 && solid.surface !== 'wall') continue;
      ctx.strokeRect(
        px(solid.position.x - solid.size.x / 2),
        pz(solid.position.z - solid.size.z / 2),
        solid.size.x * scale,
        solid.size.z * scale
      );
    }
    const target = objectiveTarget(state);
    ctx.fillStyle = '#f2c581';
    ctx.beginPath();
    ctx.arc(px(target.position.x), pz(target.position.z), 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.save();
    ctx.translate(px(state.player.position.x), pz(state.player.position.z));
    ctx.rotate(state.player.yaw);
    ctx.fillStyle = '#7eddd0';
    ctx.beginPath();
    ctx.moveTo(0, -5);
    ctx.lineTo(3, 4);
    ctx.lineTo(-3, 4);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    ctx.fillStyle = '#d1e9ec';
    ctx.font = '11px sans-serif';
    ctx.fillText(`FLOOR ${Math.max(1, Math.round(state.player.position.y / 3.6) + 1)}`, 8, 14);
  }
  window.__proofreaderInstances = (window.__proofreaderInstances ?? 0) + 1;
  window.__proofreader = {
    state: () => state,
    start: runtime.begin,
    restart: runtime.restart,
    tick(frames = 1) {
      for (let i = 0; i < Math.max(1, Math.min(36000, frames)); i++) {
        step(state, 1 / 120, input);
        pendingEvents.push(...state.events);
      }
      pendingEvents = pendingEvents.slice(-128);
      runtime.notify();
    },
    setInput: (partial) => Object.assign(input, partial),
    turn(yaw, pitch = 0) {
      turnBy(state, yaw, pitch);
    },
    fire: shoot,
    weapon(id) {
      switchWeapon(state, id);
      runtime.notify();
    },
    interact() {
      const changed = interact(state);
      actionSound();
      return changed;
    },
    route: (to) => pathTo(state, to),
    visible: (a, b) => hasLineOfSight(state, a, b),
    target: () => objectiveTarget(state),
    pause: runtime.pause,
    resume: runtime.begin,
    endRun() {
      state.player.health = 0;
      state.status = 'over';
      runtime.notify();
    },
    share: runtime.share,
    isRunning: runtime.running,
    graphics: () => presentation!.stats(),
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
