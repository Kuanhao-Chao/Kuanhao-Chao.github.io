import { getCollection } from 'astro:content';
import { pubSlug } from '../lib/slug.ts';
import { software } from '../data/cv.ts';
import { projects } from '../data/projects.ts';

const compact = (value = '') => value.replace(/\s+/g, ' ').trim();
const iso = (date) => date?.toISOString?.().slice(0, 10);

export async function GET() {
  const [posts, publications, research, reports, news, talks] = await Promise.all([
    getCollection('posts'),
    getCollection('publications'),
    getCollection('research'),
    getCollection('reports'),
    getCollection('news'),
    getCollection('presentations'),
  ]);

  const items = [
    ...projects.map((project) => ({
      type: 'Project',
      title: project.title,
      description: project.summary,
      href: `/projects/#${project.slug}`,
      date: project.year,
      tags: project.tags,
      search: compact(`${project.title} ${project.summary} ${project.area} ${project.tags.join(' ')}`),
    })),
    ...research.map((entry) => ({
      type: 'Research',
      title: entry.data.title,
      description: entry.data.summary,
      href: `/research/${entry.id}/`,
      date: iso(entry.data.startDate) ?? '',
      tags: [entry.data.area, entry.data.status],
      search: compact(`${entry.data.title} ${entry.data.summary} ${entry.data.area} ${entry.body ?? ''}`),
    })),
    ...publications.map((entry) => ({
      type: 'Publication',
      title: entry.data.title,
      description: compact(entry.data.abstract ?? `${entry.data.venue} ${entry.data.authors}`),
      href: `/publications/${pubSlug(entry.id)}/`,
      date: iso(entry.data.date),
      tags: [entry.data.type, entry.data.venue],
      search: compact(`${entry.data.title} ${entry.data.authors} ${entry.data.venue} ${entry.data.abstract ?? ''}`),
    })),
    ...software.map((tool) => ({
      type: 'Software',
      title: tool.name,
      description: tool.blurb,
      href: tool.docs ?? tool.code,
      date: tool.date,
      tags: ['Open source', tool.license.name],
      search: compact(`${tool.name} ${tool.blurb}`),
    })),
    ...posts
      .filter((entry) => !entry.data.draft)
      .map((entry) => ({
        type: 'Post',
        title: entry.data.title,
        description: entry.data.description,
        href: `/posts/${entry.id}/`,
        date: iso(entry.data.date),
        tags: entry.data.tags,
        search: compact(`${entry.data.title} ${entry.data.description} ${entry.data.tags.join(' ')} ${entry.body ?? ''}`),
      })),
    ...reports.map((entry) => ({
      type: 'Report',
      title: entry.data.title,
      description: entry.data.description,
      href: `/reports/${entry.id}/`,
      date: iso(entry.data.date),
      tags: entry.data.tags,
      search: compact(`${entry.data.title} ${entry.data.description} ${entry.data.tags.join(' ')} ${entry.body ?? ''}`),
    })),
    ...talks.map((entry) => ({
      type: 'Talk',
      title: entry.data.talkTitle ?? entry.data.title,
      description: compact(`${entry.data.venue}${entry.data.location ? `, ${entry.data.location}` : ''}`),
      href: `/talks/#${entry.id}`,
      date: iso(entry.data.startDate),
      tags: [entry.data.type, entry.data.venue],
      search: compact(
        `${entry.data.talkTitle ?? ''} ${entry.data.title} ${entry.data.venue} ${entry.data.location ?? ''}`
      ),
    })),
    ...news
      .filter((entry) => !entry.data.draft)
      .map((entry) => ({
        type: 'News',
        title: entry.data.title,
        description: compact(entry.body ?? entry.data.title),
        href: `/news/#${entry.id}`,
        date: iso(entry.data.date),
        tags: [entry.data.category],
        search: compact(`${entry.data.title} ${entry.body ?? ''} ${entry.data.category} ${entry.data.location ?? ''}`),
      })),
  ];

  items.sort((a, b) => String(b.date ?? '').localeCompare(String(a.date ?? '')));

  return new Response(JSON.stringify({ generatedAt: new Date().toISOString(), items }), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });
}
