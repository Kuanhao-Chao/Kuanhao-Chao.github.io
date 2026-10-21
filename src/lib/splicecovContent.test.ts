import { readFileSync } from 'node:fs';
import { parse } from 'yaml';
import { describe, expect, it } from 'vitest';
import { authorNames, publicationCitation, publicationRis } from './citationText';
import {
  hasPublicationDetail,
  publicationHref,
  publicationLinks,
  publicationSearchText,
} from './publicationMetadata';

// Publisher-deposited metadata: https://api.crossref.org/works/10.3390/genes17101307
const id = '2026-10-splicecov';
const article = 'https://www.mdpi.com/2073-4425/17/10/1307';
const doi = 'https://doi.org/10.3390/genes17101307';
const code = 'https://github.com/celinehohzm/SpliceCOV';
const title =
  'SpliceCOV: Supervised Filtering of RNA-Seq-Derived Transcript Features Improves Transcriptome Assembly';
const authors = ['Celine Hoh', 'Ida Shinder', 'Kuan-Hao Chao', 'Ales Varabyou', 'Mihaela Pertea'];
const announcement =
  `Congratulations to Celine Hoh and the team on [SpliceCOV](${article}), now published in *Genes*! ` +
  'SpliceCOV uses supervised learning to filter noisy splice sites and transcript boundaries from RNA-seq data, helping improve transcriptome assembly precision. ' +
  `[Explore the code](${code}).`;

function content(path: string) {
  const source = readFileSync(new URL(`../content/${path}`, import.meta.url), 'utf8');
  const match = source.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) throw new Error(`Missing frontmatter: ${path}`);
  return { data: parse(match[1]), body: source.slice(match[0].length) };
}

describe('SpliceCOV publication and announcement', () => {
  it('preserves the published title and all five authors in order', () => {
    const { data } = content(`publications/${id}.md`);
    expect(data.title).toBe(title);
    expect(authorNames(data.authors)).toEqual(authors);
    expect(data.authors).not.toMatch(/[*†…]/);
  });

  it('records the published journal citation without changing selected publications', () => {
    const { data } = content(`publications/${id}.md`);
    expect(data).toMatchObject({
      venue: 'Genes',
      volume: '17',
      issue: '10',
      pages: '1307',
      type: 'journal',
      status: 'published',
      dateBasis: 'publication',
      featured: false,
      doi,
    });
    expect(String(data.date)).toBe('2026-10-20');
    expect(data).not.toHaveProperty('selectedOrder');
    expect(data).not.toHaveProperty('preprint');
    expect(data.abstract).toContain('StringTie');
    expect(data.abstract).toContain('reported evaluations');
  });

  it('links directly to Genes and keeps DOI, PDF, and official code access', () => {
    const { data, body } = content(`publications/${id}.md`);
    expect(data.externalUrl).toBe(article);
    expect(publicationHref({ id, data })).toBe(article);
    expect(hasPublicationDetail(data)).toBe(false);
    expect(body.trim()).toBe('');
    expect(publicationLinks(data).map(({ key, href }) => ({ key, href }))).toEqual([
      { key: 'doi', href: doi },
      { key: 'pdf', href: `${article}/pdf` },
      { key: 'code', href: code },
    ]);
    expect(publicationSearchText(data)).toContain('celine hoh');
    expect(publicationSearchText(data)).toContain('splicecov');
  });

  it('exports the journal details and every author in readable and RIS citations', () => {
    const { data } = content(`publications/${id}.md`);
    const published = { ...data, date: new Date(String(data.date)) };
    const citation = publicationCitation(published);
    expect(citation).toContain(authors.join(', '));
    expect(citation).toContain('(2026)');
    expect(citation).toContain('Genes, 17(10), 1307.');
    expect(citation).toContain(doi);
    const ris = publicationRis(published);
    expect(ris.split('\n').filter((line) => line.startsWith('AU  - '))).toEqual(
      authors.map((author) => `AU  - ${author}`)
    );
    for (const line of [
      'TY  - JOUR',
      'T2  - Genes',
      'PY  - 2026',
      'VL  - 17',
      'IS  - 10',
      'SP  - 1307',
      'DO  - 10.3390/genes17101307',
      `UR  - ${doi}`,
    ])
      expect(ris.split('\n')).toContain(line);
  });

  it('provides complete BibTeX rather than an abbreviated author list', () => {
    const { data } = content(`publications/${id}.md`);
    expect(data.bibtex).toContain('@article{hoh2026splicecov,');
    const authorField = data.bibtex.match(/author\s*=\s*\{([^}]+)\}/)?.[1];
    expect(authorField?.split(/\s+and\s+/)).toEqual([
      'Hoh, Celine',
      'Shinder, Ida',
      'Chao, Kuan-Hao',
      'Varabyou, Ales',
      'Pertea, Mihaela',
    ]);
    for (const [field, value] of Object.entries({
      journal: 'Genes',
      volume: '17',
      number: '10',
      pages: '1307',
      year: '2026',
      doi: '10.3390/genes17101307',
      url: article,
    })) {
      const fieldValue = data.bibtex.match(new RegExp(`${field}\\s*=\\s*\\{([^}]+)\\}`))?.[1];
      expect(fieldValue).toBe(value);
    }
  });

  it('congratulates Celine with concise approved copy and only public resources', () => {
    const { data, body } = content('news/2026-10-20-splicecov-published-in-genes.md');
    expect(data.title).toBe('SpliceCOV published in Genes');
    expect(data.category).toBe('publication');
    expect(String(data.date)).toBe('2026-10-20');
    expect(data.link).toBe(article);
    expect(data.draft).not.toBe(true);
    expect(body.trim()).toBe(announcement);
    expect(body.trim().split(/\s+/).length).toBeLessThan(60);
    expect(body).not.toMatch(/susy\.mdpi\.com|surveymonkey\.com|scitations\.net|\/reprints/);
    expect(body).not.toContain('/publications/splicecov/');
  });
});
