/**
 * Generalized Hidden Markov Models (GHMMs) Client Visualizer Controller.
 * Pure DOM and SVG node creation.
 */

import {
  runGhmmGeneFinder,
  evaluateDurationScore,
  type GhmmResult,
  type GeneFeature,
} from '../lib/ghmm';

export interface GhmmVisualizerController {
  destroy: () => void;
}

export function initGhmmVisualizer(root: ParentNode = document): GhmmVisualizerController | null {
  const container = root.querySelector<HTMLElement>('[data-ghmm-visualizer]');
  if (!container) return null;
  if (container.dataset.ghmmReady === 'true') return null;
  container.dataset.ghmmReady = 'true';

  // DOM Elements
  const dnaTextarea = container.querySelector<HTMLTextAreaElement>('[data-ghmm-input]');
  const presetBtns = container.querySelectorAll<HTMLButtonElement>('[data-ghmm-preset]');

  const trackContainer = container.querySelector<HTMLElement>('[data-ghmm-track-body]');
  const rulerLeft = container.querySelector<HTMLElement>('[data-ghmm-ruler-left]');
  const rulerRight = container.querySelector<HTMLElement>('[data-ghmm-ruler-right]');

  const durationSvg = container.querySelector<SVGSVGElement>('[data-ghmm-duration-svg]');
  const calcBox = container.querySelector<HTMLElement>('[data-ghmm-calc-box]');
  const proteinLine = container.querySelector<HTMLElement>('[data-ghmm-protein-line]');

  const exonsVal = container.querySelector<HTMLElement>('[data-ghmm-exons]');
  const intronsVal = container.querySelector<HTMLElement>('[data-ghmm-introns]');
  const codingLenVal = container.querySelector<HTMLElement>('[data-ghmm-coding-len]');
  const gcVal = container.querySelector<HTMLElement>('[data-ghmm-gc]');

  const playBtn = container.querySelector<HTMLButtonElement>('[data-ghmm-play]');
  const prevBtn = container.querySelector<HTMLButtonElement>('[data-ghmm-prev]');
  const nextBtn = container.querySelector<HTMLButtonElement>('[data-ghmm-next]');
  const resetBtn = container.querySelector<HTMLButtonElement>('[data-ghmm-reset]');
  const speedSelect = container.querySelector<HTMLSelectElement>('[data-ghmm-speed]');
  const stepIndicator = container.querySelector<HTMLElement>('[data-ghmm-step-indicator]');

  // State
  let dna = dnaTextarea?.value || 'AAAAAATGGCCAAAGTGTAAGTCCTAAGAGGCAAAATAATTTTT';
  let result: GhmmResult = runGhmmGeneFinder(dna);

  let currentStepIdx = -1; // -1: full annotation, >= 0: stepping through features
  let isPlaying = false;
  let timerId: number | null = null;
  let speedMs = parseInt(speedSelect?.value || '1200', 10);
  let hoveredFeature: GeneFeature | null = null;

  function rebuild() {
    dna = (dnaTextarea?.value || '').toUpperCase().replace(/[^A-Z]/g, '');
    result = runGhmmGeneFinder(dna);
    currentStepIdx = -1;
    hoveredFeature = null;
    pause();
    renderAll();
  }

  // ------------------------------------------------------------- Renderers --

  function renderGeneBanner() {
    if (exonsVal) exonsVal.textContent = String(result.exonCount);
    if (intronsVal) intronsVal.textContent = String(result.intronCount);
    if (codingLenVal) codingLenVal.textContent = `${result.stats.codingLen} bp (${result.proteinTranslation.length} aa)`;
    if (gcVal) gcVal.textContent = `${result.stats.gcPercent.toFixed(1)}%`;

    if (proteinLine) {
      proteinLine.textContent = result.proteinTranslation || 'No open reading frame detected';
    }
  }

  function renderGenomicTrack() {
    if (!trackContainer) return;
    trackContainer.replaceChildren();

    const totalLen = result.stats.totalLen || 1;
    if (rulerLeft) rulerLeft.textContent = '1 bp';
    if (rulerRight) rulerRight.textContent = `${totalLen} bp`;

    result.features.forEach((feat, idx) => {
      const box = document.createElement('div');
      box.className = 'ghmm-feature-box';

      // Assign type class
      if (feat.subType === 'Exon_Init') box.classList.add('ghmm-feature-box--exon-init');
      else if (feat.subType === 'Exon_Int') box.classList.add('ghmm-feature-box--exon-int');
      else if (feat.subType === 'Exon_Term') box.classList.add('ghmm-feature-box--exon-term');
      else if (feat.subType === 'Exon_Single') box.classList.add('ghmm-feature-box--exon-sgl');
      else if (feat.subType === 'Intron') box.classList.add('ghmm-feature-box--intron');
      else box.classList.add('ghmm-feature-box--intergenic');

      const leftPct = ((feat.start - 1) / totalLen) * 100;
      const widthPct = Math.max(3, (feat.length / totalLen) * 100);

      box.style.left = `${leftPct}%`;
      box.style.width = `${widthPct}%`;

      const isActive = currentStepIdx >= 0 && idx === currentStepIdx;
      if (isActive) box.classList.add('ghmm-feature-box--active');

      if (feat.type === 'exon') {
        box.textContent = `${feat.subType.replace('Exon_', 'E_')} (${feat.length}bp)`;
      } else if (feat.type === 'intron') {
        box.textContent = `Intron (${feat.length}bp)`;
      } else {
        box.textContent = feat.length > 8 ? `${feat.length}bp` : '';
      }

      box.addEventListener('mouseenter', () => {
        hoveredFeature = feat;
        renderCalcBox();
        renderDurationSvg();
      });

      trackContainer.appendChild(box);
    });
  }

  function renderDurationSvg() {
    if (!durationSvg) return;
    durationSvg.replaceChildren();

    const width = 580;
    const height = 300;
    const pad = 40;
    durationSvg.setAttribute('viewBox', `0 0 ${width} ${height}`);
    const svgNS = 'http://www.w3.org/2000/svg';

    // X Axis: duration d = 1..40
    // Y Axis: f(d) probability
    const maxD = 35;
    const getX = (d: number) => pad + ((d - 1) / (maxD - 1)) * (width - pad * 2);

    // Compute values for Exon f(d) (Gaussian/Gamma peak) vs standard HMM (Geometric decay)
    const pointsGhmm: { x: number; y: number }[] = [];
    const pointsStdHmm: { x: number; y: number }[] = [];

    for (let d = 1; d <= maxD; d++) {
      // GHMM Exon peak at 15
      const ghmmProb = Math.exp(evaluateDurationScore('Exon_Init', d));
      // Std HMM Geometric decay P(d) = p^(d-1)(1-p) with p = 0.85
      const stdProb = Math.pow(0.85, d - 1) * 0.15;

      const yGhmm = height - pad - ghmmProb * (height - pad * 2) * 2.2;
      const yStd = height - pad - stdProb * (height - pad * 2) * 5.0;

      pointsGhmm.push({ x: getX(d), y: Math.max(pad, yGhmm) });
      pointsStdHmm.push({ x: getX(d), y: Math.max(pad, yStd) });
    }

    // Axes
    const xAxis = document.createElementNS(svgNS, 'line');
    xAxis.setAttribute('x1', String(pad));
    xAxis.setAttribute('y1', String(height - pad));
    xAxis.setAttribute('x2', String(width - pad));
    xAxis.setAttribute('y2', String(height - pad));
    xAxis.setAttribute('stroke', 'var(--color-rule)');
    xAxis.setAttribute('stroke-width', '1.5');
    durationSvg.appendChild(xAxis);

    const yAxis = document.createElementNS(svgNS, 'line');
    yAxis.setAttribute('x1', String(pad));
    yAxis.setAttribute('y1', String(pad));
    yAxis.setAttribute('x2', String(pad));
    yAxis.setAttribute('y2', String(height - pad));
    yAxis.setAttribute('stroke', 'var(--color-rule)');
    yAxis.setAttribute('stroke-width', '1.5');
    durationSvg.appendChild(yAxis);

    // Labels
    const xLabel = document.createElementNS(svgNS, 'text');
    xLabel.setAttribute('x', String(width / 2));
    xLabel.setAttribute('y', String(height - 10));
    xLabel.setAttribute('text-anchor', 'middle');
    xLabel.setAttribute('font-family', 'var(--font-mono)');
    xLabel.setAttribute('font-size', '10');
    xLabel.setAttribute('fill', 'var(--color-muted)');
    xLabel.textContent = 'Segment Duration d (base pairs)';
    durationSvg.appendChild(xLabel);

    // Curve Paths
    const pathGhmm = document.createElementNS(svgNS, 'path');
    let dGhmm = `M ${pointsGhmm[0].x} ${pointsGhmm[0].y}`;
    for (let i = 1; i < pointsGhmm.length; i++) dGhmm += ` L ${pointsGhmm[i].x} ${pointsGhmm[i].y}`;
    pathGhmm.setAttribute('d', dGhmm);
    pathGhmm.setAttribute('fill', 'none');
    pathGhmm.setAttribute('stroke', '#16a34a');
    pathGhmm.setAttribute('stroke-width', '2.5');
    durationSvg.appendChild(pathGhmm);

    const pathStd = document.createElementNS(svgNS, 'path');
    let dStd = `M ${pointsStdHmm[0].x} ${pointsStdHmm[0].y}`;
    for (let i = 1; i < pointsStdHmm.length; i++) dStd += ` L ${pointsStdHmm[i].x} ${pointsStdHmm[i].y}`;
    pathStd.setAttribute('d', dStd);
    pathStd.setAttribute('fill', 'none');
    pathStd.setAttribute('stroke', '#f59e0b');
    pathStd.setAttribute('stroke-width', '2');
    pathStd.setAttribute('stroke-dasharray', '4 4');
    durationSvg.appendChild(pathStd);

    // Highlight hovered feature length
    if (hoveredFeature && hoveredFeature.length <= maxD) {
      const hX = getX(hoveredFeature.length);
      const hLine = document.createElementNS(svgNS, 'line');
      hLine.setAttribute('x1', String(hX));
      hLine.setAttribute('y1', String(pad));
      hLine.setAttribute('x2', String(hX));
      hLine.setAttribute('y2', String(height - pad));
      hLine.setAttribute('stroke', 'var(--color-accent)');
      hLine.setAttribute('stroke-width', '2');
      hLine.setAttribute('stroke-dasharray', '2 2');
      durationSvg.appendChild(hLine);

      const hText = document.createElementNS(svgNS, 'text');
      hText.setAttribute('x', String(hX));
      hText.setAttribute('y', String(pad - 8));
      hText.setAttribute('text-anchor', 'middle');
      hText.setAttribute('font-family', 'var(--font-mono)');
      hText.setAttribute('font-size', '10');
      hText.setAttribute('font-weight', '700');
      hText.setAttribute('fill', 'var(--color-accent)');
      hText.textContent = `${hoveredFeature.subType}: ${hoveredFeature.length}bp`;
      durationSvg.appendChild(hText);
    }

    // Legend
    const gLeg = document.createElementNS(svgNS, 'g');
    gLeg.setAttribute('transform', `translate(${width - 240}, ${pad})`);

    const l1 = document.createElementNS(svgNS, 'line');
    l1.setAttribute('x1', '0');
    l1.setAttribute('y1', '0');
    l1.setAttribute('x2', '20');
    l1.setAttribute('y2', '0');
    l1.setAttribute('stroke', '#16a34a');
    l1.setAttribute('stroke-width', '2.5');
    const t1 = document.createElementNS(svgNS, 'text');
    t1.setAttribute('x', '26');
    t1.setAttribute('y', '4');
    t1.setAttribute('font-family', 'var(--font-mono)');
    t1.setAttribute('font-size', '10');
    t1.setAttribute('fill', 'var(--color-ink)');
    t1.textContent = 'GHMM Explicit Exon f(d)';

    const l2 = document.createElementNS(svgNS, 'line');
    l2.setAttribute('x1', '0');
    l2.setAttribute('y1', '18');
    l2.setAttribute('x2', '20');
    l2.setAttribute('y2', '18');
    l2.setAttribute('stroke', '#f59e0b');
    l2.setAttribute('stroke-width', '2');
    l2.setAttribute('stroke-dasharray', '4 4');
    const t2 = document.createElementNS(svgNS, 'text');
    t2.setAttribute('x', '26');
    t2.setAttribute('y', '22');
    t2.setAttribute('font-family', 'var(--font-mono)');
    t2.setAttribute('font-size', '10');
    t2.setAttribute('fill', 'var(--color-muted)');
    t2.textContent = 'Standard HMM Geometric';

    gLeg.append(l1, t1, l2, t2);
    durationSvg.appendChild(gLeg);
  }

  function renderCalcBox() {
    if (!calcBox) return;
    calcBox.replaceChildren();

    if (!hoveredFeature) {
      const titleDiv = document.createElement('div');
      titleDiv.className = 'ghmm-calc-title';

      const titleText = document.createElement('span');
      titleText.textContent = `Gene Model Segmentation (${result.stats.totalLen} bp)`;

      const statusSpan = document.createElement('span');
      statusSpan.textContent = `${result.exonCount} Exon(s), ${result.intronCount} Intron(s)`;

      titleDiv.append(titleText, statusSpan);

      const summaryDiv = document.createElement('div');
      summaryDiv.className = 'ghmm-calc-summary';
      summaryDiv.textContent = `Viterbi semi-Markov optimization identified ${result.features.length} genomic segments. Translated ${result.proteinTranslation.length} amino acids.`;

      calcBox.append(titleDiv, summaryDiv);
      return;
    }

    const titleDiv = document.createElement('div');
    titleDiv.className = 'ghmm-calc-title';

    const titleText = document.createElement('span');
    titleText.textContent = `Feature: ${hoveredFeature.subType} (${hoveredFeature.start}..${hoveredFeature.end})`;

    titleDiv.appendChild(titleText);

    const formulaDiv = document.createElement('div');
    formulaDiv.className = 'ghmm-calc-formula';

    const p1 = document.createElement('div');
    p1.textContent = `↳ Sequence (${hoveredFeature.length} bp): "${hoveredFeature.sequence}"`;

    const p2 = document.createElement('div');
    p2.textContent = `↳ Duration Log-Score f(${hoveredFeature.length}) = ${evaluateDurationScore(hoveredFeature.subType, hoveredFeature.length).toFixed(2)}. Total segment DP score = ${hoveredFeature.score.toFixed(1)}.`;

    formulaDiv.append(p1, p2);
    calcBox.append(titleDiv, formulaDiv);
  }

  function renderTransportStatus() {
    const totalSteps = result.features.length;
    if (stepIndicator) {
      if (currentStepIdx < 0) {
        stepIndicator.textContent = `All Features (${totalSteps} segments)`;
      } else {
        stepIndicator.textContent = `Segment ${currentStepIdx + 1}/${totalSteps}`;
      }
    }

    if (prevBtn) prevBtn.disabled = currentStepIdx < 0;
    if (nextBtn) nextBtn.disabled = currentStepIdx >= totalSteps - 1;
    if (playBtn) {
      playBtn.textContent = isPlaying ? 'Pause ⏸' : 'Play ▶';
    }
  }

  function renderAll() {
    renderGeneBanner();
    renderGenomicTrack();
    renderDurationSvg();
    renderCalcBox();
    renderTransportStatus();
  }

  // ------------------------------------------------------------- Playback ----

  function stepForward() {
    if (currentStepIdx < result.features.length - 1) {
      currentStepIdx++;
      hoveredFeature = result.features[currentStepIdx] || null;
      renderAll();
    } else {
      pause();
    }
  }

  function stepBackward() {
    if (currentStepIdx >= 0) {
      currentStepIdx--;
      hoveredFeature = currentStepIdx >= 0 ? result.features[currentStepIdx] : null;
      renderAll();
    }
  }

  function reset() {
    pause();
    currentStepIdx = -1;
    hoveredFeature = null;
    renderAll();
  }

  function play() {
    if (isPlaying || result.features.length === 0) return;
    if (currentStepIdx >= result.features.length - 1) {
      currentStepIdx = -1;
    }
    isPlaying = true;
    renderTransportStatus();
    stepForward();
    timerId = window.setInterval(() => {
      if (currentStepIdx < result.features.length - 1) {
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

  dnaTextarea?.addEventListener('input', rebuild);

  presetBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      const seq = btn.dataset.ghmmSeq;
      if (seq && dnaTextarea) {
        dnaTextarea.value = seq;
        rebuild();
      }
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
