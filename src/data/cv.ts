/** Career data sourced from the CV. Rendered on the home and teaching pages. */

export type Position = {
  role: string;
  org: string;
  unit?: string;
  period: string;
  url?: string;
};

export const experience: Position[] = [
  {
    role: 'Sr. Deep Learning Scientist & Engineer',
    org: 'Illumina',
    unit: 'AI Lab',
    period: 'Aug 2025 – Present',
    url: 'https://www.illumina.com/informatics/ai-in-genomics.html',
  },
  {
    role: 'Genomics ML Research Intern',
    org: 'Calico Life Sciences',
    unit: 'Kelley Lab',
    period: 'May 2024 – Aug 2024',
    url: 'https://www.calicolabs.com/',
  },
  {
    role: 'Research Assistant',
    org: 'Academia Sinica',
    unit: 'Institute of Information Science',
    period: 'Jul 2020 – Jan 2021',
    url: 'https://www.iis.sinica.edu.tw/en/index.html',
  },
  {
    role: 'Research Student',
    org: 'Australian National University',
    unit: 'Research School of Biology',
    period: 'Jul 2019 – Jun 2020',
    url: 'https://biology.anu.edu.au/',
  },
  {
    role: 'Research Student',
    org: 'National Taiwan University',
    unit: 'Centers of Genomic and Precision Medicine',
    period: 'Aug 2018 – Jul 2019',
    url: 'http://www.cgm.ntu.edu.tw/',
  },
];

export const education: Position[] = [
  {
    role: 'Ph.D., Computer Science',
    org: 'Johns Hopkins University',
    unit: 'Center for Computational Biology',
    period: 'Sep 2021 – Aug 2025',
    url: 'https://ccb.jhu.edu/',
  },
  {
    role: 'M.S.E., Computer Science',
    org: 'Johns Hopkins University',
    period: 'Sep 2021 – May 2023',
    url: 'https://www.cs.jhu.edu/',
  },
  {
    role: 'B.S., Electrical Engineering',
    org: 'National Taiwan University',
    period: 'Sep 2016 – Jan 2021',
    url: 'https://www.ntu.edu.tw/english/',
  },
];

export type Honor = { title: string; year: string; url?: string };

export const honors: Honor[] = [
  {
    title: 'Research highlight, JHU Department of Computer Science',
    year: '2025',
    url: 'https://www.cs.jhu.edu/news/solving-the-bottleneck-in-genome-biology/',
  },
  {
    title: 'Research highlight (Splam), JHU HUB & Whiting School of Engineering',
    year: '2024',
    url: 'https://hub.jhu.edu/2024/12/11/splam-pinpoints-gene-splicing/',
  },
  {
    title: 'Mark O. Robbins Prize, Advanced Research Computing at Hopkins',
    year: '2024',
    url: 'https://www.cs.jhu.edu/news/phd-student-kuan-hao-chao-wins-mark-o-robbins-prize-in-high-performance-computing/',
  },
  {
    title: 'Taiwan Government Scholarship to Study Abroad (GSSA)',
    year: '2024',
    url: 'https://twgps.moe.edu.tw/',
  },
  {
    title: 'Best Poster Award, Bioconductor Conference (Bioc2021)',
    year: '2021',
    url: 'https://bioc2021.bioconductor.org/',
  },
  {
    title: 'College Student Research Fellowship, Taiwan Ministry of Science and Technology',
    year: '2019',
  },
  { title: 'Elite Prize (1st place), HackNTU hackathon', year: '2017' },
];

export type Mentee = {
  name: string;
  detail: string;
  url?: string;
  links?: { label: string; url: string }[];
};

export const mentorship: Mentee[] = [
  {
    name: 'Alan Mao',
    detail:
      'JHU Computer Science & Biomedical Engineering undergrad (2023–2025); now a Ph.D. candidate in Biomedical Data Science at Stanford.',
    url: 'https://dbds.stanford.edu/',
  },
  {
    name: 'JHU Deep Learning + Genomics Study Group',
    detail:
      'Co-founder and organizer (with Mahler Revsine) of a biweekly deep-learning + genomics seminar at Johns Hopkins (Oct 2024 – Aug 2025), hosting speakers to spark discussion among researchers working at the intersection of deep learning and genomics.',
    links: [
      {
        label: 'Slides',
        url: 'https://drive.google.com/file/d/1E6Is-48GBmqK98Qh7FeQc8OEtGn4oN-A/view?usp=sharing',
      },
      {
        label: 'Repository',
        url: 'https://drive.google.com/drive/folders/15yCXZd5sCuCwPULc3b7p8X5OK8XqbdNp?usp=drive_link',
      },
      {
        label: 'Schedule',
        url: 'https://docs.google.com/spreadsheets/d/1mRFnzRyX5ThY69i_ne4oGkJJjmoyl4N0d_7tl2tC1Ts/edit?usp=sharing',
      },
    ],
  },
];

export const reviewing: string[] = [
  'Cell Reports Methods',
  'Journal of Translational Medicine',
  'PLOS ONE',
  'Computational and Structural Biotechnology Journal',
  'Human Genetics and Genomics Advances',
  'BMC Bioinformatics',
  'BMC Genomics',
  'Scientific Reports',
  'Genome Research',
  'G3: Genes, Genomes, Genetics',
  'Nature Machine Intelligence',
  'International Society for Computational Biology (ISCB)',
  'Chromatographia',
];

export type SoftwareTool = {
  name: string;
  /** Release/publication date (ISO YYYY-MM-DD); /software sorts newest-first by this. */
  date: string;
  blurb: string;
  license: { name: string; url: string };
  code: string;
  docs?: string;
  paper?: string;
  poster?: string;
  /** Slug(s) of related /posts/ deep-dives (see src/content/posts). */
  posts?: string[];
  /** Logo basename in src/assets/logos/software/<logo>.png (resolved on /software). */
  logo?: string;
};

const LICENSE = {
  apache: { name: 'Apache 2.0', url: 'https://opensource.org/license/apache-2-0' },
  gpl3: { name: 'GPLv3', url: 'https://www.gnu.org/licenses/gpl-3.0.en.html' },
  mit: { name: 'MIT', url: 'https://opensource.org/licenses/MIT' },
} as const;

/** Open-source research software. Rendered on the /software/ page. */
export const software: SoftwareTool[] = [
  {
    name: 'Shorkie',
    date: '2025-09-19',
    logo: 'shorkie',
    blurb: 'Yeast RNA-Seq coverage predictor powered by a fungal DNA language model.',
    license: LICENSE.apache,
    code: 'https://github.com/calico/shorkie-paper',
    paper: 'https://doi.org/10.1101/2025.09.19.677475',
    posts: ['shorkie'],
  },
  {
    name: 'OpenSpliceAI',
    date: '2025-06-01',
    logo: 'openspliceai',
    blurb: 'Efficient, modular splice-site prediction framework — easy to retrain on non-human species.',
    license: LICENSE.gpl3,
    code: 'https://github.com/Kuanhao-Chao/openspliceai',
    docs: 'https://ccb.jhu.edu/openspliceai/',
    paper: 'https://doi.org/10.7554/eLife.107454.3',
    poster: 'https://storage.googleapis.com/storage.khchao.com/poster/BDS_OpenSpliceAI.pdf',
    posts: ['openspliceai'],
  },
  {
    name: 'Splam',
    date: '2024-08-15',
    logo: 'splam',
    blurb: 'Deep-learning splice-site predictor that improves spliced alignments.',
    license: LICENSE.mit,
    code: 'https://github.com/Kuanhao-Chao/splam',
    docs: 'https://ccb.jhu.edu/splam/',
    posts: ['splam'],
    paper: 'https://doi.org/10.1186/s13059-024-03379-4',
    poster:
      'https://storage.googleapis.com/storage.khchao.com/JHU%20PhD/ISMB-ECCB2023/splam_poster_ismb.pdf',
  },
  {
    name: 'LiftOn',
    date: '2025-02-01',
    logo: 'lifton',
    blurb: 'Genome-annotation lift-over tool that combines DNA and protein alignments.',
    license: LICENSE.gpl3,
    code: 'https://github.com/Kuanhao-Chao/LiftOn',
    docs: 'https://ccb.jhu.edu/lifton/',
    paper: 'https://doi.org/10.1101/gr.279620.124',
    posts: ['lifton'],
  },
  {
    name: 'sangeranalyseR',
    date: '2021-03-01',
    blurb: 'R/Bioconductor package for simple, interactive Sanger-sequencing analysis.',
    license: LICENSE.mit,
    code: 'https://github.com/roblanf/sangeranalyseR',
    docs: 'https://sangeranalyser.readthedocs.io/en/latest/',
    posts: ['sangeranalyser'],
    paper: 'https://doi.org/10.1093/gbe/evab028',
    poster:
      'https://storage.googleapis.com/storage.khchao.com/JHU%20PhD/Bioc2021/sangeranalyseR_poster.pdf',
  },
  {
    name: 'Wheeler Graph Toolkit',
    date: '2023-07-14',
    logo: 'wgt',
    blurb: 'Tools and algorithms for recognizing, visualizing, and generating Wheeler graphs.',
    license: LICENSE.mit,
    code: 'https://github.com/Kuanhao-Chao/Wheeler_Graph_Toolkit',
    paper: 'https://doi.org/10.1016/j.isci.2023.107402',
    posts: ['wgt'],
    poster: 'https://storage.googleapis.com/storage.khchao.com/JHU%20PhD/RECOMB2023/WGT_poster.pdf',
  },
];

export type SideProject = { name: string; detail: string; url: string };

export const sideProjects: SideProject[] = [
  {
    name: 'Biobaby',
    detail: 'Unity WebGL game',
    url: 'https://storage.googleapis.com/storage.khchao.com/biobaby/index.html',
  },
  {
    name: 'Flappy Penguin',
    detail: 'Unity WebGL game',
    url: 'https://storage.googleapis.com/storage.khchao.com/flappy_penguin/index.html',
  },
  {
    name: 'Tank Fire',
    detail: 'Unity WebGL game',
    url: 'https://storage.googleapis.com/storage.khchao.com/tanks_fire/index.html',
  },
];
