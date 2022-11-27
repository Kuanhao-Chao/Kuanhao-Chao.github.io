fetch('/gallery/photos.json')
    .then(response => response.json())
    .then(photos => {
      console.log(photos)
      console.log(photos['tag1'].length)
      for (var i = 0; i < photos['tag1'].length; i++){
        var obj = photos['tag1'][i];
        console.log(obj);
        const elem = document.getElementById('my-gallery-wrapper');
        var node1 = `<div class="col">
          <div class="p-1 border bg-light">
            <a class="spotlight" data-theme="true" data-play="true" data-download="true" href="{{base_path}}/gallery/`;
        var node2 = `">
              <img style="width: 300px; height: 200px; object-fit: cover;" alt=".." src="{{base_path}}/gallery/`;
        var node3 = `" />
            </a>
          </div>
        </div>`;
        var node = node1 + obj + node2 + obj + node3;
        console.log(node);
        var doc = new DOMParser().parseFromString(node, "text/html");
        console.log(doc);
        elem.appendChild(doc.documentElement.childNodes[1].childNodes[0]);
      }
    })
    .catch(error => console.log(error));