---
title: "sangeranalyseR: simple and interactive analysis of Sanger sequencing data in R"
collection: publications
permalink: /publication/2020_05_20-sangeranalyseR
excerpt: 'This package builds on sangerseqR to allow users to create contigs from collections of Sanger sequencing reads. It provides a wide range of options for a number of commonly-performed actions including read trimming, detecting secondary peaks, and detecting indels using a reference sequence. All parameters can be adjusted interactively either in R or in the associated Shiny applications. There is extensive online documentation, and the package can outputs detailed HTML reports, including chromatograms.
'
date: 2020-05-20
venue: 'bioRxiv'
paperurl: 'http://academicpages.github.io/files/paper3.pdf'
citation: '<br><b style="color:#ad0000">K.H. Chao*</b>, K. Barton, S. Palmer, and R. Lanfear (2019). "sangeranalyseR: simple and interactive analysis of Sanger sequencing data in R" in <b><i>bioRxiv</i></b>. doi: 10.1101/2020.05.18.102459.'
---

## Abstract

### Summary:
sangeranalyseR is an interactive R/Bioconductor package and two associated Shiny applications designed for analysing Sanger sequencing from data from the ABIF file format in R. It allows users to go from loading reads to saving aligned contigs in a few lines of R code. sangeranalyseR provides a wide range of options for a number of commonlyperformed actions including read trimming, detecting secondary peaks, viewing chromatograms, and detecting indels using a reference sequence. All parameters can be
adjusted interactively either in R or in the associated Shiny applications. sangeranalyseR comes with extensive online documentation, and outputs detailed interactive HTML reports.

### Availability and implementation:
sangeranalyseR is implemented in R and released under
an MIT license. It is available for all platforms on Bioconductor
([https://bioconductor.org/packages/sangeranalyseR](https://bioconductor.org/packages/sangeranalyseR)) and on Github
([https://github.com/roblanf/sangeranalyseR](https://github.com/roblanf/sangeranalyseR)).

## Conclusion
sangeranalyseR is an open source R package that provides a simple but flexible set of options for analysing Sanger sequencing data in R. It is available on Bioconductor and is free and open source. We hope it will be beneficial to the community and make the analysis of Sanger sequencing simpler and more reproducible.

## Selected Figure
![]({{base_path}}/images/sangeranalyseR_figure_1.tiff)

* <small>(A), (B), and (C) are SangerAlignment level data analysis workflow. (A) Input files are prepared with a simple file naming convention; (B) The Shiny app allows users to examine each read and each contig, and to adjust trimming and other parameters for each read, using the navigation panel on the left; (C) Each SangerAlignment object provides an alignment of all contigs and a phylogenetic tree of the alignment, to assist users in assessing the quality of the inferences. (D) The read trimming plot shows the Phred Quality score (Y axis) for every base in the read (X axis) along with the trimming locations determined by the trimming parameters (red lines); (E) The chromatogram shows the called bases for each read, as well as the trimmed region at both the 3’ and 5’ ends; (F) An example of the R commands necessary to perform a full analysis, including loading and analysing the reads, launching the Shiny app, and generating the HTML report.</small>

## Source code & Documentation
* [sangeranalyseR **Bioconductor**](https://bioconductor.org/packages/sangeranalyseR)
* [sangeranalyseR **GitHub repository**](https://github.com/roblanf/sangeranalyseR)
* [sangeranalyseR **Read the Docs**](https://sangeranalyser.readthedocs.io/)
* [sangeranalyseR **Vignettes**](https://bioconductor.org/packages/devel/bioc/vignettes/sangeranalyseR/inst/doc/sangeranalyseR.html)

<br>

---

**Contact:**&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;[kuanhao.chao@gmail.com](mailto:kuanhao.chao@gmail.com)

**Index Terms:** &nbsp;&nbsp;&nbsp;&nbsp;*Genetics*, *DNA*, *Alignment*, *Bioconductor*, *Shiny application*, *Chromatogram*

<br>

---
[**>> Download paper here <<**](http://academicpages.github.io/files/paper3.pdf)
