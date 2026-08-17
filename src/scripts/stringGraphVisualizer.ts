/**
 * String Graphs & Overlap-Layout-Consensus (OLC) Client Visualizer Controller.
 * Pure DOM and SVG node creation.
 */

import {
  buildOverlapGraph,
  type StringGraphResult,
} from '../lib/stringGraph';

export interface StringGraphVisualizerController {
  destroy: () => void;
}

export function initStringGraphVisualizer(root: ParentNode = document): StringGraphVisualizerController | null {
  const container = root.querySelector<HTMLElement>('[data-sg-visualizer]');
  if (!container) return null;
  if (container.dataset.sgReady === 'true') return null;
  container.dataset.sgReady = 'true';

  // DOM Elements
  const seqTextarea = container.querySelector<HTMLTextAreaElement>('[data-sg-input]');
  const overlapSlider = container.querySelector<HTMLInputElement>('[data-sg-overlap]');
  const overlapVal = container.querySelector<HTMLElement>('[data-sg-overlap-val]');
  const presetBtns = container.querySelectorAll<HTMLButtonElement>('[data-sg-preset]');

  const modeRawBtn = container.querySelector<HTMLButtonElement>('[data-sg-mode-raw]');
  const modeReducedBtn = container.querySelector<HTMLButtonElement>('[data-sg-mode-reduced]');

  const svgCanvas = container.querySelector<SVGSVGElement>('[data-sg-svg]');
  const calcBox = container.querySelector<HTMLElement>('[data-sg-calc-box]');
  const contigLine = container.querySelector<HTMLElement>('[data-sg-contig-line]');
  const tilingTrack = container.querySelector<HTMLElement>('[data-sg-tiling-track]');

  const readsVal = container.querySelector<HTMLElement>('[data-sg-reads]');
  const rawEdgesVal = container.querySelector<HTMLElement>('[data-sg-raw-edges]');
  const reducedEdgesVal = container.querySelector<HTMLElement>('[data-sg-reduced-edges]');
  const transitiveVal = container.querySelector<HTMLElement>('[data-sg-transitive]');
  const n50Val = container.querySelector<HTMLElement>('[data-sg-n50]');

  const playBtn = container.querySelector<HTMLButtonElement>('[data-sg-play]');
  const prevBtn = container.querySelector<HTMLButtonElement>('[data-sg-prev]');
  const nextBtn = container.querySelector<HTMLButtonElement>('[data-sg-next]');
  const resetBtn = container.querySelector<HTMLButtonElement>('[data-sg-reset]');
  const speedSelect = container.querySelector<HTMLSelectElement>('[data-sg-speed]');
  const stepIndicator = container.querySelector<HTMLElement>('[data-sg-step-indicator]');

  // State
  let minOverlap = parseInt(overlapSlider?.value || '4', 10);
  let viewMode: 'raw' | 'reduced' = 'reduced';
  let graphData: StringGraphResult = buildOverlapGraph(
    seqTextarea?.value || 'ACGTAGCTAG, GCTAGCGTAA, CGTAATTTTT',
    minOverlap,
  );

  let currentStepIdx = -1;
  let isPlaying = false;
  let timerId: number | null = null;
  let speedMs = parseInt(speedSelect?.value || '1200', 10);
  let hoveredItem: { type: 'node' | 'edge'; id: string; label: string; desc: string } | null = null;

  function rebuild() {
    const raw = seqTextarea?.value || 'ACGTAGCTAG, GCTAGCGTAA, CGTAATTTTT';
    minOverlap = parseInt(overlapSlider?.value || '4', 10);
    if (overlapVal) overlapVal.textContent = String(minOverlap);

    graphData = buildOverlapGraph(raw, minOverlap);
    currentStepIdx = -1;
    hoveredItem = null;
    pause();
    renderAll();
  }

  // ------------------------------------------------------------- Renderers --

  function renderAssemblyBanner() {
    if (readsVal) readsVal.textContent = String(graphData.stats.numReads);
    if (rawEdgesVal) rawEdgesVal.textContent = String(graphData.stats.rawEdgeCount);
    if (reducedEdgesVal) reducedEdgesVal.textContent = String(graphData.stats.reducedEdgeCount);
    if (transitiveVal) transitiveVal.textContent = String(graphData.stats.transitiveRemoved);
    if (n50Val) n50Val.textContent = `${graphData.stats.n50} bp`;

    if (contigLine) {
      const topUnitig = graphData.unitigs[0];
      if (topUnitig) {
        if (currentStepIdx < 0) {
          contigLine.textContent = topUnitig.sequence;
        } else {
          // Partial sequence up to step
          const activeTiling = topUnitig.tiling.slice(0, currentStepIdx + 1);
          const maxEnd = Math.max(...activeTiling.map((t) => t.end));
          contigLine.textContent = topUnitig.sequence.substring(0, maxEnd);
        }
      } else {
        contigLine.textContent = 'No overlapping unitig formed';
      }
    }
  }

  function renderTilingTrack() {
    if (!tilingTrack) return;
    tilingTrack.replaceChildren();

    const topUnitig = graphData.unitigs[0];
    if (!topUnitig || topUnitig.tiling.length === 0) {
      const emptyDiv = document.createElement('div');
      emptyDiv.style.color = 'var(--color-muted)';
      emptyDiv.style.fontSize = 'var(--fs-small)';
      emptyDiv.textContent = 'No layout tiles available.';
      tilingTrack.appendChild(emptyDiv);
      return;
    }

    const totalLen = topUnitig.length;

    topUnitig.tiling.forEach((tile, idx) => {
      const row = document.createElement('div');
      row.className = 'sg-tile-row';

      const bar = document.createElement('div');
      bar.className = 'sg-tile-bar';

      const leftPct = (tile.start / totalLen) * 100;
      const widthPct = Math.max(12, ((tile.end - tile.start) / totalLen) * 100);

      bar.style.left = `${leftPct}%`;
      bar.style.width = `${widthPct}%`;

      if (currentStepIdx >= 0) {
        if (idx === currentStepIdx) {
          bar.style.background = '#bbf7d0';
          bar.style.borderColor = '#16a34a';
          bar.style.color = '#14532d';
        } else if (idx < currentStepIdx) {
          bar.style.background = '#e0f2fe';
          bar.style.borderColor = '#0284c7';
          bar.style.color = '#0369a1';
        } else {
          bar.style.opacity = '0.35';
        }
      }

      bar.textContent = `${tile.readName}: "${tile.sequence}"`;
      row.appendChild(bar);
      tilingTrack.appendChild(row);
    });
  }

  function renderSvg() {
    if (!svgCanvas) return;
    svgCanvas.replaceChildren();

    const width = 600;
    const height = 460;
    const pad = 55;
    svgCanvas.setAttribute('viewBox', `0 0 ${width} ${height}`);
    const svgNS = 'http://www.w3.org/2000/svg';

    const activeReads = graphData.reads.filter((r) => !r.isContained);
    const nodeCount = activeReads.length;
    if (nodeCount === 0) return;

    // Node Positions Layout: Ring track
    const nodePosMap = new Map<string, { x: number; y: number }>();
    activeReads.forEach((r, idx) => {
      const angle = (idx / nodeCount) * 2 * Math.PI - Math.PI / 2;
      const rx = (width - pad * 2) / 2.2;
      const ry = (height - pad * 2) / 2.2;
      nodePosMap.set(r.id, {
        x: width / 2 + rx * Math.cos(angle),
        y: height / 2 + ry * Math.sin(angle),
      });
    });

    // Arrowhead Markers in Defs
    const defs = document.createElementNS(svgNS, 'defs');

    // Standard arrow
    const marker = document.createElementNS(svgNS, 'marker');
    marker.setAttribute('id', 'sg-arrow');
    marker.setAttribute('viewBox', '0 0 10 10');
    marker.setAttribute('refX', '24');
    marker.setAttribute('refY', '5');
    marker.setAttribute('markerWidth', '6');
    marker.setAttribute('markerHeight', '6');
    marker.setAttribute('orient', 'auto-start-reverse');
    const arrowPath = document.createElementNS(svgNS, 'path');
    arrowPath.setAttribute('d', 'M 0 0 L 10 5 L 0 10 z');
    arrowPath.setAttribute('fill', 'var(--color-ink)');
    arrowPath.setAttribute('opacity', '0.7');
    marker.appendChild(arrowPath);
    defs.appendChild(marker);

    // Transitive edge arrow (amber/red)
    const markerTrans = document.createElementNS(svgNS, 'marker');
    markerTrans.setAttribute('id', 'sg-arrow-trans');
    markerTrans.setAttribute('viewBox', '0 0 10 10');
    markerTrans.setAttribute('refX', '24');
    markerTrans.setAttribute('refY', '5');
    markerTrans.setAttribute('markerWidth', '6');
    markerTrans.setAttribute('markerHeight', '6');
    markerTrans.setAttribute('orient', 'auto-start-reverse');
    const arrowTransPath = document.createElementNS(svgNS, 'path');
    arrowTransPath.setAttribute('d', 'M 0 0 L 10 5 L 0 10 z');
    arrowTransPath.setAttribute('fill', '#f59e0b');
    markerTrans.appendChild(arrowTransPath);
    defs.appendChild(markerTrans);

    svgCanvas.appendChild(defs);

    // Select edges based on viewMode
    const edgesToDraw = viewMode === 'raw'
      ? graphData.rawEdges.map((e) => {
          const isTrans = graphData.transitiveEdges.some((te) => te.id === e.id);
          return { ...e, isTransitive: isTrans };
        })
      : graphData.reducedEdges;

    // Draw Edges
    for (const edge of edgesToDraw) {
      const p1 = nodePosMap.get(edge.from);
      const p2 = nodePosMap.get(edge.to);
      if (!p1 || !p2) continue;

      const gEdge = document.createElementNS(svgNS, 'g');

      const dx = p2.x - p1.x;
      const dy = p2.y - p1.y;
      const dist = Math.hypot(dx, dy);
      const midX = (p1.x + p2.x) / 2;
      const midY = (p1.y + p2.y) / 2;

      const curvature = dist > 0 ? 18 : 0;
      const normX = -dy / (dist || 1);
      const normY = dx / (dist || 1);
      const ctrlX = midX + normX * curvature;
      const ctrlY = midY + normY * curvature;

      const path = document.createElementNS(svgNS, 'path');
      path.setAttribute('d', `M ${p1.x} ${p1.y} Q ${ctrlX} ${ctrlY} ${p2.x} ${p2.y}`);
      path.setAttribute('fill', 'none');
      path.setAttribute('stroke', edge.isTransitive ? '#f59e0b' : 'var(--color-rule)');
      path.setAttribute('stroke-width', edge.isTransitive ? '1.8' : '2');
      if (edge.isTransitive) {
        path.setAttribute('stroke-dasharray', '4 4');
      }
      path.setAttribute(
        'marker-end',
        edge.isTransitive ? 'url(#sg-arrow-trans)' : 'url(#sg-arrow)',
      );
      path.style.cursor = 'pointer';

      // Edge Label: Overlap length & overhang
      const textLabel = document.createElementNS(svgNS, 'text');
      textLabel.setAttribute('x', String(ctrlX));
      textLabel.setAttribute('y', String(ctrlY - 4));
      textLabel.setAttribute('text-anchor', 'middle');
      textLabel.setAttribute('font-family', 'var(--font-mono)');
      textLabel.setAttribute('font-size', '10');
      textLabel.setAttribute('font-weight', '700');
      textLabel.setAttribute('fill', edge.isTransitive ? '#d97706' : 'var(--color-muted)');
      textLabel.textContent = `ovlp:${edge.overlapLen}bp${edge.isTransitive ? ' (transitive)' : ''}`;

      gEdge.append(path, textLabel);

      gEdge.addEventListener('mouseenter', () => {
        hoveredItem = {
          type: 'edge',
          id: edge.id,
          label: `Overlap Edge: ${edge.from} → ${edge.to}`,
          desc: `Prefix-suffix overlap of ${edge.overlapLen} bp. Extension overhang: "${edge.overhang}".${edge.isTransitive ? ' [Transitively Redundant: eliminated in String Graph]' : ''}`,
        };
        renderCalcBox();
      });

      svgCanvas.appendChild(gEdge);
    }

    // Draw Nodes
    for (const r of activeReads) {
      const pos = nodePosMap.get(r.id);
      if (!pos) continue;

      const gNode = document.createElementNS(svgNS, 'g');
      gNode.style.cursor = 'pointer';

      const rectW = 68;
      const rectH = 30;

      const rect = document.createElementNS(svgNS, 'rect');
      rect.setAttribute('x', String(pos.x - rectW / 2));
      rect.setAttribute('y', String(pos.y - rectH / 2));
      rect.setAttribute('width', String(rectW));
      rect.setAttribute('height', String(rectH));
      rect.setAttribute('rx', '15');
      rect.setAttribute('fill', 'var(--color-surface)');
      rect.setAttribute('stroke', 'var(--color-rule)');
      rect.setAttribute('stroke-width', '1.5');

      const text = document.createElementNS(svgNS, 'text');
      text.setAttribute('x', String(pos.x));
      text.setAttribute('y', String(pos.y + 4));
      text.setAttribute('text-anchor', 'middle');
      text.setAttribute('font-family', 'var(--font-mono)');
      text.setAttribute('font-size', '11');
      text.setAttribute('font-weight', '700');
      text.setAttribute('fill', 'var(--color-ink)');
      text.textContent = `${r.name} (${r.length}bp)`;

      gNode.append(rect, text);

      gNode.addEventListener('mouseenter', () => {
        hoveredItem = {
          type: 'node',
          id: r.id,
          label: `Read Node: ${r.name}`,
          desc: `Sequence (${r.length} bp): "${r.sequence}".`,
        };
        renderCalcBox();
      });

      svgCanvas.appendChild(gNode);
    }
  }

  function renderCalcBox() {
    if (!calcBox) return;
    calcBox.replaceChildren();

    if (!hoveredItem) {
      const titleDiv = document.createElement('div');
      titleDiv.className = 'sg-calc-title';

      const titleText = document.createElement('span');
      titleText.textContent = `String Graph (Min Overlap: ${graphData.minOverlap} bp)`;

      const statusSpan = document.createElement('span');
      statusSpan.textContent = `${graphData.stats.numReads} reads | ${graphData.stats.reducedEdgeCount} reduced edges`;

      titleDiv.append(titleText, statusSpan);

      const summaryDiv = document.createElement('div');
      summaryDiv.className = 'sg-calc-summary';
      summaryDiv.textContent = `Myers' transitive reduction eliminated ${graphData.stats.transitiveRemoved} redundant shortcut edges, compacting the graph into ${graphData.unitigs.length} unitig(s).`;

      calcBox.append(titleDiv, summaryDiv);
      return;
    }

    const titleDiv = document.createElement('div');
    titleDiv.className = 'sg-calc-title';

    const titleText = document.createElement('span');
    titleText.textContent = hoveredItem.label;

    titleDiv.appendChild(titleText);

    const formulaDiv = document.createElement('div');
    formulaDiv.className = 'sg-calc-formula';

    const p = document.createElement('div');
    p.textContent = `↳ ${hoveredItem.desc}`;

    formulaDiv.appendChild(p);

    calcBox.append(titleDiv, formulaDiv);
  }

  function renderTransportStatus() {
    const topUnitig = graphData.unitigs[0];
    const totalSteps = topUnitig ? topUnitig.tiling.length : 0;

    if (stepIndicator) {
      if (currentStepIdx < 0) {
        stepIndicator.textContent = `Assembled ${totalSteps}/${totalSteps} read tiles`;
      } else {
        stepIndicator.textContent = `Tile Step ${currentStepIdx + 1}/${totalSteps}`;
      }
    }

    if (prevBtn) prevBtn.disabled = currentStepIdx < 0 || totalSteps === 0;
    if (nextBtn) nextBtn.disabled = currentStepIdx >= totalSteps - 1 || totalSteps === 0;
    if (playBtn) {
      playBtn.disabled = totalSteps === 0;
      playBtn.textContent = isPlaying ? 'Pause ⏸' : 'Play ▶';
    }
  }

  function renderAll() {
    renderAssemblyBanner();
    renderTilingTrack();
    renderSvg();
    renderCalcBox();
    renderTransportStatus();
  }

  // ------------------------------------------------------------- Playback ----

  function stepForward() {
    const topUnitig = graphData.unitigs[0];
    const totalSteps = topUnitig ? topUnitig.tiling.length : 0;
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
    const topUnitig = graphData.unitigs[0];
    const totalSteps = topUnitig ? topUnitig.tiling.length : 0;
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

  seqTextarea?.addEventListener('input', rebuild);
  overlapSlider?.addEventListener('input', rebuild);

  presetBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      const s = btn.dataset.sgSeq;
      const po = btn.dataset.sgOverlap;
      if (s && seqTextarea) seqTextarea.value = s;
      if (po && overlapSlider) {
        overlapSlider.value = po;
        minOverlap = parseInt(po, 10);
      }
      rebuild();
    });
  });

  modeRawBtn?.addEventListener('click', () => {
    viewMode = 'raw';
    modeRawBtn.classList.add('sg-mode-btn--active');
    modeReducedBtn?.classList.remove('sg-mode-btn--active');
    renderSvg();
  });

  modeReducedBtn?.addEventListener('click', () => {
    viewMode = 'reduced';
    modeReducedBtn.classList.add('sg-mode-btn--active');
    modeRawBtn?.classList.remove('sg-mode-btn--active');
    renderSvg();
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
