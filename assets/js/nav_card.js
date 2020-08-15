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
