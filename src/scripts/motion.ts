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
  let stopped = false;
  const enter = () => {
    if (!stopped) onEnter();
  };
  const checkReached = () => {
    if (stopped || typeof window === 'undefined') return;
    if (el.getBoundingClientRect().top <= window.innerHeight) enter();
  };
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (e.isIntersecting) enter();
      else onLeave?.();
    }
  }, options);
  io.observe(el);
  window.addEventListener('scroll', checkReached, { passive: true });
  window.addEventListener('resize', checkReached);
  window.requestAnimationFrame(checkReached);
  return () => {
    stopped = true;
    io.disconnect();
    window.removeEventListener('scroll', checkReached);
    window.removeEventListener('resize', checkReached);
  };
}
