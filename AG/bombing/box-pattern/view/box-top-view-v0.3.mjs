import {
  appendAlignedDimension,
  appendDirectedLine,
  applyTextHalo,
  clamp,
  createOpenArrowMarker,
  scopeSvgMarkerIds,
  SVG_DIAGRAM_COLORS_V0_1,
  SVG_DIAGRAM_STYLE_V0_1,
  svgNode,
} from "../../../../common/diagram/svg-primitives-v0.1.mjs?v=0.1.6";
import { createSmartLabelLayout } from "../../../../common/diagram/svg-smart-label-v0.1.mjs?v=0.1.5";
import { createSvgAutoCanvas } from "../../../../common/diagram/svg-viewport-v0.1.mjs?v=0.1.5";
import { formatDeg, formatG, formatNm, formatSec } from "../../../../common/ui/display-precision-v0.1.mjs";
import { buildBoxPatternGeometryV0_1 } from "../box-pattern-geometry-v0.1.mjs";
import { BOX_TOP_VIEW_LEGEND, BOX_VIEW_COLORS as C, boxTopViewTitle } from "./box-view-style-v0.1.mjs";

// BOX #n Top View — BOX-owned view in the V2 unified view grammar (common/diagram/SPEC.md; BOX SPEC
// "BOX Top View — V2 view"). It draws the attack half of the BOX pattern from the BOX v0.2 result:
// Downwind → Abeam → Abeam Extension → OA2 (iBT) → Base Turn → Base Leg → OA1 → Roll-in →
// Track Point → Target. Stations come from box-pattern-geometry-v0.1 (Target-based, closed from
// OA1); this module only projects them.
// - Attack Heading up: the Track Point → Target run points up and the Target is at the top of it, so
//   the Roll-in entry (OA1) sits below the Target. The turn side is drawn as in the Roll-in Top View.
// - Self-contained: fills an empty <svg>, every stroke, fill and text halo is an attribute.
// - Labels sit on their element or are joined to it by a leader line (Common smart labels).
// Successor of the Rev1.5-fidelity box-top-view-v0.1/v0.2 (kept for their consumers).

export const BOX_TOP_VIEW_V0_3 = Object.freeze({
  id: "box-top-view-v0.3",
  version: "0.3.0",
  owner: "AG/bombing/box-pattern/SPEC.md",
  subject: "BOX",
  view: "Top View",
  orientation: "ATTACK_HEADING_UP",
  canvas: Object.freeze({ width: 900, minHeight: 560, maxHeight: 1300 }),
  legend: BOX_TOP_VIEW_LEGEND,
});

export { boxTopViewTitle };

const WIDTH = BOX_TOP_VIEW_V0_3.canvas.width;

// World (NM) → drawing frame: x = forward (Base Leg heading), y = turn side (Attack Heading, up).
const w = (point) => (point ? { x: point.forwardNm, y: point.turnSideNm } : null);
const unit = (from, to) => {
  const length = Math.hypot(to.x - from.x, to.y - from.y) || 1;
  return { x: (to.x - from.x) / length, y: (to.y - from.y) / length };
};
const mid = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

// Label candidates beside a line: close first (no leader), then farther out, then the other side.
function lineCandidates(from, to, side = 1) {
  const d = unit(from, to);
  const n = { x: -d.y * side, y: d.x * side };
  const anchorFor = (dx) => (dx > 6 ? "start" : dx < -6 ? "end" : "middle");
  return [16, 44, 80, -16, -44].map((distance) => ({ dx: n.x * distance, dy: n.y * distance + 5, anchor: anchorFor(n.x * distance) }));
}

const stationCandidates = (preferred) => {
  const all = {
    left: { dx: -14, dy: 4, anchor: "end" },
    right: { dx: 14, dy: 4, anchor: "start" },
    above: { dx: 0, dy: -16, anchor: "middle" },
    below: { dx: 0, dy: 26, anchor: "middle" },
    upLeft: { dx: -16, dy: -14, anchor: "end" },
    upRight: { dx: 16, dy: -14, anchor: "start" },
    downLeft: { dx: -16, dy: 22, anchor: "end" },
    downRight: { dx: 16, dy: 22, anchor: "start" },
  };
  return [...preferred, ...Object.keys(all).filter((key) => !preferred.includes(key))].map((key) => all[key]);
};

export function renderBoxTopView(svg, boxResult, options = {}) {
  if (!(svg instanceof SVGElement)) throw new TypeError("svg must be an SVGElement");
  const geometry = buildBoxPatternGeometryV0_1(boxResult);
  const pattern = boxResult.pattern;
  const pub = boxResult.bombDelivery.public;
  const textScale = clamp(Number(options.textScale) || 1, 0.5, 2);
  const s = geometry.stations;
  const W = {
    abeam: w(s.abeam), oa2: w(s.oa2), baseTurnEnd: w(s.baseTurnEnd), oa1: w(s.oa1), track: w(s.trackPoint), target: w(s.target),
    baseTurn: geometry.paths.baseTurn.map(w),
    rollIn: geometry.paths.rollIn.map(w),
  };
  // Downwind lead-in into the first pattern station (Abeam, or OA2 when the Abeam Extension is not
  // positive): a presentation length, like the Roll-in Top View Initial track.
  const downwindEntry = W.abeam.y >= W.oa2.y ? W.abeam : W.oa2;
  const leadNm = Math.max(0.8, 0.3 * geometry.values.targetAbeamRangeNm);
  W.downwindStart = { x: downwindEntry.x, y: downwindEntry.y + leadNm };
  // Base Distance is measured from the Base Leg line (extended through OA1) up to the Target.
  W.baseLineFoot = { x: W.target.x, y: W.oa1.y };

  const fitPoints = [W.downwindStart, W.abeam, W.oa2, W.baseTurnEnd, W.oa1, W.track, W.target, W.baseLineFoot, ...W.baseTurn, ...W.rollIn];
  const fit = createSvgAutoCanvas(fitPoints, {
    width: WIDTH,
    minHeight: BOX_TOP_VIEW_V0_3.canvas.minHeight,
    maxHeight: BOX_TOP_VIEW_V0_3.canvas.maxHeight,
    // The pattern lies left of the attack run, so its segment labels need the wider left margin.
    margins: { top: 78, bottom: 70, left: 180, right: 170 },
    minSpan: 0.3,
    flipY: true,
  });
  const HEIGHT = fit.height;
  const px = (point) => fit.project(point);
  const P = Object.fromEntries(Object.entries(W).map(([key, value]) => [key, Array.isArray(value) ? value.map(px) : px(value)]));

  // Self-contained canvas.
  svg.replaceChildren();
  svg.setAttribute("viewBox", `0 0 ${WIDTH} ${HEIGHT}`);
  svg.dataset.canvasHeight = String(HEIGHT);
  svg.style.aspectRatio = `${WIDTH} / ${HEIGHT}`;
  const title = boxTopViewTitle({ aircraftNumber: options.aircraftNumber });
  svg.setAttribute("aria-label", title);
  const defs = svgNode("defs");
  [["down", C.downwind], ["abeam", C.abeam], ["base", C.baseLeg], ["roll", C.roll], ["map", C.attack], ["ref", C.reference]]
    .forEach(([name, color]) => defs.append(createOpenArrowMarker(`box-top-${name}`, color)));
  defs.append(createOpenArrowMarker("box-top-leader", SVG_DIAGRAM_COLORS_V0_1.helper, SVG_DIAGRAM_STYLE_V0_1.arrow.leader));
  const root = svgNode("g", { "data-view": BOX_TOP_VIEW_V0_3.id });
  svg.append(defs, root);
  root.append(svgNode("rect", { x: 0, y: 0, width: WIDTH, height: HEIGHT, fill: SVG_DIAGRAM_COLORS_V0_1.background }));

  const polyline = (points) => points.map((p, index) => `${index ? "L" : "M"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
  // Guides: the Target abeam line (Target → Abeam) and the Base Leg line extended through OA1.
  root.append(svgNode("line", {
    x1: P.target.x, y1: P.target.y, x2: P.abeam.x, y2: P.abeam.y,
    stroke: C.guide, "stroke-width": 1.3, "stroke-dasharray": "6 5", "data-top-view-role": "abeam-line",
  }));
  root.append(svgNode("line", {
    x1: P.oa1.x, y1: P.oa1.y, x2: P.baseLineFoot.x + 18, y2: P.baseLineFoot.y,
    stroke: C.baseLeg, "stroke-width": 1.3, "stroke-dasharray": "6 5", opacity: 0.75, "data-top-view-role": "base-leg-extension",
  }));

  // Pattern segments (BOX colours), then the BDP segments (BDP colours).
  appendDirectedLine(root, P.downwindStart, downwindEntry === W.abeam ? P.abeam : P.oa2, { color: C.downwind, width: 3.5, markerEndId: "box-top-down", toGap: 9 });
  if (geometry.values.abeamExtensionDistanceNm > 1e-6) {
    appendDirectedLine(root, P.abeam, P.oa2, { color: C.abeam, width: 3.5, markerEndId: "box-top-abeam", fromGap: 7, toGap: 9 });
  }
  root.append(svgNode("path", {
    d: polyline(P.baseTurn), fill: "none", stroke: C.abeam, "stroke-width": 3.5, "stroke-linecap": "round", "stroke-linejoin": "round",
    "marker-end": "url(#box-top-abeam)", "data-top-view-role": "base-turn",
  }));
  appendDirectedLine(root, P.baseTurnEnd, P.oa1, { color: C.baseLeg, width: 3.5, markerEndId: "box-top-base", fromGap: 4, toGap: 11 });
  root.append(svgNode("path", {
    d: polyline(P.rollIn), fill: "none", stroke: C.roll, "stroke-width": 4.5, "stroke-linecap": "round", "stroke-linejoin": "round",
    "marker-end": "url(#box-top-roll)", "data-top-view-role": "roll-in",
  }));
  appendDirectedLine(root, P.track, P.target, { color: C.attack, width: 3.6, markerEndId: "box-top-map", fromGap: 8, toGap: 12 });

  // Base Distance: Base Leg line → Target, on the side away from the pattern.
  const dimensionOffset = 44;
  const baseDistanceDimension = appendAlignedDimension(root, {
    from: P.baseLineFoot, to: P.target, offset: dimensionOffset, color: C.reference, markerId: "box-top-ref",
    title: "Base Distance", detail: `${formatNm(pattern.baseDistanceNm)} NM`,
    titleSize: SVG_DIAGRAM_STYLE_V0_1.font.dimensionTitlePx * textScale, detailSize: SVG_DIAGRAM_STYLE_V0_1.font.detailPx * textScale,
  });

  // Stations.
  const stationDot = (point, color, key, radius = 5.5) => root.append(svgNode("circle", {
    cx: point.x, cy: point.y, r: radius, fill: "#ffffff", stroke: color, "stroke-width": 2.5, "data-box-station": key,
  }));
  stationDot(P.abeam, C.downwind, "abeam");
  stationDot(P.oa2, C.abeam, "oa2");
  stationDot(P.baseTurnEnd, C.baseLeg, "base-turn-end", 4);
  stationDot(P.oa1, C.roll, "oa1", 7);
  stationDot(P.track, C.roll, "track-point", 4.5);
  root.append(svgNode("circle", { cx: P.target.x, cy: P.target.y, r: 6, fill: C.target, stroke: "#ffffff", "stroke-width": 2, "data-box-station": "target" }));
  root.append(svgNode("line", { x1: P.target.x - 10, y1: P.target.y, x2: P.target.x + 10, y2: P.target.y, stroke: C.target, "stroke-width": 2 }));
  root.append(svgNode("line", { x1: P.target.x, y1: P.target.y - 10, x2: P.target.x, y2: P.target.y + 10, stroke: C.target, "stroke-width": 2 }));

  // In-plot header (top left).
  const headerSize = 15 * textScale;
  root.append(svgNode("text", {
    x: 22, y: 22 + headerSize, fill: C.reference, "font-size": headerSize, "font-weight": 850, "data-top-view-role": "header",
  }, `Angle-Off ${formatDeg(boxResult.fixedAngleOffDeg)}°`));

  // Labels: on their element, or joined to it by a leader (Common smart labels).
  // charWidthEm 0.7: the capital-heavy 850-weight pattern titles run wider than the 0.64 BDP estimate.
  const labels = createSmartLabelLayout(root, { width: WIDTH, height: HEIGHT, labelPad: 8, pathPad: 6, charWidthEm: 0.7 });
  [P.abeam, P.oa2, P.oa1, P.track, P.target].forEach((point) => labels.reservePoint(point, 11));
  labels.reservePoint(P.baseTurnEnd, 7);
  labels.reserveRect({ x: 16, y: 16, w: 230 * textScale, h: headerSize + 14 });
  const reserve = (points, pad = 6) => { for (let i = 1; i < points.length; i += 1) labels.reserveSegment(points[i - 1], points[i], pad); };
  reserve([P.downwindStart, downwindEntry === W.abeam ? P.abeam : P.oa2]);
  reserve([P.abeam, P.oa2]);
  reserve(P.baseTurn);
  reserve([P.baseTurnEnd, P.oa1]);
  reserve(P.rollIn);
  reserve([P.track, P.target]);
  reserve([P.target, P.abeam], 4);
  if (baseDistanceDimension) {
    reserve([baseDistanceDimension.a, baseDistanceDimension.b], 4);
    reserve([P.baseLineFoot, baseDistanceDimension.a], 3);
    reserve([P.target, baseDistanceDimension.b], 3);
  }
  const titleSize = SVG_DIAGRAM_STYLE_V0_1.font.lineTitlePx * textScale;
  const detailSize = SVG_DIAGRAM_STYLE_V0_1.font.detailPx * textScale;
  const stationSize = 12 * textScale;
  const label = (point, text, labelOptions) => labels.append(point, text, {
    background: false,
    movable: options.movableLabels === true,
    fontSize: titleSize,
    detailFontSize: detailSize,
    leaderMarkerId: "box-top-leader",
    ...labelOptions,
  });
  // The pattern lies left of the attack run (turn side up), so segment labels go outward (left/down).
  label(P.target, "Target", { labelKey: "target", color: C.target, fontSize: stationSize, candidates: stationCandidates(["upRight", "right", "above"]) });
  label(mid(P.track, P.target), "MAP", {
    labelKey: "map", color: C.attackText, detail: `${formatNm(pub.groundRangeNm)} NM`,
    candidates: lineCandidates(P.track, P.target, 1),
  });
  label(P.track, "Track Point", { labelKey: "track-point", color: C.rollText, fontSize: stationSize, candidates: stationCandidates(["right", "downRight", "left"]) });
  label(P.oa1, "OA1 (Roll-in)", { labelKey: "oa1", color: C.rollText, fontSize: stationSize, candidates: stationCandidates(["below", "downRight", "downLeft"]) });
  label(mid(P.baseTurnEnd, P.oa1), "Base Leg", {
    labelKey: "base-leg", color: C.baseLegText, detail: `${formatNm(pattern.baseLegNm)} NM`,
    candidates: lineCandidates(P.baseTurnEnd, P.oa1, 1),
  });
  const turnMid = P.baseTurn[Math.floor(P.baseTurn.length / 2)];
  const turnOut = unit(fit.project({ x: W.baseTurnEnd.x, y: W.oa2.y }), turnMid);
  label(turnMid, "Base Turn", {
    labelKey: "base-turn", color: C.abeamText,
    detail: `${formatG(pattern.baseG)} G · ${formatDeg(pattern.baseBankDeg)}° · R ${formatNm(pattern.baseRadiusNm)} NM`,
    candidates: [18, 46, 84].map((distance) => ({ dx: turnOut.x * distance, dy: turnOut.y * distance + 5, anchor: turnOut.x >= 0 ? "start" : "end" })),
  });
  label(P.oa2, "OA2 (iBT)", { labelKey: "oa2", color: C.abeamText, fontSize: stationSize, candidates: stationCandidates(["right", "upRight", "downRight"]) });
  label(mid(P.abeam, P.oa2), "Abeam Extension", {
    labelKey: "abeam-extension", color: C.abeamText,
    detail: `${formatNm(pattern.abeamExtensionDistanceNm)} NM · ${formatSec(pattern.abeamExtensionTimeSec)} s`,
    candidates: lineCandidates(P.abeam, P.oa2, 1),
  });
  label(P.abeam, "Abeam", { labelKey: "abeam", color: C.downwindText, fontSize: stationSize, candidates: stationCandidates(["upRight", "right", "upLeft"]) });
  label(mid(P.downwindStart, downwindEntry === W.abeam ? P.abeam : P.oa2), "Downwind", {
    labelKey: "downwind", color: C.downwindText,
    candidates: lineCandidates(P.downwindStart, downwindEntry === W.abeam ? P.abeam : P.oa2, 1),
  });

  applyTextHalo(root);
  scopeSvgMarkerIds(svg, options.scope ?? "box-top");
  return {
    title,
    orientation: BOX_TOP_VIEW_V0_3.orientation,
    canvas: { width: WIDTH, height: HEIGHT },
    geometry,
    screen: { abeam: P.abeam, oa2: P.oa2, baseTurnEnd: P.baseTurnEnd, oa1: P.oa1, track: P.track, target: P.target },
  };
}
