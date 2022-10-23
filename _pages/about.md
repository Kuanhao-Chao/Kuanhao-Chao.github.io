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
      <div data-vimg="<img class='pic' src='{{base_path}}/images/JHU_small.png' width='70px'>" data-vtdate="<i class='fa fa-calendar' aria-hidden='true'></i> Aug 2021 - Present">
          <div class="row">
            <div class="column_img"><img class="pic" src="{{base_path}}/images/JHU_small.png" width="70px"></div>
            <div class="column_title"><h3>Salzberg & Pertea Lab, Center for Computational Biology, JHU </h3></div>
          </div>
          <p>
          <ul>
            <li>Building a multi-sample assembler upon StringTie aming to construct a more
precise gene catalog. <a href="https://github.com/Kuanhao-Chao/multiStringTie" target="_blank"><i class="fab fa-github"> C++</i></a> | <a href="{{base_path}}/researches/2022-10-20-multistringtie" target="_blank"><i class="fa fa-television"></i></a> </li>
            <li>Improving Liftoff to achieve higher cross-species lift-over accuracy. <a href="https://github.com/Kuanhao-Chao/Liftoff" target="_blank"><i class="fab fa-github"></i> <i class="fab fa-python"></i></a> </li>
            <li>Assembled Han1, the first gapless Southern Han Chinese individual genome <a href="https://github.com/JHUCCB/ChineseHanSouthGenome" target="_blank"><i class="fab fa-github"></i></a> | <a href="https://www.ncbi.nlm.nih.gov/assembly/GCA_024586135.1" target="_blank"><i>Han1</i><i class="fa fa-database"></i></a> </li>
            <li>Conducted the first-ever gene content comparison between two fully annotated individuals, Han1 and T2T-CHM13.</li>
            <strong><a href="https://doi.org/10.1101/2022.08.08.503226" target="_blank">Han1 paper <i class="fa fa-book"></i></a> (Chao et.al.)</strong>
          </ul>
          </p>
      </div>
      <div data-vtdate="<i class='fa fa-calendar' aria-hidden='true'></i> Nov 2021 - Nov 2022">
          <div class="row">
            <div class="column_img">
              <img src="{{base_path}}/images/JHU_small.png" width="60px" height="60px" style="display:block; vertical-align:middle;">
              <img src="{{base_path}}/images/UC_berkeley.png" width="60px" height="60px" style="display:block; vertical-align:middle;">
            </div>
            <!-- <div class="column_img img-comp-container">
              <div class="img-comp-container">
                <div class="img-comp-img">
                </div>
                <div class="img-comp-img img-comp-overlay">
                </div>
            </div> -->
            <div class="column_title"><h3>Langmead Lab, Department of Computer Science, JHU <br> <small style="line-height: 200%">collab with </small><br> Seshia Lab,  EECS, University of California, Berkeley</h3></div>
          </div>
          <p>
            <ul>
              <li>Developing algorithms to improve the graph-based sequence indexing aiming to apply them to the pan-genome graph.</li>
              <li>Developed the first Wheeler graph toolkit, WGT, to generate, recognize, and visualize Wheeler graph. <a href="https://github.com/Kuanhao-Chao/Wheeler_Graph_Toolkit" target="_blank"><i class="fab fa-github"> C++</i></a> </li> 
              <li>Proposed a fast algorithm, Wheelie <img src="{{base_path}}/images/wheelie.png" width="35px">, making the NP-complete Wheeler Graph recognition problem solvable in practice.</li>
              <strong><a href="https://www.biorxiv.org/content/10.1101/2022.10.15.512390v2.abstract" target="_blank">WGT paper <i class="fa fa-book"></i></a> (Chao et.al.) </strong>
            </ul>
          </p>
      </div>
      <div data-vtdate="<i class='fa fa-calendar' aria-hidden='true'></i> Aug 2020 - Feb 2021">
          <div class="row">
            <div class="column_img"><img class="pic" src="{{base_path}}/images/iis_logo.png" width="70px"></div>
            <div class="column_title"><h3>HK Tsai Lab, Institute of Information Science, Academia Sinica</h3></div>
          </div>
          <p>
            <ul>
              <li>Developed SPIFFED by applying a convolutional neural network to improve current tools on predicting protein-protein interactions using protein co-elution profiles. <a href="https://github.com/bio-it-station/SPIFFED" target="_blank"><i class="fab fa-github"></i> <i class="fab fa-python"></i></a></li>
            </ul>
          </p> 
      </div>
      <div data-vtdate="<i class='fa fa-calendar' aria-hidden='true'></i> Jul 2019 - Jul 2020">
          <div class="row">
            <div class="column_img"><img class="pic" src="{{base_path}}/images/anu_logo_small.png" width="70px"></div>
            <div class="column_title"><h3>Lanfear Lab, Division of Ecology and Evolution, Research School of Biology, ANU</h3></div>
          </div>
          <p>
            <ul>
              <li>Developed a bioconductor R package, sangeranalyseR, to democratize sanger sequencing data analysis in R. <a href="https://github.com/roblanf/sangeranalyseR" target="_blank"><i class="fab fa-github"></i> <i class="fab fa-r-project"></i></a></li>
              <strong><a href="https://doi.org/10.1093/gbe/evab028" target="_blank">sangeranalyseR paper <i class="fa fa-book"></i></a> (Chao et.al.)</strong>
            </ul>
          </p> 
      </div>
      <div data-vtdate="<i class='fa fa-calendar' aria-hidden='true'></i> Jan 2018 - Jul 2019">
          <div class="row">
            <div class="column_img"><img class="pic" src="{{base_path}}/images/NTU.png" width="70px"></div>
            <div class="column_title"><h3>Bioinformatics Core Lab, Centers of Genomic and Precision Medicine, NTU</h3></div>
          </div>
          <p>
            <ul>
              <li>Conducted differential gene expression analysis and pathway enrichment analysis using RNA-Seq data.</li>
              <li>Developed a bioconductor R package to provide a robust pipeline to automate the standard two-group RNA-Seq
analysis in R. <a href="https://github.com/Kuanhao-Chao/RNASeqR" target="_blank"><i class="fab fa-github"></i> <i class="fab fa-r-project"></i></a></li>
              <strong><a href="doi: 10.1109/TCBB.2019.2956708" target="_blank">RNASeqR paper <i class="fab fa-python"></i></a> (Chao et.al.)</strong>
            </ul>
          </p> 
      </div>
  </div><!-- End vt2 -->
</div>

<hr>
<a class="twitter-timeline" data-lang="en" data-width="500" data-height="400" data-theme="light" href="https://twitter.com/KuanHaoChao?ref_src=twsrc%5Etfw">Tweets by KuanHaoChao</a> <script async src="https://platform.twitter.com/widgets.js" charset="utf-8"></script>
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