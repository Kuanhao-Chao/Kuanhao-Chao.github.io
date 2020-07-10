---
layout: archive
title: "Games"
permalink: /games/
author_profile: true
---

{% include base_path %}

{% for post in site.games %}
  {% include archive-single-game.html %}
  <hr>
{% endfor %}
