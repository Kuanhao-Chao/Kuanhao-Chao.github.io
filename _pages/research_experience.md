---
layout: archive
title: "🔬 Research"
permalink: /researches/
author_profile: true
---

{% include base_path %}

{% for post in site.researches %}
  {% include archive-single-research.html %}
  <hr>
{% endfor %}
