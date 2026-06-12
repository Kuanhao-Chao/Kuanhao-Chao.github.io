import rss from '@astrojs/rss';
import { getCollection } from 'astro:content';
import { site } from '../data/site.ts';

export async function GET(context) {
  const news = (await getCollection('news')).sort(
    (a, b) => b.data.date.getTime() - a.data.date.getTime()
  );
  return rss({
    title: `${site.name} — News`,
    description: 'Papers, talks, releases, and milestones from Kuan-Hao Chao.',
    site: context.site,
    items: news.map((entry) => ({
      title: entry.data.title,
      pubDate: entry.data.date,
      link: entry.data.link ?? `${site.url}/news/#${entry.id}`,
      categories: [entry.data.category],
      description: entry.body ?? entry.data.title,
    })),
    customData: `<language>en-us</language>`,
  });
}
