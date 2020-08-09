if (document.getElementById("talk_inner").childNodes.length != 0) {
  var talks_content = `
    <h2 style="color: #000f70"> <i class="fas fa-dot-circle" style="font-size:18px;"></i> &nbsp;&nbsp;Talks </h2>
    `
  // console.log('document.getElementById("talk_inner"): ', document.getElementById("talk_inner").childNodes.length)
  document.getElementById("talk").insertAdjacentHTML('afterbegin', talks_content)
}
