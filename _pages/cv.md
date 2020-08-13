---
layout: archive
title: ""
permalink: /cv/
author_profile: true
redirect_from:
  - /resume
---

{% include base_path %}
<!-- <link rel="stylesheet" href="https://stackpath.bootstrapcdn.com/bootstrap/4.3.1/css/bootstrap.min.css" integrity="sha384-ggOyR0iXCbMQv3Xipma34MD+dH/1fQ784/j6cY/iJTQUOhcWr7x9JvoRxT2MZw1T" crossorigin="anonymous">
<script src="https://code.jquery.com/jquery-3.3.1.slim.min.js" integrity="sha384-q8i/X+965DzO0rT7abK41JStQIAqVgRVzpbzo5smXKp4YfRvH+8abtTE1Pi6jizo" crossorigin="anonymous"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/popper.js/1.14.7/umd/popper.min.js" integrity="sha384-UO2eT0CpHqdSJQ6hJty5KVphtPhzWj9WO1clHTMGa3JDZwrnQq4sF86dIHNDz0W1" crossorigin="anonymous"></script>
<script src="https://stackpath.bootstrapcdn.com/bootstrap/4.3.1/js/bootstrap.min.js" integrity="sha384-JjSmVgyd0p3pXB1rRibZUAYoIIy6OrQ6VrjIEaFf/nJGzIxFDsf4x0xIM+B07jRM" crossorigin="anonymous"></script>

<div id="accordion">
  <div class="card">
    <div class="card-header" id="headingOne">
      <h5 class="mb-0">
        <button class="btn btn-link" data-toggle="collapse" data-target="#collapseOne" aria-expanded="true" aria-controls="collapseOne">
          Collapsible Group Item #1
        </button>
      </h5>
    </div>

    <div id="collapseOne" class="collapse show" aria-labelledby="headingOne" data-parent="#accordion">
      <div class="card-body">
        Anim pariatur cliche reprehenderit, enim eiusmod high life accusamus terry richardson ad squid. 3 wolf moon officia aute, non cupidatat skateboard dolor brunch. Food truck quinoa nesciunt laborum eiusmod. Brunch 3 wolf moon tempor, sunt aliqua put a bird on it squid single-origin coffee nulla assumenda shoreditch et. Nihil anim keffiyeh helvetica, craft beer labore wes anderson cred nesciunt sapiente ea proident. Ad vegan excepteur butcher vice lomo. Leggings occaecat craft beer farm-to-table, raw denim aesthetic synth nesciunt you probably haven't heard of them accusamus labore sustainable VHS.
      </div>
    </div>
  </div>
  <div class="card">
    <div class="card-header" id="headingTwo">
      <h5 class="mb-0">
        <button class="btn btn-link collapsed" data-toggle="collapse" data-target="#collapseTwo" aria-expanded="false" aria-controls="collapseTwo">
          Collapsible Group Item #2
        </button>
      </h5>
    </div>
    <div id="collapseTwo" class="collapse" aria-labelledby="headingTwo" data-parent="#accordion">
      <div class="card-body">
        Anim pariatur cliche reprehenderit, enim eiusmod high life accusamus terry richardson ad squid. 3 wolf moon officia aute, non cupidatat skateboard dolor brunch. Food truck quinoa nesciunt laborum eiusmod. Brunch 3 wolf moon tempor, sunt aliqua put a bird on it squid single-origin coffee nulla assumenda shoreditch et. Nihil anim keffiyeh helvetica, craft beer labore wes anderson cred nesciunt sapiente ea proident. Ad vegan excepteur butcher vice lomo. Leggings occaecat craft beer farm-to-table, raw denim aesthetic synth nesciunt you probably haven't heard of them accusamus labore sustainable VHS.
      </div>
    </div>
  </div>
  <div class="card">
    <div class="card-header" id="headingThree">
      <h5 class="mb-0">
        <button class="btn btn-link collapsed" data-toggle="collapse" data-target="#collapseThree" aria-expanded="false" aria-controls="collapseThree">
          Collapsible Group Item #3
        </button>
      </h5>
    </div>
    <div id="collapseThree" class="collapse" aria-labelledby="headingThree" data-parent="#accordion">
      <div class="card-body">
        Anim pariatur cliche reprehenderit, enim eiusmod high life accusamus terry richardson ad squid. 3 wolf moon officia aute, non cupidatat skateboard dolor brunch. Food truck quinoa nesciunt laborum eiusmod. Brunch 3 wolf moon tempor, sunt aliqua put a bird on it squid single-origin coffee nulla assumenda shoreditch et. Nihil anim keffiyeh helvetica, craft beer labore wes anderson cred nesciunt sapiente ea proident. Ad vegan excepteur butcher vice lomo. Leggings occaecat craft beer farm-to-table, raw denim aesthetic synth nesciunt you probably haven't heard of them accusamus labore sustainable VHS.
      </div>
    </div>
  </div>
</div> -->


<link rel="stylesheet" href="{{ base_path }}/assets/css/collapse.css"/>

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

---

<h1 style="margin-top: 8px; border-left: 8px solid #7b8287; background-color: #ededed; padding: 8px">&nbsp;📔 &nbsp; Publications</h1>
  <ul>{% for post in site.publications %}
    {% include archive-single-cv.html %}
  {% endfor %}</ul>

  ---

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

---


<h1 style="margin-top: 8px; border-left: 8px solid #7b8287; background-color: #ededed; padding: 8px">&nbsp;🎤 &nbsp; Talks & Exhibition</h1>
  <ul>{% for post in site.talks %}
    {% include archive-single-talk-cv.html %}
  {% endfor %}</ul>

  ---



<h1 style="margin-top: 8px; border-left: 8px solid #7b8287; background-color: #ededed; padding: 8px">&nbsp;🏫 &nbsp; Teaching</h1>
  <ul>{% for post in site.teaching %}
    {% include archive-single-teaching-cv.html %}
  {% endfor %}</ul>

---

<h1 style="margin-top: 8px; border-left: 8px solid #7b8287; background-color: #ededed; padding: 8px">&nbsp;💼 &nbsp; Internship</h1>
<ul>{% for post in site.internship %}
  {% include archive-single-internship-cv.html %}
{% endfor %}</ul>

---

<h1 style="margin-top: 8px; border-left: 8px solid #7b8287; background-color: #ededed; padding: 8px">&nbsp;🛠 &nbsp; Skills</h1>
* Programming Languag 1
  * <small>Python / R / Java / C / C++</small>
* Programming Skill
  * <small>Git / R package / Django Flask / Android App / Web Development / Unity Game</small>

---

<h1 style="margin-top: 8px; border-left: 8px solid #7b8287; background-color: #ededed; padding: 8px">&nbsp;✉️ &nbsp; References</h1>
<ul>{% for post in site.references %}
  {% include archive-single-reference-cv.html %}
{% endfor %}</ul>
