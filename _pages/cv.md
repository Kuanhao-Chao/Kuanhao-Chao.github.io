---
layout: archive
title: ""
permalink: /cv/
author_profile: true
redirect_from:
  - /resume
---

{% include base_path %}

🎓 &nbsp; Education
======
<ul>
  <div class="{{ include.type | default: "list" }}__item">
    <article class="archive__item" itemscope itemtype="http://schema.org/CreativeWork">
      <li>
        <h3 class="archive__item-title" itemprop="headline">B.S. in Taiwan, Department of Electrical Engineering, National Taiwan University</h3>
        <p class="page__meta"><b><i class="fas fa-clock" aria-hidden="true"></i> &nbsp;&nbsp;  {{ "2016-09-01" | date: '%B, %Y' }}  - {{ "2021-01-01" | date: '%B, %Y' }}</b></p>
      </li>
    </article>
  </div>

  <div class="{{ include.type | default: "list" }}__item">
    <article class="archive__item" itemscope itemtype="http://schema.org/CreativeWork">
      <li>
        <h3 class="archive__item-title" itemprop="headline">Exchange in Australia, College of Engineering and Computer Science, The Australian National University</h3>
        <p class="page__meta"><b><i class="fas fa-clock" aria-hidden="true"></i> &nbsp;&nbsp;  {{ "2019-07-01" | date: '%B, %Y' }}  - {{ "2020-06-01" | date: '%B, %Y' }}</b></p>
      </li>
    </article>
  </div>
</ul>

---

📔 &nbsp; Publications
======
  <ul>{% for post in site.publications %}
    {% include archive-single-cv.html %}
  {% endfor %}</ul>

  ---

🔬 &nbsp; Research Projects
======
  <ul>{% for post in site.researches %}
    {% include archive-single-research-cv.html %}
  {% endfor %}</ul>

  ---

🎤 &nbsp; Talks & Exhibition
======
  <ul>{% for post in site.talks %}
    {% include archive-single-talk-cv.html %}
  {% endfor %}</ul>

  ---

🏫 &nbsp; Teaching
======
  <ul>{% for post in site.teaching %}
    {% include archive-single-teaching-cv.html %}
  {% endfor %}</ul>

---

💼 &nbsp; Internship
======
<ul>{% for post in site.internship %}
  {% include archive-single-internship-cv.html %}
{% endfor %}</ul>

---

🛠 &nbsp; Skills
======
* Programming Languag 1
  * <small>Python / R / Java / C / C++</small>
* Programming Skill
  * <small>Git / R package / Django Flask / Android App / Web Development / Unity Game</small>

---

✉️ &nbsp; References
======
<ul>{% for post in site.references %}
  {% include archive-single-reference-cv.html %}
{% endfor %}</ul>
