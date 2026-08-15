export type ProjectLink = {
  label: string;
  href: string;
  icon: string;
};

export type Project = {
  slug: string;
  publicationId?: string;
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
    publicationId: '2025-09-shorkie',
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
      { label: 'Docs', icon: 'book', href: 'https://khchao.com/shorkie/' },
      { label: 'Code', icon: 'code', href: 'https://github.com/calico/shorkie-paper' },
      {
        label: 'Data',
        icon: 'database',
        href: 'https://khchao.com/shorkie/content/data_resources.html',
      },
      {
        label: 'Latest slides',
        icon: 'slides',
        href: 'https://storage.googleapis.com/storage.khchao.com/slides/ProbGen2026_0325.pdf',
      },
    ],
  },
  {
    slug: 'openspliceai',
    publicationId: '2025-06-openspliceai',
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
      { label: 'Docs', icon: 'book', href: 'https://khchao.com/OpenSpliceAI/' },
      { label: 'Code', icon: 'code', href: 'https://github.com/Kuanhao-Chao/openspliceai' },
      { label: 'Report', icon: 'file', href: '/reports/openspliceai-technical-report/' },
    ],
  },
  {
    slug: 'splam',
    publicationId: '2024-08-splam',
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
      { label: 'Docs', icon: 'book', href: 'https://khchao.com/splam/' },
      { label: 'Code', icon: 'code', href: 'https://github.com/Kuanhao-Chao/splam' },
    ],
  },
  {
    slug: 'lifton',
    publicationId: '2025-01-lifton',
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
      { label: 'Docs', icon: 'book', href: 'https://khchao.com/LiftOn/' },
      { label: 'Code', icon: 'code', href: 'https://github.com/Kuanhao-Chao/LiftOn' },
      { label: 'Report', icon: 'file', href: '/reports/lifton-v1-0-11-technical-report/' },
    ],
  },
  {
    slug: 'han1',
    publicationId: '2023-01-han1',
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
      { label: 'Code', icon: 'code', href: 'https://github.com/JHUCCB/ChineseHanSouthGenome' },
      {
        label: 'Data',
        icon: 'database',
        href: 'https://www.ncbi.nlm.nih.gov/datasets/genome/GCA_024586135.1/',
      },
    ],
  },
  {
    slug: 'wgt',
    publicationId: '2023-08-wgt',
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
      { label: 'Post', icon: 'pencil', href: '/posts/wgt/' },
      {
        label: 'Code',
        icon: 'code',
        href: 'https://github.com/Kuanhao-Chao/Wheeler_Graph_Toolkit',
      },
      { label: 'Report', icon: 'file', href: '/reports/wgt-technical-report/' },
    ],
  },
  {
    slug: 'sangeranalyser',
    publicationId: '2021-02-sangeranalyser',
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
  {
    slug: 'rnaseqr',
    publicationId: '2019-12-rnaseqr',
    title: 'RNASeqR: automated two-group RNA-Seq analysis workflow',
    shortTitle: 'RNASeqR',
    area: 'RNA-seq analysis',
    year: '2019',
    status: 'Published',
    tags: ['RNA-seq', 'R / Bioconductor', 'Differential expression'],
    summary:
      'An R package providing an end-to-end automated pipeline for two-group RNA-Seq analysis and visualization.',
    links: [
      { label: 'Publication', icon: 'file', href: '/publications/rnaseqr/' },
      { label: 'Code', icon: 'code', href: 'https://github.com/Kuanhao-Chao/RNASeqR' },
      {
        label: 'Docs',
        icon: 'book',
        href: 'https://bioconductor.org/packages/release/bioc/html/RNASeqR.html',
      },
    ],
  },
  {
    slug: 'hg002',
    publicationId: '2026-08-diploid-benchmark',
    title: 'HG002: a complete diploid human genome benchmark',
    shortTitle: 'HG002 benchmark',
    area: 'Diploid genomics',
    year: '2026',
    status: 'Published',
    tags: ['Human genome', 'Diploid genomics', 'Genome annotation'],
    summary:
      'A complete diploid HG002 reference and benchmark with haplotype-resolved sequence and gene annotation.',
    links: [
      { label: 'Research', icon: 'link', href: '/research/genome-assembly/' },
      { label: 'Publication', icon: 'file', href: '/publications/diploid-benchmark/' },
      { label: 'Post', icon: 'pencil', href: '/posts/hg002-diploid-benchmark/' },
      { label: 'Code', icon: 'code', href: 'https://github.com/marbl/HG002' },
    ],
  },
];

export const featuredProjects = projects.filter((project) => project.featured);
