---
layout: archive
title: "🎯 Projects"
permalink: /projects/
author_profile: true
---

{% include base_path %}

{% for post in site.games %}
  {% include archive-single-game.html %}
  <hr>
{% endfor %}

{% for post in site.course_projects %}
  {% include archive-single-course_projects.html %}
  <hr>
{% endfor %}
