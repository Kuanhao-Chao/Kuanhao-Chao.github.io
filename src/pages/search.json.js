import { getCollection } from 'astro:content';
import { pubSlug } from '../lib/slug.ts';
import { software } from '../data/cv.ts';
import { projects } from '../data/projects.ts';
import { ALGORITHMS } from '../data/algorithms.ts';
import { plainMdx } from '../lib/plainContent.ts';

const compact = (value = '') => value.replace(/\s+/g, ' ').trim();
const iso = (date) => date?.toISOString?.().slice(0, 10);

export async function GET() {
  const [posts, publications, research, reports, news, talks, deepDives, questionBanks] =
    await Promise.all([
      getCollection('posts'),
      getCollection('publications'),
      getCollection('research'),
      getCollection('reports'),
      getCollection('news'),
      getCollection('presentations'),
      getCollection('deepDives'),
      getCollection('deepDiveQuestionBanks'),
    ]);

  const publishedDeepDives = deepDives.filter((entry) => !entry.data.draft);
  const deepDiveById = new Map(publishedDeepDives.map((entry) => [entry.id, entry]));

  const items = [
    ...publishedDeepDives.map((entry) => ({
      type: 'Deep Dive',
      title: entry.data.title,
      description: entry.data.description,
      href: `/deep_dives/${entry.id}/`,
      date: iso(entry.data.updated ?? entry.data.date),
      tags: [entry.data.moduleLabel, entry.data.category, ...entry.data.tags],
      search: compact(
        `${entry.data.title} ${entry.data.shortTitle ?? ''} ${entry.data.description} ${entry.data.abstract} ${entry.data.objectives.join(' ')} ${entry.data.tags.join(' ')} ${plainMdx(entry.body ?? '', 1800)}`
      ),
    })),
    ...questionBanks.flatMap((bank) => {
      const lesson = deepDiveById.get(bank.data.lesson.id);
      if (!lesson) return [];
      return bank.data.questions.map((question) => ({
        type: 'Interview Question',
        title: question.question,
        description: question.conciseAnswer,
        href: `/deep_dives/${lesson.id}/#${question.id}`,
        date: iso(question.verified ?? lesson.data.updated ?? lesson.data.date),
        tags: [question.priority, question.kind, ...question.tags],
        search: compact(
          `${lesson.data.title} ${question.aliases.join(' ')} ${question.tags.join(' ')} ${question.roles.join(' ')}`
        ),
      }));
    }),
    ...ALGORITHMS.map((algo) => ({
      type: 'Algorithm',
      title: algo.title,
      description: algo.summary,
      href: algo.href,
      date: '2025-01-01',
      tags: [algo.area, algo.tag],
      search: compact(
        `${algo.title} ${algo.shortTitle ?? ''} ${algo.area} ${algo.tag} ${algo.summary} ${algo.cliCommand ?? ''}`
      ),
    })),
    ...projects.map((project) => ({
      type: 'Project',
      title: project.title,
      description: project.summary,
      href: `/projects/#${project.slug}`,
      date: project.year,
      tags: project.tags,
      search: compact(
        `${project.title} ${project.summary} ${project.area} ${project.tags.join(' ')}`
      ),
    })),
    ...research.map((entry) => ({
      type: 'Research',
      title: entry.data.title,
      description: entry.data.summary,
      href: `/research/${entry.id}/`,
      date: iso(entry.data.startDate) ?? '',
      tags: [entry.data.area, entry.data.status],
      search: compact(
        `${entry.data.title} ${entry.data.summary} ${entry.data.area} ${entry.body ?? ''}`
      ),
    })),
    ...publications.map((entry) => ({
      type: 'Publication',
      title: entry.data.title,
      description: compact(entry.data.abstract ?? `${entry.data.venue} ${entry.data.authors}`),
      href: `/publications/${pubSlug(entry.id)}/`,
      date: iso(entry.data.date),
      tags: [entry.data.type, entry.data.venue],
      search: compact(
        `${entry.data.title} ${entry.data.authors} ${entry.data.venue} ${entry.data.abstract ?? ''}`
      ),
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
        search: compact(
          `${entry.data.title} ${entry.data.description} ${entry.data.tags.join(' ')} ${entry.body ?? ''}`
        ),
      })),
    ...reports
      // Unlisted (private-launch) reports are noindex, robots-disallowed, and out of the
      // sitemap; keep them out of site search too. Public reports appear here automatically.
      .filter((entry) => !entry.data.unlisted)
      .map((entry) => ({
        type: 'Report',
        title: entry.data.title,
        description: entry.data.description,
        href: `/reports/${entry.id}/`,
        date: iso(entry.data.date),
        tags: entry.data.tags,
        search: compact(
          `${entry.data.title} ${entry.data.description} ${entry.data.tags.join(' ')} ${entry.body ?? ''}`
        ),
      })),
    ...talks.map((entry) => ({
      type: 'Talk',
      title: entry.data.talkTitle ?? entry.data.title,
      description: compact(
        `${entry.data.venue}${entry.data.location ? `, ${entry.data.location}` : ''}`
      ),
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
        search: compact(
          `${entry.data.title} ${entry.body ?? ''} ${entry.data.category} ${entry.data.location ?? ''}`
        ),
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
