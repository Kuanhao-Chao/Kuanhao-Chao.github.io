import { figureZoom, fitFigureZoom, readableFigureWidth } from '../lib/readingTypography';

const mounted = new Map<HTMLElement, () => void>();

export function mountFigureReaders(root: ParentNode = document) {
  for (const figure of root.querySelectorAll<HTMLElement>('[data-figure-reader]')) {
    if (mounted.has(figure)) continue;
    const frame = figure.querySelector<HTMLElement>('[data-figure-frame]');
    const art = figure.querySelector<HTMLElement>('[data-figure-art]');
    const svg = art?.querySelector<SVGSVGElement>('svg');
    const dialog = figure.querySelector<HTMLDialogElement>('[data-figure-dialog]');
    const viewport = figure.querySelector<HTMLElement>('[data-figure-viewport]');
    const open = figure.querySelector<HTMLButtonElement>('[data-figure-open]');
    const overview = figure.querySelector<HTMLButtonElement>('[data-figure-overview]');
    const tools = figure.querySelector<HTMLElement>('[data-figure-tools]');
    const hint = figure.querySelector<HTMLElement>('[data-figure-hint]');
    const status = figure.querySelector<HTMLOutputElement>('[data-figure-scale]');
    if (!frame || !art || !svg || !dialog || !viewport || !open || !overview || !tools) continue;

    const labels = [...svg.querySelectorAll('text')].map(e => parseFloat(getComputedStyle(e).fontSize)).filter(n => n > 0);
    const nativeWidth = svg.viewBox.baseVal.width || Number(svg.getAttribute('width')) || 640;
    const readableWidth = readableFigureWidth(nativeWidth, labels.length ? Math.min(...labels) : 13);
    let zoom = 1;
    let isOverview = false;
    let returnFocus = true;
    let scroll = { left: 0, top: 0 };
    const listeners: (() => void)[] = [];
    const listen = (element: EventTarget, event: string, handler: EventListener) => {
      element.addEventListener(event, handler);
      listeners.push(() => element.removeEventListener(event, handler));
    };

    const draw = () => {
      art.style.width = dialog.open ? `${readableWidth * zoom}px` : isOverview ? '100%' : `${readableWidth}px`;
      svg.style.width = '100%';
      svg.style.maxWidth = 'none';
      overview.setAttribute('aria-pressed', String(isOverview));
      overview.textContent = isOverview ? 'Readable size' : 'Fit overview';
      if (status) status.value = `${Math.round(zoom * 100)}%`;
      if (hint) {
        hint.hidden = !isOverview && frame.scrollWidth <= frame.clientWidth + 1;
        hint.textContent = isOverview
          ? 'Overview — choose Readable size or Expand diagram to read every label.'
          : 'Swipe or scroll sideways to read the diagram. Expand for more room and zoom controls.';
      }
      dialog.querySelector<HTMLButtonElement>('[data-figure-zoom="in"]')?.toggleAttribute('disabled', zoom >= 3);
      dialog.querySelector<HTMLButtonElement>('[data-figure-zoom="out"]')?.toggleAttribute('disabled', zoom <= 0.1);
    };

    const restore = () => {
      if (art.parentElement !== viewport) return;
      frame.append(art);
      frame.style.minHeight = '';
      draw();
      frame.scrollLeft = scroll.left;
      frame.scrollTop = scroll.top;
      if (returnFocus && open.isConnected) open.focus({ preventScroll: true });
    };
    listen(overview, 'click', () => { isOverview = !isOverview; draw(); });
    listen(open, 'click', () => {
      scroll = { left: frame.scrollLeft, top: frame.scrollTop };
      frame.style.minHeight = `${frame.getBoundingClientRect().height}px`;
      returnFocus = true;
      zoom = 1;
      // Move, never clone: SVG marker/gradient IDs and interactive state stay unique.
      viewport.append(art);
      dialog.showModal();
      draw();
      viewport.scrollTo(0, 0);
    });
    listen(dialog, 'close', restore);
    listen(dialog, 'click', event => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (target.closest('[data-figure-close]')) { dialog.close(); return; }
      const button = target.closest<HTMLButtonElement>('[data-figure-zoom]');
      if (button) {
        const mode = button.dataset.figureZoom;
        if (mode === 'fit') {
          const style = getComputedStyle(viewport);
          const width = viewport.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
          const height = viewport.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom);
          const ratio = svg.viewBox.baseVal.height / svg.viewBox.baseVal.width || 1;
          zoom = fitFigureZoom(readableWidth, readableWidth * ratio, width, height);
        } else zoom = figureZoom(zoom + (mode === 'in' ? 0.25 : -0.25));
        draw();
      }
      if (target === dialog) {
        const box = dialog.getBoundingClientRect();
        const pointer = event as MouseEvent;
        if (pointer.clientX < box.left || pointer.clientX > box.right || pointer.clientY < box.top || pointer.clientY > box.bottom) dialog.close();
      }
    });
    listen(window, 'beforeprint', () => { returnFocus = false; if (dialog.open) dialog.close(); restore(); });
    const resize = new ResizeObserver(() => { if (!dialog.open) draw(); });
    resize.observe(frame);
    tools.hidden = false;
    figure.dataset.figureReady = 'true';
    draw();
    mounted.set(figure, () => {
      returnFocus = false;
      if (dialog.open) dialog.close();
      restore();
      resize.disconnect();
      for (const cleanup of listeners) cleanup();
    });
  }
}

document.addEventListener('astro:before-swap', () => {
  for (const cleanup of mounted.values()) cleanup();
  mounted.clear();
});
