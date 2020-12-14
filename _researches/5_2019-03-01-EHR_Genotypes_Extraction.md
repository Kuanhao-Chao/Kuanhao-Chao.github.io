---
title: "Electronic Health Record (EHR) phenotypes & genotypes extraction"
collection: researches
type: "Research assistant"
permalink: /researches/2019-03-01-EHR_extraction
venue: "<a href='http://nuredu.mc.ntu.edu.tw/' style='color: inherit;' target='_blank'>College of Medicine AI team, National Taiwan University</a>"
start_date: 2019-03-01
end_date: 2019-06-30
location: "Taipei, Taiwan"
status: '<a style="text-decoration:none; color:orange;">In progress <i class="fa fa-spinner" aria-hidden="true"></i></a>'
image: "/images/EHR_cover.jpg"
superviser: '<a href="#" style="font-size: 12px; text-decoration:none; color:#4A4F53; border-style: solid; border-color:#d0a4fc; border-radius: 10px; background-color: #d0a4fc;">&nbsp; Yun-Cheng Tsai  &nbsp;</a>'
superviser_clean:
  - "Yun-Cheng Tsai"
research_position: "RA_CM_NTU"
research_clean: "EHR"
---

Wang Zhiming and I developed this text-mining website to help the NTU Medical Genie AI team to get the genotypes information. There are two main steps. In the first step, we used <a href="https://metamap.nlm.nih.gov/" target="_blank"> MetaMap</a> and <a href="http://bejerano.stanford.edu/clinphen/" target="_blank">Clinphen</a> to extract phenotype information from electronic health record (EHR); in the second step, we used <a href="http://phenolyzer.wglab.org/" target="_blank">Phenolyzer </a> and Variant Prioritizer to convert selected phenotypes to genotype information. The website was developed by Python Django framework.

We cooperated with Doctor <a href="https://scholars.lib.ntu.edu.tw/cris/rp/rp06704" target="_blank">Wuh-Liang ​​Hwu</a> who evalutated the extracted results to help us improve the phenotypes and genotypes selection accuracy.


<iframe src="https://docs.google.com/presentation/d/e/2PACX-1vTY4Y_eDRKSSSMSlbHBodROBF83znnw9xAkmblWFBTx_ZCHIfkBRS83EHizvztOi1gM3WGJaQz64E2O/embed?start=false&loop=false&delayms=3000" frameborder="0" width="100%" height="500" allowfullscreen="true" mozallowfullscreen="true" webkitallowfullscreen="true"></iframe>

---

<h2 style="color: #000f70; margin-left: -30px;"> <i class="fas fa-dot-circle" style="font-size:18px;"></i> &nbsp;&nbsp;Demo video </h2>

<div>
  <p> The video below shows the basic functions of this website. We input the EHR inside the text box and press the search button. The web server will run MetaMap and do natural-language processing (NLP) to extract phenotype infromation from the EHR. Six categories of phenotypes will be highlighted in different colors.
  </p>

  <iframe width="100%" height="65" src="https://www.youtube.com/embed/vwkrHTIIQ6Q" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>
</div>

---

<!-- <h2 style="color: #000f70; margin-left: -30px"> <i class="fas fa-dot-circle" style="font-size:18px;"></i> &nbsp;&nbsp;Demo video </h2>
<div style="margin-left: -15px">
  <p> The video below shows the basic function of this website. We input the EHR inside the text box and press the search button.
  </p>
  <iframe width="100%" height="315" src="https://www.youtube.com/embed/XlzoqvEM3JU" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"   allowfullscreen></iframe>
</div> -->


<h2 style="color: #000f70; margin-left: -30px"> <i class="fas fa-dot-circle" style="font-size:18px;"></i> &nbsp;&nbsp;Links </h2>

<div>
  <ul>
    <li><a href="http://140.112.30.198:8000/MetaMap/" target="_blank"><b>Website Entry</b></a></li>
    <li><a href="http://nuredu.mc.ntu.edu.tw/" target="_blank"><b>NTU Medical Genie website</b></a></li>
  </ul>
</div>

---
