/**
 * Client Controller for GWAS Deep Dive Post Interactive Widgets (/deep_dive/gwas/).
 * Pure DOM & SVG node creation ensuring high performance and 0 security audit sinks.
 */

import {
  computeLinearRegression,
  runGWAS,
} from '../lib/gwas';

export interface DeepDiveGwasController {
  destroy: () => void;
}

const SVG_NS = 'http://www.w3.org/2000/svg';

export function initDeepDiveGwas(root: ParentNode = document): DeepDiveGwasController | null {
  const container = root.querySelector<HTMLElement>('[data-deep-dive-gwas]');
  if (!container) return null;
  if (container.dataset.ddReady === 'true') return null;
  container.dataset.ddReady = 'true';

  // --------------------------------------------------------------------------
  // Widget 1: Single-Variant OLS Regression Sandbox
  // --------------------------------------------------------------------------
  const regrSvg = container.querySelector<SVGSVGElement>('[data-dd-regr-svg]');
  const betaSlider = container.querySelector<HTMLInputElement>('[data-dd-beta-slider]');
  const betaVal = container.querySelector<HTMLElement>('[data-dd-beta-val]');
  const mafSlider = container.querySelector<HTMLInputElement>('[data-dd-maf-slider]');
  const mafVal = container.querySelector<HTMLElement>('[data-dd-maf-val]');
  const regrStats = container.querySelector<HTMLElement>('[data-dd-regr-stats]');

  function updateRegressionWidget() {
    if (!regrSvg) return;
    regrSvg.replaceChildren();

    const targetBeta = parseFloat(betaSlider?.value || '0.35');
    const targetMaf = parseFloat(mafSlider?.value || '0.25');

    if (betaVal) betaVal.textContent = `${targetBeta > 0 ? '+' : ''}${targetBeta.toFixed(2)}`;
    if (mafVal) mafVal.textContent = `${(targetMaf * 100).toFixed(0)}%`;

    const w = 420;
    const h = 260;
    regrSvg.setAttribute('viewBox', `0 0 ${w} ${h}`);

    const padLeft = 40;
    const padRight = 20;
    const padTop = 20;
    const padBottom = 35;
    const plotW = w - padLeft - padRight;
    const plotH = h - padTop - padBottom;

    // Simulate N = 80 samples under HWE
    const p = targetMaf;
    const p0 = (1 - p) * (1 - p);
    const p1 = 2 * p * (1 - p);
    const n = 80;

    const xVals: number[] = [];
    const yVals: number[] = [];

    // Deterministic pseudo-random sequence for stable rendering
    for (let i = 0; i < n; i++) {
      const r = (Math.sin(i * 997 + 13) + 1) / 2;
      const g = r < p0 ? 0 : r < p0 + p1 ? 1 : 2;
      const noise = ((Math.cos(i * 331 + 7) + 1) / 2 - 0.5) * 1.4;
      const y = targetBeta * g + noise;
      xVals.push(g);
      yVals.push(y);
    }

    const regr = computeLinearRegression(xVals, yVals);

    if (regrStats) {
      regrStats.replaceChildren();
      const span = document.createElement('span');
      span.textContent = `Slope β̂ = ${regr.beta.toFixed(3)} | SE = ${regr.se.toFixed(3)} | t = ${regr.tStat.toFixed(2)} | p = ${regr.pValue.toExponential(2)}`;
      regrStats.append(span);
    }

    const g = document.createElementNS(SVG_NS, 'g');

    // Axes
    const xAxis = document.createElementNS(SVG_NS, 'line');
    xAxis.setAttribute('x1', String(padLeft));
    xAxis.setAttribute('y1', String(padTop + plotH));
    xAxis.setAttribute('x2', String(padLeft + plotW));
    xAxis.setAttribute('y2', String(padTop + plotH));
    xAxis.setAttribute('stroke', 'var(--color-rule)');
    g.append(xAxis);

    const xPos0 = padLeft + (0.5 / 3) * plotW;
    const xPos1 = padLeft + (1.5 / 3) * plotW;
    const xPos2 = padLeft + (2.5 / 3) * plotW;

    const minY = -2.5;
    const maxY = 2.5;

    // Regression slope line
    const yFit0 = padTop + plotH - ((regr.beta * 0 - minY) / (maxY - minY)) * plotH;
    const yFit2 = padTop + plotH - ((regr.beta * 2 - minY) / (maxY - minY)) * plotH;

    const slopeLine = document.createElementNS(SVG_NS, 'line');
    slopeLine.setAttribute('x1', String(xPos0));
    slopeLine.setAttribute('y1', String(yFit0));
    slopeLine.setAttribute('x2', String(xPos2));
    slopeLine.setAttribute('y2', String(yFit2));
    slopeLine.setAttribute('stroke', '#ef4444');
    slopeLine.setAttribute('stroke-width', '2.5');
    g.append(slopeLine);

    // Individual Points
    for (let i = 0; i < n; i++) {
      const gType = xVals[i];
      const basePos = gType === 0 ? xPos0 : gType === 1 ? xPos1 : xPos2;
      const jitter = (((Math.sin(i * 127) + 1) / 2) - 0.5) * 26;
      const cx = basePos + jitter;
      const cy = padTop + plotH - ((yVals[i] - minY) / (maxY - minY)) * plotH;

      const dot = document.createElementNS(SVG_NS, 'circle');
      dot.setAttribute('cx', String(cx));
      dot.setAttribute('cy', String(cy));
      dot.setAttribute('r', '3.5');
      dot.setAttribute('fill', 'var(--color-accent)');
      dot.setAttribute('opacity', '0.75');
      g.append(dot);
    }

    // X Labels
    ['0 (Ref/Ref)', '1 (Ref/Alt)', '2 (Alt/Alt)'].forEach((lbl, idx) => {
      const pos = idx === 0 ? xPos0 : idx === 1 ? xPos1 : xPos2;
      const text = document.createElementNS(SVG_NS, 'text');
      text.setAttribute('x', String(pos));
      text.setAttribute('y', String(padTop + plotH + 18));
      text.setAttribute('text-anchor', 'middle');
      text.setAttribute('font-size', '9');
      text.setAttribute('font-weight', '600');
      text.setAttribute('fill', 'var(--color-ink)');
      text.textContent = lbl;
      g.append(text);
    });

    regrSvg.append(g);
  }

  // --------------------------------------------------------------------------
  // Widget 2: Population Stratification & Q-Q Confounding Simulator
  // --------------------------------------------------------------------------
  const pcaSvg = container.querySelector<SVGSVGElement>('[data-dd-pca-svg]');
  const qqSvg = container.querySelector<SVGSVGElement>('[data-dd-qq-svg]');
  const pcaToggle = container.querySelector<HTMLInputElement>('[data-dd-pca-toggle]');
  const lambdaReadout = container.querySelector<HTMLElement>('[data-dd-lambda-readout]');

  function updatePCAWidget() {
    if (!pcaSvg || !qqSvg) return;
    pcaSvg.replaceChildren();
    qqSvg.replaceChildren();

    const isAdjusted = pcaToggle?.checked ?? true;
    const gwas = runGWAS('stratified', isAdjusted);

    if (lambdaReadout) {
      lambdaReadout.textContent = `λ_GC = ${gwas.lambdaGC} (${isAdjusted ? 'Controlled Null' : 'Severe Ancestry Confounding'})`;
      lambdaReadout.style.color = isAdjusted ? '#10b981' : '#ef4444';
    }

    // 1. Draw PCA Scatter Plot
    const w = 320;
    const h = 260;
    pcaSvg.setAttribute('viewBox', `0 0 ${w} ${h}`);

    const pad = 30;
    const plotW = w - 2 * pad;
    const plotH = h - 2 * pad;
    const xMid = pad + plotW / 2;
    const yMid = pad + plotH / 2;

    const gPca = document.createElementNS(SVG_NS, 'g');

    const axX = document.createElementNS(SVG_NS, 'line');
    axX.setAttribute('x1', String(pad));
    axX.setAttribute('y1', String(yMid));
    axX.setAttribute('x2', String(pad + plotW));
    axX.setAttribute('y2', String(yMid));
    axX.setAttribute('stroke', 'var(--color-rule)');
    gPca.append(axX);

    const axY = document.createElementNS(SVG_NS, 'line');
    axY.setAttribute('x1', String(xMid));
    axY.setAttribute('y1', String(pad));
    axY.setAttribute('x2', String(xMid));
    axY.setAttribute('y2', String(pad + plotH));
    axY.setAttribute('stroke', 'var(--color-rule)');
    gPca.append(axY);

    const colors: Record<string, string> = {
      EUR: '#3b82f6',
      EAS: '#f97316',
      AFR: '#a855f7',
      SAS: '#10b981',
    };

    gwas.preset.sampleCohort.forEach((ind) => {
      const cx = xMid + (ind.pc1 / 0.08) * (plotW / 2);
      const cy = yMid - (ind.pc2 / 0.08) * (plotH / 2);
      const dot = document.createElementNS(SVG_NS, 'circle');
      dot.setAttribute('cx', String(cx));
      dot.setAttribute('cy', String(cy));
      dot.setAttribute('r', '4');
      dot.setAttribute('fill', colors[ind.ancestry] || 'var(--color-accent)');
      dot.setAttribute('opacity', '0.85');
      gPca.append(dot);
    });

    pcaSvg.append(gPca);

    // 2. Draw Q-Q Plot
    qqSvg.setAttribute('viewBox', `0 0 ${w} ${h}`);
    const gQq = document.createElementNS(SVG_NS, 'g');

    const nullLine = document.createElementNS(SVG_NS, 'line');
    nullLine.setAttribute('x1', String(pad));
    nullLine.setAttribute('y1', String(pad + plotH));
    nullLine.setAttribute('x2', String(pad + plotW));
    nullLine.setAttribute('y2', String(pad));
    nullLine.setAttribute('stroke', '#ef4444');
    nullLine.setAttribute('stroke-width', '1.5');
    nullLine.setAttribute('stroke-dasharray', '3 3');
    gQq.append(nullLine);

    const maxVal = 10;
    gwas.qqPoints.forEach((pt) => {
      const cx = pad + (pt.expected / maxVal) * plotW;
      const cy = pad + plotH - (pt.observed / maxVal) * plotH;
      const dot = document.createElementNS(SVG_NS, 'circle');
      dot.setAttribute('cx', String(cx));
      dot.setAttribute('cy', String(cy));
      dot.setAttribute('r', '2.5');
      dot.setAttribute('fill', isAdjusted ? 'var(--color-accent)' : '#ef4444');
      dot.setAttribute('opacity', '0.75');
      gQq.append(dot);
    });

    qqSvg.append(gQq);
  }

  // --------------------------------------------------------------------------
  // Widget 3: Multi-Chromosome Manhattan Plot Explorer with Presets
  // --------------------------------------------------------------------------
  const manhattanSvg = container.querySelector<SVGSVGElement>('[data-dd-manhattan-svg]');
  const presetBtns = container.querySelectorAll<HTMLButtonElement>('[data-dd-preset]');
  const leadCard = container.querySelector<HTMLElement>('[data-dd-lead-card]');
  let currentPreset = 't2d';

  function updateManhattanWidget() {
    if (!manhattanSvg) return;
    manhattanSvg.replaceChildren();

    const gwas = runGWAS(currentPreset, true);
    const lead = gwas.leadSNPs[0] || gwas.snps[0];

    if (leadCard) {
      leadCard.replaceChildren();
      const title = document.createElement('strong');
      title.textContent = `Lead Hit: ${lead.rsid} (${lead.gene}) — chr${lead.chr}:${lead.pos.toLocaleString()}`;
      const stats = document.createElement('div');
      stats.textContent = `p = ${lead.pValue.toExponential(2)} (-log₁₀ P = ${lead.negLog10P}) | β = ${lead.beta > 0 ? '+' : ''}${lead.beta.toFixed(3)} | MAF = ${(lead.maf * 100).toFixed(1)}% | ${lead.consequence}`;
      stats.style.fontSize = '0.78rem';
      stats.style.color = 'var(--color-muted)';
      stats.style.marginTop = '0.2rem';
      leadCard.append(title, stats);
    }

    const w = 700;
    const h = 260;
    manhattanSvg.setAttribute('viewBox', `0 0 ${w} ${h}`);

    const padLeft = 40;
    const padRight = 15;
    const padTop = 20;
    const padBottom = 30;
    const plotW = w - padLeft - padRight;
    const plotH = h - padTop - padBottom;

    const totalMb = gwas.preset.chromosomes.reduce((acc, c) => acc + c.lengthMb, 0);
    const maxNegLog = Math.max(12, ...gwas.snps.map((s) => s.negLog10P)) + 1.0;

    const g = document.createElementNS(SVG_NS, 'g');

    // Significance threshold
    const ySig = padTop + plotH - (7.301 / maxNegLog) * plotH;
    const sigLine = document.createElementNS(SVG_NS, 'line');
    sigLine.setAttribute('x1', String(padLeft));
    sigLine.setAttribute('x2', String(padLeft + plotW));
    sigLine.setAttribute('y1', String(ySig));
    sigLine.setAttribute('y2', String(ySig));
    sigLine.setAttribute('stroke', '#ef4444');
    sigLine.setAttribute('stroke-width', '1.2');
    sigLine.setAttribute('stroke-dasharray', '3 3');
    g.append(sigLine);

    // SNPs
    gwas.snps.forEach((snp) => {
      const xPos = padLeft + ((snp.cumPos ?? 0) / totalMb) * plotW;
      const yPos = padTop + plotH - (snp.negLog10P / maxNegLog) * plotH;

      const circle = document.createElementNS(SVG_NS, 'circle');
      circle.setAttribute('cx', String(xPos));
      circle.setAttribute('cy', String(yPos));

      let fill = snp.chr % 2 === 0 ? 'var(--color-accent)' : 'var(--color-ink)';
      let r = '2.2';

      if (snp.negLog10P >= 7.301) {
        fill = '#ef4444';
        r = '3.5';
      }
      if (snp.isLead) {
        fill = '#dc2626';
        r = '5.0';
        circle.setAttribute('stroke', '#ffffff');
        circle.setAttribute('stroke-width', '1');
      }

      circle.setAttribute('r', r);
      circle.setAttribute('fill', fill);
      circle.style.cursor = 'pointer';

      circle.addEventListener('click', () => {
        if (leadCard) {
          leadCard.replaceChildren();
          const title = document.createElement('strong');
          title.textContent = `Selected SNP: ${snp.rsid} (${snp.gene}) — chr${snp.chr}:${snp.pos.toLocaleString()}`;
          const stats = document.createElement('div');
          stats.textContent = `p = ${snp.pValue.toExponential(2)} (-log₁₀ P = ${snp.negLog10P}) | β = ${snp.beta > 0 ? '+' : ''}${snp.beta.toFixed(3)} | MAF = ${(snp.maf * 100).toFixed(1)}% | ${snp.consequence}`;
          stats.style.fontSize = '0.78rem';
          stats.style.color = 'var(--color-muted)';
          stats.style.marginTop = '0.2rem';
          leadCard.append(title, stats);
        }
      });

      g.append(circle);
    });

    manhattanSvg.append(g);
  }

  // --------------------------------------------------------------------------
  // Widget 4: Polygenic Risk Score (PRS) Bell Curve
  // --------------------------------------------------------------------------
  const prsSvg = container.querySelector<SVGSVGElement>('[data-dd-prs-svg]');
  const prsSlider = container.querySelector<HTMLInputElement>('[data-dd-prs-slider]');
  const prsReadout = container.querySelector<HTMLElement>('[data-dd-prs-readout]');

  function updatePrsWidget() {
    if (!prsSvg) return;
    prsSvg.replaceChildren();

    const percentile = parseInt(prsSlider?.value || '85', 10);
    const zScore = (percentile - 50) / 18; // approx z
    const oddsRatio = Math.exp(Math.max(0, zScore * 0.45));

    if (prsReadout) {
      prsReadout.textContent = `${percentile}th Percentile (Z = ${zScore.toFixed(2)}) → Odds Ratio OR = ${oddsRatio.toFixed(2)}×`;
      prsReadout.style.color = percentile >= 90 ? '#ef4444' : percentile >= 75 ? '#f59e0b' : 'var(--color-accent)';
    }

    const w = 420;
    const h = 240;
    prsSvg.setAttribute('viewBox', `0 0 ${w} ${h}`);

    const padLeft = 35;
    const padRight = 20;
    const padTop = 20;
    const padBottom = 30;
    const plotW = w - padLeft - padRight;
    const plotH = h - padTop - padBottom;

    const g = document.createElementNS(SVG_NS, 'g');

    // Controls bell curve
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

    // Marker for user percentile
    const userPx = padLeft + ((zScore + 3.5) / 7.0) * plotW;
    const userLine = document.createElementNS(SVG_NS, 'line');
    userLine.setAttribute('x1', String(userPx));
    userLine.setAttribute('y1', String(padTop));
    userLine.setAttribute('x2', String(userPx));
    userLine.setAttribute('y2', String(padTop + plotH));
    userLine.setAttribute('stroke', '#ef4444');
    userLine.setAttribute('stroke-width', '2.5');
    userLine.setAttribute('stroke-dasharray', '3 3');
    g.append(userLine);

    const marker = document.createElementNS(SVG_NS, 'circle');
    marker.setAttribute('cx', String(userPx));
    marker.setAttribute('cy', String(padTop + 10));
    marker.setAttribute('r', '5');
    marker.setAttribute('fill', '#ef4444');
    g.append(marker);

    prsSvg.append(g);
  }

  // --------------------------------------------------------------------------
  // Event Listeners & Binding
  // --------------------------------------------------------------------------
  betaSlider?.addEventListener('input', updateRegressionWidget);
  mafSlider?.addEventListener('input', updateRegressionWidget);
  pcaToggle?.addEventListener('change', updatePCAWidget);
  prsSlider?.addEventListener('input', updatePrsWidget);

  presetBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      presetBtns.forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      currentPreset = btn.dataset.ddPreset || 't2d';
      updateManhattanWidget();
    });
  });

  // Initial renders
  updateRegressionWidget();
  updatePCAWidget();
  updateManhattanWidget();
  updatePrsWidget();

  return {
    destroy: () => {},
  };
}
