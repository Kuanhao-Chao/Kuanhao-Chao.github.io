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
  type Difficulty,
  type MinesweeperGame,
} from '../lib/minesweeper';

const BEST_TIME_KEY_PREFIX = 'khc_minesweeper_best_';
const SOUND_STORAGE_KEY = 'khc_minesweeper_sound';

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
  const container = root.querySelector<HTMLElement>('[data-minesweeper-root]');
  if (!container) return null;

  const boardEl = container.querySelector<HTMLElement>('[data-mine-board]');
  const mineCounterEl = container.querySelector<HTMLElement>('[data-mine-count]');
  const timerEl = container.querySelector<HTMLElement>('[data-mine-timer]');
  const faceBtn = container.querySelector<HTMLButtonElement>('[data-mine-face]');
  const soundToggleBtn = container.querySelector<HTMLButtonElement>('[data-mine-sound]');
  const flagModeBtn = container.querySelector<HTMLButtonElement>('[data-mine-flag-toggle]');
  const diffBtns = container.querySelectorAll<HTMLButtonElement>('[data-mine-diff]');
  const bestTimeEl = container.querySelector<HTMLElement>('[data-mine-best]');
  const statusBannerEl = container.querySelector<HTMLElement>('[data-mine-status]');
  const statusTextEl = container.querySelector<HTMLElement>('[data-mine-status-text]');
  const statusBtnEl = container.querySelector<HTMLButtonElement>('[data-mine-status-btn]');

  if (!boardEl || !mineCounterEl || !timerEl || !faceBtn) return null;

  const audio = new SoundSynth();
  try {
    const storedSound = window.localStorage.getItem(SOUND_STORAGE_KEY);
    if (storedSound !== null) {
      audio.enabled = storedSound === 'true';
    }
  } catch (_) {}
  updateSoundIcon();

  let difficulty: Difficulty = 'beginner';
  let game: MinesweeperGame = createGame(difficulty);
  let timerInterval: ReturnType<typeof setInterval> | null = null;
  let secondsElapsed = 0;
  let flagMode = false;
  let isMousedown = false;

  function vibrate(pattern: number | number[]): void {
    try {
      if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
        navigator.vibrate(pattern);
      }
    } catch (_) {}
  }

  function format3Digits(num: number): string {
    const clamped = Math.max(-99, Math.min(999, num));
    if (clamped < 0) {
      return `-${Math.abs(clamped).toString().padStart(2, '0')}`;
    }
    return clamped.toString().padStart(3, '0');
  }

  function startTimer(): void {
    if (timerInterval) return;
    secondsElapsed = 0;
    timerEl!.textContent = '000';
    timerInterval = setInterval(() => {
      secondsElapsed++;
      if (secondsElapsed > 999) secondsElapsed = 999;
      timerEl!.textContent = format3Digits(secondsElapsed);
    }, 1000);
  }

  function stopTimer(): void {
    if (timerInterval) {
      clearInterval(timerInterval);
      timerInterval = null;
    }
  }

  function getBestTime(): number | null {
    try {
      const raw = window.localStorage.getItem(`${BEST_TIME_KEY_PREFIX}${difficulty}`);
      return raw ? parseInt(raw, 10) : null;
    } catch (_) {
      return null;
    }
  }

  function setBestTime(secs: number): void {
    try {
      const current = getBestTime();
      if (current === null || secs < current) {
        window.localStorage.setItem(`${BEST_TIME_KEY_PREFIX}${difficulty}`, secs.toString());
      }
    } catch (_) {}
  }

  function updateBestTimeDisplay(): void {
    if (!bestTimeEl) return;
    const best = getBestTime();
    bestTimeEl.textContent = best !== null ? `${best}s` : '—';
  }

  function updateSoundIcon(): void {
    if (!soundToggleBtn) return;
    soundToggleBtn.setAttribute('aria-pressed', (!audio.enabled).toString());
    soundToggleBtn.classList.toggle('is-muted', !audio.enabled);
    soundToggleBtn.title = audio.enabled ? 'Mute sound FX' : 'Enable sound FX';
  }

  function updateStatusBanner(): void {
    if (!statusBannerEl || !statusTextEl) return;
    if (game.status === 'won') {
      statusBannerEl.hidden = false;
      statusBannerEl.className = 'mine-status-banner is-won';
      statusTextEl.textContent = `🎉 Victory! Swept all ${game.totalMines} mines in ${secondsElapsed}s!`;
    } else if (game.status === 'lost') {
      statusBannerEl.hidden = false;
      statusBannerEl.className = 'mine-status-banner is-lost';
      statusTextEl.textContent = '💥 Mine detonated! Tap 😊 or press [R] to retry.';
    } else {
      statusBannerEl.hidden = true;
    }
  }

  function setFace(face: 'normal' | 'scared' | 'won' | 'lost'): void {
    let icon = '😊';
    if (face === 'scared') icon = '😮';
    else if (face === 'won') icon = '😎';
    else if (face === 'lost') icon = '😵';
    faceBtn!.textContent = icon;
  }

  function renderBoard(): void {
    boardEl!.style.setProperty('--mine-rows', game.rows.toString());
    boardEl!.style.setProperty('--mine-cols', game.cols.toString());
    boardEl!.replaceChildren();

    const remainingMines = game.totalMines - game.flagsPlaced;
    mineCounterEl!.textContent = format3Digits(remainingMines);

    if (game.status === 'won') {
      setFace('won');
    } else if (game.status === 'lost') {
      setFace('lost');
    } else if (isMousedown) {
      setFace('scared');
    } else {
      setFace('normal');
    }
    updateStatusBanner();

    const fragment = document.createDocumentFragment();

    for (let r = 0; r < game.rows; r++) {
      for (let c = 0; c < game.cols; c++) {
        const cell = game.grid[r][c];
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'mine-cell';
        btn.dataset.row = r.toString();
        btn.dataset.col = c.toString();

        if (cell.state === 'revealed') {
          btn.classList.add('is-revealed');
          if (cell.isMine) {
            btn.classList.add('is-mine');
            btn.textContent = '💣';
            if (game.explodedCell && game.explodedCell[0] === r && game.explodedCell[1] === c) {
              btn.classList.add('is-exploded');
            }
          } else if (cell.neighborMines > 0) {
            btn.classList.add(`is-num-${cell.neighborMines}`);
            btn.textContent = cell.neighborMines.toString();
          }
        } else if (cell.state === 'flagged') {
          btn.classList.add('is-flagged');
          btn.textContent = '🚩';
          // If lost, check if flag was incorrect
          if (game.status === 'lost' && !cell.isMine) {
            btn.classList.add('is-misflagged');
            btn.textContent = '❌';
          }
        } else if (cell.state === 'question') {
          btn.classList.add('is-question');
          btn.textContent = '❓';
        }

        // If game is lost, expose all unflagged mines
        if (game.status === 'lost' && cell.isMine && cell.state !== 'revealed' && cell.state !== 'flagged') {
          btn.classList.add('is-revealed', 'is-mine');
          btn.textContent = '💣';
        }

        fragment.appendChild(btn);
      }
    }

    boardEl!.appendChild(fragment);
  }

  function handleCellClick(row: number, col: number): void {
    if (game.status === 'won' || game.status === 'lost') return;

    if (flagMode) {
      handleCellRightClick(row, col);
      return;
    }

    const cell = game.grid[row][col];

    // Chording on revealed numbered cells
    if (cell.state === 'revealed' && cell.neighborMines > 0) {
      const res = chordCell(game, row, col);
      if (res.exploded) {
        stopTimer();
        vibrate([60, 40, 100]);
        audio.playExplosion();
      } else if (res.won) {
        stopTimer();
        setBestTime(secondsElapsed);
        updateBestTimeDisplay();
        vibrate([40, 30, 40]);
        audio.playWin();
      } else if (res.revealed.length > 0) {
        audio.playChord();
      }
      renderBoard();
      return;
    }

    if (cell.state !== 'hidden' && cell.state !== 'question') return;

    const isFirstClick = game.status === 'ready';
    const res = revealCell(game, row, col);

    if (isFirstClick) {
      startTimer();
    }

    if (res.exploded) {
      stopTimer();
      vibrate([60, 40, 100]);
      audio.playExplosion();
    } else if (res.won) {
      stopTimer();
      setBestTime(secondsElapsed);
      updateBestTimeDisplay();
      vibrate([40, 30, 40]);
      audio.playWin();
    } else {
      audio.playClick();
    }

    renderBoard();
  }

  function handleCellRightClick(row: number, col: number): void {
    if (game.status === 'won' || game.status === 'lost') return;
    const cell = game.grid[row][col];
    if (cell.state === 'revealed') return;

    toggleFlag(game, row, col);
    vibrate(25);
    audio.playFlag();
    renderBoard();
  }

  function startNewGame(newDiff: Difficulty = difficulty): void {
    stopTimer();
    secondsElapsed = 0;
    timerEl!.textContent = '000';
    difficulty = newDiff;
    game = createGame(difficulty);
    setFace('normal');
    updateBestTimeDisplay();
    updateStatusBanner();

    diffBtns.forEach((btn) => {
      const d = btn.dataset.mineDiff as Difficulty;
      const active = d === difficulty;
      btn.classList.toggle('is-active', active);
      btn.setAttribute('aria-pressed', active.toString());
    });

    renderBoard();
  }

  // --- Board Click Delegation ---
  function onBoardClick(e: MouseEvent): void {
    const target = (e.target as HTMLElement).closest<HTMLButtonElement>('.mine-cell');
    if (!target) return;
    const r = parseInt(target.dataset.row || '-1', 10);
    const c = parseInt(target.dataset.col || '-1', 10);
    if (r >= 0 && c >= 0) {
      handleCellClick(r, c);
    }
  }

  function onBoardContextMenu(e: MouseEvent): void {
    e.preventDefault();
    const target = (e.target as HTMLElement).closest<HTMLButtonElement>('.mine-cell');
    if (!target) return;
    const r = parseInt(target.dataset.row || '-1', 10);
    const c = parseInt(target.dataset.col || '-1', 10);
    if (r >= 0 && c >= 0) {
      handleCellRightClick(r, c);
    }
  }

  function onBoardMousedown(e: MouseEvent): void {
    if (e.button === 0 && (game.status === 'ready' || game.status === 'playing')) {
      isMousedown = true;
      setFace('scared');
    }
  }

  function onWindowMouseup(): void {
    if (isMousedown) {
      isMousedown = false;
      if (game.status === 'ready' || game.status === 'playing') setFace('normal');
    }
  }

  // --- Keyboard Shortcuts ---
  function onKeyDown(e: KeyboardEvent): void {
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement).tagName)) return;
    if (e.key === 'r' || e.key === 'R') {
      e.preventDefault();
      startNewGame();
    } else if (e.key === 'f' || e.key === 'F') {
      e.preventDefault();
      flagMode = !flagMode;
      flagModeBtn?.classList.toggle('is-active', flagMode);
      flagModeBtn?.setAttribute('aria-pressed', flagMode.toString());
    }
  }

  // --- Long-press for Touch Flagging ---
  let longPressTimer: ReturnType<typeof setTimeout> | null = null;
  let longPressTriggered = false;

  function onTouchStart(e: TouchEvent): void {
    if (e.touches.length !== 1) return;
    const target = (e.target as HTMLElement).closest<HTMLButtonElement>('.mine-cell');
    if (!target) return;
    const r = parseInt(target.dataset.row || '-1', 10);
    const c = parseInt(target.dataset.col || '-1', 10);

    longPressTriggered = false;
    longPressTimer = setTimeout(() => {
      longPressTriggered = true;
      if (r >= 0 && c >= 0) {
        handleCellRightClick(r, c);
        if ('vibrate' in navigator) navigator.vibrate(40);
      }
    }, 450);
  }

  function onTouchEnd(e: TouchEvent): void {
    if (longPressTimer) {
      clearTimeout(longPressTimer);
      longPressTimer = null;
    }
    if (longPressTriggered) {
      e.preventDefault();
    }
  }

  // --- Event Bindings ---
  window.addEventListener('keydown', onKeyDown);
  boardEl.addEventListener('click', onBoardClick);
  boardEl.addEventListener('contextmenu', onBoardContextMenu);
  boardEl.addEventListener('mousedown', onBoardMousedown);
  window.addEventListener('mouseup', onWindowMouseup);

  boardEl.addEventListener('touchstart', onTouchStart, { passive: true });
  boardEl.addEventListener('touchend', onTouchEnd);

  const onFaceClick = () => startNewGame();
  faceBtn.addEventListener('click', onFaceClick);
  statusBtnEl?.addEventListener('click', onFaceClick);

  const onSoundClick = () => {
    audio.enabled = !audio.enabled;
    try {
      window.localStorage.setItem(SOUND_STORAGE_KEY, audio.enabled.toString());
    } catch (_) {}
    updateSoundIcon();
  };
  soundToggleBtn?.addEventListener('click', onSoundClick);

  const onFlagModeClick = () => {
    flagMode = !flagMode;
    flagModeBtn?.classList.toggle('is-active', flagMode);
    flagModeBtn?.setAttribute('aria-pressed', flagMode.toString());
  };
  flagModeBtn?.addEventListener('click', onFlagModeClick);

  const diffListeners: { btn: HTMLButtonElement; fn: () => void }[] = [];
  diffBtns.forEach((btn) => {
    const d = btn.dataset.mineDiff as Difficulty;
    const fn = () => startNewGame(d);
    btn.addEventListener('click', fn);
    diffListeners.push({ btn, fn });
  });

  // Start initial Beginner game
  startNewGame('beginner');

  return {
    destroy: () => {
      stopTimer();
      window.removeEventListener('keydown', onKeyDown);
      boardEl.removeEventListener('click', onBoardClick);
      boardEl.removeEventListener('contextmenu', onBoardContextMenu);
      boardEl.removeEventListener('mousedown', onBoardMousedown);
      window.removeEventListener('mouseup', onWindowMouseup);
      boardEl.removeEventListener('touchstart', onTouchStart);
      boardEl.removeEventListener('touchend', onTouchEnd);
      faceBtn.removeEventListener('click', onFaceClick);
      statusBtnEl?.removeEventListener('click', onFaceClick);
      soundToggleBtn?.removeEventListener('click', onSoundClick);
      flagModeBtn?.removeEventListener('click', onFlagModeClick);
      diffListeners.forEach(({ btn, fn }) => btn.removeEventListener('click', fn));
    },
  };
}
