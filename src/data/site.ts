/**
 * Central site configuration: identity, navigation, and links.
 * Most components read from here, so this is the place to update
 * the bio, role, social handles, or menu.
 */

export const site = {
  name: 'Kuan-Hao Chao',
  nameZh: '趙冠豪',
  role: 'Senior Deep Learning/AI Engineer, Illumina AI Lab',
  shortRole: 'Computational biologist',
  // One-line headline for the hero (kept deliberately short, Calico-style).
  tagline: 'Building machine learning for genomics.',
  // Full bio paragraph (homepage + about). Plain text + a few links via bioHtml.
  bio: `I am a Senior Deep Learning/AI Engineer at the Illumina AI Lab. I earned my Ph.D. in Computer Science from the Center for Computational Biology, Johns Hopkins University (August 2025), advised by Steven Salzberg and Mihaela Pertea. My research focuses on AI for genomics — sequence-to-function modeling, genome annotation, and DNA language models. I hold a B.S. in Electrical Engineering from National Taiwan University and exchanged in my final year at the Australian National University.`,
  philosophy: 'Build what you need, use what you build.',
  url: 'https://khchao.com',
  email: 'kuanhao.chao@gmail.com',
  description:
    'Kuan-Hao Chao is a computational biologist and Senior Deep Learning/AI Engineer at the Illumina AI Lab, working on AI for genomics: sequence-to-function models, genome annotation, and DNA language models.',
};

/**
 * Structured-identity facts for JSON-LD (schema.org Person). Kept here so the
 * Knowledge-Graph signal stays in sync with the rendered bio/CV.
 */
export const identity = {
  jobTitle: 'Senior Deep Learning/AI Engineer',
  worksFor: { name: 'Illumina', url: 'https://www.illumina.com' },
  alumniOf: [
    { name: 'Johns Hopkins University', url: 'https://www.jhu.edu' },
    { name: 'National Taiwan University', url: 'https://www.ntu.edu.tw/english/' },
  ],
  knowsAbout: [
    'Computational biology',
    'Genomics',
    'Bioinformatics',
    'Deep learning',
    'Machine learning',
    'DNA language models',
    'Sequence-to-function models',
    'Genome annotation',
    'RNA splicing',
    'Genome assembly',
  ],
  // Every spelling/order of the name (romanization spacing/hyphen/case + Chinese
  // forms) so the Person JSON-LD ties each variant to this profile for search.
  alternateNames: [
    '趙冠豪',
    '冠豪趙',
    'Kuan Hao Chao',
    'Kuanhao Chao',
    'KuanHao Chao',
    'kuanhao chao',
    'kuan hao chao',
    'Kuan hao Chao',
    'Chao Kuan-Hao',
    'Chao Kuanhao',
    'khc',
  ],
  twitter: '@KuanHaoChao',
};

/**
 * Cloudflare Worker backing `ask` in the /terminal/ shell (see `worker/`). Runs an
 * open model on Workers AI at no cost.
 *
 * Empty string disables the LLM path entirely — the shell then answers from its own
 * in-browser index, which is also the automatic fallback whenever the endpoint is
 * unreachable. Setting this also requires adding the origin to `connect-src` in
 * `src/components/BaseHead.astro`, or the browser's CSP will block the request.
 */
export const askEndpoint = 'https://khchao-ask.khchao.workers.dev';

export type NavItem = { label: string; href: string; footerOnly?: boolean };

export const nav: NavItem[] = [
  { label: 'Research', href: '/research/' },
  { label: 'Projects', href: '/projects/', footerOnly: true },
  { label: 'Publications', href: '/publications/' },
  { label: 'Software', href: '/software/' },
  { label: 'Talks', href: '/talks/' },
  { label: 'Teaching', href: '/teaching/' },
  { label: 'CV', href: '/cv/', footerOnly: true },
  { label: 'Photos', href: '/photos/', footerOnly: true },
  { label: 'Posts', href: '/posts/' },
  { label: 'News', href: '/news/' },
  { label: 'Search', href: '/search/', footerOnly: true },
  { label: 'Algorithms', href: '/algorithms/', footerOnly: true },
  { label: 'Deep Dives', href: '/deep_dives/', footerOnly: true },
  { label: 'Papers', href: '/papers/', footerOnly: true },
  { label: 'Terminal', href: '/terminal/', footerOnly: true },
];

export type SocialKey =
  'email' | 'scholar' | 'github' | 'linkedin' | 'orcid' | 'twitter' | 'bluesky' | 'calendly';

export const socials: { key: SocialKey; label: string; href: string }[] = [
  { key: 'email', label: 'Email', href: 'mailto:kuanhao.chao@gmail.com' },
  {
    key: 'scholar',
    label: 'Google Scholar',
    href: 'https://scholar.google.com/citations?user=n2AvFg0AAAAJ&hl=en',
  },
  { key: 'github', label: 'GitHub', href: 'https://github.com/Kuanhao-Chao' },
  { key: 'linkedin', label: 'LinkedIn', href: 'https://www.linkedin.com/in/kuanhao-chao/' },
  { key: 'orcid', label: 'ORCID', href: 'https://orcid.org/0000-0003-0099-0692' },
  { key: 'twitter', label: 'X', href: 'https://x.com/KuanHaoChao' },
  { key: 'bluesky', label: 'Bluesky', href: 'https://bsky.app/profile/kuanhaochao.bsky.social' },
  { key: 'calendly', label: 'Coffee chat', href: 'https://calendly.com/kuanhao-chao/30min' },
];

export const socialByKey = Object.fromEntries(socials.map((s) => [s.key, s]));
