/**
 * Interactive Pairwise Alignment Sandbox Controller.
 * Pure DOM node creation.
 */

import {
  computePairwiseAlignment,
  type AlignmentMode,
  type AlignmentResult,
  type AlignmentScoring,
  type GapModel,
} from '../lib/pairwiseAlignment';

export interface PairwiseVisualizerController {
  destroy: () => void;
}

export function initPairwiseVisualizer(root: ParentNode = document): PairwiseVisualizerController | null {
  const container = root.querySelector<HTMLElement>('[data-pw-visualizer]');
  if (!container) return null;
  if (container.dataset.pwReady === 'true') return null;
  container.dataset.pwReady = 'true';

  // DOM Elements
  const seq1Input = container.querySelector<HTMLInputElement>('[data-pw-seq1]');
  const seq2Input = container.querySelector<HTMLInputElement>('[data-pw-seq2]');
  const matchInput = container.querySelector<HTMLInputElement>('[data-pw-match]');
  const mismatchInput = container.querySelector<HTMLInputElement>('[data-pw-mismatch]');
  const gapOpenInput = container.querySelector<HTMLInputElement>('[data-pw-gap-open]');
  const gapExtendInput = container.querySelector<HTMLInputElement>('[data-pw-gap-extend]');
  const gapModelSelect = container.querySelector<HTMLSelectElement>('[data-pw-gap-model]');
  const modeBtns = container.querySelectorAll<HTMLButtonElement>('[data-pw-mode]');
  const presetBtns = container.querySelectorAll<HTMLButtonElement>('[data-pw-preset]');

  const matrixTbody = container.querySelector<HTMLElement>('[data-pw-matrix-tbody]');
  const matrixThead = container.querySelector<HTMLElement>('[data-pw-matrix-thead]');
  const calcBox = container.querySelector<HTMLElement>('[data-pw-calc-box]');
  const seq1Line = container.querySelector<HTMLElement>('[data-pw-seq1-line]');
  const matchLine = container.querySelector<HTMLElement>('[data-pw-match-line]');
  const seq2Line = container.querySelector<HTMLElement>('[data-pw-seq2-line]');
  const scoreVal = container.querySelector<HTMLElement>('[data-pw-score]');
  const identityVal = container.querySelector<HTMLElement>('[data-pw-identity]');
  const lengthVal = container.querySelector<HTMLElement>('[data-pw-length]');
  const gapsVal = container.querySelector<HTMLElement>('[data-pw-gaps]');

  const playBtn = container.querySelector<HTMLButtonElement>('[data-pw-play]');
  const prevBtn = container.querySelector<HTMLButtonElement>('[data-pw-prev]');
  const nextBtn = container.querySelector<HTMLButtonElement>('[data-pw-next]');
  const resetBtn = container.querySelector<HTMLButtonElement>('[data-pw-reset]');
  const speedSelect = container.querySelector<HTMLSelectElement>('[data-pw-speed]');
  const stepIndicator = container.querySelector<HTMLElement>('[data-pw-step-indicator]');

  // State
  let mode: AlignmentMode = 'global';
  let gapModel: GapModel = 'linear';
  let scoring: AlignmentScoring = {
    match: parseInt(matchInput?.value || '2', 10),
    mismatch: parseInt(mismatchInput?.value || '-1', 10),
    gapOpen: parseInt(gapOpenInput?.value || '-3', 10),
    gapExtend: parseInt(gapExtendInput?.value || '-1', 10),
  };

  let result: AlignmentResult = computePairwiseAlignment(
    seq1Input?.value || 'ACGTAGCTA',
    seq2Input?.value || 'ACGTCGCTA',
    mode,
    gapModel,
    scoring,
  );

  let currentTraceStepIdx = -1; // -1: show full traceback, 0..tracebackPath.length - 1: animated step
  let isPlaying = false;
  let timerId: number | null = null;
  let speedMs = parseInt(speedSelect?.value || '1200', 10);
  let hoveredCell: { i: number; j: number } | null = null;

  function rebuild() {
    const s1 = (seq1Input?.value || 'ACGTAGCTA').trim().toUpperCase();
    const s2 = (seq2Input?.value || 'ACGTCGCTA').trim().toUpperCase();

    scoring = {
      match: parseInt(matchInput?.value || '2', 10),
      mismatch: parseInt(mismatchInput?.value || '-1', 10),
      gapOpen: parseInt(gapOpenInput?.value || '-3', 10),
      gapExtend: parseInt(gapExtendInput?.value || '-1', 10),
    };

    gapModel = (gapModelSelect?.value as GapModel) || 'linear';

    result = computePairwiseAlignment(s1, s2, mode, gapModel, scoring);
    currentTraceStepIdx = -1;
    hoveredCell = null;
    pause();
    renderAll();
  }

  // ------------------------------------------------------------- Renderers --

  function renderAlignmentBanner() {
    if (seq1Line) seq1Line.textContent = result.aligned1;
    if (matchLine) matchLine.textContent = result.matchLine;
    if (seq2Line) seq2Line.textContent = result.aligned2;

    if (scoreVal) scoreVal.textContent = String(result.score);
    if (identityVal) identityVal.textContent = `${result.identity}%`;
    if (lengthVal) lengthVal.textContent = `${result.length} bp`;
    if (gapsVal) gapsVal.textContent = `${result.gaps}`;
  }

  function renderMatrix() {
    if (!matrixThead || !matrixTbody) return;
    matrixThead.replaceChildren();
    matrixTbody.replaceChildren();

    const m = result.seq1.length;
    const n = result.seq2.length;

    // Header Row 1: Seq2 Letters
    const trLetters = document.createElement('tr');
    const corner1 = document.createElement('th');
    corner1.colSpan = 2;
    corner1.textContent = 'S1 \\ S2';
    trLetters.appendChild(corner1);

    const thEmpty = document.createElement('th');
    thEmpty.textContent = '-';
    trLetters.appendChild(thEmpty);

    for (let j = 0; j < n; j++) {
      const th = document.createElement('th');
      th.textContent = result.seq2[j];
      trLetters.appendChild(th);
    }
    matrixThead.appendChild(trLetters);

    // Set of cells currently active in traceback
    const activeTraceSet = new Set<string>();
    if (currentTraceStepIdx === -1) {
      result.tracebackPath.forEach(([ti, tj]) => activeTraceSet.add(`${ti},${tj}`));
    } else {
      const limit = Math.min(currentTraceStepIdx, result.tracebackPath.length - 1);
      for (let s = 0; s <= limit; s++) {
        const [ti, tj] = result.tracebackPath[s];
        activeTraceSet.add(`${ti},${tj}`);
      }
    }

    // Matrix Body Rows
    for (let i = 0; i <= m; i++) {
      const tr = document.createElement('tr');

      // Seq1 Letter Column Header
      const thSeq1 = document.createElement('th');
      thSeq1.textContent = i === 0 ? '-' : result.seq1[i - 1];

      // Row index
      const thIdx = document.createElement('th');
      thIdx.style.fontSize = '0.7rem';
      thIdx.style.color = 'var(--color-muted)';
      thIdx.textContent = String(i);

      tr.append(thSeq1, thIdx);

      for (let j = 0; j <= n; j++) {
        const cell = result.matrix[i][j];
        const td = document.createElement('td');
        td.className = 'pw-cell';

        const isTrace = activeTraceSet.has(`${i},${j}`);
        if (isTrace) td.classList.add('pw-cell--trace');

        const isHovered = hoveredCell && hoveredCell.i === i && hoveredCell.j === j;
        if (isHovered) td.classList.add('pw-cell--active');

        // Direction arrow indicators
        const dirSpan = document.createElement('span');
        dirSpan.className = 'pw-cell-dir';
        const arrows: string[] = [];
        if (cell.directions.includes('diag')) arrows.push('↖');
        if (cell.directions.includes('up')) arrows.push('↑');
        if (cell.directions.includes('left')) arrows.push('←');
        if (cell.directions.includes('zero')) arrows.push('●');
        dirSpan.textContent = arrows.join('');

        const scoreText = document.createTextNode(String(cell.score));

        td.append(dirSpan, scoreText);

        // Hover inspection listener
        td.addEventListener('mouseenter', () => {
          hoveredCell = { i, j };
          renderCalcBox();
          const allTds = matrixTbody.querySelectorAll<HTMLElement>('.pw-cell');
          allTds.forEach((el) => el.classList.remove('pw-cell--active'));
          td.classList.add('pw-cell--active');
        });

        tr.appendChild(td);
      }

      matrixTbody.appendChild(tr);
    }
  }

  function renderCalcBox() {
    if (!calcBox) return;
    calcBox.replaceChildren();

    const targetCell = hoveredCell
      ? result.matrix[hoveredCell.i]?.[hoveredCell.j]
      : currentTraceStepIdx >= 0 && currentTraceStepIdx < result.tracebackPath.length
      ? result.matrix[result.tracebackPath[currentTraceStepIdx][0]]?.[result.tracebackPath[currentTraceStepIdx][1]]
      : null;

    if (!targetCell) {
      const titleDiv = document.createElement('div');
      titleDiv.className = 'pw-calc-title';

      const titleText = document.createElement('span');
      titleText.textContent = `${mode.toUpperCase()} Alignment Computed`;

      const scoreSpan = document.createElement('span');
      scoreSpan.textContent = `Optimal Score: ${result.score}`;

      titleDiv.append(titleText, scoreSpan);

      const summaryDiv = document.createElement('div');
      summaryDiv.className = 'pw-calc-summary';
      summaryDiv.textContent = `Hover any matrix cell to inspect its dynamic programming recurrence. Click Step Forward or Play to animate the traceback path.`;

      calcBox.append(titleDiv, summaryDiv);
      return;
    }

    const titleDiv = document.createElement('div');
    titleDiv.className = 'pw-calc-title';

    const titleText = document.createElement('span');
    titleText.textContent = `Cell (${targetCell.i}, ${targetCell.j}) [S1: ${targetCell.char1}, S2: ${targetCell.char2}]`;

    const scoreSpan = document.createElement('span');
    scoreSpan.textContent = `Score: ${targetCell.score}`;

    titleDiv.append(titleText, scoreSpan);

    const formulaDiv = document.createElement('div');
    formulaDiv.className = 'pw-calc-formula';

    const p = document.createElement('div');
    p.textContent = `↳ ${targetCell.formulaText}`;

    formulaDiv.appendChild(p);

    const summaryDiv = document.createElement('div');
    summaryDiv.className = 'pw-calc-summary';
    const dirLabels = targetCell.directions.map((d) => {
      if (d === 'diag') return 'Diagonal (↖ substitution/match)';
      if (d === 'up') return 'Up (↑ gap in S2)';
      if (d === 'left') return 'Left (← gap in S1)';
      return 'Zero (● local bound)';
    });
    summaryDiv.textContent = `Optimal choice: ${dirLabels.join(', ')}.`;

    calcBox.append(titleDiv, formulaDiv, summaryDiv);
  }

  function renderTransportStatus() {
    const totalSteps = result.tracebackPath.length;
    if (stepIndicator) {
      if (currentTraceStepIdx < 0) {
        stepIndicator.textContent = `Complete (${totalSteps}/${totalSteps})`;
      } else {
        stepIndicator.textContent = `Trace Step ${currentTraceStepIdx + 1}/${totalSteps}`;
      }
    }

    if (prevBtn) prevBtn.disabled = currentTraceStepIdx < 0;
    if (nextBtn) nextBtn.disabled = currentTraceStepIdx >= totalSteps - 1;
    if (playBtn) playBtn.textContent = isPlaying ? 'Pause ⏸' : 'Play ▶';
  }

  function renderAll() {
    renderAlignmentBanner();
    renderMatrix();
    renderCalcBox();
    renderTransportStatus();
  }

  // ------------------------------------------------------------- Playback ----

  function stepForward() {
    if (currentTraceStepIdx < result.tracebackPath.length - 1) {
      currentTraceStepIdx++;
      renderAll();
    } else {
      pause();
    }
  }

  function stepBackward() {
    if (currentTraceStepIdx >= 0) {
      currentTraceStepIdx--;
      renderAll();
    }
  }

  function reset() {
    pause();
    currentTraceStepIdx = -1;
    hoveredCell = null;
    renderAll();
  }

  function play() {
    if (isPlaying) return;
    if (currentTraceStepIdx >= result.tracebackPath.length - 1) {
      currentTraceStepIdx = -1;
    }
    isPlaying = true;
    renderTransportStatus();
    stepForward();
    timerId = window.setInterval(() => {
      if (currentTraceStepIdx < result.tracebackPath.length - 1) {
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
  matchInput?.addEventListener('input', rebuild);
  mismatchInput?.addEventListener('input', rebuild);
  gapOpenInput?.addEventListener('input', rebuild);
  gapExtendInput?.addEventListener('input', rebuild);
  gapModelSelect?.addEventListener('change', rebuild);

  modeBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      modeBtns.forEach((b) => b.classList.remove('pw-mode-btn--active'));
      btn.classList.add('pw-mode-btn--active');
      mode = (btn.dataset.pwMode as AlignmentMode) || 'global';
      rebuild();
    });
  });

  presetBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      const s1 = btn.dataset.pwS1;
      const s2 = btn.dataset.pwS2;
      const m = btn.dataset.pwMode as AlignmentMode;
      const gm = btn.dataset.pwGapModel as GapModel;

      if (s1 && seq1Input) seq1Input.value = s1;
      if (s2 && seq2Input) seq2Input.value = s2;
      if (m) {
        mode = m;
        modeBtns.forEach((b) => {
          b.classList.toggle('pw-mode-btn--active', b.dataset.pwMode === m);
        });
      }
      if (gm && gapModelSelect) {
        gapModelSelect.value = gm;
        gapModel = gm;
      }
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
