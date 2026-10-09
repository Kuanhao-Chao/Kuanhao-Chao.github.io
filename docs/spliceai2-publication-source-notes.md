# SpliceAI2 publication source notes

Verified 2026-10-08 for the website update. Primary sources were reviewed directly, including the complete 57-page manuscript, its methods and extended figures; the title page and Extended Data Fig. 5 were also inspected visually. All PDF page numbers below are human, 1-based page numbers. This note records evidence and editorial boundaries, not a new independent benchmark.

## Identity, status, and dates

The exact title is **A unified framework for quantitative splicing and transcript prediction**. The upstream citation identifies an **unpublished manuscript (2026)**. Use the site's preprint type/status and year 2026; do not claim journal publication, peer review, acceptance, or a bioRxiv posting. No manuscript DOI or original posting date was established from the inspected first-party sources. Leave those unknown. [Official citation](https://github.com/Illumina/SpliceAI2#citation).

The public launch was **October 8, 2026**, according to the dated Illumina press release. This supports an **Announced** date and a release-news item, not an exact manuscript `datePublished`. Do not substitute PDF metadata, repository creation, or Hugging Face modification timestamps for publication history. Keep the announcement date distinguishable from the bibliographic year in the rendered entry and structured metadata. [Illumina launch release](https://www.illumina.com/company/news-center/press-releases/press-release-details.html?newsid=29236).

## Authors and contribution markings

Exact manuscript order (19 names), with site-normalized markings: [title page, p. 1](https://assets.illumina.com/content/dam/illumina-marketing/images/genomics-research/articles/spliceai2/SpliceAI2.pdf#page=1).

```text
Kishore Jaganathan*†, Jianbin Chen†, Xin Liu†, Yan Zhang†, Yujin Kim, Abhimanyu Banerjee, Petko P. Fiziev, Naomi Wilcox, Ibrahim I. Taskiran, Yichao Cai, Emilie M. Wigdor, Guo-Liang Chew, Grace Png, Jeremy F. McRae, Aniketh Janardhan Reddy, Kuan-Hao Chao, Rami Mehio, Stephan J. Sanders, Kyle Kai-How Farh*
```

| Meaning                                | Original PDF | Website convention |
| -------------------------------------- | ------------ | ------------------ |
| Equal contribution, first four authors | `*`          | `†`                |
| Correspondence, Jaganathan and Farh    | `†`          | `*`                |

The opposite site convention is documented in [the publication schema](../src/content.config.ts). Preserve names/order while translating meanings; omit affiliation numerals. Chao (author 16) has neither marker. Documented role: model development and implementation. [Author contributions, p. 48](https://assets.illumina.com/content/dam/illumina-marketing/images/genomics-research/articles/spliceai2/SpliceAI2.pdf#page=48). Do not assign study leadership or joint-first authorship.

## Architecture, training, and task boundaries

The released encoder uses MetaFormer blocks with depthwise dilated convolutions, pooling/upsampling, and residual channel mixing. Separate heads predict donor/acceptor usage and pairwise junction scores; the junction head uses coordinate-aware rotary attention and a forward-edge mask. Reference/alternate alleles share candidate sites for matched comparisons. [Released model implementation](https://github.com/Illumina/SpliceAI2/blob/main/spliceai2/model.py).

The scoring command defaults to 196,608 input bases and 1,024 junction candidates. The summary is the largest donor/acceptor gain/loss delta, not a junction-effect aggregate or a clinical pathogenicity probability. [Inference implementation](https://github.com/Illumina/SpliceAI2/blob/main/spliceai2/score.py). Transcript prediction combines site and junction scores and decodes ranked paths through a splice graph using dynamic programming. [Transcript decoder](https://github.com/Illumina/SpliceAI2/blob/main/spliceai2/utils.py), [transcript instructions](https://github.com/Illumina/SpliceAI2#transcript-prediction).

Training uses aggregated short-read splice observations from 314,745 samples across ten mammalian species, plus 330 ENCODE long-read samples for transcript-level supervision. [Illumina research announcement](https://www.illumina.com/science/genomics-research/articles/introducing-spliceai2--the-next-generation-of-splicing-and-trans.html). The separate tissue-conditioning framework incorporates 147 RBP expression values; DNA-only inference should not be advertised as sufficient for every tissue-conditioned task. [Manuscript, tissue-specific framework](https://assets.illumina.com/content/dam/illumina-marketing/images/genomics-research/articles/spliceai2/SpliceAI2.pdf). The public training script reserves human chromosomes 21 and 22 for validation. [Training implementation](https://github.com/Illumina/SpliceAI2/blob/main/spliceai2/train.py).

## Findings and scoped caveats

The announcement reports gains over SpliceAI, Pangolin, and AlphaGenome on cryptic-splice detection/usage, GTEx sQTLs, and OpenSplice MPRA agreement. It also describes population constraint and plasma-protein associations, disease-panel enrichment, and tissue/disease-specific splicing analyses. These are different evaluation settings, not one interchangeable accuracy measure. OpenSplice is the assay benchmark, not OpenSpliceAI. [Announcement, performance and population sections](https://www.illumina.com/science/genomics-research/articles/introducing-spliceai2--the-next-generation-of-splicing-and-trans.html).

The 82% top-transcript result concerns 352 selected held-out genes, requiring dominant isoform support at least twice the runner-up. Matching assesses spliced interiors, not transcript ends or universal full-length accuracy. [Fig. 1, pp. 11-12; methods, p. 28](https://assets.illumina.com/content/dam/illumina-marketing/images/genomics-research/articles/spliceai2/SpliceAI2.pdf#page=28).

Tissue-specific variant predictions added no benefit beyond reference usage. [p. 7; Extended Data Fig. 4c](https://assets.illumina.com/content/dam/illumina-marketing/images/genomics-research/articles/spliceai2/SpliceAI2.pdf#page=7). GEL's 17% comparison is excess panel-matched variants at matched enrichment, not diagnoses; its 15% burden estimate is not the fraction of patients diagnosed. [pp. 8-10; Fig. 4](https://assets.illumina.com/content/dam/illumina-marketing/images/genomics-research/articles/spliceai2/SpliceAI2.pdf#page=8).

Prefer qualitative, benchmark-scoped website wording. Numerical claims need their denominator, comparison, and task alongside them; avoid a generic superiority headline. Population depletion and protein associations support biological relevance, not clinical validation for every variant, ancestry, or context.

## Official resources and access

- [Manuscript PDF](https://assets.illumina.com/content/dam/illumina-marketing/images/genomics-research/articles/spliceai2/SpliceAI2.pdf).
- [Code repository](https://github.com/Illumina/SpliceAI2).
- [Docs: README installation and usage](https://github.com/Illumina/SpliceAI2#installation); no separate project documentation site was found.
- [Models: Hugging Face weights](https://huggingface.co/illumina-ai/SpliceAI2).
- [Data: Hugging Face precomputed predictions](https://huggingface.co/datasets/illumina-ai/SpliceAI2-data).
- [Research announcement](https://www.illumina.com/science/genomics-research/articles/introducing-spliceai2--the-next-generation-of-splicing-and-trans.html).
- [License: SpliceAI2 Model Terms of Use](https://github.com/Illumina/SpliceAI2/blob/main/LICENSE).

Public [model API metadata](https://huggingface.co/api/models/illumina-ai/SpliceAI2) and [dataset API metadata](https://huggingface.co/api/datasets/illumina-ai/SpliceAI2-data) both reported `gated: "auto"` and `disabled: false` on verification. This establishes active gated repositories, not unrestricted downloads. No terms were accepted and no weights or prediction data were downloaded. The model card requires both ensemble folders and warns that hardware/library differences can slightly change scores. [Model card](https://huggingface.co/illumina-ai/SpliceAI2).

The README scopes precomputed predictions to GENCODE v48 protein-coding genes on GRCh38, not every nucleotide genome-wide, and requires CUDA-capable inference hardware. It also links [DRAGEN Annotation documentation](https://help.connected.illumina.com/annotation) as another access route. Keep `models` distinct from `data` so weights are not mislabeled as predictions. [Official README](https://github.com/Illumina/SpliceAI2).

The license restricts use to eligible noncommercial research and limits redistribution, hosting, third-party access, and public lookup tools. Do not describe it as conventional open-source software, imply diagnostic authorization, or add a hosted demo/rehost assets as part of this publication update. Link official access pages and let readers review the terms. [License, sections 1-3 and 13](https://github.com/Illumina/SpliceAI2/blob/main/LICENSE).

## Website wording

Suggested neutral summary: "SpliceAI2 unifies quantitative prediction of splice-site usage, splice-junction usage, and transcript isoforms from genomic sequence, supporting splice-altering variant interpretation across reported experimental and population benchmarks." [Official project description](https://github.com/Illumina/SpliceAI2).

Editorial research connection: "This work extends my research on splice-site and splice-junction prediction toward quantitative transcript-level modeling." Treat that as a personal narrative, not a claim that SpliceAI2 derives from or replaces Splam or OpenSpliceAI. Preserve project-specific identities and links; do not expand the documented contribution into unsupported responsibilities.
