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
          <li>
            <h3 itemprop="headline">Research Assistant @ Institute of Information Science, Academia Sinica </h3>
            <p class="page__meta"><b><i class="fas fa-clock" aria-hidden="true"></i> &nbsp;&nbsp;  {{ "2020-07-01" | date: '%B, %Y' }}  - {{ "Present" | date: '%B, %Y' }}</b></p>
            <ul>{% for post in site.researches %}
              {%if post.research_position == "RA_IIS_AS" %}
                {% include archive-single-research-cv.html %}
              {% endif %}
            {% endfor %}</ul>
          </li>
        </article>
      </div>

      <div class="{{ include.type | default: "list" }}__item">
        <article class="archive__item" itemscope itemtype="http://schema.org/CreativeWork">
          <li>
            <h3 itemprop="headline">Research Assistant @ Institute of Epidemiology and Preventive Medicine, National Taiwan University</h3>
            <p class="page__meta"><b><i class="fas fa-clock" aria-hidden="true"></i> &nbsp;&nbsp;  {{ "2019-07-01" | date: '%B, %Y' }}  - {{ "2020-06-01" | date: '%B, %Y' }}</b></p>
            <ul>{% for post in site.researches %}
              {%if post.research_position == "RA_IEPM_NTU" %}
                {% include archive-single-research-cv.html %}
              {% endif %}
            {% endfor %}</ul>
          </li>
        </article>
      </div>

      <div class="{{ include.type | default: "list" }}__item">
        <article class="archive__item" itemscope itemtype="http://schema.org/CreativeWork">
          <li>
            <h3 itemprop="headline">Research Assistant @ Division of Ecology and Evolution, The Australian National University</h3>
            <p class="page__meta"><b><i class="fas fa-clock" aria-hidden="true"></i> &nbsp;&nbsp;  {{ "2019-07-01" | date: '%B, %Y' }}  - {{ "2020-06-01" | date: '%B, %Y' }}</b></p>
            <ul>{% for post in site.researches %}
              {%if post.research_position == "RA_RSB_ANU" %}
                {% include archive-single-research-cv.html %}
              {% endif %}
            {% endfor %}</ul>
          </li>
        </article>
      </div>

      <div class="{{ include.type | default: "list" }}__item">
        <article class="archive__item" itemscope itemtype="http://schema.org/CreativeWork">
          <li>
            <h3 itemprop="headline">Undergraduate Research Student @ Center of Genomic and Precision Medicine, National Taiwan University</h3>
            <p class="page__meta"><b><i class="fas fa-clock" aria-hidden="true"></i> &nbsp;&nbsp;  {{ "2019-07-01" | date: '%B, %Y' }}  - {{ "2020-06-01" | date: '%B, %Y' }}</b></p>
            <ul>{% for post in site.researches %}
              {%if post.research_position == "URS_CGM_NTU" %}
                {% include archive-single-research-cv.html %}
              {% endif %}
            {% endfor %}</ul>
          </li>
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

  <h1 style="margin-top: 8px; border-left: 8px solid #7b8287; background-color: #ededed; padding: 8px">&nbsp;🛠 &nbsp; Skills</h1>
  * Programming Languag 1
    * <small>Python / R / Java / C / C++</small>
  * Programming Skill
    * <small>Git / R package / Django Flask / Android App / Web Development / Unity Game</small>

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
