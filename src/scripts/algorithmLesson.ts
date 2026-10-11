import { ALGORITHM_LESSONS } from '../data/algorithmLessons';
import { runAlgorithmLesson } from '../lib/algorithmLessonRuns';
import { LessonPlayback } from '../lib/lessonPlayback';
import type { LessonRun, LessonValues, LessonCell, LessonNode, LessonPoint } from '../lib/algorithmLessonTypes';

const mounted = new Map<HTMLElement, () => void>();
const svgNS = 'http://www.w3.org/2000/svg';
const svg = <K extends keyof SVGElementTagNameMap>(tag: K, attributes: Record<string, string> = {}) => {
  const el = document.createElementNS(svgNS, tag);
  for (const [key, value] of Object.entries(attributes)) el.setAttribute(key, value);
  return el;
};
function init(root: HTMLElement) {
  const definition = ALGORITHM_LESSONS[root.dataset.algorithmLesson!];
  const lifetime = new AbortController();
  const q = <T extends Element>(selector: string) => root.querySelector<T>(selector)!;
  const form = q<HTMLFormElement>('[data-lesson-inputs]');
  const views = q<HTMLElement>('[data-lesson-views]');
  const error = q<HTMLElement>('[data-lesson-error]');
  const inspector = q<HTMLElement>('[data-lesson-inspector]');
  const answer = q<HTMLElement>('[data-lesson-answer]');
  const play = q<HTMLButtonElement>('[data-lesson-play]');
  const seek = q<HTMLInputElement>('[data-lesson-seek]');
  const speed = q<HTMLSelectElement>('[data-lesson-speed]');
  const playback = new LessonPlayback(1);
  let run: LessonRun;
  let timer: ReturnType<typeof setInterval> | undefined;
  let selectedMutation: LessonCell['mutation'];
  let reference = '';
  const history: string[] = [];
  const items = new Map<string, { element: HTMLElement | SVGElement; data: LessonCell | LessonNode | LessonPoint }>();
  const edgeItems = new Map<string, SVGElement>();
  const field = (id: string) => form.elements.namedItem(id) as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
  const on = (el: EventTarget, event: string, handler: EventListener) => el.addEventListener(event, handler, { signal: lifetime.signal });
  function stop() { if (timer !== undefined) clearInterval(timer); timer = undefined; playback.pause(); }
  function clearInspector() {
    selectedMutation = undefined;
    inspector.textContent = 'Tap, click, or focus a revealed item. Its explanation stays here while you compare other steps.';
    const apply = root.querySelector<HTMLButtonElement>('[data-ism-apply]');
    if (apply) apply.disabled = true;
  }
  function invalidate() {
    stop(); playback.invalidate(); views.hidden = true; answer.hidden = true; clearInspector();
    q<HTMLElement>('[data-lesson-title]').textContent = 'Inputs changed';
    q<HTMLElement>('[data-lesson-explanation]').textContent = 'Build the example to compute a new trace. Previous results are no longer displayed.';
    q<HTMLElement>('[data-lesson-metrics]').replaceChildren();
    q<HTMLElement>('[data-lesson-phase]').textContent = 'Needs computation';
    transport();
  }
  function readValues(): LessonValues {
    const values: LessonValues = {};
    for (const input of definition.inputs) {
      const value = field(input.id).value.trim(); values[input.id] = value;
      if (input.type === 'number') {
        const n = Number(value);
        if (!value || !Number.isFinite(n) || !Number.isInteger(n) || (input.min !== undefined && n < input.min) || (input.max !== undefined && n > input.max)) throw new Error(`${input.label}: enter an integer between ${input.min ?? '−∞'} and ${input.max ?? '∞'}.`);
      } else if (input.type === 'select') {
        if (!input.options?.some(option => option.value === value)) throw new Error(`Choose a valid ${input.label}.`);
      } else if (input.max !== undefined && value.length > input.max) throw new Error(`${input.label}: at most ${input.max} characters; your input has ${value.length}. Nothing was truncated.`);
    }
    return values;
  }
  function build(preserveIndex = false) {
    const index = playback.index;
    stop(); clearInspector();
    try {
      run = runAlgorithmLesson(definition.id, readValues());
      playback.load(run.frames.length);
      if (preserveIndex) playback.seek(index);
      error.hidden = true; error.textContent = ''; views.hidden = false;
      createViews(); render();
      const undo = root.querySelector<HTMLButtonElement>('[data-ism-undo]');
      if (undo) undo.disabled = !history.length;
    } catch (reason) {
      invalidate(); error.hidden = false;
      error.textContent = reason instanceof Error ? reason.message : String(reason);
    }
  }
  function createViews() {
    items.clear(); edgeItems.clear(); views.replaceChildren();
    for (const table of run.tables ?? []) {
      const region = document.createElement('div'); region.className = 'algo-scroll';
      region.setAttribute('role', 'region'); region.setAttribute('aria-label', `${table.label}; scroll horizontally when needed`);
      const el = document.createElement('table'); el.className = 'algo-table'; el.dataset.gridKeys = 'table';
      const caption = el.createCaption(); caption.textContent = table.label;
      const heading = el.createTHead().insertRow(); const corner = document.createElement('th'); corner.textContent = 'Row / Column'; heading.append(corner);
      for (const label of table.columns) { const th = document.createElement('th'); th.scope = 'col'; th.textContent = label; heading.append(th); }
      const body = el.createTBody();
      for (let r = 0; r < table.rows.length; r++) {
        const row = body.insertRow(); const th = document.createElement('th'); th.scope = 'row'; th.textContent = table.rows[r]; row.append(th);
        if (table.hideFutureRows) row.dataset.lessonRowFrame = String(Math.min(...table.cells.filter(cell => cell.row === r).map(cell => cell.revealAt)));
        for (let c = 0; c < table.columns.length; c++) {
          const cell = table.cells.find(cell => cell.row === r && cell.column === c);
          const td = row.insertCell();
          if (!cell) continue;
          const button = document.createElement('button'); button.type = 'button'; button.className = 'algo-item';
          button.dataset.inspect = cell.id; button.dataset.row = String(r); button.dataset.column = String(c);
          button.tabIndex = r === 0 && c === 0 ? 0 : -1;
          if (cell.tone) button.dataset.tone = cell.tone;
          td.append(button); items.set(cell.id, { element: button, data: cell });
        }
      }
      region.append(el); views.append(region);
    }
    if (run.graph) {
      const graph = run.graph;
      const figure = document.createElement('figure'); figure.className = 'algo-figure';
      const caption = document.createElement('figcaption'); caption.textContent = 'Graph: edges represent explicit transitions, not decorative motion.';
      const el = svg('svg', { viewBox: '0 0 760 360', role: 'group', 'aria-label': 'Algorithm graph; select nodes to inspect' });
      el.classList.add('algo-svg'); el.dataset.gridKeys = 'diagram';
      const defs = svg('defs'); const markerId = `arrow-${definition.id}`;
      const marker = svg('marker', { id: markerId, viewBox: '0 0 10 10', refX: '9', refY: '5', markerWidth: '5', markerHeight: '5', orient: 'auto-start-reverse' });
      marker.append(svg('path', { d: 'M 0 0 L 10 5 L 0 10 z', fill: 'var(--color-muted)' })); defs.append(marker); el.append(defs);
      for (const edge of graph.edges) {
        const from = graph.nodes.find(node => node.id === edge.from)!; const to = graph.nodes.find(node => node.id === edge.to)!;
        const path = svg('path', { d: from.id === to.id ? `M ${from.x - 15} ${from.y - 18} C ${from.x - 65} ${from.y - 80},${from.x + 65} ${from.y - 80},${from.x + 15} ${from.y - 18}` : `M ${from.x + (to.x > from.x ? 27 : -27)} ${from.y} Q ${(from.x + to.x) / 2} ${(from.y + to.y) / 2 - 18} ${to.x + (to.x > from.x ? -30 : 30)} ${to.y}`, 'marker-end': `url(#${markerId})` });
        path.classList.add('algo-edge'); const title = svg('title'); title.textContent = edge.detail; path.append(title); el.append(path); edgeItems.set(edge.id, path);
        const label = svg('text', { x: String((from.x + to.x) / 2), y: String((from.y + to.y) / 2 - 22), 'text-anchor': 'middle' }); label.textContent = edge.label; el.append(label);
      }
      graph.nodes.forEach((node, index) => {
        const group = svg('g', { transform: `translate(${node.x} ${node.y})`, role: 'button', tabindex: index === 0 ? '0' : '-1', 'aria-label': node.label });
        group.classList.add('algo-item', 'algo-node'); group.dataset.inspect = node.id;
        group.append(svg('circle', { r: '27' })); const label = svg('text', { 'text-anchor': 'middle', y: '5' }); label.textContent = node.label; group.append(label); el.append(group);
        items.set(node.id, { element: group, data: node });
      });
      figure.append(caption, el); views.append(figure);
    }
    for (const chart of run.charts ?? []) {
      const figure = document.createElement('figure'); figure.className = 'algo-figure';
      const caption = document.createElement('figcaption'); caption.textContent = chart.label;
      const el = svg('svg', { viewBox: '0 0 760 360', role: 'group', 'aria-label': chart.label }); el.classList.add('algo-svg'); el.dataset.gridKeys = 'diagram';
      const sx = (x: number) => 68 + x / (chart.xMax || 1) * 652;
      const sy = (y: number) => 300 - y / (chart.yMax || 1) * 260;
      const axes = svg('path', { d: 'M 68 30 V 300 H 730' }); axes.classList.add('algo-axis'); el.append(axes);
      for (let t = 0; t <= 4; t++) {
        const value = chart.yMax * t / 4; const text = svg('text', { x: '58', y: String(sy(value) + 4), 'text-anchor': 'end' }); text.textContent = value.toFixed(1); el.append(text);
        const xv = chart.xMax * t / 4; const xt = svg('text', { x: String(sx(xv)), y: '320', 'text-anchor': 'middle' }); xt.textContent = xv.toFixed(1); el.append(xt);
      }
      if (chart.diagonal) { const line = svg('path', { d: `M ${sx(0)} ${sy(0)} L ${sx(Math.min(chart.xMax, chart.yMax))} ${sy(Math.min(chart.xMax, chart.yMax))}` }); line.classList.add('algo-axis'); el.append(line); }
      if (chart.threshold !== undefined) { const line = svg('path', { d: `M 68 ${sy(chart.threshold)} H 720`, 'stroke-dasharray': '4 4' }); line.classList.add('algo-axis'); el.append(line); }
      for (const [index, point] of chart.points.entries()) {
        const group = svg('g', { transform: `translate(${sx(point.x)} ${sy(point.y)})`, role: 'button', tabindex: index === 0 ? '0' : '-1', 'aria-label': point.label });
        group.classList.add('algo-item', 'algo-point'); group.dataset.inspect = point.id; group.dataset.tone = point.tone ?? 'neutral';
        group.append(svg('circle', { r: '6' })); el.append(group); items.set(point.id, { element: group, data: point });
      }
      const xlabel = svg('text', { x: '395', y: '348', 'text-anchor': 'middle' }); xlabel.textContent = chart.xLabel;
      const ylabel = svg('text', { x: '16', y: '168', transform: 'rotate(-90 16 168)', 'text-anchor': 'middle' }); ylabel.textContent = chart.yLabel;
      el.append(xlabel, ylabel); figure.append(caption, el); views.append(figure);
    }
  }
  function transport() {
    play.textContent = playback.playing ? 'Pause' : 'Play';
    play.disabled = !playback.valid;
    q<HTMLButtonElement>('[data-lesson-previous]').disabled = !playback.valid || playback.index === 0;
    q<HTMLButtonElement>('[data-lesson-next]').disabled = !playback.valid || playback.index === playback.length - 1;
    q<HTMLButtonElement>('[data-lesson-reset]').disabled = !playback.valid;
    q<HTMLButtonElement>('[data-lesson-result]').disabled = !playback.valid;
    seek.disabled = !playback.valid; seek.max = String(playback.length - 1); seek.value = String(playback.index);
    q<HTMLElement>('[data-lesson-position]').textContent = playback.valid ? `${playback.index + 1} / ${playback.length}` : 'Not computed';
    q<HTMLElement>('[data-lesson-stage]').setAttribute('aria-live', playback.playing ? 'off' : 'polite');
  }
  function render() {
    if (!playback.valid) return;
    const step = run.frames[playback.index];
    q<HTMLElement>('[data-lesson-phase]').textContent = step.phase;
    q<HTMLElement>('[data-lesson-title]').textContent = step.title;
    q<HTMLElement>('[data-lesson-explanation]').textContent = step.explanation;
    const metrics = q<HTMLElement>('[data-lesson-metrics]'); metrics.replaceChildren();
    for (const metric of step.metrics) { const div = document.createElement('div'); const dt = document.createElement('dt'); const dd = document.createElement('dd'); dt.textContent = metric.label; dd.textContent = metric.value; div.append(dt, dd); metrics.append(div); }
    for (const [id, { element, data }] of items) {
      const revealed = data.revealAt <= playback.index;
      if (element instanceof HTMLButtonElement) {
        const cell = data as LessonCell; element.textContent = revealed ? cell.value : '·';
        element.setAttribute('aria-label', `${id}: ${revealed ? cell.value : 'not computed yet'}`);
      } else element.style.visibility = revealed ? 'visible' : 'hidden';
      element.classList.toggle('is-active', step.active.includes(id));
      element.classList.toggle('is-predecessor', step.predecessors?.includes(id) ?? false);
      element.classList.toggle('is-removed', step.removed?.includes(id) ?? false);
    }
    for (const edge of run.graph?.edges ?? []) {
      const el = edgeItems.get(edge.id)!; el.style.visibility = edge.revealAt <= playback.index ? 'visible' : 'hidden';
      el.classList.toggle('is-active', step.active.includes(edge.id)); el.classList.toggle('is-removed', step.removed?.includes(edge.id) ?? false);
    }
    views.querySelectorAll<HTMLElement>('[data-lesson-row-frame]').forEach(row => row.hidden = Number(row.dataset.lessonRowFrame) > playback.index);
    for (const region of views.querySelectorAll<HTMLElement>('.algo-scroll')) {
      const active = region.querySelector<HTMLElement>('.is-active');
      if (!active) continue;
      const box = region.getBoundingClientRect(); const itemBox = active.getBoundingClientRect();
      if (itemBox.bottom > box.bottom) region.scrollTop += itemBox.bottom - box.bottom + 8;
      if (itemBox.top < box.top) region.scrollTop -= box.top - itemBox.top + 8;
      if (itemBox.right > box.right) region.scrollLeft += itemBox.right - box.right + 8;
      if (itemBox.left < box.left) region.scrollLeft -= box.left - itemBox.left + 8;
    }
    root.querySelectorAll<HTMLElement>('[data-lesson-code-line]').forEach(el => el.classList.toggle('is-active', Number(el.dataset.lessonCodeLine) === step.line));
    answer.hidden = !step.result; answer.textContent = step.result ?? ''; transport();
    if (!playback.playing && timer !== undefined) { clearInterval(timer); timer = undefined; }
  }
  function inspect(id: string) {
    const item = items.get(id); if (!item || !playback.valid) return;
    if (item.data.revealAt > playback.index) { inspector.textContent = 'This item has not been computed yet. Advance the trace to reveal its value.'; return; }
    inspector.textContent = item.data.detail;
    const cell = item.data as LessonCell;
    selectedMutation = cell.mutation;
    const apply = root.querySelector<HTMLButtonElement>('[data-ism-apply]'); if (apply) apply.disabled = !selectedMutation;
    if ('action' in item.data && item.data.action) {
      const detail = item.data.detail; field(item.data.action.input).value = item.data.action.value; build(true); inspector.textContent = detail;
    }
  }
  function startTimer() {
    if (timer !== undefined) clearInterval(timer);
    timer = setInterval(() => { playback.next(); render(); }, Number(speed.value));
  }
  on(form, 'submit', event => { event.preventDefault(); if (definition.id === 'ism') { reference = field('sequence').value; history.length = 0; } build(); });
  on(form, 'input', () => { if (definition.id === 'ism') history.length = 0; invalidate(); });
  on(root, 'click', event => {
    const target = (event.target as Element).closest<HTMLElement>('[data-lesson-preset], [data-inspect]');
    if (target?.dataset.lessonPreset !== undefined) {
      const preset = definition.presets[Number(target.dataset.lessonPreset)];
      for (const input of definition.inputs) field(input.id).value = preset.values[input.id] ?? input.value;
      if (definition.id === 'ism') { reference = field('sequence').value; history.length = 0; }
      build();
    } else if (target?.dataset.inspect) inspect(target.dataset.inspect);
  });
  on(views, 'focusin', event => { const target = event.target as HTMLElement; if (target.dataset.inspect) inspect(target.dataset.inspect); });
  on(views, 'keydown', event => {
    const e = event as KeyboardEvent; const target = e.target as HTMLElement;
    const grid = target.closest<HTMLElement>('[data-grid-keys]'); if (!grid || !target.dataset.inspect) return;
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); inspect(target.dataset.inspect); return; }
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(e.key)) return;
    const candidates = [...grid.querySelectorAll<HTMLElement | SVGElement>('[data-inspect]')].filter(el => el.style.visibility !== 'hidden');
    let next: HTMLElement | SVGElement | undefined;
    if (grid.dataset.gridKeys === 'table' && !['Home', 'End'].includes(e.key)) {
      const row = Number(target.dataset.row) + (e.key === 'ArrowDown' ? 1 : e.key === 'ArrowUp' ? -1 : 0);
      const column = Number(target.dataset.column) + (e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0);
      next = candidates.find(el => el.dataset.row === String(row) && el.dataset.column === String(column));
    } else {
      const index = candidates.indexOf(target);
      next = e.key === 'Home' ? candidates[0] : e.key === 'End' ? candidates.at(-1) : candidates[Math.max(0, Math.min(candidates.length - 1, index + (e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 1)))];
    }
    e.preventDefault(); if (next) { candidates.forEach(el => el.setAttribute('tabindex', '-1')); next.setAttribute('tabindex', '0'); (next as HTMLElement).focus(); }
  });
  on(play, 'click', () => { if (playback.playing) stop(); else { playback.play(); startTimer(); } render(); });
  on(q('[data-lesson-next]'), 'click', () => { stop(); playback.next(); render(); });
  on(q('[data-lesson-previous]'), 'click', () => { stop(); playback.previous(); render(); });
  on(q('[data-lesson-reset]'), 'click', () => { stop(); playback.reset(); clearInspector(); render(); });
  on(q('[data-lesson-result]'), 'click', () => { stop(); playback.seek(playback.length - 1); render(); });
  on(seek, 'input', () => { stop(); playback.seek(Number(seek.value)); render(); });
  on(speed, 'change', () => { if (playback.playing) startTimer(); });
  on(document, 'visibilitychange', () => { if (document.hidden) { stop(); transport(); } });
  if (definition.id === 'ism') {
    reference = field('sequence').value;
    on(q('[data-ism-apply]'), 'click', () => { if (!selectedMutation) return; const seq = field('sequence').value; history.push(seq); field('sequence').value = seq.slice(0, selectedMutation.position) + selectedMutation.base + seq.slice(selectedMutation.position + 1); build(); });
    on(q('[data-ism-undo]'), 'click', () => { const previous = history.pop(); if (previous !== undefined) { field('sequence').value = previous; build(); } });
    on(q('[data-ism-reference]'), 'click', () => { field('sequence').value = reference; history.length = 0; build(); });
  }
  if (definition.id === 'debruijn') on(q('[data-cleaning-undo]'), 'click', () => { field('cleaning').value = 'none'; build(); });
  build();
  return () => { stop(); lifetime.abort(); items.clear(); edgeItems.clear(); };
}
export function mountAlgorithmLessons() {
  const mount = () => document.querySelectorAll<HTMLElement>('[data-algorithm-lesson]').forEach(root => { if (!mounted.has(root)) mounted.set(root, init(root)); });
  mount();
  if (document.documentElement.dataset.algorithmLessonLifecycle) return;
  document.documentElement.dataset.algorithmLessonLifecycle = 'true';
  document.addEventListener('astro:page-load', mount);
  document.addEventListener('astro:before-swap', () => { for (const destroy of mounted.values()) destroy(); mounted.clear(); });
}
