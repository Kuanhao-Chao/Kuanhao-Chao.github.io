---
layout: archive
title: ""
permalink: /cv/
author_profile: true
redirect_from:
  - /resume
---

{% include base_path %}
<link rel="stylesheet" href="{{ base_path }}/assets/css/nav_card.css"/>


<!-- The navigation menu -->
<div id="switch_cv" class="navbar">
  <a class="nav_cv_online active" href="#">Online CV</a>
  <a class="nav_cv_pdf" href="#">PDF CV</a>
</div>

<script src="{{ base_path }}/assets/js/nav_card.js"></script>


<br>

<div id="content_cv_online">
  <h1 style="margin-top: 8px; border-left: 8px solid #7b8287; background-color: #ededed; padding: 8px">&nbsp;🎓 &nbsp; Education</h1>

  <ul>
    <div class="{{ include.type | default: "list" }}__item">
      <article class="archive__item" itemscope itemtype="http://schema.org/CreativeWork">
        <li>
          <h3 itemprop="headline">B.S. in Taiwan, Department of Electrical Engineering, National Taiwan University</h3>
          <p class="page__meta"><b><i class="fas fa-clock" aria-hidden="true"></i> &nbsp;&nbsp;  {{ "2016-09-01" | date: '%B, %Y' }}  - {{ "2021-01-01" | date: '%B, %Y' }}</b></p>
        </li>
      </article>
    </div>

    <div class="{{ include.type | default: "list" }}__item">
      <article class="archive__item" itemscope itemtype="http://schema.org/CreativeWork">
        <li>
          <h3 itemprop="headline">Exchange in Australia, College of Engineering and Computer Science, The Australian National University</h3>
          <p class="page__meta"><b><i class="fas fa-clock" aria-hidden="true"></i> &nbsp;&nbsp;  {{ "2019-07-01" | date: '%B, %Y' }}  - {{ "2020-06-01" | date: '%B, %Y' }}</b></p>
        </li>
      </article>
    </div>
  </ul>

  <hr>

  <h1 style="margin-top: 8px; border-left: 8px solid #7b8287; background-color: #ededed; padding: 8px">&nbsp;📔 &nbsp; Publications</h1>
    <ul>{% for post in site.publications %}
      {% include archive-single-cv.html %}
    {% endfor %}</ul>

    <hr>

  <h1 style="margin-top: 8px; border-left: 8px solid #7b8287; background-color: #ededed; padding: 8px">&nbsp;🔬 &nbsp; Research Experience</h1>
    <ul>
      <div class="{{ include.type | default: "list" }}__item">
        <article class="archive__item" itemscope itemtype="http://schema.org/CreativeWork">
          <!-- <li> -->
            <h3 itemprop="headline"  style="padding: 7px; background-color:#f2f2f2; border-left: 5px solid #c4c4c4; margin-left:-10px;"> Research Assistant @ Institute of Information Science, Academia Sinica </h3>
            <p class="page__meta"><b><i class="fas fa-clock" aria-hidden="true"></i> &nbsp;&nbsp;  {{ "2020-07-01" | date: '%B, %Y' }}  - {{ "Present" | date: '%B, %Y' }}</b></p>
            <ul>{% for post in site.researches %}
              {%if post.research_position == "RA_IIS_AS" %}
                {% include archive-single-research-cv.html %}
              {% endif %}
            {% endfor %}</ul>
          <!-- </li> -->
        </article>
      </div>

      <div class="{{ include.type | default: "list" }}__item">
        <article class="archive__item" itemscope itemtype="http://schema.org/CreativeWork">
          <!-- <li> -->
            <h3 itemprop="headline"  style="padding: 7px; background-color:#f2f2f2; border-left: 5px solid #c4c4c4; margin-left:-10px;">Research Assistant @ Institute of Epidemiology and Preventive Medicine, National Taiwan University</h3>
            <p class="page__meta"><b><i class="fas fa-clock" aria-hidden="true"></i> &nbsp;&nbsp;  {{ "2019-07-01" | date: '%B, %Y' }}  - {{ "2020-06-01" | date: '%B, %Y' }}</b></p>
            <ul>{% for post in site.researches %}
              {%if post.research_position == "RA_IEPM_NTU" %}
                {% include archive-single-research-cv.html %}
              {% endif %}
            {% endfor %}</ul>
          <!-- </li> -->
        </article>
      </div>

      <div class="{{ include.type | default: "list" }}__item">
        <article class="archive__item" itemscope itemtype="http://schema.org/CreativeWork">
          <!-- <li> -->
            <h3 itemprop="headline"  style="padding: 7px; background-color:#f2f2f2; border-left: 5px solid #c4c4c4; margin-left:-10px;">Research Assistant @ Division of Ecology and Evolution, The Australian National University</h3>
            <p class="page__meta"><b><i class="fas fa-clock" aria-hidden="true"></i> &nbsp;&nbsp;  {{ "2019-07-01" | date: '%B, %Y' }}  - {{ "2020-06-01" | date: '%B, %Y' }}</b></p>
            <ul>{% for post in site.researches %}
              {%if post.research_position == "RA_RSB_ANU" %}
                {% include archive-single-research-cv.html %}
              {% endif %}
            {% endfor %}</ul>
          <!-- </li> -->
        </article>
      </div>

      <div class="{{ include.type | default: "list" }}__item">
        <article class="archive__item" itemscope itemtype="http://schema.org/CreativeWork">
          <!-- <li> -->
            <h3 itemprop="headline"  style="padding: 7px; background-color:#f2f2f2; border-left: 5px solid #c4c4c4; margin-left:-10px;">Undergraduate Research Student @ Center of Genomic and Precision Medicine, National Taiwan University</h3>
            <p class="page__meta"><b><i class="fas fa-clock" aria-hidden="true"></i> &nbsp;&nbsp;  {{ "2018-02-01" | date: '%B, %Y' }}  - {{ "2019-06-30" | date: '%B, %Y' }}</b></p>
            <ul>{% for post in site.researches %}
              {%if post.research_position == "URS_CGM_NTU" %}
                {% include archive-single-research-cv.html %}
              {% endif %}
            {% endfor %}</ul>
          <!-- </li> -->
        </article>
      </div>
    </ul>

  <hr>


  <h1 style="margin-top: 8px; border-left: 8px solid #7b8287; background-color: #ededed; padding: 8px">&nbsp;🎤 &nbsp; Talks & Exhibition</h1>
    <ul>{% for post in site.talks %}
      {% include archive-single-talk-cv.html %}
    {% endfor %}</ul>

    <hr>



  <h1 style="margin-top: 8px; border-left: 8px solid #7b8287; background-color: #ededed; padding: 8px">&nbsp;🏫 &nbsp; Teaching</h1>
    <ul>{% for post in site.teaching %}
      {% include archive-single-teaching-cv.html %}
    {% endfor %}</ul>

  <hr>

  <h1 style="margin-top: 8px; border-left: 8px solid #7b8287; background-color: #ededed; padding: 8px">&nbsp;💼 &nbsp; Internship</h1>
  <ul>{% for post in site.internship %}
    {% include archive-single-internship-cv.html %}
  {% endfor %}</ul>

  <hr>

  <h1 style="margin-top: 8px; border-left: 8px solid #7b8287; background-color: #ededed; padding: 8px">&nbsp;🏅&nbsp; Honors & Awards</h1>
  <ul>


    <div class="{{ include.type | default: "list" }}__item">
      <article class="archive__item" itemscope itemtype="http://schema.org/CreativeWork">
        <li>
        <h3 class="archive__item-title" itemprop="headline">
          <!-- style="margin-bottom: -13px" -->
          <!-- {% if post.link %}
            <a href="{{ post.link }}">{{ title }}</a> <a href="{{ base_path }}{{ post.url }}" rel="permalink"><i class="fa fa-link" aria-hidden="true" title="permalink"></i><span class="sr-only">Permalink</span></a>
          {% else %} -->
          <a href="/researches/2019-01-01-Bacteria-NGS" rel="permalink" style="color: #494E52">College Student Research Fellowship</a>
            <!-- <p style="color: #494E52">College Student Research Fellowship</p> -->
          <!-- {% endif %} -->
        </h3>
        <p class="page__meta"><b><i class="fas fa-clock" aria-hidden="true"></i> &nbsp;&nbsp;  {{ "2019-7-01" | date: '%B %d, %Y' }} - {{ "2020-02-29" | date: '%B %d, %Y' }}</b></p>
        <p class="archive__item-excerpt" itemprop="description">Fellowship from Taiwan Ministry of Science and Technology</p>
        </li>
      </article>
    </div>

    <div class="{{ include.type | default: "list" }}__item">
      <article class="archive__item" itemscope itemtype="http://schema.org/CreativeWork">
        <li>
        <h3 class="archive__item-title" itemprop="headline">
          <a href="/talks/2018-12-20-talk" rel="permalink" style="color: #494E52">Outstanding Research Prize &nbsp; (1<sup>st</sup> prize)</a>
            <!-- <p style="color: #494E52">Outstanding Research Prize (1st prize)</p> -->
        </h3>
        <p class="page__meta"><b><i class="fas fa-clock" aria-hidden="true"></i> &nbsp;&nbsp;  {{ "2018-12-15" | date: '%B %d, %Y' }}</b></p>
        <p class="archive__item-excerpt" itemprop="description">NTU Centers of Genomics and Precision Medicine Summer Research Contest (10 Cores Labs)</p>
        </li>
      </article>
    </div>

    <div class="{{ include.type | default: "list" }}__item">
      <article class="archive__item" itemscope itemtype="http://schema.org/CreativeWork">
        <li>
        <h3 class="archive__item-title" itemprop="headline">
          <a href="/talks/2017-09-12-exhibition" rel="permalink" style="color: #494E52">Elite Prize &nbsp; (1<sup>st</sup> prize)</a>
            <!-- <p style="color: #494E52">Elite Prize(1st prize)</p> -->
        </h3>
        <p class="page__meta"><b><i class="fas fa-clock" aria-hidden="true"></i> &nbsp;&nbsp;  {{ "2017-07-21" | date: '%B %d, %Y' }} - {{ "2017-07-23" | date: '%B %d, %Y' }}</b></p>
        <p class="archive__item-excerpt" itemprop="description">2017 HackNTU, one of the biggest nationwide Hackathon in Taiwan (451 people)</p>
        </li>
      </article>
    </div>
  </ul>

  <hr>

  <h1 style="margin-top: 8px; border-left: 8px solid #7b8287; background-color: #ededed; padding: 8px">&nbsp;🛠 &nbsp; Skills</h1>
  <ul>
    <li>
      Programming Languag <small style="margin-left:50px">Python / R / Java / C / C++</small>
    </li>
  </ul>
  <ul>
    <li> Programming Skill <small style="margin-left:87px">Keras, Pandas, Scikit-learn, Django/Flask, Git, R package, Android App, Web Development, Unity Game</small>
    </li>
  </ul>

  <hr>

  <h1 style="margin-top: 8px; border-left: 8px solid #7b8287; background-color: #ededed; padding: 8px">&nbsp;✉️ &nbsp; References</h1>
  <ul>{% for post in site.references %}
    {% include archive-single-reference-cv.html %}
  {% endfor %}</ul>
</div>


<div id="content_cv_pdf" style="display:none;">
  <a href="https://storage.googleapis.com/kuanhao.nctu.me/CV.pdf" target="_blan"><b> >> Download CV here << </b></a>
  <p align="center">
    <iframe src="https://storage.googleapis.com/kuanhao.nctu.me/CV.pdf" width="100%" height="1200" style="border:none;" scrolling="no"></iframe>
  </p>
</div>
