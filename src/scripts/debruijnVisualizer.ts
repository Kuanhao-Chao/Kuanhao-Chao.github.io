/**
 * De Bruijn Graph & Eulerian Path Genome Assembly Controller.
 * Pure DOM and SVG node creation.
 */

import {
  buildDeBruijnGraph,
  clipTips,
  popBubbles,
  filterLowCoverage,
  type DbgGraph,
} from '../lib/debruijn';

export interface DebruijnVisualizerController {
  destroy: () => void;
}

export function initDebruijnVisualizer(root: ParentNode = document): DebruijnVisualizerController | null {
  const container = root.querySelector<HTMLElement>('[data-dbg-visualizer]');
  if (!container) return null;
  if (container.dataset.dbgReady === 'true') return null;
  container.dataset.dbgReady = 'true';

  // DOM Elements
  const seqTextarea = container.querySelector<HTMLTextAreaElement>('[data-dbg-input]');
  const kSlider = container.querySelector<HTMLInputElement>('[data-dbg-k]');
  const kVal = container.querySelector<HTMLElement>('[data-dbg-k-val]');
  const presetBtns = container.querySelectorAll<HTMLButtonElement>('[data-dbg-preset]');

  const tipBtn = container.querySelector<HTMLButtonElement>('[data-dbg-tip-btn]');
  const bubbleBtn = container.querySelector<HTMLButtonElement>('[data-dbg-bubble-btn]');
  const filterBtn = container.querySelector<HTMLButtonElement>('[data-dbg-filter-btn]');
  const resetCleaningBtn = container.querySelector<HTMLButtonElement>('[data-dbg-reset-cleaning]');

  const svgCanvas = container.querySelector<SVGSVGElement>('[data-dbg-svg]');
  const calcBox = container.querySelector<HTMLElement>('[data-dbg-calc-box]');
  const contigLine = container.querySelector<HTMLElement>('[data-dbg-contig-line]');
  const nodesVal = container.querySelector<HTMLElement>('[data-dbg-nodes]');
  const edgesVal = container.querySelector<HTMLElement>('[data-dbg-edges]');
  const n50Val = container.querySelector<HTMLElement>('[data-dbg-n50]');
  const statusVal = container.querySelector<HTMLElement>('[data-dbg-status]');

  const playBtn = container.querySelector<HTMLButtonElement>('[data-dbg-play]');
  const prevBtn = container.querySelector<HTMLButtonElement>('[data-dbg-prev]');
  const nextBtn = container.querySelector<HTMLButtonElement>('[data-dbg-next]');
  const resetBtn = container.querySelector<HTMLButtonElement>('[data-dbg-reset]');
  const speedSelect = container.querySelector<HTMLSelectElement>('[data-dbg-speed]');
  const stepIndicator = container.querySelector<HTMLElement>('[data-dbg-step-indicator]');

  // State
  let k = parseInt(kSlider?.value || '4', 10);
  let graph: DbgGraph = buildDeBruijnGraph(
    seqTextarea?.value || 'TAATGCCATGGGATGTT',
    k,
  );

  let currentStepIdx = -1; // -1: complete/static, 0..eulerian.pathEdges.length - 1: animated
  let isPlaying = false;
  let timerId: number | null = null;
  let speedMs = parseInt(speedSelect?.value || '1200', 10);
  let hoveredItem: { type: 'node' | 'edge'; id: string; label: string; desc: string } | null = null;

  function rebuild() {
    const raw = seqTextarea?.value || 'TAATGCCATGGGATGTT';
    const lines = raw.split(/[\n,;]+/).map((s) => s.trim()).filter(Boolean);
    k = parseInt(kSlider?.value || '4', 10);
    if (kVal) kVal.textContent = String(k);

    graph = buildDeBruijnGraph(lines.length > 1 ? lines : lines[0] || '', k);
    currentStepIdx = -1;
    hoveredItem = null;
    pause();
    renderAll();
  }

  // ------------------------------------------------------------- Renderers --

  function renderAssemblyBanner() {
    if (!contigLine) return;
    if (currentStepIdx < 0) {
      contigLine.textContent = graph.eulerian.assembledSeq || (graph.unitigs[0]?.sequence ?? 'No contig formed');
    } else {
      // Partial assembly up to currentStepIdx
      let partial = graph.eulerian.pathNodes[0] || '';
      for (let i = 0; i <= currentStepIdx && i < graph.eulerian.pathEdges.length; i++) {
        const edge = graph.edges.get(graph.eulerian.pathEdges[i]);
        if (edge) {
          partial += edge.kmer[edge.kmer.length - 1];
        }
      }
      contigLine.textContent = partial;
    }

    if (nodesVal) nodesVal.textContent = String(graph.stats.numNodes);
    if (edgesVal) edgesVal.textContent = String(graph.stats.numEdges);
    if (n50Val) n50Val.textContent = `${graph.stats.n50} bp`;
    if (statusVal) statusVal.textContent = graph.eulerian.isEulerian ? 'Eulerian ✓' : 'Branched / Unitigs';
  }

  function renderSvg() {
    if (!svgCanvas) return;
    svgCanvas.replaceChildren();

    const width = 600;
    const height = 480;
    const pad = 50;
    svgCanvas.setAttribute('viewBox', `0 0 ${width} ${height}`);
    const svgNS = 'http://www.w3.org/2000/svg';

    // Collect active nodes
    const activeNodeList = Array.from(graph.nodes.values()).filter(
      (n) => n.inDeg > 0 || n.outDeg > 0,
    );
    const nodeCount = activeNodeList.length;
    if (nodeCount === 0) return;

    // Node Positions Layout: Ring or Grid layout based on Eulerian sequence order
    const nodePosMap = new Map<string, { x: number; y: number }>();

    if (graph.eulerian.isEulerian && graph.eulerian.pathNodes.length > 0) {
      // Position along an oval/spiral track
      const pathOrder = graph.eulerian.pathNodes;
      const seen = new Set<string>();
      const orderedNodes: string[] = [];
      pathOrder.forEach((nid) => {
        if (!seen.has(nid)) {
          seen.add(nid);
          orderedNodes.push(nid);
        }
      });
      activeNodeList.forEach((n) => {
        if (!seen.has(n.id)) orderedNodes.push(n.id);
      });

      const total = orderedNodes.length;
      orderedNodes.forEach((nid, idx) => {
        const angle = (idx / total) * 2 * Math.PI - Math.PI / 2;
        const rx = (width - pad * 2) / 2.3;
        const ry = (height - pad * 2) / 2.3;
        nodePosMap.set(nid, {
          x: width / 2 + rx * Math.cos(angle),
          y: height / 2 + ry * Math.sin(angle),
        });
      });
    } else {
      // Circle layout fallback
      activeNodeList.forEach((n, idx) => {
        const angle = (idx / nodeCount) * 2 * Math.PI - Math.PI / 2;
        const rx = (width - pad * 2) / 2.3;
        const ry = (height - pad * 2) / 2.3;
        nodePosMap.set(n.id, {
          x: width / 2 + rx * Math.cos(angle),
          y: height / 2 + ry * Math.sin(angle),
        });
      });
    }

    // Define Arrowhead Marker in Defs
    const defs = document.createElementNS(svgNS, 'defs');
    const marker = document.createElementNS(svgNS, 'marker');
    marker.setAttribute('id', 'dbg-arrow');
    marker.setAttribute('viewBox', '0 0 10 10');
    marker.setAttribute('refX', '18');
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

    // Active Highlight Marker
    const markerActive = document.createElementNS(svgNS, 'marker');
    markerActive.setAttribute('id', 'dbg-arrow-active');
    markerActive.setAttribute('viewBox', '0 0 10 10');
    markerActive.setAttribute('refX', '18');
    markerActive.setAttribute('refY', '5');
    markerActive.setAttribute('markerWidth', '7');
    markerActive.setAttribute('markerHeight', '7');
    markerActive.setAttribute('orient', 'auto-start-reverse');

    const arrowActivePath = document.createElementNS(svgNS, 'path');
    arrowActivePath.setAttribute('d', 'M 0 0 L 10 5 L 0 10 z');
    arrowActivePath.setAttribute('fill', '#16a34a');
    markerActive.appendChild(arrowActivePath);
    defs.appendChild(markerActive);

    svgCanvas.appendChild(defs);

    // Active Edge in Traversal
    const activeEdgeId =
      currentStepIdx >= 0 && currentStepIdx < graph.eulerian.pathEdges.length
        ? graph.eulerian.pathEdges[currentStepIdx]
        : null;

    // Draw Edges
    for (const [, edge] of graph.edges.entries()) {
      if (edge.isRemoved) continue;

      const p1 = nodePosMap.get(edge.from);
      const p2 = nodePosMap.get(edge.to);
      if (!p1 || !p2) continue;

      const isCurrentActive = activeEdgeId === edge.id;
      const isTraversed =
        currentStepIdx >= 0 &&
        graph.eulerian.pathEdges.slice(0, currentStepIdx).includes(edge.id);

      const gEdge = document.createElementNS(svgNS, 'g');

      // Curve computation
      const dx = p2.x - p1.x;
      const dy = p2.y - p1.y;
      const dist = Math.hypot(dx, dy);
      const midX = (p1.x + p2.x) / 2;
      const midY = (p1.y + p2.y) / 2;

      // Arc offset perpendicular
      const curvature = dist > 0 ? 15 : 0;
      const normX = -dy / (dist || 1);
      const normY = dx / (dist || 1);
      const ctrlX = midX + normX * curvature;
      const ctrlY = midY + normY * curvature;

      const path = document.createElementNS(svgNS, 'path');
      const d =
        edge.from === edge.to
          ? `M ${p1.x} ${p1.y - 12} C ${p1.x - 30} ${p1.y - 45}, ${p1.x + 30} ${p1.y - 45}, ${p1.x} ${p1.y - 12}`
          : `M ${p1.x} ${p1.y} Q ${ctrlX} ${ctrlY} ${p2.x} ${p2.y}`;

      path.setAttribute('d', d);
      path.setAttribute('fill', 'none');
      path.setAttribute(
        'stroke',
        isCurrentActive ? '#16a34a' : isTraversed ? '#0284c7' : 'var(--color-rule)',
      );
      path.setAttribute(
        'stroke-width',
        isCurrentActive ? '3.5' : isTraversed ? '2.5' : '1.5',
      );
      path.setAttribute(
        'marker-end',
        isCurrentActive ? 'url(#dbg-arrow-active)' : 'url(#dbg-arrow)',
      );
      path.style.cursor = 'pointer';

      // Edge Coverage & Transition Label
      const textLabel = document.createElementNS(svgNS, 'text');
      textLabel.setAttribute('x', String(ctrlX));
      textLabel.setAttribute('y', String(ctrlY - 4));
      textLabel.setAttribute('text-anchor', 'middle');
      textLabel.setAttribute('font-family', 'var(--font-mono)');
      textLabel.setAttribute('font-size', '10');
      textLabel.setAttribute('font-weight', '700');
      textLabel.setAttribute(
        'fill',
        isCurrentActive ? '#16a34a' : 'var(--color-muted)',
      );
      textLabel.textContent = `${edge.kmer[edge.kmer.length - 1]}${edge.coverage > 1 ? ` (×${edge.coverage})` : ''}`;

      gEdge.append(path, textLabel);

      gEdge.addEventListener('mouseenter', () => {
        hoveredItem = {
          type: 'edge',
          id: edge.id,
          label: `k-mer Edge: "${edge.kmer}"`,
          desc: `Connects prefix node (${edge.from}) → suffix node (${edge.to}) with coverage ×${edge.coverage}.`,
        };
        renderCalcBox();
      });

      svgCanvas.appendChild(gEdge);
    }

    // Draw Nodes
    for (const node of activeNodeList) {
      const pos = nodePosMap.get(node.id);
      if (!pos) continue;

      const isCurrentNode =
        currentStepIdx >= 0 &&
        graph.eulerian.pathNodes[currentStepIdx] === node.id;

      const gNode = document.createElementNS(svgNS, 'g');
      gNode.style.cursor = 'pointer';

      // Node Badge Rect
      const rectW = Math.max(38, node.kminus1.length * 9 + 14);
      const rectH = 26;

      const rect = document.createElementNS(svgNS, 'rect');
      rect.setAttribute('x', String(pos.x - rectW / 2));
      rect.setAttribute('y', String(pos.y - rectH / 2));
      rect.setAttribute('width', String(rectW));
      rect.setAttribute('height', String(rectH));
      rect.setAttribute('rx', '13');
      rect.setAttribute(
        'fill',
        isCurrentNode ? '#bbf7d0' : 'var(--color-surface)',
      );
      rect.setAttribute(
        'stroke',
        isCurrentNode ? '#16a34a' : 'var(--color-rule)',
      );
      rect.setAttribute('stroke-width', isCurrentNode ? '2.5' : '1.5');

      // Node Label Text
      const text = document.createElementNS(svgNS, 'text');
      text.setAttribute('x', String(pos.x));
      text.setAttribute('y', String(pos.y + 4));
      text.setAttribute('text-anchor', 'middle');
      text.setAttribute('font-family', 'var(--font-mono)');
      text.setAttribute('font-size', '11');
      text.setAttribute('font-weight', '700');
      text.setAttribute(
        'fill',
        isCurrentNode ? '#14532d' : 'var(--color-ink)',
      );
      text.textContent = node.kminus1;

      gNode.append(rect, text);

      gNode.addEventListener('mouseenter', () => {
        hoveredItem = {
          type: 'node',
          id: node.id,
          label: `(k-1)-mer Node: "${node.kminus1}"`,
          desc: `In-degree: ${node.inDeg} | Out-degree: ${node.outDeg} (${node.inDeg === node.outDeg ? 'Balanced' : node.outDeg - node.inDeg === 1 ? 'Start Node' : 'End Node'}).`,
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
      titleDiv.className = 'dbg-calc-title';

      const titleText = document.createElement('span');
      titleText.textContent = `De Bruijn Graph (k = ${graph.k})`;

      const statusSpan = document.createElement('span');
      statusSpan.textContent = graph.eulerian.isEulerian ? 'Eulerian Walk Ready' : 'Branched Graph';

      titleDiv.append(titleText, statusSpan);

      const summaryDiv = document.createElement('div');
      summaryDiv.className = 'dbg-calc-summary';
      summaryDiv.textContent = graph.eulerian.statusText;

      calcBox.append(titleDiv, summaryDiv);
      return;
    }

    const titleDiv = document.createElement('div');
    titleDiv.className = 'dbg-calc-title';

    const titleText = document.createElement('span');
    titleText.textContent = hoveredItem.label;

    titleDiv.appendChild(titleText);

    const formulaDiv = document.createElement('div');
    formulaDiv.className = 'dbg-calc-formula';

    const p = document.createElement('div');
    p.textContent = `↳ ${hoveredItem.desc}`;

    formulaDiv.appendChild(p);

    calcBox.append(titleDiv, formulaDiv);
  }

  function renderTransportStatus() {
    const totalSteps = graph.eulerian.pathEdges.length;
    if (stepIndicator) {
      if (currentStepIdx < 0) {
        stepIndicator.textContent = graph.eulerian.isEulerian
          ? `Complete (${totalSteps}/${totalSteps} edges)`
          : 'Branched';
      } else {
        stepIndicator.textContent = `Edge Traversal ${currentStepIdx + 1}/${totalSteps}`;
      }
    }

    if (prevBtn) prevBtn.disabled = currentStepIdx < 0 || !graph.eulerian.isEulerian;
    if (nextBtn) nextBtn.disabled = currentStepIdx >= totalSteps - 1 || !graph.eulerian.isEulerian;
    if (playBtn) {
      playBtn.disabled = !graph.eulerian.isEulerian;
      playBtn.textContent = isPlaying ? 'Pause ⏸' : 'Play ▶';
    }
  }

  function renderAll() {
    renderAssemblyBanner();
    renderSvg();
    renderCalcBox();
    renderTransportStatus();
  }

  // ------------------------------------------------------------- Playback ----

  function stepForward() {
    if (currentStepIdx < graph.eulerian.pathEdges.length - 1) {
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
    if (isPlaying) return;
    if (currentStepIdx >= graph.eulerian.pathEdges.length - 1) {
      currentStepIdx = -1;
    }
    isPlaying = true;
    renderTransportStatus();
    stepForward();
    timerId = window.setInterval(() => {
      if (currentStepIdx < graph.eulerian.pathEdges.length - 1) {
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
  kSlider?.addEventListener('input', rebuild);

  presetBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      const s = btn.dataset.dbgSeq;
      const pk = btn.dataset.dbgK;
      if (s && seqTextarea) seqTextarea.value = s;
      if (pk && kSlider) {
        kSlider.value = pk;
        k = parseInt(pk, 10);
      }
      rebuild();
    });
  });

  tipBtn?.addEventListener('click', () => {
    clipTips(graph);
    currentStepIdx = -1;
    renderAll();
  });

  bubbleBtn?.addEventListener('click', () => {
    popBubbles(graph);
    currentStepIdx = -1;
    renderAll();
  });

  filterBtn?.addEventListener('click', () => {
    filterLowCoverage(graph, 2);
    currentStepIdx = -1;
    renderAll();
  });

  resetCleaningBtn?.addEventListener('click', rebuild);

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
