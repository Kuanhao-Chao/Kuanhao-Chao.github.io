/** Label only genuinely overflowing reading blocks; never widen or clip the page. */
let cleanupPage: (() => void) | undefined;

export function mountReadingScroll() {
  cleanupPage?.();
  const regions = [...document.querySelectorAll<HTMLElement>(
    '.prose pre, .prose table, .paper-table-wrap, .dd-scroll-x, main .katex-display, main .katex:not(.katex-display > .katex):not(.katex-wrap--inline .katex)'
  )];
  const entries = regions.map(region => {
    const hint = document.createElement('span');
    hint.className = 'reading-scroll-hint';
    hint.textContent = '↔ Scroll sideways to read the full content';
    hint.hidden = true;
    region.after(hint);
    const originalTab = region.getAttribute('tabindex');
    const originalRole = region.getAttribute('role');
    const originalLabel = region.getAttribute('aria-label');
    const reset = () => {
      for (const [name, value] of [['tabindex', originalTab], ['role', originalRole], ['aria-label', originalLabel]] as const) {
        if (value === null) region.removeAttribute(name);
        else region.setAttribute(name, value);
      }
    };
    const sync = () => {
      if (!region.isConnected) return;
      const scrolling = region.scrollWidth > region.clientWidth + 2;
      const parent = region.parentElement?.closest<HTMLElement>('.dd-scroll-x, .paper-table-wrap');
      const contained = parent && parent !== region && parent.scrollWidth > parent.clientWidth + 2;
      const show = scrolling && !contained;
      hint.hidden = !show;
      if (show) {
        region.dataset.readableOverflow = 'true';
        if (originalTab === null) region.tabIndex = 0;
        // A focusable native table must keep its table/header semantics.
        if (originalRole === null && region.tagName !== 'TABLE') region.setAttribute('role', 'region');
        if (originalLabel === null) region.setAttribute('aria-label', 'Scrollable reading content');
      } else {
        delete region.dataset.readableOverflow;
        reset();
      }
    };
    return { region, hint, sync, reset };
  });
  const observer = new ResizeObserver(() => entries.forEach(entry => entry.sync()));
  for (const entry of entries) observer.observe(entry.region);
  void document.fonts.ready.then(() => entries.forEach(entry => entry.sync()));
  entries.forEach(entry => entry.sync());
  cleanupPage = () => {
    observer.disconnect();
    for (const entry of entries) {
      entry.hint.remove();
      entry.reset();
      delete entry.region.dataset.readableOverflow;
    }
  };
}

document.addEventListener('astro:before-swap', () => { cleanupPage?.(); cleanupPage = undefined; });
