/**
 * Minesweeper Interactive Client Controller & Audio Synthesizer
 *
 * Implements:
 * - High-DPI canvas or CSS Grid cell rendering with classic numbered bevels
 * - Retro 3-digit LED displays for Mine Counter and Timer
 * - Interactive Smiley Face button (😊 Normal, 😮 Mousedown, 😎 Victory, 😵 Lost)
 * - Guaranteed first-click safe opening
 * - Intelligent chording on revealed numbers
 * - Web Audio API sound synthesis (tick, flag thud, chord chime, explosion, fanfare)
 * - Mobile Touch support with dedicated "🚩 Flag Mode" toggle button & long-press
 * - Best time persistence in localStorage
 */

import {
  createGame,
  revealCell,
  toggleFlag,
  chordCell,
  getAdjacentCoords,
  getVisibleBoard,
  findVisibleHint,
  type DifficultyConfig,
  type Difficulty,
  type MinesweeperGame,
} from '../lib/minesweeper';
import { mulberry32 } from '../lib/dino';
import { isDarkTheme } from '../lib/theme';

const BEST_TIME_KEY_PREFIX = 'khc_minesweeper_best_';
const SOUND_STORAGE_KEY = 'khc_minesweeper_sound';

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

  playClick(): void {
    if (!this.enabled) return;
    this.init();
    if (!this.ctx) return;
    try {
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(320, now);
      osc.frequency.exponentialRampToValueAtTime(160, now + 0.02);

      gain.gain.setValueAtTime(0.05, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.02);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(now);
      osc.stop(now + 0.02);
    } catch (_) {}
  }

  playFlag(): void {
    if (!this.enabled) return;
    this.init();
    if (!this.ctx) return;
    try {
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(440, now);
      osc.frequency.exponentialRampToValueAtTime(880, now + 0.04);

      gain.gain.setValueAtTime(0.06, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.04);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(now);
      osc.stop(now + 0.04);
    } catch (_) {}
  }

  playChord(): void {
    if (!this.enabled) return;
    this.init();
    if (!this.ctx) return;
    try {
      const now = this.ctx.currentTime;
      [350, 520].forEach((freq, idx) => {
        const osc = this.ctx!.createOscillator();
        const gain = this.ctx!.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now + idx * 0.03);

        gain.gain.setValueAtTime(0.06, now + idx * 0.03);
        gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.03 + 0.05);

        osc.connect(gain);
        gain.connect(this.ctx!.destination);

        osc.start(now + idx * 0.03);
        osc.stop(now + idx * 0.03 + 0.05);
      });
    } catch (_) {}
  }

  playExplosion(): void {
    if (!this.enabled) return;
    this.init();
    if (!this.ctx) return;
    try {
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(110, now);
      osc.frequency.exponentialRampToValueAtTime(30, now + 0.35);

      gain.gain.setValueAtTime(0.2, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(now);
      osc.stop(now + 0.35);
    } catch (_) {}
  }

  playWin(): void {
    if (!this.enabled) return;
    this.init();
    if (!this.ctx) return;
    try {
      const now = this.ctx.currentTime;
      const notes = [392, 523.25, 659.25, 783.99];
      notes.forEach((freq, idx) => {
        const osc = this.ctx!.createOscillator();
        const gain = this.ctx!.createGain();

        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, now + idx * 0.08);

        gain.gain.setValueAtTime(0.08, now + idx * 0.08);
        gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.08 + 0.3);

        osc.connect(gain);
        gain.connect(this.ctx!.destination);

        osc.start(now + idx * 0.08);
        osc.stop(now + idx * 0.08 + 0.3);
      });
    } catch (_) {}
  }
}

export interface MinesweeperController {
  destroy: () => void;
}

export function initMinesweeper(root: HTMLElement | Document = document): MinesweeperController | null {
  const containerEl = root.querySelector<HTMLElement>('[data-minesweeper-root]');
  if (!containerEl || containerEl.dataset.mineReady) return null;
  const container = containerEl;
  const boardEl = container.querySelector<HTMLElement>('[data-mine-board]');
  if (!boardEl) return null;
  const board = boardEl;
  container.dataset.mineReady = 'true';
  const abort = new AbortController();
  const { signal } = abort;
  const get = <T extends HTMLElement>(name: string) => container.querySelector<T>('[data-mine-' + name + ']');
  const audio = new SoundSynth();
  try { audio.enabled = localStorage.getItem(SOUND_STORAGE_KEY) === 'true'; } catch {}
  let difficulty: Difficulty = 'beginner';
  let custom: DifficultyConfig | undefined;
  let game = createGame();
  let assisted = false;
  let paused = false;
  let flagMode = false;
  let elapsedMs = 0;
  let runningSince: number | null = null;
  let clockTimer: ReturnType<typeof setInterval> | null = null;
  let focused = { row: 0, col: 0 };
  let shape = '';
  let buttons: HTMLButtonElement[][] = [];
  const renderKeys = new WeakMap<HTMLButtonElement, string>();
  let hintCells = new Set<string>();
  let hintKind = 'none';
  let press: { id: number; x: number; y: number; row: number; col: number } | null = null;
  let longTimer = 0;
  let suppressClickUntil = 0;
  let disposed = false;
  const seedParam = new URLSearchParams(location.search).get('seed');
  let random = mulberry32(seedParam === null ? Date.now() : Number(seedParam) >>> 0);

  function seconds() { return Math.floor((elapsedMs + (runningSince === null ? 0 : performance.now() - runningSince)) / 1000); }
  function clockDisplay() {
    const time = get<HTMLElement>('timer');
    if (time) { time.textContent = seconds() > 999 ? '999+' : String(seconds()).padStart(3, '0'); time.setAttribute('aria-label', seconds() + ' seconds'); }
  }
  function startClock() {
    if (runningSince === null) runningSince = performance.now();
    if (clockTimer === null) clockTimer = setInterval(clockDisplay, 250);
  }
  function freezeClock() {
    if (runningSince !== null) { elapsedMs += performance.now() - runningSince; runningSince = null; }
    if (clockTimer !== null) clearInterval(clockTimer);
    clockTimer = null; clockDisplay();
  }
  function bestKey() { return BEST_TIME_KEY_PREFIX + (assisted ? 'assisted_' : '') + difficulty + (difficulty === 'custom' ? '_' + game.rows + 'x' + game.cols + '_' + game.totalMines : ''); }
  function bestTime() {
    try { const raw = localStorage.getItem(bestKey()); const value = raw === null ? NaN : Number(raw); return Number.isFinite(value) && value >= 0 ? value : null; } catch { return null; }
  }
  function recordTime() {
    try { const previous = bestTime(); if (previous === null || seconds() < previous) localStorage.setItem(bestKey(), String(seconds())); } catch {}
  }
  function icon(kind: string) {
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('width', '20'); svg.setAttribute('height', '20'); svg.setAttribute('aria-hidden', 'true');
    const path = document.createElementNS(ns, 'path'); path.setAttribute('stroke', 'currentColor'); path.setAttribute('stroke-width', '1.8'); path.setAttribute('stroke-linecap', 'round'); path.setAttribute('stroke-linejoin', 'round');
    if (kind === 'flag') { path.setAttribute('d', 'M6 21V3M6 4C10 1 14 8 19 4V13C14 17 10 10 6 13M3 21H10'); path.setAttribute('fill', '#d65339'); }
    else if (kind === 'mine') { path.setAttribute('d', 'M12 2V5M12 19V22M2 12H5M19 12H22M5 5L7 7M17 17L19 19M5 19L7 17M17 7L19 5M18 12A6 6 0 1 0 6 12A6 6 0 1 0 18 12'); path.setAttribute('fill', 'currentColor'); }
    else { path.setAttribute('d', 'M6 6L18 18M18 6L6 18'); path.setAttribute('fill', 'none'); }
    svg.append(path); return svg;
  }
  function setFace() {
    const button = get<HTMLButtonElement>('face');
    if (!button) return;
    const mood = game.status === 'won' ? 'won' : game.status === 'lost' ? 'lost' : paused ? 'paused' : 'normal';
    if (button.dataset.mood === mood) return;
    button.dataset.mood = mood;
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg'); svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('width', '28'); svg.setAttribute('height', '28'); svg.setAttribute('aria-hidden', 'true');
    const path = document.createElementNS(ns, 'path'); path.setAttribute('fill', 'none'); path.setAttribute('stroke', 'currentColor'); path.setAttribute('stroke-width', '1.6'); path.setAttribute('stroke-linecap', 'round');
    path.setAttribute('d', 'M21 12A9 9 0 1 0 3 12A9 9 0 1 0 21 12' + (mood === 'lost' ? 'M7 7L10 10M10 7L7 10M14 7L17 10M17 7L14 10M7 17Q12 12 17 17' : 'M8 9H9M15 9H16M7 14Q12 20 17 14'));
    svg.append(path); button.replaceChildren(svg);
  }
  function hud() {
    const counter = get<HTMLElement>('count'); const remaining = game.totalMines - game.flagsPlaced;
    if (counter) { counter.textContent = remaining > 999 ? '999+' : remaining < 0 ? '-' + String(Math.abs(remaining)).padStart(2, '0') : String(remaining).padStart(3, '0'); counter.setAttribute('aria-label', remaining + ' unflagged mines remaining'); }
    const best = get<HTMLElement>('best'); if (best) best.textContent = (assisted ? 'Assisted: ' : '') + (bestTime() === null ? '—' : bestTime() + 's');
    const pause = get<HTMLButtonElement>('pause'); if (pause) { pause.disabled = game.status !== 'playing'; pause.textContent = paused ? 'Resume' : 'Pause'; }
    const hint = get<HTMLButtonElement>('hint'); if (hint) hint.disabled = game.status === 'lost' || game.status === 'won';
    const sound = get<HTMLButtonElement>('sound'); if (sound) { sound.textContent = audio.enabled ? 'Sound on' : 'Sound off'; sound.setAttribute('aria-pressed', String(audio.enabled)); }
    const flag = get<HTMLButtonElement>('flag-toggle'); if (flag) { flag.textContent = flagMode ? 'Flag mode' : 'Reveal mode'; flag.setAttribute('aria-pressed', String(flagMode)); flag.classList.toggle('is-active', flagMode); }
    const banner = get<HTMLElement>('status'); const message = get<HTMLElement>('status-text');
    if (banner) banner.hidden = game.status !== 'won' && game.status !== 'lost';
    if (message) message.textContent = game.status === 'won' ? 'Cleared in ' + seconds() + 's · ' + (assisted ? 'assisted record' : 'classic record') : 'Mine found. Restart or press R to try again.';
    if (banner) banner.className = 'mine-status-banner ' + (game.status === 'won' ? 'is-won' : 'is-lost');
    setFace();
  }
  function render() {
    board.style.setProperty('--mine-rows', String(game.rows)); board.style.setProperty('--mine-cols', String(game.cols));
    board.setAttribute('aria-rowcount', String(game.rows)); board.setAttribute('aria-colcount', String(game.cols));
    if (shape !== game.rows + 'x' + game.cols) {
      shape = game.rows + 'x' + game.cols; buttons = [];
      const fragment = document.createDocumentFragment();
      for (let row = 0; row < game.rows; row++) {
        const rowEl = document.createElement('div'); rowEl.className = 'mine-row'; rowEl.setAttribute('role', 'row'); rowEl.setAttribute('aria-rowindex', String(row + 1));
        buttons[row] = [];
        for (let col = 0; col < game.cols; col++) {
          const button = document.createElement('button'); button.type = 'button'; button.className = 'mine-cell';
          button.dataset.row = String(row); button.dataset.col = String(col); button.setAttribute('role', 'gridcell'); button.setAttribute('aria-colindex', String(col + 1));
          rowEl.append(button); buttons[row][col] = button;
        }
        fragment.append(rowEl);
      }
      board.replaceChildren(fragment);
    }
    for (let row = 0; row < game.rows; row++) for (let col = 0; col < game.cols; col++) {
      const cell = game.grid[row][col]; const button = buttons[row][col];
      const exposed = cell.state === 'revealed' || game.status === 'lost' && cell.isMine && cell.state !== 'flagged';
      const display = cell.state === 'flagged' ? game.status === 'lost' && !cell.isMine ? 'wrong' : 'flag' : exposed ? cell.isMine ? 'mine' : cell.neighborMines ? String(cell.neighborMines) : '' : cell.state === 'question' ? '?' : '';
      const hint = hintCells.has(row + ',' + col) ? hintKind : '';
      const key = cell.state + ':' + exposed + ':' + display + ':' + hint + ':' + paused;
      button.tabIndex = focused.row === row && focused.col === col ? 0 : -1;
      if (renderKeys.get(button) === key) continue;
      const previous = renderKeys.get(button); renderKeys.set(button, key);
      button.className = 'mine-cell';
      if (exposed) button.classList.add('is-revealed');
      if (display === 'mine') button.classList.add('is-mine');
      if (game.explodedCell?.[0] === row && game.explodedCell?.[1] === col) button.classList.add('is-exploded');
      if (display === 'flag') button.classList.add('is-flagged');
      if (display === 'wrong') button.classList.add('is-misflagged');
      if (/^[1-8]$/.test(display)) button.classList.add('is-num-' + display);
      if (hint) button.classList.add('is-hint-' + hint);
      if (exposed && previous && !previous.includes(':true:')) button.classList.add('is-new-reveal');
      if (['mine', 'flag', 'wrong'].includes(display)) button.replaceChildren(icon(display));
      else button.textContent = display;
      button.setAttribute('aria-label', 'Row ' + (row + 1) + ', column ' + (col + 1) + ': ' + (exposed ? display === 'mine' ? 'mine' : cell.neighborMines + ' adjacent mines' : cell.state) + (hint ? ', deduction: ' + hint : ''));
      button.setAttribute('aria-disabled', String(paused || game.status === 'won' || game.status === 'lost'));
    }
    container.classList.toggle('is-dark', isDarkTheme());
    hud();
  }
  function cancelPress(suppress = false) {
    window.clearTimeout(longTimer); longTimer = 0; press = null;
    if (suppress) suppressClickUntil = performance.now() + 700;
  }
  function action(row: number, col: number, kind: 'reveal' | 'flag' | 'chord' = 'reveal') {
    if (paused || game.status === 'won' || game.status === 'lost') return;
    focused = { row, col }; hintCells.clear(); hintKind = 'none';
    const first = game.status === 'ready';
    if (kind === 'flag') { toggleFlag(game, row, col); audio.playFlag(); render(); return; }
    const result = kind === 'chord' || game.grid[row][col].state === 'revealed' ? chordCell(game, row, col) : revealCell(game, row, col, random);
    if (first && game.status === 'playing') startClock();
    if (result.exploded || result.won) {
      freezeClock(); cancelPress();
      if (result.won) { recordTime(); audio.playWin(); } else audio.playExplosion();
    } else if (result.revealed.length) { if (kind === 'chord') audio.playChord(); else audio.playClick(); }
    render();
  }
  function newGame(next: Difficulty = difficulty, config = custom) {
    cancelPress(); freezeClock(); elapsedMs = 0; clockDisplay();
    difficulty = next; custom = config; game = createGame(next, config); paused = false; assisted = false;
    focused = { row: 0, col: 0 }; hintCells.clear(); hintKind = 'none';
    random = mulberry32(seedParam === null ? Date.now() : Number(seedParam) >>> 0);
    container.querySelectorAll<HTMLButtonElement>('[data-mine-diff]').forEach((button) => { const active = button.dataset.mineDiff === next; button.classList.toggle('is-active', active); button.setAttribute('aria-pressed', String(active)); });
    const text = get<HTMLElement>('hint-text'); if (text) text.textContent = 'Arrow keys navigate · Enter/Space reveal · F flags a cell · C chords a number. First opening is safe, but boards are not guaranteed no-guess.';
    render();
    if (board.contains(document.activeElement)) buttons[0][0].focus({ preventScroll: true });
  }
  function togglePause() {
    if (game.status !== 'playing') return;
    cancelPress();
    if (paused) { paused = false; startClock(); } else { paused = true; assisted = true; freezeClock(); }
    const text = get<HTMLElement>('hint-text'); if (text) text.textContent = paused ? 'Paused. This run is assisted and cannot replace a classic record. Press Resume when ready.' : 'Resumed · assisted record category.';
    render();
  }
  const targetCell = (target: EventTarget | null) => target instanceof Element ? target.closest<HTMLButtonElement>('.mine-cell') : null;
  board.addEventListener('click', (event) => {
    if (event.detail !== 0 && performance.now() < suppressClickUntil) return;
    const button = targetCell(event.target); if (button) action(Number(button.dataset.row), Number(button.dataset.col), flagMode ? 'flag' : 'reveal');
  }, { signal });
  board.addEventListener('contextmenu', (event) => { event.preventDefault(); const button = targetCell(event.target); if (button) action(Number(button.dataset.row), Number(button.dataset.col), 'flag'); }, { signal });
  board.addEventListener('focusin', (event) => { const button = targetCell(event.target); if (button) focused = { row: Number(button.dataset.row), col: Number(button.dataset.col) }; }, { signal });
  board.addEventListener('keydown', (event) => {
    const button = targetCell(event.target); if (!button) return;
    const row = Number(button.dataset.row); const col = Number(button.dataset.col);
    if (/^Arrow|^Home$|^End$/.test(event.key)) {
      event.preventDefault();
      focused = { row: Math.max(0, Math.min(game.rows - 1, row + (event.key === 'ArrowDown' ? 1 : event.key === 'ArrowUp' ? -1 : 0))), col: event.key === 'Home' ? 0 : event.key === 'End' ? game.cols - 1 : Math.max(0, Math.min(game.cols - 1, col + (event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0))) };
      render(); const next = buttons[focused.row][focused.col]; next.focus({ preventScroll: true }); next.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    } else if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); action(row, col, 'reveal'); }
    else if (event.key.toLowerCase() === 'f') { event.preventDefault(); event.stopPropagation(); action(row, col, 'flag'); }
    else if (event.key.toLowerCase() === 'c') { event.preventDefault(); action(row, col, 'chord'); }
  }, { signal });
  container.addEventListener('keydown', (event) => {
    if (event.target instanceof Element && event.target.closest('input,select,textarea,[contenteditable]')) return;
    if (event.key.toLowerCase() === 'r') { event.preventDefault(); newGame(); }
  }, { signal });
  board.addEventListener('pointerdown', (event) => {
    if (event.pointerType !== 'touch' || paused) return;
    cancelPress();
    const button = targetCell(event.target); if (!button) return;
    press = { id: event.pointerId, x: event.clientX, y: event.clientY, row: Number(button.dataset.row), col: Number(button.dataset.col) };
    const active = press;
    longTimer = window.setTimeout(() => {
      if (press !== active || !container.isConnected) return;
      suppressClickUntil = performance.now() + 1000; action(active.row, active.col, 'flag');
    }, 450);
  }, { signal });
  board.addEventListener('pointermove', (event) => { if (press && Math.hypot(event.clientX - press.x, event.clientY - press.y) > 8) cancelPress(true); }, { signal });
  board.addEventListener('pointerup', () => cancelPress(), { signal });
  board.addEventListener('pointercancel', () => cancelPress(true), { signal });
  const scroll = container.querySelector('.board-scroll-container');
  scroll?.addEventListener('scroll', () => { if (press) cancelPress(true); }, { signal, passive: true });
  board.addEventListener('pointerover', (event) => {
    board.querySelectorAll('.is-chord-preview').forEach((button) => button.classList.remove('is-chord-preview'));
    const button = targetCell(event.target); if (!button || paused) return;
    const row = Number(button.dataset.row); const col = Number(button.dataset.col);
    const cell = game.grid[row][col];
    if (cell.state === 'revealed' && cell.neighborMines > 0) getAdjacentCoords(row, col, game.rows, game.cols).forEach(([r, c]) => { if (game.grid[r][c].state !== 'revealed') buttons[r][c].classList.add('is-chord-preview'); });
  }, { signal });
  board.addEventListener('pointerleave', () => board.querySelectorAll('.is-chord-preview').forEach((button) => button.classList.remove('is-chord-preview')), { signal });
  get<HTMLButtonElement>('face')?.addEventListener('click', () => newGame(), { signal });
  get<HTMLButtonElement>('status-btn')?.addEventListener('click', () => newGame(), { signal });
  get<HTMLButtonElement>('pause')?.addEventListener('click', togglePause, { signal });
  get<HTMLButtonElement>('flag-toggle')?.addEventListener('click', () => { flagMode = !flagMode; hud(); }, { signal });
  get<HTMLButtonElement>('sound')?.addEventListener('click', () => { audio.enabled = !audio.enabled; try { localStorage.setItem(SOUND_STORAGE_KEY, String(audio.enabled)); } catch {} hud(); }, { signal });
  get<HTMLButtonElement>('hint')?.addEventListener('click', () => {
    assisted = true;
    const hint = game.status === 'ready' ? { kind: 'safe', cells: [[0, 0]], reason: 'Any first click is safe and reserves its full 3×3 neighborhood when interior. Choose an opening; this run is now assisted.' } : findVisibleHint(getVisibleBoard(game));
    hintCells = new Set(hint.cells.map(([row, col]) => row + ',' + col)); hintKind = hint.kind;
    const text = get<HTMLElement>('hint-text'); if (text) text.textContent = 'Assisted deduction: ' + hint.reason;
    render();
  }, { signal });
  container.querySelectorAll<HTMLButtonElement>('[data-mine-diff]').forEach((button) => button.addEventListener('click', () => newGame(button.dataset.mineDiff as Difficulty), { signal }));
  get<HTMLFormElement>('custom-form')?.addEventListener('submit', (event) => {
    event.preventDefault();
    const rows = Number(get<HTMLInputElement>('rows')?.value); const cols = Number(get<HTMLInputElement>('cols')?.value); const mines = Number(get<HTMLInputElement>('mines')?.value);
    if (![rows, cols, mines].every(Number.isInteger) || rows < 4 || rows > 40 || cols < 4 || cols > 50 || mines < 1 || mines > rows * cols - 9) {
      const text = get<HTMLElement>('hint-text'); if (text) text.textContent = 'Use integer rows 4–40, columns 4–50, and 1 to rows×columns−9 mines to preserve a full safe opening.'; return;
    }
    newGame('custom', { rows, cols, mines });
  }, { signal });
  const zoom = get<HTMLSelectElement>('zoom');
  zoom?.addEventListener('change', () => { board.style.setProperty('--mine-cell-size', zoom.value + 'px'); try { localStorage.setItem('khc-mine-zoom', zoom.value); } catch {} }, { signal });
  try { const value = localStorage.getItem('khc-mine-zoom'); if (zoom && value && ['24', '32', '40'].includes(value)) zoom.value = value; } catch {}
  board.style.setProperty('--mine-cell-size', (zoom?.value ?? '32') + 'px');
  document.addEventListener('visibilitychange', () => { if (document.hidden) { cancelPress(); if (game.status === 'playing' && !paused) togglePause(); } }, { signal });
  window.addEventListener('blur', () => { cancelPress(); if (game.status === 'playing' && !paused) togglePause(); }, { signal });
  document.addEventListener('khc:theme-change', render, { signal });
  const win = window as unknown as { __minesweeper?: { state: () => MinesweeperGame; visible: () => unknown; destroy: () => void }; __minesweeperInstances?: number };
  win.__minesweeperInstances = (win.__minesweeperInstances ?? 0) + 1;
  const controller = { destroy: () => {
    if (disposed) return; disposed = true; cancelPress(); freezeClock(); abort.abort(); audio.destroy(); delete container.dataset.mineReady;
    win.__minesweeperInstances = Math.max(0, (win.__minesweeperInstances ?? 1) - 1); delete win.__minesweeper;
  } };
  win.__minesweeper = { state: () => game, visible: () => getVisibleBoard(game), destroy: controller.destroy };
  newGame();
  return controller;
}
