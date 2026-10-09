---
title: 'A unified framework for quantitative splicing and transcript prediction'
authors: 'Kishore Jaganathan*†, Jianbin Chen†, Xin Liu†, Yan Zhang†, Yujin Kim, Abhimanyu Banerjee, Petko P. Fiziev, Naomi Wilcox, Ibrahim I. Taskiran, Yichao Cai, Emilie M. Wigdor, Guo-Liang Chew, Grace Png, Jeremy F. McRae, Aniketh Janardhan Reddy, Kuan-Hao Chao, Rami Mehio, Stephan J. Sanders, Kyle Kai-How Farh*'
venue: 'Illumina preprint'
date: 2026-10-08
dateBasis: announcement
type: preprint
status: preprint
pdf: 'https://assets.illumina.com/content/dam/illumina-marketing/images/genomics-research/articles/spliceai2/SpliceAI2.pdf'
code: 'https://github.com/Illumina/SpliceAI2'
docs: 'https://github.com/Illumina/SpliceAI2#installation'
models: 'https://huggingface.co/illumina-ai/SpliceAI2'
data: 'https://huggingface.co/datasets/illumina-ai/SpliceAI2-data'
news: 'https://www.illumina.com/science/genomics-research/articles/introducing-spliceai2--the-next-generation-of-splicing-and-trans.html'
featured: false
abstract: >
  SpliceAI2 models RNA splicing at three connected levels: quantitative splice-site
  usage, donor–acceptor junction usage, and transcript isoforms. By combining
  large-scale short- and long-read RNA-seq supervision with long genomic sequence
  context, it connects local splicing decisions to transcript structure. The
  preprint evaluates splice-altering variants using experimental assays,
  population variation, and disease-associated gene panels, alongside a
  tissue-specific extension that incorporates regulator-expression inputs.
bibtex: |
  @misc{jaganathan2026spliceai2,
    title        = {A unified framework for quantitative splicing and transcript prediction},
    author       = {Jaganathan, Kishore and Chen, Jianbin and Liu, Xin and Zhang, Yan and Kim, Yujin and Banerjee, Abhimanyu and Fiziev, Petko P. and Wilcox, Naomi and Taskiran, Ibrahim I. and Cai, Yichao and Wigdor, Emilie M. and Chew, Guo-Liang and Png, Grace and McRae, Jeremy F. and Reddy, Aniketh Janardhan and Chao, Kuan-Hao and Mehio, Rami and Sanders, Stephan J. and Farh, Kyle Kai-How},
    year         = {2026},
    howpublished = {Illumina preprint},
    note         = {Unpublished manuscript; model launch announced October 8, 2026},
    url          = {https://assets.illumina.com/content/dam/illumina-marketing/images/genomics-research/articles/spliceai2/SpliceAI2.pdf}
  }
---

## About this work

I co-authored **SpliceAI2** at Illumina, contributing to model development and implementation. The work extends my research on splice-site and splice-junction prediction toward quantitative transcript-level modeling.

The model asks not only **where splicing can occur**, but **how often particular sites and junctions are used, and how these choices combine into transcript isoforms**. A convolutional sequence encoder supplies shared features, an attention-based head scores donor–acceptor pairs, and splice-graph inference connects these events into transcript paths. Training draws on 314,745 short-read RNA-seq samples across ten mammalian species and 330 human and mouse long-read samples. The [manuscript](https://assets.illumina.com/content/dam/illumina-marketing/images/genomics-research/articles/spliceai2/SpliceAI2.pdf) explains the architecture, training, and evaluation.

## What the results establish

The preprint evaluates cryptic splice-site activation, splicing quantitative trait loci, and a massively parallel splicing assay, with additional analyses of population constraint, protein abundance, and disease-associated gene panels. These are complementary tests of predicted splicing changes, not a blanket guarantee of clinical performance.

Transcript-reconstruction results concern the most abundant isoform in a selected set of held-out genes and its internal splice structure, rather than accurate prediction of every transcript start, end, and alternative isoform. The tissue-specific extension uses RNA-binding-protein expression alongside DNA sequence; in the reported analysis, tissue-specific variant-effect predictions did not add benefit beyond reference junction usage. Disease-panel enrichment is **not diagnostic yield**.

## Resources and access

The [GitHub repository](https://github.com/Illumina/SpliceAI2) provides installation, variant-scoring, and transcript-prediction instructions. Inference requires a CUDA-capable GPU and the two released ensemble model folders. [Model weights](https://huggingface.co/illumina-ai/SpliceAI2) and [precomputed variant predictions](https://huggingface.co/datasets/illumina-ai/SpliceAI2-data) are hosted separately on Hugging Face; the released precomputed scores cover protein-coding genes using GENCODE v48 on GRCh38.

Model and data downloads require accepting Illumina's terms and providing the requested affiliation information. Access and reuse are governed by the [SpliceAI2 terms of use](https://github.com/Illumina/SpliceAI2/blob/main/LICENSE), including noncommercial-organization and research-use restrictions; commercial use requires separate licensing. These are not unrestricted open-source assets, and the release is not for diagnostic procedures. Scores represent predicted splicing changes, not a calibrated probability of pathogenicity.

## Preprint status and date

The [official citation](https://github.com/Illumina/SpliceAI2#citation) identifies this work as an **unpublished manuscript (2026)**. No DOI or bioRxiv posting was verified. October 8, 2026 is the model-launch announcement date documented in the [Illumina press release](https://www.illumina.com/company/news-center/press-releases/press-release-details.html?newsid=29236), not a verified original posting date for the manuscript.
