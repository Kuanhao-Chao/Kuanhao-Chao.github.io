---
layout: archive
title: "<i class='fa fa-fw fa-newspaper' aria-hidden='true'></i> &nbsp; News"
permalink: /news/
author_profile: true
---


{% include base_path %}

{% for post in site.news %}
  {% include archive-single-news.html %}
  <hr>
{% endfor %}
