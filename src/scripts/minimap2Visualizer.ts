/**
 * Minimap2 Minimizer Sampling & Collinear DP Chaining Controller.
 * Pure DOM and SVG node creation.
 */

import {
  runCollinearChaining,
  type Anchor,
  type Minimap2Result,
} from '../lib/minimap2';

export interface Minimap2Controller {
  destroy: () => void;
}

const SVG_NS = 'http://www.w3.org/2000/svg';

export function initMinimap2Visualizer(root: ParentNode = document): Minimap2Controller | null {
  const container = root.querySelector<HTMLElement>('[data-mm-visualizer]');
  if (!container) return null;
  if (container.dataset.mmReady === 'true') return null;
  container.dataset.mmReady = 'true';

  // DOM Elements
  const targetInput = container.querySelector<HTMLInputElement>('[data-mm-target-input]');
  const queryInput = container.querySelector<HTMLInputElement>('[data-mm-query-input]');
  const wSlider = container.querySelector<HTMLInputElement>('[data-mm-w-slider]');
  const kSlider = container.querySelector<HTMLInputElement>('[data-mm-k-slider]');
  const wValDisplay = container.querySelector<HTMLElement>('[data-mm-w-val]');
  const kValDisplay = container.querySelector<HTMLElement>('[data-mm-k-val]');
  const targetRibbonEl = container.querySelector<HTMLElement>('[data-mm-target-ribbon]');
  const queryRibbonEl = container.querySelector<HTMLElement>('[data-mm-query-ribbon]');
  const dotplotSvg = container.querySelector<SVGSVGElement>('[data-mm-dotplot-svg]');
  const calcBox = container.querySelector<HTMLElement>('[data-mm-calc-box]');
  const stepIndicator = container.querySelector<HTMLElement>('[data-mm-step-indicator]');
  const playBtn = container.querySelector<HTMLButtonElement>('[data-mm-play]');
  const prevBtn = container.querySelector<HTMLButtonElement>('[data-mm-prev]');
  const nextBtn = container.querySelector<HTMLButtonElement>('[data-mm-next]');
  const resetBtn = container.querySelector<HTMLButtonElement>('[data-mm-reset]');
  const speedSelect = container.querySelector<HTMLSelectElement>('[data-mm-speed]');
  const presetBtns = container.querySelectorAll<HTMLButtonElement>('[data-mm-preset]');

  // State
  let targetSeq = (targetInput?.value || 'ACGTACGTTTGACGTACGT').trim().toUpperCase();
  let querySeq = (queryInput?.value || 'ACGTACGTGACGTACGT').trim().toUpperCase();
  let w = parseInt(wSlider?.value || '3', 10);
  let k = parseInt(kSlider?.value || '3', 10);
  let result: Minimap2Result = runCollinearChaining(targetSeq, querySeq, w, k);

  let currentStepIdx = -1; // -1: initial (all anchors visible, unchained), 0..steps.length-1
  let isPlaying = false;
  let timerId: number | null = null;
  let speedMs = parseInt(speedSelect?.value || '1200', 10);

  function rebuild() {
    targetSeq = (targetInput?.value || 'ACGTACGTTTGACGTACGT').trim().toUpperCase();
    querySeq = (queryInput?.value || 'ACGTACGTGACGTACGT').trim().toUpperCase();
    w = parseInt(wSlider?.value || '3', 10);
    k = parseInt(kSlider?.value || '3', 10);

    if (wValDisplay) wValDisplay.textContent = String(w);
    if (kValDisplay) kValDisplay.textContent = String(k);

    result = runCollinearChaining(targetSeq, querySeq, w, k);
    currentStepIdx = -1;
    pause();
    renderAll();
  }

  // ------------------------------------------------------------- Renderers --

  function renderRibbons() {
    if (targetRibbonEl) {
      targetRibbonEl.replaceChildren();
      const minimizerPosSet = new Set(result.targetMinimizers.map((m) => m.pos));
      const chainPosSet = new Set<number>();

      if (currentStepIdx >= 0 && result.bestChain) {
        for (const anchor of result.bestChain.anchors) {
          for (let offset = 0; offset < result.k; offset++) {
            chainPosSet.add(anchor.x + offset);
          }
        }
      }

      for (let i = 0; i < result.target.length; i++) {
        const base = result.target[i];
        const cell = document.createElement('div');
        cell.className = 'mm-base-cell';
        if (minimizerPosSet.has(i)) cell.classList.add('mm-base-cell--minimizer');
        if (chainPosSet.has(i)) cell.classList.add('mm-base-cell--chain');

        const letter = document.createElement('span');
        letter.textContent = base;

        const idx = document.createElement('span');
        idx.className = 'mm-idx';
        idx.textContent = String(i);

        cell.append(letter, idx);
        targetRibbonEl.appendChild(cell);
      }
    }

    if (queryRibbonEl) {
      queryRibbonEl.replaceChildren();
      const minimizerPosSet = new Set(result.queryMinimizers.map((m) => m.pos));
      const chainPosSet = new Set<number>();

      if (currentStepIdx >= 0 && result.bestChain) {
        for (const anchor of result.bestChain.anchors) {
          for (let offset = 0; offset < result.k; offset++) {
            chainPosSet.add(anchor.y + offset);
          }
        }
      }

      for (let i = 0; i < result.query.length; i++) {
        const base = result.query[i];
        const cell = document.createElement('div');
        cell.className = 'mm-base-cell';
        if (minimizerPosSet.has(i)) cell.classList.add('mm-base-cell--minimizer');
        if (chainPosSet.has(i)) cell.classList.add('mm-base-cell--chain');

        const letter = document.createElement('span');
        letter.textContent = base;

        const idx = document.createElement('span');
        idx.className = 'mm-idx';
        idx.textContent = String(i);

        cell.append(letter, idx);
        queryRibbonEl.appendChild(cell);
      }
    }
  }

  function renderDotplot() {
    if (!dotplotSvg) return;
    dotplotSvg.replaceChildren();

    const width = 420;
    const height = 420;
    const padding = 36;
    const plotW = width - padding * 2;
    const plotH = height - padding * 2;

    const tLen = Math.max(1, result.target.length);
    const qLen = Math.max(1, result.query.length);

    const scaleX = (x: number) => padding + (x / tLen) * plotW;
    const scaleY = (y: number) => height - padding - (y / qLen) * plotH;

    // Grid border
    const rect = document.createElementNS(SVG_NS, 'rect');
    rect.setAttribute('x', String(padding));
    rect.setAttribute('y', String(padding));
    rect.setAttribute('width', String(plotW));
    rect.setAttribute('height', String(plotH));
    rect.setAttribute('fill', 'var(--color-bg)');
    rect.setAttribute('stroke', 'var(--color-rule)');
    rect.setAttribute('stroke-width', '1.5');
    dotplotSvg.appendChild(rect);

    // Diagonal reference line
    const diag = document.createElementNS(SVG_NS, 'line');
    diag.setAttribute('x1', String(padding));
    diag.setAttribute('y1', String(height - padding));
    diag.setAttribute('x2', String(padding + plotW));
    diag.setAttribute('y2', String(padding));
    diag.setAttribute('stroke', 'color-mix(in srgb, var(--color-rule) 80%, var(--color-muted))');
    diag.setAttribute('stroke-dasharray', '3 3');
    dotplotSvg.appendChild(diag);

    // Axis Labels
    const tLabel = document.createElementNS(SVG_NS, 'text');
    tLabel.setAttribute('x', String(padding + plotW / 2));
    tLabel.setAttribute('y', String(height - 8));
    tLabel.setAttribute('text-anchor', 'middle');
    tLabel.setAttribute('fill', 'var(--color-muted)');
    tLabel.setAttribute('font-size', '12');
    tLabel.setAttribute('font-weight', '600');
    tLabel.textContent = `Target Coordinate (0..${tLen - 1})`;
    dotplotSvg.appendChild(tLabel);

    const qLabel = document.createElementNS(SVG_NS, 'text');
    qLabel.setAttribute('x', '12');
    qLabel.setAttribute('y', String(padding + plotH / 2));
    qLabel.setAttribute('text-anchor', 'middle');
    qLabel.setAttribute('transform', `rotate(-90 12 ${padding + plotH / 2})`);
    qLabel.setAttribute('fill', 'var(--color-muted)');
    qLabel.setAttribute('font-size', '12');
    qLabel.setAttribute('font-weight', '600');
    qLabel.textContent = `Query Coordinate (0..${qLen - 1})`;
    dotplotSvg.appendChild(qLabel);

    // Render DP Chain Edges up to current step
    if (currentStepIdx >= 0) {
      const activeStep = result.steps[Math.min(currentStepIdx, result.steps.length - 1)];
      const isFinished = currentStepIdx === result.steps.length - 1;

      // Draw all established backpointers up to current step
      for (let s = 0; s <= currentStepIdx; s++) {
        const st = result.steps[s];
        if (st.bestPredecessorId !== null) {
          const prevA = result.anchors[st.bestPredecessorId];
          const currA = st.anchor;

          const edge = document.createElementNS(SVG_NS, 'line');
          edge.setAttribute('x1', String(scaleX(prevA.x)));
          edge.setAttribute('y1', String(scaleY(prevA.y)));
          edge.setAttribute('x2', String(scaleX(currA.x)));
          edge.setAttribute('y2', String(scaleY(currA.y)));
          edge.setAttribute('stroke', '#0284c7');
          edge.setAttribute('stroke-width', '2');
          edge.setAttribute('stroke-opacity', '0.6');
          dotplotSvg.appendChild(edge);
        }
      }

      // If finished, highlight the best chain in bold green
      if (isFinished && result.bestChain && result.bestChain.anchors.length > 1) {
        for (let i = 0; i < result.bestChain.anchors.length - 1; i++) {
          const a1 = result.bestChain.anchors[i];
          const a2 = result.bestChain.anchors[i + 1];

          const bestEdge = document.createElementNS(SVG_NS, 'line');
          bestEdge.setAttribute('x1', String(scaleX(a1.x)));
          bestEdge.setAttribute('y1', String(scaleY(a1.y)));
          bestEdge.setAttribute('x2', String(scaleX(a2.x)));
          bestEdge.setAttribute('y2', String(scaleY(a2.y)));
          bestEdge.setAttribute('stroke', '#16a34a');
          bestEdge.setAttribute('stroke-width', '3.5');
          dotplotSvg.appendChild(bestEdge);
        }
      }

      // Highlight active candidates for current step
      if (!isFinished && activeStep) {
        for (const cand of activeStep.candidates) {
          const prevA = cand.predAnchor;
          const currA = activeStep.anchor;

          const testEdge = document.createElementNS(SVG_NS, 'line');
          testEdge.setAttribute('x1', String(scaleX(prevA.x)));
          testEdge.setAttribute('y1', String(scaleY(prevA.y)));
          testEdge.setAttribute('x2', String(scaleX(currA.x)));
          testEdge.setAttribute('y2', String(scaleY(currA.y)));
          testEdge.setAttribute('stroke', '#eab308');
          testEdge.setAttribute('stroke-width', '1.5');
          testEdge.setAttribute('stroke-dasharray', '4 4');
          dotplotSvg.appendChild(testEdge);
        }
      }
    }

    // Render Anchors as dots
    const bestChainAnchorSet = new Set(result.bestChain ? result.bestChain.anchorIds : []);
    const isFinished = currentStepIdx === result.steps.length - 1;

    result.anchors.forEach((anchor: Anchor) => {
      const cx = scaleX(anchor.x);
      const cy = scaleY(anchor.y);
      const isCurrent = currentStepIdx >= 0 && result.steps[currentStepIdx]?.anchorId === anchor.id;
      const isInBestChain = isFinished && bestChainAnchorSet.has(anchor.id);

      const circle = document.createElementNS(SVG_NS, 'circle');
      circle.setAttribute('cx', String(cx));
      circle.setAttribute('cy', String(cy));
      circle.setAttribute('r', isCurrent ? '7.5' : isInBestChain ? '6.5' : '5');

      if (isInBestChain) {
        circle.setAttribute('fill', '#16a34a');
        circle.setAttribute('stroke', '#14532d');
        circle.setAttribute('stroke-width', '2');
      } else if (isCurrent) {
        circle.setAttribute('fill', '#0284c7');
        circle.setAttribute('stroke', '#0369a1');
        circle.setAttribute('stroke-width', '2.5');
      } else {
        circle.setAttribute('fill', 'var(--color-accent)');
        circle.setAttribute('stroke', 'var(--color-surface)');
        circle.setAttribute('stroke-width', '1.5');
      }
      circle.setAttribute('class', 'mm-anchor-dot');

      // Title tooltip
      const title = document.createElementNS(SVG_NS, 'title');
      title.textContent = `Anchor #${anchor.id}: ${anchor.kmer} @ T:${anchor.x}, Q:${anchor.y}`;
      circle.appendChild(title);

      dotplotSvg.appendChild(circle);
    });
  }

  function renderCalcBox() {
    if (!calcBox) return;
    calcBox.replaceChildren();

    if (currentStepIdx < 0) {
      const titleDiv = document.createElement('div');
      titleDiv.className = 'mm-calc-title';

      const titleText = document.createElement('span');
      titleText.textContent = 'Minimizer Indexing Complete';

      const countText = document.createElement('span');
      countText.style.color = 'var(--color-muted)';
      countText.textContent = `Found ${result.anchors.length} matching anchors`;

      titleDiv.append(titleText, countText);

      const summaryDiv = document.createElement('div');
      summaryDiv.className = 'mm-calc-summary';
      summaryDiv.textContent = `Target minimizers: ${result.targetMinimizers.length}, Query minimizers: ${result.queryMinimizers.length}. Ready to run 2D Collinear DP Chaining. Click Step Forward or Play to begin.`;

      calcBox.append(titleDiv, summaryDiv);
      return;
    }

    const step = result.steps[currentStepIdx];
    if (!step) return;

    const titleDiv = document.createElement('div');
    titleDiv.className = 'mm-calc-title';

    const titleText = document.createElement('span');
    titleText.textContent = `Step ${step.stepNumber} of ${result.steps.length}: Anchor #${step.anchorId} (${step.anchor.kmer})`;

    const coordSpan = document.createElement('span');
    coordSpan.textContent = `T:${step.anchor.x}, Q:${step.anchor.y}`;

    titleDiv.append(titleText, coordSpan);

    const formulaDiv = document.createElement('div');
    formulaDiv.className = 'mm-calc-formula';

    const formulaP = document.createElement('div');
    formulaP.textContent = `↳ ${step.formulaText}`;

    formulaDiv.appendChild(formulaP);

    const summaryDiv = document.createElement('div');
    summaryDiv.className = 'mm-calc-summary';

    if (currentStepIdx === result.steps.length - 1) {
      summaryDiv.style.color = 'var(--color-ok, #1f6b40)';
      summaryDiv.style.fontWeight = '700';
      const best = result.bestChain;
      const score = best ? best.score : 0;
      const count = best ? best.anchors.length : 0;
      summaryDiv.textContent = `Chaining Complete! Optimal collinear chain has ${count} anchors with score ${score}.`;
    } else {
      summaryDiv.textContent = `Evaluated ${step.candidates.length} predecessor anchor(s). Best DP score for Anchor #${step.anchorId}: ${step.score}.`;
    }

    calcBox.append(titleDiv, formulaDiv, summaryDiv);
  }

  function renderTransportStatus() {
    const totalSteps = result.steps.length;
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
    renderRibbons();
    renderDotplot();
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

  targetInput?.addEventListener('input', rebuild);
  queryInput?.addEventListener('input', rebuild);
  wSlider?.addEventListener('input', rebuild);
  kSlider?.addEventListener('input', rebuild);

  presetBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      const t = btn.dataset.mmTarget;
      const q = btn.dataset.mmQuery;
      if (t && targetInput) targetInput.value = t;
      if (q && queryInput) queryInput.value = q;
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

  // Initial render
  rebuild();

  return {
    destroy: () => {
      pause();
    },
  };
}
