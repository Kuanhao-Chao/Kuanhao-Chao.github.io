import { defineCollection, reference } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

const publications = defineCollection({
  loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/publications' }),
  schema: ({ image }) =>
    z.object({
      title: z.string(),
      authors: z.string(), // plain text; "*" = corresponding, "†" = co-first
      venue: z.string(),
      date: z.coerce.date(),
      type: z.enum(['journal', 'conference', 'preprint', 'thesis']),
      status: z.enum(['published', 'preprint', 'accepted']).default('published'),
      doi: z.url().optional(),
      pdf: z.url().optional(),
      code: z.url().optional(),
      docs: z.url().optional(),
      slides: z.url().optional(),
      poster: z.url().optional(),
      video: z.url().optional(),
      news: z.url().optional(),
      data: z.url().optional(),
      bibtex: z.string().optional(),
      abstract: z.string().optional(),
      image: image().optional(),
      advisors: z.array(z.string()).default([]),
      featured: z.boolean().default(false),
      selectedOrder: z.number().optional(),
      relatedPosts: z.array(reference('posts')).default([]),
    }),
});

const presentations = defineCollection({
  loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/presentations' }),
  schema: ({ image }) =>
    z.object({
      title: z.string(),
      talkTitle: z.string().optional(),
      type: z.enum(['talk', 'poster', 'invited', 'exhibition']).default('talk'),
      venue: z.string(),
      location: z.string().optional(),
      startDate: z.coerce.date(),
      endDate: z.coerce.date().optional(),
      slides: z.url().optional(),
      video: z.url().optional(),
      link: z.url().optional(),
      photo: z.url().optional(),
      image: image().optional(),
      featured: z.boolean().default(false),
    }),
});

const research = defineCollection({
  loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/research' }),
  schema: ({ image }) =>
    z.object({
      title: z.string(),
      area: z.string(), // category, e.g. "Genome annotation"
      summary: z.string(),
      venue: z.string().optional(),
      location: z.string().optional(),
      startDate: z.coerce.date().optional(),
      endDate: z.coerce.date().optional(),
      status: z.enum(['published', 'ongoing', 'preprint']).default('ongoing'),
      paper: z.url().optional(),
      code: z.url().optional(),
      news: z.url().optional(),
      talk: z.url().optional(),
      image: image().optional(),
      advisors: z.array(z.string()).default([]),
      order: z.number().default(0),
      featured: z.boolean().default(false),
      relatedPosts: z.array(reference('posts')).default([]),
      relatedPublications: z
        .array(
          z.object({
            publication: reference('publications'),
            note: z.string(),
          })
        )
        .default([]),
      relatedReports: z.array(reference('reports')).default([]),
      references: z
        .array(
          z.object({
            text: z.string(),
            doi: z.url().optional(),
            url: z.url().optional(),
          })
        )
        .default([]),
    }),
});

const teaching = defineCollection({
  loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/teaching' }),
  schema: ({ image }) =>
    z.object({
      title: z.string(),
      role: z.string().optional(),
      kind: z.enum(['teaching', 'internship']).default('teaching'),
      venue: z.string(),
      location: z.string().optional(),
      startDate: z.coerce.date(),
      endDate: z.coerce.date().optional(),
      link: z.url().optional(),
      image: image().optional(),
    }),
});

const news = defineCollection({
  loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/news' }),
  schema: z.object({
    title: z.string(),
    date: z.coerce.date(),
    category: z
      .enum(['publication', 'talk', 'award', 'release', 'join', 'misc'])
      .default('misc'),
    location: z.string().optional(),
    link: z.url().optional(),
    draft: z.boolean().default(false),
    featured: z.boolean().default(false),
  }),
});

const posts = defineCollection({
  loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/posts' }),
  schema: ({ image }) =>
    z.object({
      title: z.string(),
      description: z.string(),
      authors: z.array(z.string()).default(['Kuan-Hao Chao']),
      abstract: z.string(),
      date: z.coerce.date(),
      updated: z.coerce.date().optional(),
      category: z.enum(['summary', 'opinion']).default('summary'),
      tags: z.array(z.string()).default([]),
      image: image().optional(),
      imageAlt: z.string().optional(),
      logo: image().optional(),
      draft: z.boolean().default(false),
      featured: z.boolean().default(false),
      linkLabel: z.string().optional(),
      scholar: z.boolean().default(true),
      references: z
        .array(
          z.object({
            text: z.string(),
            doi: z.url().optional(),
            url: z.url().optional(),
          })
        )
        .default([]),
    }),
});

// Formal technical reports — an academic-paper format distinct from blog `posts`.
// Mirrors the posts schema (abstract/authors/references/scholar) plus report
// fields (venue/institution). `unlisted` defaults TRUE: a report is published
// (URL + PDF build) but hidden from search engines (per-page noindex) and left
// out of the sitemap until it is deliberately flipped public for Google Scholar.
const reports = defineCollection({
  loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/reports' }),
  schema: ({ image }) =>
    z.object({
      title: z.string(),
      description: z.string(),
      authors: z.array(z.string()).default(['Kuan-Hao Chao']),
      abstract: z.string(),
      date: z.coerce.date(),
      updated: z.coerce.date().optional(),
      venue: z.string().default('Technical Report'),
      institution: z.string().default('Johns Hopkins University'),
      tags: z.array(z.string()).default([]),
      image: image().optional(),
      imageAlt: z.string().optional(),
      logo: image().optional(),
      scholar: z.boolean().default(true),
      // Privacy switch. true => noindex + excluded from sitemap (default for this
      // section). Flip to false (and relax the astro.config sitemap filter) to make
      // the report public + Google-Scholar-indexable.
      unlisted: z.boolean().default(true),
      references: z
        .array(
          z.object({
            text: z.string(),
            doi: z.url().optional(),
            url: z.url().optional(),
          })
        )
        .default([]),
    }),
});

export const collections = { publications, presentations, research, teaching, news, posts, reports };
