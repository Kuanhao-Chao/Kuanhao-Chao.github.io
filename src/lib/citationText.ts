import type { CollectionEntry } from 'astro:content';

type PublicationData = CollectionEntry<'publications'>['data'];

function cleanAuthors(authors: string) {
  return authors.replace(/[*†]/g, '').replace(/\s+/g, ' ').trim();
}

export function publicationCitation(data: PublicationData) {
  const year = data.date.getUTCFullYear();
  const doi = data.doi ? ` ${data.doi}` : '';
  return `${cleanAuthors(data.authors)} (${year}). ${data.title}. ${data.venue}.${doi}`;
}

// RIS export (EndNote/Zotero/Mendeley import format). Names are kept in their given
// "First Last" form (RIS readers accept it) to avoid mangling middle names/particles.
const RIS_TYPE: Record<PublicationData['type'], string> = {
  journal: 'JOUR',
  conference: 'CPAPER',
  preprint: 'JOUR',
  thesis: 'THES',
};

export function publicationRis(data: PublicationData) {
  const lines = [`TY  - ${RIS_TYPE[data.type] ?? 'GEN'}`];
  for (const author of cleanAuthors(data.authors).split(',').map((a) => a.trim()).filter(Boolean)) {
    lines.push(`AU  - ${author}`);
  }
  lines.push(`TI  - ${data.title}`);
  lines.push(`T2  - ${data.venue}`);
  lines.push(`PY  - ${data.date.getUTCFullYear()}`);
  if (data.doi) {
    lines.push(`DO  - ${data.doi.replace(/^https?:\/\/(dx\.)?doi\.org\//i, '')}`);
    lines.push(`UR  - ${data.doi}`);
  }
  lines.push('ER  - ');
  return lines.join('\n');
}
