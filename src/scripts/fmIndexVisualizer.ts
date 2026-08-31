/**
 * FM-Index & BWT Backward Search Interactive Visualizer Controller.
 */

import {
  buildBwt,
  bwtBackwardSearch,
  lfMapping,
  sanitizeReferenceText,
  type BwtIndex,
  type SearchTrace,
} from '../lib/fmIndex';

export interface VisualizerController {
  destroy: () => void;
}

export function initFmIndexVisualizer(root: ParentNode = document): VisualizerController | null {
  const container = root.querySelector<HTMLElement>('[data-fm-visualizer]');
  if (!container) return null;
  if (container.dataset.fmReady === 'true') return null;
  container.dataset.fmReady = 'true';

  // DOM Elements
  const refInput = container.querySelector<HTMLInputElement>('[data-fm-ref-input]');
  const queryInput = container.querySelector<HTMLInputElement>('[data-fm-query-input]');
  const refDisplay = container.querySelector<HTMLElement>('[data-fm-ref-display]');
  const bwtTableBody = container.querySelector<HTMLElement>('[data-fm-bwt-tbody]');
  const cTableEl = container.querySelector<HTMLElement>('[data-fm-c-table]');
  const occTableEl = container.querySelector<HTMLElement>('[data-fm-occ-table]');
  const calcBox = container.querySelector<HTMLElement>('[data-fm-calc-box]');
  const stepIndicator = container.querySelector<HTMLElement>('[data-fm-step-indicator]');
  const playBtn = container.querySelector<HTMLButtonElement>('[data-fm-play]');
  const prevBtn = container.querySelector<HTMLButtonElement>('[data-fm-prev]');
  const nextBtn = container.querySelector<HTMLButtonElement>('[data-fm-next]');
  const resetBtn = container.querySelector<HTMLButtonElement>('[data-fm-reset]');
  const speedSelect = container.querySelector<HTMLSelectElement>('[data-fm-speed]');
  const presetBtns = container.querySelectorAll<HTMLButtonElement>('[data-fm-ref-preset]');
  const queryPresetBtns = container.querySelectorAll<HTMLButtonElement>('[data-fm-query-preset]');

  // State
  let refText = sanitizeReferenceText(refInput?.value || 'BANANA$');
  let queryPattern = (queryInput?.value || 'ANA').trim().toUpperCase();
  let bwtIndex: BwtIndex = buildBwt(refText);
  let searchTrace: SearchTrace = bwtBackwardSearch(bwtIndex, queryPattern);
  let currentStepIdx = -1; // -1: initial full range [0, N-1], 0..n-1: after step i
  let isPlaying = false;
  let timerId: number | null = null;
  let speedMs = parseInt(speedSelect?.value || '1200', 10);

  function rebuildIndexAndTrace(newRef?: string, newQuery?: string) {
    if (newRef !== undefined) {
      refText = sanitizeReferenceText(newRef);
      if (refInput && refInput.value !== refText) refInput.value = refText;
      bwtIndex = buildBwt(refText);
    }
    if (newQuery !== undefined) {
      queryPattern = newQuery.trim().toUpperCase();
      if (queryInput && queryInput.value !== queryPattern) queryInput.value = queryPattern;
    }
    searchTrace = bwtBackwardSearch(bwtIndex, queryPattern);
    currentStepIdx = -1;
    pause();
    renderAll();
  }

  function getCurrentInterval(): [number, number] {
    if (currentStepIdx < 0 || searchTrace.steps.length === 0) {
      return searchTrace.initialInterval;
    }
    const step = searchTrace.steps[Math.min(currentStepIdx, searchTrace.steps.length - 1)];
    return [step.sp, step.ep];
  }

  // ------------------------------------------------------------- Renderers --

  function renderReferenceBanner() {
    if (!refDisplay) return;
    refDisplay.replaceChildren();

    const isStepDone = currentStepIdx >= 0 && currentStepIdx === searchTrace.steps.length - 1;
    const matchedPositions = new Set<number>();
    const patLen = searchTrace.pattern.length;

    if (isStepDone && searchTrace.isFound && patLen > 0) {
      for (const pos of searchTrace.finalPositions) {
        for (let k = 0; k < patLen; k++) {
          matchedPositions.add(pos + k);
        }
      }
    }

    for (let i = 0; i < bwtIndex.length; i++) {
      const char = bwtIndex.text[i];
      const charEl = document.createElement('div');
      charEl.className = matchedPositions.has(i)
        ? 'fm-ref-char fm-ref-char--match'
        : 'fm-ref-char';

      const letterSpan = document.createElement('span');
      letterSpan.textContent = char;

      const idxSpan = document.createElement('span');
      idxSpan.className = 'fm-char-idx';
      idxSpan.textContent = String(i);

      charEl.append(letterSpan, idxSpan);
      refDisplay.appendChild(charEl);
    }
  }

  function renderBwtTable() {
    if (!bwtTableBody) return;
    bwtTableBody.replaceChildren();

    const [sp, ep] = getCurrentInterval();

    bwtIndex.rows.forEach((row) => {
      const tr = document.createElement('tr');
      tr.className = 'fm-row';
      tr.dataset.fmRowIdx = String(row.index);

      const inRange = row.index >= sp && row.index <= ep;
      if (inRange) tr.classList.add('fm-row--in-range');
      if (row.index === sp) tr.classList.add('fm-row--sp');
      if (row.index === ep) tr.classList.add('fm-row--ep');

      const tdIndex = document.createElement('td');
      tdIndex.textContent = String(row.index);

      const tdSa = document.createElement('td');
      const strongSa = document.createElement('strong');
      strongSa.textContent = String(row.sa);
      tdSa.appendChild(strongSa);

      const tdF = document.createElement('td');
      tdF.className = 'fm-col-f';
      tdF.textContent = row.f;

      const tdL = document.createElement('td');
      tdL.className = 'fm-col-l';
      tdL.textContent = row.l;

      const tdSuffix = document.createElement('td');
      tdSuffix.className = 'fm-col-suffix';
      tdSuffix.textContent = row.suffix;

      tr.append(tdIndex, tdSa, tdF, tdL, tdSuffix);

      // Hover / Click for LF mapping demonstration
      tr.addEventListener('mouseenter', () => {
        const targetF = lfMapping(bwtIndex, row.index);
        const allRows = bwtTableBody.querySelectorAll<HTMLElement>('.fm-row');
        allRows.forEach((r) => r.classList.remove('fm-row--lf'));
        if (targetF >= 0 && targetF < allRows.length) {
          allRows[targetF]?.classList.add('fm-row--lf');
        }
      });

      tr.addEventListener('mouseleave', () => {
        const allRows = bwtTableBody.querySelectorAll<HTMLElement>('.fm-row');
        allRows.forEach((r) => r.classList.remove('fm-row--lf'));
      });

      bwtTableBody.appendChild(tr);
    });
  }

  function renderCTable() {
    if (!cTableEl) return;
    cTableEl.replaceChildren();

    const activeChar = currentStepIdx >= 0 && currentStepIdx < searchTrace.steps.length
      ? searchTrace.steps[currentStepIdx].char
      : null;

    bwtIndex.alphabet.forEach((ch) => {
      const cell = document.createElement('div');
      cell.className = ch === activeChar ? 'fm-c-cell fm-c-cell--active' : 'fm-c-cell';

      const charSpan = document.createElement('span');
      charSpan.style.fontWeight = '700';
      charSpan.style.color = 'var(--color-accent)';
      charSpan.textContent = ch === '$' ? '$' : ch;

      const valSpan = document.createElement('span');
      valSpan.textContent = String(bwtIndex.cTable[ch] ?? 0);

      cell.append(charSpan, valSpan);
      cTableEl.appendChild(cell);
    });
  }

  function renderOccMatrix() {
    if (!occTableEl) return;
    occTableEl.replaceChildren();

    const step = currentStepIdx >= 0 && currentStepIdx < searchTrace.steps.length
      ? searchTrace.steps[currentStepIdx]
      : null;

    const activeChar = step?.char;
    const spCol = step?.spPrev;
    const epCol = step ? step.epPrev + 1 : undefined;

    // Table Header
    const thead = document.createElement('thead');
    const headerRow = document.createElement('tr');
    const cornerTh = document.createElement('th');
    cornerTh.textContent = 'c \\ i';
    headerRow.appendChild(cornerTh);

    for (let i = 0; i <= bwtIndex.length; i++) {
      const th = document.createElement('th');
      if (i === spCol) th.className = 'fm-occ-cell--sp';
      if (i === epCol) th.className = 'fm-occ-cell--ep';
      th.textContent = String(i);
      headerRow.appendChild(th);
    }
    thead.appendChild(headerRow);

    // Table Body
    const tbody = document.createElement('tbody');
    bwtIndex.alphabet.forEach((ch) => {
      const tr = document.createElement('tr');
      const rowTh = document.createElement('th');
      rowTh.textContent = ch === '$' ? '$' : ch;
      tr.appendChild(rowTh);

      for (let i = 0; i <= bwtIndex.length; i++) {
        const td = document.createElement('td');
        const val = bwtIndex.occMatrix[ch]?.[i] ?? 0;
        const isSpCell = ch === activeChar && i === spCol;
        const isEpCell = ch === activeChar && i === epCol;
        if (isSpCell) td.className = 'fm-occ-cell--sp';
        else if (isEpCell) td.className = 'fm-occ-cell--ep';
        td.textContent = String(val);
        tr.appendChild(td);
      }
      tbody.appendChild(tr);
    });

    occTableEl.append(thead, tbody);
  }

  function renderCalcBox() {
    if (!calcBox) return;
    calcBox.replaceChildren();

    if (currentStepIdx < 0) {
      const titleDiv = document.createElement('div');
      titleDiv.className = 'fm-calc-title';

      const titleText = document.createElement('span');
      titleText.textContent = 'Initial State (Before Search)';

      const rangeText = document.createElement('span');
      rangeText.style.color = 'var(--color-muted)';
      rangeText.textContent = `Range: [0, ${bwtIndex.length - 1}]`;

      titleDiv.append(titleText, rangeText);

      const summaryDiv = document.createElement('div');
      summaryDiv.className = 'fm-calc-summary';
      summaryDiv.textContent = `Ready to search for "${queryPattern}" from right to left. Click Step Forward or Play to begin the backward search.`;

      calcBox.append(titleDiv, summaryDiv);
      return;
    }

    const step = searchTrace.steps[currentStepIdx];
    if (!step) return;

    const titleDiv = document.createElement('div');
    titleDiv.className = 'fm-calc-title';

    const titleText = document.createElement('span');
    titleText.textContent = `Step ${step.stepNumber} of ${searchTrace.steps.length}: Character '${step.char}'`;

    const intervalSpan = document.createElement('span');
    intervalSpan.textContent = `Interval: [${step.sp}, ${step.ep}]`;

    titleDiv.append(titleText, intervalSpan);

    const formulaDiv = document.createElement('div');
    formulaDiv.className = 'fm-calc-formula';

    const spDiv = document.createElement('div');
    spDiv.className = 'fm-calc-sp';
    spDiv.textContent = `↳ ${step.formulaSpText}`;

    const epDiv = document.createElement('div');
    epDiv.className = 'fm-calc-ep';
    epDiv.textContent = `↳ ${step.formulaEpText}`;

    formulaDiv.append(spDiv, epDiv);

    const summaryDiv = document.createElement('div');
    summaryDiv.className = 'fm-calc-summary';

    if (!step.isMatch) {
      summaryDiv.style.color = 'var(--color-err, #a8341f)';
      summaryDiv.style.fontWeight = '700';
      summaryDiv.textContent = 'No match found (interval empty: sp > ep).';
    } else if (currentStepIdx === searchTrace.steps.length - 1) {
      summaryDiv.style.color = 'var(--color-ok, #1f6b40)';
      summaryDiv.style.fontWeight = '700';
      const locs = step.matchPositions.join(', ');
      summaryDiv.textContent = `Search Complete! Found ${step.matchPositions.length} occurrence(s) at text index: [${locs}].`;
    } else {
      summaryDiv.textContent = `Matching suffix "${step.querySuffix}" in rows [${step.sp}, ${step.ep}] (${step.ep - step.sp + 1} candidates).`;
    }

    calcBox.append(titleDiv, formulaDiv, summaryDiv);
  }

  function renderTransportStatus() {
    const totalSteps = searchTrace.steps.length;
    if (stepIndicator) {
      if (currentStepIdx < 0) {
        stepIndicator.textContent = `Ready (0/${totalSteps})`;
      } else {
        stepIndicator.textContent = `Step ${currentStepIdx + 1}/${totalSteps}`;
      }
    }

    if (prevBtn) prevBtn.disabled = currentStepIdx < 0;
    if (nextBtn) nextBtn.disabled = currentStepIdx >= totalSteps - 1;
    if (playBtn) playBtn.textContent = isPlaying ? 'Pause ⏸' : 'Play ▶';
  }

  function renderAll() {
    renderReferenceBanner();
    renderBwtTable();
    renderCTable();
    renderOccMatrix();
    renderCalcBox();
    renderTransportStatus();
  }

  // ------------------------------------------------------------- Playback ----

  function stepForward() {
    if (currentStepIdx < searchTrace.steps.length - 1) {
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
    renderAll();
  }

  function play() {
    if (isPlaying) return;
    if (currentStepIdx >= searchTrace.steps.length - 1) {
      currentStepIdx = -1;
    }
    isPlaying = true;
    renderTransportStatus();
    stepForward();
    timerId = window.setInterval(() => {
      if (currentStepIdx < searchTrace.steps.length - 1) {
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

  refInput?.addEventListener('input', () => {
    rebuildIndexAndTrace(refInput.value, queryPattern);
  });

  queryInput?.addEventListener('input', () => {
    rebuildIndexAndTrace(refText, queryInput.value);
  });

  presetBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      const preset = btn.dataset.fmRefPreset ?? 'BANANA$';
      rebuildIndexAndTrace(preset, queryPattern);
    });
  });

  queryPresetBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      const preset = btn.dataset.fmQueryPreset ?? 'ANA';
      rebuildIndexAndTrace(refText, preset);
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
  renderAll();

  return {
    destroy: () => {
      pause();
      window.removeEventListener('keydown', handleKeydown);
    },
  };
}
