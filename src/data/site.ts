/**
 * Central site configuration: identity, navigation, and links.
 * Most components read from here, so this is the place to update
 * the bio, role, social handles, or menu.
 */

export const site = {
  name: 'Kuan-Hao Chao',
  nameZh: '趙冠豪',
  role: 'Senior Deep Learning Scientist, Illumina AI Lab',
  shortRole: 'Computational biologist',
  // One-line headline for the hero (kept deliberately short, Calico-style).
  tagline: 'Building machine learning for genomics.',
  // Full bio paragraph (homepage + about). Plain text + a few links via bioHtml.
  bio: `I am a Senior Deep Learning Scientist at the Illumina AI Lab. I earned my Ph.D. in Computer Science from the Center for Computational Biology, Johns Hopkins University (August 2025), advised by Steven Salzberg and Mihaela Pertea. My research focuses on AI for genomics — sequence-to-function modeling, genome annotation, and DNA language models. I hold a B.S. in Electrical Engineering from National Taiwan University and exchanged in my final year at the Australian National University.`,
  philosophy: 'Build what you need, use what you build.',
  url: 'https://khchao.com',
  email: 'kuanhao.chao@gmail.com',
  description:
    'Kuan-Hao Chao is a computational biologist and Senior Deep Learning Scientist at the Illumina AI Lab, working on AI for genomics: sequence-to-function models, genome annotation, and DNA language models.',
};

export type NavItem = { label: string; href: string };

export const nav: NavItem[] = [
  { label: 'Research', href: '/research/' },
  { label: 'Publications', href: '/publications/' },
  { label: 'Talks', href: '/talks/' },
  { label: 'Teaching', href: '/teaching/' },
  { label: 'CV', href: '/cv/' },
  { label: 'Photos', href: '/photos/' },
  { label: 'News', href: '/news/' },
];

export type SocialKey =
  | 'email'
  | 'scholar'
  | 'github'
  | 'linkedin'
  | 'orcid'
  | 'twitter'
  | 'bluesky'
  | 'calendly';

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
