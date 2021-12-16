import {
  getNodesWithAttackPattern,
  getTactic,
  MITRE_ATTACK_CATEGORIES,
  parseBundleToGraph,
  parseTacticNameToXAxis,
  getDiamondModelCategoryLayer,
  getNodeLabel,
  createView,
  DIAMOND_MODEL_META_FEATURE_CATEGORIES,
  getMinNodeDate,
  getMaxNodeDate
} from "./mapper.js";
import {ATTACK_PATTERN_TYPE} from "../stix/sdo/attack-pattern.js";
import {GROUPING_TYPE} from "../stix/sdo/grouping.js";
import {TOOL_TYPE} from "../stix/sdo/tool.js";
import {MALWARE_TYPE} from "../stix/sdo/malware.js";
import {VULNERABILITY_TYPE} from "../stix/sdo/vulnerability.js";
import {IDENTITY_TYPE} from "../stix/sdo/identity.js";
import {THREAT_ACTOR_TYPE} from "../stix/sdo/threat-actor.js";
import {OBSERVED_DATA_TYPE} from "../stix/sdo/observed-sdo.js";
import {CAMPAIGN_TYPE} from "../stix/sdo/campaign.js";
import {INDICATOR_TYPE} from "../stix/sdo/indicator.js";
import {Node} from "./node.js";
import {checkSyntax, Warning} from "./syntax-checker.js";
import {LOCATION_TYPE} from "../stix/sdo/location.js";
import {INFRASTRUCTURE_TYPE} from "../stix/sdo/infrastructure.js";
import {MALWARE_ANALYSIS_TYPE} from "../stix/sdo/malware-analysis.js";
import {NOTE_TYPE} from "../stix/sdo/note.js";
import {OPINION_TYPE} from "../stix/sdo/opinion.js";
import {FILE_TYPE} from "../stix/sco/file.js";
import {DIRECTORY_TYPE} from "../stix/sco/directory.js";
import {NETWORK_TRAFFIC_TYPE} from "../stix/sco/network-traffic.js";
import {PROCESS_TYPE} from "../stix/sco/process.js";
import {URL_TYPE} from "../stix/sco/url.js";
import {IPV4_TYPE, IPV6_TYPE} from "../stix/sco/ipv-sco.js";
import {DOMAIN_TYPE} from "../stix/sco/domain.js";
import {AUTONOMOUS_SYSTEM_TYPE} from "../stix/sco/autonomous-system.js";
import {SOFTWARE_TYPE} from "../stix/sco/software.js";
import {USER_ACCOUNT_TYPE} from "../stix/sco/user-account.js";
import {CODE_TYPE} from "../stix/sco/code.js";


let stixBundle = undefined;
let stixGraph = undefined;

const GRAPH_TYPE = {
  ACTIVITY_THREAD: "activity_thread",
  ATTACK_GRAPH: "attack_graph",
  SUB_GRAPH: "sub_attack_graph",
}

const MARGIN = {
  TOP: 45,
  BOTTOM: 30,
  RIGHT: 30,
  LEFT: 60
}

const LAYER_COLOR_SCHEMA = [
  '#CFD8DC',
  '#90A4AE',
  '#607D8B',
  '#455A64'
]

const WIDTH = 1300;
const HEIGHT = 650;

// Default Graph selection
let graphSelection = window.location.hash.replace("#", "") || GRAPH_TYPE.ATTACK_GRAPH;

/**
 * Get Graph selection through change in URL hash
 */
window.onhashchange = function () {
  let selection = window.location.hash.replace("#", "");
  if (selection !== "") {
    graphSelection = selection;
    setCurrentGraphSelection();
    createGraph(stixGraph);
  }
}

/**
 * Create basic SVG Container on a DIV element
 * @param divId: Id of the DIV Element
 * @param width: Viewbox width
 * @param height: Viewbox height
 * @param marginLeft: Left margin for translating the viewbox
 * @param marginTop: Top margin for translating the viewbox
 */
function initGraph(divId, width = 1000, height = 500, marginLeft, marginTop) {
  let svgEl = document.getElementById(divId)
  return d3.select(svgEl)
    .attr("viewBox", [0, 0, width, height])
    .classed("svg-background", true)
    .append("g")
    .attr("id", "svg-graph")
    .attr("transform", "translate(" + marginLeft + "," + marginTop + ")");
}

/**
 * Add Arrow Marker into defs
 */
function addArrowMarker(defId) {
  d3.selectAll(defId)
    .append("marker")
    .attr("id", "arrow")
    .attr("viewbox", "0 0 10 10")
    .attr("refX", 18)
    .attr("refY", 5)
    .attr("markerWidth", 10)
    .attr("markerHeight", 10)
    .attr("orient", "auto-start-reverse")
    .append("path")
    .attr("d", "M0,0L0,10L10,5");
}

/**
 * This creates a X-Axis with all Mitre Attack Phases
 */
function createXAxisWithMitrePhases() {
  let x = d3.scaleBand()
    .domain(MITRE_ATTACK_CATEGORIES)
    .range([0, WIDTH])
  let xAxis = svg.append("g")
    .attr("id", "xAxis")
    .attr("style", "color: white; font-size: 8px")
    .call(d3.axisTop(x))
    .selectAll(".tick text")
    .call(wrap, x.bandwidth())

  // Build layer background
  svg.selectAll("background-rect")
    .data(MITRE_ATTACK_CATEGORIES)
    .join("g")
    .attr("id", "layer")
    .append("rect")
    .attr("x", (d, i) => {
      return (WIDTH / MITRE_ATTACK_CATEGORIES.length) * i;
    })
    .attr("height", HEIGHT)
    .attr("width", WIDTH / MITRE_ATTACK_CATEGORIES.length)
    .attr("opacity", 0.6)
    .attr("fill", function (d, i) {
      return i % 2 === 0 ? LAYER_COLOR_SCHEMA[0] : LAYER_COLOR_SCHEMA[1];
    });
  return x;
}

/**
 * Build Activity Thread
 * @param graph: These are all Grouping Events
 */
function buildActivityThreadGraph(graph) {
  let relevantGroupings = graph.nodes.filter(grouping => {
    if (grouping.data.object_refs.find(ref => ref.includes(ATTACK_PATTERN_TYPE))) {
      return grouping;
    }
  });
  let attackPatterns = getNodesWithAttackPattern(graph);
  let x = createXAxisWithMitrePhases();

  let y = d3.scaleTime()
    .domain([
      new Date(getMinNodeDate(relevantGroupings).getFullYear() + "-01-01 00:00:00"),
      new Date(getMaxNodeDate(relevantGroupings).getFullYear() + "-12-31 23:59:59")])
    .range([HEIGHT, 0]);
  let yAxis = svg.append("g")
    .attr("id", "yAxis")
    .attr("style", "color: white")
    .call(d3.axisLeft(y));

  // Create DIV element for Tooltip
  d3.select("#svg-container")
    .append("div")
    .attr("id", "tooltip")
    .attr("class", "tooltipAttackGraph")
    .style("visibility", "hidden");

  // ClipPath is a boundary where everything outside is not be drawn
  svg.append("defs")
    .attr("id", "clip-def")
    .append("SVG:clipPath")
    .attr("id", "clip")
    .append("SVG:rect")
    .attr("width", WIDTH)
    .attr("height", HEIGHT)
    .attr("x", 0)
    .attr("y", 0);

  svg.append("rect")
    .attr("id", "zoom-rect")
    .attr("width", WIDTH)
    .attr("height", HEIGHT)
    .style("fill", "none")
    .style("pointer-events", "all")
    .attr("transform", "translate(0," + MARGIN.RIGHT + ")")

  // Add the ClipPath
  let scatter = svg.append("g")
    .attr("id", "scatter")
    .attr("clip-path", "url(#clip)")

  // Create links
  scatter.selectAll(".link")
    .data(graph.links)
    .join("g")
    .attr("id", "link")
    .append("path")
    .attr("id", "linkPath")
    .attr('marker-end', 'url(#arrow)')
    .classed("link", true);

  // Add circles
  scatter
    .selectAll("circle")
    .data(attackPatterns)
    .enter()
    .append("g")
    .attr("id", "node")
    .append("circle")
    .attr("id", "circle")
    .style("cursor", "pointer")
    .attr("cx", function (d) {
      d.x = x(parseTacticNameToXAxis(getTactic(d))) + 35;
      return d.x;
    })
    .attr("cy", function (node) {
      let grouping = graph.nodes.find(grouping => grouping.id === node.groupingId);
      node.y = y(Date.parse(grouping.data.created));
      return node.y;
    })
    .attr("r", 10)
    .style("fill", () => getNodeImage(new Node(undefined, undefined, GROUPING_TYPE)))
    .on("mouseover", showTooltip)
    .on("mousemove", attackPatternMousemove)
    .on("mouseout", hideTooltip)
    .on("click", attackPatternClick)

  svg.selectAll("#node")
    .append("text")
    .attr("id", "node-label")
    .attr("font-size", "0.5em")
    .attr("text-anchor", "middle")
    .attr("x", d => d.x)
    .attr("y", function (node) {
      let grouping = graph.nodes.find(grouping => grouping.id === node.groupingId);
      return y(Date.parse(grouping.data.created)) + 20
    })
    .attr("fill", "#FFFFFF")
    .text((n) => getNodeLabel(n, true));

  graphZoom(scatter, y, yAxis, attackPatterns);

  // Draw links
  svg.selectAll("#linkPath")
    .attr("d", (d) => {
      return "M " + attackPatterns[d.source].x + " " + attackPatterns[d.source].y + " L "
        + attackPatterns[d.target].x + " " + attackPatterns[d.target].y
    })

  // Set link labels
  let linkLabel = svg.selectAll("#link")
    .append("text")
    .attr("dy", "12")
    .attr("id", "link-label")
    .attr("font-size", "0.4em")
    .attr("text-anchor", "middle")
    .attr("fill", "#FFFFFF")
    .text(d => d.relation)
    .attr("x", d => attackPatterns[d.source].x + ((attackPatterns[d.target].x - attackPatterns[d.source].x) / 2))
    .attr("y", d => attackPatterns[d.source].y + ((attackPatterns[d.target].y - attackPatterns[d.source].y) / 2));
}

/**
 * Build the Attack Graph based on the Attack Pattern SDO that are available in the Grouping SDO
 * @param graph
 */
function buildAttackGraph(graph) {
  let attackPatterns = getNodesWithAttackPattern(graph);
  createXAxisWithMitrePhases();

  // Create DIV element for Tooltip
  d3.select("#svg-container")
    .append("div")
    .attr("id", "tooltip")
    .attr("class", "tooltipAttackGraph")
    .style("visibility", "hidden");

  // Create links
  svg.selectAll(".link")
    .data(graph.links)
    .join("g")
    .attr("id", "link")
    .append("line")
    .attr("id", "link-line")
    .attr('marker-end', 'url(#arrow)')
    .classed("link", true);

  // Set link labels
  svg.selectAll("#link")
    .append("text")
    .attr("dy", "12")
    .attr("id", "link-label")
    .attr("font-size", "0.4em")
    .attr("text-anchor", "middle")
    .attr("fill", "#FFFFFF")
    .text(d => d.relation)

  // Add circles
  let nodes = svg.selectAll("circle")
    .data(attackPatterns)
    .join("g")
    .attr("id", "node")
    .append("circle")
    .attr("id", "circle")
    .style("cursor", "pointer")
    .attr("r", 10)
    .style("fill", () => getNodeImage(new Node(undefined, undefined, GROUPING_TYPE)))
    .on("mouseover", (event, n) => showTooltip(event, n))
    .on("mousemove", (event, n) => attackPatternMousemove(event, n))
    .on("mouseout", hideTooltip)
    .on("click", (event, n) => attackPatternClick(event, n));

  createNodeLabels("#node")

  let simulation = d3.forceSimulation()
    .nodes(attackPatterns)
    .force("charge", d3.forceManyBody())
    .force("center", d3.forceCenter(WIDTH / MITRE_ATTACK_CATEGORIES.length, HEIGHT / 4))
    .force("link", d3.forceLink(graph.links).distance(60))
    .on("tick", () => forceDirectedTick("#circle", "#node-label", "#link-line",
      "#link-label"))

  let drag = d3.drag()
    .on("drag", (event, d) => {
      hideTooltip();
      nodeDragged(event, d, simulation);
    })
  nodes.call(drag).on("notificationclick", null);
}

/**
 * Build a force directed sticky sub graph with a Y-Axis where all Meta Features are divided into Layers.
 * @param groupingNode
 */
function buildSubGraph(groupingNode) {
  let subGraph = groupingNode.subGraph;
  let attackPattern = subGraph.nodes.find(node => node.data.type === ATTACK_PATTERN_TYPE);
  let links = subGraph.links;

  // Selected Grouping Node name as heading
  svg.append("g")
    .append("text")
    .attr("id", "selectedGrouping")
    .attr("dy", "-20")
    .attr("dx", "40%")
    .attr("font-size", "0.7em")
    .attr("text-anchor", "middle")
    .attr("fill", "#FFFFFF")
    .text(() => getNodeLabel(attackPattern, true));

  let y = d3.scaleBand()
    .domain(DIAMOND_MODEL_META_FEATURE_CATEGORIES)
    .range([HEIGHT, 0])
  svg.append("g")
    .attr("id", "yAxis")
    .attr("style", "color: white; font-size: 8px")
    .call(d3.axisLeft(y))
    .call(g => g.select(".domain") // Remove axis line
      .remove())

  // Build layer background
  svg.selectAll("background-rect")
    .data(DIAMOND_MODEL_META_FEATURE_CATEGORIES)
    .join("g")
    .attr("id", "layer")
    .append("rect")
    .attr("y", (d, i) => {
      return (HEIGHT / 4) * i;
    })
    .attr("height", HEIGHT / 4)
    .attr("width", WIDTH)
    .attr("opacity", 0.6)
    .attr("fill", function (d, i) {
      return LAYER_COLOR_SCHEMA[i];
    });

  svg.selectAll(".link")
    .data(links)
    .join("g")
    .attr("id", "link")
    .append("line")
    .attr("id", "link-line")
    .attr('marker-end', 'url(#arrow)')
    .classed("link", true)

  svg.selectAll("#link")
    .append("text")
    .attr("dy", "12")
    .attr("id", "link-label")
    .attr("font-size", "0.4em")
    .attr("text-anchor", "middle")
    .attr("fill", "#FFFFFF")
    .text(d => d.relation);

  let node = svg.selectAll(".node")
    .data(subGraph.nodes)
    .join("g")
    .attr("id", "node")
    .append("circle")
    .attr("id", "node-circle")
    .attr("r", 10)
    .style("fill", (n) => getNodeImage(n))
    .classed("fixed", d => d.fx !== undefined)
    .classed("subNode", true)

  createNodeLabels("#node")

  let simulation = d3.forceSimulation()
    .nodes(subGraph.nodes)
    .force("charge", d3.forceManyBody().strength(-100))
    .force("link", d3.forceLink(links).distance(60))
    .on("tick", () => forceDirectedTick("#node-circle", "#node-label", "#link-line",
      "#link-label"))

  let drag = d3.drag()
    .on("start", (event, d) => nodeDragStart(event, d, simulation))
    .on("drag", (event, d) => {
      nodeClick(event, d, simulation)
      return nodeDragged(event, d, simulation);
    })

  node.call(drag)
    .on("click", (event, d) => nodeClick(event, d, simulation))
    .on("dblclick", (event, d) => nodeDblClick(event, d, simulation))

}

function forceDirectedTick(nodeId, nodeLabel, linkId, linkLabel) {
  let radius = 1;
  if ( graphSelection === GRAPH_TYPE.SUB_GRAPH || graphSelection === GRAPH_TYPE.ATTACK_GRAPH) {
    if (graphSelection === GRAPH_TYPE.SUB_GRAPH) {
      let currentLayer = 0;
      // The nodes are divided into multiple layers depending on the node type
      d3.selectAll(nodeId)
        .attr("cx", function (d) {
          return d.x = Math.max(radius, Math.min(WIDTH - radius, d.x));
        })
        .attr("cy", function (d) {
          currentLayer = getDiamondModelCategoryLayer(d);
          if (currentLayer <= 3) {
            return d.y = Math.max((HEIGHT / 4) * currentLayer + radius,
              Math.min(((HEIGHT / 4) + (HEIGHT / 4) * currentLayer) - radius, d.y));
          } else {
            return d.y = Math.max(radius, Math.min(HEIGHT - radius, d.y));
          }
        });
    } else if (graphSelection === GRAPH_TYPE.ATTACK_GRAPH) {
      d3.selectAll(nodeId)
        .attr("cx", function (d) {
          let tacticName = parseTacticNameToXAxis(getTactic(d));
          let currentMitreLayerIndex = MITRE_ATTACK_CATEGORIES.findIndex((d) => d === tacticName);

          return d.x = Math.max((WIDTH / MITRE_ATTACK_CATEGORIES.length) * currentMitreLayerIndex + radius,
            Math.min(((WIDTH / MITRE_ATTACK_CATEGORIES.length)
              + (WIDTH / MITRE_ATTACK_CATEGORIES.length) * currentMitreLayerIndex) + radius, d.x));
        })
        .attr("cy", function (d) {
          return d.y = Math.max(radius, Math.min(HEIGHT - radius, d.y));
        });
    }
    d3.selectAll(nodeLabel)
      .attr("x", d => d.x)
      .attr("y", d => d.y + 20);
    d3.selectAll(linkId)
      .attr("x1", d => d.source.x)
      .attr("y1", d => d.source.y)
      .attr("x2", d => d.target.x)
      .attr("y2", d => d.target.y);
    d3.selectAll(linkLabel)
      .attr("x", d => d.source.x + ((d.target.x - d.source.x) / 2))
      .attr("y", d => d.source.y + ((d.target.y - d.source.y) / 2));
  }
}

function nodeDragStart() {
  d3.select(this).classed("fixed", true);
}

function nodeDragged(event, d, simulation) {
  d.fx = clamp(event.x, 0, WIDTH);
  d.fy = clamp(event.y, 0, HEIGHT);
  simulation.alpha(1).restart();
}

function nodeClick(event, d, simulation, showNodeView = true) {
  if (showNodeView) showNode(d);
}

function nodeDblClick(event, d, simulation) {
  delete d.fx;
  delete d.fy;
  d3.select(this).classed("fixed", false);
  simulation.alpha(1).restart();
}

/**
 * This adds zoom functionality to the svg by using a rect element
 */
function graphZoom(scatter, y, yAxis, attackPatternNodes) {
  let zoom = d3.zoom()
    .on("zoom", (event) => onZoom(event, scatter, y, yAxis, attackPatternNodes));

  svg.select("#zoom-rect")
    .call(zoom);
}

/**
 * This updates the Activity Thread Graph view on a zoom event
 * @param event: Zoom event that is triggered
 * @param scatter:
 * @param y
 * @param yAxis
 * @param attackPatternNodes
 */
function onZoom(event, scatter, y, yAxis, attackPatternNodes) {
  let newY = event.transform.rescaleY(y);
  yAxis.call(d3.axisLeft(newY).tickFormat((d, i) => format(d, i, newY.ticks().length - 1, event.transform.k)));

  // Update node position
  scatter.selectAll("circle")
    .attr("cy", function (d) {
      let grouping = stixGraph.nodes.find(grouping => grouping.id === d.groupingId);
      d.y = newY(Date.parse(grouping.data.created))
      return d.y;
    })
  // Update Node label position
  svg.selectAll("#node-label")
    .attr("y", function (d) {
      let grouping = stixGraph.nodes.find(grouping => grouping.id === d.groupingId);
      return newY(Date.parse(grouping.data.created)) + 20;
    })
  // Update Link position
  svg.selectAll("#linkPath")
    .attr("d", (d) => {
      return "M " + attackPatternNodes[d.source].x + " " + attackPatternNodes[d.source].y + " L "
        + attackPatternNodes[d.target].x + " " + attackPatternNodes[d.target].y
    })
  // Update Link label position
  svg.selectAll("#link-label")
    .attr("x", d =>
      attackPatternNodes[d.source].x + ((attackPatternNodes[d.target].x - attackPatternNodes[d.source].x) / 2))
    .attr("y", d =>
      attackPatternNodes[d.source].y + ((attackPatternNodes[d.target].y - attackPatternNodes[d.source].y) / 2));
}


let formatMillisecond = d3.timeFormat(".%L"),
  formatSecond = d3.timeFormat(":%S"),
  formatMinute = d3.timeFormat("%I:%M"),
  formatHour = d3.timeFormat("%I %p"),
  formatDay = d3.timeFormat("%a %d"),
  formatWeek = d3.timeFormat("%b %d"),
  formatMonth = d3.timeFormat("%B"),
  formatYear = d3.timeFormat("%Y");

function multiFormat(date) {
  return (d3.timeSecond(date) < date ? formatMillisecond
    : d3.timeMinute(date) < date ? formatSecond
      : d3.timeHour(date) < date ? formatMinute
        : d3.timeDay(date) < date ? formatHour
          : d3.timeMonth(date) < date ? (d3.timeWeek(date) < date ? formatDay : formatWeek)
            : d3.timeYear(date) < date ? formatMonth
              : formatYear)(date);
}


function format(d, currentIndex, lastTickIndex, zoomIndex) {
  const weekDayMonth = d3.timeFormat("%a %e");
  // Sticky date on small zoom index
  if (currentIndex === 0 && zoomIndex >= 388 || currentIndex === lastTickIndex && zoomIndex >= 388) {
    return weekDayMonth(d);
  } else {
    return multiFormat(d);
  }
}

function createNodeLabels(id, fullName = true) {
  svg.selectAll(id)
    .append("text")
    .attr("id", "node-label")
    .attr("font-size", "0.5em")
    .attr("text-anchor", "middle")
    .attr("fill", "#FFFFFF")
    .text((n) => getNodeLabel(n, fullName));
}

function showTooltip() {
  d3.select("#tooltip").style("visibility", "visible")
}

function attackPatternMousemove(event, d) {
  d3.select("#tooltip")
    .style("top", (event.pageY - 20) + "px")
    .style("left", () => calcLeftPosition(event, 300))
    .html(d.data.description)
}

function hideTooltip() {
  d3.select("#tooltip").style("visibility", "hidden");
}

function calcLeftPosition(event, tooltipWidth) {
  if ((event.pageX + tooltipWidth) >= event.view.screen.availWidth) {
    return (event.view.screen.availWidth - tooltipWidth) + "px";
  } else {
    return (event.pageX) + "px";
  }
}

function attackPatternClick(event, node) {
  history.replaceState(null, null, ' '); // Remove hash from URL
  graphSelection = GRAPH_TYPE.SUB_GRAPH;
  setCurrentGraphSelection();
  let relevantGroupingNode = stixGraph.nodes.find(n => n.id === node.groupingId);
  createGraph(relevantGroupingNode.subGraph, relevantGroupingNode)
}

function createGraph(graph, node = undefined) {
  if (graph !== undefined) {
    removeGraphComponents();
    activateZoom();
    if (graphSelection === GRAPH_TYPE.SUB_GRAPH) {
      buildSubGraph(node);
    } else if (graphSelection === GRAPH_TYPE.ATTACK_GRAPH) {
      buildAttackGraph(graph);
    } else if (graphSelection === GRAPH_TYPE.ACTIVITY_THREAD) {
      graph = parseBundleToGraph(stixBundle);
      buildActivityThreadGraph(graph);
    }
  }
}

/**
 * Remove all Graph Components from the SVG initial Graph
 */
function removeGraphComponents() {
  svg.selectAll("#xAxis").remove();
  svg.selectAll("#yAxis").remove();
  svg.selectAll("#clip-def").remove();
  svg.selectAll("#node").remove();
  svg.selectAll("#node-label").remove();
  d3.selectAll("#tooltip").remove();
  d3.selectAll("#nodeView").remove();
  svg.selectAll("#link").remove();
  svg.selectAll("#link-label").remove();
  svg.selectAll("#scatter").remove();
  svg.selectAll("#layer").remove();
  svg.selectAll("#zoom-rect").remove();
  d3.select("#overlayView").remove();
  d3.select("#selectedGrouping").remove();
}


function clamp(x, lo, hi) {
  return x < lo ? lo : x > hi ? hi : x;
}

function wrap(text, width) {
  text.each(function () {
    let text = d3.select(this),
      words = text.text().split(/\s+/).reverse(),
      word,
      line = [],
      lineNumber = 0,
      lineHeight = 1.1, // ems
      y = Number(text.attr("y")) - 10,
      dy = parseFloat(text.attr("dy")),
      tspan = text.text(null)
        .append("tspan")
        .attr("x", 0)
        .attr("y", y)
        .attr("dy", dy + "em")
    while (word = words.pop()) {
      line.push(word)
      tspan.text(line.join(" "))
      if (tspan.node().getComputedTextLength() > width) {
        line.pop()
        tspan.text(line.join(" "))
        line = [word]
        tspan = text
          .append("tspan")
          .attr("x", 0)
          .attr("y", y)
          .attr("dy", `${++lineNumber * lineHeight + dy}em`)
          .text(word)
      }
    }
  })
}

function getNodeImage(node) {
  switch (node.type) {
    case GROUPING_TYPE:
      return "url(#groupingImage)";
    case ATTACK_PATTERN_TYPE:
      return "url(#attackPatternImage)";
    case TOOL_TYPE:
      return "url(#toolImage)";
    case MALWARE_TYPE:
      return "url(#malwareImage)";
    case VULNERABILITY_TYPE:
      return "url(#vulnerabilityImage)";
    case IDENTITY_TYPE:
      return "url(#identityImage)";
    case INDICATOR_TYPE:
      return "url(#indicatorImage)"
    case THREAT_ACTOR_TYPE:
      return "url(#threatActorImage)";
    case OBSERVED_DATA_TYPE:
      return "url(#observedDataImage)";
    case CAMPAIGN_TYPE:
      return "url(#campaignImage)";
    case LOCATION_TYPE:
      return "url(#locationImage)";
    case INFRASTRUCTURE_TYPE:
      return "url(#infrastructureImage)";
    case MALWARE_ANALYSIS_TYPE:
      return "url(#malwareAnalysisImage)";
    case NOTE_TYPE:
      return "url(#noteImage)";
    case OPINION_TYPE:
      return "url(#opinionImage)";
    case FILE_TYPE:
      return "url(#fileImage)";
    case DIRECTORY_TYPE:
      return "url(#directoryImage)";
    case NETWORK_TRAFFIC_TYPE:
      return "url(#networkTrafficImage)";
    case PROCESS_TYPE:
      return "url(#processImage)";
    case URL_TYPE:
      return "url(#urlImage)";
    case IPV6_TYPE:
    case IPV4_TYPE:
      return "url(#ipImage)";
    case DOMAIN_TYPE:
      return "url(#domainImage)";
    case AUTONOMOUS_SYSTEM_TYPE:
      return "url(#autonomousImage)";
    case SOFTWARE_TYPE:
      return "url(#softwareImage)";
    case USER_ACCOUNT_TYPE:
      return "url(#userAccountImage)";
    case CODE_TYPE:
      return "url(#codeImage)"
    default:
      return "url(#questionImage)";
  }
}

/**
 * Set Current Graph Selection Text
 */
function setCurrentGraphSelection() {
  let currentSelection = document.getElementById("currentSelection")
  if (graphSelection === GRAPH_TYPE.SUB_GRAPH) {
    currentSelection.textContent = "Current Graph: Sub-Graph";
  } else if (graphSelection === GRAPH_TYPE.ATTACK_GRAPH) {
    currentSelection.textContent = "Current Graph: Attack Graph";
  } else if (graphSelection === GRAPH_TYPE.ACTIVITY_THREAD) {
    currentSelection.textContent = "Current Graph: Activity Thread";
  }
}

function parseSTIXContent(stixContent = null) {
  if (graphSelection === GRAPH_TYPE.SUB_GRAPH) {
    graphSelection = GRAPH_TYPE.ATTACK_GRAPH;
    setCurrentGraphSelection();
  }
  let valid = false;
  eraseSyntaxError();
  stixBundle = stixContent === null ? document.getElementById("stixContent").value : stixContent;
  let bundle = undefined;
  try {
    bundle = JSON.parse(stixBundle);
    checkSyntax(bundle);
    valid = true;
  } catch (e) {
    if (e instanceof Warning) {
      showSyntaxError(e, true)
      valid = true;
    } else {
      showSyntaxError(e)
    }
  }
  if (valid) {
    stixBundle = bundle;
    stixGraph = parseBundleToGraph(bundle);
    createGraph(stixGraph);
  }
}

function showSyntaxError(message, warning = false) {
  let error = document.getElementById("syntaxError");
  error.className = warning === false ? "alert-danger" : "alert-warning";
  error.innerText = message;
}

function eraseSyntaxError() {
  document.getElementById("syntaxError").innerText = "";
}

function showNode(node) {
  removeNodeView();
  createNodeView(node);
}

function createNodeView(node) {
  const nodeViewDIV = document.createElement("div");
  nodeViewDIV.id = "nodeView"
  nodeViewDIV.className = "nodeView"
  nodeViewDIV.innerHTML =
    "<div class='card'>" +
    "<div class='card-header'>" +
    "<button type='button' class='btn' id='view-close-btn'>" +
    "  <svg xmlns=\"http://www.w3.org/2000/svg\" width=\"16\" height=\"16\" fill=\"currentColor\" class=\"bi bi-arrow-right\" viewBox=\"0 0 16 16\">\n" +
    "  <path fill-rule=\"evenodd\" d=\"M1 8a.5.5 0 0 1 .5-.5h11.793l-3.147-3.146a.5.5 0 0 1 .708-.708l4 4a.5.5 0 0 1 0 .708l-4 4a.5.5 0 0 1-.708-.708L13.293 8.5H1.5A.5.5 0 0 1 1 8z\"/>\n" +
    "</svg>" +
    "</button>" +
    "</div>" +
    "<div class='card-body node-body'>" +
    "<h6><div class='row-flex'>" +
    "<div><svg id='node-view-img' width='60' height='70' viewBox='0 -12 1 28'>" +
    "</svg></div>" +
    "<div class='column-flex'><span id='node-title'></span><span class='node-type' id='node-type'></span></div>" +
    "</div></h6>" +
    "<div id='node-content'></div>" +
    "</div>" +
    "</div>"

  document.getElementById("workspace").appendChild(nodeViewDIV);

  createView(node.data, "node-title", "node-content", "node-type")

  d3.select("#node-view-img")
    .append("circle")
    .attr("r", 10)
    .style("fill", () => getNodeImage(node))
  document.getElementById("view-close-btn").addEventListener("click", removeNodeView)
}

function removeNodeView() {
  d3.select("#nodeView").remove();
}

let svg = initGraph("svg",
  WIDTH + MARGIN.LEFT + MARGIN.RIGHT,
  HEIGHT + MARGIN.TOP + MARGIN.BOTTOM, MARGIN.LEFT, MARGIN.TOP);

function activateZoom() {
  let zoom = d3.zoom().on("zoom", zoomed);

  svg.transition()
    .duration(750)
    .call(zoom.transform, d3.zoomIdentity);
  zoom.transform.k = 0;

  d3.select("#svg").call(d3.zoom().on("zoom", zoomed));
  // Do not zoom on a double click event
  d3.select("#svg").on("dblclick.zoom", null);

  d3.select("#zoom-in").on("click", function () {
    zoom.scaleBy(svg.transition().duration(750), 1.2);
  })
  d3.select("#zoom-out").on("click", function () {
    zoom.scaleBy(svg.transition().duration(750), 0.8);
  })
}

function zoomed(event) {
  if (stixGraph !== undefined) {
    let left = event.transform.x + MARGIN.LEFT;
    let top = event.transform.y + MARGIN.TOP;
    svg.attr("transform", "translate(" + left + "," + top + ") scale(" + event.transform.k + ")");
  }
}

addArrowMarker("#mdef")

createGraph();
setCurrentGraphSelection();

document.getElementById("parseButton").addEventListener("click", () =>
  parseSTIXContent(null))


let copyright = document.getElementById("copyright");
copyright.innerText = "© " + new Date().getFullYear() + " Yusuf Khan - ";

// Open Github repo on logo click
function openGithub() {
  window.open("https://github.com/yukh1402/cti-stix-diamond-activity-attack-graph", "_blank").focus();
}

d3.selectAll("#logo").on("click", openGithub)
d3.selectAll("#logo-text").on("click", openGithub)

dragDropFileUpload();

// Drag and Drop file upload
function dragDropFileUpload() {
  eraseSyntaxError();
  let dropRegion = document.getElementById("drop-region"),
    txtPreviewRegion = document.getElementById("txt-preview"),
    fileInput = document.createElement("input");

  fileInput.type = "file";
  fileInput.accept = "text/plain,application/json";
  fileInput.multiple = false;
  dropRegion.addEventListener("click", function () {
    fileInput.click();
  });

  function validateFile(file) {
    return file.type === "text/plain" || file.type === "application/json";
  }

  fileInput.addEventListener("change", function () {
    eraseSyntaxError();
    let file = fileInput.files[0];
    handleFile(file);
  });

  function preventDefault(e) {
    e.preventDefault();
    e.stopPropagation();
  }

  dropRegion.addEventListener('dragenter', preventDefault, false);
  dropRegion.addEventListener('dragleave', preventDefault, false);
  dropRegion.addEventListener('dragover', preventDefault, false);
  dropRegion.addEventListener('drop', preventDefault, false);

  function handleDrop(e) {
    eraseSyntaxError();
    let data = e.dataTransfer,
      file = data.files[0];
    handleFile(file);
  }

  function handleFile(file) {
    if (validateFile(file)) {
      removeDragText()
      uploadFile(file)
    } else {
      showSyntaxError("Only file type .txt is allowed.")
    }
  }

  dropRegion.addEventListener('drop', handleDrop, false);

  function uploadFile(file) {
    d3.select("#file-view").remove();
    let fileView = document.createElement("div");
    fileView.id = "file-view";
    fileView.className = "file-view";
    txtPreviewRegion.appendChild(fileView);

    let previewEl = document.createElement("div");
    previewEl.innerText = file.name;
    fileView.appendChild(previewEl);

    let fileReader = new FileReader();
    fileReader.readAsText(file, "UTF-8")
    fileReader.onload = function (evt) {
      parseSTIXContent(evt.target.result)
    }
  }

  function removeDragText() {
    d3.select("#drop-message").remove();
  }
}
