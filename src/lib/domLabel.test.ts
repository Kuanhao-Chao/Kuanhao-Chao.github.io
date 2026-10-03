import { describe, expect, it } from 'vitest';
import { setLabel } from './domLabel';

// The unit suite has no DOM, so these are structural stand-ins for the three things setLabel
// reads and writes. What matters is which of them it touches: the browser audit (`slowPress`)
// is what proves the behaviour in a real engine.
function textNode(data: string) {
  return { nodeType: 3, data };
}
function host(children: unknown[], text: string) {
  const writes: string[] = [];
  const element = {
    childNodes: { length: children.length },
    firstChild: (children[0] ?? null) as unknown,
    get textContent() {
      return text;
    },
    set textContent(value: string) {
      writes.push(value);
      text = value;
    },
  };
  return { element: element as unknown as Element, writes };
}

describe('setLabel', () => {
  it('writes nothing when the label already says the same thing', () => {
    const node = textNode('Play');
    const { element, writes } = host([node], 'Play');
    setLabel(element, 'Play');
    expect(writes).toEqual([]);
    expect(element.firstChild).toBe(node);
    expect(node.data).toBe('Play');
  });

  it('updates the existing text node in place when the label changes', () => {
    const node = textNode('Play');
    const { element, writes } = host([node], 'Play');
    setLabel(element, 'Pause');
    expect(node.data).toBe('Pause');
    expect(element.firstChild).toBe(node);
    // Assigning textContent would replace the node and lose a click in WebKit.
    expect(writes).toEqual([]);
  });

  it('falls back to textContent for an empty element, but only when the text differs', () => {
    const empty = host([], '');
    setLabel(empty.element, 'Play');
    expect(empty.writes).toEqual(['Play']);
    setLabel(empty.element, 'Play');
    expect(empty.writes).toEqual(['Play']);
  });

  it('falls back to textContent when the child is not a lone text node', () => {
    const child = { nodeType: 1 };
    const wrapped = host([child], 'Play');
    setLabel(wrapped.element, 'Play');
    expect(wrapped.writes).toEqual([]);
    setLabel(wrapped.element, 'Pause');
    expect(wrapped.writes).toEqual(['Pause']);

    const mixed = host([textNode('Play '), { nodeType: 1 }], 'Play x');
    setLabel(mixed.element, 'Play');
    expect(mixed.writes).toEqual(['Play']);
  });

  it('accepts a missing element', () => {
    expect(() => setLabel(null, 'x')).not.toThrow();
    expect(() => setLabel(undefined, 'x')).not.toThrow();
  });
});
