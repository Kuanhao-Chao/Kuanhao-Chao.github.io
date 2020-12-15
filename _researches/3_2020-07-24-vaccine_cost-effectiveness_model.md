---
title: "Vaccine cost-effectiveness evaluation model"
collection: researches
type: "Research assistant"
permalink: /researches/2020-07-24-vaccine_cost-effectiveness_model
venue: "<a href='http://epm.ntu.edu.tw/web/index/index.jsp?lang=en' target='_blank' style='color: inherit;'>Institute of Epidemiology and Preventive Medicine, National Taiwan University</a>"
start_date: 2020-07-24
end_date: "Present"
location: "Taipei, Taiwan"
status: '<a style="text-decoration:none; color:orange;">In progress <i class="fa fa-spinner" aria-hidden="true"></i></a>'
image: "/images/vaccine_project_cover.png"
superviser: '<a href="/references/Tzu-Pin_Lu" style="font-size: 12px; text-decoration:none; color:#4A4F53; border-style: solid; border-color:#bfe3c3; border-radius: 10px; background-color: #bfe3c3;" target="_blank">&nbsp; Tzu-pin Lu &nbsp;</a>'
superviser_clean:
  - "Tzu-Pin Lu"
research_position: "RA_IEPM_NTU"
research_clean: "vaccine_cost_effectiveness"
---


I am building a mathematical Markov chain model to simulate numbers of people infected after being vaccinated by trivalent or quadrivalent inactivated influenza vaccines (TIV/QIV) and the cost-effectiveness with different vaccine coverage.
The main goal is to provide a powerful vaccine cost-effectiveness website for Taiwan Centers for Disease Control to assess public health policies.
The back-end of the website is written in Python Django and Django-Q task scheduler.

I am cooperating with Dr. <a href="http://dohcm.ntunhs.edu.tw/en/teacher.aspx?id=tsunghsien&language=en&num_function=376&id_mode=1" target="_blank">Tsung-Hsien Yu</a> who provides heathcare and cost effectiveness evaluation knowledge.

<a href="http://140.112.136.49:8005/" target="_blank"> <b>>> Website Entry <<</b></a>

---

<h2 style="color: #000f70; margin-left:-30px" > <i class="fas fa-dot-circle" style="font-size:18px;"></i> &nbsp;&nbsp;Basic Model Structure </h2>

<div>
  <div style="margin-bottom: 10px">
    Click the nodes in the tree to collapse and expand the tree.
  </div>
  <div id="add_tree" style="margin-left: -5px">
  </div>
</div>

---

<h2 style="color: #000f70; margin-left: -30px;"> <i class="fas fa-dot-circle" style="font-size:18px;"></i> &nbsp;&nbsp;Demo video </h2>

<div>
  <p> The video below shows the basic functions of this website. Users can check the transmission Markov chain model tree and set their own model simulation parameters. Afterward, they can click the "Run the Model" model to start the simulation of transmission.  </p>

  <iframe width="100%" height="65" src="https://www.youtube.com/embed/hPol-tIg99w" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>
</div>

---

<h2 style="color: #000f70; margin-left: -30px"> <i class="fas fa-dot-circle" style="font-size:18px;"></i> &nbsp;&nbsp; Website & Source code </h2>

<div>
  <ul>
    <li><a href="http://140.112.136.49:8005/" target="_blank"> <b>Website Entry</b></a></li>
  </ul>
  <ul>
    <li><a href="https://github.com/Kuanhao-Chao/Vaccine-Cost-effectiveness" target="_blank"> Vaccine-Cost-Effectiveness <b>GitHub repository</b></a></li>
  </ul>
</div>
<!-- <a href="http://140.112.136.49:8005/"> <b> >> Website << </b></a> -->

---


<style>
  .node {
    cursor: pointer;
  }

  .node circle {
    fill: #fff;
    stroke: steelblue;
    stroke-width: 2.5px;
  }

  .node text {
    font: 145px sans-serif;
    font-weight: bold;
  }

  path.link {
      fill: none;
      stroke: #ccc;
      stroke-width: 2.5px;
  }
  .link text {
    font: 20px sans-serif;
    font-weight: bold;
    fill: #9c9c9c;
  }

</style>

<script src="https://d3js.org/d3.v3.min.js"></script>
<script>
  function tree(select_id, display_file) {
    var screen_width = (window.innerWidth > 0) ? window.innerWidth : screen.width;
    var margin = {
        top: 20,
        right: 20,
        bottom: 20,
        left: 20
    },
    width = screen_width - margin.right - margin.left,
    height = 1200 - margin.top - margin.bottom;

    var i = 0, duration = 750, root;

    var tree = d3.layout.tree().size([height, width]);

    var diagonal = d3.svg.diagonal().projection(function (d) {
        return [d.y, d.x];
    });

    var svg = d3.select(select_id).append("svg").attr("style", "outline: 3px solid #d4d4d4;").attr("preserveAspectRatio", "xMinYMin meet").attr("viewBox", "-200 0 2000 1200").append("g");

    d3.json(display_file, function(error, tree_data) {
      root = tree_data;
      root.x0 = height / 2;
      root.y0 = 0;
      function collapse(d) {
        if (d.children) {
          d._children = d.children;
          d._children.forEach(collapse);
          d.children = null;
        }
      }
      update(root);
    });

    function collapse(d) {
        if (d.children) {
            d._children = d.children;
            d._children.forEach(collapse);
            d.children = null;
        }
    }
    root.children.forEach(collapse);
    update(root);

    d3.select(self.frameElement).style("height", "800px");



    function update(source) {
        var nodes = tree.nodes(root).reverse(), links = tree.links(nodes);
        nodes.forEach(function (d) {
          d.y = d.depth * 350;
        });

        var node = svg.selectAll("g.node").data(nodes, function (d) {
            return d.id || (d.id = ++i);
        });
        var nodeEnter = node.enter().append("g").attr("class", "node").attr("transform", function (d) {
            return "translate(" + source.y0 + "," + source.x0 + ")";
        }).on("click", click);

        nodeEnter.append("circle").attr("r", 1e-6).style("fill", function(d) { return d.color; });

        nodeEnter.append("text").attr("x", function (d) { return d.children || d._children ? -13 : 13; }).attr("dy", ".35em").attr("text-anchor", function (d) { return d.children || d._children ? "end" : "start"; }).style("fill-opacity", 1e-6).text(function (d) { return d.name; }).attr("vector-effect", "non-scaling-stroke").style("border", "red").attr("fill", function (d) { return ( d.name.includes("Death")  || d.name.includes("Recovery") || d.name.includes("Infected") || d.name.includes("Not infected")) ? "#4287f5" : "#00298f";}).style("font-size", function (d) { return ( d.name.includes("Death")  || d.name.includes("Recovery") || d.name.includes("Infected") || d.name.includes("Not infected"))  ? 20 : 25;});
        var nodeUpdate = node.transition().duration(duration).attr("transform", function (d) {
            return "translate(" + d.y + "," + d.x + ")";
        });

        nodeUpdate.select("circle").attr("r", function(d) { return d.children == undefined ? 10 : 5;});

        nodeUpdate.select("text").style("fill-opacity", 1);

        var nodeExit = node.exit().transition().duration(duration).attr("transform", function (d) { return "translate(" + source.y + "," + source.x + ")";
        }).remove();

        nodeExit.select("circle").attr("r", 1e-6);
        nodeExit.select("text").style("fill-opacity", 1e-6);

        var link = svg.selectAll("path.link").data(links, function (d) { return d.target.id; });

        link.enter().insert("path", "g").attr("class", "link").attr("d", function (d) {var o = { x: source.x0, y: source.y0}; return diagonal({ source: o, target: o });});

        link.transition().duration(duration).attr("d", diagonal);
        link.exit().transition().duration(duration).attr("d", function (d) { var o = { x: source.x, y: source.y}; return diagonal({source: o, target: o});}).remove();

        var linktext = svg.selectAll("g.link").data(links, function (d) { return d.target.id; });

        linktext.enter().insert("g").attr("class", "link").append("text").attr("x", "-65px").attr("dy", "0.35em").attr("text-anchor", "middle").text(function (d) {return d.target.pb;});

        linktext.transition().duration(duration).attr("transform", function (d) {
            return "translate(" + ((d.source.y + d.target.y) / 2) + "," + ((d.source.x + d.target.x) / 2) + ")";
        });

        linktext.exit().transition().remove();

        nodes.forEach(function (d) {
            d.x0 = d.x;
            d.y0 = d.y;
        });

    }
    function click(d) {
        if (d.children) {
            d._children = d.children;
            d.children = null;
        } else {
            d.children = d._children;
            d._children = null;
        }
        update(d);
    }
  }
  tree("#add_tree", "/files/topology.json")
</script>



<!-- <embed src="http://140.112.136.49:8005/" style="width:500px; height: 300px;"> -->

<!-- <iframe src="https://storage.googleapis.com/kuanhao.nctu.me/CV.pdf" width="100%" height="1200" style="border:none;" scrolling="no"></iframe> -->



<!-- [**>> Website <<**](http://140.112.136.49:8005/) -->

<!--






























function update(source) {
    var nodes = tree.nodes(root).reverse(),
        links = tree.links(nodes);
    nodes.forEach(function (d) {
        d.y = d.depth * 350;
    });
    var node = svg.selectAll("g.node")
        .data(nodes, function (d) {
        return d.id || (d.id = ++i);
    });
    var nodeEnter = node.enter().append("g")
        .attr("class", "node")
        .attr("transform", function (d) {
        return "translate(" + source.y0 + "," + source.x0 + ")";
    })
        .on("click", click);

    nodeEnter.append("circle")
        .attr("r", 1e-6)
        .style("fill", function(d) { return d.color; });

    nodeEnter.append("text")
        .attr("x", function (d) {
        return d.children || d._children ? -13 : 13;
      })
        .attr("dy", ".35em")
        .attr("text-anchor", function (d) {
        return d.children || d._children ? "end" : "start";
      })
        .style("fill-opacity", 1e-6)
        .text(function (d) {
        return d.name;
      })
        .attr("vector-effect", "non-scaling-stroke")
        .style("border", "red")
        .attr("fill", function (d) {
        return ( d.name.includes("Death")  || d.name.includes("Recovery") || d.name.includes("Infected") || d.name.includes("Not infected"))  ? "#4287f5" : "#00298f";
      })
        .style("font-size", function (d) {
        return ( d.name.includes("Death")  || d.name.includes("Recovery") || d.name.includes("Infected") || d.name.includes("Not infected"))  ? 20 : 25;
      });
    var nodeUpdate = node.transition()
        .duration(duration)
        .attr("transform", function (d) {
        return "translate(" + d.y + "," + d.x + ")";
    });

    nodeUpdate.select("circle")
        .attr("r", function(d) { return d.children == undefined ? 10 : 5;} )

    nodeUpdate.select("text")
        .style("fill-opacity", 1);

    var nodeExit = node.exit().transition()
        .duration(duration)
        .attr("transform", function (d) {
        return "translate(" + source.y + "," + source.x + ")";
    })
        .remove();

    nodeExit.select("circle")
        .attr("r", 1e-6);

    nodeExit.select("text")
        .style("fill-opacity", 1e-6);

    var link = svg.selectAll("path.link")
        .data(links, function (d) {
        return d.target.id;
    });

    link.enter().insert("path", "g")
        .attr("class", "link")
        .attr("d", function (d) {
        var o = {
            x: source.x0,
            y: source.y0
        };
        return diagonal({
            source: o,
            target: o
        });
    });

    link.transition()
        .duration(duration)
        .attr("d", diagonal);

    link.exit().transition()
        .duration(duration)
        .attr("d", function (d) {
        var o = {
            x: source.x,
            y: source.y
        };
        return diagonal({
            source: o,
            target: o
        });
    })
        .remove();

    var linktext = svg.selectAll("g.link")
        .data(links, function (d) {
        return d.target.id;
    });

    linktext.enter()
        .insert("g")
        .attr("class", "link")
        .append("text")
        .attr("x", "-65px")
        .attr("dy", "0.35em")
        .attr("text-anchor", "middle")
        .text(function (d) {
          return d.target.pb;
        })


    linktext.transition()
        .duration(duration)
        .attr("transform", function (d) {
        return "translate(" + ((d.source.y + d.target.y) / 2) + "," + ((d.source.x + d.target.x) / 2) + ")";
    })

    linktext.exit().transition()
        .remove();


    nodes.forEach(function (d) {
        d.x0 = d.x;
        d.y0 = d.y;
    });
}
function click(d) {
    if (d.children) {
        d._children = d.children;
        d.children = null;
    } else {
        d.children = d._children;
        d._children = null;
    }
    update(d);
}
} -->
