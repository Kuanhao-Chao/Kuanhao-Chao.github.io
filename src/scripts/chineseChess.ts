/**
 * Chinese Chess (Xiangqi / 象棋) Canvas Renderer & Interactive Controller
 */

import {
  createGame,
  generateLegalMoves,
  makeMove,
  createTeachingPosition,
  findGeneral,
  CHINESE_PIECE_CHARS,
  type GameState,
  type Move,
  type Piece,
  type Side,
  type AIDifficulty,
  type TeachingPosition,
} from '../lib/chineseChess';
import { isDarkTheme } from '../lib/theme';

export type GameMode = 'pvp' | 'pve';

interface SoundEffects {
  playSelect: () => void;
  playMove: () => void;
  playCapture: () => void;
  playCheck: () => void;
  playVictory: () => void;
  destroy: () => void;
}

function createAudioSynthesizer(): SoundEffects {
  let audioCtx: AudioContext | null = null;

  const getCtx = (): AudioContext | null => {
    if (typeof window === 'undefined') return null;
    if (!audioCtx) {
      const AudioContextClass =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioContextClass) audioCtx = new AudioContextClass();
    }
    if (audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume().catch(() => {});
    }
    return audioCtx;
  };

  const playSelect = () => {
    const ctx = getCtx();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(520, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(780, ctx.currentTime + 0.06);
    gain.gain.setValueAtTime(0.08, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.06);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.06);
  };

  const playMove = () => {
    const ctx = getCtx();
    if (!ctx) return;
    // Wood clack sound
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(240, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(80, ctx.currentTime + 0.07);
    gain.gain.setValueAtTime(0.35, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.07);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.07);
  };

  const playCapture = () => {
    const ctx = getCtx();
    if (!ctx) return;
    // Resonant wooden capture impact
    const osc = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'square';
    osc2.type = 'triangle';
    osc.frequency.setValueAtTime(180, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(40, ctx.currentTime + 0.12);
    osc2.frequency.setValueAtTime(320, ctx.currentTime);
    osc2.frequency.exponentialRampToValueAtTime(60, ctx.currentTime + 0.12);
    gain.gain.setValueAtTime(0.4, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12);
    osc.connect(gain);
    osc2.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc2.start();
    osc.stop(ctx.currentTime + 0.12);
    osc2.stop(ctx.currentTime + 0.12);
  };

  const playCheck = () => {
    const ctx = getCtx();
    if (!ctx) return;
    // Warning chime chord
    const now = ctx.currentTime;
    [440, 554.37, 659.25].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + i * 0.04);
      gain.gain.setValueAtTime(0.12, now + i * 0.04);
      gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.04 + 0.35);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + i * 0.04);
      osc.stop(now + i * 0.04 + 0.35);
    });
  };

  const playVictory = () => {
    const ctx = getCtx();
    if (!ctx) return;
    const now = ctx.currentTime;
    [523.25, 659.25, 783.99, 1046.5].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, now + i * 0.08);
      gain.gain.setValueAtTime(0.18, now + i * 0.08);
      gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.08 + 0.45);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + i * 0.08);
      osc.stop(now + i * 0.08 + 0.45);
    });
  };

  return { playSelect, playMove, playCapture, playCheck, playVictory, destroy: () => { void audioCtx?.close().catch(() => {}); audioCtx = null; } };
}

export function initChineseChess() {
  const rootEl = document.querySelector<HTMLElement>('[data-cc-root]');
  if (!rootEl) return () => {};
  const root = rootEl;
  if (root.dataset.ccReady) return () => {};
  root.dataset.ccReady = 'true';

  const canvasEl = root.querySelector<HTMLCanvasElement>('[data-cc-canvas]');
  if (!canvasEl) return () => {};
  const canvas: HTMLCanvasElement = canvasEl;
  const maybeCtx = canvas.getContext('2d');
  if (!maybeCtx) return () => {};
  const ctx: CanvasRenderingContext2D = maybeCtx;

  // HUD Elements
  const statusEl = root.querySelector<HTMLElement>('[data-cc-status]');
  const turnEl = root.querySelector<HTMLElement>('[data-cc-turn]');
  const historyListEl = root.querySelector<HTMLElement>('[data-cc-history-list]');
  const capturedRedEl = root.querySelector<HTMLElement>('[data-cc-captured-red]');
  const capturedBlackEl = root.querySelector<HTMLElement>('[data-cc-captured-black]');
  const modeSelect = root.querySelector<HTMLSelectElement>('[data-cc-mode]');
  const diffSelect = root.querySelector<HTMLSelectElement>('[data-cc-difficulty]');
  const sideSelect = root.querySelector<HTMLSelectElement>('[data-cc-side]');
  const undoBtn = root.querySelector<HTMLButtonElement>('[data-cc-undo]');
  const hintBtn = root.querySelector<HTMLButtonElement>('[data-cc-hint]');
  const flipBtn = root.querySelector<HTMLButtonElement>('[data-cc-flip]');
  const restartBtn = root.querySelector<HTMLButtonElement>('[data-cc-restart]');
  const soundBtn = root.querySelector<HTMLButtonElement>('[data-cc-sound]');
  const teachingSelect = root.querySelector<HTMLSelectElement>('[data-cc-teaching]');
  const teachingEl = root.querySelector<HTMLElement>('[data-cc-teaching-note]');
  const drawBtn = root.querySelector<HTMLButtonElement>('[data-cc-draw]');
  const keyboardGrid = root.querySelector<HTMLElement>('[data-cc-keyboard-grid]');

  let game: GameState = createGame();
  let mode: GameMode = (modeSelect?.value as GameMode) || 'pve';
  let difficulty: AIDifficulty = (diffSelect?.value as AIDifficulty) || 'intermediate';
  let playerSide: Side = (sideSelect?.value as Side) || 'red';
  let flipped = false;
  let soundEnabled = false;
  try { soundEnabled = localStorage.getItem('khc-xiangqi-sound') === 'on'; } catch {}
  if (soundBtn) { soundBtn.textContent = soundEnabled ? 'Sound: On' : 'Sound: Off'; soundBtn.setAttribute('aria-pressed', String(soundEnabled)); }
  let selectedPiece: Piece | null = null;
  let legalMovesForSelected: Move[] = [];
  let suggestedHint: Move | null = null;
  let isAIThinking = false;
  let worker: Worker | null = null;
  let searchTimer = 0;
  let revision = 0;
  let jobId = 0;
  let pendingJob: { id: number; revision: number; kind: 'ai' | 'hint' } | null = null;
  let originGame = structuredClone(game);
  let drawOffered = false;
  let focusedCell = { x: 0, y: 0 };
  let motionFrame = 0;
  let movingPiece: { id: number; fromX: number; fromY: number; toX: number; toY: number; started: number } | null = null;
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

  const sfx = createAudioSynthesizer();

  // Coordinates Mapping
  // Board: 9 files (cols 0..8) x 10 ranks (rows 0..9)
  let cellW = 48;
  let cellH = 48;
  let originX = 32;
  let originY = 32;
  let pieceRadius = 20;

  function resize() {
    const rect = canvas!.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const cssW = Math.max(1, rect.width);
    // Aspect ratio: 9 columns, 10 rows with margins -> ratio ~ (9 + 0.8) : (10 + 0.8) ~ 9.8 / 10.8 ~ 0.907
    const cssH = cssW * 1.11;

    canvas!.width = Math.round(cssW * dpr);
    canvas!.height = Math.round(cssH * dpr);
    canvas!.style.height = `${cssH}px`;
    ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);

    const marginX = cssW * 0.08;
    const marginY = cssH * 0.07;
    originX = marginX;
    originY = marginY;
    cellW = (cssW - 2 * marginX) / 8;
    cellH = (cssH - 2 * marginY) / 9;
    pieceRadius = Math.min(cellW, cellH) * 0.44;
    updateKeyboardGrid();
    render();
  }

  const ro = new ResizeObserver(() => resize());
  ro.observe(canvas);

  /** Maps board (x, y) to screen canvas (pxX, pxY). */
  function boardToCanvas(x: number, y: number): { cx: number; cy: number } {
    const drawX = flipped ? 8 - x : x;
    const drawY = flipped ? y : 9 - y; // By default (not flipped), Red is bottom (y=0 -> drawY=9)
    return {
      cx: originX + drawX * cellW,
      cy: originY + drawY * cellH,
    };
  }

  /** Maps screen canvas (pxX, pxY) to nearest board point (x, y). */
  function canvasToBoard(pxX: number, pxY: number): { x: number; y: number } | null {
    const drawX = Math.round((pxX - originX) / cellW);
    const drawY = Math.round((pxY - originY) / cellH);

    if (drawX < 0 || drawX > 8 || drawY < 0 || drawY > 9) return null;

    const x = flipped ? 8 - drawX : drawX;
    const y = flipped ? drawY : 9 - drawY;

    // Check hit radius
    const { cx, cy } = boardToCanvas(x, y);
    const dist = Math.hypot(pxX - cx, pxY - cy);
    if (dist > pieceRadius * 1.35) return null;

    return { x, y };
  }

  // ---- Drawing Subroutines --------------------------------------------------

  function drawBoard() {
    const W = canvas!.width / Math.min(window.devicePixelRatio || 1, 2);
    const H = canvas!.height / Math.min(window.devicePixelRatio || 1, 2);
    const isDark = isDarkTheme();

    // 1. Rich Woodgrain Board Canvas Background
    const bgGrad = ctx!.createRadialGradient(W / 2, H / 2, 20, W / 2, H / 2, Math.max(W, H) * 0.75);
    if (isDark) {
      bgGrad.addColorStop(0, '#261a13'); // Warm dark rosewood core
      bgGrad.addColorStop(0.55, '#1b120c'); // Rich mahogany
      bgGrad.addColorStop(1, '#0e0906'); // Deep dark lacquer border
    } else {
      bgGrad.addColorStop(0, '#fdf7ec'); // Warm honey beechwood
      bgGrad.addColorStop(0.65, '#f4e4cc'); // Natural warm maple
      bgGrad.addColorStop(1, '#dfc39a'); // Vintage chamfered edge
    }
    ctx!.fillStyle = bgGrad;
    ctx!.fillRect(0, 0, W, H);

    // Outer Board Wood Border & Chamfer
    ctx!.save();
    ctx!.strokeStyle = isDark ? '#4a3422' : '#9e754a';
    ctx!.lineWidth = 3;
    const bx = originX - cellW * 0.45;
    const by = originY - cellH * 0.45;
    const bw = cellW * 8 + cellW * 0.9;
    const bh = cellH * 9 + cellH * 0.9;
    ctx!.strokeRect(bx, by, bw, bh);

    ctx!.strokeStyle = isDark ? 'rgba(212, 175, 55, 0.5)' : 'rgba(184, 149, 110, 0.75)';
    ctx!.lineWidth = 1.2;
    ctx!.strokeRect(bx + 4, by + 4, bw - 8, bh - 8);
    ctx!.restore();

    // 2. Grid Lines
    ctx!.save();
    ctx!.strokeStyle = isDark ? 'rgba(212, 175, 55, 0.88)' : 'rgba(133, 91, 53, 0.9)';
    ctx!.lineWidth = isDark ? 1.35 : 1.4;

    // Horizontal Ranks (10 lines)
    for (let j = 0; j <= 9; j++) {
      const p1 = boardToCanvas(0, j);
      const p2 = boardToCanvas(8, j);
      ctx!.beginPath();
      ctx!.moveTo(p1.cx, p1.cy);
      ctx!.lineTo(p2.cx, p2.cy);
      ctx!.stroke();
    }

    // Vertical Files (9 lines; split across the river except for the two border files 0 & 8)
    for (let i = 0; i <= 8; i++) {
      const p0 = boardToCanvas(i, 0);
      const p4 = boardToCanvas(i, 4);
      const p5 = boardToCanvas(i, 5);
      const p9 = boardToCanvas(i, 9);

      if (i === 0 || i === 8) {
        // Border files continuous across the river
        ctx!.beginPath();
        ctx!.moveTo(p0.cx, p0.cy);
        ctx!.lineTo(p9.cx, p9.cy);
        ctx!.stroke();
      } else {
        // Red half (0 to 4)
        ctx!.beginPath();
        ctx!.moveTo(p0.cx, p0.cy);
        ctx!.lineTo(p4.cx, p4.cy);
        ctx!.stroke();

        // Black half (5 to 9)
        ctx!.beginPath();
        ctx!.moveTo(p5.cx, p5.cy);
        ctx!.lineTo(p9.cx, p9.cy);
        ctx!.stroke();
      }
    }

    // 3. Palace Diagonals (九宮斜線)
    const drawPalaceDiagonals = (yMin: number, yMax: number) => {
      const p1 = boardToCanvas(3, yMin);
      const p2 = boardToCanvas(5, yMax);
      const p3 = boardToCanvas(5, yMin);
      const p4 = boardToCanvas(3, yMax);

      ctx!.beginPath();
      ctx!.moveTo(p1.cx, p1.cy);
      ctx!.lineTo(p2.cx, p2.cy);
      ctx!.moveTo(p3.cx, p3.cy);
      ctx!.lineTo(p4.cx, p4.cy);
      ctx!.stroke();
    };

    drawPalaceDiagonals(0, 2); // Red Palace
    drawPalaceDiagonals(7, 9); // Black Palace

    // 4. Star Point Ticks (十字星位)
    const starPoints = [
      // Cannons
      [1, 2],
      [7, 2],
      [1, 7],
      [7, 7],
      // Soldiers
      [0, 3],
      [2, 3],
      [4, 3],
      [6, 3],
      [8, 3],
      [0, 6],
      [2, 6],
      [4, 6],
      [6, 6],
      [8, 6],
    ];

    for (const [sx, sy] of starPoints) {
      drawStarTick(sx, sy, isDark);
    }

    // 5. River Calligraphy (楚 河 · 漢 界)
    const riverY = originY + 4.5 * cellH;
    const riverLeftX = originX + 2 * cellW;
    const riverRightX = originX + 6 * cellW;

    ctx!.save();
    if (isDark) {
      ctx!.fillStyle = '#f1c40f'; // Polished imperial gold leaf
      ctx!.shadowColor = 'rgba(241, 196, 15, 0.35)';
      ctx!.shadowBlur = 4;
    } else {
      ctx!.fillStyle = '#664322'; // Deep traditional umber
      ctx!.shadowColor = 'transparent';
    }
    ctx!.font = `bold ${Math.round(cellH * 0.44)}px 'Kaiti', 'STKaiti', 'KaiTi_GB2312', 'Songti SC', 'SimSun', serif`;
    ctx!.textAlign = 'center';
    ctx!.textBaseline = 'middle';

    const textLeft = flipped ? '漢 界' : '楚 河';
    const textRight = flipped ? '楚 河' : '漢 界';

    ctx!.fillText(textLeft, riverLeftX, riverY);
    ctx!.fillText(textRight, riverRightX, riverY);
    ctx!.restore();

    ctx!.restore();
  }

  function drawStarTick(x: number, y: number, isDark: boolean) {
    const { cx, cy } = boardToCanvas(x, y);
    const d = cellW * 0.12;
    const len = cellW * 0.22;
    const hasLeft = x > 0;
    const hasRight = x < 8;

    ctx!.save();
    ctx!.strokeStyle = isDark ? 'rgba(212, 175, 55, 0.92)' : 'rgba(133, 91, 53, 0.92)';
    ctx!.lineWidth = 1.25;

    if (hasLeft) {
      // Top-Left
      ctx!.beginPath();
      ctx!.moveTo(cx - d - len, cy - d);
      ctx!.lineTo(cx - d, cy - d);
      ctx!.lineTo(cx - d, cy - d - len);
      ctx!.stroke();
      // Bottom-Left
      ctx!.beginPath();
      ctx!.moveTo(cx - d - len, cy + d);
      ctx!.lineTo(cx - d, cy + d);
      ctx!.lineTo(cx - d, cy + d + len);
      ctx!.stroke();
    }
    if (hasRight) {
      // Top-Right
      ctx!.beginPath();
      ctx!.moveTo(cx + d + len, cy - d);
      ctx!.lineTo(cx + d, cy - d);
      ctx!.lineTo(cx + d, cy - d - len);
      ctx!.stroke();
      // Bottom-Right
      ctx!.beginPath();
      ctx!.moveTo(cx + d + len, cy + d);
      ctx!.lineTo(cx + d, cy + d);
      ctx!.lineTo(cx + d, cy + d + len);
      ctx!.stroke();
    }
    ctx!.restore();
  }

  function drawPiece(piece: Piece) {
    let { cx, cy } = boardToCanvas(piece.x, piece.y);
    if (movingPiece?.id === piece.id) {
      const from = boardToCanvas(movingPiece.fromX, movingPiece.fromY);
      const t = Math.min(1, (performance.now() - movingPiece.started) / 180);
      const eased = 1 - (1 - t) ** 3;
      cx = from.cx + (cx - from.cx) * eased; cy = from.cy + (cy - from.cy) * eased;
    }
    const r = pieceRadius;
    const isRed = piece.side === 'red';
    const isDark = isDarkTheme();
    const isSelected = selectedPiece?.id === piece.id;

    ctx!.save();

    // 1. Drop Shadow
    ctx!.beginPath();
    ctx!.arc(cx + 2, cy + 3.5, r, 0, Math.PI * 2);
    ctx!.fillStyle = isDark ? 'rgba(0, 0, 0, 0.65)' : 'rgba(0, 0, 0, 0.28)';
    ctx!.fill();

    // 2. 3D Cylindrical Wooden Bevel Ring
    const rimGrad = ctx!.createLinearGradient(cx - r, cy - r, cx + r, cy + r);
    if (isRed) {
      rimGrad.addColorStop(0, '#fca5a5');
      rimGrad.addColorStop(0.45, '#dc2626');
      rimGrad.addColorStop(1, isDark ? '#4a0707' : '#7f1d1d');
    } else {
      rimGrad.addColorStop(0, isDark ? '#94a3b8' : '#64748b');
      rimGrad.addColorStop(0.45, isDark ? '#334155' : '#1e293b');
      rimGrad.addColorStop(1, isDark ? '#05070a' : '#020617');
    }
    ctx!.fillStyle = rimGrad;
    ctx!.beginPath();
    ctx!.arc(cx, cy, r, 0, Math.PI * 2);
    ctx!.fill();

    // 3. Inner Lacquer Inset Disc
    const innerGrad = ctx!.createRadialGradient(cx - r * 0.3, cy - r * 0.35, r * 0.1, cx, cy, r * 0.9);
    if (isDark) {
      if (isRed) {
        innerGrad.addColorStop(0, '#35161a');
        innerGrad.addColorStop(1, '#1b0709');
      } else {
        innerGrad.addColorStop(0, '#243042');
        innerGrad.addColorStop(1, '#0f172a');
      }
    } else {
      if (isRed) {
        innerGrad.addColorStop(0, '#fff5f5');
        innerGrad.addColorStop(1, '#fee2e2');
      } else {
        innerGrad.addColorStop(0, '#f8fafc');
        innerGrad.addColorStop(1, '#e2e8f0');
      }
    }
    ctx!.fillStyle = innerGrad;
    ctx!.beginPath();
    ctx!.arc(cx, cy, r * 0.84, 0, Math.PI * 2);
    ctx!.fill();

    // 4. Fine Engraved Inner Border Ring
    ctx!.strokeStyle = isRed
      ? (isDark ? 'rgba(248, 113, 113, 0.75)' : '#ef4444')
      : (isDark ? 'rgba(148, 163, 184, 0.75)' : '#64748b');
    ctx!.lineWidth = 1.1;
    ctx!.beginPath();
    ctx!.arc(cx, cy, r * 0.72, 0, Math.PI * 2);
    ctx!.stroke();

    // 5. Specular Reflection
    ctx!.save();
    ctx!.beginPath();
    ctx!.arc(cx, cy, r * 0.78, Math.PI * 1.1, Math.PI * 1.7);
    ctx!.strokeStyle = isDark ? 'rgba(255, 255, 255, 0.45)' : 'rgba(255, 255, 255, 0.65)';
    ctx!.lineWidth = 1.4;
    ctx!.stroke();
    ctx!.restore();

    // 6. Chinese Calligraphy Character
    const char = CHINESE_PIECE_CHARS[piece.side][piece.kind];
    ctx!.save();
    if (isRed) {
      ctx!.fillStyle = isDark ? '#f87171' : '#dc2626';
      if (isDark) {
        ctx!.shadowColor = 'rgba(239, 68, 68, 0.4)';
        ctx!.shadowBlur = 4;
      }
    } else {
      ctx!.fillStyle = isDark ? '#f8fafc' : '#0f172a';
      if (isDark) {
        ctx!.shadowColor = 'rgba(0, 0, 0, 0.6)';
        ctx!.shadowBlur = 4;
      }
    }
    ctx!.font = `bold ${Math.round(r * 1.12)}px 'Kaiti', 'STKaiti', 'KaiTi_GB2312', 'Songti SC', 'SimSun', serif`;
    ctx!.textAlign = 'center';
    ctx!.textBaseline = 'middle';
    ctx!.fillText(char, cx, cy + 1);
    ctx!.restore();

    // 7. Selection Ring
    if (isSelected) {
      ctx!.save();
      ctx!.strokeStyle = isDark ? '#34d399' : '#10b981';
      ctx!.lineWidth = 2.8;
      if (isDark) {
        ctx!.shadowColor = 'rgba(52, 211, 153, 0.6)';
        ctx!.shadowBlur = 8;
      }
      ctx!.beginPath();
      ctx!.arc(cx, cy, r + 4, 0, Math.PI * 2);
      ctx!.stroke();
      ctx!.restore();
    }

    ctx!.restore();
  }

  function drawOverlays() {
    const isDark = isDarkTheme();

    // 1. Last Move Trajectory Highlight
    if (game.lastMove) {
      const fromP = boardToCanvas(game.lastMove.fromX, game.lastMove.fromY);
      const toP = boardToCanvas(game.lastMove.toX, game.lastMove.toY);

      ctx!.save();
      ctx!.strokeStyle = isDark ? 'rgba(56, 189, 248, 0.85)' : 'rgba(2, 132, 199, 0.8)';
      ctx!.lineWidth = 2.2;
      ctx!.setLineDash([4, 3]);
      ctx!.beginPath();
      ctx!.moveTo(fromP.cx, fromP.cy);
      ctx!.lineTo(toP.cx, toP.cy);
      ctx!.stroke();

      // From ring
      ctx!.beginPath();
      ctx!.arc(fromP.cx, fromP.cy, pieceRadius * 0.5, 0, Math.PI * 2);
      ctx!.stroke();

      // To ring
      ctx!.fillStyle = isDark ? 'rgba(56, 189, 248, 0.25)' : 'rgba(2, 132, 199, 0.15)';
      ctx!.beginPath();
      ctx!.arc(toP.cx, toP.cy, pieceRadius * 1.05, 0, Math.PI * 2);
      ctx!.fill();
      ctx!.stroke();
      ctx!.restore();
    }

    // 2. Legal Move Destination Indicators
    if (selectedPiece && legalMovesForSelected.length > 0) {
      ctx!.save();
      for (const m of legalMovesForSelected) {
        const { cx, cy } = boardToCanvas(m.toX, m.toY);
        if (m.captured) {
          // Capture target: red glowing ring
          ctx!.strokeStyle = isDark ? '#fb7185' : '#ef4444';
          ctx!.lineWidth = 2.6;
          if (isDark) {
            ctx!.shadowColor = 'rgba(251, 113, 133, 0.6)';
            ctx!.shadowBlur = 6;
          }
          ctx!.beginPath();
          ctx!.arc(cx, cy, pieceRadius + 3, 0, Math.PI * 2);
          ctx!.stroke();
        } else {
          // Empty destination: emerald dot
          ctx!.fillStyle = isDark ? 'rgba(52, 211, 153, 0.95)' : '#10b981';
          if (isDark) {
            ctx!.shadowColor = 'rgba(52, 211, 153, 0.5)';
            ctx!.shadowBlur = 5;
          }
          ctx!.beginPath();
          ctx!.arc(cx, cy, cellW * 0.14, 0, Math.PI * 2);
          ctx!.fill();
        }
      }
      ctx!.restore();
    }

    // 3. Hint Suggestion Highlight
    if (suggestedHint) {
      const fromP = boardToCanvas(suggestedHint.fromX, suggestedHint.fromY);
      const toP = boardToCanvas(suggestedHint.toX, suggestedHint.toY);

      ctx!.save();
      ctx!.strokeStyle = isDark ? '#fbbf24' : '#d97706';
      ctx!.lineWidth = 3;
      if (isDark) {
        ctx!.shadowColor = 'rgba(251, 191, 36, 0.6)';
        ctx!.shadowBlur = 8;
      }
      ctx!.beginPath();
      ctx!.arc(fromP.cx, fromP.cy, pieceRadius + 5, 0, Math.PI * 2);
      ctx!.stroke();

      ctx!.fillStyle = isDark ? '#fbbf24' : '#d97706';
      ctx!.beginPath();
      ctx!.arc(toP.cx, toP.cy, cellW * 0.18, 0, Math.PI * 2);
      ctx!.fill();
      ctx!.restore();
    }

    // 4. Check Warning Halo on General
    if (game.isCheck && game.status !== 'checkmate' && game.status !== 'stalemate') {
      for (let x = 3; x <= 5; x++) {
        for (let y = 0; y <= 9; y++) {
          const p = game.board[x][y];
          if (p && p.side === game.turn && p.kind === 'general') {
            const { cx, cy } = boardToCanvas(x, y);
            ctx!.save();
            ctx!.strokeStyle = '#f43f5e';
            ctx!.lineWidth = 3.5;
            ctx!.setLineDash([5, 3]);
            ctx!.shadowColor = 'rgba(244, 63, 94, 0.8)';
            ctx!.shadowBlur = 10;
            ctx!.beginPath();
            ctx!.arc(cx, cy, pieceRadius + 6, 0, Math.PI * 2);
            ctx!.stroke();
            ctx!.restore();
          }
        }
      }
    }
  }

  function render() {
    drawBoard();
    drawDependencies();

    // Draw all active pieces
    for (let x = 0; x < 9; x++) {
      for (let y = 0; y < 10; y++) {
        const piece = game.board[x][y];
        if (piece) drawPiece(piece);
      }
    }

    drawOverlays();
    if (keyboardGrid?.contains(document.activeElement)) {
      const p = boardToCanvas(focusedCell.x, focusedCell.y);
      ctx.save(); ctx.strokeStyle = '#d97706'; ctx.lineWidth = 3; ctx.strokeRect(p.cx - cellW * .45, p.cy - cellH * .45, cellW * .9, cellH * .9); ctx.restore();
    }
  }

  function drawDependencies() {
    if (!selectedPiece) return;
    const piece = selectedPiece;
    const mark = (x: number, y: number, label: string) => {
      if (x < 0 || x > 8 || y < 0 || y > 9) return;
      const from = boardToCanvas(piece.x, piece.y); const to = boardToCanvas(x, y);
      ctx.save(); ctx.strokeStyle = '#d97706'; ctx.lineWidth = 2; ctx.setLineDash([3, 3]);
      ctx.beginPath(); ctx.moveTo(from.cx, from.cy); ctx.lineTo(to.cx, to.cy); ctx.stroke(); ctx.setLineDash([]);
      ctx.strokeRect(to.cx - pieceRadius, to.cy - pieceRadius, pieceRadius * 2, pieceRadius * 2);
      ctx.fillStyle = isDarkTheme() ? '#fcd34d' : '#92400e'; ctx.font = 'bold 10px sans-serif'; ctx.textAlign = 'center'; ctx.fillText(label, to.cx, to.cy - pieceRadius - 4); ctx.restore();
    };
    if (piece.kind === 'horse') {
      for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) if (game.board[piece.x + dx]?.[piece.y + dy]) mark(piece.x + dx, piece.y + dy, 'blocked leg');
    } else if (piece.kind === 'elephant') {
      for (const [dx, dy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) if (game.board[piece.x + dx]?.[piece.y + dy]) mark(piece.x + dx, piece.y + dy, 'blocked eye');
    } else if (piece.kind === 'cannon') {
      for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
        for (let i = 1; i < 10; i++) {
          const x = piece.x + dx * i; const y = piece.y + dy * i;
          if (x < 0 || x > 8 || y < 0 || y > 9) break;
          if (game.board[x][y]) { mark(x, y, 'screen'); break; }
        }
      }
    }
    const red = findGeneral(game.board, 'red'); const black = findGeneral(game.board, 'black');
    if (red && black && red.x === black.x && piece.x === red.x) {
      const from = boardToCanvas(red.x, red.y); const to = boardToCanvas(black.x, black.y);
      ctx.save(); ctx.strokeStyle = '#d97706'; ctx.setLineDash([5, 7]); ctx.beginPath(); ctx.moveTo(from.cx, from.cy); ctx.lineTo(to.cx, to.cy); ctx.stroke(); ctx.restore();
    }
  }

  function updateKeyboardGrid() {
    if (!keyboardGrid) return;
    if (!keyboardGrid.children.length) {
      for (let y = 0; y < 10; y++) {
        const row = document.createElement('div'); row.setAttribute('role', 'row');
        for (let x = 0; x < 9; x++) {
          const button = document.createElement('button'); button.type = 'button'; button.className = 'cc-grid-cell';
          button.setAttribute('role', 'gridcell'); button.dataset.x = String(x); button.dataset.y = String(y); row.append(button);
        }
        keyboardGrid.append(row);
      }
    }
    keyboardGrid.querySelectorAll<HTMLButtonElement>('.cc-grid-cell').forEach((button) => {
      const x = Number(button.dataset.x); const y = Number(button.dataset.y); const point = boardToCanvas(x, y); const piece = game.board[x][y];
      button.tabIndex = focusedCell.x === x && focusedCell.y === y ? 0 : -1;
      button.style.left = `${point.cx - cellW * .45}px`; button.style.top = `${point.cy - cellH * .45}px`; button.style.width = `${cellW * .9}px`; button.style.height = `${cellH * .9}px`;
      button.setAttribute('aria-label', `File ${x + 1}, rank ${y + 1}: ${piece ? `${piece.side} ${piece.kind} ${CHINESE_PIECE_CHARS[piece.side][piece.kind]}` : 'empty'}${legalMovesForSelected.some((m) => m.toX === x && m.toY === y) ? ', legal destination' : ''}`);
      button.setAttribute('aria-selected', String(selectedPiece?.x === x && selectedPiece?.y === y));
      button.setAttribute('aria-disabled', String(isAIThinking || game.status === 'draw'));
    });
  }
  const onGridClick = (event: Event) => {
    const button = (event.target as Element).closest<HTMLElement>('.cc-grid-cell');
    if (button) { focusedCell = { x: Number(button.dataset.x), y: Number(button.dataset.y) }; handlePointClick(focusedCell.x, focusedCell.y); updateKeyboardGrid(); }
  };
  const onGridFocus = (event: FocusEvent) => {
    const button = (event.target as Element).closest<HTMLElement>('.cc-grid-cell');
    if (button) { focusedCell = { x: Number(button.dataset.x), y: Number(button.dataset.y) }; render(); }
  };
  const onGridKey = (event: KeyboardEvent) => {
    if (!/^Arrow|^Home$|^End$/.test(event.key)) return;
    event.preventDefault();
    if (event.key === 'Home') focusedCell.x = flipped ? 8 : 0;
    else if (event.key === 'End') focusedCell.x = flipped ? 0 : 8;
    else {
      focusedCell.x = Math.max(0, Math.min(8, focusedCell.x + (event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0) * (flipped ? -1 : 1)));
      focusedCell.y = Math.max(0, Math.min(9, focusedCell.y + (event.key === 'ArrowUp' ? 1 : event.key === 'ArrowDown' ? -1 : 0) * (flipped ? -1 : 1)));
    }
    updateKeyboardGrid(); keyboardGrid?.querySelector<HTMLButtonElement>('[tabindex="0"]')?.focus({ preventScroll: true }); render();
  };

  // ---- Interaction Handling -------------------------------------------------

  function handlePointClick(x: number, y: number) {
    if (game.status === 'checkmate' || game.status === 'stalemate' || game.status === 'draw' || isAIThinking) return;

    // In PvE mode, human can only play on their turn side
    if (mode === 'pve' && game.turn !== playerSide) return;

    const clickedPiece = game.board[x][y];

    if (selectedPiece) {
      // Check if clicking a legal move destination
      const matchingMove = legalMovesForSelected.find((m) => m.toX === x && m.toY === y);
      if (matchingMove) {
        executeUserMove(matchingMove);
        return;
      }

      // If clicking another friendly piece, reselect
      if (clickedPiece && clickedPiece.side === game.turn) {
        selectPiece(clickedPiece);
        return;
      }

      // Deselect
      selectedPiece = null;
      legalMovesForSelected = [];
      suggestedHint = null;
      render();
      return;
    }

    // Select friendly piece
    if (clickedPiece && clickedPiece.side === game.turn) {
      selectPiece(clickedPiece);
    }
  }

  function selectPiece(piece: Piece) {
    selectedPiece = piece;
    const allLegal = generateLegalMoves(game.board, game.turn);
    legalMovesForSelected = allLegal.filter((m) => m.piece.id === piece.id);
    suggestedHint = null;
    if (soundEnabled) sfx.playSelect();
    render();
    updateKeyboardGrid();
  }

  function executeUserMove(move: Move) {
    cancelSearch();
    selectedPiece = null;
    legalMovesForSelected = [];
    suggestedHint = null;

    if (soundEnabled) {
      if (move.captured) sfx.playCapture();
      else sfx.playMove();
    }

    game = makeMove(game, move);
    animateMove(move);
    updateHud();
    render();

    if (soundEnabled) {
      if (game.status === 'check') sfx.playCheck();
      else if (game.status === 'checkmate' || game.status === 'stalemate') sfx.playVictory();
    }

    // Trigger AI response in PvE mode
    if (mode === 'pve' && game.status !== 'checkmate' && game.status !== 'stalemate') {
      if (game.turn !== playerSide) {
        scheduleAIMove();
      }
    }
  }

  function cancelSearch() {
    revision++; worker?.terminate(); worker = null;
    window.clearTimeout(searchTimer); searchTimer = 0; pendingJob = null; isAIThinking = false;
  }
  function search(kind: 'ai' | 'hint') {
    cancelSearch();
    const legal = generateLegalMoves(game.board, game.turn);
    if (!legal.length) return;
    const job = { id: ++jobId, revision, kind }; pendingJob = job;
    isAIThinking = kind === 'ai'; updateHud();
    const finish = (candidate: Move | null) => {
      if (!root.isConnected || pendingJob?.id !== job.id || revision !== job.revision) return;
      const move = legal.find((m) => m.fromX === candidate?.fromX && m.fromY === candidate.fromY && m.toX === candidate.toX && m.toY === candidate.toY) ?? legal[0];
      cancelSearch();
      if (kind === 'hint') suggestedHint = move;
      else {
        game = makeMove(game, move); animateMove(move);
        if (soundEnabled) { if (move.captured) sfx.playCapture(); else sfx.playMove(); }
      }
      updateHud(); render();
    };
    try {
      worker = new Worker(new URL('../workers/chineseChess.worker.ts', import.meta.url), { type: 'module' });
      worker.onmessage = (event: MessageEvent<{ id: number; revision: number; move: Move | null }>) => {
        if (event.data.id === job.id && event.data.revision === job.revision) finish(event.data.move);
      };
      worker.onerror = () => finish(legal[0]);
      worker.postMessage({ ...job, state: structuredClone(game), difficulty: kind === 'hint' ? 'master' : difficulty });
      searchTimer = window.setTimeout(() => finish(legal[0]), 1650);
    } catch { searchTimer = window.setTimeout(() => finish(legal[0]), 0); }
  }
  function scheduleAIMove() { search('ai'); }
  function animateMove(move: Move) {
    cancelAnimationFrame(motionFrame);
    if (reducedMotion) { movingPiece = null; return; }
    movingPiece = { id: move.piece.id, fromX: move.fromX, fromY: move.fromY, toX: move.toX, toY: move.toY, started: performance.now() };
    const animate = () => { render(); if (movingPiece && performance.now() - movingPiece.started < 180) motionFrame = requestAnimationFrame(animate); else { movingPiece = null; render(); } };
    motionFrame = requestAnimationFrame(animate);
  }

  // Pointer event listener
  const onPointerDown = (e: PointerEvent) => {
    const rect = canvas!.getBoundingClientRect();
    const pxX = e.clientX - rect.left;
    const pxY = e.clientY - rect.top;
    const pt = canvasToBoard(pxX, pxY);
    if (pt) {
      handlePointClick(pt.x, pt.y);
    } else {
      selectedPiece = null;
      legalMovesForSelected = [];
      render();
    }
  };

  canvas.addEventListener('pointerdown', onPointerDown);

  // ---- HUD & State Management -----------------------------------------------

  function updateHud() {
    updateKeyboardGrid();
    if (hintBtn) hintBtn.disabled = Boolean(pendingJob) || game.status === 'draw';
    if (drawBtn) { drawBtn.hidden = mode !== 'pvp'; drawBtn.textContent = drawOffered ? 'Confirm both players agree' : 'Draw by agreement'; drawBtn.disabled = ['draw', 'stalemate', 'checkmate'].includes(game.status); }
    // 1. Status message
    if (statusEl) {
      if (game.status === 'ready' || game.status === 'playing') {
        const turnStr = game.turn === 'red' ? 'Red to move (紅方走棋)' : 'Black to move (黑方走棋)';
        statusEl.textContent = isAIThinking ? 'AI searching · up to 1.5 s · Undo cancels' : turnStr;
      } else if (game.status === 'check') {
        statusEl.textContent = `Check! 將軍！ (${game.turn === 'red' ? 'Red in check' : 'Black in check'})`;
      } else if (game.status === 'checkmate') {
        const winStr = game.winner === 'red' ? 'Red wins by Checkmate! 紅方勝！' : 'Black wins by Checkmate! 黑方勝！';
        statusEl.textContent = winStr;
      } else if (game.status === 'stalemate') {
        const winStr = game.winner === 'red' ? 'Red wins by Stalemate! (黑方困斃，紅勝)' : 'Black wins by Stalemate! (紅方困斃，黑勝)';
        statusEl.textContent = winStr;
      } else if (game.status === 'draw') statusEl.textContent = 'Draw by agreement · 和棋';
      if (game.repetitionCount >= 3 && game.status !== 'draw') statusEl.textContent += ' · Repeated position: consider a draw agreement; tournament chase adjudication is not implemented.';
    }

    // 2. Turn badge
    if (turnEl) {
      turnEl.textContent = game.turn === 'red' ? '紅方 (Red)' : '黑方 (Black)';
      turnEl.dataset.turn = game.turn;
    }

    // 3. Move notation history list
    if (historyListEl) {
      historyListEl.replaceChildren();
      const pairs: { round: number; red?: string; black?: string }[] = [];
      for (let i = 0; i < game.history.length; i++) {
        const round = Math.floor(i / 2) + 1;
        const notation = game.history[i].notation || `Move ${i + 1}`;
        if (i % 2 === 0) {
          pairs.push({ round, red: notation });
        } else {
          pairs[pairs.length - 1].black = notation;
        }
      }

      pairs.forEach((p) => {
        const li = document.createElement('li');
        li.className = 'notation-row';

        const roundSpan = document.createElement('span');
        roundSpan.className = 'notation-round';
        roundSpan.textContent = `${p.round}.`;

        const redSpan = document.createElement('span');
        redSpan.className = 'notation-red';
        redSpan.textContent = p.red || '';

        const blackSpan = document.createElement('span');
        blackSpan.className = 'notation-black';
        blackSpan.textContent = p.black || '';

        li.append(roundSpan, redSpan, blackSpan);
        historyListEl.appendChild(li);
      });
      historyListEl.scrollTop = historyListEl.scrollHeight;
    }

    // 4. Captured Graveyard Racks
    if (capturedRedEl) {
      capturedRedEl.replaceChildren();
      game.capturedRed.forEach((p) => {
        const span = document.createElement('span');
        span.className = 'captured-piece captured-piece--red';
        span.textContent = CHINESE_PIECE_CHARS.red[p.kind];
        capturedRedEl.appendChild(span);
      });
    }

    if (capturedBlackEl) {
      capturedBlackEl.replaceChildren();
      game.capturedBlack.forEach((p) => {
        const span = document.createElement('span');
        span.className = 'captured-piece captured-piece--black';
        span.textContent = CHINESE_PIECE_CHARS.black[p.kind];
        capturedBlackEl.appendChild(span);
      });
    }

    if (undoBtn) {
      undoBtn.disabled = game.history.length === 0;
    }
  }

  // ---- Controls Listeners ----------------------------------------------------

  const onModeChange = () => {
    if (modeSelect) mode = modeSelect.value as GameMode;
    if (diffSelect) diffSelect.disabled = mode !== 'pve';
    if (sideSelect) sideSelect.disabled = mode !== 'pve';
    restartGame();
  };

  const onDiffChange = () => {
    const pendingAI = isAIThinking; cancelSearch();
    if (diffSelect) difficulty = diffSelect.value as AIDifficulty;
    if (pendingAI) scheduleAIMove();
  };

  const onSideChange = () => {
    if (sideSelect) {
      playerSide = sideSelect.value as Side;
      flipped = playerSide === 'black';
      restartGame();
    }
  };

  const onUndo = () => {
    if (game.history.length === 0) return;
    const pendingAI = isAIThinking; cancelSearch();
    cancelAnimationFrame(motionFrame); movingPiece = null;
    // In PvE mode, undo two moves (player and AI) if it's the player's turn
    const undoCount = mode === 'pve' && !pendingAI && game.turn === playerSide && game.history.length >= 2 ? 2 : 1;

    let targetHistory = game.history.slice(0, game.history.length - undoCount);
    let newGame = structuredClone(originGame);
    for (const m of targetHistory) {
      newGame = makeMove(newGame, m);
    }
    game = newGame;
    selectedPiece = null;
    legalMovesForSelected = [];
    suggestedHint = null;
    updateHud();
    render();
  };

  const onHint = () => {
    if (['checkmate', 'stalemate', 'draw'].includes(game.status) || isAIThinking) return;
    search('hint');
  };

  const onFlip = () => {
    flipped = !flipped;
    updateKeyboardGrid();
    render();
  };

  const restartGame = () => {
    cancelSearch(); cancelAnimationFrame(motionFrame); movingPiece = null;
    game = createGame();
    originGame = structuredClone(game); drawOffered = false;
    if (teachingSelect) teachingSelect.value = 'normal';
    selectedPiece = null;
    legalMovesForSelected = [];
    suggestedHint = null;
    isAIThinking = false;
    updateHud();
    render();

    // If PvE and player chose Black, AI starts as Red
    if (mode === 'pve' && playerSide === 'black') {
      scheduleAIMove();
    }
  };

  const onSoundToggle = () => {
    soundEnabled = !soundEnabled;
    try { localStorage.setItem('khc-xiangqi-sound', soundEnabled ? 'on' : 'off'); } catch {}
    if (soundBtn) {
      soundBtn.textContent = soundEnabled ? 'Sound: On' : 'Sound: Off';
      soundBtn.setAttribute('aria-pressed', soundEnabled ? 'true' : 'false');
    }
  };

  const onThemeChange = () => {
    updateHud();
    render();
  };
  const onTeaching = () => {
    if (teachingSelect?.value === 'normal') { restartGame(); return; }
    cancelSearch(); cancelAnimationFrame(motionFrame); movingPiece = null;
    const kind = teachingSelect!.value as TeachingPosition;
    game = createTeachingPosition(kind); originGame = structuredClone(game);
    mode = 'pvp'; if (modeSelect) modeSelect.value = 'pvp'; if (diffSelect) diffSelect.disabled = true; if (sideSelect) sideSelect.disabled = true;
    drawOffered = false; suggestedHint = null;
    const target = kind === 'horse' ? [4, 4] : kind === 'elephant' ? [2, 2] : kind === 'cannon' ? [1, 2] : [4, 4];
    selectedPiece = game.board[target[0]][target[1]]; legalMovesForSelected = generateLegalMoves(game.board, 'red').filter((move) => move.piece.id === selectedPiece?.id);
    if (teachingEl) teachingEl.textContent = ({ horse: 'Blocked horse leg: the soldier immediately ahead prevents the two upward L moves. Other L moves remain legal.', elephant: 'Blocked elephant eye: the diagonal midpoint occupied by the soldier blocks that two-step diagonal. Elephants stay on their side of the river.', cannon: 'Cannon capture: exactly one screen lies between the cannon and the black chariot. Empty movement cannot jump a screen.', generals: 'Flying general: moving the red chariot off this file would expose the two generals. Those sideways moves are illegal.' })[kind];
    updateHud(); render();
  };
  const onDraw = () => {
    if (mode !== 'pvp') return;
    if (drawOffered) { cancelSearch(); game.status = 'draw'; game.winner = null; selectedPiece = null; legalMovesForSelected = []; }
    else drawOffered = true;
    updateHud(); render();
  };

  document.addEventListener('khc:theme-change', onThemeChange);

  let themeObserver: MutationObserver | null = null;
  if (typeof MutationObserver !== 'undefined') {
    themeObserver = new MutationObserver((mutations) => {
      for (const m of mutations) {
        if (m.type === 'attributes' && m.attributeName === 'data-theme') {
          onThemeChange();
        }
      }
    });
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  }

  modeSelect?.addEventListener('change', onModeChange);
  diffSelect?.addEventListener('change', onDiffChange);
  sideSelect?.addEventListener('change', onSideChange);
  undoBtn?.addEventListener('click', onUndo);
  hintBtn?.addEventListener('click', onHint);
  flipBtn?.addEventListener('click', onFlip);
  restartBtn?.addEventListener('click', restartGame);
  soundBtn?.addEventListener('click', onSoundToggle);
  teachingSelect?.addEventListener('change', onTeaching);
  drawBtn?.addEventListener('click', onDraw);
  keyboardGrid?.addEventListener('click', onGridClick);
  keyboardGrid?.addEventListener('keydown', onGridKey);
  keyboardGrid?.addEventListener('focusin', onGridFocus);

  // Initialize
  resize();
  updateHud();

  const win = window as unknown as { __chineseChess?: { state: () => GameState; restart: () => void; destroy: () => void }; __chineseChessInstances?: number };
  win.__chineseChessInstances = (win.__chineseChessInstances ?? 0) + 1;
  let disposed = false;
  function destroy() {
    if (disposed) return; disposed = true;
    cancelSearch(); cancelAnimationFrame(motionFrame); sfx.destroy(); delete root.dataset.ccReady;
    ro.disconnect();
    document.removeEventListener('khc:theme-change', onThemeChange);
    themeObserver?.disconnect();
    canvas.removeEventListener('pointerdown', onPointerDown);
    modeSelect?.removeEventListener('change', onModeChange);
    diffSelect?.removeEventListener('change', onDiffChange);
    sideSelect?.removeEventListener('change', onSideChange);
    undoBtn?.removeEventListener('click', onUndo);
    hintBtn?.removeEventListener('click', onHint);
    flipBtn?.removeEventListener('click', onFlip);
    restartBtn?.removeEventListener('click', restartGame);
    soundBtn?.removeEventListener('click', onSoundToggle);
    teachingSelect?.removeEventListener('change', onTeaching);
    drawBtn?.removeEventListener('click', onDraw);
    keyboardGrid?.removeEventListener('click', onGridClick);
    keyboardGrid?.removeEventListener('keydown', onGridKey);
    keyboardGrid?.removeEventListener('focusin', onGridFocus);
    win.__chineseChessInstances = Math.max(0, (win.__chineseChessInstances ?? 1) - 1); delete win.__chineseChess;
  }
  win.__chineseChess = { state: () => game, restart: restartGame, destroy };
  return destroy;
}
