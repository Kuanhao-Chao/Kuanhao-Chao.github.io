import { readFileSync } from 'node:fs';
import { parse } from 'yaml';
import { describe, expect, it } from 'vitest';
import { authorNames } from './citationText';
import { hasPublicationDetail, publicationHref } from './publicationMetadata';
import { pubSlug } from './slug';

function content(path: string) {
  const source = readFileSync(new URL(`../content/${path}`, import.meta.url), 'utf8');
  const match = source.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) throw new Error(`Missing frontmatter: ${path}`);
  return { data: parse(match[1]), body: source.slice(match[0].length) };
}

const id = '2026-10-spliceai2';
const pdf =
  'https://assets.illumina.com/content/dam/illumina-marketing/images/genomics-research/articles/spliceai2/SpliceAI2.pdf';
const authors = [
  'Kishore Jaganathan',
  'Jianbin Chen',
  'Xin Liu',
  'Yan Zhang',
  'Yujin Kim',
  'Abhimanyu Banerjee',
  'Petko P. Fiziev',
  'Naomi Wilcox',
  'Ibrahim I. Taskiran',
  'Yichao Cai',
  'Emilie M. Wigdor',
  'Guo-Liang Chew',
  'Grace Png',
  'Jeremy F. McRae',
  'Aniketh Janardhan Reddy',
  'Kuan-Hao Chao',
  'Rami Mehio',
  'Stephan J. Sanders',
  'Kyle Kai-How Farh',
];

describe('SpliceAI2 publication content contract', () => {
  it('preserves the title, full author order, and contribution convention', () => {
    const { data } = content(`publications/${id}.md`);
    expect(data.title).toBe(
      'A unified framework for quantitative splicing and transcript prediction'
    );
    expect(authorNames(data.authors)).toEqual(authors);
    expect(
      data.authors
        .split(',')
        .map((name: string) => name.trim())
        .slice(0, 4)
    ).toEqual(['Kishore Jaganathan*†', 'Jianbin Chen†', 'Xin Liu†', 'Yan Zhang†']);
    expect(data.authors.endsWith('Kyle Kai-How Farh*')).toBe(true);
    expect(data.authors).not.toMatch(/Kuan-Hao Chao[*†]/);
  });

  it('is a nonfeatured preprint with an explicit announcement-date basis', () => {
    const { data, body } = content(`publications/${id}.md`);
    expect(data).toMatchObject({
      type: 'preprint',
      status: 'preprint',
      dateBasis: 'announcement',
      featured: false,
    });
    expect(String(data.date)).toBe('2026-10-08');
    expect(data).not.toHaveProperty('doi');
    expect(data).not.toHaveProperty('selectedOrder');
    expect(data.abstract).toContain('SpliceAI2');
    expect(data.externalUrl).toBe(pdf);
    expect(publicationHref({ id, data })).toBe(pdf);
    expect(hasPublicationDetail(data)).toBe(false);
    expect(body.trim()).toBe('');
    expect(pubSlug(id)).toBe('spliceai2');
  });

  it('links code, documentation, models, and data to the correct official resources', () => {
    const { data } = content(`publications/${id}.md`);
    expect(data.pdf).toBe(pdf);
    expect(data.code).toBe('https://github.com/Illumina/SpliceAI2');
    expect(data.docs).toBe('https://github.com/Illumina/SpliceAI2#installation');
    expect(data.models).toBe('https://huggingface.co/illumina-ai/SpliceAI2');
    expect(data.data).toBe('https://huggingface.co/datasets/illumina-ai/SpliceAI2-data');
    expect(data.news).toBe(
      'https://www.illumina.com/science/genomics-research/articles/introducing-spliceai2--the-next-generation-of-splicing-and-trans.html'
    );
  });

  it('exports every author in BibTeX without contribution marks or a fictitious DOI', () => {
    const { data } = content(`publications/${id}.md`);
    const authorField = data.bibtex.match(/author\s*=\s*\{([^}]+)\}/)[1];
    expect(authorField.split(/\s+and\s+/)).toHaveLength(19);
    expect(authorField).toContain('Chao, Kuan-Hao');
    expect(authorField).not.toMatch(/[*†]/);
    expect(data.bibtex).toMatch(/@misc\{jaganathan2026spliceai2/);
    expect(data.bibtex).not.toMatch(/\bdoi\s*=/i);
    expect(data.bibtex).toContain(pdf);
  });

  it('keeps SpliceAI2 as related work only, without a body section or numbered reference', () => {
    const { data, body } = content('research/splice-sites.mdx');
    expect(data.relatedPublications.map((ref: { publication: string }) => ref.publication)).toEqual(
      ['2024-08-splam', '2025-06-openspliceai', id]
    );
    expect(data.relatedPublications[2].resourceLabel).toBe('SpliceAI2 preprint');
    expect(data.references.some((ref: { url?: string }) => ref.url === pdf)).toBe(false);
    expect(body).not.toContain('### Quantitative splicing');
    expect(body).not.toContain(pdf);
    expect(body).not.toContain('https://huggingface.co/illumina-ai/SpliceAI2');
    expect(body).not.toContain('https://huggingface.co/datasets/illumina-ai/SpliceAI2-data');
    expect(body).not.toContain('/publications/spliceai2/');
    expect(body).not.toContain('contributing to model development and implementation');
    expect(body).not.toContain('I co-authored');
    expect(body.match(/^## Future directions$/gm)).toHaveLength(1);
  });

  it('uses the approved gratitude wording and links news directly to the preprint', () => {
    const { data, body } = content('news/2026-10-08-spliceai2-preprint.md');
    expect(data.category).toBe('publication');
    expect(String(data.date)).toBe('2026-10-08');
    expect(data.link).toBe(pdf);
    expect(data.draft).not.toBe(true);
    expect(body).toContain(
      "I'm honored to have been part of the SpliceAI2 team, and grateful to Kishore Jaganathan for the opportunity."
    );
    expect(body).toContain(
      `[A unified framework for quantitative splicing and transcript prediction](${pdf})`
    );
    expect(body).not.toContain('/publications/spliceai2/');
    expect(body).not.toContain('I co-authored');
    expect(body).toContain('https://github.com/Illumina/SpliceAI2');
  });

  it('uses the shared title destination in every publication-link consumer', () => {
    for (const path of [
      '../components/PublicationItem.astro',
      '../components/ResearchWorkList.astro',
      '../components/TalksList.astro',
      '../pages/search.json.js',
      '../pages/terminal.json.js',
    ]) {
      const source = readFileSync(new URL(path, import.meta.url), 'utf8');
      expect(source, path).toMatch(/href[:=]\s*\{?publicationHref\((?:pub|entry)\)/);
    }
    const route = readFileSync(
      new URL('../pages/publications/[...slug].astro', import.meta.url),
      'utf8'
    );
    expect(route).toContain('.filter((entry) => hasPublicationDetail(entry.data))');
  });

  it('replaces the old detail URL with an external preprint redirect', () => {
    const config = readFileSync(new URL('../../astro.config.mjs', import.meta.url), 'utf8');
    const redirect = config.match(/'\/publications\/spliceai2':\s*'([^']+)'/);
    expect(redirect?.[1]).toBe(pdf);
  });
});
