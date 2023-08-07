---
title: "sangeranalyseR: simple and interactive processing of Sanger sequencing data in R"
collection: publications
permalink: https://academic.oup.com/gbe/article/doi/10.1093/gbe/evab028/6137837?guestAccessKey=0252e360-4455-46b3-8513-324e5246fc92
excerpt: '<details>
  <summary><b>Abstract:</b></summary>
  <p><small>
  sangeranalyseR is feature-rich, free, and open-source R package for processing Sanger sequencing data. It allows users to go from loading reads to saving aligned contigs in a few lines of R code by using sensible defaults for most actions. It also provides complete flexibility for determining how individual reads and contigs are processed, both at the command-line in R and via interactive Shiny applications. sangeranalyseR provides a wide range of options for all steps in Sanger processing pipelines including trimming reads, detecting secondary peaks, viewing chromatograms, detecting indels and stop codons, aligning contigs, estimating phylogenetic trees, and more. Input data can be in either ABIF or FASTA format. sangeranalyseR comes with extensive online documentation and outputs aligned and unaligned reads and contigs in FASTA format, along with detailed interactive HTML reports. sangeranalyseR supports the use of colorblind-friendly palettes for viewing alignments and chromatograms. It is released under an MIT licence and available for all platforms on Bioconductor (https://bioconductor.org/packages/sangeranalyseR, last accessed February 22, 2021) and on Github (https://github.com/roblanf/sangeranalyseR, last accessed February 22, 2021).
  </small></p>
  </details>'
date: 2021-02-08
venue: '<b>Genome Biology and Evolution(GBE)</b>'
paperurl: 'https://academic.oup.com/gbe/article/13/3/evab028/6137837'
citation: '<br><b style="color:#ad0000">Kuan-Hao Chao*</b>, K. Barton, S. Palmer, and R. Lanfear* (2021). sangeranalyseR: simple and interactive processing of Sanger sequencing data in R, <i><b>Genome Biology and Evolution</b></i>, Volume 13, Issue 3, March 2021, evab028, <a href="https://academic.oup.com/gbe/article/doi/10.1093/gbe/evab028/6137837?guestAccessKey=0252e360-4455-46b3-8513-324e5246fc92s">https://doi.org/10.1093/gbe/evab028</a>.'
doi: 'https://doi.org/10.1093/gbe/evab028'
pdf: 'https://academic.oup.com/gbe/article/13/3/evab028/6137837'
code: 'https://github.com/roblanf/sangeranalyseR'
documentation: 'https://sangeranalyser.readthedocs.io/en/latest/'
# slides: 'https://drive.google.com/file/d/1XLg_ej1cUAJ8uTVV_XM-0KxnR2DKQXIQ/view?pli=1'
poster: 'https://storage.googleapis.com/storage.khchao.com/JHU%20PhD/Bioc2021/sangeranalyseR_poster.pdf'
authors:  '<b style="color:#ad0000">Kuan-Hao Chao*</b>, K. Barton, S. Palmer, and R. Lanfear*'
altmetric: "<div class='altmetric-embed' data-badge-type='1' data-doi='10.1093/gbe/evab028' style='display:inline;'></div>"
altmetric_inside: "<div data-badge-type='donut' class='altmetric-embed' data-badge-popover='left' data-doi='10.1093/gbe/evab028' style='display:inline;'></div>"
SJR: '<a href="https://www.scimagojr.com/journalsearch.php?q=19700182013&amp;tip=sid&amp;exact=no" title="SCImago Journal &amp; Country Rank"><img border="0" src="https://www.scimagojr.com/journal_img.php?id=19700182013" style="width:235px; height: 250px;object-fit: cover;display: inline; margin-top:20px;" alt="SCImago Journal &amp; Country Rank"  /></a>'
license: '<a href="https://opensource.org/licenses/MIT" target="_blank"><img src="https://img.shields.io/badge/License-MIT-yellow.svg"></a>'
document_status: '<a href="https://sangeranalyser.readthedocs.io/" target="_blank"><img src="https://readthedocs.org/projects/pip/badge/"></a>'
platforms: '<a href="https://bioconductor.riken.jp/packages/3.12/bioc/html/sangeranalyseR.html" target="_blank"><img src="https://img.shields.io/badge/platform-macOS_/Linux_/Windows-green.svg"></a>'
superviser_clean:
  - "Robert Lanfear"
research_clean: "sangeranalyseR"
---

<!-- <script type='text/javascript' src='https://d1bxh8uas1mnw7.cloudfront.net/assets/embed.js'></script> -->

<script src="https://kit.fontawesome.com/yourcode.js"></script>

<!-- <div data-badge-type='donut' class='altmetric-embed' data-badge-popover='left' data-doi='10.1101/2020.05.18.102459' style='display:inline;'></div> -->

<div clss="row" style="display: flex; column-count: 3;">
  <div class="column">
    <div class='altmetric-embed' data-badge-type='medium-donut' data-doi='10.1093/gbe/evab028' style="inline; margin-top:10px"></div>
  </div>
  <div class="column">
    <a href="https://www.scimagojr.com/journalsearch.php?q=19700182013&amp;tip=sid&amp;exact=no" title="SCImago Journal &amp; Country Rank"><img border="0" src="https://www.scimagojr.com/journal_img.php?id=19700182013" style="width:60%;object-fit: cover;display: inline; margin-left:60px;" alt="SCImago Journal &amp; Country Rank"  /></a>
  </div>
  <div class="column">
  </div>
</div>


<h2 style="color: #000f70"> <i class="fas fa-dot-circle" style="font-size:18px;"></i> &nbsp;&nbsp;Abstract </h2>

<div style="margin-left: 30px">
<h3> Summary: </h3>
sangeranalyseR is an interactive R/Bioconductor package and two associated Shiny applications designed for analysing Sanger sequencing from data from the ABIF file format in R. It allows users to go from loading reads to saving aligned contigs in a few lines of R code. sangeranalyseR provides a wide range of options for a number of commonlyperformed actions including read trimming, detecting secondary peaks, viewing chromatograms, and detecting indels using a reference sequence. All parameters can be
adjusted interactively either in R or in the associated Shiny applications. sangeranalyseR comes with extensive online documentation, and outputs detailed interactive HTML reports.

<h3> Availability and implementation: </h3>
sangeranalyseR is implemented in R and released under
an MIT license. It is available for all platforms on Bioconductor (<a href="https://bioconductor.org/packages/sangeranalyseR">https://bioconductor.org/packages/sangeranalyseR</a>) and on Github (<a href="https://github.com/roblanf/sangeranalyseR">https://github.com/roblanf/sangeranalyseR</a>).
</div>

<h2 style="color: #000f70"> <i class="fas fa-dot-circle" style="font-size:18px;"></i> &nbsp;&nbsp;Conclusion </h2>

<div style="margin-left: 30px">
sangeranalyseR is an open source R package that provides a simple but flexible set of options for analysing Sanger sequencing data in R. It is available on Bioconductor and is free and open source. We hope it will be beneficial to the community and make the analysis of Sanger sequencing simpler and more reproducible.
</div>


<h2 style="color: #000f70"> <i class="fas fa-dot-circle" style="font-size:18px;"></i> &nbsp;&nbsp;Selected Figure </h2>

<div style="margin-left: 30px">
<img src="{{base_path}}/images/sangeranalyseR_figure_1.png">

<div style = "margin: 30px">
<small>(A), (B), and (C) are SangerAlignment level data analysis workflow. (A) Input files are prepared with a simple file naming convention; (B) The Shiny app allows users to examine each read and each contig, and to adjust trimming and other parameters for each read, using the navigation panel on the left; (C) Each SangerAlignment object provides an alignment of all contigs and a phylogenetic tree of the alignment, to assist users in assessing the quality of the inferences. (D) The read trimming plot shows the Phred Quality score (Y axis) for every base in the read (X axis) along with the trimming locations determined by the trimming parameters (red lines); (E) The chromatogram shows the called bases for each read, as well as the trimmed region at both the 3’ and 5’ ends; (F) An example of the R commands necessary to perform a full analysis, including loading and analysing the reads, launching the Shiny app, and generating the HTML report.</small>
</div>
</div>


<h2 style="color: #000f70"> <i class="fas fa-dot-circle" style="font-size:18px;"></i> &nbsp;&nbsp;Source code & Documentation </h2>

<div style="margin-left: 15px">
  <ul>
    <li><a href="https://bioconductor.org/packages/sangeranalyseR">sangeranalyseR <b>Bioconductor</b></a></li>
    <li><a href="https://github.com/roblanf/sangeranalyseR">sangeranalyseR <b>GitHub repository</b></a></li>
    <li><a href="https://sangeranalyser.readthedocs.io/">sangeranalyseR <b>Documentation</b></a></li>
    <li><a href="https://bioconductor.org/packages/devel/bioc/vignettes/sangeranalyseR/inst/doc/sangeranalyseR.html">sangeranalyseR <b>Vignettes</b></a></li>
  </ul>
</div>


<br>

---

**Contact:**&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;[kuanhao.chao@gmail.com](mailto:kuanhao.chao@gmail.com)

**Index Terms:** &nbsp;&nbsp;&nbsp;&nbsp;*Genetics*, *DNA*, *Alignment*, *Bioconductor*, *Shiny application*, *Chromatogram*

<br>

---
[**>> Download paper here <<**](https://watermark.silverchair.com/evab028.pdf?token=AQECAHi208BE49Ooan9kkhW_Ercy7Dm3ZL_9Cf3qfKAc485ysgAAAsMwggK_BgkqhkiG9w0BBwagggKwMIICrAIBADCCAqUGCSqGSIb3DQEHATAeBglghkgBZQMEAS4wEQQMZuPkF_0ajX9ulxRQAgEQgIICdmPS94PwF1AacCAt-pMPTnZcUQuUr41gsT4TlyNxdEn6gfiBhvV9LN6n17lf6eHyoQArwQtYsv2Jg1Ik-qbjVE8xF2Ckz-VeZ725DXDdrnaPC8sEgysTrrecCATSaWFRDTfGjXoGfrZGz9JQ8Fm2zW-niF5VAJEIWfft2QMdW2v_1Ujfa1GArWkaJo2Yz7exnzPq5D6kQ9fD7YQAsbzFIbF0EqWCEzw6A0M1Z9yGG1Jl2JnQAigJk9WdSDavgQ4gQXskmRxEGEwe3D53iGhACZSyFf_Od0MOO6AzTfFVWll3WTxULrLo-jC4yoP0oQShCqpSAsKfhE2aJc5IumP5p6N_six2mOC1lQUl1Z2B3xpXn95chDFMtxF0IYxR_P2YqkQXoM1w67W_SUTF2nE88heSup2OJbDC2gu4OfkBvM4aoCG773JE5012IIfO0I5dus0EdaUdXLcXrsPtn1u2-GpRfZL_-lYFgXJ0-aQguq1Icp7f36jPn487Nfk7Q7ZoxjEwb3kSDF6S_961jEZNhxspQrPtjRXLcOhSyGrF8LNod5a76jvSTX2zFdt4R1mduvwjQsyUW_Hh57ayosMRWls7nIjvJcsxnMXZ6j3yBU9x2SiLRa-gBKZbINOPQ4AXJlPZWi5ktkXrEOWsb05jORRHjOS25EKzJETkx5ER3J65scHB510aneuq5qYR0XCwdHK-sP7JCQM9aZcxeth4ktM83wV6FEQx-H0rQkFAarT5TDqC-Lx-butKLD-I6CvP_busI7pZ8sv9Ctx7hUe2wnlOiLdabd7uKmWAwxGBqwyzEvIjiWGrl0vQhsuZnQ3u9-veU3NWvw)
