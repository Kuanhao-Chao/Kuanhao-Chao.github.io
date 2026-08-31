/**
 * Client Controller for Genome-Wide Association Studies (GWAS) Visualizer.
 * Provides interactive Manhattan plot, Q-Q plot, LocusZoom fine-mapping,
 * single-variant regression sandbox, PCA stratification, and PRS scoring.
 */

import {
  runGWAS,
  computeLinearRegression,
  type SNP,
  type GWASResult,
} from '../lib/gwas';

export interface GWASVisualizerController {
  destroy: () => void;
}

const SVG_NS = 'http://www.w3.org/2000/svg';

export function initGWASVisualizer(root: ParentNode = document): GWASVisualizerController | null {
  const container = root.querySelector<HTMLElement>('[data-gwas-visualizer]');
  if (!container) return null;
  if (container.dataset.gwasReady === 'true') return null;
  container.dataset.gwasReady = 'true';

  // DOM Elements
  const presetBtns = container.querySelectorAll<HTMLButtonElement>('[data-gwas-preset]');
  const tabBtns = container.querySelectorAll<HTMLButtonElement>('[data-gwas-tab]');
  const tabPanels = container.querySelectorAll<HTMLElement>('[data-gwas-panel]');
  const scanBtn = container.querySelector<HTMLButtonElement>('[data-gwas-scan]');
  const resetBtn = container.querySelector<HTMLButtonElement>('[data-gwas-reset]');
  const pcaToggle = container.querySelector<HTMLInputElement>('[data-gwas-pca-toggle]');
  const speedSelect = container.querySelector<HTMLSelectElement>('[data-gwas-speed]');

  // Telemetry Elements
  const traitTitleEl = container.querySelector<HTMLElement>('[data-gwas-trait-title]');
  const traitDescEl = container.querySelector<HTMLElement>('[data-gwas-trait-desc]');
  const sampleSizeEl = container.querySelector<HTMLElement>('[data-gwas-sample-size]');
  const lociCountEl = container.querySelector<HTMLElement>('[data-gwas-loci-count]');
  const lambdaValEl = container.querySelector<HTMLElement>('[data-gwas-lambda-val]');
  const lambdaBadgeEl = container.querySelector<HTMLElement>('[data-gwas-lambda-badge]');
  const sigCountEl = container.querySelector<HTMLElement>('[data-gwas-sig-count]');

  // SVG Canvas Elements
  const manhattanSvg = container.querySelector<SVGSVGElement>('[data-gwas-manhattan-svg]');
  const qqSvg = container.querySelector<SVGSVGElement>('[data-gwas-qq-svg]');
  const locusSvg = container.querySelector<SVGSVGElement>('[data-gwas-locus-svg]');
  const regrSvg = container.querySelector<SVGSVGElement>('[data-gwas-regr-svg]');
  const pcaSvg = container.querySelector<SVGSVGElement>('[data-gwas-pca-svg]');
  const prsSvg = container.querySelector<SVGSVGElement>('[data-gwas-prs-svg]');

  // Tooltip
  const tooltipEl = container.querySelector<HTMLElement>('[data-gwas-tooltip]');

  // Inspector Elements
  const inspRsidEl = container.querySelector<HTMLElement>('[data-gwas-insp-rsid]');
  const inspPosEl = container.querySelector<HTMLElement>('[data-gwas-insp-pos]');
  const inspAllelesEl = container.querySelector<HTMLElement>('[data-gwas-insp-alleles]');
  const inspMafEl = container.querySelector<HTMLElement>('[data-gwas-insp-maf]');
  const inspBetaEl = container.querySelector<HTMLElement>('[data-gwas-insp-beta]');
  const inspPvalEl = container.querySelector<HTMLElement>('[data-gwas-insp-pval]');
  const inspGeneEl = container.querySelector<HTMLElement>('[data-gwas-insp-gene]');
  const inspConsequenceEl = container.querySelector<HTMLElement>('[data-gwas-insp-consequence]');
  const regrFormulaEl = container.querySelector<HTMLElement>('[data-gwas-regr-formula]');

  // State
  let currentPresetId = 't2d';
  let adjustPCA = true;
  let currentTab = 'manhattan';
  let gwasResult: GWASResult = runGWAS(currentPresetId, adjustPCA);
  let selectedSNP: SNP = gwasResult.leadSNPs[0] || gwasResult.snps[0];
  let scanProgressChr = 22; // 1..22; 22 means full scan completed
  let isScanning = false;
  let scanTimer: number | null = null;
  let scanSpeedMs = parseInt(speedSelect?.value || '120', 10);

  // ----------------------------------------------------------- Renderers --

  function updateTelemetry() {
    const preset = gwasResult.preset;
    if (traitTitleEl) traitTitleEl.textContent = `${preset.name} (${preset.trait})`;
    if (traitDescEl) traitDescEl.textContent = `${preset.description} ${preset.clinicalNote}`;
    if (sampleSizeEl) sampleSizeEl.textContent = `N = ${preset.sampleSize.toLocaleString()}`;
    if (lociCountEl) lociCountEl.textContent = `${preset.leadLociCount} lead loci`;
    if (sigCountEl) sigCountEl.textContent = `${gwasResult.significantCount} SNPs`;

    if (lambdaValEl && lambdaBadgeEl) {
      const lam = gwasResult.lambdaGC;
      lambdaValEl.textContent = `λ_GC = ${lam}`;
      lambdaBadgeEl.className = 'gwas-stat-badge';
      if (lam <= 1.05) {
        lambdaBadgeEl.classList.add('gwas-stat-badge--ok');
        lambdaBadgeEl.textContent = 'Controlled Null (λ ≤ 1.05)';
      } else if (lam <= 1.15) {
        lambdaBadgeEl.classList.add('gwas-stat-badge--warn');
        lambdaBadgeEl.textContent = 'Mild Inflation (1.05 < λ ≤ 1.15)';
      } else {
        lambdaBadgeEl.classList.add('gwas-stat-badge--inflated');
        lambdaBadgeEl.textContent = 'Stratified Inflation (λ > 1.15)';
      }
    }
  }

  function updateInspector(snp: SNP) {
    selectedSNP = snp;
    if (inspRsidEl) inspRsidEl.textContent = snp.rsid;
    if (inspPosEl) inspPosEl.textContent = `chr${snp.chr}:${snp.pos.toLocaleString()}`;
    if (inspAllelesEl) inspAllelesEl.textContent = `${snp.effectAllele} / ${snp.otherAllele} (Effect / Other)`;
    if (inspMafEl) inspMafEl.textContent = `${(snp.maf * 100).toFixed(1)}%`;
    if (inspBetaEl) inspBetaEl.textContent = `${snp.beta > 0 ? '+' : ''}${snp.beta.toFixed(3)} (SE ±${snp.se.toFixed(3)})`;
    if (inspPvalEl) inspPvalEl.textContent = `${snp.pValue.toExponential(2)} (-log10 P = ${snp.negLog10P.toFixed(2)})`;
    if (inspGeneEl) inspGeneEl.textContent = snp.gene;
    if (inspConsequenceEl) inspConsequenceEl.textContent = snp.consequence.replace(/_/g, ' ');

    renderRegressionPlot();
    renderLocusZoomPlot();
  }

  function renderManhattanPlot() {
    if (!manhattanSvg) return;
    manhattanSvg.replaceChildren();

    const w = 900;
    const h = 340;
    manhattanSvg.setAttribute('viewBox', `0 0 ${w} ${h}`);

    const padLeft = 50;
    const padRight = 20;
    const padTop = 25;
    const padBottom = 40;
    const plotW = w - padLeft - padRight;
    const plotH = h - padTop - padBottom;

    // Total genomic length across 22 autosomes ~ 2850 Mb
    const totalMb = gwasResult.preset.chromosomes.reduce((acc, c) => acc + c.lengthMb, 0);

    // Max -log10(p) ceiling
    const maxNegLog = Math.max(12, ...gwasResult.snps.map((s) => s.negLog10P)) + 1.5;

    // Axes lines
    const axisGroup = document.createElementNS(SVG_NS, 'g');
    
    // Y-axis gridlines
    for (let yVal = 0; yVal <= maxNegLog; yVal += 4) {
      const yPos = padTop + plotH - (yVal / maxNegLog) * plotH;
      const gridLine = document.createElementNS(SVG_NS, 'line');
      gridLine.setAttribute('x1', String(padLeft));
      gridLine.setAttribute('x2', String(padLeft + plotW));
      gridLine.setAttribute('y1', String(yPos));
      gridLine.setAttribute('y2', String(yPos));
      gridLine.setAttribute('stroke', 'var(--color-rule)');
      gridLine.setAttribute('stroke-width', '0.75');
      gridLine.setAttribute('stroke-dasharray', '2 3');
      axisGroup.append(gridLine);

      const yLabel = document.createElementNS(SVG_NS, 'text');
      yLabel.setAttribute('x', String(padLeft - 8));
      yLabel.setAttribute('y', String(yPos + 3.5));
      yLabel.setAttribute('text-anchor', 'end');
      yLabel.setAttribute('font-size', '10');
      yLabel.setAttribute('fill', 'var(--color-muted)');
      yLabel.setAttribute('font-family', 'var(--font-mono)');
      yLabel.textContent = String(yVal);
      axisGroup.append(yLabel);
    }

    // Genome-Wide Significance threshold line: -log10(5e-8) = 7.301
    const ySig = padTop + plotH - (7.301 / maxNegLog) * plotH;
    const sigLine = document.createElementNS(SVG_NS, 'line');
    sigLine.setAttribute('x1', String(padLeft));
    sigLine.setAttribute('x2', String(padLeft + plotW));
    sigLine.setAttribute('y1', String(ySig));
    sigLine.setAttribute('y2', String(ySig));
    sigLine.setAttribute('stroke', '#ef4444');
    sigLine.setAttribute('stroke-width', '1.5');
    sigLine.setAttribute('stroke-dasharray', '4 4');
    axisGroup.append(sigLine);

    const sigText = document.createElementNS(SVG_NS, 'text');
    sigText.setAttribute('x', String(padLeft + plotW - 6));
    sigText.setAttribute('y', String(ySig - 4));
    sigText.setAttribute('text-anchor', 'end');
    sigText.setAttribute('font-size', '9');
    sigText.setAttribute('font-weight', 'bold');
    sigText.setAttribute('fill', '#ef4444');
    sigText.setAttribute('font-family', 'var(--font-mono)');
    sigText.textContent = 'p = 5 × 10⁻⁸';
    axisGroup.append(sigText);

    // Suggestive threshold line: -log10(1e-5) = 5.0
    const ySug = padTop + plotH - (5.0 / maxNegLog) * plotH;
    const sugLine = document.createElementNS(SVG_NS, 'line');
    sugLine.setAttribute('x1', String(padLeft));
    sugLine.setAttribute('x2', String(padLeft + plotW));
    sugLine.setAttribute('y1', String(ySug));
    sugLine.setAttribute('y2', String(ySug));
    sugLine.setAttribute('stroke', '#3b82f6');
    sugLine.setAttribute('stroke-width', '1');
    sugLine.setAttribute('stroke-dasharray', '2 2');
    axisGroup.append(sugLine);

    // Chromosome band stripes & X labels
    let cumMb = 0;

    gwasResult.preset.chromosomes.forEach((chr) => {
      const xStart = padLeft + (cumMb / totalMb) * plotW;
      const xEnd = padLeft + ((cumMb + chr.lengthMb) / totalMb) * plotW;
      const chrMid = (xStart + xEnd) / 2;

      // X chromosome label
      if (chr.chr <= 12 || chr.chr % 2 === 0) {
        const chrLabel = document.createElementNS(SVG_NS, 'text');
        chrLabel.setAttribute('x', String(chrMid));
        chrLabel.setAttribute('y', String(padTop + plotH + 16));
        chrLabel.setAttribute('text-anchor', 'middle');
        chrLabel.setAttribute('font-size', '9');
        chrLabel.setAttribute('fill', 'var(--color-muted)');
        chrLabel.setAttribute('font-family', 'var(--font-mono)');
        chrLabel.textContent = String(chr.chr);
        axisGroup.append(chrLabel);
      }

      cumMb += chr.lengthMb;
    });

    manhattanSvg.append(axisGroup);

    // Points group
    const pointsGroup = document.createElementNS(SVG_NS, 'g');

    gwasResult.snps.forEach((snp) => {
      if (snp.chr > scanProgressChr) return; // Animated progress filter

      const xPos = padLeft + ((snp.cumPos ?? 0) / totalMb) * plotW;
      const yPos = padTop + plotH - (snp.negLog10P / maxNegLog) * plotH;

      const circle = document.createElementNS(SVG_NS, 'circle');
      circle.setAttribute('cx', String(xPos));
      circle.setAttribute('cy', String(yPos));

      let fillColor = snp.chr % 2 === 0 ? 'var(--color-accent)' : 'var(--color-ink)';
      let r = 2.5;

      if (snp.negLog10P >= 7.301) {
        fillColor = '#ef4444';
        r = 4.0;
      } else if (snp.negLog10P >= 5.0) {
        fillColor = '#f59e0b';
        r = 3.2;
      }

      if (snp.isLead) {
        fillColor = '#dc2626';
        r = 5.5;
        circle.setAttribute('stroke', '#ffffff');
        circle.setAttribute('stroke-width', '1.5');
      }

      if (snp.id === selectedSNP.id) {
        circle.setAttribute('stroke', '#38bdf8');
        circle.setAttribute('stroke-width', '2.5');
      }

      circle.setAttribute('r', String(r));
      circle.setAttribute('fill', fillColor);
      circle.style.cursor = 'pointer';

      // Interactions
      circle.addEventListener('mouseenter', (e) => {
        showTooltipLines(e as MouseEvent, [
          { bold: `${snp.rsid} (${snp.gene})` },
          { text: `chr${snp.chr}:${snp.pos.toLocaleString()}` },
          { text: `p = ${snp.pValue.toExponential(2)} (-log₁₀ P = ${snp.negLog10P})` },
          { text: `β = ${snp.beta > 0 ? '+' : ''}${snp.beta.toFixed(3)} · MAF = ${(snp.maf * 100).toFixed(1)}%` },
        ]);
      });

      circle.addEventListener('mouseleave', hideTooltip);

      circle.addEventListener('click', () => {
        updateInspector(snp);
        renderManhattanPlot();
      });

      pointsGroup.append(circle);
    });

    manhattanSvg.append(pointsGroup);
  }

  function renderQQPlot() {
    if (!qqSvg) return;
    qqSvg.replaceChildren();

    const w = 340;
    const h = 340;
    qqSvg.setAttribute('viewBox', `0 0 ${w} ${h}`);

    const padLeft = 45;
    const padRight = 15;
    const padTop = 20;
    const padBottom = 40;
    const plotW = w - padLeft - padRight;
    const plotH = h - padTop - padBottom;

    const points = gwasResult.qqPoints;
    const maxVal = Math.max(10, ...points.map((p) => Math.max(p.expected, p.observed))) + 0.8;

    const g = document.createElementNS(SVG_NS, 'g');

    // Diagonal Null Line (y = x)
    const nullLine = document.createElementNS(SVG_NS, 'line');
    nullLine.setAttribute('x1', String(padLeft));
    nullLine.setAttribute('y1', String(padTop + plotH));
    nullLine.setAttribute('x2', String(padLeft + plotW));
    nullLine.setAttribute('y2', String(padTop));
    nullLine.setAttribute('stroke', '#ef4444');
    nullLine.setAttribute('stroke-width', '1.5');
    nullLine.setAttribute('stroke-dasharray', '3 3');
    g.append(nullLine);

    // Axes
    const xAxis = document.createElementNS(SVG_NS, 'line');
    xAxis.setAttribute('x1', String(padLeft));
    xAxis.setAttribute('y1', String(padTop + plotH));
    xAxis.setAttribute('x2', String(padLeft + plotW));
    xAxis.setAttribute('y2', String(padTop + plotH));
    xAxis.setAttribute('stroke', 'var(--color-rule)');
    xAxis.setAttribute('stroke-width', '1');
    g.append(xAxis);

    const yAxis = document.createElementNS(SVG_NS, 'line');
    yAxis.setAttribute('x1', String(padLeft));
    yAxis.setAttribute('y1', String(padTop));
    yAxis.setAttribute('x2', String(padLeft));
    yAxis.setAttribute('y2', String(padTop + plotH));
    yAxis.setAttribute('stroke', 'var(--color-rule)');
    yAxis.setAttribute('stroke-width', '1');
    g.append(yAxis);

    // Labels
    const xTitle = document.createElementNS(SVG_NS, 'text');
    xTitle.setAttribute('x', String(padLeft + plotW / 2));
    xTitle.setAttribute('y', String(padTop + plotH + 30));
    xTitle.setAttribute('text-anchor', 'middle');
    xTitle.setAttribute('font-size', '10');
    xTitle.setAttribute('font-weight', '600');
    xTitle.setAttribute('fill', 'var(--color-ink)');
    xTitle.textContent = 'Expected -log₁₀(p)';
    g.append(xTitle);

    const yTitle = document.createElementNS(SVG_NS, 'text');
    yTitle.setAttribute('x', String(-padTop - plotH / 2));
    yTitle.setAttribute('y', '14');
    yTitle.setAttribute('transform', 'rotate(-90)');
    yTitle.setAttribute('text-anchor', 'middle');
    yTitle.setAttribute('font-size', '10');
    yTitle.setAttribute('font-weight', '600');
    yTitle.setAttribute('fill', 'var(--color-ink)');
    yTitle.textContent = 'Observed -log₁₀(p)';
    g.append(yTitle);

    // Points
    points.forEach((pt) => {
      const cx = padLeft + (pt.expected / maxVal) * plotW;
      const cy = padTop + plotH - (pt.observed / maxVal) * plotH;

      const dot = document.createElementNS(SVG_NS, 'circle');
      dot.setAttribute('cx', String(cx));
      dot.setAttribute('cy', String(cy));
      dot.setAttribute('r', pt.observed >= 7.3 ? '3.5' : '2.0');
      dot.setAttribute('fill', pt.observed >= 7.3 ? '#ef4444' : 'var(--color-accent)');
      dot.style.cursor = 'pointer';

      dot.addEventListener('mouseenter', (e) => {
        showTooltipLines(e as MouseEvent, [
          { bold: pt.rsid },
          { text: `Observed: ${pt.observed}` },
          { text: `Expected: ${pt.expected}` },
        ]);
      });
      dot.addEventListener('mouseleave', hideTooltip);

      g.append(dot);
    });

    qqSvg.append(g);
  }

  function renderLocusZoomPlot() {
    if (!locusSvg) return;
    locusSvg.replaceChildren();

    const w = 700;
    const h = 320;
    locusSvg.setAttribute('viewBox', `0 0 ${w} ${h}`);

    const padLeft = 45;
    const padRight = 50;
    const padTop = 20;
    const padBottom = 55;
    const plotW = w - padLeft - padRight;
    const plotH = h - padTop - padBottom;

    const lead = selectedSNP;
    const windowBp = 250_000;
    const minPos = Math.max(0, lead.pos - windowBp);
    const maxPos = lead.pos + windowBp;

    // Filter SNPs within regional window on same chromosome
    const locusSNPs = gwasResult.snps.filter(
      (s) => s.chr === lead.chr && s.pos >= minPos && s.pos <= maxPos
    );

    const maxNegLog = Math.max(10, ...locusSNPs.map((s) => s.negLog10P)) + 1.5;

    const g = document.createElementNS(SVG_NS, 'g');

    // Axes
    const xAxis = document.createElementNS(SVG_NS, 'line');
    xAxis.setAttribute('x1', String(padLeft));
    xAxis.setAttribute('y1', String(padTop + plotH));
    xAxis.setAttribute('x2', String(padLeft + plotW));
    xAxis.setAttribute('y2', String(padTop + plotH));
    xAxis.setAttribute('stroke', 'var(--color-rule)');
    g.append(xAxis);

    // Recombination rate curve overlay (simulated hotspot)
    const recombPath = document.createElementNS(SVG_NS, 'path');
    let d = `M ${padLeft} ${padTop + plotH}`;
    for (let x = 0; x <= plotW; x += 10) {
      const pos = minPos + (x / plotW) * (maxPos - minPos);
      const distToLead = Math.abs(pos - lead.pos);
      // Hotspot spike ~60 cM/Mb flanking
      const recombRate = 5 + 75 * Math.exp(-Math.pow(distToLead - 60_000, 2) / (2 * Math.pow(25_000, 2)));
      const yRecomb = padTop + plotH - (recombRate / 100) * plotH;
      d += ` L ${padLeft + x} ${yRecomb}`;
    }
    recombPath.setAttribute('d', d);
    recombPath.setAttribute('fill', 'none');
    recombPath.setAttribute('stroke', '#38bdf8');
    recombPath.setAttribute('stroke-width', '1.2');
    recombPath.setAttribute('stroke-dasharray', '2 2');
    recombPath.setAttribute('opacity', '0.6');
    g.append(recombPath);

    // Plot locus points with LD r² color scale
    locusSNPs.forEach((snp) => {
      const cx = padLeft + ((snp.pos - minPos) / (maxPos - minPos)) * plotW;
      const cy = padTop + plotH - (snp.negLog10P / maxNegLog) * plotH;

      const r2 = snp.id === lead.id ? 1.0 : (snp.ldLead ?? 0.1);

      let color = '#64748b'; // r2 < 0.2
      if (r2 >= 0.8) color = '#ef4444';
      else if (r2 >= 0.6) color = '#f97316';
      else if (r2 >= 0.4) color = '#10b981';
      else if (r2 >= 0.2) color = '#38bdf8';

      const dot = document.createElementNS(SVG_NS, snp.id === lead.id ? 'polygon' : 'circle');

      if (snp.id === lead.id) {
        // Diamond for lead variant
        const sz = 7;
        dot.setAttribute(
          'points',
          `${cx},${cy - sz} ${cx + sz},${cy} ${cx},${cy + sz} ${cx - sz},${cy}`
        );
        dot.setAttribute('fill', '#dc2626');
        dot.setAttribute('stroke', '#ffffff');
        dot.setAttribute('stroke-width', '1.5');
      } else {
        dot.setAttribute('cx', String(cx));
        dot.setAttribute('cy', String(cy));
        dot.setAttribute('r', '4');
        dot.setAttribute('fill', color);
        dot.setAttribute('stroke', 'rgba(0,0,0,0.15)');
        dot.setAttribute('stroke-width', '0.75');
      }

      dot.style.cursor = 'pointer';
      dot.addEventListener('mouseenter', (e) => {
        showTooltipLines(e as MouseEvent, [
          { bold: `${snp.rsid} (${snp.gene})` },
          { text: `Pos: chr${snp.chr}:${snp.pos.toLocaleString()}` },
          { text: `LD with Lead: r² = ${r2.toFixed(2)}` },
          { text: `p = ${snp.pValue.toExponential(2)} (-log₁₀ P = ${snp.negLog10P})` },
        ]);
      });
      dot.addEventListener('mouseleave', hideTooltip);
      dot.addEventListener('click', () => updateInspector(snp));

      g.append(dot);
    });

    // Gene annotation track beneath
    const geneBox = document.createElementNS(SVG_NS, 'rect');
    geneBox.setAttribute('x', String(padLeft + plotW * 0.35));
    geneBox.setAttribute('y', String(padTop + plotH + 18));
    geneBox.setAttribute('width', String(plotW * 0.3));
    geneBox.setAttribute('height', '12');
    geneBox.setAttribute('rx', '3');
    geneBox.setAttribute('fill', 'var(--color-accent)');
    geneBox.setAttribute('opacity', '0.8');
    g.append(geneBox);

    const geneText = document.createElementNS(SVG_NS, 'text');
    geneText.setAttribute('x', String(padLeft + plotW * 0.5));
    geneText.setAttribute('y', String(padTop + plotH + 28));
    geneText.setAttribute('text-anchor', 'middle');
    geneText.setAttribute('font-size', '9');
    geneText.setAttribute('font-weight', 'bold');
    geneText.setAttribute('fill', 'var(--color-on-accent)');
    geneText.textContent = lead.gene;
    g.append(geneText);

    locusSvg.append(g);
  }

  function renderRegressionPlot() {
    if (!regrSvg) return;
    regrSvg.replaceChildren();

    const w = 450;
    const h = 320;
    regrSvg.setAttribute('viewBox', `0 0 ${w} ${h}`);

    const padLeft = 45;
    const padRight = 20;
    const padTop = 20;
    const padBottom = 40;
    const plotW = w - padLeft - padRight;
    const plotH = h - padTop - padBottom;

    const cohort = gwasResult.preset.sampleCohort;

    // Genotypes (0, 1, 2)
    const xVals = cohort.map((ind) => ind.genotypes[0]);
    const yVals = cohort.map((ind) => ind.phenotype);

    const regr = computeLinearRegression(xVals, yVals);

    if (regrFormulaEl) {
      regrFormulaEl.replaceChildren();
      const avgY = (yVals.reduce((a, b) => a + b, 0) / yVals.length).toFixed(2);
      const span1 = document.createElement('span');
      span1.textContent = `OLS Model: y = ${avgY} + `;
      const strongBeta = document.createElement('strong');
      strongBeta.textContent = `${regr.beta > 0 ? '+' : ''}${regr.beta.toFixed(3)}`;
      const span2 = document.createElement('span');
      span2.textContent = ` × Dosage  |  SE = ${regr.se.toFixed(3)} · t = ${regr.tStat.toFixed(2)} · p = ${regr.pValue.toExponential(2)}`;
      regrFormulaEl.append(span1, strongBeta, span2);
    }

    const g = document.createElementNS(SVG_NS, 'g');

    const minY = Math.min(...yVals) - 0.5;
    const maxY = Math.max(...yVals) + 0.5;

    // X Positions for 0, 1, 2
    const xPos0 = padLeft + (0.5 / 3) * plotW;
    const xPos1 = padLeft + (1.5 / 3) * plotW;
    const xPos2 = padLeft + (2.5 / 3) * plotW;

    // Regression line
    const yFit0 = padTop + plotH - ((regr.beta * 0 + (yVals[0] - regr.beta * xVals[0]) - minY) / (maxY - minY)) * plotH;
    const yFit2 = padTop + plotH - ((regr.beta * 2 + (yVals[0] - regr.beta * xVals[0]) - minY) / (maxY - minY)) * plotH;

    const line = document.createElementNS(SVG_NS, 'line');
    line.setAttribute('x1', String(xPos0));
    line.setAttribute('y1', String(yFit0));
    line.setAttribute('x2', String(xPos2));
    line.setAttribute('y2', String(yFit2));
    line.setAttribute('stroke', '#ef4444');
    line.setAttribute('stroke-width', '2.5');
    g.append(line);

    // Draw individual points with jitter
    cohort.forEach((ind) => {
      const gType = ind.genotypes[0];
      const basePos = gType === 0 ? xPos0 : gType === 1 ? xPos1 : xPos2;
      const jitter = (Math.random() - 0.5) * 28;
      const cx = basePos + jitter;
      const cy = padTop + plotH - ((ind.phenotype - minY) / (maxY - minY)) * plotH;

      const circle = document.createElementNS(SVG_NS, 'circle');
      circle.setAttribute('cx', String(cx));
      circle.setAttribute('cy', String(cy));
      circle.setAttribute('r', '4');
      circle.setAttribute('fill', ind.isCase ? '#ef4444' : 'var(--color-accent)');
      circle.setAttribute('opacity', '0.75');

      g.append(circle);
    });

    // X Axis Labels
    ['0 (Ref/Ref)', '1 (Ref/Alt)', '2 (Alt/Alt)'].forEach((label, idx) => {
      const xPos = idx === 0 ? xPos0 : idx === 1 ? xPos1 : xPos2;
      const text = document.createElementNS(SVG_NS, 'text');
      text.setAttribute('x', String(xPos));
      text.setAttribute('y', String(padTop + plotH + 18));
      text.setAttribute('text-anchor', 'middle');
      text.setAttribute('font-size', '10');
      text.setAttribute('font-weight', '600');
      text.setAttribute('fill', 'var(--color-ink)');
      text.textContent = label;
      g.append(text);
    });

    regrSvg.append(g);
  }

  function renderPCAPlot() {
    if (!pcaSvg) return;
    pcaSvg.replaceChildren();

    const w = 450;
    const h = 320;
    pcaSvg.setAttribute('viewBox', `0 0 ${w} ${h}`);

    const pad = 40;
    const plotW = w - 2 * pad;
    const plotH = h - 2 * pad;

    const cohort = gwasResult.preset.sampleCohort;

    const g = document.createElementNS(SVG_NS, 'g');

    // Axes
    const xMid = pad + plotW / 2;
    const yMid = pad + plotH / 2;

    const axX = document.createElementNS(SVG_NS, 'line');
    axX.setAttribute('x1', String(pad));
    axX.setAttribute('y1', String(yMid));
    axX.setAttribute('x2', String(pad + plotW));
    axX.setAttribute('y2', String(yMid));
    axX.setAttribute('stroke', 'var(--color-rule)');
    g.append(axX);

    const axY = document.createElementNS(SVG_NS, 'line');
    axY.setAttribute('x1', String(xMid));
    axY.setAttribute('y1', String(pad));
    axY.setAttribute('x2', String(xMid));
    axY.setAttribute('y2', String(pad + plotH));
    axY.setAttribute('stroke', 'var(--color-rule)');
    g.append(axY);

    const colors: Record<string, string> = {
      EUR: '#3b82f6',
      EAS: '#f97316',
      AFR: '#a855f7',
      SAS: '#10b981',
    };

    cohort.forEach((ind) => {
      const cx = xMid + (ind.pc1 / 0.08) * (plotW / 2);
      const cy = yMid - (ind.pc2 / 0.08) * (plotH / 2);

      const circle = document.createElementNS(SVG_NS, 'circle');
      circle.setAttribute('cx', String(cx));
      circle.setAttribute('cy', String(cy));
      circle.setAttribute('r', '5');
      circle.setAttribute('fill', colors[ind.ancestry] || 'var(--color-accent)');
      circle.setAttribute('opacity', '0.85');
      circle.style.cursor = 'pointer';

      circle.addEventListener('mouseenter', (e) => {
        showTooltipLines(e as MouseEvent, [
          { bold: `${ind.id} (${ind.ancestry})` },
          { text: `PC1: ${ind.pc1}` },
          { text: `PC2: ${ind.pc2}` },
        ]);
      });
      circle.addEventListener('mouseleave', hideTooltip);

      g.append(circle);
    });

    pcaSvg.append(g);
  }

  function renderPRSPlot() {
    if (!prsSvg) return;
    prsSvg.replaceChildren();

    const w = 450;
    const h = 320;
    prsSvg.setAttribute('viewBox', `0 0 ${w} ${h}`);

    const padLeft = 40;
    const padRight = 20;
    const padTop = 20;
    const padBottom = 40;
    const plotW = w - padLeft - padRight;
    const plotH = h - padTop - padBottom;

    const g = document.createElementNS(SVG_NS, 'g');

    // Controls bell curve (mean = 0, sd = 1)
    const pathCtrl = document.createElementNS(SVG_NS, 'path');
    let dCtrl = `M ${padLeft} ${padTop + plotH}`;
    for (let x = -3.5; x <= 3.5; x += 0.1) {
      const yVal = Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);
      const px = padLeft + ((x + 3.5) / 7.0) * plotW;
      const py = padTop + plotH - (yVal / 0.45) * plotH;
      dCtrl += ` L ${px} ${py}`;
    }
    pathCtrl.setAttribute('d', dCtrl);
    pathCtrl.setAttribute('fill', 'rgba(59, 130, 246, 0.15)');
    pathCtrl.setAttribute('stroke', '#3b82f6');
    pathCtrl.setAttribute('stroke-width', '2');
    g.append(pathCtrl);

    // Cases bell curve shifted by heritability
    const pathCase = document.createElementNS(SVG_NS, 'path');
    let dCase = `M ${padLeft} ${padTop + plotH}`;
    for (let x = -3.5; x <= 3.5; x += 0.1) {
      const xShift = x - 1.2; // Shifted liability
      const yVal = Math.exp(-0.5 * xShift * xShift) / Math.sqrt(2 * Math.PI);
      const px = padLeft + ((x + 3.5) / 7.0) * plotW;
      const py = padTop + plotH - (yVal / 0.45) * plotH;
      dCase += ` L ${px} ${py}`;
    }
    pathCase.setAttribute('d', dCase);
    pathCase.setAttribute('fill', 'rgba(239, 68, 68, 0.15)');
    pathCase.setAttribute('stroke', '#ef4444');
    pathCase.setAttribute('stroke-width', '2');
    g.append(pathCase);

    prsSvg.append(g);
  }

  function showTooltipLines(e: MouseEvent, lines: Array<{ bold?: string; text?: string }>) {
    if (!tooltipEl) return;
    tooltipEl.replaceChildren();
    lines.forEach((line) => {
      const row = document.createElement('div');
      if (line.bold) {
        const strong = document.createElement('strong');
        strong.textContent = line.bold;
        row.append(strong);
      }
      if (line.text) {
        if (line.bold) row.append(document.createTextNode(' '));
        const span = document.createElement('span');
        span.textContent = line.text;
        row.append(span);
      }
      tooltipEl.append(row);
    });
    tooltipEl.style.display = 'block';
    tooltipEl.style.left = `${e.clientX + window.scrollX}px`;
    tooltipEl.style.top = `${e.clientY + window.scrollY - 10}px`;
  }

  function hideTooltip() {
    if (!tooltipEl) return;
    tooltipEl.style.display = 'none';
  }

  function renderAll() {
    updateTelemetry();
    renderManhattanPlot();
    renderQQPlot();
    renderLocusZoomPlot();
    renderRegressionPlot();
    renderPCAPlot();
    renderPRSPlot();
    updateInspector(selectedSNP);
  }

  // ------------------------------------------------------------- Stepping --

  function stepScan() {
    if (scanProgressChr < 22) {
      scanProgressChr++;
      renderManhattanPlot();
      if (scanProgressChr === 22) {
        pauseScan();
      }
    }
  }

  function playScan() {
    if (isScanning) return;
    isScanning = true;
    if (scanProgressChr >= 22) {
      scanProgressChr = 1;
    }
    if (scanBtn) scanBtn.textContent = '⏸ Pause Scan';
    scanTimer = window.setInterval(stepScan, scanSpeedMs);
  }

  function pauseScan() {
    isScanning = false;
    if (scanBtn) scanBtn.textContent = '▶ Run Genome-Wide Scan';
    if (scanTimer !== null) {
      clearInterval(scanTimer);
      scanTimer = null;
    }
  }

  function toggleScan() {
    if (isScanning) pauseScan();
    else playScan();
  }

  function resetScan() {
    pauseScan();
    scanProgressChr = 22;
    renderAll();
  }

  // ----------------------------------------------------------- Event Handlers --

  presetBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      presetBtns.forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      currentPresetId = btn.dataset.gwasPreset || 't2d';
      gwasResult = runGWAS(currentPresetId, adjustPCA);
      selectedSNP = gwasResult.leadSNPs[0] || gwasResult.snps[0];
      scanProgressChr = 22;
      pauseScan();
      renderAll();
    });
  });

  tabBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      tabBtns.forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      currentTab = btn.dataset.gwasTab || 'manhattan';

      tabPanels.forEach((panel) => {
        const pTab = panel.dataset.gwasPanel;
        panel.hidden = pTab !== currentTab;
      });

      renderAll();
    });
  });

  scanBtn?.addEventListener('click', toggleScan);
  resetBtn?.addEventListener('click', resetScan);

  pcaToggle?.addEventListener('change', () => {
    adjustPCA = pcaToggle.checked;
    gwasResult = runGWAS(currentPresetId, adjustPCA);
    renderAll();
  });

  speedSelect?.addEventListener('change', () => {
    scanSpeedMs = parseInt(speedSelect.value, 10);
    if (isScanning) {
      pauseScan();
      playScan();
    }
  });

  function handleKeydown(e: KeyboardEvent) {
    const tag = (e.target as HTMLElement)?.tagName?.toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select') return;

    if (e.code === 'Space') {
      e.preventDefault();
      toggleScan();
    } else if (e.code === 'ArrowRight' || e.key === 'l' || e.key === 'n') {
      e.preventDefault();
      // Cycle to next lead SNP
      const leads = gwasResult.leadSNPs;
      if (leads.length > 0) {
        const curIdx = leads.findIndex((s) => s.id === selectedSNP.id);
        const nextIdx = (curIdx + 1) % leads.length;
        updateInspector(leads[nextIdx]);
      }
    } else if (e.code === 'ArrowLeft' || e.key === 'j' || e.key === 'p') {
      e.preventDefault();
      // Cycle to previous lead SNP
      const leads = gwasResult.leadSNPs;
      if (leads.length > 0) {
        const curIdx = leads.findIndex((s) => s.id === selectedSNP.id);
        const prevIdx = (curIdx - 1 + leads.length) % leads.length;
        updateInspector(leads[prevIdx]);
      }
    } else if (e.key === 'r' || e.key === 'R') {
      e.preventDefault();
      resetScan();
    }
  }

  window.addEventListener('keydown', handleKeydown);

  // Initial build
  renderAll();

  return {
    destroy: () => {
      pauseScan();
      hideTooltip();
      window.removeEventListener('keydown', handleKeydown);
    },
  };
}
