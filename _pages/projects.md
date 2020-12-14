---
layout: archive
title: "🎯 Projects"
permalink: /projects/
author_profile: true
---
{% include base_path %}

<hr>

{% for post in site.projects %}
  {% include archive-single-project.html %}
  <hr>
{% endfor %}
