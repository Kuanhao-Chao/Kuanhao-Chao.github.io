---
layout: archive
title: "Research"
permalink: /researches/
author_profile: true
---

{% include base_path %}

{% for post in site.researches reversed %}
  {% include archive-single-internship.html %}
  <hr>
{% endfor %}
