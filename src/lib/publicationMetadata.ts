import type { CollectionEntry } from 'astro:content';
import { preprintLabel, publicationSourceUrl } from './citationText';
import { fullDate } from './format';
import { pubSlug } from './slug';

type PublicationData = CollectionEntry<'publications'>['data'];

/** Every publication title uses the same destination, including search and terminal links. */
export function publicationHref(entry: Pick<CollectionEntry<'publications'>, 'id' | 'data'>) {
  return entry.data.externalUrl ?? `/publications/${pubSlug(entry.id)}/`;
}

/** External-only records remain listed and citable without generating a local detail page. */
export function hasPublicationDetail(data: Pick<PublicationData, 'externalUrl'>) {
  return !data.externalUrl;
}

/** Shared by listing cards and detail pages so resource labels cannot drift. */
export function publicationLinks(data: PublicationData) {
  return [
    { key: 'doi', label: 'DOI', icon: 'link', href: data.doi },
    {
      key: 'preprint',
      label: data.preprint ? preprintLabel(data.preprint) : '',
      icon: 'external',
      href: data.preprint,
    },
    { key: 'pdf', label: 'PDF', icon: 'file', href: data.pdf },
    { key: 'code', label: 'Code', icon: 'code', href: data.code },
    { key: 'docs', label: 'Docs', icon: 'book', href: data.docs },
    { key: 'models', label: 'Models', icon: 'cpu', href: data.models },
    { key: 'lab', label: 'Lab', icon: 'sparkles', href: data.lab },
    { key: 'slides', label: 'Slides', icon: 'slides', href: data.slides },
    { key: 'poster', label: 'Poster', icon: 'image', href: data.poster },
    { key: 'video', label: 'Talk', icon: 'play', href: data.video },
    { key: 'news', label: 'News', icon: 'external', href: data.news },
    { key: 'data', label: 'Data', icon: 'database', href: data.data },
  ].filter((link): link is { key: string; label: string; icon: string; href: string } =>
    Boolean(link.href)
  );
}

/** A model's common name need not appear in its formal manuscript title. */
export function publicationSearchText(data: PublicationData) {
  return [data.title, data.authors, data.venue, data.abstract]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

export function publicationDateLabel(data: Pick<PublicationData, 'date' | 'dateBasis'>) {
  return `${data.dateBasis === 'announcement' ? 'Announced ' : ''}${fullDate(data.date)}`;
}

/** Do not turn an announcement date or a PDF URL into a fabricated DOI/publication date. */
export function publicationRecordMetadata(data: PublicationData) {
  const source = publicationSourceUrl(data);
  return {
    ...(data.dateBasis !== 'announcement'
      ? { datePublished: data.date.toISOString().slice(0, 10) }
      : {}),
    ...(source ? { sameAs: data.doi && data.preprint ? [data.doi, data.preprint] : source } : {}),
    ...(data.doi ? { identifier: data.doi } : {}),
  };
}
