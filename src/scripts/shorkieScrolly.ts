type Layer = HTMLElement | SVGElement;

function setLayerState(layer: Layer, stage: number) {
  const exact = layer.getAttribute('data-stage-only');
  const from = Number(layer.getAttribute('data-visible-from') ?? 0);
  const until = Number(layer.getAttribute('data-visible-until') ?? Number.POSITIVE_INFINITY);
  const visible = exact === null ? stage >= from && stage <= until : stage === Number(exact);
  layer.classList.toggle('is-visible', visible);
}

export function mountShorkieScrolly(root: HTMLElement) {
  if (root.dataset.shorkieReady === 'true') return;
  root.dataset.shorkieReady = 'true';

  const chapters = Array.from(root.querySelectorAll<HTMLElement>('[data-shorkie-stage]'));
  const layers = Array.from(root.querySelectorAll<Layer>('.shk-layer'));
  const markers = Array.from(root.querySelectorAll<HTMLElement>('[data-shorkie-marker]'));
  const replay = root.querySelector<HTMLButtonElement>('[data-shorkie-replay]');
  let current = 0;

  const show = (stage: number, replayTransition = false) => {
    current = Math.max(0, Math.min(chapters.length - 1, stage));
    root.dataset.stage = String(current);
    layers.forEach((layer) => setLayerState(layer, current));
    chapters.forEach((chapter, index) => chapter.classList.toggle('is-active', index === current));
    markers.forEach((marker, index) => marker.classList.toggle('is-active', index === current));
    if (replayTransition) {
      root.classList.remove('is-replaying');
      void root.offsetWidth;
      root.classList.add('is-replaying');
    }
  };

  chapters.forEach((chapter, index) => {
    chapter.addEventListener('click', () => show(index));
    chapter.addEventListener('focus', () => show(index));
  });
  replay?.addEventListener('click', () => show(current, true));

  let observer: IntersectionObserver | null = null;
  if ('IntersectionObserver' in window) {
    observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (!visible) return;
        const index = chapters.indexOf(visible.target as HTMLElement);
        if (index >= 0) show(index);
      },
      { rootMargin: '-24% 0px -52% 0px', threshold: [0, 0.15, 0.35, 0.6] }
    );
    chapters.forEach((chapter) => observer?.observe(chapter));
  }

  document.addEventListener('astro:before-swap', () => observer?.disconnect(), { once: true });
  show(0);
}

export function mountShorkieTabs(root: HTMLElement) {
  if (root.dataset.shorkieTabsReady === 'true') return;
  root.dataset.shorkieTabsReady = 'true';
  const tabs = Array.from(root.querySelectorAll<HTMLButtonElement>('[data-shorkie-tab]'));
  const panels = Array.from(root.querySelectorAll<HTMLElement>('[data-shorkie-panel]'));
  const replay = root.querySelector<HTMLButtonElement>('[data-shorkie-replay]');

  const activate = (id: string, focus = false) => {
    tabs.forEach((tab) => {
      const selected = tab.dataset.shorkieTab === id;
      tab.setAttribute('aria-selected', String(selected));
      tab.tabIndex = selected ? 0 : -1;
      if (selected && focus) tab.focus();
    });
    panels.forEach((panel) => {
      const selected = panel.dataset.shorkiePanel === id;
      panel.hidden = !selected;
      panel.classList.remove('shk-animate');
      if (selected) requestAnimationFrame(() => panel.classList.add('shk-animate'));
    });
  };

  tabs.forEach((tab, index) => {
    tab.addEventListener('click', () => activate(tab.dataset.shorkieTab || 'motifs'));
    tab.addEventListener('keydown', (event) => {
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
      event.preventDefault();
      const offset = event.key === 'ArrowRight' ? 1 : -1;
      const next = tabs[(index + offset + tabs.length) % tabs.length];
      activate(next.dataset.shorkieTab || 'motifs', true);
    });
  });
  replay?.addEventListener('click', () => {
    const active = tabs.find((tab) => tab.getAttribute('aria-selected') === 'true');
    activate(active?.dataset.shorkieTab || 'motifs');
  });
  activate(tabs[0]?.dataset.shorkieTab || 'motifs');
}
