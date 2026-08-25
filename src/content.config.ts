import { defineCollection, reference } from 'astro:content';
import { file, glob } from 'astro/loaders';
import { z } from 'astro/zod';
import {
  INTERVIEW_DIFFICULTIES,
  INTERVIEW_KINDS,
  INTERVIEW_PRIORITIES,
  INTERVIEW_ROLES,
  INTERVIEW_ROUNDS,
  INTERVIEW_STABILITIES,
} from './lib/mlInterview';

const publications = defineCollection({
  loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/publications' }),
  schema: ({ image }) =>
    z.object({
      title: z.string(),
      authors: z.string(), // plain text; "*" = corresponding, "†" = co-first
      venue: z.string(),
      // Journal-of-record details, when the version of record has them. Strings rather
      // than numbers: page fields run to forms like "4857–4875.e31", and article IDs
      // like "eadn7527" or "RP107454" stand in for a page range.
      volume: z.string().optional(),
      issue: z.string().optional(),
      pages: z.string().optional(),
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
      // Separate from `slides` so a poster session links a "Poster", not "Slides".
      // Every poster on the site used to be stuffed into `slides`, which meant an
      // entry badged Poster offered a chip labelled Slides.
      poster: z.url().optional(),
      video: z.url().optional(),
      link: z.url().optional(),
      linkLabel: z.string().optional(),
      photo: z.url().optional(),
      image: image().optional(),
      relatedPublications: z
        .array(
          z.object({
            publication: reference('publications'),
            label: z.string(),
          })
        )
        .default([]),
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
            // Optional label for a paper button in a research entry's resource bar.
            // This lets a multi-paper direction opt into distinct, compact links
            // without changing the header of every other research direction.
            resourceLabel: z.string().optional(),
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
    category: z.enum(['publication', 'talk', 'award', 'release', 'join', 'misc']).default('misc'),
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
      /** True for a track's landing page: back-link goes to /deep_dives/ and the
       *  page renders a module map of its own track instead of a prev/next pager. */
      isHub: z.boolean().default(false),
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
      /** True for a track's landing page: back-link goes to /deep_dives/ and the
       *  page renders a module map of its own track instead of a prev/next pager. */
      isHub: z.boolean().default(false),
      tags: z.array(z.string()).default([]),
      image: image().optional(),
      imageAlt: z.string().optional(),
      logo: image().optional(),
      scholar: z.boolean().default(true),
      // Privacy switch. true => noindex + excluded from sitemap (default for this
      // section). Flip to false (and relax the astro.config sitemap filter) to make
      // the report public + Google-Scholar-indexable.
      unlisted: z.boolean().default(true),
      // A report may remain available at its direct URL without appearing on the
      // reports index. This is independent of the search-engine privacy switch.
      listed: z.boolean().default(true),
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

// ── Deep dives ───────────────────────────────────────────────────────────────
// The curriculum behind /deep_dives/. These were 21 hand-authored .astro pages
// that each repeated the same chrome — back-link, badges, byline, a hand-numbered
// table of contents — and hard-coded their own metadata, with a second copy of
// title/level/reading-time living in `src/data/deepDives.ts`. Two copies of a fact
// is a drift mechanism, and it drifted: every lesson claimed roughly 2.5x its
// actual reading time.
//
// Migration is one lesson at a time. `getStaticPaths` emits only the slugs present
// here, so an unmigrated `foo.astro` and this collection coexist; the .astro is
// deleted in the same commit its .mdx lands (a test in src/lib/deepDives.test.ts
// fails if both exist, because then two routes would claim one URL).

/** One bibliography entry, cited by key from any number of lessons. */
const deepDiveReferences = defineCollection({
  loader: file('./src/content/deepDiveReferences/references.yaml'),
  schema: z.object({
    authors: z.array(z.string()).min(1),
    /** Overrides the derived surname in citation markers, for compound names with no
     *  particle to detect — "George Davey Smith" would otherwise render as "Smith". */
    surname: z.string().optional(),
    year: z.number().int(),
    title: z.string(),
    venue: z.string(),
    doi: z.string().optional(),
    url: z.url().optional(),
    pmid: z.string().optional(),
    // When the link was last confirmed to resolve to the work it claims. A citation
    // is only as good as its last check, and an unchecked one is a claim, not a source.
    verified: z.coerce.date(),
  }),
});

/**
 * The genomic resource registry for the data track.
 *
 * A resource is defined once here and referenced by id from the pages, for the same
 * reason `readingTime` is derived rather than stored: a version number or a sample count
 * written into prose in twelve places will disagree with itself within a release cycle.
 */
const deepDiveDatasets = defineCollection({
  loader: file('./src/content/deepDiveDatasets/datasets.yaml'),
  schema: z.object({
    name: z.string(),
    fullName: z.string(),
    layer: z.enum([
      'reference-annotation',
      'population-frequency',
      'constraint-intolerance',
      'expression-qtl',
      'regulatory-maps',
      'gwas-summary-stats',
      'germline-clinical',
      'somatic-oncology',
      'mave-assays',
      'variant-effect-scores',
      'protein-benchmarks',
      'variant-benchmarks',
      'single-cell-atlases',
    ]),
    url: z.url(),
    version: z.string().optional(),
    released: z.coerce.date().optional(),
    /** Sample counts, variant counts, assembly — whatever states the size of the thing. */
    scale: z.string(),
    /** Whether a reader can actually get it. See datasets.yaml for what each level means. */
    access: z.enum(['open', 'registered', 'controlled', 'licensed']),
    citationId: reference('deepDiveReferences').optional(),
    note: z.string().optional(),
    verified: z.coerce.date(),
  }),
});

const deepDives = defineCollection({
  loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/deepDives' }),
  schema: ({ image }) =>
    z.object({
      title: z.string(),
      /** Short form for cards, breadcrumbs and prev/next, where the full title will not fit. */
      shortTitle: z.string().optional(),
      description: z.string(),
      abstract: z.string(),
      date: z.coerce.date(),
      updated: z.coerce.date().optional(),
      authors: z.array(z.string()).default(['Kuan-Hao Chao']),

      // Curriculum position. `theory` lessons own definitions, assumptions and
      // derivations; `workflow` lessons own data handling, commands and diagnostics
      // and link back to the theory. That split is what resolves the overlap between
      // the statgen-* and gwas-* series, which currently both cover HWE, LD, mixed
      // models, fine-mapping and PRS with no declared relationship.
      track: z.enum(['theory', 'workflow', 'elective', 'resource']),
      hub: z
        .enum(['statistical-genetics', 'gwas', 'genomic-data', 'ml-dl-interview', 'single-cell'])
        .default('statistical-genetics'),
      moduleId: z.string(),
      moduleLabel: z.string(),
      order: z.number().int(),
      level: z.enum(['foundational', 'intermediate', 'advanced']),
      lessonType: z.enum(['technical', 'system-design', 'behavioral']).default('technical'),
      category: z
        .enum([
          'statistical-genetics',
          'genomic-data',
          'machine-learning',
          'sequence-analysis',
          'gene-regulation',
          'epigenomics',
          'pangenomics',
          'deep-learning',
          'single-cell',
        ])
        .default('statistical-genetics'),

      // The educational contract. A lesson states what a reader will be able to do
      // and what they need first; both are rendered, so an empty promise is visible.
      objectives: z.array(z.string()).min(1),
      prerequisites: z.array(reference('deepDives')).default([]),
      relatedLessons: z.array(reference('deepDives')).default([]),
      referenceIds: z.array(reference('deepDiveReferences')).default([]),

      // NOTE: there is deliberately no `readingTime` field. It is computed from the
      // body by `lessonReadingTime`, and a test rejects frontmatter that sets one.

      /** The two-to-four formulations the index card shows as chips. Declared here
       *  rather than in `src/data/deepDives.ts` for the same reason as everything
       *  else on the card: the catalog held a second copy, and a migrated lesson
       *  silently lost its chips when the derived entry replaced the hand-written one. */
      keyEquations: z.array(z.string()).default([]),

      /** True for a track's landing page: back-link goes to /deep_dives/ and the
       *  page renders a module map of its own track instead of a prev/next pager. */
      isHub: z.boolean().default(false),
      tags: z.array(z.string()).default([]),
      image: image().optional(),
      imageAlt: z.string().optional(),
      draft: z.boolean().default(false),
      featured: z.boolean().default(false),
    }),
});

/**
 * One bank per interview lesson. Keeping the questions beside their owning lesson
 * makes parallel authoring and later topic-level updates local, while the collection
 * still gives the hub, search and terminal one validated source of truth.
 */
const deepDiveQuestionBanks = defineCollection({
  loader: glob({ pattern: '**/*.{yaml,yml,json}', base: './src/content/deepDiveQuestionBanks' }),
  schema: z.object({
    lesson: reference('deepDives'),
    questions: z
      .array(
        z
          .object({
            id: z.string().regex(/^q-[a-z0-9-]+$/),
            question: z.string().min(12).max(240),
            conciseAnswer: z.string().min(20).max(1200),
            priority: z.enum(INTERVIEW_PRIORITIES),
            difficulty: z.enum(INTERVIEW_DIFFICULTIES),
            roles: z.array(z.enum(INTERVIEW_ROLES)).min(1),
            kind: z.enum(INTERVIEW_KINDS),
            round: z.enum(INTERVIEW_ROUNDS),
            stability: z.enum(INTERVIEW_STABILITIES),
            verified: z.coerce.date().optional(),
            tags: z.array(z.string()).default([]),
            aliases: z.array(z.string()).default([]),
          })
          .superRefine((question, ctx) => {
            if (question.stability === 'fast-moving' && !question.verified) {
              ctx.addIssue({
                code: 'custom',
                message: 'Fast-moving interview questions require a verified date.',
              });
            }
          })
      )
      .min(1)
      .superRefine((questions, ctx) => {
        const seen = new Set<string>();
        for (const [index, question] of questions.entries()) {
          if (seen.has(question.id)) {
            ctx.addIssue({
              code: 'custom',
              path: [index, 'id'],
              message: `Duplicate question id ${question.id}.`,
            });
          }
          seen.add(question.id);
        }
      }),
  }),
});

export const collections = {
  publications,
  presentations,
  research,
  teaching,
  news,
  posts,
  reports,
  deepDives,
  deepDiveReferences,
  deepDiveDatasets,
  deepDiveQuestionBanks,
};
