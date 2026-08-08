import type { CollectionEntry } from 'astro:content';

type PublicationData = CollectionEntry<'publications'>['data'];

function cleanAuthors(authors: string) {
  return authors.replace(/[*†]/g, '').replace(/\s+/g, ' ').trim();
}

/**
 * Discrete author names, for exports that enumerate authors as records (RIS, JSON-LD).
 * Long consortium lists are elided with "…" in the display string — correct in prose,
 * but it must never become an author of its own.
 */
export function authorNames(authors: string) {
  return cleanAuthors(authors)
    .split(',')
    .map((a) => a.trim())
    .filter((a) => a && !/^[….]+$/.test(a));
}

/**
 * "Cell, 189(16), 4857–4875.e31" for a version of record; plain "bioRxiv" for an
 * entry that carries no volume/issue/pages, so those citations are unchanged.
 */
function venueWithDetail(data: PublicationData) {
  const volumeIssue = [data.volume, data.issue && `(${data.issue})`].filter(Boolean).join('');
  return [data.venue, volumeIssue, data.pages].filter(Boolean).join(', ');
}

export function publicationCitation(data: PublicationData) {
  const year = data.date.getUTCFullYear();
  const doi = data.doi ? ` ${data.doi}` : '';
  return `${cleanAuthors(data.authors)} (${year}). ${data.title}. ${venueWithDetail(data)}.${doi}`;
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
  for (const author of authorNames(data.authors)) {
    lines.push(`AU  - ${author}`);
  }
  lines.push(`TI  - ${data.title}`);
  lines.push(`T2  - ${data.venue}`);
  lines.push(`PY  - ${data.date.getUTCFullYear()}`);
  if (data.volume) lines.push(`VL  - ${data.volume}`);
  if (data.issue) lines.push(`IS  - ${data.issue}`);
  if (data.pages) {
    // Split on the first dash: "4857–4875.e31" is a range, "eadn7527" a start page only.
    const range = data.pages.match(/^(.+?)\s*[–—-]\s*(.+)$/);
    lines.push(`SP  - ${range ? range[1] : data.pages}`);
    if (range) lines.push(`EP  - ${range[2]}`);
  }
  if (data.doi) {
    lines.push(`DO  - ${data.doi.replace(/^https?:\/\/(dx\.)?doi\.org\//i, '')}`);
    lines.push(`UR  - ${data.doi}`);
  }
  lines.push('ER  - ');
  return lines.join('\n');
}
