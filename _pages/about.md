---
permalink: /
title: "🧑🏻‍💻 <img src='https://khchao.com/images/kh_logo.png' alt='Icon' style='width: 30px; height: 30px; margin-right: 10px;'> &nbsp; About me"
excerpt: "About me"
author_profile: true
redirect_from:
  - /about_me/
  - /about.html
---
{% include base_path %}

🎓 I'm a fourth-year Ph.D. Candidate in Computer Science at the <a target="_blank"  href="https://ccb.jhu.edu/" style="color:#4A4F53">Center for Computational Biology</a>, <a target="_blank"  href="https://www.jhu.edu/" style="color:#4A4F53">Johns Hopkins University</a>, working with <a target="_blank"  href="https://scholar.google.com/citations?user=sUVeH-4AAAAJ&hl=en" style="color:#4A4F53">Steven Salzberg</a> and <a target="_blank"  href="https://scholar.google.com/citations?user=fKjqGyEAAAAJ&hl=en" style="color:#4A4F53">Mihaela Pertea</a>. My academic journey started in <a target="_blank"  href="https://web.ee.ntu.edu.tw/eng/index.php" style="color:#4A4F53">Electrical Engineering</a> at <a target="_blank"  href="https://www.ntu.edu.tw/english/index.html" style="color:#4A4F53">National Taiwan University (NTU)</a>, shifting towards computer science in my final year at the <a target="_blank" href="https://cecs.anu.edu.au" style="color:#4A4F53">College of Engineering & Computer Science</a> at <a target="_blank"  href="https://www.anu.edu.au" style="color:#4A4F53">Australian National University (ANU)</a>.



🧬 My research interest intersects deep learning with genomics and transcriptomics:

- In **transcriptional regulatory networks**, my work uses sequence models to decode DNA patterns, aiming to uncover insights into how cis-regulatory DNA sequences and trans-regulators interact. I am building a yeast large language model (LLM) from hundreds of fungus genomes to better understand the mechanisms of yeast gene expression regulation ([Learn more](https://storage.googleapis.com/storage.khchao.com/slides/JHU_joint_lab_meeting_2025.pdf)).
- In **splice site predictiong**, I built a deep dilated residual convolutional neural network to decode the complexities of RNA splicing, alternative splicing, and the impact of genetic variants on cryptic splicing ([Learn more](https://doi.org/10.1186/s13059-024-03379-4); [News](https://hub.jhu.edu/2024/12/11/splam-pinpoints-gene-splicing/)).
- In **genome annotation**, I used graph-based methods to stitch together fragmented DNA and protein alignments, thereby assembling them into more accurate annotations. ([Learn more](https://doi.org/10.1101/gr.279620.124)).
- In **genome assembly**, I assembled and annotated the first gapless Southern Chinese Han genome, [Han1](https://www.ncbi.nlm.nih.gov/datasets/genome/GCA_024586135.1/), using PacBio HiFi and Oxford Nanopore long reads, with T2T-CHM13 as a guide ([Learn more](https://doi.org/10.1093/g3journal/jkac321)).
- For **pangenome indexing**, I applied new renaming heuristics and an SMT solver to make the Wheeler graph recognition problem computationally feasible ([Learn more](https://doi.org/10.1016/j.isci.2023.107402)).
<!-- - My **transcriptome assembly** work focuses on modeling RNA-Seq data using directed acyclic splice graphs, with ongoing research into graph neural networks to decode the complexities of RNA splicing. ([Learn more](https://www.biorxiv.org/content/10.1101/2023.07.27.550754v2)). -->

💻 I am an advocate for open-source software, embracing the philosophy of **"build what you need, use what you build"**. I invite you to explore my **[NEWS](https://khchao.com/news/)** page for the latest updates on my projects.

💬 Feel free to reach out to me for collaborations, discussions, or just to say hi! **[Coffee chat! ☕️](https://calendly.com/kuanhao-chao/30min)**

<style>
  .popup-overlay {
    z-index: 9999;
    display: none;b
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background-color: rgba(0, 0, 0, 0.5);
    overflow: auto;
  }
  .popup-content {
    z-index: 10000;
    background-color: white;
    padding: 40px;
    border-radius: 5px;
    box-shadow: 0px 0px 10px rgba(0, 0, 0, 0.2);
    position: absolute;
    left: 50%;
    top: 50%;
    transform: translate(-50%, -50%);
    max-width: 70%; /* Adjust maximum width for responsiveness */
    max-height: calc(100% - 60px); /* Adjust maximum height to fit within the window */
    overflow-y: auto; /* Enable vertical scrolling if content overflows */
  }
  .close-button {
    position: absolute;
    font-size: 35px;
    top: 20px;
    right: 20px;
    cursor: pointer;
  }
</style>

<div class="popup-overlay" id="popupOverlay">
  <div class="popup-content">
    <span class="close-button close-popup-btn">&times;</span>
    <p style="font-size:20pt"><b>Citation</b></p>
    <div id="citation_holder"></div>
    <br>
    <br>
    <pre id="citationbib_holder">{{post.citationbib}}</pre>
  </div>
</div>

<br>
<!-- Quick Links (centered, wrapping, separated) -->

<div style="text-align:center; margin: 20px 0;">
  <ul style="
      list-style: none; 
      padding: 0; 
      margin: 0;
      /* Use inline-flex or flex to keep items on one row until wrapping */
      display: inline-flex; 
      flex-wrap: wrap; 
      gap: 1em; 
      justify-content: center;
    ">
    <li><a href="#selected-publication">Publication</a></li>
    <li>|</li>
    <li><a href="#selected-presentation">Presentation</a></li>
    <li>|</li>
    <li><a href="#education">Education</a></li>
    <li>|</li>
    <li><a href="#experience">Experience</a></li>
    <li>|</li>
    <li><a href="#honor-fellowship">Honor & Fellowship</a></li>
    <li>|</li>
    <li><a href="#open-source">Open-Source Software</a></li>
    <li>|</li>
    <li><a href="#side-projects">Side Projects</a></li>
    <li>|</li>
    <li><a href="#teaching">Teaching</a></li>
    <li>|</li>
    <li><a href="#service">Service</a></li>
  </ul>
</div>
<br>


<h2 class="page__title" id="selected-publication" style="font-size:19pt;"><i class="fa fa-book"></i> &nbsp;  <a href="https://khchao.com/publications/" style="color:#4A4F53; text-decoration: none;">Selected Publication</a></h2>
  <ul>
    <li><b>Kuan-Hao Chao*</b>, Jakob M. Heinz, Celine Hoh, Alan Mao, Mihaela Pertea, Steven L. Salzberg* (2025) <a target="_blank" href="https://doi.org/10.1101/gr.279620.124" style="color:#4A4F53">Combining DNA and protein alignments to improve genome annotation with LiftOn</a>, <i><b>Genome Research</b></i>
    </li>
    <li><b>Kuan-Hao Chao*</b>, Alan Mao, Steven L. Salzberg, Mihaela Pertea* (2024). <a target="_blank"  href="https://doi.org/10.1186/s13059-024-03379-4" style="color:#4A4F53">Splam: a deep-learning-based splice site predictor that improves spliced alignments</a>, <i><b>Genome Biology</b></i>
    </li>
    <li><b>Kuan-Hao Chao*</b>, K. Barton, S. Palmer, and R. Lanfear* (2021). <a target="_blank"  href="https://doi.org/10.1093/gbe/evab028" style="color:#4A4F53">sangeranalyseR: simple and interactive processing of Sanger sequencing data in R</a>, <i><b>Genome Biology and Evolution</b></i>
    </li>
    <li><b>Kuan-Hao Chao*</b>, A.V. Zimin, M. Pertea, S.L. Salzberg* (2023). <a target="_blank"  href="https://doi.org/10.1093/g3journal/jkac321" style="color:#4A4F53">The first gapless, reference-quality, fully annotated genome from a Southern Han Chinese individual</a>, <i><b>G3: Genes, Genomes, Genetics</b></i>
    </li>
    <li><b>Kuan-Hao Chao*<sup>†</sup></b>, Pei-Wei Chen<sup>†</sup>, Sanjit A. Seshia, Ben Langmead* (2023). <a target="_blank"  href="https://doi.org/10.1016/j.isci.2023.107402" style="color:#4A4F53">WGT: Tools and algorithms for recognizing, visualizing and generating Wheeler graphs</a>, <i><b>iScience</b></i>
    </li>
  </ul>
  <b style="padding-left:18px;"><i class="fa fa-chevron-circle-right" aria-hidden="true"></i> <a href="https://khchao.com/publications/" style="color:#4A4F53; text-decoration: none;"> &nbsp; more ...</a></b>
<!-- </div> -->

<br>

<h2 class="page__title" id="selected-presentation" style="font-size:19pt"> <i class="fa fa-bookmark"></i> &nbsp; <a href="https://khchao.com/presentations/" style="color:#4A4F53; text-decoration: none;">Selected Presentation</a></h2>
  <ul>
    <li><b>JHU Joint Biostats-Genomics Lab Meeting Talk</b>, <i>Baltimore, MD, Jan 2025</i>, <a href="https://youtu.be/MvpYQYQvZ0U" target="_blank">Video</a>, <a href="https://storage.googleapis.com/storage.khchao.com/slides/JHU_joint_lab_meeting_2025.pdf" target="_blank">Slides</a></li>
    <li><b>Calico internship 1-hour Talk</b>, <a href="https://www.calicolabs.com/" target="_blank">Calico</a>, <i>South San Francisco, CA, August 2024</i>, <a href="https://storage.googleapis.com/storage.khchao.com/slides/Calico_project_showcase_2024_0821.pdf" target="_blank">Slides</a>, <a href="https://khchao.com/images/calico_intern_talk.png" target="_blank">Photo</a></li>
    <li><b>Invited Google Deep Dive 1-hour Talk</b>, <a href="https://health.google/" target="_blank">Google Health</a>, <i>Virtual & Mountain View, CA, August 2024</i>, <a href="https://storage.cloud.google.com/storage.khchao.com/slides/Google_Deep_Dive_2024_0806.pdf" target="_blank">Slides</a>, <a href="https://drive.google.com/file/d/1xA0ln9r1xWXX8gYLqVgowaPpthOb6eGo/view?usp=drive_link" target="_blank">Video [Google internal only]</a></li>
    <li><b>ISMB General Computational COSI Talk</b>, International Conference on Intelligent Systems for Molecular Biology, <i>Montréal, Canada, July 2024</i>, <a href="https://storage.cloud.google.com/storage.khchao.com/slides/ISMB_talk_2024.pdf" target="_blank">Slides</a>, <a href="https://youtu.be/MyWwUzjIBVk" target="_blank">Video coming soon</a></li>
    <li><b>JHU Joint Biostats-Genomics Lab Meeting Talk</b>, <i>Baltimore, MD, May 2024</i>, <a href="https://youtu.be/MyWwUzjIBVk" target="_blank">Video</a>, <a href="https://storage.googleapis.com/storage.khchao.com/slides/joint_lab_meeting_slides.pdf" target="_blank">Slides</a></li>
    <li><b>RECOMB-seq Talk</b>, Research in Computational Molecular Biology on Biological Sequence Analysis, <i>Cambridge, USA, April 2024</i>, <a href="https://storage.cloud.google.com/storage.khchao.com/slides/RECOMB-Seq_talk_2024.pdf" target="_blank">Slides</a></li>
    <li><b>RECOMB-seq Proceeding Talk</b>, Research in Computational Molecular Biology on Biological Sequence Analysis, <i>Istanbul, Türkiye, April 2023</i>, <a href="https://www.youtube.com/watch?v=TkX9S024Dk8&ab_channel=RECOMBConferenceSeries" target="_blank">Video</a>, <a href="https://storage.googleapis.com/storage.khchao.com/slides/RECOMB-Seq_talk_2023_WGT.pdf" target="_blank">Slides</a></li>
    <li><b>ISMB/ECCB Poster</b>, Intelligent Systems for Molecular Biology / European Conference on Computational Biology 2023, <i>Lyon, France, July 2023</i>, <a href="https://storage.googleapis.com/storage.khchao.com/JHU%20PhD/ISMB-ECCB2023/splam_poster_ismb.pdf" target="_blank">Link</a></li>
  </ul>
  <b style="padding-left:18px;"><i class="fa fa-chevron-circle-right" aria-hidden="true"></i> <a href="https://khchao.com/presentations/" style="color:#4A4F53; text-decoration: none;"> &nbsp; more ...</a></b>

<br>

<h2 class="page__title" id="education" style="font-size:19pt"> <i class="fa fa-graduation-cap"></i> &nbsp; <a href="https://khchao.com/cv/" style="color:#4A4F53; text-decoration: none;">Education</a></h2>
  <ul>
    <li>Ph.D. Candidate in <a target="_blank"  href="https://www.cs.jhu.edu/" style="color:#4A4F53">Computer Science</a>, <a target="_blank"  href="https://www.jhu.edu/" style="color:#002D72"><b>Johns Hopkins University</b></a>, <i>Sep/2021 - Present</i></li>
    <li>M.S.E. in <a target="_blank"  href="https://www.cs.jhu.edu/" style="color:#4A4F53">Computer Science</a>, <a target="_blank"  href="https://www.jhu.edu/" style="color:#002D72"><b>Johns Hopkins University</b></a>, <i>Sep/2021 - May/2023</i></li>
    <li>B.S. in <a target="_blank"  href="https://eecs.ntu.edu.tw/?locale=en" style="color:#4A4F53">Electrical Engineering</a>, <a target="_blank"  href="https://www.ntu.edu.tw/english/" style="color:#783c3c"><b>National Taiwan University</b></a>, <i>Sep/2016 - Jan/2021</i></li>
  </ul>
<br>

<h2 class="page__title" id="experience" style="font-size:19pt"> <i class="fa fa-briefcase"></i> &nbsp; <a href="https://khchao.com/cv/" style="color:#4A4F53; text-decoration: none;">Experience</a></h2>
  <ul>
    <li>Genomic Machine Learning Research Intern, <a target="_blank"  href="https://www.davidrkelley.com/" style="color:#4A4F53">Kelley Lab</a>, <a target="_blank"  href="https://www.calicolabs.com/" style="color: #28bc54"><b>Calico</b></a>, <i>May/2024 - Aug/2024</i></li>
    <li>Research Assistant, <a target="_blank"  href="https://www.iis.sinica.edu.tw/en/index.html" style="color:#4A4F53">Institute of Information Science</a>, <a target="_blank"  href="https://www.sinica.edu.tw/en" style="color: #08447c"><b>Academia Sinica</b></a>, <i>Jul/2020 - Jan/2021</i></li>
    <li>Research Student, <a target="_blank"  href="https://biology.anu.edu.au/" style="color:#4A4F53">Research School of Biology</a>, <a target="_blank"  href="https://www.anu.edu.au/" style="color:#c0842c"><b>The Australian National University</b></a>, <i>Jul/2019 - Jun/2020</i></li>
    <li>Research Student, <a target="_blank"  href="http://www.cgm.ntu.edu.tw/web/index/index.jsp?lang=en" style="color:#4A4F53">Centers of Genomic and Precision Medicine</a>, <a target="_blank"  href="https://www.ntu.edu.tw/english/" style="color:#783c3c"><b>National Taiwan University</b></a>, <i>Aug/2018 - Jul/2019</i></li>
  </ul>
<br>

<h2 class="page__title" id="honor-fellowship" style="font-size:19pt"> <i class="fa fa-briefcase"></i> &nbsp; <a href="https://khchao.com/cv/" style="color:#4A4F53; text-decoration: none;">Honor & Fellowship</a></h2>
  <ul>
    <li>Research highlight by JHU <a target="_blank"  href="https://hub.jhu.edu/2024/12/11/splam-pinpoints-gene-splicing/" style="color:#4A4F53">HUB</a>, <a target="_blank"  href="https://engineering.jhu.edu/news/new-ai-tool-pinpoints-gene-splicing-with-unmatched-precision/" style="color:#4A4F53">Whiting School of Engineering</a> and <a target="_blank"  href="https://www.cs.jhu.edu/news/new-ai-tool-pinpoints-gene-splicing-with-unmatched-precision/" style="color:#4A4F53">CS Department</a> [<a href='https://hub.jhu.edu/2024/12/11/splam-pinpoints-gene-splicing/' target='_blank'>article</a>], <i>2024</i></li>
    <li><a target="_blank"  href="https://www.arch.jhu.edu/news-events/all/robbins-award/" style="color:#4A4F53">Mark O. Robbins Prize</a> awarded by Advanced Research Computing at Hopkins (ARCH) [<a href='https://www.cs.jhu.edu/news/phd-student-kuan-hao-chao-wins-mark-o-robbins-prize-in-high-performance-computing/' target='_blank'>article</a>], <i>2024</i></li>
    <li><a target="_blank"  href="https://engineering.jhu.edu/news/the-human-genome-is-biased-but-rearranging-it-can-help/" style="color:#4A4F53">Research highlight</a> by JHU Whiting School of Engineering and CS Department, <i>2024</i></li>
    <li>Best Poster Award, <a target="_blank"  href="https://bioc2021.bioconductor.org/" style="color:#4A4F53">Bioconductor Conference (Bioc2021)</a>, <i>2021</i></li>
    <li>College Student Research Fellowship awarded by <a target="_blank"  href="https://www.nstc.gov.tw/?l=en" style="color:#4A4F53">Taiwan Ministry of Science and Technology</a>, <i>2019</i></li>
  </ul>
<br>

<h2 class="page__title" id="open-source" style="font-size:19pt;"><i class="fa fa-laptop"></i> &nbsp;  <a href="https://github.com/Kuanhao-Chao" style="color:#4A4F53; text-decoration: none;">Selected open-source software</a></h2>
<!-- <div style="margin-left:20px; margin-top:30px; pointer-events: all;
z-index:100;"> -->
  <ul>
    <li><a target="_blank"  href="https://github.com/Kuanhao-Chao/splam" style="color:#4A4F53">Splam</a>, splice site predictor &emsp; <a href="https://opensource.org/licenses/MIT" target="_blank"><img src="https://img.shields.io/badge/License-MIT-yellow.svg"></a> <a href="https://github.com/Kuanhao-Chao/splam" target="_blank" class="btn btn-outline-primary btn-page-header btn-sm" style="text-decoration: none">Code</a> <a href="https://ccb.jhu.edu/splam/" target="_blank" class="btn btn-outline-primary btn-page-header btn-sm" style="text-decoration: none">Documentation</a> <a href="https://storage.googleapis.com/storage.khchao.com/JHU%20PhD/ISMB-ECCB2023/splam_poster_ismb.pdf" target="_blank" class="btn btn-outline-primary btn-page-header btn-sm" style="text-decoration: none">Poster</a> <a href="https://www.biorxiv.org/content/10.1101/2023.07.27.550754v2.full.pdf" target="_blank" class="btn btn-outline-primary btn-page-header btn-sm" style="text-decoration: none">Paper</a> <a id="test" class="btn btn-outline-primary btn-page-header btn-sm show-popup-btn" style="text-decoration: none" onclick="dosomething('<b style=color:#ad0000>Kuan-Hao Chao*</b>, Alan Mao, Steven L Salzberg, Mihaela Pertea* (2022). Splam: a deep-learning-based splice site predictor that improves spliced alignments, <i><b>bioRxiv</b></i>, <a href=https://doi.org/10.1101/2023.07.27.550754>https://doi.org/10.1101/2023.07.27.550754</a></div>', '@article{chao2023splam,\n \ttitle={Splam: a deep-learning-based splice site predictor that improves spliced alignments},\n \tauthor={Chao, Kuan-Hao and Mao, Alan and Salzberg, Steven L and Pertea, Mihaela},\n \tjournal={bioRxiv},\n \tpages={2023--07},\n \tyear={2023},\n \tpublisher={Cold Spring Harbor Laboratory}\n }')">Cite</a>
    </li>
    <li><a target="_blank"  href="https://ccb.jhu.edu/lifton/" style="color:#4A4F53">LiftOn</a>, annotation lift-over tool &emsp; <a href="https://www.gnu.org/licenses/gpl-3.0.en.html" target="_blank"><img src="https://img.shields.io/badge/License-GPLv3-green.svg"></a> <a href="https://github.com/Kuanhao-Chao/LiftOn" target="_blank" class="btn btn-outline-primary btn-page-header btn-sm" style="text-decoration: none">Code</a> <a href="https://ccb.jhu.edu/lifton/" target="_blank" class="btn btn-outline-primary btn-page-header btn-sm" style="text-decoration: none">Documentation</a> <a href="https://ccb.jhu.edu/lifton/" target="_blank" class="btn btn-outline-primary btn-page-header btn-sm" style="text-decoration: none">Paper</a>
    </li>
    <li><a target="_blank"  href="https://github.com/roblanf/sangeranalyseR" style="color:#4A4F53">sangeranalyseR</a>, R package for analyzing Sanger sequence &emsp; <a href="https://opensource.org/licenses/MIT" target="_blank"><img src="https://img.shields.io/badge/License-MIT-yellow.svg"></a> <a href="https://github.com/roblanf/sangeranalyseR" target="_blank" class="btn btn-outline-primary btn-page-header btn-sm" style="text-decoration: none">Code</a> <a href="https://sangeranalyser.readthedocs.io/en/latest/" target="_blank" class="btn btn-outline-primary btn-page-header btn-sm" style="text-decoration: none">Documentation</a> <a href="https://storage.googleapis.com/storage.khchao.com/JHU%20PhD/Bioc2021/sangeranalyseR_poster.pdf" target="_blank" class="btn btn-outline-primary btn-page-header btn-sm" style="text-decoration: none">Poster</a> <a href="https://doi.org/10.1093/gbe/evab028" target="_blank" class="btn btn-outline-primary btn-page-header btn-sm" style="text-decoration: none">Paper</a> <a id="test" class="btn btn-outline-primary btn-page-header btn-sm show-popup-btn" style="text-decoration: none" onclick="dosomething('<br><b style=color:#ad0000>Kuan-Hao Chao*</b>, K. Barton, S. Palmer, and R. Lanfear* (2021). sangeranalyseR&amp;#58 simple and interactive processing of Sanger sequencing data in R, <i><b>Genome Biology and Evolution</b></i>, Volume 13, Issue 3, March 2021, evab028, <a href=https://doi.org/10.1093/gbe/evab028>https://doi.org/10.1093/gbe/evab028</a>', '@article{chao2021sangeranalyser,\n \ttitle={sangeranalyseR: simple and interactive processing of Sanger sequencing data in R},\n \tauthor={Chao, Kuan-Hao and Barton, Kirston and Palmer, Sarah and Lanfear, Robert},\n \tjournal={Genome Biology and Evolution},\n \tvolume={13},\n \tnumber={3},\n \tpages={evab028},\n \tyear={2021},\n \tpublisher={Oxford University Press}\n }')">Cite</a>
    </li>
    <li><a target="_blank"  href="https://github.com/Kuanhao-Chao/Wheeler_Graph_Toolkit" style="color:#4A4F53">Wheele Graph Toolkit</a> &emsp; <a href="https://opensource.org/licenses/MIT" target="_blank"><img src="https://img.shields.io/badge/License-MIT-yellow.svg"></a> <a href="https://github.com/Kuanhao-Chao/Wheeler_Graph_Toolkit" target="_blank" class="btn btn-outline-primary btn-page-header btn-sm" style="text-decoration: none">Code</a> <a href="https://storage.googleapis.com/storage.khchao.com/JHU%20PhD/RECOMB2023/WGT_poster.pdf" target="_blank" class="btn btn-outline-primary btn-page-header btn-sm" style="text-decoration: none">Poster</a> <a href="https://doi.org/10.1016/j.isci.2023.107402" target="_blank" class="btn btn-outline-primary btn-page-header btn-sm" style="text-decoration: none">Paper</a> <a id="test" class="btn btn-outline-primary btn-page-header btn-sm show-popup-btn" style="text-decoration: none" onclick="dosomething('<b style=color:#ad0000>Kuan-Hao Chao*<sup>†</sup></b>, Pei-Wei Chen<sup>†</sup>, Sanjit A. Seshia, Ben Langmead* (2022). WGT&amp;#58 Tools and algorithms for recognizing, visualizing and generating Wheeler graphs, <i><b>bioRxiv</b></i>, <a href=https://doi.org/10.1101/2022.10.15.512390>https://doi.org/10.1101/2022.10.15.512390</a>', '@article{chao2023splam,\n \ttitle={WGT: Tools and algorithms for recognizing, visualizing, and generating Wheeler graphs},\n \tauthor={Chao, Kuan-Hao and Chen, Pei-Wei and Seshia, Sanjit A. and Langmead, Ben},\n \tjournal={iScience},\n \tvolume={26},\n \tnumber={8},\n \tyear={2023},\n \tpublisher={Elsevier}\n }')">Cite</a>
    </li>
  </ul>
  <b style="padding-left:18px;"><i class="fa fa-chevron-circle-right" aria-hidden="true"></i> <a href="https://github.com/Kuanhao-Chao" style="color:#4A4F53; text-decoration: none;"> &nbsp; more ...</a></b>
<!-- </div> -->

<br>

<h2 class="page__title" id="side-projects" style="font-size:19pt;"><i class="fa fa-book"></i> &nbsp;  <a href="https://khchao.com/projects/" style="color:#4A4F53; text-decoration: none;">Side Projects</a></h2>
<!-- <div style="margin-left:20px; margin-top:30px; pointer-events: all;
z-index:100;"> -->
  <ul>
    <li><a target="_blank"  href="https://khchao.com/projects/games/biobaby" style="color:#4A4F53">Biobaby</a>, Unity WebGL game, <a href="https://storage.googleapis.com/storage.khchao.com/biobaby/index.html" class="btn btn-outline-primary btn-page-header btn-sm" style="text-decoration: none" target="_blank">▶️ Play it now!</a>
    </li>
    <li><a target="_blank"  href="https://khchao.com/projects/games/flappy_penguin" style="color:#4A4F53">Flappy penguin</a>, Unity WebGL game, <a href="https://storage.googleapis.com/storage.khchao.com/flappy_penguin/index.html" class="btn btn-outline-primary btn-page-header btn-sm" style="text-decoration: none" target="_blank">▶️ Play it now!</a>
    </li>
    <li><a target="_blank"  href="https://khchao.com/projects/games/tanks_fire" style="color:#4A4F53">Tank fire</a>, Unity WebGL game, <a href="https://storage.googleapis.com/storage.khchao.com/tanks_fire/index.html" class="btn btn-outline-primary btn-page-header btn-sm" style="text-decoration: none" target="_blank">▶️ Play it now!</a>
    </li>
  </ul>
  <b style="padding-left:18px;"><i class="fa fa-chevron-circle-right" aria-hidden="true"></i> <a href="https://khchao.com/projects/" style="color:#4A4F53; text-decoration: none;"> &nbsp; more ...</a></b>
<!-- </div> -->

<br>

<h2 class="page__title" id="teaching" style="font-size:19pt"> <i class="fa fa-user"></i> &nbsp; <a href="https://khchao.com/teaching/" style="color:#4A4F53; text-decoration: none;">Teaching</a></h2>
<ul>
  <li>Johns Hopkins University
    <ul>
      <li>EN.580.458 / 658 Computing the Transcriptome, Teaching assistant, Spring 2023</li>
    </ul>
  </li>

  <li>National Taiwan University
    <ul>
      <li>CSX 4001 Data Science Programming, Teaching assistant, Spring 2019</li>
      <li>EE 1006 Cornerstone EECS Design and Implementation, Teaching assistant, Fall 2018</li>
    </ul>
  </li>
</ul>
<b style="padding-left:18px;"><i class="fa fa-chevron-circle-right" aria-hidden="true"></i> <a href="https://khchao.com/teaching/" style="color:#4A4F53; text-decoration: none;"> &nbsp; more ...</a></b>


<br>

<h2 class="page__title" id="service" style="font-size:19pt"> <i class="fa fa-list"></i> &nbsp; Service</h2>
<ul>
  <li>Founder and Organizer
    <ul>
      <li>
          Johns Hopkins Deep Learning + Genomics Study Group, <i>2024 - Present</i> <a href="https://drive.google.com/file/d/1E6Is-48GBmqK98Qh7FeQc8OEtGn4oN-A/view?usp=sharing" target="_blank" class="btn btn-outline-primary btn-page-header btn-sm" style="text-decoration: none">Slides</a>, <a href="https://drive.google.com/drive/folders/15yCXZd5sCuCwPULc3b7p8X5OK8XqbdNp?usp=drive_link" target="_blank" class="btn btn-outline-primary btn-page-header btn-sm" style="text-decoration: none">Repository</a>
      </li>
    </ul>
  </li>

  <li>Reviewer
    <ul>
      <li>
        Genome Research: 2024
      </li>
      <li>G3: Genes, Genomes, Genetics: 2024</li>
      <li>BMC Bioinformatics: 2024</li>
      <li>International Society for Computational Biology (ISCB): 2024</li>
      <li>Chromatographia: 2023</li>
    </ul>
  </li>

  <li>Sub-reviewer
    <ul>
      <li>Genome Research: 2024</li>
      <li>Nature Machine Intelligence: 2023</li>
      <li>G3: Genes, Genomes, Genetics: 2022</li>
    </ul>
  </li>
</ul>

<br>

<!-- <h2 class="page__title" style="font-size:19pt"> 🧑🏻‍💻 &nbsp; Education</h2>
<br> -->

<!-- <hr>
<div style="width: 80%; text-align: center; margin:auto;">
<a class="twitter-timeline" data-lang="en" data-width="100%" data-height="500" data-theme="light" href="https://twitter.com/KuanHaoChao?ref_src=twsrc%5Etfw" style="align: center">Tweets by KuanHaoChao</a> <script async src="https://platform.twitter.com/widgets.js" charset="utf-8"></script>
</div>
<br> -->

<!-- <div style="text-align: center; pointer-events: all; z-index:100;">
  <a target="_blank"  href="https://www.ntu.edu.tw/english/index.html">
    <img src="/images/NTU.png" style="height:160px; width: 160px; margin: 10px">
  </a>
  <a target="_blank"  href="https://web.ee.ntu.edu.tw/eng/index.php">
    <img src="/images/NTU_EECS.png" style="height:160px; width: 160px; margin: 10px">
  </a>
  <a target="_blank"  href="https://www.sinica.edu.tw/en">
    <img src="/images/AS_logo.png" style="height:160px; width: 160px; margin: 10px">
  </a>
  <a target="_blank"  href="https://www.iis.sinica.edu.tw/index_en.html" >
    <img src="/images/iis_logo.png" style="height:160px; width: 160px; margin: 10px">
  </a>
  <a target="_blank"  href="https://www.anu.edu.au/">
    <img src="/images/anu_logo_small.png" style="height:160px; width: 160px; margin: 10px">
  </a>
  <a target="_blank"  href="http://www.robertlanfear.com/">
    <img src="/images/ANU_Biology.jpg" style="height:160px; width: 160px; margin: 10px">
  </a>
  <a target="_blank"  href="https://bits.iis.sinica.edu.tw/">
    <img src="/images/BIOIT.png" style="height:160px; width: 160px; margin: 10px">
  </a>
  <a target="_blank"  href="http://www.cgm.ntu.edu.tw/web/index/index.jsp?lang=en">
    <img src="/images/CGM_LOGO.png" style="height:160px; width: 160px; margin: 10px">
  </a>
</div> -->
<hr>
<br><br>

<script type="text/javascript" id="clustrmaps" src="//clustrmaps.com/map_v2.js?d=SjhWAwqGLnloAclnIVxG6gxPA8DEX2yyW2VQlroVDWw&cl=ffffff&w=a" style="pointer-events: all; z-index:100;"></script>
<script>
  initComparisons();
</script>
<hr>
<br><br>


<script>
  console.log("button clicked!");
  const showPopupBtns = document.querySelectorAll('.show-popup-btn');
  const closePopupBtns = document.querySelectorAll('.close-popup-btn');
  const popupOverlay = document.getElementById('popupOverlay');

  function dosomething(citation, citationbib){
    console.log(citation);
    console.log(citationbib);
    var divElement = document.getElementById("citation_holder");
    divElement.innerHTML = citation;
    console.log(divElement);

    var divElement = document.getElementById("citationbib_holder");
    divElement.innerHTML = citationbib;
    console.log(divElement);
  }

  showPopupBtns.forEach(button => {
  button.addEventListener('click', () => {
  popupOverlay.style.display = 'flex';
  console.log(popupOverlay);
  });
  });

  closePopupBtns.forEach(button => {
  button.addEventListener('click', () => {
  popupOverlay.style.display = 'none';
  console.log(popupOverlay)
  });
  });
</script>
