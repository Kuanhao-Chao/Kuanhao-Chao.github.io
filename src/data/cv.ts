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

export type Mentee = { name: string; detail: string; url?: string };

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
      'Co-founder and organizer of a biweekly seminar connecting deep-learning + genomics researchers at Hopkins (2024–2025).',
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
