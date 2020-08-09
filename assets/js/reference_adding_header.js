if (document.getElementById("supervised_projects_inner").childNodes.length != 0) {
  var supervised_projects_content = `
  <h2 style="color: #000f70"> <i class="fas fa-dot-circle" style="font-size:18px;"></i> &nbsp;&nbsp;Supervised Projects </h2>
  `
  // console.log('document.getElementById("talk_inner"): ', document.getElementById("talk_inner").childNodes.length)
  document.getElementById("supervised_projects").insertAdjacentHTML('afterbegin', supervised_projects_content)
}

if (document.getElementById("publication_inner").childNodes.length != 0) {
  var publication_content = `
    <h2 style="color: #000f70"> <i class="fas fa-dot-circle" style="font-size:18px;"></i> &nbsp;&nbsp;Publication </h2>
    `
  // console.log('document.getElementById("talk_inner"): ', document.getElementById("talk_inner").childNodes.length)
  document.getElementById("publication").insertAdjacentHTML('afterbegin', publication_content)
}

if (document.getElementById("talk_inner").childNodes.length != 0) {
  var talks_content = `
    <h2 style="color: #000f70"> <i class="fas fa-dot-circle" style="font-size:18px;"></i> &nbsp;&nbsp;Talks </h2>
    `
  // console.log('document.getElementById("talk_inner"): ', document.getElementById("talk_inner").childNodes.length)
  document.getElementById("talk").insertAdjacentHTML('afterbegin', talks_content)
}
