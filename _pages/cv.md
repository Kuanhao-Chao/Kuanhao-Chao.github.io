---
layout: archive
title: ""
permalink: /cv/
author_profile: true
redirect_from:
  - /resume
---

{% include base_path %}
<!-- <link rel="stylesheet" href="{{ base_path }}/assets/css/nav_card.css"/> -->


<!-- The navigation menu -->
<div id="switch_cv" class="navbar">
  <a class="nav_cv_online active" href="#">Online CV</a>
  <a class="nav_cv_pdf" href="#">PDF CV</a>
</div>



<script>
// Get the container element
var navContainer = document.getElementById("switch_cv");
console.log(navContainer)
// Get all buttons with class="btn" inside the container
var nav_cv_online = navContainer.getElementsByClassName("nav_cv_online");
var nav_cv_pdf = navContainer.getElementsByClassName("nav_cv_pdf");


nav_cv_online[0].addEventListener("click", function() {
  var current = document.getElementsByClassName("active");
  current[0].className = current[0].className.replace(" active", "");
  this.className += " active";
  $("#content_cv_online").removeAttr("style")
  $("#content_cv_pdf").css("display", "none");
});

nav_cv_pdf[0].addEventListener("click", function() {
  var current = document.getElementsByClassName("active");
  current[0].className = current[0].className.replace(" active", "");
  this.className += " active";
  $("#content_cv_pdf").removeAttr("style");
  $("#content_cv_online").css("display", "none");
});

</script>
<!-- $('#switch_cv').on('click', function () {
    $('.cv_element').toggleClass('active');
    if ($(".active").hasClass("active")) {
        // do this
        console.log("hidden");
    } else {
        // do that
        console.log("not hidden");
        document.getElementById("toggle_button").className = "fas fa-angle-double-left";
    }
}); -->

<style>
  /* Style the navigation menu */
  .navbar {
    width: 100%;
    overflow: auto;
  }

  /* Navigation links */
  .navbar a {
    float: left;
    padding: 12px;
    color: #adadad;
    text-decoration: none;
    font-size: 25px;
    font-weight: 900;
    width: 50%; /* Four equal-width links. If you have two links, use 50%, and 33.33% for three links, etc.. */
    text-align: center; /* If you want the text to be centered */
    border-bottom: 3px solid #737373;
  }

  /* Add a background color on mouse-over */
  .navbar a:hover {
    /* background-color: #a8a8a8; */
    border-top: 3px solid #cccccc;
    border-left: 3px solid #cccccc;
    border-right: 3px solid #cccccc;
    border-top-left-radius: 5px;
    border-top-right-radius: 5px;
    color: #737373;
  }

  /* Style the current/active link */
  .navbar a.active {
    border-bottom: none;
    border-top: 3px solid #737373;
    border-left: 3px solid #737373;
    border-right: 3px solid #737373;
    border-top-left-radius: 5px;
    border-top-right-radius: 5px;
    background-color:white;
    color: black;
    /* background-image: linear-gradient(to bottom, #999999, #c4c4c4 80%, #ffffff); */
  }

  /* Add responsiveness - on screens less than 500px, make the navigation links appear on top of each other, instead of next to each other */
  @media screen and (max-width: 500px) {
    .navbar a {
      float: none;
      display: block;
      width: 100%;
      text-align: left; /* If you want the text to be left-aligned on small screens */
    }
  }
</style>

<link rel="stylesheet" href="{{ base_path }}/assets/css/collapse.css"/>

<br>

<div id="content_cv_online">
  <h1 style="margin-top: 8px; border-left: 8px solid #7b8287; background-color: #ededed; padding: 8px">&nbsp;🎓 &nbsp; Education</h1>

  <ul>
    <div class="{{ include.type | default: "list" }}__item">
      <article class="archive__item" itemscope itemtype="http://schema.org/CreativeWork">
        <li>
          <h3 itemprop="headline">B.S. in Taiwan, Department of Electrical Engineering, National Taiwan University</h3>
          <p class="page__meta"><b><i class="fas fa-clock" aria-hidden="true"></i> &nbsp;&nbsp;  {{ "2016-09-01" | date: '%B, %Y' }}  - {{ "2021-01-01" | date: '%B, %Y' }}</b></p>
        </li>
      </article>
    </div>

    <div class="{{ include.type | default: "list" }}__item">
      <article class="archive__item" itemscope itemtype="http://schema.org/CreativeWork">
        <li>
          <h3 itemprop="headline">Exchange in Australia, College of Engineering and Computer Science, The Australian National University</h3>
          <p class="page__meta"><b><i class="fas fa-clock" aria-hidden="true"></i> &nbsp;&nbsp;  {{ "2019-07-01" | date: '%B, %Y' }}  - {{ "2020-06-01" | date: '%B, %Y' }}</b></p>
        </li>
      </article>
    </div>
  </ul>

  <hr>

  <h1 style="margin-top: 8px; border-left: 8px solid #7b8287; background-color: #ededed; padding: 8px">&nbsp;📔 &nbsp; Publications</h1>
    <ul>{% for post in site.publications %}
      {% include archive-single-cv.html %}
    {% endfor %}</ul>

    <hr>

  <h1 style="margin-top: 8px; border-left: 8px solid #7b8287; background-color: #ededed; padding: 8px">&nbsp;🔬 &nbsp; Research Experience</h1>
    <ul>
      <div class="{{ include.type | default: "list" }}__item">
        <article class="archive__item" itemscope itemtype="http://schema.org/CreativeWork">
          <li>
            <h3 itemprop="headline">Research Assistant @ Institute of Information Science, Academia Sinica </h3>
            <p class="page__meta"><b><i class="fas fa-clock" aria-hidden="true"></i> &nbsp;&nbsp;  {{ "2020-07-01" | date: '%B, %Y' }}  - {{ "Present" | date: '%B, %Y' }}</b></p>
            <ul>{% for post in site.researches %}
              {%if post.research_position == "RA_IIS_AS" %}
                {% include archive-single-research-cv.html %}
              {% endif %}
            {% endfor %}</ul>
          </li>
        </article>
      </div>

      <div class="{{ include.type | default: "list" }}__item">
        <article class="archive__item" itemscope itemtype="http://schema.org/CreativeWork">
          <li>
            <h3 itemprop="headline">Research Assistant @ Institute of Epidemiology and Preventive Medicine, National Taiwan University</h3>
            <p class="page__meta"><b><i class="fas fa-clock" aria-hidden="true"></i> &nbsp;&nbsp;  {{ "2019-07-01" | date: '%B, %Y' }}  - {{ "2020-06-01" | date: '%B, %Y' }}</b></p>
            <ul>{% for post in site.researches %}
              {%if post.research_position == "RA_IEPM_NTU" %}
                {% include archive-single-research-cv.html %}
              {% endif %}
            {% endfor %}</ul>
          </li>
        </article>
      </div>

      <div class="{{ include.type | default: "list" }}__item">
        <article class="archive__item" itemscope itemtype="http://schema.org/CreativeWork">
          <li>
            <h3 itemprop="headline">Research Assistant @ Division of Ecology and Evolution, The Australian National University</h3>
            <p class="page__meta"><b><i class="fas fa-clock" aria-hidden="true"></i> &nbsp;&nbsp;  {{ "2019-07-01" | date: '%B, %Y' }}  - {{ "2020-06-01" | date: '%B, %Y' }}</b></p>
            <ul>{% for post in site.researches %}
              {%if post.research_position == "RA_RSB_ANU" %}
                {% include archive-single-research-cv.html %}
              {% endif %}
            {% endfor %}</ul>
          </li>
        </article>
      </div>

      <div class="{{ include.type | default: "list" }}__item">
        <article class="archive__item" itemscope itemtype="http://schema.org/CreativeWork">
          <li>
            <h3 itemprop="headline">Undergraduate Research Student @ Center of Genomic and Precision Medicine, National Taiwan University</h3>
            <p class="page__meta"><b><i class="fas fa-clock" aria-hidden="true"></i> &nbsp;&nbsp;  {{ "2019-07-01" | date: '%B, %Y' }}  - {{ "2020-06-01" | date: '%B, %Y' }}</b></p>
            <ul>{% for post in site.researches %}
              {%if post.research_position == "URS_CGM_NTU" %}
                {% include archive-single-research-cv.html %}
              {% endif %}
            {% endfor %}</ul>
          </li>
        </article>
      </div>
    </ul>

  <hr>


  <h1 style="margin-top: 8px; border-left: 8px solid #7b8287; background-color: #ededed; padding: 8px">&nbsp;🎤 &nbsp; Talks & Exhibition</h1>
    <ul>{% for post in site.talks %}
      {% include archive-single-talk-cv.html %}
    {% endfor %}</ul>

    <hr>



  <h1 style="margin-top: 8px; border-left: 8px solid #7b8287; background-color: #ededed; padding: 8px">&nbsp;🏫 &nbsp; Teaching</h1>
    <ul>{% for post in site.teaching %}
      {% include archive-single-teaching-cv.html %}
    {% endfor %}</ul>

  <hr>

  <h1 style="margin-top: 8px; border-left: 8px solid #7b8287; background-color: #ededed; padding: 8px">&nbsp;💼 &nbsp; Internship</h1>
  <ul>{% for post in site.internship %}
    {% include archive-single-internship-cv.html %}
  {% endfor %}</ul>

  <hr>

  <h1 style="margin-top: 8px; border-left: 8px solid #7b8287; background-color: #ededed; padding: 8px">&nbsp;🛠 &nbsp; Skills</h1>
  * Programming Languag 1
    * <small>Python / R / Java / C / C++</small>
  * Programming Skill
    * <small>Git / R package / Django Flask / Android App / Web Development / Unity Game</small>

  <hr>

  <h1 style="margin-top: 8px; border-left: 8px solid #7b8287; background-color: #ededed; padding: 8px">&nbsp;✉️ &nbsp; References</h1>
  <ul>{% for post in site.references %}
    {% include archive-single-reference-cv.html %}
  {% endfor %}</ul>
</div>


<div id="content_cv_pdf" style="display:none;">
  <a href="https://storage.googleapis.com/kuanhao.nctu.me/CV.pdf" target="_blan"><b> >> Download CV here << </b></a>
  <p align="center">
    <iframe src="https://storage.googleapis.com/kuanhao.nctu.me/CV.pdf" width="100%" height="1200" style="border:none;" scrolling="no"></iframe>
  </p>
</div>
