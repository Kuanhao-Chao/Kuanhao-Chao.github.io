import { getCollection } from 'astro:content';
import { pubSlug } from '../lib/slug.ts';
import { site, identity, socials } from '../data/site.ts';
import {
  experience,
  education,
  honors,
  mentorship,
  reviewing,
  software,
  sideProjects,
} from '../data/cv.ts';
import { projects } from '../data/projects.ts';
import { plainMdx } from '../lib/plainContent.ts';

/**
 * Knowledge payload for the /terminal/ shell: one fetch serves both the virtual
 * filesystem (`ls`/`cat`/`tree`) and the retrieval corpus (`grep`/`ask`).
 *
 * PRIVACY GATE — the two collections that can leak use *different* fields, so a
 * single generic filter would silently fail on one:
 *   - posts   → `draft: true`     (4 of 12 today)
 *   - reports → `unlisted: true`  (6 of 6 today — the whole section is private)
 * Reports are therefore omitted wholesale rather than filtered: the collection
 * contributes nothing today and could only ever leak later. See CLAUDE.md.
 */

const squash = (value = '') => value.replace(/\s+/g, ' ').trim();
const iso = (date) => date?.toISOString?.().slice(0, 10) ?? '';
const year = (date) => date?.getUTCFullYear?.() ?? '';

const bullet = (lines) => lines.map((line) => `  ${line}`).join('\n');

export async function GET() {
  const [publications, research, talks, posts, news, teaching, deepDives, questionBanks] =
    await Promise.all([
      getCollection('publications'),
      getCollection('research'),
      getCollection('presentations'),
      getCollection('posts'),
      getCollection('news'),
      getCollection('teaching'),
      getCollection('deepDives'),
      getCollection('deepDiveQuestionBanks'),
    ]);

  const livePosts = posts.filter((entry) => !entry.data.draft);
  const liveNews = news
    .filter((entry) => !entry.data.draft)
    .sort((a, b) => b.data.date - a.data.date);
  const pubsByDate = [...publications].sort((a, b) => b.data.date - a.data.date);
  const talksByDate = [...talks].sort((a, b) => (b.data.startDate ?? 0) - (a.data.startDate ?? 0));
  const liveDeepDives = deepDives
    .filter((entry) => !entry.data.draft)
    .sort((a, b) => a.data.hub.localeCompare(b.data.hub) || a.data.order - b.data.order);
  const deepDiveById = new Map(liveDeepDives.map((entry) => [entry.id, entry]));

  /** path → node. Directories are derived from the paths at runtime. */
  const fs = {};
  const chunks = [];

  const add = (path, { title, body, href, kind = 'file', keywords = '' }) => {
    fs[path] = { title, body, href, kind };
    chunks.push({
      path,
      title,
      href,
      kind,
      text: squash(`${title} ${keywords} ${body}`).slice(0, 1600),
    });
  };

  // ---------------------------------------------------------------- identity
  add('/home/khc/about.txt', {
    title: 'About',
    href: '/',
    keywords: identity.alternateNames.join(' '),
    body: [
      `${site.name} (${site.nameZh}) — ${site.role}`,
      '',
      site.bio,
      '',
      `Tagline:    ${site.tagline}`,
      `Philosophy: ${site.philosophy}`,
      `Also known as: ${identity.alternateNames.join(', ')}`,
      `Works on: ${identity.knowsAbout.join(', ')}`,
    ].join('\n'),
  });

  add('/home/khc/contact.txt', {
    title: 'Contact',
    href: '/',
    keywords: 'email reach out hire collaborate coffee chat social links',
    body: [
      `Email: ${site.email}`,
      '',
      'Elsewhere:',
      bullet(
        socials.filter((s) => s.key !== 'email').map((s) => `${s.label.padEnd(14)} ${s.href}`)
      ),
    ].join('\n'),
  });

  // -------------------------------------------------------------------- cv
  add('/home/khc/cv/experience.txt', {
    title: 'Experience',
    href: '/cv/',
    keywords: 'job work employment position career illumina calico academia sinica',
    body: experience
      .map((p) => `${p.period}\n  ${p.role}\n  ${p.org}${p.unit ? ` — ${p.unit}` : ''}`)
      .join('\n\n'),
  });

  add('/home/khc/cv/education.txt', {
    title: 'Education',
    href: '/cv/',
    keywords: 'degree phd masters bachelor school university advisor',
    body: education
      .map((p) => `${p.period}\n  ${p.role}\n  ${p.org}${p.unit ? ` — ${p.unit}` : ''}`)
      .join('\n\n'),
  });

  add('/home/khc/cv/honors.txt', {
    title: 'Honors and awards',
    href: '/cv/',
    keywords: 'award prize scholarship fellowship recognition',
    body: honors.map((h) => `${h.year}  ${h.title}`).join('\n'),
  });

  add('/home/khc/cv/mentorship.txt', {
    title: 'Mentorship',
    href: '/cv/',
    keywords: 'mentor student teaching advising study group',
    body: mentorship.map((m) => `${m.name}\n  ${m.detail}`).join('\n\n'),
  });

  add('/home/khc/cv/reviewing.txt', {
    title: 'Peer review',
    href: '/cv/',
    keywords: 'reviewer referee journal service',
    body: `Reviewer for ${reviewing.length} venues:\n${bullet(reviewing)}`,
  });

  // ---------------------------------------------------------- publications
  for (const entry of pubsByDate) {
    const d = entry.data;
    const slug = pubSlug(entry.id);
    const status = d.status === 'accepted' ? ' (in press)' : '';
    const detail = [d.volume && `${d.volume}`, d.issue && `(${d.issue})`, d.pages]
      .filter(Boolean)
      .join('');
    add(`/home/khc/publications/${slug}.txt`, {
      title: d.title,
      href: `/publications/${slug}/`,
      keywords: `${d.type} ${d.venue} paper publication ${year(d.date)}`,
      body: [
        d.title,
        '',
        `Authors: ${d.authors}`,
        `Venue:   ${d.venue}${detail ? `, ${detail}` : ''} (${year(d.date)})${status}`,
        d.doi && `DOI:     ${d.doi}`,
        d.code && `Code:    ${d.code}`,
      ]
        .filter(Boolean)
        .join('\n'),
    });
  }

  // -------------------------------------------------------------- research
  for (const entry of research) {
    add(`/home/khc/research/${entry.id}.txt`, {
      title: entry.data.title,
      href: `/research/${entry.id}/`,
      keywords: `${entry.data.area} research ${entry.data.status}`,
      body: [
        `${entry.data.title}  [${entry.data.area}]`,
        '',
        entry.data.summary,
        '',
        plainMdx(entry.body, 1400),
      ].join('\n'),
    });
  }

  // -------------------------------------------------------------- software
  for (const tool of software) {
    add(`/home/khc/software/${tool.name.toLowerCase().replace(/\s+/g, '-')}.txt`, {
      title: tool.name,
      href: tool.docs ?? tool.code,
      keywords: `software tool package release open source ${tool.license.name}`,
      body: [
        `${tool.name} — released ${tool.date}`,
        '',
        tool.blurb,
        '',
        `License: ${tool.license.name}`,
        `Code:    ${tool.code}`,
        tool.docs && `Docs:    ${tool.docs}`,
        tool.paper && `Paper:   ${tool.paper}`,
      ]
        .filter(Boolean)
        .join('\n'),
    });
  }

  // ----------------------------------------------------------------- talks
  for (const entry of talksByDate) {
    const d = entry.data;
    add(`/home/khc/talks/${entry.id}.txt`, {
      title: d.talkTitle ?? d.title,
      href: '/talks/',
      keywords: `talk ${d.type} seminar presentation ${d.venue} ${d.location ?? ''}`,
      body: [
        d.talkTitle ?? d.title,
        '',
        `Event:    ${d.title}`,
        `Venue:    ${d.venue}`,
        d.location && `Location: ${d.location}`,
        `Date:     ${iso(d.startDate)}`,
        d.link && `Link:     ${d.link}`,
      ]
        .filter(Boolean)
        .join('\n'),
    });
  }

  // ----------------------------------------------------------------- posts
  for (const entry of livePosts) {
    add(`/home/khc/posts/${entry.id}.txt`, {
      title: entry.data.title,
      href: `/posts/${entry.id}/`,
      keywords: `post article write-up ${(entry.data.tags ?? []).join(' ')}`,
      body: [entry.data.title, '', entry.data.description, '', plainMdx(entry.body, 1400)].join('\n'),
    });
  }

  // -------------------------------------------------------------- teaching
  for (const entry of teaching) {
    add(`/home/khc/teaching/${entry.id}.txt`, {
      title: entry.data.title,
      href: '/teaching/',
      keywords: 'teaching course ta lecture',
      body: [entry.data.title, '', plainMdx(entry.body, 600)].filter(Boolean).join('\n'),
    });
  }

  // ----------------------------------------------------------- deep dives
  for (const entry of liveDeepDives) {
    add(`/home/khc/deep-dives/${entry.id}.txt`, {
      title: entry.data.title,
      href: `/deep_dives/${entry.id}/`,
      keywords: `${entry.data.hub} ${entry.data.moduleLabel} ${entry.data.tags.join(' ')} ${entry.data.objectives.join(' ')}`,
      body: [entry.data.title, '', entry.data.description, '', plainMdx(entry.body, 1200)].join(
        '\n'
      ),
    });
  }
  let interviewQuestionCount = 0;
  for (const bank of questionBanks) {
    const lesson = deepDiveById.get(bank.data.lesson.id);
    if (!lesson) continue;
    for (const question of bank.data.questions) {
      interviewQuestionCount += 1;
      chunks.push({
        path: `/home/khc/deep-dives/${lesson.id}.txt`,
        title: question.question,
        href: `/deep_dives/${lesson.id}/#${question.id}`,
        kind: 'interview-question',
        text: squash(
          `${question.question} ${question.conciseAnswer} ${question.priority} ${question.kind} ${question.tags.join(' ')} ${question.aliases.join(' ')}`
        ).slice(0, 1400),
      });
    }
  }

  // ------------------------------------------------------------------ news
  // 51 files would drown `ls`, so news is one digest file plus per-item chunks.
  add('/home/khc/news.txt', {
    title: 'Recent news',
    href: '/news/',
    keywords: 'news updates latest recent announcements',
    body: liveNews
      .slice(0, 12)
      .map((entry) => `${iso(entry.data.date)}  ${entry.data.title}`)
      .join('\n'),
  });
  for (const entry of liveNews) {
    chunks.push({
      path: '/home/khc/news.txt',
      title: entry.data.title,
      href: '/news/',
      kind: 'news',
      text: squash(`${entry.data.title} ${entry.body ?? ''} ${entry.data.category}`).slice(0, 800),
    });
  }

  // -------------------------------------------------------------- projects
  add('/home/khc/projects.txt', {
    title: 'Projects',
    href: '/projects/',
    keywords: 'projects portfolio work',
    body: projects.map((p) => `${p.year}  ${p.title}\n      ${p.summary}`).join('\n\n'),
  });

  add('/home/khc/.config/side-projects.txt', {
    title: 'Side projects',
    href: '/software/',
    keywords: 'games fun side projects browser',
    body: sideProjects.map((p) => `${p.name.padEnd(18)} ${p.detail}`).join('\n'),
  });

  const payload = {
    generatedAt: new Date().toISOString(),
    identity: {
      name: site.name,
      nameZh: site.nameZh,
      role: site.role,
      email: site.email,
      tagline: site.tagline,
      philosophy: site.philosophy,
      bio: site.bio,
      jobTitle: identity.jobTitle,
      worksFor: identity.worksFor.name,
      alumniOf: identity.alumniOf.map((a) => a.name),
      knowsAbout: identity.knowsAbout,
      alternateNames: identity.alternateNames,
      socials: socials.map((s) => ({ key: s.key, label: s.label, href: s.href })),
    },
    stats: {
      publications: publications.length,
      talks: talks.length,
      software: software.length,
      research: research.length,
      posts: livePosts.length,
      deepDives: liveDeepDives.length,
      interviewQuestions: interviewQuestionCount,
      news: liveNews.length,
      honors: honors.length,
      reviewing: reviewing.length,
      built: iso(new Date()),
    },
    fs,
    chunks,
    deepDives: liveDeepDives.map((entry) => ({
      slug: entry.id,
      title: entry.data.title,
      href: `/deep_dives/${entry.id}/`,
      hub: entry.data.hub,
      moduleId: entry.data.moduleId,
      order: entry.data.order,
      aliases: [entry.data.shortTitle, ...entry.data.tags].filter(Boolean),
    })),
  };

  return new Response(JSON.stringify(payload), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });
}
