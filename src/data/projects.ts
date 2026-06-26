export type ProjectLink = {
  label: string;
  href: string;
  icon: string;
};

export type Project = {
  slug: string;
  title: string;
  shortTitle: string;
  area: string;
  summary: string;
  year: string;
  status: string;
  tags: string[];
  featured?: boolean;
  links: ProjectLink[];
};

export const projects: Project[] = [
  {
    slug: 'shorkie',
    title: 'Shorkie: reading yeast regulatory code with fungal DNA models',
    shortTitle: 'Shorkie',
    area: 'DNA language models',
    year: '2025',
    status: 'Preprint',
    featured: true,
    tags: ['Gene expression', 'DNA language models', 'Yeast'],
    summary:
      'A compact fungal DNA language model for predicting budding-yeast RNA-seq coverage and regulatory variant effects.',
    links: [
      { label: 'Research', icon: 'link', href: '/research/gene-expression/' },
      { label: 'Publication', icon: 'file', href: '/publications/shorkie/' },
      { label: 'Post', icon: 'pencil', href: '/posts/shorkie/' },
      { label: 'Code', icon: 'code', href: 'https://github.com/calico/shorkie-paper' },
    ],
  },
  {
    slug: 'openspliceai',
    title: 'OpenSpliceAI: retrainable splice-site prediction in PyTorch',
    shortTitle: 'OpenSpliceAI',
    area: 'Splice prediction',
    year: '2025',
    status: 'Published',
    featured: true,
    tags: ['RNA splicing', 'Deep learning', 'Variant effects'],
    summary:
      'A modular PyTorch implementation of SpliceAI that can be retrained across species and used for genome-wide variant rescoring.',
    links: [
      { label: 'Research', icon: 'link', href: '/research/splice-sites/' },
      { label: 'Publication', icon: 'file', href: '/publications/openspliceai/' },
      { label: 'Post', icon: 'pencil', href: '/posts/openspliceai/' },
      { label: 'Docs', icon: 'book', href: 'https://ccb.jhu.edu/openspliceai/' },
      { label: 'Code', icon: 'code', href: 'https://github.com/Kuanhao-Chao/openspliceai' },
      { label: 'Report', icon: 'file', href: '/reports/openspliceai-technical-report/' },
    ],
  },
  {
    slug: 'splam',
    title: 'Splam: splice-junction recognition for cleaner RNA-seq alignments',
    shortTitle: 'Splam',
    area: 'RNA splicing',
    year: '2024',
    status: 'Published',
    featured: true,
    tags: ['RNA-seq', 'Deep learning', 'Transcript assembly'],
    summary:
      'A splice-junction recognizer designed to filter spurious RNA-seq junctions and improve downstream transcriptome assembly.',
    links: [
      { label: 'Research', icon: 'link', href: '/research/splice-sites/' },
      { label: 'Publication', icon: 'file', href: '/publications/splam/' },
      { label: 'Post', icon: 'pencil', href: '/posts/splam/' },
      { label: 'Docs', icon: 'book', href: 'https://ccb.jhu.edu/splam/' },
      { label: 'Code', icon: 'code', href: 'https://github.com/Kuanhao-Chao/splam' },
    ],
  },
  {
    slug: 'lifton',
    title: 'LiftOn: combining DNA and protein evidence for genome annotation',
    shortTitle: 'LiftOn',
    area: 'Genome annotation',
    year: '2025',
    status: 'Published',
    featured: true,
    tags: ['Genome annotation', 'Lift-over', 'Comparative genomics'],
    summary:
      'A genome-annotation lift-over tool that combines DNA alignments with protein evidence to preserve accurate coding models.',
    links: [
      { label: 'Research', icon: 'link', href: '/research/genome-annotation/' },
      { label: 'Publication', icon: 'file', href: '/publications/lifton/' },
      { label: 'Post', icon: 'pencil', href: '/posts/lifton/' },
      { label: 'Docs', icon: 'book', href: 'https://ccb.jhu.edu/lifton/' },
      { label: 'Code', icon: 'code', href: 'https://github.com/Kuanhao-Chao/LiftOn' },
      { label: 'Report', icon: 'file', href: '/reports/lifton-v1-0-9-technical-report/' },
    ],
  },
  {
    slug: 'han1',
    title: 'Han1: a gapless Southern Han Chinese reference genome',
    shortTitle: 'Han1',
    area: 'Genome assembly',
    year: '2023',
    status: 'Published',
    featured: true,
    tags: ['Genome assembly', 'Human genome', 'Annotation'],
    summary:
      'A complete, reference-quality, fully annotated genome assembled from a Southern Han Chinese individual.',
    links: [
      { label: 'Research', icon: 'link', href: '/research/genome-assembly/' },
      { label: 'Publication', icon: 'file', href: '/publications/han1/' },
      { label: 'Post', icon: 'pencil', href: '/posts/han1/' },
    ],
  },
  {
    slug: 'wgt',
    title: 'Wheeler Graph Toolkit: algorithms for pangenome indexing',
    shortTitle: 'WGT',
    area: 'Pangenomics',
    year: '2023',
    status: 'Published',
    featured: true,
    tags: ['Pangenomics', 'Algorithms', 'Formal methods'],
    summary:
      'A toolkit for recognizing, visualizing, generating, and repairing Wheeler graphs used in pangenome indexing.',
    links: [
      { label: 'Research', icon: 'link', href: '/research/pangenome-indexing/' },
      { label: 'Publication', icon: 'file', href: '/publications/wgt/' },
      { label: 'Code', icon: 'code', href: 'https://github.com/Kuanhao-Chao/Wheeler_Graph_Toolkit' },
      { label: 'Report', icon: 'file', href: '/reports/wgt-technical-report/' },
    ],
  },
  {
    slug: 'sangeranalyser',
    title: 'sangeranalyseR: reproducible Sanger sequencing workflows in R',
    shortTitle: 'sangeranalyseR',
    area: 'Sequencing software',
    year: '2021',
    status: 'Published',
    tags: ['Sanger sequencing', 'R / Bioconductor', 'Open source'],
    summary:
      'An R/Bioconductor workflow and Shiny interface for trimming, assembling, inspecting, and reporting Sanger sequencing data.',
    links: [
      { label: 'Publication', icon: 'file', href: '/publications/sangeranalyser/' },
      { label: 'Post', icon: 'pencil', href: '/posts/sangeranalyser/' },
      { label: 'Docs', icon: 'book', href: 'https://sangeranalyser.readthedocs.io/en/latest/' },
      { label: 'Code', icon: 'code', href: 'https://github.com/roblanf/sangeranalyseR' },
    ],
  },
];

export const featuredProjects = projects.filter((project) => project.featured);
