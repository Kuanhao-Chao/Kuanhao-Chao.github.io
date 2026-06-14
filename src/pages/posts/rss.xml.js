import rss from '@astrojs/rss';
import { getCollection } from 'astro:content';
import { site } from '../../data/site.ts';

export async function GET(context) {
  const posts = (await getCollection('posts'))
    .filter((p) => !p.data.draft)
    .sort((a, b) => b.data.date.getTime() - a.data.date.getTime());
  return rss({
    title: `${site.name} — Posts`,
    description: 'Research summaries and opinions from Kuan-Hao Chao.',
    site: context.site,
    items: posts.map((entry) => ({
      title: entry.data.title,
      pubDate: entry.data.date,
      link: `${site.url}/posts/${entry.id}/`,
      description: entry.data.description,
      categories: entry.data.tags,
    })),
    customData: `<language>en-us</language>`,
  });
}
