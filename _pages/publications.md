---
layout: archive
title: "📔 &nbsp; Publications"
permalink: /publications/
author_profile: true
---

{% if author.googlescholar %}
  You can also find my articles on <u><a href="{{author.googlescholar}}">my Google Scholar profile</a>.</u>
{% endif %}

{% include base_path %}


<div class="popup-overlay" id="popupOverlay">
  <div class="popup-content">
    <span class="close-button close-popup-btn">&times;</span>
    <h1 style="margin-top: 10px;">Citation</h1>
    <div id="citation_holder"></div>
    <br>
    <br>
    <pre id="citationbib_holder">{{post.citationbib}}</pre>
  </div>
</div>



<style>
  .popup-overlay {
    z-index: 100;
    display: none;
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background-color: rgba(0, 0, 0, 0.5);
    justify-content: center;
    align-items: center;
  }
  .popup-content {
    z-index: 100;
    background-color: white;
    padding: 40px;
    border-radius: 5px;
    box-shadow: 0px 0px 10px rgba(0, 0, 0, 0.2);
    position: relative; /* Add this line */
    width:50%;
  }
  .close-button {
    position: absolute;
    font-size: 35px;
    top: 20px;
    right: 20px;
    cursor: pointer;
  }
</style>



{% for post in site.publications reversed %}
  {% include archive-single.html %}
  ---
{% endfor %}

<script>
  console.log("button clicked!");
  const showPopupBtns = document.querySelectorAll('.show-popup-btn');
  const closePopupBtns = document.querySelectorAll('.close-popup-btn');
  const popupOverlay = document.getElementById('popupOverlay');

  function dosomething(citation, citationbib){
    console.log(citation);
    console.log(citationbib);
    var divElement = document.getElementById("citation_holder");
    divElement.innerHTML = citation;
    var divElement = document.getElementById("citationbib_holder");
    divElement.innerHTML = citationbib;
  }

  showPopupBtns.forEach(button => {
  button.addEventListener('click', () => {
  popupOverlay.style.display = 'flex';
  });
  });

  closePopupBtns.forEach(button => {
  button.addEventListener('click', () => {
  popupOverlay.style.display = 'none';
  });
  });
</script>

