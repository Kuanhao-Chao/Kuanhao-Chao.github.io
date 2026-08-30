import { site } from '../data/site';

export type BreadcrumbItem = {
  name: string;
  path: string;
};

export function buildBreadcrumbLd(items: BreadcrumbItem[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      {
        '@type': 'ListItem',
        position: 1,
        name: 'Home',
        item: `${site.url}/`,
      },
      ...items.map((item, idx) => ({
        '@type': 'ListItem',
        position: idx + 2,
        name: item.name,
        item: new URL(item.path, site.url).href,
      })),
    ],
  };
}
