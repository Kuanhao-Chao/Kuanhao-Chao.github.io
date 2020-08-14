if (document.getElementById("publication_inner").childNodes.length != 0) {
  console.log("publication_inner: ")
  var publication_content = `
    <h2 style="color: #000f70"> <i class="fas fa-dot-circle" style="font-size:18px;"></i> &nbsp;&nbsp;Publication </h2>
    `
  // console.log('document.getElementById("talk_inner"): ', document.getElementById("talk_inner").childNodes.length)
  document.getElementById("publication").insertAdjacentHTML('afterbegin', publication_content)
}

if (document.getElementById("talk_inner").childNodes.length != 0) {
  console.log("talk_inner: ")
  var talks_content = `
    <h2 style="color: #000f70"> <i class="fas fa-dot-circle" style="font-size:18px;"></i> &nbsp;&nbsp;Talks </h2>
    `
  // console.log('document.getElementById("talk_inner"): ', document.getElementById("talk_inner").childNodes.length)
  document.getElementById("talk").insertAdjacentHTML('afterbegin', talks_content)
}
