export interface ReferenceItem {
  text: string;
  doi?: string;
  url?: string;
}

export interface ScholarMeta {
  title: string;
  authors: string[];
  publicationDate: string;
  pdfUrl?: string;
  technicalReportInstitution?: string;
  technicalReportNumber?: string;
  references?: string[];
}

export function scholarDate(date: Date) {
  return date.toISOString().slice(0, 10).replaceAll('-', '/');
}

export function referenceUrl(ref: ReferenceItem) {
  return ref.doi ?? ref.url;
}

export function referenceLabel(ref: ReferenceItem) {
  if (ref.doi) return ref.doi.replace(/^https?:\/\/doi\.org\//i, 'doi:');
  return ref.url;
}

export function citationReference(ref: ReferenceItem) {
  const locator = referenceLabel(ref);
  return locator ? `${ref.text} ${locator}` : ref.text;
}

export function referenceLd(ref: ReferenceItem) {
  const url = referenceUrl(ref);
  return {
    '@type': 'CreativeWork',
    name: citationReference(ref),
    ...(ref.doi ? { sameAs: ref.doi } : {}),
    ...(url ? { url } : {}),
  };
}

export function makeScholarMeta(args: {
  title: string;
  authors: string[];
  date: Date;
  pdfUrl?: string;
  references?: ReferenceItem[];
  technicalReportInstitution?: string;
  technicalReportNumber?: string;
}): ScholarMeta {
  return {
    title: args.title,
    authors: args.authors,
    publicationDate: scholarDate(args.date),
    pdfUrl: args.pdfUrl,
    technicalReportInstitution: args.technicalReportInstitution,
    technicalReportNumber: args.technicalReportNumber,
    references: args.references?.map(citationReference),
  };
}
