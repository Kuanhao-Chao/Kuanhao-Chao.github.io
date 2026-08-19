/**
 * Centralized Computational Genomics & ML Paper Summaries Catalog.
 * Single source of truth for /papers/ hub and related navigation.
 * All pages under /papers/ are non-indexable (noindex, nofollow).
 */

export interface PaperCategory {
  slug: 'all' | 'fine-mapping' | 'peft' | 'gene-regulation' | 'evolutionary-models';
  label: string;
}

export interface PaperEntry {
  id: string;
  title: string;
  shortTitle?: string;
  authors: string[];
  affiliation: string;
  venue: string;
  year: number;
  doi: string;
  doiUrl: string;
  area: string;
  category: 'fine-mapping' | 'peft' | 'gene-regulation' | 'evolutionary-models';
  tag: string;
  readingTime: string;
  summary: string;
  highlights: string[];
  equations: string[];
  href: string;
  actionText: string;
  featured: boolean;
  icon?: string;
  status: 'published' | 'coming-soon';
}

export const PAPER_CATEGORIES: PaperCategory[] = [
  { slug: 'all', label: 'All Papers' },
  { slug: 'evolutionary-models', label: 'Evolutionary & Language Models' },
  { slug: 'fine-mapping', label: 'Fine-Mapping & GWAS' },
  { slug: 'peft', label: 'Deep Learning & PEFT' },
  { slug: 'gene-regulation', label: 'Regulatory Genomics' },
];

export const PAPERS: PaperEntry[] = [
  {
    id: 'gpnstar',
    title: 'Predicting Functional Constraints Across Evolutionary Timescales with Phylogeny-Informed Genomic Language Models',
    shortTitle: 'GPN-Star (Song Lab)',
    authors: ['Chengzhong Ye', 'Gonzalo Benegas', 'Carlos Albors', 'Jianan Canal Li', 'Sebastian Prillo', 'Peter D. Fields', 'Brian Clarke', 'Yun S. Song'],
    affiliation: 'University of California, Berkeley',
    venue: 'bioRxiv',
    year: 2025,
    doi: '10.1101/2025.09.21.677619',
    doiUrl: 'https://doi.org/10.1101/2025.09.21.677619',
    area: 'Evolutionary Genomics & Language Models',
    category: 'evolutionary-models',
    tag: 'UC Berkeley · GPN-Star',
    readingTime: '16 min read',
    summary:
      'GPN-Star integrates Whole-Genome Alignments and phylogenetic species trees into genomic language models via clade attention pooling and FIRE evolutionary distance biases. Outperforms classical conservation scores (phyloP, phastCons, CADD) and billion-parameter unaligned gLMs across coding and non-coding variant effect prediction, complex trait heritability (S-LDSC), and rare variant association testing (DeepRVAT).',
    highlights: [
      'Phylogeny-aware transformer architecture incorporates whole-genome alignments and species trees',
      'Clade-level attention pooling and FIRE relative evolutionary distance encoding',
      'Trained across three timescales: Vertebrate (240 species), Mammalian, and Primate (233 species)',
      'Unprecedented complex trait heritability enrichment (S-LDSC across 106 UK Biobank traits)',
      'DeepRVAT integration boosts whole-exome rare variant association gene discovery from 383 to 402 genes',
      'In silico mutagenesis (ISM) maps spatial nucleotide syntax in TH, HBA1, and LDLR promoters',
    ],
    equations: [
      'b(\\phi) = f_{\\theta}\\left(\\frac{\\log(c\\phi + 1)}{\\log(c\\phi_{\\max} + 1)}\\right)',
      '\\text{Attn}_{\\text{phy}} = \\text{softmax}\\left(\\frac{Q K^T}{\\sqrt{D}} + b(\\Phi)\\right) V',
      '\\text{LLR}(v) = \\log P(\\text{alt}) - \\log P(\\text{ref})',
    ],
    href: '/papers/gpnstar/',
    actionText: 'Read full technical paper summary',
    featured: true,
    icon: 'phmm',
    status: 'published',
  },
  {
    id: 'borzoi-finemapped',
    title: 'Borzoi-Informed Fine Mapping Improves Causal Variant Prioritization in Complex Trait GWAS',
    shortTitle: 'Borzoi Fine-Mapping (Sniff)',
    authors: ['Divyanshi Srivastava', 'Anya Korsakova', 'Qingbo Wang', 'Luong Ruiz', 'Han Yuan', 'David R. Kelley'],
    affiliation: 'Calico Life Sciences LLC',
    venue: 'bioRxiv',
    year: 2025,
    doi: '10.1101/2025.07.09.663162',
    doiUrl: 'https://doi.org/10.1101/2025.07.09.663162',
    area: 'Statistical Genetics & Deep Learning',
    category: 'fine-mapping',
    tag: 'Calico Life Sciences · Sniff',
    readingTime: '15 min read',
    summary:
      'Replacing coarse annotation overlap (PolyFun baseline-LF) with sequence-to-function predictions from Borzoi (7,611 tracks). Resolves single-nucleotide motif disruptions, overcomes indel shift artifacts, and yields a +9.45% increase in high-confidence causal variants across 15 UK Biobank traits.',
    highlights: [
      'Sniff framework replaces uniform 1kb peak overlap with single-nucleotide motif disruption scores',
      'Indel "stitch" strategy eliminates artificial convolutional receptive field shift discrepancies',
      'Multi-category iterative PCA across 6 assay types generates the Borzoi-102 annotation set',
      'Validated via MPRA (2.4× emVar enrichment, p=7.15e-10) and FinnGen R12 replication (78.4%)',
      'In silico mutagenesis (ISM) uncovers de novo motif creation in PKN2, DEGS1, and LAPTM5',
    ],
    equations: [
      'L_2(t) = \\sqrt{\\sum_{b=1}^{B} \\left(\\log(1 + \\hat{Y}_{\\text{alt}, b, t}) - \\log(1 + \\hat{Y}_{\\text{ref}, b, t})\\right)^2}',
      '\\mathbb{E}[\\chi^2_j] = 1 + N \\sum_c \\tau_c \\ell_{j,c}',
      '\\text{PIP}_j = P(\\gamma_j = 1 \\mid \\text{Data})',
    ],
    href: '/papers/borzoi-finemapped/',
    actionText: 'Read full technical paper summary',
    featured: true,
    icon: 'gwas',
    status: 'published',
  },
  {
    id: 'borzoi-peft',
    title: 'Parameter-Efficient Fine-Tuning of a Supervised Regulatory Sequence Model',
    shortTitle: 'Borzoi PEFT (Locon4)',
    authors: ['Han Yuan', 'Johannes Linder', 'David R. Kelley'],
    affiliation: 'Calico Life Sciences LLC',
    venue: 'bioRxiv',
    year: 2025,
    doi: '10.1101/2025.05.26.656171',
    doiUrl: 'https://doi.org/10.1101/2025.05.26.656171',
    area: 'Deep Learning & Transfer Learning',
    category: 'peft',
    tag: 'Calico Life Sciences · Locon4',
    readingTime: '14 min read',
    summary:
      'Democratizing adaptation of massive 524kb sequence models like Borzoi. Demonstrates that feature map activation memory is the GPU bottleneck, and introduces Locon4 (LoRA in transformer blocks + LoCon in the final 4 conv layers) running comfortably within 24 GB VRAM on a single consumer RTX 4090.',
    highlights: [
      'Identifies intermediate feature map activation memory as the primary GPU bottleneck in genomic CNNs',
      'Locon4 updates ~1-3% of parameters, training 5× faster in <24 GB VRAM with zero inference overhead',
      'Matches full fine-tuning on GTEx eQTL classification (auROC 0.748) and Variant-FlowFISH MPRA',
      'Uncovers master regulators of replicative senescence in WI-38 fibroblasts via Normalized Differential Saliency (NDSS)',
      'Achieves 89.3% accuracy in identifying targeted TFs across 28 ENCODE knockdown screens',
    ],
    equations: [
      'W = W_0 + \\frac{\\alpha}{r} (W_{\\text{pw}} * W_{\\text{dw}})',
      'W_{\\text{merged}} = W_0 + \\frac{\\alpha}{r} B A',
      '\\text{NDSS}_i = \\frac{\\text{DSS}_i - \\mu_{\\text{local}}}{\\sigma_{\\text{local}}}',
    ],
    href: '/papers/borzoi-peft/',
    actionText: 'Read full technical paper summary',
    featured: true,
    icon: 'ism',
    status: 'published',
  },
];
