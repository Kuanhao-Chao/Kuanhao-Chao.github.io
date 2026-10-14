/**
 * 2048 Interactive Client Controller & Audio Synthesizer
 *
 * Provides:
 * - Reactive CSS Grid rendering with appear and merge pop animations
 * - Multi-step Undo using pure HistoryStack in src/lib/game2048.ts
 * - Web Audio API sound synthesis (slide swoosh, harmonic chime on merge, fanfare, game over)
 * - Keyboard (Arrows, WASD, U, R) & Touch swipe gestures
 * - LocalStorage persistence for best scores
 * - Full Astro client-router lifecycle management
 */

import { create2048Game, move2048Game, undo2048Game, serialize2048Game, restore2048Game, type Game2048State, type BoardSize, type Direction, type MoveResult } from '../lib/game2048';

const BEST_SCORE_KEY_PREFIX = 'khc_game_2048_best_';
const SOUND_STORAGE_KEY = 'khc_game_2048_sound';

class SoundSynth {
  private ctx: AudioContext | null = null;
  enabled = false;
  destroy() { void this.ctx?.close().catch(() => {}); this.ctx = null; }

  init(): void {
    if (typeof window === 'undefined') return;
    try {
      if (!this.ctx) {
        const AudioContextClass =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (AudioContextClass) {
          this.ctx = new AudioContextClass();
        }
      }
      if (this.ctx && this.ctx.state === 'suspended') {
        this.ctx.resume().catch(() => {});
      }
    } catch (_) {}
  }

  playSlide(): void {
    if (!this.enabled) return;
    this.init();
    if (!this.ctx) return;
    try {
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(140, now);
      osc.frequency.exponentialRampToValueAtTime(70, now + 0.03);

      gain.gain.setValueAtTime(0.06, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.03);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(now);
      osc.stop(now + 0.03);
    } catch (_) {}
  }

  playMerge(val = 4): void {
    if (!this.enabled) return;
    this.init();
    if (!this.ctx) return;
    try {
      const now = this.ctx.currentTime;
      const rank = Math.round(Math.log2(val || 2));
      const freq = 220 * Math.pow(2, Math.min(rank + 2, 16) / 12);

      const osc1 = this.ctx.createOscillator();
      const osc2 = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(freq, now);

      osc2.type = 'triangle';
      osc2.frequency.setValueAtTime(freq * 1.5, now);

      gain.gain.setValueAtTime(0.1, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);

      osc1.connect(gain);
      osc2.connect(gain);
      gain.connect(this.ctx.destination);

      osc1.start(now);
      osc2.start(now);
      osc1.stop(now + 0.15);
      osc2.stop(now + 0.15);
    } catch (_) {}
  }

  playWin(): void {
    if (!this.enabled) return;
    this.init();
    if (!this.ctx) return;
    try {
      const now = this.ctx.currentTime;
      const chord = [261.63, 329.63, 392.0, 523.25];
      chord.forEach((freq, idx) => {
        const osc = this.ctx!.createOscillator();
        const gain = this.ctx!.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, now + idx * 0.08);

        gain.gain.setValueAtTime(0.08, now + idx * 0.08);
        gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.08 + 0.35);

        osc.connect(gain);
        gain.connect(this.ctx!.destination);

        osc.start(now + idx * 0.08);
        osc.stop(now + idx * 0.08 + 0.35);
      });
    } catch (_) {}
  }

  playGameOver(): void {
    if (!this.enabled) return;
    this.init();
    if (!this.ctx) return;
    try {
      const now = this.ctx.currentTime;
      const notes = [220, 196, 174.61, 146.83];
      notes.forEach((freq, idx) => {
        const osc = this.ctx!.createOscillator();
        const gain = this.ctx!.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(freq, now + idx * 0.09);

        gain.gain.setValueAtTime(0.07, now + idx * 0.09);
        gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.09 + 0.2);

        osc.connect(gain);
        gain.connect(this.ctx!.destination);

        osc.start(now + idx * 0.09);
        osc.stop(now + idx * 0.09 + 0.2);
      });
    } catch (_) {}
  }
}

export interface Game2048Controller {
  destroy: () => void;
}

export function initGame2048(root: HTMLElement | Document = document): Game2048Controller | null {
  const container = root.querySelector<HTMLElement>('[data-game-2048-root]');
  const gridEl = container?.querySelector<HTMLElement>('[data-2048-grid]');
  if (!container || !gridEl || container.dataset.mounted) return null;
  container.dataset.mounted = 'true';
  const abort = new AbortController();
  const listen = { signal: abort.signal };
  const query = <T extends HTMLElement = HTMLElement>(name: string) => container.querySelector<T>(`[data-2048-${name}]`)!;
  const audio = new SoundSynth();
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  const read = (key: string) => { try { return localStorage.getItem(key); } catch { return null; } };
  const write = (key: string, value: string) => { try { localStorage.setItem(key, value); } catch {} };
  const requested = Number(read('khc_game_2048_size'));
  let size: BoardSize = requested === 3 || requested === 5 ? requested : 4;
  const seed = () => {
    const raw = new URLSearchParams(location.search).get('seed');
    return raw !== null && Number.isFinite(Number(raw)) ? Number(raw) : Date.now();
  };
  const saved = read(`khc_game_2048_active_${size}`);
  let state: Game2048State = saved && restore2048Game(saved, size) || create2048Game(size, seed());
  let paused = false;
  let destroyed = false;
  let busy = false;
  let moveTimer = 0;
  let pending: (() => void) | null = null;
  let pointer: { id: number; x: number; y: number } | null = null;
  let serial = 0;
  const queue: Direction[] = [];
  const cells: HTMLElement[] = [];
  interface Tile { id: number; row: number; col: number; value: number; el: HTMLElement; }
  let tiles: Tile[] = [];
  const layer = document.createElement('div');
  layer.className = 'g2048-tile-layer';
  layer.setAttribute('aria-hidden', 'true');
  audio.enabled = read(SOUND_STORAGE_KEY) === 'true';

  function save() { write(`khc_game_2048_active_${size}`, serialize2048Game(state)); }
  function status(message: string) { query('status').textContent = message; }
  function hud() {
    query('score').textContent = String(state.score);
    const previous = Number(read(BEST_SCORE_KEY_PREFIX + size)) || 0;
    const best = Math.max(previous, state.score);
    if (best > previous) write(BEST_SCORE_KEY_PREFIX + size, String(best));
    query('best').textContent = String(best);
    query<HTMLButtonElement>('undo').disabled = !state.history.snapshots.length;
    query('undo').classList.toggle('is-disabled', !state.history.snapshots.length);
    query('pause').textContent = paused ? 'Resume' : 'Pause';
    query('pause').setAttribute('aria-pressed', String(paused));
    query('sound').setAttribute('aria-pressed', String(audio.enabled));
    query('sound').setAttribute('aria-label', audio.enabled ? 'Mute sound' : 'Enable sound');
    query('sound').title = audio.enabled ? 'Sound on' : 'Sound off';
    query('sound').classList.toggle('is-muted', !audio.enabled);
    container!.querySelectorAll<HTMLElement>('[data-2048-size]').forEach(button => {
      const active = Number(button.dataset.boardSize) === size;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-pressed', String(active));
    });
    cells.forEach((cell, index) => {
      const row = Math.floor(index / size), col = index % size, value = state.grid[row][col];
      cell.setAttribute('aria-label', `Row ${row + 1}, column ${col + 1}: ${value || 'empty'}`);
    });
    gridEl!.setAttribute('aria-label', `${size} by ${size} board. Score ${state.score}. Largest tile ${Math.max(...state.grid.flat())}.`);
  }
  function overlay() {
    const win = state.isWon && !state.keepPlaying;
    const show = paused || win || state.isOver;
    query('overlay').hidden = !show;
    query('overlay').classList.toggle('is-active', show);
    query('overlay-title').textContent = paused ? 'Paused' : win ? '2048 reached!' : 'No moves left';
    query('overlay-msg').textContent = paused ? 'Your board is saved. Resume when you are ready.' : win ? 'Keep going, or undo to explore another move.' : 'Try undo, or start a fresh board.';
    query('overlay-btn').textContent = paused ? 'Resume' : win ? 'Keep Going' : 'New Game';
    if (win || state.isOver) queue.length = 0;
  }
  function place(tile: Tile, animate = false) {
    const cell = cells[tile.row * size + tile.col];
    if (!cell) return;
    const board = gridEl!.getBoundingClientRect(), box = cell.getBoundingClientRect();
    tile.el.style.transition = animate && !motion.matches ? 'transform 135ms cubic-bezier(.22,.7,.25,1)' : 'none';
    tile.el.style.width = `${box.width}px`;
    tile.el.style.height = `${box.height}px`;
    tile.el.style.transform = `translate(${box.left - board.left}px, ${box.top - board.top}px)`;
  }
  const palette = [
    ['#eae8dc', '#223b39'], ['#b9d8c4', '#183c34'], ['#67b9aa', '#123d37'],
    ['#286f70', '#ffffff'], ['#255470', '#ffffff'], ['#293e63', '#ffffff'],
    ['#715b94', '#ffffff'], ['#794065', '#ffffff'], ['#a44332', '#ffffff'],
    ['#b97432', '#211b15'], ['#dfb452', '#302b1a'], ['#92394e', '#ffffff'],
  ];
  function addTile(row: number, col: number, value: number, effect = '', parents: number[] = []) {
    const el = document.createElement('div');
    const id = ++serial;
    el.className = 'g2048-tile';
    el.dataset.tileId = String(id);
    if (parents.length) el.dataset.parents = parents.join(',');
    const face = document.createElement('div');
    face.className = `g2048-tile-face ${motion.matches ? '' : effect}`;
    face.textContent = String(value);
    const [color, ink] = palette[Math.min(palette.length - 1, Math.max(0, Math.log2(value) - 1))];
    face.style.setProperty('--tile-color', color);
    face.style.setProperty('--tile-ink', ink);
    if (value >= 1024) face.classList.add('is-compact');
    el.append(face); layer.append(el);
    const tile = { id, row, col, value, el };
    tiles.push(tile); place(tile);
    return tile;
  }
  function rebuild() {
    clearTimeout(moveTimer); pending = null; busy = false; queue.length = 0;
    gridEl!.replaceChildren(); cells.length = 0; tiles = [];
    gridEl!.style.setProperty('--grid-size', String(size));
    gridEl!.setAttribute('aria-rowcount', String(size));
    gridEl!.setAttribute('aria-colcount', String(size));
    for (let row = 0; row < size; row++) for (let col = 0; col < size; col++) {
      const cell = document.createElement('div');
      cell.className = 'g2048-cell'; cell.setAttribute('role', 'gridcell');
      cell.setAttribute('aria-rowindex', String(row + 1)); cell.setAttribute('aria-colindex', String(col + 1));
      gridEl!.append(cell); cells.push(cell);
    }
    layer.replaceChildren(); gridEl!.append(layer);
    state.grid.forEach((row, r) => row.forEach((value, c) => { if (value) addTile(r, c, value); }));
    hud(); overlay();
  }
  function settle() {
    clearTimeout(moveTimer);
    const finish = pending; pending = null;
    finish?.();
  }
  function animate(move: MoveResult, spawned: [number, number] | null) {
    const before = new Map(tiles.map(tile => [`${tile.row},${tile.col}`, tile]));
    for (const journey of move.movements) {
      const tile = before.get(journey.from.join(','));
      if (!tile) continue;
      tile.row = journey.to[0]; tile.col = journey.to[1]; place(tile, true);
    }
    busy = true;
    pending = () => {
      if (destroyed) return;
      for (const merge of move.merges) {
        const sources = merge.sources.map(source => before.get(source.join(','))!);
        for (const source of sources) { source.el.remove(); tiles = tiles.filter(tile => tile !== source); }
        addTile(merge.to[0], merge.to[1], merge.value, 'is-merged', sources.map(tile => tile.id));
      }
      if (spawned) addTile(spawned[0], spawned[1], state.grid[spawned[0]][spawned[1]], 'is-new');
      busy = false; overlay();
      const next = queue.shift();
      if (next && !paused) requestMove(next);
    };
    if (motion.matches) settle();
    else moveTimer = window.setTimeout(settle, 145);
  }
  function requestMove(direction: Direction) {
    if (destroyed || paused || state.isOver || state.isWon && !state.keepPlaying) return;
    if (busy) { if (queue.length < 3) queue.push(direction); return; }
    const result = move2048Game(state, direction);
    if (!result.move.changed) { status('No tiles can slide in that direction.'); return; }
    const wasWon = state.isWon;
    state = result.state; save(); hud();
    status(`Moved ${direction}.${result.move.scoreGain ? ` Merged for ${result.move.scoreGain} points.` : ''} Score ${state.score}.`);
    if (result.move.scoreGain) audio.playMerge(Math.max(...result.move.merges.map(merge => merge.value)));
    else audio.playSlide();
    if (state.isWon && !wasWon) audio.playWin(); else if (state.isOver) audio.playGameOver();
    animate(result.move, result.spawned);
  }
  function setPaused(value: boolean) {
    pointer = null; queue.length = 0; paused = value; settle(); hud(); overlay();
    status(paused ? 'Paused. Your board is saved.' : 'Ready. Swipe, use the arrows, or focus the board and use your keyboard.');
  }
  function newGame(nextSize = size) {
    size = nextSize; state = create2048Game(size, seed()); paused = false; pointer = null;
    write('khc_game_2048_size', String(size)); save(); rebuild();
    status('New board. Each successful move adds one random 2 or 4 tile.');
  }
  function undo() {
    pointer = null; queue.length = 0; clearTimeout(moveTimer); pending = null; busy = false;
    state = undo2048Game(state); save(); rebuild(); status('Undid one move, including its random spawn.');
  }
  query('undo').addEventListener('click', undo, listen);
  query('restart').addEventListener('click', () => newGame(), listen);
  query('pause').addEventListener('click', () => setPaused(!paused), listen);
  query('sound').addEventListener('click', () => {
    audio.enabled = !audio.enabled; write(SOUND_STORAGE_KEY, String(audio.enabled)); if (audio.enabled) audio.init(); hud();
  }, listen);
  query('overlay-btn').addEventListener('click', () => {
    if (paused) setPaused(false);
    else if (state.isWon && !state.keepPlaying) { state = { ...state, keepPlaying: true }; save(); overlay(); status('Continuing beyond 2048.'); }
    else newGame();
    gridEl!.focus({ preventScroll: true });
  }, listen);
  container.querySelectorAll<HTMLElement>('[data-2048-size]').forEach(button => button.addEventListener('click', () => {
    const next = Number(button.dataset.boardSize) as BoardSize;
    if (next === size) return;
    save(); size = next;
    const raw = read(`khc_game_2048_active_${size}`);
    state = raw && restore2048Game(raw, size) || create2048Game(size, seed());
    paused = false; pointer = null; write('khc_game_2048_size', String(size)); save(); rebuild();
    status(`${size} by ${size} board. Each board size keeps a separate saved game.`);
  }, listen));
  container.querySelectorAll<HTMLElement>('[data-2048-btn]').forEach(button =>
    button.addEventListener('click', () => requestMove(button.dataset['2048Btn'] as Direction), listen));
  container.addEventListener('keydown', event => {
    if ((event.target as HTMLElement).closest('input,select,textarea,[contenteditable="true"]')) return;
    const directions: Record<string, Direction> = { ArrowUp: 'up', w: 'up', ArrowDown: 'down', s: 'down', ArrowLeft: 'left', a: 'left', ArrowRight: 'right', d: 'right' };
    const direction = directions[event.key] || directions[event.key.toLowerCase()];
    if (direction) { event.preventDefault(); requestMove(direction); }
    else if (event.key.toLowerCase() === 'u' || (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') { event.preventDefault(); undo(); }
    else if (event.key.toLowerCase() === 'r') { event.preventDefault(); newGame(); }
  }, listen);
  gridEl.addEventListener('pointerdown', event => {
    if (pointer || event.button !== 0 || paused) return;
    gridEl!.focus({ preventScroll: true }); pointer = { id: event.pointerId, x: event.clientX, y: event.clientY };
    gridEl!.setPointerCapture(event.pointerId);
  }, listen);
  gridEl.addEventListener('pointerup', event => {
    if (!pointer || pointer.id !== event.pointerId) return;
    const dx = event.clientX - pointer.x, dy = event.clientY - pointer.y;
    pointer = null;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 24) return;
    requestMove(Math.abs(dx) > Math.abs(dy) ? dx > 0 ? 'right' : 'left' : dy > 0 ? 'down' : 'up');
  }, listen);
  const cancel = () => { pointer = null; };
  gridEl.addEventListener('pointercancel', cancel, listen);
  gridEl.addEventListener('lostpointercapture', cancel, listen);
  document.addEventListener('visibilitychange', () => { if (document.hidden) setPaused(true); }, listen);
  window.addEventListener('blur', () => setPaused(true), listen);
  motion.addEventListener('change', () => { queue.length = 0; settle(); tiles.forEach(tile => place(tile)); }, listen);
  const resize = new ResizeObserver(() => { queue.length = 0; settle(); tiles.forEach(tile => place(tile)); });
  resize.observe(gridEl);
  rebuild(); save(); status(saved ? 'Saved board restored. Undo history is preserved.' : 'Ready. Swipe or focus the board and use arrow keys.');
  const debugWindow = window as typeof window & { __game2048?: typeof api; __game2048Instances?: number };
  const api = { state: () => structuredClone(state), destroy };
  debugWindow.__game2048 = api;
  debugWindow.__game2048Instances = (debugWindow.__game2048Instances || 0) + 1;
  function destroy() {
    if (destroyed) return;
    destroyed = true; save(); clearTimeout(moveTimer); pending = null; queue.length = 0; pointer = null;
    abort.abort(); resize.disconnect(); audio.destroy(); delete container!.dataset.mounted;
    if (debugWindow.__game2048 === api) delete debugWindow.__game2048;
    debugWindow.__game2048Instances = Math.max(0, (debugWindow.__game2048Instances || 1) - 1);
  }
  return { destroy };
}
