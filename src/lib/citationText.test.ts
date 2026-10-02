import { describe, expect, it } from 'vitest';
import { preprintLabel, publicationCitation } from './citationText';

type Data = Parameters<typeof publicationCitation>[0];

describe('preprintLabel', () => {
  it('names the repository a preprint link points at', () => {
    // 10.1101 is bioRxiv's DOI prefix (medRxiv shares it; this site cites only bioRxiv under it).
    expect(preprintLabel('https://doi.org/10.1101/2025.09.19.677475')).toBe('bioRxiv');
    expect(preprintLabel('https://www.biorxiv.org/content/10.1101/2025.09.19.677475v1')).toBe(
      'bioRxiv'
    );
    expect(preprintLabel('https://arxiv.org/abs/1706.03762')).toBe('arXiv');
    expect(preprintLabel('https://doi.org/10.48550/arXiv.1706.03762')).toBe('arXiv');
  });

  it('falls back to a plain, still-true label for an unknown server', () => {
    expect(preprintLabel('https://example.org/some-preprint')).toBe('Preprint');
    expect(preprintLabel('')).toBe('Preprint');
  });
});

describe('publicationCitation for a reviewed preprint', () => {
  // The Shorkie entry as published: an eLife reviewed preprint (a version of the bioRxiv
  // preprint), cited by the eLife DOI and the year Crossref gives that DOI.
  const shorkie = {
    title: 'Predicting dynamic expression patterns in budding yeast with a fungal DNA language model',
    authors: 'Kuan-Hao Chao*, Majed Mohamed Magzoub, Emily Stoops, Sean R. Hackett, Johannes Linder*, David R. Kelley*',
    venue: 'eLife',
    date: new Date('2026-09-15'),
    type: 'preprint',
    status: 'preprint',
    doi: 'https://doi.org/10.7554/eLife.112217.1',
    preprint: 'https://doi.org/10.1101/2025.09.19.677475',
  } as unknown as Data;

  it('cites the eLife record, not the earlier posting', () => {
    const text = publicationCitation(shorkie);
    expect(text).toContain('(2026).');
    expect(text).toContain('eLife.');
    expect(text.endsWith('https://doi.org/10.7554/eLife.112217.1')).toBe(true);
    expect(text).not.toContain('bioRxiv');
    expect(text).not.toContain('Kuan-Hao Chao*');
  });
});
