---
layout: archive
title: ""
permalink: /cv/
author_profile: true
redirect_from:
  - /resume
---

{% include base_path %}
<link rel="stylesheet" href="{{ base_path }}/assets/css/nav_card.css"/>


<!-- The navigation menu -->
<div id="switch_cv" class="navbar" width="100%">
  <a class="nav_resume_pdf active" width="50%" href="#">Résumé</a>
  <a class="nav_cv_pdf" width="50%" href="#">CV</a>
</div>

<script src="{{ base_path }}/assets/js/nav_card.js"></script>


<br>

<div id="content_resume_pdf">
  <a href="https://storage.googleapis.com/storage.khchao.com/Resume.pdf" target="_blan"><b> >> Download Résumé here << </b></a>
  <p align="center">
    <iframe src="https://storage.googleapis.com/storage.khchao.com/Resume.pdf" width="100%" height="1200" style="border:none;" scrolling="no"></iframe>
  </p>
</div>


<div id="content_cv_pdf" style="display:none;">
  <a href="https://storage.googleapis.com/storage.khchao.com/CV.pdf" target="_blan"><b> >> Download CV here << </b></a>
  <p align="center">
    <iframe src="https://storage.googleapis.com/storage.khchao.com/CV.pdf" width="100%" height="1200" style="border:none;" scrolling="no"></iframe>
  </p>
</div>
