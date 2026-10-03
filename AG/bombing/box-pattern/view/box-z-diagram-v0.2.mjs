import { buildBdpZDiagramData } from "../../bomb-delivery-planner/view/bdp-z-diagram-v0.1.mjs";
import { renderCommonZDiagram } from "../../../../common/diagram/z-diagram/z-diagram-v0.1.mjs?v=0.1.11";
import { svgNode } from "../../../../common/diagram/svg-primitives-v0.1.mjs?v=0.1.6";
import { formatDeg, formatG, formatKt, formatSec } from "../../../../common/ui/display-precision-v0.1.mjs";
import { boxZDiagramTitle } from "./box-view-style-v0.1.mjs";

// BOX #n Z-Diagram — the BDP Z of the BOX's own BDP solve (Angle-Off 90°) with the BOX rows (Common
// Z grammar; BOX SPEC "BOX Z-Diagram ownership"). Reads the BOX v0.2 result directly: the Abeam
// Extension and Base Turn speeds are the BOX v0.2 inherited Initial speed (BOX SPEC "Abeam
// Extension"), so the FE passes no display state. Values use the Common display formatters.
// Successor of box-z-diagram-v0.1.mjs (kept for its consumers).

export const BOX_Z_DIAGRAM_V0_2 = Object.freeze({
  id: "box-z-diagram-v0.2",
  version: "0.2.0",
  owner: "AG/bombing/box-pattern/SPEC.md",
  subject: "BOX",
  view: "Z-Diagram",
  commonRenderer: "common-z-diagram-v0.1",
});

export { boxZDiagramTitle };

// The BOX rows under the Common Z body.
export function buildBoxZDiagramRows(boxResult) {
  const pub = boxResult.bombDelivery.public;
  const pattern = boxResult.pattern;
  // BOX v0.2 flies Abeam Extension and Base Turn at the inherited Initial speed.
  const patternSpeedKcas = pub.resolvedInitialSpeedKcas;
  return [
    { label: "Abeam Extension Time", value: `${formatSec(pattern.abeamExtensionTimeSec)} s` },
    {
      label: "Base Turn Speed / G / Bank",
      value: `${formatKt(patternSpeedKcas)} KCAS / ${formatG(pattern.baseG)} G / ${formatDeg(pattern.baseBankDeg)}°`,
    },
  ];
}

export function renderBoxZDiagram(svg, boxResult, options = {}) {
  if (!(svg instanceof SVGElement)) throw new TypeError("svg must be an SVGElement");
  if (!boxResult?.bombDelivery || !boxResult?.pattern) throw new TypeError("boxResult must be a BOX v0.2 pattern result");
  const title = boxZDiagramTitle({ aircraftNumber: options.aircraftNumber });
  svg.setAttribute("aria-label", title);
  const data = buildBdpZDiagramData(boxResult.bombDelivery);
  svg.replaceChildren();
  if (!data.supported) {
    svg.setAttribute("viewBox", "0 0 650 220");
    svg.style.aspectRatio = "650 / 220";
    svg.append(svgNode("rect", { x: 0, y: 0, width: 650, height: 220, fill: "#ffffff" }));
    const message = data.reason === "LEVEL_NO_Z_DIAGRAM" ? "LEVEL profile · Z-Diagram not applicable" : "Dive angle below 10° · Z-Diagram unavailable";
    for (const [y, text, size] of [[82, `${data.profileTitle} · BOX`, 24], [132, message, 16]]) {
      svg.append(svgNode("text", { x: 325, y, "text-anchor": "middle", "font-size": size, "font-weight": 850, fill: "#14202c" }, text));
    }
    return { title, rendered: false, data };
  }
  const root = svg.appendChild(svgNode("g", { "data-z-root": "", "data-view": BOX_Z_DIAGRAM_V0_2.id }));
  renderCommonZDiagram(svg, {
    ...data,
    beTitle: "BOX",
    uniformBodyText: true,
    compactAngleLabels: true,
    extraRows: buildBoxZDiagramRows(boxResult),
  });
  // White canvas under the Common Z body (G1).
  const box = svg.viewBox.baseVal;
  root.prepend(svgNode("rect", { x: 0, y: 0, width: box.width, height: box.height, fill: "#ffffff" }));
  return { title, rendered: true, data };
}
