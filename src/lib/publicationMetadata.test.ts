import { describe, expect, it } from 'vitest';
import type { CollectionEntry } from 'astro:content';
import {
  publicationDateLabel,
  publicationLinks,
  publicationRecordMetadata,
  publicationSearchText,
} from './publicationMetadata';

type Data = CollectionEntry<'publications'>['data'];

const paper = {
  title: 'A unified framework for quantitative splicing and transcript prediction',
  authors: 'Kishore Jaganathan*†, Kuan-Hao Chao',
  venue: 'Illumina preprint',
  date: new Date('2026-10-08'),
  dateBasis: 'announcement',
  abstract: 'SpliceAI2 predicts quantitative splice-site, junction, and transcript usage.',
  pdf: 'https://assets.illumina.com/SpliceAI2.pdf',
  code: 'https://github.com/Illumina/SpliceAI2',
  docs: 'https://github.com/Illumina/SpliceAI2#installation',
  models: 'https://huggingface.co/illumina-ai/SpliceAI2',
  data: 'https://huggingface.co/datasets/illumina-ai/SpliceAI2-data',
  news: 'https://www.illumina.com/science/genomics-research/articles/spliceai2.html',
} as unknown as Data;

describe('publication resources and search', () => {
  it('distinguishes model weights from precomputed predictions', () => {
    const links = publicationLinks(paper);
    expect(links.map((link) => link.label)).toEqual([
      'PDF',
      'Code',
      'Docs',
      'Models',
      'News',
      'Data',
    ]);
    expect(links.find((link) => link.label === 'Models')?.href).toBe(paper.models);
    expect(links.find((link) => link.label === 'Data')?.href).toBe(paper.data);
    expect(links.every((link) => link.href)).toBe(true);
    expect(new Set(links.map((link) => link.key)).size).toBe(links.length);
  });

  it('keeps existing links and adds no Models chip when it is absent', () => {
    const links = publicationLinks({
      ...paper,
      models: undefined,
      doi: 'https://doi.org/10.1234/paper',
    });
    expect(links[0]).toMatchObject({ label: 'DOI', href: 'https://doi.org/10.1234/paper' });
    expect(links.some((link) => link.label === 'Models')).toBe(false);
  });

  it('still labels known preprint servers correctly', () => {
    const links = publicationLinks({ ...paper, preprint: 'https://arxiv.org/abs/1706.03762' });
    expect(links.find((link) => link.key === 'preprint')?.label).toBe('arXiv');
  });

  it('finds a model name absent from the formal title', () => {
    expect(paper.title.toLowerCase()).not.toContain('spliceai2');
    expect(publicationSearchText(paper)).toContain('spliceai2');
    expect(publicationSearchText(paper)).toContain('kuan-hao chao');
    expect(publicationSearchText(paper)).toContain('illumina preprint');
  });

  it('works for an existing entry without an abstract', () => {
    expect(publicationSearchText({ ...paper, abstract: undefined })).not.toContain('undefined');
  });
});

describe('publication date and record metadata', () => {
  it('labels a launch date as an announcement, not a publication date', () => {
    expect(publicationDateLabel(paper)).toBe('Announced Oct 8, 2026');
    expect(publicationRecordMetadata(paper)).toEqual({ sameAs: paper.pdf });
  });

  it('retains an exact published date for existing entries', () => {
    const published = { ...paper, dateBasis: 'publication' as const };
    expect(publicationDateLabel(published)).toBe('Oct 8, 2026');
    expect(publicationRecordMetadata(published).datePublished).toBe('2026-10-08');
  });

  it('keeps the DOI identifier and both records for reviewed preprints', () => {
    const reviewed = {
      ...paper,
      dateBasis: 'publication' as const,
      doi: 'https://doi.org/10.7554/eLife.112217.1',
      preprint: 'https://doi.org/10.1101/2025.09.19.677475',
    };
    expect(publicationRecordMetadata(reviewed)).toEqual({
      datePublished: '2026-10-08',
      identifier: reviewed.doi,
      sameAs: [reviewed.doi, reviewed.preprint],
    });
  });

  it('has no fabricated identifier or record when no external URL is known', () => {
    const record = publicationRecordMetadata({ ...paper, pdf: undefined });
    expect(record).not.toHaveProperty('sameAs');
    expect(record).not.toHaveProperty('identifier');
    expect(record).not.toHaveProperty('datePublished');
  });
});
