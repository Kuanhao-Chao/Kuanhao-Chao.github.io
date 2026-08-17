/**
 * In Silico Mutagenesis (ISM) Visualizer Controller
 * Pure DOM & SVG node construction for interactive splice site mutation exploration.
 */

import { computeIsm, type IsmResult, type SpliceSiteType, ISM_PRESETS } from '../lib/ism';

export interface IsmVisualizerController {
  destroy: () => void;
}

export function initIsmVisualizer(root: ParentNode = document): IsmVisualizerController | null {
  const container = root.querySelector<HTMLElement>('[data-ism-visualizer]');
  if (!container) return null;
  if (container.dataset.ismReady === 'true') return null;
  container.dataset.ismReady = 'true';

  // DOM Elements
  const seqInput = container.querySelector<HTMLInputElement>('[data-ism-seq]');
  const siteTypeSelect = container.querySelector<HTMLSelectElement>('[data-ism-type]');
  const presetBtns = container.querySelectorAll<HTMLButtonElement>('[data-ism-preset]');

  const donorScoreVal = container.querySelector<HTMLElement>('[data-ism-donor-score]');
  const acceptorScoreVal = container.querySelector<HTMLElement>('[data-ism-acceptor-score]');
  const donorFill = container.querySelector<HTMLElement>('[data-ism-donor-fill]');
  const acceptorFill = container.querySelector<HTMLElement>('[data-ism-acceptor-fill]');

  const impactBadge = container.querySelector<HTMLElement>('[data-ism-impact-badge]');
  const presetTitle = container.querySelector<HTMLElement>('[data-ism-preset-title]');
  const presetDesc = container.querySelector<HTMLElement>('[data-ism-preset-desc]');

  const logoSvg = container.querySelector<SVGSVGElement>('[data-ism-logo-svg]');
  const matrixThead = container.querySelector<HTMLElement>('[data-ism-matrix-thead]');
  const matrixTbody = container.querySelector<HTMLElement>('[data-ism-matrix-tbody]');
  const inspectorText = container.querySelector<HTMLElement>('[data-ism-inspector-text]');

  let activeSequence = 'TTTTTTTTCTTTCAGGTGAAG';
  let activeType: SpliceSiteType = 'acceptor';
  let activeJunctionCoord = 15;

  let result: IsmResult = computeIsm(activeSequence, activeType, activeJunctionCoord);

  function compute() {
    activeSequence = (seqInput?.value || 'TTTTTTTTCTTTCAGGTGAAG').trim().toUpperCase();
    activeType = (siteTypeSelect?.value as SpliceSiteType) || 'acceptor';

    result = computeIsm(activeSequence, activeType, activeJunctionCoord);
    renderAll();
  }

  // ------------------------------------------------------------- Renderers --

  function renderGauges() {
    const donorPct = (result.refDonorScore * 100).toFixed(1);
    const acceptorPct = (result.refAcceptorScore * 100).toFixed(1);

    if (donorScoreVal) donorScoreVal.textContent = `${result.refDonorScore.toFixed(3)} (${donorPct}%)`;
    if (acceptorScoreVal) acceptorScoreVal.textContent = `${result.refAcceptorScore.toFixed(3)} (${acceptorPct}%)`;

    if (donorFill) donorFill.style.width = `${donorPct}%`;
    if (acceptorFill) acceptorFill.style.width = `${acceptorPct}%`;

    if (impactBadge) {
      impactBadge.className = 'ism-impact-badge';
      if (result.primaryRefScore > 0.7) {
        impactBadge.classList.add('ism-impact-gain');
        impactBadge.textContent = `Active Canonical ${result.siteType.toUpperCase()} (P = ${result.primaryRefScore.toFixed(2)})`;
      } else if (result.primaryRefScore < 0.2) {
        impactBadge.classList.add('ism-impact-disruption');
        impactBadge.textContent = `Inactive / Disrupted Junction (P = ${result.primaryRefScore.toFixed(2)})`;
      } else {
        impactBadge.classList.add('ism-impact-neutral');
        impactBadge.textContent = `Moderate Splicing Propensity (P = ${result.primaryRefScore.toFixed(2)})`;
      }
    }
  }

  function renderSequenceLogo() {
    if (!logoSvg) return;
    logoSvg.replaceChildren();

    const n = result.positions.length;
    const svgWidth = Math.max(640, n * 36);
    const svgHeight = 140;
    const margin = { top: 15, right: 20, bottom: 35, left: 35 };

    logoSvg.setAttribute('viewBox', `0 0 ${svgWidth} ${svgHeight}`);

    const colWidth = (svgWidth - margin.left - margin.right) / n;
    const maxH = svgHeight - margin.top - margin.bottom;

    // Background junction divider line
    const junctionX = margin.left + result.junctionIndex * colWidth;
    const divider = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    divider.setAttribute('x1', String(junctionX));
    divider.setAttribute('y1', String(margin.top));
    divider.setAttribute('x2', String(junctionX));
    divider.setAttribute('y2', String(svgHeight - margin.bottom));
    divider.setAttribute('stroke', '#ef4444');
    divider.setAttribute('stroke-width', '2');
    divider.setAttribute('stroke-dasharray', '4 3');
    logoSvg.appendChild(divider);

    // Junction label
    const juncText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    juncText.setAttribute('x', String(junctionX + 4));
    juncText.setAttribute('y', String(margin.top + 10));
    juncText.setAttribute('fill', '#ef4444');
    juncText.setAttribute('font-size', '10');
    juncText.setAttribute('font-family', 'monospace');
    juncText.setAttribute('font-weight', 'bold');
    juncText.textContent = 'Splice Junction';
    logoSvg.appendChild(juncText);

    // Draw nucleotide columns
    result.positions.forEach((pos, idx) => {
      const x = margin.left + idx * colWidth + colWidth / 2;
      const normImportance = pos.importance / result.maxImportance;
      const letterH = Math.max(14, normImportance * maxH);
      const y = svgHeight - margin.bottom;

      // Base letter color mapping
      const baseColors: Record<string, string> = {
        A: '#10b981', // Green
        C: '#3b82f6', // Blue
        G: '#f59e0b', // Amber
        T: '#ef4444', // Red
      };

      const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      text.setAttribute('x', String(x));
      text.setAttribute('y', String(y));
      text.setAttribute('text-anchor', 'middle');
      text.setAttribute('fill', baseColors[pos.refBase] || '#64748b');
      text.setAttribute('font-size', `${letterH * 1.15}px`);
      text.setAttribute('font-family', 'ui-monospace, monospace');
      text.setAttribute('font-weight', '800');
      text.textContent = pos.refBase;
      logoSvg.appendChild(text);

      // Position Coordinate Label
      const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      label.setAttribute('x', String(x));
      label.setAttribute('y', String(svgHeight - 12));
      label.setAttribute('text-anchor', 'middle');
      label.setAttribute('fill', 'var(--color-muted)');
      label.setAttribute('font-size', '9');
      label.setAttribute('font-family', 'monospace');
      label.textContent = pos.positionLabel;
      logoSvg.appendChild(label);
    });
  }

  function renderHeatmapMatrix() {
    if (!matrixThead || !matrixTbody) return;
    matrixThead.replaceChildren();
    matrixTbody.replaceChildren();

    // 1. Render Header Row (Position labels and reference nucleotides)
    const headerRow1 = document.createElement('tr');
    const thBase1 = document.createElement('th');
    thBase1.textContent = 'Pos';
    thBase1.className = 'ism-matrix-row-header';
    headerRow1.appendChild(thBase1);

    result.positions.forEach((pos) => {
      const th = document.createElement('th');
      th.textContent = pos.positionLabel;
      if (pos.positionLabel === '-1' || pos.positionLabel === '-2' || pos.positionLabel === '+1' || pos.positionLabel === '+2') {
        th.style.color = 'var(--color-accent)';
        th.style.fontWeight = 'bold';
      }
      headerRow1.appendChild(th);
    });
    matrixThead.appendChild(headerRow1);

    const headerRow2 = document.createElement('tr');
    const thBase2 = document.createElement('th');
    thBase2.textContent = 'Ref';
    thBase2.className = 'ism-matrix-row-header';
    headerRow2.appendChild(thBase2);

    result.positions.forEach((pos) => {
      const th = document.createElement('th');
      th.textContent = pos.refBase;
      th.className = 'ref-col';
      headerRow2.appendChild(th);
    });
    matrixThead.appendChild(headerRow2);

    // 2. Render 4 Mutation Rows (A, C, G, T)
    const BASES = ['A', 'C', 'G', 'T'];

    BASES.forEach((base) => {
      const tr = document.createElement('tr');
      const rowTh = document.createElement('th');
      rowTh.textContent = base;
      rowTh.className = 'ism-matrix-row-header';
      tr.appendChild(rowTh);

      result.positions.forEach((pos) => {
        const td = document.createElement('td');
        const mut = pos.mutations[base];
        const isRef = pos.refBase === base;

        td.className = 'ism-cell';
        td.dataset.posIndex = String(pos.index);
        td.dataset.mutBase = base;
        td.dataset.refBase = pos.refBase;
        td.dataset.posLabel = pos.positionLabel;
        td.dataset.delta = String(mut.delta);
        td.dataset.mutScore = String(mut.score);

        if (isRef) {
          td.classList.add('is-ref');
          td.textContent = '●';
        } else {
          td.textContent = mut.delta > 0 ? `+${mut.delta.toFixed(2)}` : mut.delta.toFixed(2);

          // Apply color grading
          if (mut.delta <= -0.5) {
            td.classList.add('ism-cell-disrupt-severe');
          } else if (mut.delta <= -0.2) {
            td.classList.add('ism-cell-disrupt-med');
          } else if (mut.delta <= -0.05) {
            td.classList.add('ism-cell-disrupt-mild');
          } else if (mut.delta >= 0.5) {
            td.classList.add('ism-cell-gain-severe');
          } else if (mut.delta >= 0.2) {
            td.classList.add('ism-cell-gain-med');
          } else if (mut.delta >= 0.05) {
            td.classList.add('ism-cell-gain-mild');
          } else {
            td.classList.add('ism-cell-neutral');
          }
        }

        tr.appendChild(td);
      });

      matrixTbody.appendChild(tr);
    });
  }

  function renderAll() {
    renderGauges();
    renderSequenceLogo();
    renderHeatmapMatrix();

    if (inspectorText) {
      inspectorText.textContent = `Most sensitive position: ${result.mostSensitivePosition.label} (${result.mostSensitivePosition.refBase}) with importance I = ${result.mostSensitivePosition.importance}. Hover any cell to inspect ΔScore.`;
    }
  }

  // ----------------------------------------------------------- Interactions --

  const onSeqInput = () => compute();
  const onTypeChange = () => compute();

  seqInput?.addEventListener('input', onSeqInput);
  siteTypeSelect?.addEventListener('change', onTypeChange);

  const onPresetClick = (e: Event) => {
    const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-ism-preset]');
    if (!btn) return;
    const presetId = btn.dataset.ismPreset;
    const preset = ISM_PRESETS.find((p) => p.id === presetId);
    if (!preset) return;

    currentPresetId = preset.id;
    activeSequence = preset.sequence;
    activeType = preset.type;
    activeJunctionCoord = preset.junctionCoord;

    presetBtns.forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');

    if (seqInput) seqInput.value = preset.sequence;
    if (siteTypeSelect) siteTypeSelect.value = preset.type;

    if (presetTitle) presetTitle.textContent = `${preset.name} (${preset.gene})`;
    if (presetDesc) presetDesc.textContent = `${preset.description} ${preset.clinicalNote}`;

    compute();
  };
  container.addEventListener('click', onPresetClick);

  // Hover and Click on Matrix cells
  const onMatrixOver = (e: Event) => {
    const cell = (e.target as HTMLElement).closest<HTMLElement>('.ism-cell');
    if (!cell || !inspectorText) return;

    const posLabel = cell.dataset.posLabel;
    const refBase = cell.dataset.refBase;
    const mutBase = cell.dataset.mutBase;
    const delta = cell.dataset.delta;
    const mutScore = cell.dataset.mutScore;

    if (refBase === mutBase) {
      inspectorText.textContent = `Position ${posLabel}: Reference ${refBase} (Current Score P = ${mutScore}). Click another nucleotide in this column to mutate.`;
    } else {
      inspectorText.textContent = `Position ${posLabel}: In Silico Mutation ${refBase} → ${mutBase} | New Splice Probability P = ${mutScore} | ΔScore = ${delta} (Click to apply mutation)`;
    }
  };

  const onMatrixClick = (e: Event) => {
    const cell = (e.target as HTMLElement).closest<HTMLElement>('.ism-cell');
    if (!cell) return;

    const posIdx = parseInt(cell.dataset.posIndex || '0', 10);
    const mutBase = cell.dataset.mutBase;
    if (!mutBase) return;

    // Mutate the active sequence
    const updated = activeSequence.slice(0, posIdx) + mutBase + activeSequence.slice(posIdx + 1);
    if (seqInput) seqInput.value = updated;
    compute();
  };

  matrixTbody?.addEventListener('mouseover', onMatrixOver);
  matrixTbody?.addEventListener('click', onMatrixClick);

  // Initial render
  compute();

  return {
    destroy: () => {
      seqInput?.removeEventListener('input', onSeqInput);
      siteTypeSelect?.removeEventListener('change', onTypeChange);
      container.removeEventListener('click', onPresetClick);
      matrixTbody?.removeEventListener('mouseover', onMatrixOver);
      matrixTbody?.removeEventListener('click', onMatrixClick);
    },
  };
}
