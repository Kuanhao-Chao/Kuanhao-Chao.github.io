---
layout: archive
title: "Research Experience"
permalink: /researches/
author_profile: true
---

{% include base_path %}

{% for post in site.researches reversed %}
  {% include archive-single-research.html %}
{% endfor %}
