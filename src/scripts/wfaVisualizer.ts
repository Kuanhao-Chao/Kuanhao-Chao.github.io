/**
 * Wavefront Alignment Algorithm (WFA) Visualizer Controller.
 * Pure DOM and SVG node creation.
 */

import {
  runWfaAlignment,
  type WfaPenalties,
  type WfaResult,
} from '../lib/wfa';

export interface WfaVisualizerController {
  destroy: () => void;
}

export function initWfaVisualizer(root: ParentNode = document): WfaVisualizerController | null {
  const container = root.querySelector<HTMLElement>('[data-wfa-visualizer]');
  if (!container) return null;
  if (container.dataset.wfaReady === 'true') return null;
  container.dataset.wfaReady = 'true';

  // DOM Elements
  const seq1Input = container.querySelector<HTMLInputElement>('[data-wfa-seq1]');
  const seq2Input = container.querySelector<HTMLInputElement>('[data-wfa-seq2]');
  const mismatchInput = container.querySelector<HTMLInputElement>('[data-wfa-mismatch]');
  const gapOpenInput = container.querySelector<HTMLInputElement>('[data-wfa-gap-open]');
  const gapExtendInput = container.querySelector<HTMLInputElement>('[data-wfa-gap-extend]');
  const presetBtns = container.querySelectorAll<HTMLButtonElement>('[data-wfa-preset]');

  const svgCanvas = container.querySelector<SVGSVGElement>('[data-wfa-svg]');
  const calcBox = container.querySelector<HTMLElement>('[data-wfa-calc-box]');
  const seq1Line = container.querySelector<HTMLElement>('[data-wfa-seq1-line]');
  const matchLine = container.querySelector<HTMLElement>('[data-wfa-match-line]');
  const seq2Line = container.querySelector<HTMLElement>('[data-wfa-seq2-line]');
  const scoreVal = container.querySelector<HTMLElement>('[data-wfa-score]');
  const identityVal = container.querySelector<HTMLElement>('[data-wfa-identity]');
  const cellsVal = container.querySelector<HTMLElement>('[data-wfa-cells]');
  const savingsVal = container.querySelector<HTMLElement>('[data-wfa-savings]');

  const playBtn = container.querySelector<HTMLButtonElement>('[data-wfa-play]');
  const prevBtn = container.querySelector<HTMLButtonElement>('[data-wfa-prev]');
  const nextBtn = container.querySelector<HTMLButtonElement>('[data-wfa-next]');
  const resetBtn = container.querySelector<HTMLButtonElement>('[data-wfa-reset]');
  const speedSelect = container.querySelector<HTMLSelectElement>('[data-wfa-speed]');
  const stepIndicator = container.querySelector<HTMLElement>('[data-wfa-step-indicator]');

  // State
  let penalties: WfaPenalties = {
    mismatch: parseInt(mismatchInput?.value || '2', 10),
    gapOpen: parseInt(gapOpenInput?.value || '3', 10),
    gapExtend: parseInt(gapExtendInput?.value || '1', 10),
  };

  let result: WfaResult = runWfaAlignment(
    seq1Input?.value || 'ACGTAGCTA',
    seq2Input?.value || 'ACGTCGCTA',
    penalties,
  );

  let currentStepIdx = -1; // -1: complete, 0..steps.length - 1: animated
  let isPlaying = false;
  let timerId: number | null = null;
  let speedMs = parseInt(speedSelect?.value || '1200', 10);
  let hoveredFrontier: { s: number; k: number; offset: number; lcp: number } | null = null;

  function rebuild() {
    const s1 = (seq1Input?.value || 'ACGTAGCTA').trim().toUpperCase();
    const s2 = (seq2Input?.value || 'ACGTCGCTA').trim().toUpperCase();

    penalties = {
      mismatch: parseInt(mismatchInput?.value || '2', 10),
      gapOpen: parseInt(gapOpenInput?.value || '3', 10),
      gapExtend: parseInt(gapExtendInput?.value || '1', 10),
    };

    result = runWfaAlignment(s1, s2, penalties);
    currentStepIdx = -1;
    hoveredFrontier = null;
    pause();
    renderAll();
  }

  // ------------------------------------------------------------- Renderers --

  function renderAlignmentBanner() {
    if (seq1Line) seq1Line.textContent = result.aligned1;
    if (matchLine) matchLine.textContent = result.matchLine;
    if (seq2Line) seq2Line.textContent = result.aligned2;

    if (scoreVal) scoreVal.textContent = String(result.finalScore);
    if (identityVal) identityVal.textContent = `${result.identity}%`;
    if (cellsVal) cellsVal.textContent = `${result.cellsEvaluated} / ${result.totalDpCells}`;
    if (savingsVal) savingsVal.textContent = `${result.prunedPercentage}%`;
  }

  function renderSvg() {
    if (!svgCanvas) return;
    svgCanvas.replaceChildren();

    const m = result.seq1.length;
    const n = result.seq2.length;
    const pad = 40;
    const width = 500;
    const height = 500;
    const innerW = width - pad * 2;
    const innerH = height - pad * 2;

    svgCanvas.setAttribute('viewBox', `0 0 ${width} ${height}`);

    const svgNS = 'http://www.w3.org/2000/svg';

    function toX(j: number): number {
      return pad + (j / Math.max(1, n)) * innerW;
    }
    function toY(i: number): number {
      return pad + (i / Math.max(1, m)) * innerH;
    }

    // 1. Draw Grid Background
    const bgRect = document.createElementNS(svgNS, 'rect');
    bgRect.setAttribute('x', String(pad));
    bgRect.setAttribute('y', String(pad));
    bgRect.setAttribute('width', String(innerW));
    bgRect.setAttribute('height', String(innerH));
    bgRect.setAttribute('fill', 'none');
    bgRect.setAttribute('stroke', 'var(--color-rule)');
    bgRect.setAttribute('stroke-width', '1.5');
    svgCanvas.appendChild(bgRect);

    // 2. Draw Diagonal Reference Lines
    for (let k = -m; k <= n; k += 2) {
      const line = document.createElementNS(svgNS, 'line');
      let startI = 0;
      let startJ = k;
      if (startJ < 0) {
        startI = -k;
        startJ = 0;
      }
      let endI = m;
      let endJ = m + k;
      if (endJ > n) {
        endI = n - k;
        endJ = n;
      }

      if (startI <= m && startJ <= n && endI >= 0 && endJ >= 0) {
        line.setAttribute('x1', String(toX(startJ)));
        line.setAttribute('y1', String(toY(startI)));
        line.setAttribute('x2', String(toX(endJ)));
        line.setAttribute('y2', String(toY(endI)));
        line.setAttribute('stroke', k === 0 ? 'var(--color-accent)' : 'var(--color-rule)');
        line.setAttribute('stroke-width', k === 0 ? '1.5' : '0.75');
        line.setAttribute('stroke-dasharray', k === 0 ? 'none' : '3 3');
        line.setAttribute('opacity', k === 0 ? '0.6' : '0.4');
        svgCanvas.appendChild(line);
      }
    }

    // 3. Draw Axis Labels (Sequence characters)
    // Seq 2 (Columns, Top)
    for (let j = 0; j < n; j++) {
      const text = document.createElementNS(svgNS, 'text');
      text.setAttribute('x', String(toX(j + 0.5)));
      text.setAttribute('y', String(pad - 12));
      text.setAttribute('text-anchor', 'middle');
      text.setAttribute('font-family', 'var(--font-mono)');
      text.setAttribute('font-size', '11');
      text.setAttribute('font-weight', '700');
      text.setAttribute('fill', 'var(--color-ink)');
      text.textContent = result.seq2[j];
      svgCanvas.appendChild(text);
    }

    // Seq 1 (Rows, Left)
    for (let i = 0; i < m; i++) {
      const text = document.createElementNS(svgNS, 'text');
      text.setAttribute('x', String(pad - 12));
      text.setAttribute('y', String(toY(i + 0.5) + 4));
      text.setAttribute('text-anchor', 'middle');
      text.setAttribute('font-family', 'var(--font-mono)');
      text.setAttribute('font-size', '11');
      text.setAttribute('font-weight', '700');
      text.setAttribute('fill', 'var(--color-ink)');
      text.textContent = result.seq1[i];
      svgCanvas.appendChild(text);
    }

    // 4. Draw Wavefront Expansion Frontiers (W_s)
    const stepLimit = currentStepIdx < 0 ? result.steps.length - 1 : currentStepIdx;

    const waveColors = [
      '#06b6d4', // Cyan (s=0)
      '#3b82f6', // Blue (s=1)
      '#8b5cf6', // Purple (s=2)
      '#ec4899', // Pink (s=3)
      '#f59e0b', // Amber (s=4)
      '#ef4444', // Red (s=5+)
    ];

    for (let st = 0; st <= stepLimit; st++) {
      const step = result.steps[st];
      const color = waveColors[st % waveColors.length];

      // Draw frontier points and LCP rays
      step.frontiers.forEach((f) => {
        const cx = toX(f.j);
        const cy = toY(f.i);

        // LCP extension ray
        if (f.lcpExtended > 0) {
          const ray = document.createElementNS(svgNS, 'line');
          const prevI = f.offset - f.lcpExtended;
          const prevJ = prevI + f.k;
          ray.setAttribute('x1', String(toX(prevJ)));
          ray.setAttribute('y1', String(toY(prevI)));
          ray.setAttribute('x2', String(cx));
          ray.setAttribute('y2', String(cy));
          ray.setAttribute('stroke', color);
          ray.setAttribute('stroke-width', '3');
          ray.setAttribute('stroke-linecap', 'round');
          svgCanvas.appendChild(ray);
        }

        // Frontier node circle
        const circle = document.createElementNS(svgNS, 'circle');
        circle.setAttribute('cx', String(cx));
        circle.setAttribute('cy', String(cy));
        circle.setAttribute('r', st === stepLimit ? '6' : '4');
        circle.setAttribute('fill', color);
        circle.setAttribute('stroke', '#ffffff');
        circle.setAttribute('stroke-width', '1.5');
        circle.style.cursor = 'pointer';

        circle.addEventListener('mouseenter', () => {
          hoveredFrontier = { s: step.score, k: f.k, offset: f.offset, lcp: f.lcpExtended };
          renderCalcBox();
        });

        svgCanvas.appendChild(circle);
      });
    }

    // 5. Draw Optimal Traceback Path (if complete)
    if (currentStepIdx < 0 && result.tracebackPath.length > 0) {
      const pathD = result.tracebackPath
        .map(([ti, tj], idx) => `${idx === 0 ? 'M' : 'L'} ${toX(tj)} ${toY(ti)}`)
        .join(' ');

      const traceLine = document.createElementNS(svgNS, 'path');
      traceLine.setAttribute('d', pathD);
      traceLine.setAttribute('fill', 'none');
      traceLine.setAttribute('stroke', '#16a34a');
      traceLine.setAttribute('stroke-width', '3.5');
      traceLine.setAttribute('stroke-linecap', 'round');
      traceLine.setAttribute('stroke-linejoin', 'round');
      traceLine.setAttribute('opacity', '0.9');
      svgCanvas.appendChild(traceLine);
    }
  }

  function renderCalcBox() {
    if (!calcBox) return;
    calcBox.replaceChildren();

    if (!hoveredFrontier) {
      const titleDiv = document.createElement('div');
      titleDiv.className = 'wfa-calc-title';

      const titleText = document.createElement('span');
      titleText.textContent = `WFA Wavefront State (Score: ${result.finalScore})`;

      const scoreSpan = document.createElement('span');
      scoreSpan.textContent = `Pruned: ${result.prunedPercentage}% cells`;

      titleDiv.append(titleText, scoreSpan);

      const summaryDiv = document.createElement('div');
      summaryDiv.className = 'wfa-calc-summary';
      summaryDiv.textContent = `WFA expands along diagonals k = j - i. Exact character matches extend along the diagonal for FREE via LCP (Longest Common Prefix) steps without spending penalty score.`;

      calcBox.append(titleDiv, summaryDiv);
      return;
    }

    const { s, k, offset, lcp } = hoveredFrontier;
    const titleDiv = document.createElement('div');
    titleDiv.className = 'wfa-calc-title';

    const titleText = document.createElement('span');
    titleText.textContent = `Frontier Node [Score s=${s}, Diagonal k=${k}]`;

    const scoreSpan = document.createElement('span');
    scoreSpan.textContent = `Offset i=${offset}, j=${offset + k}`;

    titleDiv.append(titleText, scoreSpan);

    const formulaDiv = document.createElement('div');
    formulaDiv.className = 'wfa-calc-formula';

    const p1 = document.createElement('div');
    p1.textContent = `↳ Target coordinate: i = ${offset}, Query coordinate: j = ${offset + k}`;

    const p2 = document.createElement('div');
    p2.textContent = `↳ Free LCP Diagonal Extension: +${lcp} matching nucleotide(s)`;

    formulaDiv.append(p1, p2);

    const summaryDiv = document.createElement('div');
    summaryDiv.className = 'wfa-calc-summary';
    summaryDiv.textContent = `Wavefront M_${s}[${k}] reached coordinate (${offset}, ${offset + k}) with zero additional penalty for matching bases.`;

    calcBox.append(titleDiv, formulaDiv, summaryDiv);
  }

  function renderTransportStatus() {
    const totalSteps = result.steps.length;
    if (stepIndicator) {
      if (currentStepIdx < 0) {
        stepIndicator.textContent = `Complete (${totalSteps}/${totalSteps} waves)`;
      } else {
        stepIndicator.textContent = `Wavefront Score s=${result.steps[currentStepIdx]?.score ?? 0} (${currentStepIdx + 1}/${totalSteps})`;
      }
    }

    if (prevBtn) prevBtn.disabled = currentStepIdx < 0;
    if (nextBtn) nextBtn.disabled = currentStepIdx >= totalSteps - 1;
    if (playBtn) playBtn.textContent = isPlaying ? 'Pause ⏸' : 'Play ▶';
  }

  function renderAll() {
    renderAlignmentBanner();
    renderSvg();
    renderCalcBox();
    renderTransportStatus();
  }

  // ------------------------------------------------------------- Playback ----

  function stepForward() {
    if (currentStepIdx < result.steps.length - 1) {
      currentStepIdx++;
      renderAll();
    } else {
      pause();
    }
  }

  function stepBackward() {
    if (currentStepIdx >= 0) {
      currentStepIdx--;
      renderAll();
    }
  }

  function reset() {
    pause();
    currentStepIdx = -1;
    hoveredFrontier = null;
    renderAll();
  }

  function play() {
    if (isPlaying) return;
    if (currentStepIdx >= result.steps.length - 1) {
      currentStepIdx = -1;
    }
    isPlaying = true;
    renderTransportStatus();
    stepForward();
    timerId = window.setInterval(() => {
      if (currentStepIdx < result.steps.length - 1) {
        stepForward();
      } else {
        pause();
      }
    }, speedMs);
  }

  function pause() {
    isPlaying = false;
    if (timerId !== null) {
      window.clearInterval(timerId);
      timerId = null;
    }
    renderTransportStatus();
  }

  // ------------------------------------------------------------- Listeners ---

  seq1Input?.addEventListener('input', rebuild);
  seq2Input?.addEventListener('input', rebuild);
  mismatchInput?.addEventListener('input', rebuild);
  gapOpenInput?.addEventListener('input', rebuild);
  gapExtendInput?.addEventListener('input', rebuild);

  presetBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      const s1 = btn.dataset.wfaS1;
      const s2 = btn.dataset.wfaS2;

      if (s1 && seq1Input) seq1Input.value = s1;
      if (s2 && seq2Input) seq2Input.value = s2;
      rebuild();
    });
  });

  playBtn?.addEventListener('click', () => {
    if (isPlaying) pause();
    else play();
  });

  prevBtn?.addEventListener('click', () => {
    pause();
    stepBackward();
  });

  nextBtn?.addEventListener('click', () => {
    pause();
    stepForward();
  });

  resetBtn?.addEventListener('click', reset);

  speedSelect?.addEventListener('change', () => {
    speedMs = parseInt(speedSelect.value, 10) || 1200;
    if (isPlaying) {
      pause();
      play();
    }
  });

  function handleKeydown(e: KeyboardEvent) {
    const tag = (e.target as HTMLElement)?.tagName?.toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select') return;

    if (e.code === 'Space') {
      e.preventDefault();
      if (isPlaying) pause();
      else play();
    } else if (e.code === 'ArrowRight' || e.key === 'l' || e.key === 'n') {
      e.preventDefault();
      pause();
      stepForward();
    } else if (e.code === 'ArrowLeft' || e.key === 'j' || e.key === 'p') {
      e.preventDefault();
      pause();
      stepBackward();
    } else if (e.key === 'r' || e.key === 'R') {
      e.preventDefault();
      reset();
    }
  }

  window.addEventListener('keydown', handleKeydown);

  // Initial render
  rebuild();

  return {
    destroy: () => {
      pause();
      window.removeEventListener('keydown', handleKeydown);
    },
  };
}
