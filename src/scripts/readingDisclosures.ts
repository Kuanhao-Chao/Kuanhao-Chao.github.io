/** Progressive disclosure only: without JavaScript, full authors/objectives stay open. */
const cleanups = new Set<() => void>();

function fragmentTarget(): HTMLElement | null {
  try { return document.getElementById(decodeURIComponent(location.hash.slice(1))); }
  catch { return null; }
}

export function mountReadingDisclosures(root: ParentNode = document) {
  for (const details of root.querySelectorAll<HTMLDetailsElement>('[data-mobile-disclosure]')) {
    if (details.dataset.disclosureReady) continue;
    details.dataset.disclosureReady = 'true';
    const media = matchMedia(`(max-width: ${Number(details.dataset.collapseAt) || 640}px)`);
    const revealTarget = () => {
      const target = fragmentTarget();
      if (target && details.contains(target)) details.open = true;
    };
    const sync = () => {
      details.open = !media.matches;
      revealTarget();
    };
    let printOpen = details.open;
    const beforePrint = () => { printOpen = details.open; details.open = true; };
    const afterPrint = () => { details.open = printOpen; };
    sync();
    media.addEventListener('change', sync);
    window.addEventListener('hashchange', revealTarget);
    window.addEventListener('beforeprint', beforePrint);
    window.addEventListener('afterprint', afterPrint);
    cleanups.add(() => {
      media.removeEventListener('change', sync);
      window.removeEventListener('hashchange', revealTarget);
      window.removeEventListener('beforeprint', beforePrint);
      window.removeEventListener('afterprint', afterPrint);
      delete details.dataset.disclosureReady;
    });
  }
}

document.addEventListener('astro:before-swap', () => {
  for (const cleanup of cleanups) cleanup();
  cleanups.clear();
});
