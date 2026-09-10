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

import {
  createEmptyGrid,
  spawnRandomTile,
  slideAndMerge,
  hasMovesAvailable,
  isGameWon,
  createHistoryStack,
  pushSnapshot,
  popSnapshot,
  clearHistory,
  type BoardSize,
  type Direction,
  type HistoryStack,
} from '../lib/game2048';

const BEST_SCORE_KEY_PREFIX = 'khc_game_2048_best_';
const SOUND_STORAGE_KEY = 'khc_game_2048_sound';

class SoundSynth {
  private ctx: AudioContext | null = null;
  enabled = true;

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
  if (!container) return null;

  const gridEl = container.querySelector<HTMLElement>('[data-2048-grid]');
  const scoreValEl = container.querySelector<HTMLElement>('[data-2048-score]');
  const bestScoreValEl = container.querySelector<HTMLElement>('[data-2048-best]');
  const undoBtn = container.querySelector<HTMLButtonElement>('[data-2048-undo]');
  const restartBtn = container.querySelector<HTMLButtonElement>('[data-2048-restart]');
  const soundToggleBtn = container.querySelector<HTMLButtonElement>('[data-2048-sound]');
  const sizeBtns = container.querySelectorAll<HTMLButtonElement>('[data-2048-size]');
  const overlayEl = container.querySelector<HTMLElement>('[data-2048-overlay]');
  const overlayTitleEl = container.querySelector<HTMLElement>('[data-2048-overlay-title]');
  const overlayMsgEl = container.querySelector<HTMLElement>('[data-2048-overlay-msg]');
  const overlayActionBtn = container.querySelector<HTMLButtonElement>('[data-2048-overlay-btn]');

  if (!gridEl) return null;

  const audio = new SoundSynth();
  try {
    const storedSound = window.localStorage.getItem(SOUND_STORAGE_KEY);
    if (storedSound !== null) {
      audio.enabled = storedSound === 'true';
    }
  } catch (_) {}
  updateSoundIcon();

  let boardSize: BoardSize = 4;
  let grid: number[][] = createEmptyGrid(boardSize);
  let score = 0;
  let isWon = false;
  let isOver = false;
  let keepPlaying = false;
  let history: HistoryStack = createHistoryStack(20);

  function getBestScore(): number {
    try {
      return parseInt(window.localStorage.getItem(`${BEST_SCORE_KEY_PREFIX}${boardSize}`) || '0', 10);
    } catch (_) {
      return 0;
    }
  }

  function setBestScore(newScore: number): void {
    try {
      const current = getBestScore();
      if (newScore > current) {
        window.localStorage.setItem(`${BEST_SCORE_KEY_PREFIX}${boardSize}`, newScore.toString());
      }
    } catch (_) {}
  }

  function updateSoundIcon(): void {
    if (!soundToggleBtn) return;
    soundToggleBtn.setAttribute('aria-pressed', (!audio.enabled).toString());
    soundToggleBtn.classList.toggle('is-muted', !audio.enabled);
    soundToggleBtn.title = audio.enabled ? 'Mute sound FX' : 'Enable sound FX';
    const path = soundToggleBtn.querySelector('path:last-child');
    if (path) {
      path.setAttribute('stroke', audio.enabled ? 'currentColor' : '#ef4444');
    }
  }

  function renderGrid(mergedTiles: [number, number][] = [], spawnedTile: [number, number] | null = null): void {
    if (!gridEl) return;
    gridEl.style.setProperty('--grid-size', boardSize.toString());
    gridEl.replaceChildren();

    const mergedSet = new Set(mergedTiles.map(([r, c]) => `${r},${c}`));

    for (let r = 0; r < boardSize; r++) {
      for (let c = 0; c < boardSize; c++) {
        const val = grid[r][c];
        const cell = document.createElement('div');
        cell.className = 'g2048-cell';

        if (val > 0) {
          const tile = document.createElement('div');
          const isMerged = mergedSet.has(`${r},${c}`);
          const isSpawned = spawnedTile && spawnedTile[0] === r && spawnedTile[1] === c;

          tile.className = `g2048-tile g2048-tile--${val > 2048 ? 'super' : val}`;
          if (isMerged) tile.classList.add('is-merged');
          if (isSpawned) tile.classList.add('is-new');

          tile.textContent = val.toString();
          if (val >= 1024) tile.classList.add('is-compact');
          if (val >= 16384) tile.classList.add('is-tiny');

          cell.appendChild(tile);
        }

        gridEl.appendChild(cell);
      }
    }

    if (scoreValEl) scoreValEl.textContent = score.toString();
    if (bestScoreValEl) bestScoreValEl.textContent = Math.max(score, getBestScore()).toString();
    if (undoBtn) {
      undoBtn.disabled = history.snapshots.length === 0;
      undoBtn.classList.toggle('is-disabled', history.snapshots.length === 0);
    }
  }

  function showOverlay(title: string, msg: string, btnText: string, onAction: () => void): void {
    if (!overlayEl || !overlayTitleEl || !overlayMsgEl || !overlayActionBtn) return;
    overlayTitleEl.textContent = title;
    overlayMsgEl.textContent = msg;
    overlayActionBtn.textContent = btnText;
    overlayEl.hidden = false;
    overlayEl.classList.add('is-active');

    const clickHandler = () => {
      overlayActionBtn.removeEventListener('click', clickHandler);
      overlayEl.hidden = true;
      overlayEl.classList.remove('is-active');
      onAction();
    };
    overlayActionBtn.addEventListener('click', clickHandler);
  }

  function startNewGame(newSize: BoardSize = boardSize): void {
    boardSize = newSize;
    grid = createEmptyGrid(boardSize);
    score = 0;
    isWon = false;
    isOver = false;
    keepPlaying = false;
    history = clearHistory(history);

    if (overlayEl) overlayEl.hidden = true;

    // Spawn 2 initial tiles
    const t1 = spawnRandomTile(grid);
    grid = t1.grid;
    const t2 = spawnRandomTile(grid);
    grid = t2.grid;

    sizeBtns.forEach((btn) => {
      const s = parseInt(btn.dataset.boardSize || '4', 10);
      const active = s === boardSize;
      btn.classList.toggle('is-active', active);
      btn.setAttribute('aria-pressed', active.toString());
    });

    renderGrid([], t2.spawned);
  }

  function handleMove(direction: Direction): void {
    if (isOver) return;

    // Save snapshot before move
    history = pushSnapshot(history, {
      grid,
      score,
      boardSize,
      isWon,
      isOver,
    });

    const res = slideAndMerge(grid, direction);
    if (!res.changed) {
      // Revert snapshot if nothing moved
      popSnapshot(history);
      return;
    }

    grid = res.grid;
    score += res.scoreGain;
    setBestScore(score);

    // Audio cues
    if (res.scoreGain > 0) {
      let maxMerged = 4;
      for (const [r, c] of res.mergedPositions) {
        if (grid[r][c] > maxMerged) maxMerged = grid[r][c];
      }
      audio.playMerge(maxMerged);
    } else {
      audio.playSlide();
    }

    // Spawn next tile
    const { grid: nextGrid, spawned } = spawnRandomTile(grid);
    grid = nextGrid;

    // Check Win condition
    if (!isWon && !keepPlaying && isGameWon(grid, 2048)) {
      isWon = true;
      audio.playWin();
      renderGrid(res.mergedPositions, spawned);
      showOverlay('You Reached 2048!', 'Outstanding victory! Continue playing for higher tiles or restart?', 'Keep Going', () => {
        keepPlaying = true;
      });
      return;
    }

    // Check Loss condition
    if (!hasMovesAvailable(grid)) {
      isOver = true;
      audio.playGameOver();
      renderGrid(res.mergedPositions, spawned);
      showOverlay('Game Over', `No more valid moves! Final score: ${score}`, 'Try Again', () => {
        startNewGame(boardSize);
      });
      return;
    }

    renderGrid(res.mergedPositions, spawned);
  }

  function handleUndo(): void {
    if (history.snapshots.length === 0) return;
    const { stack, restored } = popSnapshot(history);
    history = stack;
    if (!restored) return;

    grid = restored.grid;
    score = restored.score;
    boardSize = restored.boardSize;
    isWon = restored.isWon;
    isOver = restored.isOver;

    if (overlayEl) overlayEl.hidden = true;
    audio.playSlide();
    renderGrid();
  }

  // --- Keyboard Handler ---
  function onKeyDown(e: KeyboardEvent): void {
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement).tagName)) return;
    if (e.metaKey || e.altKey || e.ctrlKey) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        handleUndo();
      }
      return;
    }

    let dir: Direction | null = null;
    switch (e.key) {
      case 'ArrowUp':
      case 'w':
      case 'W':
        dir = 'up';
        break;
      case 'ArrowDown':
      case 's':
      case 'S':
        dir = 'down';
        break;
      case 'ArrowLeft':
      case 'a':
      case 'A':
        dir = 'left';
        break;
      case 'ArrowRight':
      case 'd':
      case 'D':
        dir = 'right';
        break;
      case 'u':
      case 'U':
        e.preventDefault();
        handleUndo();
        return;
      case 'r':
      case 'R':
        e.preventDefault();
        startNewGame();
        return;
    }

    if (dir) {
      e.preventDefault();
      handleMove(dir);
    }
  }

  // --- Touch Gesture Handler ---
  let touchStartX = 0;
  let touchStartY = 0;
  const MIN_SWIPE_DISTANCE = 30;

  function onTouchStart(e: TouchEvent): void {
    if (e.touches.length !== 1) return;
    touchStartX = e.touches[0].clientX;
    touchStartY = e.touches[0].clientY;
  }

  function onTouchEnd(e: TouchEvent): void {
    if (e.changedTouches.length !== 1) return;
    const dx = e.changedTouches[0].clientX - touchStartX;
    const dy = e.changedTouches[0].clientY - touchStartY;
    const absX = Math.abs(dx);
    const absY = Math.abs(dy);

    if (Math.max(absX, absY) < MIN_SWIPE_DISTANCE) return;

    if (absX > absY) {
      handleMove(dx > 0 ? 'right' : 'left');
    } else {
      handleMove(dy > 0 ? 'down' : 'up');
    }
  }

  // --- Directional Button Handlers (Mobile) ---
  const dirButtons = container.querySelectorAll<HTMLButtonElement>('[data-2048-btn]');
  const dirListeners: { btn: HTMLButtonElement; fn: () => void }[] = [];
  dirButtons.forEach((btn) => {
    const dir = btn.getAttribute('data-2048-btn') as Direction | null;
    if (dir) {
      const fn = () => handleMove(dir);
      btn.addEventListener('click', fn);
      dirListeners.push({ btn, fn });
    }
  });

  // --- Event Listeners Attachment ---
  window.addEventListener('keydown', onKeyDown);
  gridEl.addEventListener('touchstart', onTouchStart, { passive: true });
  gridEl.addEventListener('touchend', onTouchEnd, { passive: true });

  const onUndoClick = () => handleUndo();
  const onRestartClick = () => startNewGame();
  const onSoundClick = () => {
    audio.enabled = !audio.enabled;
    try {
      window.localStorage.setItem(SOUND_STORAGE_KEY, audio.enabled.toString());
    } catch (_) {}
    updateSoundIcon();
  };

  undoBtn?.addEventListener('click', onUndoClick);
  restartBtn?.addEventListener('click', onRestartClick);
  soundToggleBtn?.addEventListener('click', onSoundClick);

  const sizeListeners: { btn: HTMLButtonElement; fn: () => void }[] = [];
  sizeBtns.forEach((btn) => {
    const s = parseInt(btn.dataset.boardSize || '4', 10) as BoardSize;
    const fn = () => startNewGame(s);
    btn.addEventListener('click', fn);
    sizeListeners.push({ btn, fn });
  });

  // Start initial game
  startNewGame(4);

  return {
    destroy: () => {
      window.removeEventListener('keydown', onKeyDown);
      gridEl.removeEventListener('touchstart', onTouchStart);
      gridEl.removeEventListener('touchend', onTouchEnd);
      undoBtn?.removeEventListener('click', onUndoClick);
      restartBtn?.removeEventListener('click', onRestartClick);
      soundToggleBtn?.removeEventListener('click', onSoundClick);
      sizeListeners.forEach(({ btn, fn }) => btn.removeEventListener('click', fn));
      dirListeners.forEach(({ btn, fn }) => btn.removeEventListener('click', fn));
    },
  };
}
