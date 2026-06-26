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
