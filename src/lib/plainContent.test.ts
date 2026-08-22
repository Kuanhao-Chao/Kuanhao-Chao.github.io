import { describe, expect, it } from 'vitest';
import { plainMdx } from './plainContent';

describe('plainMdx', () => {
  it('keeps explanatory prose while removing imports, JSX chrome, and complete SVG drawings', () => {
    const source = `
import Figure from '../Figure.astro';

## Intuition

Before the figure, explain the signal.

<Figure caption="A diagram">
  <svg viewBox="0 0 10 10">
    <path d="M0 0 L10 10" />
    <text x="2" y="4">noise label</text>
  </svg>
</Figure>

After the figure, keep the diagnostic.
`;

    const text = plainMdx(source);
    expect(text).toContain('Intuition Before the figure, explain the signal.');
    expect(text).toContain('After the figure, keep the diagnostic.');
    expect(text).not.toMatch(/import|<svg|viewBox|M0 0|noise label|caption=/);
  });

  it('unwraps Markdown links, removes code fences, and applies a stable limit', () => {
    const source = `[Readable label](https://example.com) before.

\`\`\`python
secret_implementation_detail()
\`\`\`

${'useful '.repeat(30)}`;
    const text = plainMdx(source, 80);
    expect(text).toContain('Readable label before.');
    expect(text).not.toContain('secret_implementation_detail');
    expect(text.length).toBeLessThanOrEqual(81);
    expect(text.endsWith('…')).toBe(true);
  });
});
