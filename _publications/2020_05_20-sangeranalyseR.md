---
title: "sangeranalyseR: simple and interactive analysis of Sanger sequencing data in R"
collection: publications
permalink: /publication/2020_05_20-sangeranalyseR
excerpt: '<small>This package builds on sangerseqR to allow users to create contigs from collections of Sanger sequencing reads. It provides a wide range of options for a number of commonly-performed actions including read trimming, detecting secondary peaks, and detecting indels using a reference sequence. All parameters can be adjusted interactively either in R or in the associated Shiny applications. There is extensive online documentation, and the package can outputs detailed HTML reports, including chromatograms.</small>'
date: 2021-02-08
venue: '<b>Genome Biology (GBE)</b>'
paperurl: 'https://www.biorxiv.org/content/10.1101/2020.05.18.102459v1.full.pdf'
citation: '<br><b style="color:#ad0000">K.H. Chao*</b>, K. Barton, S. Palmer, and R. Lanfear (2020). "sangeranalyseR: simple and interactive analysis of Sanger sequencing data in R" in <b><i>bioRxiv</i></b>. doi: 10.1101/2020.05.18.102459.'
altmetric: "<div class='altmetric-embed' data-badge-type='1' data-doi='10.1101/2020.05.18.102459' style='display:inline;'></div>"
altmetric_inside: "<div data-badge-type='donut' class='altmetric-embed' data-badge-popover='left' data-doi='10.1101/2020.05.18.102459' style='display:inline;'></div>"
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
    <div class='altmetric-embed' data-badge-type='medium-donut' data-doi='10.1101/2020.05.18.102459' style="inline; margin-top:10px"></div>
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
[**>> Download paper here <<**](https://www.biorxiv.org/content/10.1101/2020.05.18.102459v1.full.pdf)
