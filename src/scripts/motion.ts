/**
 * Shared motion helpers for the genomic animation pieces.
 * Mirrors the reduced-motion + visibility conventions already used by
 * SiteBackground.astro / HeroBackground.astro, kept tiny and dependency-free.
 */

export function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

/**
 * Call `onEnter` when `el` scrolls into view (and `onLeave` when it leaves).
 * Returns a disconnect function. Falls back to firing `onEnter` once if
 * IntersectionObserver is unavailable.
 */
export function onVisible(
  el: Element,
  onEnter: () => void,
  onLeave?: () => void,
  options: IntersectionObserverInit = { threshold: 0.01, rootMargin: '0px 0px -4% 0px' }
): () => void {
  if (typeof IntersectionObserver === 'undefined') {
    onEnter();
    return () => {};
  }
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (e.isIntersecting) onEnter();
      else onLeave?.();
    }
  }, options);
  io.observe(el);
  return () => io.disconnect();
}
