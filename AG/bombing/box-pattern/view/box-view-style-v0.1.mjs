import { BDP_VIEW_COLORS, bdpViewTitle } from "../../bomb-delivery-planner/view/bdp-view-style-v0.1.mjs";

// BOX view style — BOX-owned colours, titles and legend items for the BOX Top View / Z-Diagram
// (common/diagram/SPEC.md V2 unified view grammar G5, G10; the BOX SPEC owns the content). The
// pattern segments use colours kept apart from the BDP set; Roll-in, Track Point → Target (MAP)
// and Target are BDP segments and use the BDP colours.

export const BOX_VIEW_STYLE_V0_1 = Object.freeze({
  id: "box-view-style-v0.1",
  version: "0.1.0",
});

export const BOX_VIEW_COLORS = Object.freeze({
  downwind: "#0f766e",
  downwindText: "#0b5d57",
  abeam: "#6d3fc4",
  abeamText: "#5b30a8",
  baseLeg: "#475569",
  baseLegText: "#334155",
  roll: BDP_VIEW_COLORS.rollIn,
  rollText: BDP_VIEW_COLORS.rollInText,
  attack: BDP_VIEW_COLORS.map,
  attackText: BDP_VIEW_COLORS.mapText,
  target: BDP_VIEW_COLORS.target,
  reference: "#5b6f82",
  guide: "#b1bbc4",
});

export const BOX_TOP_VIEW_LEGEND = Object.freeze([
  Object.freeze({ label: "Downwind", color: BOX_VIEW_COLORS.downwind }),
  Object.freeze({ label: "Abeam Extension / Base Turn", color: BOX_VIEW_COLORS.abeam }),
  Object.freeze({ label: "Base Leg", color: BOX_VIEW_COLORS.baseLeg }),
  Object.freeze({ label: "Roll-in", color: BOX_VIEW_COLORS.roll }),
  Object.freeze({ label: "MAP", color: BOX_VIEW_COLORS.attack }),
]);

// docs/TERMINOLOGY.md "Diagram titles": pattern views always carry the aircraft number (#1 included).
export function boxViewTitle(view, { aircraftNumber = 1 } = {}) {
  const number = Number(aircraftNumber);
  return bdpViewTitle("BOX", view, { aircraftNumber: Number.isInteger(number) && number > 0 ? number : 1 });
}

export const boxTopViewTitle = (options) => boxViewTitle("Top View", options);
export const boxZDiagramTitle = (options) => boxViewTitle("Z-Diagram", options);
