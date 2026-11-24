import { getCollection } from 'astro:content';
import { pubSlug } from '../lib/slug.ts';
import { publicationHref } from '../lib/publicationMetadata.ts';
import { site, identity, socials, labNavItems } from '../data/site.ts';
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
import { PAPERS } from '../data/papers.ts';
import { plainMdx } from '../lib/plainContent.ts';

/**
 * Knowledge payload for the /terminal/ shell: one fetch serves both the virtual
 * filesystem (`ls`/`cat`/`tree`) and the retrieval corpus (`grep`/`ask`).
 *
 * PRIVACY GATE — collections that can hold private/unpublished entries use distinct fields:
 *   - posts     → `draft: true`
 *   - news      → `draft: true`
 *   - deepDives → `draft: true`
 *   - reports   → `unlisted: true` (reports subtree is intentionally omitted wholesale from
 *                 `terminal.json` so `audit:indexing` guarantees zero `/reports/` leakage).
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

  const livePosts = posts
    .filter((entry) => !entry.data.draft)
    .sort((a, b) => b.data.date - a.data.date);
  const liveNews = news
    .filter((entry) => !entry.data.draft)
    .sort((a, b) => b.data.date - a.data.date);
  const pubsByDate = [...publications].sort((a, b) => b.data.date - a.data.date);
  const talksByDate = [...talks].sort((a, b) => (b.data.startDate ?? 0) - (a.data.startDate ?? 0));
  const teachingByDate = [...teaching].sort(
    (a, b) => (b.data.startDate ?? 0) - (a.data.startDate ?? 0)
  );
  const liveDeepDives = deepDives
    .filter((entry) => !entry.data.draft)
    .sort((a, b) => a.data.hub.localeCompare(b.data.hub) || a.data.order - b.data.order);
  const deepDiveById = new Map(liveDeepDives.map((entry) => [entry.id, entry]));
  const publishedPapers = PAPERS.filter((p) => p.status === 'published');

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
      text: squash(`${title} ${keywords} ${body}`).slice(0, 1800),
    });
  };

  // ---------------------------------------------------------------- identity
  add('/home/khc/about.txt', {
    title: 'About',
    href: '/',
    keywords: `${identity.alternateNames.join(' ')} ${identity.jobTitle} ${identity.worksFor.name}`,
    body: [
      `${site.name} (${site.nameZh}) — ${site.role}`,
      '',
      site.bio,
      '',
      `Tagline:       ${site.tagline}`,
      `Philosophy:    ${site.philosophy}`,
      `Also known as: ${identity.alternateNames.join(', ')}`,
      `Works on:      ${identity.knowsAbout.join(', ')}`,
    ].join('\n'),
  });

  add('/home/khc/contact.txt', {
    title: 'Contact',
    href: '/',
    keywords: 'email reach out hire collaborate coffee chat social links calendly',
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
    keywords:
      'job work employment position career engineer scientist illumina calico academia sinica anu ntu',
    body: experience
      .map((p) => `${p.period}\n  ${p.role}\n  ${p.org}${p.unit ? ` — ${p.unit}` : ''}`)
      .join('\n\n'),
  });

  add('/home/khc/cv/education.txt', {
    title: 'Education',
    href: '/cv/',
    keywords: 'degree phd masters mse bachelor school university advisor salzberg pertea jhu ntu',
    body: education
      .map((p) => `${p.period}\n  ${p.role}\n  ${p.org}${p.unit ? ` — ${p.unit}` : ''}`)
      .join('\n\n'),
  });

  add('/home/khc/cv/honors.txt', {
    title: 'Honors and awards',
    href: '/cv/',
    keywords: 'award prize scholarship fellowship recognition virtual cell challenge cellularai',
    body: honors.map((h) => `${h.year}  ${h.title}`).join('\n'),
  });

  add('/home/khc/cv/mentorship.txt', {
    title: 'Mentorship',
    href: '/teaching/',
    keywords: 'mentor student teaching advising study group alan mao',
    body: mentorship.map((m) => `${m.name}\n  ${m.detail}`).join('\n\n'),
  });

  add('/home/khc/cv/reviewing.txt', {
    title: 'Peer review',
    href: '/cv/',
    keywords: 'reviewer referee journal service peer review',
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
    const bodyExcerpt = plainMdx(entry.body ?? '', 600);
    add(`/home/khc/publications/${slug}.txt`, {
      title: d.title,
      href: publicationHref(entry),
      keywords: `${d.type} ${d.venue} paper publication ${year(d.date)} ${d.authors}`,
      body: [
        d.title,
        '',
        `Authors:  ${d.authors}`,
        `Venue:    ${d.venue}${detail ? `, ${detail}` : ''} (${year(d.date)})${status}`,
        d.doi && `DOI:      ${d.doi}`,
        d.preprint && `Preprint: ${d.preprint}`,
        d.pdf && `PDF:      ${d.pdf}`,
        d.code && `Code:     ${d.code}`,
        d.docs && `Docs:     ${d.docs}`,
        d.models && `Models:   ${d.models}`,
        d.lab && `Lab:      ${d.lab}`,
        d.data && `Data:     ${d.data}`,
        d.news && `Press:    ${d.news}`,
        d.externalUrl && !d.doi && `Link:     ${d.externalUrl}`,
        d.abstract && `\nAbstract:\n${squash(d.abstract)}`,
        !d.abstract && bodyExcerpt && `\n${bodyExcerpt}`,
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
      href: tool.lab ?? tool.docs ?? tool.code,
      keywords: `software tool package release open source ${tool.license.name}`,
      body: [
        `${tool.name} — released ${tool.date}`,
        '',
        tool.blurb,
        '',
        `License: ${tool.license.name}`,
        `Code:    ${tool.code}`,
        tool.docs && `Docs:    ${tool.docs}`,
        tool.lab && `Lab:     ${tool.lab}`,
        tool.paper && `Paper:   ${tool.paper}`,
        tool.poster && `Poster:  ${tool.poster}`,
        tool.posts?.length && `Post:    ${tool.posts.map((p) => `/posts/${p}/`).join(', ')}`,
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
        `Type:     ${d.type}`,
        `Event:    ${d.title}`,
        `Venue:    ${d.venue}`,
        d.location && `Location: ${d.location}`,
        `Date:     ${iso(d.startDate)}`,
        d.link && `Link:     ${d.link}`,
        d.slides && `Slides:   ${d.slides}`,
        d.poster && `Poster:   ${d.poster}`,
        d.video && `Video:    ${d.video}`,
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
      body: [
        entry.data.title,
        `Published: ${iso(entry.data.date)}`,
        '',
        entry.data.description,
        '',
        plainMdx(entry.body, 1400),
      ].join('\n'),
    });
  }

  // -------------------------------------------------------------- teaching
  for (const entry of teachingByDate) {
    const d = entry.data;
    const period = [iso(d.startDate), iso(d.endDate)].filter(Boolean).join(' – ');
    add(`/home/khc/teaching/${entry.id}.txt`, {
      title: d.title,
      href: '/teaching/',
      keywords: `teaching course ta lecture ${d.role ?? ''} ${d.venue ?? ''} ${d.location ?? ''}`,
      body: [
        d.title,
        d.role && `Role:     ${d.role}`,
        d.venue && `Venue:    ${d.venue}`,
        d.location && `Location: ${d.location}`,
        period && `Period:   ${period}`,
        '',
        plainMdx(entry.body, 600),
      ]
        .filter(Boolean)
        .join('\n'),
    });
  }

  // ------------------------------------------------------------------ labs
  const labEntries = [
    ...labNavItems.map((item) => ({
      id: item.id,
      title: item.title,
      href: item.href,
      sub: item.sub,
      keywords: `lab interactive tool ${item.title} ${item.sub}`,
    })),
    {
      id: 'shorkie-attention',
      title: 'Shorkie Attention Studio',
      href: '/shorkie-lab/attention/',
      sub: 'Multi-head self-attention maps across yeast regulatory loci',
      keywords: 'lab interactive shorkie attention heads transformer yeast',
    },
    {
      id: 'papers',
      title: 'Paper Summaries',
      href: '/papers/',
      sub: `${publishedPapers.length} technical deconstructions of landmark genomics & AI papers`,
      keywords: 'papers summaries literature alphagenome borzoi alphamissense gears gpnstar',
    },
    {
      id: 'deep-dives',
      title: 'Deep Dives',
      href: '/deep_dives/',
      sub: `${liveDeepDives.length} step-by-step computational genomics & ML curricula`,
      keywords: 'deep dives guides statistical genetics gwas single-cell ml interview',
    },
    {
      id: 'cell-lab',
      title: 'Cell Lab',
      href: '/lab',
      sub: 'In silico cellular microcosm simulation',
      keywords: 'cell lab simulation artificial life microcosm',
    },
  ];
  for (const lab of labEntries) {
    add(`/home/khc/labs/${lab.id}.txt`, {
      title: lab.title,
      href: lab.href,
      kind: 'lab',
      keywords: lab.keywords,
      body: [`${lab.title}`, '', lab.sub, '', `URL: ${lab.href}`].join('\n'),
    });
  }

  // ---------------------------------------------------------------- papers
  add('/home/khc/papers.txt', {
    title: 'Literature Paper Summaries',
    href: '/papers/',
    kind: 'papers',
    keywords: publishedPapers.map((p) => `${p.id} ${p.shortTitle} ${p.area}`).join(' '),
    body: publishedPapers
      .map((p) => `${String(p.year)}  ${p.shortTitle.padEnd(32)} ${p.venue} — ${p.href}`)
      .join('\n'),
  });
  for (const paper of publishedPapers) {
    chunks.push({
      path: '/home/khc/papers.txt',
      title: paper.shortTitle,
      href: paper.href,
      kind: 'paper-summary',
      text: squash(
        `${paper.shortTitle} ${paper.title} ${paper.venue} ${paper.year} ${paper.area} ${paper.summary}`
      ).slice(0, 1200),
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
  // Keep `ls` clean with one digest file plus full per-item retrieval chunks.
  add('/home/khc/news.txt', {
    title: 'Recent news',
    href: '/news/',
    keywords: 'news updates latest recent announcements virtual cell challenge cellularai award',
    body: liveNews
      .slice(0, 15)
      .map(
        (entry) =>
          `${iso(entry.data.date)}  [${entry.data.category.padEnd(7)}]  ${entry.data.title}`
      )
      .join('\n'),
  });
  for (const entry of liveNews) {
    const summary = plainMdx(entry.body ?? '', 800);
    chunks.push({
      path: '/home/khc/news.txt',
      title: `${iso(entry.data.date)} — ${entry.data.title}`,
      href: '/news/',
      kind: 'news',
      text: squash(`${iso(entry.data.date)} ${entry.data.title} ${summary} ${entry.data.category}`).slice(
        0,
        1000
      ),
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

  const latestNews = liveNews[0];
  const latestPub = pubsByDate[0];
  const latestPost = livePosts[0];

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
      teaching: teaching.length,
      papers: publishedPapers.length,
      deepDives: liveDeepDives.length,
      interviewQuestions: interviewQuestionCount,
      news: liveNews.length,
      honors: honors.length,
      reviewing: reviewing.length,
      built: iso(new Date()),
    },
    latest: {
      news: latestNews
        ? {
            date: iso(latestNews.data.date),
            title: latestNews.data.title,
            category: latestNews.data.category,
            summary: plainMdx(latestNews.body ?? '', 260),
            href: '/news/',
          }
        : null,
      publication: latestPub
        ? {
            date: iso(latestPub.data.date),
            title: latestPub.data.title,
            venue: latestPub.data.venue,
            slug: pubSlug(latestPub.id),
            href: publicationHref(latestPub),
          }
        : null,
      post: latestPost
        ? {
            date: iso(latestPost.data.date),
            title: latestPost.data.title,
            href: `/posts/${latestPost.id}/`,
          }
        : null,
    },
    recentNews: liveNews.slice(0, 10).map((entry) => ({
      date: iso(entry.data.date),
      category: entry.data.category,
      title: entry.data.title,
      summary: plainMdx(entry.body ?? '', 260),
      link: entry.data.link ?? null,
      href: '/news/',
    })),
    awardNews: liveNews
      .filter((entry) => entry.data.category === 'award')
      .map((entry) => ({
        date: iso(entry.data.date),
        title: entry.data.title,
        summary: plainMdx(entry.body ?? '', 260),
        link: entry.data.link ?? null,
        href: '/news/',
      })),
    papers: publishedPapers.map((p) => ({
      id: p.id,
      shortTitle: p.shortTitle,
      title: p.title,
      venue: p.venue,
      year: p.year,
      area: p.area,
      tag: p.tag,
      summary: p.summary,
      href: p.href,
    })),
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
