import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const publications = defineCollection({
  loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/publications' }),
  schema: ({ image }) =>
    z.object({
      title: z.string(),
      authors: z.string(), // plain text; "*" = corresponding, "†" = co-first
      venue: z.string(),
      date: z.coerce.date(),
      type: z.enum(['journal', 'conference', 'preprint']),
      status: z.enum(['published', 'preprint', 'accepted']).default('published'),
      doi: z.string().url().optional(),
      pdf: z.string().url().optional(),
      code: z.string().url().optional(),
      docs: z.string().url().optional(),
      slides: z.string().url().optional(),
      poster: z.string().url().optional(),
      video: z.string().url().optional(),
      news: z.string().url().optional(),
      bibtex: z.string().optional(),
      abstract: z.string().optional(),
      image: image().optional(),
      advisors: z.array(z.string()).default([]),
      featured: z.boolean().default(false),
      selectedOrder: z.number().optional(),
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
      slides: z.string().url().optional(),
      video: z.string().url().optional(),
      link: z.string().url().optional(),
      photo: z.string().url().optional(),
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
      paper: z.string().url().optional(),
      code: z.string().url().optional(),
      news: z.string().url().optional(),
      talk: z.string().url().optional(),
      image: image().optional(),
      advisors: z.array(z.string()).default([]),
      order: z.number().default(0),
      featured: z.boolean().default(false),
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
      link: z.string().url().optional(),
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
    link: z.string().url().optional(),
    featured: z.boolean().default(false),
  }),
});

export const collections = { publications, presentations, research, teaching, news };
