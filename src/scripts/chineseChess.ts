/**
 * Chinese Chess (Xiangqi / 象棋) Canvas Renderer & Interactive Controller
 */

import {
  createGame,
  generateLegalMoves,
  makeMove,
  getAIMove,
  CHINESE_PIECE_CHARS,
  type GameState,
  type Move,
  type Piece,
  type Side,
  type AIDifficulty,
} from '../lib/chineseChess';

export type GameMode = 'pvp' | 'pve';

interface SoundEffects {
  playSelect: () => void;
  playMove: () => void;
  playCapture: () => void;
  playCheck: () => void;
  playVictory: () => void;
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

  return { playSelect, playMove, playCapture, playCheck, playVictory };
}

export function initChineseChess() {
  const root = document.querySelector<HTMLElement>('[data-cc-root]');
  if (!root) return () => {};

  const canvas = root.querySelector<HTMLCanvasElement>('[data-cc-canvas]');
  if (!canvas) return () => {};
  const ctx = canvas.getContext('2d');
  if (!ctx) return () => {};

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

  let game: GameState = createGame();
  let mode: GameMode = (modeSelect?.value as GameMode) || 'pve';
  let difficulty: AIDifficulty = (diffSelect?.value as AIDifficulty) || 'intermediate';
  let playerSide: Side = (sideSelect?.value as Side) || 'red';
  let flipped = false;
  let soundEnabled = true;
  let selectedPiece: Piece | null = null;
  let legalMovesForSelected: Move[] = [];
  let suggestedHint: Move | null = null;
  let isAIThinking = false;

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
    const cssW = Math.max(300, rect.width);
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
    const W = canvas!.width / (window.devicePixelRatio || 1);
    const H = canvas!.height / (window.devicePixelRatio || 1);

    // 1. Rich Woodgrain Board Canvas Background
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    const bgGrad = ctx!.createRadialGradient(W / 2, H / 2, 20, W / 2, H / 2, Math.max(W, H) * 0.7);
    if (isDark) {
      bgGrad.addColorStop(0, '#2d2116');
      bgGrad.addColorStop(0.7, '#20160e');
      bgGrad.addColorStop(1, '#150d08');
    } else {
      bgGrad.addColorStop(0, '#fef6e9');
      bgGrad.addColorStop(0.7, '#f4e4cc');
      bgGrad.addColorStop(1, '#e3cbab');
    }
    ctx!.fillStyle = bgGrad;
    ctx!.fillRect(0, 0, W, H);

    // Outer Board Wood Border & Chamfer
    ctx!.save();
    ctx!.strokeStyle = isDark ? '#5c4028' : '#a27b50';
    ctx!.lineWidth = 3;
    const bx = originX - cellW * 0.45;
    const by = originY - cellH * 0.45;
    const bw = cellW * 8 + cellW * 0.9;
    const bh = cellH * 9 + cellH * 0.9;
    ctx!.strokeRect(bx, by, bw, bh);

    ctx!.lineWidth = 1;
    ctx!.strokeRect(bx + 4, by + 4, bw - 8, bh - 8);
    ctx!.restore();

    // 2. Grid Lines
    ctx!.save();
    ctx!.strokeStyle = isDark ? '#7a5a3a' : '#8c6b45';
    ctx!.lineWidth = 1.4;

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
      drawStarTick(sx, sy);
    }

    // 5. River Calligraphy (楚 河 · 漢 界)
    const riverY = flipped ? originY + 4.5 * cellH : originY + 4.5 * cellH;
    const riverLeftX = originX + 2 * cellW;
    const riverRightX = originX + 6 * cellW;

    ctx!.fillStyle = isDark ? '#b48a60' : '#73502d';
    ctx!.font = `bold ${Math.round(cellH * 0.44)}px 'Kaiti', 'STKaiti', 'KaiTi_GB2312', 'Songti SC', 'SimSun', serif`;
    ctx!.textAlign = 'center';
    ctx!.textBaseline = 'middle';

    const textLeft = flipped ? '漢 界' : '楚 河';
    const textRight = flipped ? '楚 河' : '漢 界';

    ctx!.fillText(textLeft, riverLeftX, riverY);
    ctx!.fillText(textRight, riverRightX, riverY);

    ctx!.restore();
  }

  function drawStarTick(x: number, y: number) {
    const { cx, cy } = boardToCanvas(x, y);
    const d = cellW * 0.12;
    const len = cellW * 0.22;
    const hasLeft = x > 0;
    const hasRight = x < 8;

    ctx!.save();
    ctx!.lineWidth = 1.2;

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
    const { cx, cy } = boardToCanvas(piece.x, piece.y);
    const r = pieceRadius;
    const isRed = piece.side === 'red';
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    const isSelected = selectedPiece?.id === piece.id;

    ctx!.save();

    // 1. Drop Shadow
    ctx!.beginPath();
    ctx!.arc(cx + 2, cy + 3.5, r, 0, Math.PI * 2);
    ctx!.fillStyle = 'rgba(0, 0, 0, 0.32)';
    ctx!.fill();

    // 2. 3D Cylindrical Wooden Bevel Ring
    const rimGrad = ctx!.createLinearGradient(cx - r, cy - r, cx + r, cy + r);
    if (isRed) {
      rimGrad.addColorStop(0, '#fca5a5');
      rimGrad.addColorStop(0.45, '#dc2626');
      rimGrad.addColorStop(1, '#7f1d1d');
    } else {
      rimGrad.addColorStop(0, '#64748b');
      rimGrad.addColorStop(0.45, '#1e293b');
      rimGrad.addColorStop(1, '#020617');
    }
    ctx!.fillStyle = rimGrad;
    ctx!.beginPath();
    ctx!.arc(cx, cy, r, 0, Math.PI * 2);
    ctx!.fill();

    // 3. Inner Lacquer Inset Disc
    const innerGrad = ctx!.createRadialGradient(cx - r * 0.3, cy - r * 0.35, r * 0.1, cx, cy, r * 0.9);
    if (isDark) {
      innerGrad.addColorStop(0, isRed ? '#2d1515' : '#171d29');
      innerGrad.addColorStop(1, isRed ? '#180a0a' : '#090d14');
    } else {
      innerGrad.addColorStop(0, isRed ? '#fef2f2' : '#f8fafc');
      innerGrad.addColorStop(1, isRed ? '#fee2e2' : '#e2e8f0');
    }
    ctx!.fillStyle = innerGrad;
    ctx!.beginPath();
    ctx!.arc(cx, cy, r * 0.84, 0, Math.PI * 2);
    ctx!.fill();

    // 4. Fine Engraved Inner Border Ring
    ctx!.strokeStyle = isRed ? '#ef4444' : '#475569';
    ctx!.lineWidth = 1;
    ctx!.beginPath();
    ctx!.arc(cx, cy, r * 0.72, 0, Math.PI * 2);
    ctx!.stroke();

    // 5. Specular Reflection
    ctx!.save();
    ctx!.beginPath();
    ctx!.arc(cx, cy, r * 0.78, Math.PI * 1.1, Math.PI * 1.7);
    ctx!.strokeStyle = 'rgba(255, 255, 255, 0.55)';
    ctx!.lineWidth = 1.4;
    ctx!.stroke();
    ctx!.restore();

    // 6. Chinese Calligraphy Character
    const char = CHINESE_PIECE_CHARS[piece.side][piece.kind];
    ctx!.fillStyle = isRed ? '#dc2626' : (isDark ? '#f1f5f9' : '#0f172a');
    ctx!.font = `bold ${Math.round(r * 1.1)}px 'Kaiti', 'STKaiti', 'KaiTi_GB2312', 'Songti SC', 'SimSun', serif`;
    ctx!.textAlign = 'center';
    ctx!.textBaseline = 'middle';
    ctx!.fillText(char, cx, cy + 1);

    // 7. Selection Ring
    if (isSelected) {
      ctx!.strokeStyle = '#10b981';
      ctx!.lineWidth = 2.5;
      ctx!.beginPath();
      ctx!.arc(cx, cy, r + 4, 0, Math.PI * 2);
      ctx!.stroke();
    }

    ctx!.restore();
  }

  function drawOverlays() {
    // 1. Last Move Trajectory Highlight
    if (game.lastMove) {
      const fromP = boardToCanvas(game.lastMove.fromX, game.lastMove.fromY);
      const toP = boardToCanvas(game.lastMove.toX, game.lastMove.toY);

      ctx!.save();
      ctx!.strokeStyle = 'rgba(56, 189, 248, 0.75)';
      ctx!.lineWidth = 2;
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
      ctx!.fillStyle = 'rgba(56, 189, 248, 0.2)';
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
          ctx!.strokeStyle = '#ef4444';
          ctx!.lineWidth = 2.5;
          ctx!.beginPath();
          ctx!.arc(cx, cy, pieceRadius + 3, 0, Math.PI * 2);
          ctx!.stroke();
        } else {
          // Empty destination: emerald dot
          ctx!.fillStyle = '#10b981';
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
      ctx!.strokeStyle = '#f59e0b';
      ctx!.lineWidth = 3;
      ctx!.beginPath();
      ctx!.arc(fromP.cx, fromP.cy, pieceRadius + 5, 0, Math.PI * 2);
      ctx!.stroke();

      ctx!.fillStyle = '#f59e0b';
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

    // Draw all active pieces
    for (let x = 0; x < 9; x++) {
      for (let y = 0; y < 10; y++) {
        const piece = game.board[x][y];
        if (piece) drawPiece(piece);
      }
    }

    drawOverlays();
  }

  // ---- Interaction Handling -------------------------------------------------

  function handlePointClick(x: number, y: number) {
    if (game.status === 'checkmate' || game.status === 'stalemate' || isAIThinking) return;

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
  }

  function executeUserMove(move: Move) {
    selectedPiece = null;
    legalMovesForSelected = [];
    suggestedHint = null;

    if (soundEnabled) {
      if (move.captured) sfx.playCapture();
      else sfx.playMove();
    }

    game = makeMove(game, move);
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

  function scheduleAIMove() {
    isAIThinking = true;
    updateHud();

    // Async execution via setTimeout to allow canvas update & avoid UI freezing
    setTimeout(() => {
      if (game.status === 'checkmate' || game.status === 'stalemate') {
        isAIThinking = false;
        return;
      }

      const aiMove = getAIMove(game, difficulty);
      isAIThinking = false;

      if (aiMove) {
        if (soundEnabled) {
          if (aiMove.captured) sfx.playCapture();
          else sfx.playMove();
        }
        game = makeMove(game, aiMove);
        updateHud();
        render();

        if (soundEnabled) {
          if (game.status === 'check') sfx.playCheck();
          else if (game.status === 'checkmate' || game.status === 'stalemate') sfx.playVictory();
        }
      }
    }, 280);
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
    // 1. Status message
    if (statusEl) {
      if (game.status === 'ready' || game.status === 'playing') {
        const turnStr = game.turn === 'red' ? 'Red to move (紅方走棋)' : 'Black to move (黑方走棋)';
        statusEl.textContent = isAIThinking ? 'AI is contemplating...' : turnStr;
      } else if (game.status === 'check') {
        statusEl.textContent = `Check! 將軍！ (${game.turn === 'red' ? 'Red in check' : 'Black in check'})`;
      } else if (game.status === 'checkmate') {
        const winStr = game.winner === 'red' ? 'Red wins by Checkmate! 紅方勝！' : 'Black wins by Checkmate! 黑方勝！';
        statusEl.textContent = winStr;
      } else if (game.status === 'stalemate') {
        const winStr = game.winner === 'red' ? 'Red wins by Stalemate! (黑方困斃，紅勝)' : 'Black wins by Stalemate! (紅方困斃，黑勝)';
        statusEl.textContent = winStr;
      }
    }

    // 2. Turn badge
    if (turnEl) {
      turnEl.textContent = game.turn === 'red' ? '紅方 (Red)' : '黑方 (Black)';
      turnEl.dataset.turn = game.turn;
    }

    // 3. Move notation history list
    if (historyListEl) {
      historyListEl.innerHTML = '';
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
        li.innerHTML = `
          <span class="notation-round">${p.round}.</span>
          <span class="notation-red">${p.red || ''}</span>
          <span class="notation-black">${p.black || ''}</span>
        `;
        historyListEl.appendChild(li);
      });
      historyListEl.scrollTop = historyListEl.scrollHeight;
    }

    // 4. Captured Graveyard Racks
    if (capturedRedEl) {
      capturedRedEl.innerHTML = '';
      game.capturedRed.forEach((p) => {
        const span = document.createElement('span');
        span.className = 'captured-piece captured-piece--red';
        span.textContent = CHINESE_PIECE_CHARS.red[p.kind];
        capturedRedEl.appendChild(span);
      });
    }

    if (capturedBlackEl) {
      capturedBlackEl.innerHTML = '';
      game.capturedBlack.forEach((p) => {
        const span = document.createElement('span');
        span.className = 'captured-piece captured-piece--black';
        span.textContent = CHINESE_PIECE_CHARS.black[p.kind];
        capturedBlackEl.appendChild(span);
      });
    }

    if (undoBtn) {
      undoBtn.disabled = game.history.length === 0 || isAIThinking;
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
    if (diffSelect) difficulty = diffSelect.value as AIDifficulty;
  };

  const onSideChange = () => {
    if (sideSelect) {
      playerSide = sideSelect.value as Side;
      flipped = playerSide === 'black';
      restartGame();
    }
  };

  const onUndo = () => {
    if (game.history.length === 0 || isAIThinking) return;
    // In PvE mode, undo two moves (player and AI) if it's the player's turn
    const undoCount = mode === 'pve' && game.history.length >= 2 ? 2 : 1;

    let targetHistory = game.history.slice(0, game.history.length - undoCount);
    let newGame = createGame();
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
    if (game.status === 'checkmate' || game.status === 'stalemate' || isAIThinking) return;
    const best = getAIMove(game, 'master');
    if (best) {
      suggestedHint = best;
      render();
    }
  };

  const onFlip = () => {
    flipped = !flipped;
    render();
  };

  const restartGame = () => {
    game = createGame();
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
    if (soundBtn) {
      soundBtn.textContent = soundEnabled ? 'Sound: On' : 'Sound: Off';
      soundBtn.setAttribute('aria-pressed', soundEnabled ? 'true' : 'false');
    }
  };

  modeSelect?.addEventListener('change', onModeChange);
  diffSelect?.addEventListener('change', onDiffChange);
  sideSelect?.addEventListener('change', onSideChange);
  undoBtn?.addEventListener('click', onUndo);
  hintBtn?.addEventListener('click', onHint);
  flipBtn?.addEventListener('click', onFlip);
  restartBtn?.addEventListener('click', restartGame);
  soundBtn?.addEventListener('click', onSoundToggle);

  // Initialize
  resize();
  updateHud();

  return () => {
    ro.disconnect();
    canvas.removeEventListener('pointerdown', onPointerDown);
    modeSelect?.removeEventListener('change', onModeChange);
    diffSelect?.removeEventListener('change', onDiffChange);
    sideSelect?.removeEventListener('change', onSideChange);
    undoBtn?.removeEventListener('click', onUndo);
    hintBtn?.removeEventListener('click', onHint);
    flipBtn?.removeEventListener('click', onFlip);
    restartBtn?.removeEventListener('click', restartGame);
    soundBtn?.removeEventListener('click', onSoundToggle);
  };
}
