/** Browser adapter shared by the nine games; gameplay stays in each game's engine. */
export function mountGameTools(doc: Document) {
  const abort = new AbortController();
  const { signal } = abort;
  const cleanups: Array<() => void> = [];
  doc.querySelectorAll<HTMLElement>('[data-game-tools]').forEach((toolbar) => {
    const root = toolbar.closest<HTMLElement>('[data-game-root]');
    const button = toolbar.querySelector<HTMLButtonElement>('[data-game-focus]');
    const fullscreen = toolbar.querySelector<HTMLButtonElement>('[data-game-fullscreen]');
    if (!root || !button) return;
    root.tabIndex = 0;
    let priorFocus: HTMLElement | null = null;
    let priorScroll = 0;
    let priorOverflow = '';
    let focused = false;
    const announce = (message: string) => {
      const status = toolbar.querySelector('[data-game-announcement]');
      if (status) status.textContent = message;
    };
    function exit() {
      if (!focused) return;
      focused = false;
      root!.classList.remove('game-focus-view');
      doc.body.style.overflow = priorOverflow;
      button!.textContent = 'Focus view';
      button!.setAttribute('aria-pressed', 'false');
      if (doc.fullscreenElement === root) void doc.exitFullscreen().catch(() => {});
      priorFocus?.focus({ preventScroll: true });
      window.scrollTo({ top: priorScroll, behavior: 'instant' });
      window.dispatchEvent(new Event('resize'));
      announce('Focus view closed.');
    }
    function enter() {
      if (focused) return;
      priorFocus = doc.activeElement instanceof HTMLElement ? doc.activeElement : null;
      priorScroll = window.scrollY;
      priorOverflow = doc.body.style.overflow;
      focused = true;
      root!.classList.add('game-focus-view');
      doc.body.style.overflow = 'hidden';
      button!.textContent = 'Exit focus · Esc';
      button!.setAttribute('aria-pressed', 'true');
      button!.focus({ preventScroll: true });
      window.dispatchEvent(new Event('resize'));
      announce('Focus view opened. Escape or Exit focus closes it.');
    }
    button.addEventListener('click', () => focused ? exit() : enter(), { signal });
    fullscreen?.addEventListener('click', () => {
      enter();
      if (root.requestFullscreen) void root.requestFullscreen().catch(() => announce('Focus view is available; native fullscreen is not supported here.'));
    }, { signal });
    doc.addEventListener('fullscreenchange', () => { if (!doc.fullscreenElement) exit(); }, { signal });
    root.addEventListener('pointerdown', (event) => {
      if (!(event.target instanceof Element) || event.target.closest('input,select,textarea,button,a')) return;
      root.focus({ preventScroll: true });
    }, { signal });
    // Prevent global game hotkeys from consuming search, menus or unrelated page controls.
    window.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && focused) { event.preventDefault(); exit(); return; }
      const target = event.target instanceof Element ? event.target : null;
      if (!target) return;
      if (target.closest('input,select,textarea,[contenteditable="true"]') || !root.contains(target)) {
        if (/^(Arrow| |[wasdfcrp12]$)/i.test(event.key)) event.stopImmediatePropagation();
      }
    }, { capture: true, signal });
    cleanups.push(exit);
  });
  return () => { abort.abort(); cleanups.forEach((cleanup) => cleanup()); };
}
