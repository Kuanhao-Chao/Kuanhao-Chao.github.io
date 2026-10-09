import { describe, expect, it } from 'vitest';
import {
  authorNames,
  preprintLabel,
  publicationCitation,
  publicationRis,
  publicationSourceUrl,
} from './citationText';

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
    title:
      'Predicting dynamic expression patterns in budding yeast with a fungal DNA language model',
    authors:
      'Kuan-Hao Chao*, Majed Mohamed Magzoub, Emily Stoops, Sean R. Hackett, Johannes Linder*, David R. Kelley*',
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

  it('preserves the DOI and earlier posting in the appropriate RIS fields', () => {
    const ris = publicationRis(shorkie);
    expect(ris).toContain('DO  - 10.7554/eLife.112217.1');
    expect(ris).toContain('UR  - https://doi.org/10.7554/eLife.112217.1');
    expect(ris).not.toContain('UR  - https://doi.org/10.1101/2025.09.19.677475');
  });
});

describe('publication exports without a DOI', () => {
  const preprint = {
    title: 'A unified framework for quantitative splicing and transcript prediction',
    authors: 'Kishore Jaganathan*†, Jianbin Chen†, Kuan-Hao Chao, Kyle Kai-How Farh*',
    venue: 'Illumina preprint',
    date: new Date('2026-10-08'),
    type: 'preprint',
    status: 'preprint',
    pdf: 'https://assets.illumina.com/SpliceAI2.pdf',
  } as unknown as Data;

  it('retains the primary PDF in the copied citation', () => {
    const citation = publicationCitation(preprint);
    expect(citation.endsWith(preprint.pdf!)).toBe(true);
    expect(citation).toContain('(2026).');
    expect(citation).not.toMatch(/[*†]/);
  });

  it('exports a URL without inventing a DOI', () => {
    const ris = publicationRis(preprint);
    expect(ris).toContain(`UR  - ${preprint.pdf}`);
    expect(ris).not.toContain('DO  -');
    expect(ris.match(/^AU  - /gm)).toHaveLength(4);
    expect(ris).toContain('AU  - Kuan-Hao Chao');
    expect(ris).not.toMatch(/[*†]/);
  });

  it('prefers DOI, then PDF, then preprint URL', () => {
    const doi = 'https://doi.org/10.1234/example';
    const posting = 'https://example.org/preprint';
    expect(publicationSourceUrl({ ...preprint, doi, preprint: posting })).toBe(doi);
    expect(publicationSourceUrl({ ...preprint, preprint: posting })).toBe(preprint.pdf);
    const posted = { ...preprint, pdf: undefined, preprint: posting };
    expect(publicationSourceUrl(posted)).toBe(posting);
    expect(publicationRis(posted)).toContain(`UR  - ${posting}`);
    expect(publicationCitation(posted).endsWith(posting)).toBe(true);
  });

  it('handles entries with no external record', () => {
    const withoutLink = { ...preprint, pdf: undefined };
    expect(publicationSourceUrl(withoutLink)).toBeUndefined();
    expect(publicationCitation(withoutLink).endsWith('Illumina preprint.')).toBe(true);
    expect(publicationRis(withoutLink)).not.toMatch(/^(DO|UR)  -/m);
  });

  it('does not export an elision as an author', () => {
    expect(authorNames('Kishore Jaganathan*†, …, Kuan-Hao Chao')).toEqual([
      'Kishore Jaganathan',
      'Kuan-Hao Chao',
    ]);
  });
});
