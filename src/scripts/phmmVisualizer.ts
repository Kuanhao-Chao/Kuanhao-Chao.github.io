/**
 * Profile Hidden Markov Models (pHMMs) Client Visualizer Controller.
 * Pure DOM and SVG node creation.
 */

import {
  createPlan7ModelFromMSA,
  runViterbi,
  runForwardBackward,
  DNA_ALPHABET,
  PROTEIN_ALPHABET,
  type Plan7Model,
  type ViterbiResult,
  type ForwardBackwardResult,
} from '../lib/phmm';

export interface PhmmVisualizerController {
  destroy: () => void;
}

export function initPhmmVisualizer(root: ParentNode = document): PhmmVisualizerController | null {
  const container = root.querySelector<HTMLElement>('[data-phmm-visualizer]');
  if (!container) return null;
  if (container.dataset.phmmReady === 'true') return null;
  container.dataset.phmmReady = 'true';

  // DOM Elements
  const queryInput = container.querySelector<HTMLInputElement>('[data-phmm-query]');
  const presetBtns = container.querySelectorAll<HTMLButtonElement>('[data-phmm-preset]');

  const modeViterbiBtn = container.querySelector<HTMLButtonElement>('[data-phmm-mode-viterbi]');
  const modeFbBtn = container.querySelector<HTMLButtonElement>('[data-phmm-mode-fb]');

  const svgCanvas = container.querySelector<SVGSVGElement>('[data-phmm-svg]');
  const matrixWrap = container.querySelector<HTMLElement>('[data-phmm-matrix-wrap]');
  const calcBox = container.querySelector<HTMLElement>('[data-phmm-calc-box]');
  const pathViewer = container.querySelector<HTMLElement>('[data-phmm-path-viewer]');

  const scoreVal = container.querySelector<HTMLElement>('[data-phmm-score]');
  const lengthVal = container.querySelector<HTMLElement>('[data-phmm-length]');
  const kVal = container.querySelector<HTMLElement>('[data-phmm-k]');
  const modeStatusVal = container.querySelector<HTMLElement>('[data-phmm-mode-status]');

  const playBtn = container.querySelector<HTMLButtonElement>('[data-phmm-play]');
  const prevBtn = container.querySelector<HTMLButtonElement>('[data-phmm-prev]');
  const nextBtn = container.querySelector<HTMLButtonElement>('[data-phmm-next]');
  const resetBtn = container.querySelector<HTMLButtonElement>('[data-phmm-reset]');
  const speedSelect = container.querySelector<HTMLSelectElement>('[data-phmm-speed]');
  const stepIndicator = container.querySelector<HTMLElement>('[data-phmm-step-indicator]');

  // Presets Data
  const PRESET_MODELS: Record<string, { msa: string[]; isDna: boolean; defaultQuery: string }> = {
    tata: {
      msa: ['TATAAA', 'TATAAG', 'TATATA', 'TATAAA'],
      isDna: true,
      defaultQuery: 'TATAAA',
    },
    zinc: {
      msa: ['CAKCGKTFS', 'CPKCGKSFS', 'CAECGKSFS', 'CPRCGKTFA'],
      isDna: false,
      defaultQuery: 'CAKCGKTFS',
    },
    kinase: {
      msa: ['GLGSFGKV', 'GLGTFGKV', 'GVGGFGKV', 'GLGGFGKV'],
      isDna: false,
      defaultQuery: 'GLGSFGKV',
    },
    indel: {
      msa: ['TATAAA', 'TATAAG', 'TATATA', 'TATAAA'],
      isDna: true,
      defaultQuery: 'TAATAAA', // 1 insert
    },
  };

  // State
  let activeModel: Plan7Model = createPlan7ModelFromMSA(
    PRESET_MODELS.tata.msa,
    'TATA_Box',
    DNA_ALPHABET,
  );
  let currentQuery = queryInput?.value || 'TATAAA';
  let viewMode: 'viterbi' | 'fb' = 'viterbi';

  let viterbiRes: ViterbiResult = runViterbi(activeModel, currentQuery);
  let fbRes: ForwardBackwardResult = runForwardBackward(activeModel, currentQuery);

  let currentStepIdx = -1;
  let isPlaying = false;
  let timerId: number | null = null;
  let speedMs = parseInt(speedSelect?.value || '1200', 10);
  let hoveredItem: { label: string; desc: string } | null = null;

  function rebuild() {
    currentQuery = (queryInput?.value || 'TATAAA').toUpperCase().replace(/[^A-Z]/g, '');
    viterbiRes = runViterbi(activeModel, currentQuery);
    fbRes = runForwardBackward(activeModel, currentQuery);
    currentStepIdx = -1;
    hoveredItem = null;
    pause();
    renderAll();
  }

  function loadPreset(presetKey: string) {
    const p = PRESET_MODELS[presetKey];
    if (!p) return;
    activeModel = createPlan7ModelFromMSA(
      p.msa,
      presetKey,
      p.isDna ? DNA_ALPHABET : PROTEIN_ALPHABET,
    );
    if (queryInput) queryInput.value = p.defaultQuery;
    rebuild();
  }

  // ------------------------------------------------------------- Renderers --

  function renderScoreBanner() {
    if (kVal) kVal.textContent = String(activeModel.K);
    if (lengthVal) lengthVal.textContent = `${currentQuery.length} aa/nt`;

    if (scoreVal) {
      if (viewMode === 'viterbi') {
        scoreVal.textContent = `${viterbiRes.logScore.toFixed(2)} (log-odds)`;
      } else {
        scoreVal.textContent = `${fbRes.logLikelihood.toFixed(2)} (log-lik)`;
      }
    }

    if (modeStatusVal) {
      modeStatusVal.textContent = viewMode === 'viterbi' ? 'Viterbi Path' : 'Posterior Matrix';
    }

    if (!pathViewer) return;
    pathViewer.replaceChildren();

    viterbiRes.viterbiPath.forEach((step, idx) => {
      const pill = document.createElement('div');
      pill.className = 'phmm-path-pill';

      const isActive = currentStepIdx >= 0 && idx === currentStepIdx;
      if (isActive) pill.classList.add('phmm-path-pill--active');

      const charSpan = document.createElement('span');
      charSpan.className = 'phmm-path-pill-char';
      charSpan.textContent = step.char;

      const stateSpan = document.createElement('span');
      stateSpan.className = 'phmm-path-pill-state';
      stateSpan.textContent = `${step.stateType}${step.k > 0 ? step.k : ''}`;

      pill.append(charSpan, stateSpan);
      pathViewer.appendChild(pill);
    });
  }

  function renderSvg() {
    if (!svgCanvas) return;
    svgCanvas.replaceChildren();

    const width = 620;
    const height = 360;
    const K = activeModel.K;
    svgCanvas.setAttribute('viewBox', `0 0 ${width} ${height}`);
    const svgNS = 'http://www.w3.org/2000/svg';

    // X positions for columns k = 0 (Begin), 1..K (Nodes), K+1 (End)
    const colPad = 40;
    const colWidth = (width - colPad * 2) / (K + 1);

    const getX = (k: number) => colPad + k * colWidth;
    const yM = 180; // Match row
    const yI = 80;  // Insert row
    const yD = 280; // Delete row

    // Markers in Defs
    const defs = document.createElementNS(svgNS, 'defs');

    const marker = document.createElementNS(svgNS, 'marker');
    marker.setAttribute('id', 'phmm-arrow');
    marker.setAttribute('viewBox', '0 0 10 10');
    marker.setAttribute('refX', '14');
    marker.setAttribute('refY', '5');
    marker.setAttribute('markerWidth', '5');
    marker.setAttribute('markerHeight', '5');
    marker.setAttribute('orient', 'auto-start-reverse');
    const arrowPath = document.createElementNS(svgNS, 'path');
    arrowPath.setAttribute('d', 'M 0 0 L 10 5 L 0 10 z');
    arrowPath.setAttribute('fill', 'var(--color-muted)');
    arrowPath.setAttribute('opacity', '0.6');
    marker.appendChild(arrowPath);
    defs.appendChild(marker);

    const markerActive = document.createElementNS(svgNS, 'marker');
    markerActive.setAttribute('id', 'phmm-arrow-active');
    markerActive.setAttribute('viewBox', '0 0 10 10');
    markerActive.setAttribute('refX', '14');
    markerActive.setAttribute('refY', '5');
    markerActive.setAttribute('markerWidth', '6');
    markerActive.setAttribute('markerHeight', '6');
    markerActive.setAttribute('orient', 'auto-start-reverse');
    const arrowActPath = document.createElementNS(svgNS, 'path');
    arrowActPath.setAttribute('d', 'M 0 0 L 10 5 L 0 10 z');
    arrowActPath.setAttribute('fill', '#16a34a');
    markerActive.appendChild(arrowActPath);
    defs.appendChild(markerActive);

    svgCanvas.appendChild(defs);

    // Active Path Set
    const activePathStates = new Set<string>();
    viterbiRes.viterbiPath.forEach((p, idx) => {
      if (currentStepIdx < 0 || idx <= currentStepIdx) {
        activePathStates.add(`${p.stateType}_${p.k}`);
      }
    });

    // 1. Draw Transitions (M->M, M->I, M->D, I->M, I->I, D->M, D->D)
    for (let k = 0; k <= K; k++) {
      const x1 = getX(k);
      const x2 = getX(k + 1);

      // M_k -> M_{k+1}
      const pMM = document.createElementNS(svgNS, 'line');
      pMM.setAttribute('x1', String(x1 + 14));
      pMM.setAttribute('y1', String(yM));
      pMM.setAttribute('x2', String(x2 - 14));
      pMM.setAttribute('y2', String(yM));
      pMM.setAttribute('stroke', 'var(--color-rule)');
      pMM.setAttribute('stroke-width', '1.5');
      pMM.setAttribute('marker-end', 'url(#phmm-arrow)');
      svgCanvas.appendChild(pMM);

      if (k >= 1 && k <= K) {
        // M_k -> I_k
        const pMI = document.createElementNS(svgNS, 'line');
        pMI.setAttribute('x1', String(x1));
        pMI.setAttribute('y1', String(yM - 14));
        pMI.setAttribute('x2', String(x1));
        pMI.setAttribute('y2', String(yI + 14));
        pMI.setAttribute('stroke', 'var(--color-rule)');
        pMI.setAttribute('stroke-width', '1.2');
        pMI.setAttribute('marker-end', 'url(#phmm-arrow)');
        svgCanvas.appendChild(pMI);

        // I_k -> M_{k+1}
        const pIM = document.createElementNS(svgNS, 'line');
        pIM.setAttribute('x1', String(x1 + 10));
        pIM.setAttribute('y1', String(yI + 10));
        pIM.setAttribute('x2', String(x2 - 14));
        pIM.setAttribute('y2', String(yM - 10));
        pIM.setAttribute('stroke', 'var(--color-rule)');
        pIM.setAttribute('stroke-width', '1.2');
        pIM.setAttribute('marker-end', 'url(#phmm-arrow)');
        svgCanvas.appendChild(pIM);

        // M_{k-1} -> D_k
        const pMD = document.createElementNS(svgNS, 'line');
        pMD.setAttribute('x1', String(x1 - 10));
        pMD.setAttribute('y1', String(yM + 10));
        pMD.setAttribute('x2', String(x1));
        pMD.setAttribute('y2', String(yD - 14));
        pMD.setAttribute('stroke', 'var(--color-rule)');
        pMD.setAttribute('stroke-width', '1.2');
        pMD.setAttribute('marker-end', 'url(#phmm-arrow)');
        svgCanvas.appendChild(pMD);

        // D_k -> M_{k+1}
        const pDM = document.createElementNS(svgNS, 'line');
        pDM.setAttribute('x1', String(x1 + 10));
        pDM.setAttribute('y1', String(yD - 10));
        pDM.setAttribute('x2', String(x2 - 14));
        pDM.setAttribute('y2', String(yM + 10));
        pDM.setAttribute('stroke', 'var(--color-rule)');
        pDM.setAttribute('stroke-width', '1.2');
        pDM.setAttribute('marker-end', 'url(#phmm-arrow)');
        svgCanvas.appendChild(pDM);
      }
    }

    // 2. Draw State Nodes
    // Begin State B (k=0)
    const gBegin = document.createElementNS(svgNS, 'g');
    const bCircle = document.createElementNS(svgNS, 'circle');
    bCircle.setAttribute('cx', String(getX(0)));
    bCircle.setAttribute('cy', String(yM));
    bCircle.setAttribute('r', '14');
    bCircle.setAttribute('fill', 'var(--color-surface)');
    bCircle.setAttribute('stroke', 'var(--color-accent)');
    bCircle.setAttribute('stroke-width', '2');
    const bText = document.createElementNS(svgNS, 'text');
    bText.setAttribute('x', String(getX(0)));
    bText.setAttribute('y', String(yM + 4));
    bText.setAttribute('text-anchor', 'middle');
    bText.setAttribute('font-family', 'var(--font-mono)');
    bText.setAttribute('font-size', '10');
    bText.setAttribute('font-weight', '700');
    bText.setAttribute('fill', 'var(--color-accent)');
    bText.textContent = 'B';
    gBegin.append(bCircle, bText);
    svgCanvas.appendChild(gBegin);

    // End State E (k=K+1)
    const gEnd = document.createElementNS(svgNS, 'g');
    const eCircle = document.createElementNS(svgNS, 'circle');
    eCircle.setAttribute('cx', String(getX(K + 1)));
    eCircle.setAttribute('cy', String(yM));
    eCircle.setAttribute('r', '14');
    eCircle.setAttribute('fill', 'var(--color-surface)');
    eCircle.setAttribute('stroke', 'var(--color-accent)');
    eCircle.setAttribute('stroke-width', '2');
    const eText = document.createElementNS(svgNS, 'text');
    eText.setAttribute('x', String(getX(K + 1)));
    eText.setAttribute('y', String(yM + 4));
    eText.setAttribute('text-anchor', 'middle');
    eText.setAttribute('font-family', 'var(--font-mono)');
    eText.setAttribute('font-size', '10');
    eText.setAttribute('font-weight', '700');
    eText.setAttribute('fill', 'var(--color-accent)');
    eText.textContent = 'E';
    gEnd.append(eCircle, eText);
    svgCanvas.appendChild(gEnd);

    // Model Columns k = 1..K
    for (let k = 1; k <= K; k++) {
      const x = getX(k);

      // Match State M_k (Rectangle)
      const isMActive = activePathStates.has(`M_${k}`);
      const gM = document.createElementNS(svgNS, 'g');
      gM.style.cursor = 'pointer';

      const rectM = document.createElementNS(svgNS, 'rect');
      rectM.setAttribute('x', String(x - 14));
      rectM.setAttribute('y', String(yM - 14));
      rectM.setAttribute('width', '28');
      rectM.setAttribute('height', '28');
      rectM.setAttribute('rx', '6');
      rectM.setAttribute('fill', isMActive ? '#bbf7d0' : 'var(--color-surface)');
      rectM.setAttribute('stroke', isMActive ? '#16a34a' : 'var(--color-rule)');
      rectM.setAttribute('stroke-width', isMActive ? '2.5' : '1.5');

      const textM = document.createElementNS(svgNS, 'text');
      textM.setAttribute('x', String(x));
      textM.setAttribute('y', String(yM + 4));
      textM.setAttribute('text-anchor', 'middle');
      textM.setAttribute('font-family', 'var(--font-mono)');
      textM.setAttribute('font-size', '10');
      textM.setAttribute('font-weight', '700');
      textM.setAttribute('fill', isMActive ? '#14532d' : 'var(--color-ink)');
      textM.textContent = `M${k}`;

      gM.append(rectM, textM);
      gM.addEventListener('mouseenter', () => {
        const topEm = Object.entries(activeModel.matchEmissions[k] || {})
          .sort((a, b) => b[1] - a[1])
          .slice(0, 3)
          .map(([a, p]) => `${a}:${(p * 100).toFixed(0)}%`)
          .join(', ');
        hoveredItem = {
          label: `Match State M_${k}`,
          desc: `Position-specific consensus state. Top emissions: ${topEm}. Transition t(M→M)=${activeModel.transitions.MM[k]}.`,
        };
        renderCalcBox();
      });
      svgCanvas.appendChild(gM);

      // Insert State I_k (Diamond)
      const isIActive = activePathStates.has(`I_${k}`);
      const gI = document.createElementNS(svgNS, 'g');
      gI.style.cursor = 'pointer';

      const polyI = document.createElementNS(svgNS, 'polygon');
      polyI.setAttribute('points', `${x},${yI - 12} ${x + 12},${yI} ${x},${yI + 12} ${x - 12},${yI}`);
      polyI.setAttribute('fill', isIActive ? '#fed7aa' : 'var(--color-surface)');
      polyI.setAttribute('stroke', isIActive ? '#ea580c' : 'var(--color-rule)');
      polyI.setAttribute('stroke-width', isIActive ? '2.5' : '1.5');

      const textI = document.createElementNS(svgNS, 'text');
      textI.setAttribute('x', String(x));
      textI.setAttribute('y', String(yI + 3));
      textI.setAttribute('text-anchor', 'middle');
      textI.setAttribute('font-family', 'var(--font-mono)');
      textI.setAttribute('font-size', '9');
      textI.setAttribute('font-weight', '700');
      textI.setAttribute('fill', isIActive ? '#7c2d12' : 'var(--color-muted)');
      textI.textContent = `I${k}`;

      gI.append(polyI, textI);
      gI.addEventListener('mouseenter', () => {
        hoveredItem = {
          label: `Insert State I_${k}`,
          desc: `Models insertions between position ${k} and ${k + 1}. Emits background residues. Self-loop t(I→I)=${activeModel.transitions.II[k]}.`,
        };
        renderCalcBox();
      });
      svgCanvas.appendChild(gI);

      // Delete State D_k (Circle)
      const isDActive = activePathStates.has(`D_${k}`);
      const gD = document.createElementNS(svgNS, 'g');
      gD.style.cursor = 'pointer';

      const circleD = document.createElementNS(svgNS, 'circle');
      circleD.setAttribute('cx', String(x));
      circleD.setAttribute('cy', String(yD));
      circleD.setAttribute('r', '12');
      circleD.setAttribute('fill', isDActive ? '#fecdd3' : 'var(--color-surface)');
      circleD.setAttribute('stroke', isDActive ? '#e11d48' : 'var(--color-rule)');
      circleD.setAttribute('stroke-width', isDActive ? '2.5' : '1.5');

      const textD = document.createElementNS(svgNS, 'text');
      textD.setAttribute('x', String(x));
      textD.setAttribute('y', String(yD + 3));
      textD.setAttribute('text-anchor', 'middle');
      textD.setAttribute('font-family', 'var(--font-mono)');
      textD.setAttribute('font-size', '9');
      textD.setAttribute('font-weight', '700');
      textD.setAttribute('fill', isDActive ? '#881337' : 'var(--color-muted)');
      textD.textContent = `D${k}`;

      gD.append(circleD, textD);
      gD.addEventListener('mouseenter', () => {
        hoveredItem = {
          label: `Delete State D_${k}`,
          desc: `Silent (non-emitting) state modeling deletion of consensus position ${k}. Transition t(D→M)=${activeModel.transitions.DM[k]}.`,
        };
        renderCalcBox();
      });
      svgCanvas.appendChild(gD);
    }
  }

  function renderMatrixHeatmap() {
    if (!matrixWrap) return;
    matrixWrap.replaceChildren();

    const table = document.createElement('table');
    table.className = 'phmm-matrix-table';

    const thead = document.createElement('thead');
    const headerRow = document.createElement('tr');

    const thCorner = document.createElement('th');
    thCorner.textContent = 'i \\ k';
    headerRow.appendChild(thCorner);

    for (let k = 0; k <= activeModel.K; k++) {
      const th = document.createElement('th');
      th.textContent = k === 0 ? 'B' : `M${k}`;
      headerRow.appendChild(th);
    }
    thead.appendChild(headerRow);
    table.appendChild(thead);

    const tbody = document.createElement('tbody');

    const N = currentQuery.length;
    const K = activeModel.K;

    for (let i = 0; i <= N; i++) {
      const row = document.createElement('tr');

      const thRow = document.createElement('th');
      thRow.textContent = i === 0 ? '—' : `${currentQuery[i - 1]} (${i})`;
      row.appendChild(thRow);

      for (let k = 0; k <= K; k++) {
        const td = document.createElement('td');

        if (viewMode === 'viterbi') {
          const val = viterbiRes.matrixM[i]?.[k];
          if (val === undefined || val < -1e5) {
            td.textContent = '—';
            td.style.color = 'var(--color-muted)';
          } else {
            td.textContent = val.toFixed(1);
            // Color shade
            const norm = Math.max(0, Math.min(1, (val + 30) / 30));
            td.style.backgroundColor = `color-mix(in srgb, var(--color-accent) ${(norm * 35).toFixed(0)}%, var(--color-surface))`;
          }

          // Highlight Viterbi path cell
          const isPathCell = viterbiRes.viterbiPath.some(
            (p) => p.residueIdx === i && p.k === k && p.stateType === 'M',
          );
          if (isPathCell) {
            td.classList.add('phmm-cell-viterbi');
          }
        } else {
          // Forward-Backward Posterior
          const prob = fbRes.posteriorM[i]?.[k] || 0;
          td.textContent = prob > 0.001 ? prob.toFixed(2) : '0';
          const pct = (prob * 100).toFixed(0);
          td.style.backgroundColor = `color-mix(in srgb, #16a34a ${pct}%, var(--color-surface))`;
          if (prob > 0.4) td.style.color = '#ffffff';
        }

        td.addEventListener('mouseenter', () => {
          if (viewMode === 'viterbi') {
            const vScore = viterbiRes.matrixM[i]?.[k] ?? -Infinity;
            hoveredItem = {
              label: `Viterbi Cell (i=${i}, k=${k})`,
              desc: `Log-score VM(${i}, ${k}) = ${vScore > -1e5 ? vScore.toFixed(2) : '-∞'}. Residue: "${i > 0 ? currentQuery[i - 1] : '—'}". Traceback from: ${viterbiRes.traceM[i]?.[k] || 'None'}.`,
            };
          } else {
            const prob = fbRes.posteriorM[i]?.[k] || 0;
            hoveredItem = {
              label: `Posterior Cell (i=${i}, k=${k})`,
              desc: `Posterior Probability P(π_${i} = M_${k} | x) = ${(prob * 100).toFixed(1)}%. Forward FM=${fbRes.forwardM[i]?.[k]?.toFixed(1)}, Backward BM=${fbRes.backwardM[i]?.[k]?.toFixed(1)}.`,
            };
          }
          renderCalcBox();
        });

        row.appendChild(td);
      }
      tbody.appendChild(row);
    }
    table.appendChild(tbody);
    matrixWrap.appendChild(table);
  }

  function renderCalcBox() {
    if (!calcBox) return;
    calcBox.replaceChildren();

    if (!hoveredItem) {
      const titleDiv = document.createElement('div');
      titleDiv.className = 'phmm-calc-title';

      const titleText = document.createElement('span');
      titleText.textContent = `Profile HMM (${activeModel.name}, K = ${activeModel.K})`;

      const statusSpan = document.createElement('span');
      statusSpan.textContent = viewMode === 'viterbi' ? 'Viterbi Decoding' : 'Posterior Decoding';

      titleDiv.append(titleText, statusSpan);

      const summaryDiv = document.createElement('div');
      summaryDiv.className = 'phmm-calc-summary';
      summaryDiv.textContent =
        viewMode === 'viterbi'
          ? `Optimal Viterbi path score: ${viterbiRes.logScore.toFixed(2)} log-odds. Aligned ${viterbiRes.viterbiPath.length} state steps.`
          : `Forward-Backward log-likelihood: ${fbRes.logLikelihood.toFixed(2)}. Posterior probabilities show confidence across profile positions.`;

      calcBox.append(titleDiv, summaryDiv);
      return;
    }

    const titleDiv = document.createElement('div');
    titleDiv.className = 'phmm-calc-title';

    const titleText = document.createElement('span');
    titleText.textContent = hoveredItem.label;

    titleDiv.appendChild(titleText);

    const formulaDiv = document.createElement('div');
    formulaDiv.className = 'phmm-calc-formula';

    const p = document.createElement('div');
    p.textContent = `↳ ${hoveredItem.desc}`;

    formulaDiv.appendChild(p);

    calcBox.append(titleDiv, formulaDiv);
  }

  function renderTransportStatus() {
    const totalSteps = viterbiRes.viterbiPath.length;
    if (stepIndicator) {
      if (currentStepIdx < 0) {
        stepIndicator.textContent = `Full Alignment (${totalSteps} steps)`;
      } else {
        stepIndicator.textContent = `Step ${currentStepIdx + 1}/${totalSteps}`;
      }
    }

    if (prevBtn) prevBtn.disabled = currentStepIdx < 0;
    if (nextBtn) nextBtn.disabled = currentStepIdx >= totalSteps - 1;
    if (playBtn) {
      playBtn.textContent = isPlaying ? 'Pause ⏸' : 'Play ▶';
    }
  }

  function renderAll() {
    renderScoreBanner();
    renderSvg();
    renderMatrixHeatmap();
    renderCalcBox();
    renderTransportStatus();
  }

  // ------------------------------------------------------------- Playback ----

  function stepForward() {
    const totalSteps = viterbiRes.viterbiPath.length;
    if (currentStepIdx < totalSteps - 1) {
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
    hoveredItem = null;
    renderAll();
  }

  function play() {
    const totalSteps = viterbiRes.viterbiPath.length;
    if (isPlaying || totalSteps === 0) return;
    if (currentStepIdx >= totalSteps - 1) {
      currentStepIdx = -1;
    }
    isPlaying = true;
    renderTransportStatus();
    stepForward();
    timerId = window.setInterval(() => {
      if (currentStepIdx < totalSteps - 1) {
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

  queryInput?.addEventListener('input', rebuild);

  presetBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      const pKey = btn.dataset.phmmPreset;
      if (pKey) loadPreset(pKey);
    });
  });

  modeViterbiBtn?.addEventListener('click', () => {
    viewMode = 'viterbi';
    modeViterbiBtn.classList.add('phmm-mode-btn--active');
    modeFbBtn?.classList.remove('phmm-mode-btn--active');
    renderAll();
  });

  modeFbBtn?.addEventListener('click', () => {
    viewMode = 'fb';
    modeFbBtn.classList.add('phmm-mode-btn--active');
    modeViterbiBtn?.classList.remove('phmm-mode-btn--active');
    renderAll();
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
  loadPreset('tata');

  return {
    destroy: () => {
      pause();
      window.removeEventListener('keydown', handleKeydown);
    },
  };
}
