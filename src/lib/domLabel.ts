/**
 * Write an element's label without disturbing a press that is in progress.
 *
 * `element.textContent = text` replaces the element's text node, and it does so even when
 * `text` is what the element already says. WebKit drops the `click` of a button whose text
 * node was replaced between its `mousedown` and its `mouseup`: the pointer events arrive and
 * the click never does. (Chromium delivers it. Reproduced with raw mouse events: replacing the
 * node loses the click in WebKit, writing `firstChild.data` keeps it.)
 *
 * The background explorer refreshes its Play label every 500 ms, so on Safari a press that
 * lasted longer than the gap to the next refresh was silently ignored, about one press in
 * five at a normal click length and far more often when the main thread is busy between the
 * two events, which is when a slow machine spreads them furthest apart. The audit's pause
 * choreography failed on the Linux WebKit runner for exactly this reason.
 *
 * So: update the existing text node in place, and write nothing at all when nothing changed.
 * Anything that is not a lone text node (an element child, an empty element) falls back to
 * `textContent`, still only when the text differs.
 */
export function setLabel(
  element: Pick<Element, 'childNodes' | 'firstChild' | 'textContent'> | null | undefined,
  text: string
): void {
  if (!element) return;
  const only = element.childNodes.length === 1 ? element.firstChild : null;
  if (only?.nodeType === 3 /* Node.TEXT_NODE */) {
    const node = only as Text;
    if (node.data !== text) node.data = text;
    return;
  }
  if (element.textContent !== text) element.textContent = text;
}
