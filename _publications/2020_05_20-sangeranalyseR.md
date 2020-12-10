---
title: "sangeranalyseR: simple and interactive analysis of Sanger sequencing data in R"
collection: publications
permalink: /publication/2020_05_20-sangeranalyseR
excerpt: '<small>This package builds on sangerseqR to allow users to create contigs from collections of Sanger sequencing reads. It provides a wide range of options for a number of commonly-performed actions including read trimming, detecting secondary peaks, and detecting indels using a reference sequence. All parameters can be adjusted interactively either in R or in the associated Shiny applications. There is extensive online documentation, and the package can outputs detailed HTML reports, including chromatograms.</small>'
date: 2020-05-20
venue: 'bioRxiv [Accepted at <b>Genome Biology (GBE)</b> with Minor Revisions]'
paperurl: 'https://www.biorxiv.org/content/10.1101/2020.05.18.102459v1.full.pdf'
citation: '<br><b style="color:#ad0000">K.H. Chao*</b>, K. Barton, S. Palmer, and R. Lanfear (2019). "sangeranalyseR: simple and interactive analysis of Sanger sequencing data in R" in <b><i>bioRxiv</i></b>. doi: 10.1101/2020.05.18.102459.'
superviser_clean:
  - "Robert Lanfear"
research_clean: "sangeranalyseR"
---

<script src="https://kit.fontawesome.com/yourcode.js"></script>


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
