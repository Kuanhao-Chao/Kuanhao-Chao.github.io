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
* B.S. in Taiwan, National Taiwan University, 2016 - 2021
* Exchange in Australia, The Australian National University, 2019-2020

---

🛠 &nbsp; Skills
======
* Programming Languag 1
  * Python / R / Java / C / C++
* Programming Skill
  * Git / R package / Django Flask / Android App / Web Development / Unity Game

  ---

📔 &nbsp; Publications
======
  <ul>{% for post in site.publications %}
    {% include archive-single-cv.html %}
  {% endfor %}</ul>

  ---

🎤 &nbsp; Talks & Exhibition
======
  <ul>{% for post in site.talks %}
    {% include archive-single-talk-cv.html %}
  {% endfor %}</ul>

  ---

🔬 &nbsp; Research
======
  <ul>{% for post in site.researches %}
    {% include archive-single-research-cv.html %}
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
