---
permalink: /
title: "🧑🏻‍💻 &nbsp; About me"
excerpt: "About me"
author_profile: true
redirect_from:
  - /about_me/
  - /about.html
---
{% include base_path %}

<div style="margin-left:20px; margin-top:30px; pointer-events: all;
z-index:100;">
  <p>
    I am a computer science Ph.D. student supervised by Dr. <a target="_blank"  href="https://scholar.google.com/citations?user=sUVeH-4AAAAJ&hl=en" style="color:#4A4F53">Steven Salzberg</a> and Dr. <a target="_blank"  href="https://scholar.google.com/citations?user=fKjqGyEAAAAJ&hl=en" style="color:#4A4F53">Mihaela Pertea</a> at <a target="_blank"  href="https://ccb.jhu.edu" style="color:#4A4F53">Center for Computational Biology</a>, <a target="_blank"  href="https://www.jhu.edu" style="color:#4A4F53">Johns Hopkins University</a>. I received my BS in <a target="_blank"  href="https://web.ee.ntu.edu.tw/eng/index.php" style="color:#4A4F53">Electrical Engineering</a> from <a target="_blank"  href="https://www.ntu.edu.tw/english/index.html" style="color:#4A4F53">National Taiwan University (NTU)</a>. In my senior year of college, I went on exchange to study at the <a target="_blank" href="https://cecs.anu.edu.au" style="color:#4A4F53">College of Engineering & Computer Science</a>, <a target="_blank"  href="https://www.anu.edu.au" style="color:#4A4F53">Australian National University (ANU)</a>.
  </p>

  <p>
    My research interests are genome assembly and transcriptome (RNA sequencing). I am also passionate about developing open source bioinformatics tools and designing algorithms. I have developed two <a target="_blank"  href="https://www.bioconductor.org" style="color:#4A4F53" >Bioconductor</a> R packages which are <a target="_blank"  href="https://bioconductor.org/packages/release/bioc/html/RNASeqR.html" style="color:#4A4F53" >RNASeqR</a> and <a target="_blank"  href="https://bioconductor.org/packages/release/bioc/html/sangeranalyseR.html" style="color:#4A4F53" >sangeranalyseR</a>. Fore more information, please visit my <a target="_blank"  href="https://kuanhao-chao.github.io/researches/" style="color:#2c508f"><b>research page 🔬</b></a>.
  </p>

</div>

<hr>
<br>

<div data-aos="fade-up" data-aos-duration="1500">
  <!-- <h2>Defining Dates</h2> -->
  <div id="myTimeline">
      <div data-vtdate="Aug 2021 - Present">
          <div class="row">
            <div class="column_img"><img class="pic" src="{{base_path}}/images/JHU_small.png" width="70"></div>
            <div class="column"><h3>Salzberg & Pertea Lab, Center for Computational Biology, JHU </h3></div>
          </div>
          <p>
          <ul>
            <li>Building a multi-sample assembler upon StringTie, the state-of-the-art transcriptome assembler, to construct a more
precise gene catalog by taking advantage of the complementarity and redundancy of multiple samples.</li>
            <li>Improving Liftoff by aligning transcriptome in the exon-level to improve the cross-species mapping accuracy.</li>
            <li>Assembled Han1, the first gapless Southern Han Chinese individual genome, using HG00621 PacBio HiFi reads and
Oxford Nanopore reads sequenced by Human Pangenome Reference Consortium (HPRC) guided by T2T-CHM13.</li>
            <li>Conducted the first-ever gene content comparison between two fully annotated individuals and investigated homozy-
gous mutations on Han1 compared to T2T-CHM13.</li>
          </ul>
          </p>
      </div>
      <div data-vtdate="Nov 2021 - Nov 2022">
          <div class="row">
            <div class="column_img">
            <div class="img-comp-container">
              <div class="img-comp-img">
                <img src="{{base_path}}/images/JHU_small.png" width="70">
              </div>
              <div class="img-comp-img img-comp-overlay">
                <img src="{{base_path}}/images/UC_berkeley.png" width="70">
              </div>
            </div>
            <!-- <img class="pic" src="{{base_path}}/images/JHU_small.png" width="70"> -->
            </div>
            <div class="column_title"><h3>Langmead Lab, Department of Computer Science, JHU (collab with Seshia Lab, UC Berkeley)</h3></div>
          </div>
          <p>
            <ul>
              <li>Developing algorithms to improve the graph-based sequence indexing and applying it to the pan-genome graph.</li>
              <li>Proposed a new algorithm combining a renaming heuristic with a Satisfiability Modulo Theory (SMT) to improve the
Gibney’s and Thankachan’s state-of-art exponential algorithm on solving the Wheeler Graph recognition problem.</li>
              <li>Improved the state-of-the-art G & T’s Wheeler graph recognition algorithm on all Wheeler Graphs with different
levels of hardness and made this NP complete problem solvable in practice.</li>
            </ul>
          </p>
      </div>
      <div data-vtdate="Aug 2020 - Feb 2021">
          <div class="row">
            <div class="column_img"><img class="pic" src="{{base_path}}/images/iis_logo.png" width="70"></div>
            <div class="column_title"><h3>HK Tsai Lab, Institute of Information Science, Academia Sinica</h3></div>
          </div>
          <p>
            <ul>
              <li>Developed a new software by applying a convolutional neural network to improve current state-of-the-art tools, EPIC
and PrInCE, on predicting protein-protein interactions (PPIs) using protein co-elution profiles</li>
            </ul>
          </p> 
      </div>
      <div data-vtdate="Jul 2019 - Jul 2020">
          <div class="row">
            <div class="column_img"><img class="pic" src="{{base_path}}/images/anu_logo_small.png" width="70"></div>
            <div class="column_title"><h3>Lanfear Lab, Division of Ecology and Evolution, ANU</h3></div>
          </div>
          <p>
            <ul>
              <li>Developed an open-source software to democratize sanger sequencing data analysis in R by providing features includ-
ing reads trimming, base calling, chromatogram plotting, mutliple sequence alignments, and phylogenetic analyses.</li>
            </ul>
          </p> 
      </div>
      <div data-vtdate="Jan 2018 - Jul 2019">
          <div class="row">
            <div class="column_img"><img class="pic" src="{{base_path}}/images/NTU.png" width="70"></div>
            <div class="column_title"><h3>Bioinformatics Core Lab, Centers of Genomic and Precision Medicine, NTU</h3></div>
          </div>
          <p>
            <ul>
              <li>Conducted differential gene expression analysis and pathway enrichment analysis using RNA-Seq data.</li>
              <li>Developed an open-source R package to provide a robust pipeline to automate the standard two-group RNA-Seq
analysis in R with several aligner and quantifier options for users to choose from.</li>
            </ul>
          </p> 
      </div>
  </div><!-- End vt2 -->
</div>

<hr>
<br>

<div style="text-align: center; pointer-events: all; z-index:100;">
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
</div>
<hr>
<br><br>

<script type="text/javascript" id="clustrmaps" src="//clustrmaps.com/map_v2.js?d=SjhWAwqGLnloAclnIVxG6gxPA8DEX2yyW2VQlroVDWw&cl=ffffff&w=a" style="pointer-events: all; z-index:100;"></script>
<script>
initComparisons();
</script>
<hr>
<br><br>