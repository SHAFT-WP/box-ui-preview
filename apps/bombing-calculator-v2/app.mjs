import {
  BOMB_DELIVERY_PLANNER_MODEL_V0_3,
  calculateBombDelivery,
} from "../../AG/bombing/bomb-delivery-planner/bomb-delivery-planner-v0.3.mjs";
import {
  BOX_BE_ENTRYPOINT_V0_2,
  BOX_V2_COMPOSITION_MODEL_V0_2,
  calculateBoxPatternV0_2,
} from "../../AG/bombing/box-pattern/box-be-v0.2.mjs";
import {
  formatDeg,
  formatFt,
  formatG,
  formatKt,
  formatNm,
  formatSec,
} from "../../common/ui/display-precision-v0.1.mjs";
import {
  BDP_TOP_VIEW_V0_2,
  bdpTopViewTitle,
  renderBdpTopView,
} from "../../AG/bombing/bomb-delivery-planner/view/bdp-top-view-v0.2.mjs";
import {
  BOX_TOP_VIEW_V0_3,
  boxTopViewTitle,
  renderBoxTopView,
} from "../../AG/bombing/box-pattern/view/box-top-view-v0.3.mjs";
import { boxZDiagramTitle, renderBoxZDiagram } from "../../AG/bombing/box-pattern/view/box-z-diagram-v0.2.mjs";
import { installSvgLegend } from "../../common/diagram/svg-legend-v0.1.mjs";
import { saveSvgAsPng } from "../../common/diagram/svg-png-export-v0.1.mjs";

const form = document.querySelector("#plannerForm");
const resultBody = document.querySelector("#resultBody");
const status = document.querySelector("#status");
const topView = document.querySelector("#topView");
const topViewTitle = document.querySelector("#topViewTitle");
const topViewLegend = document.querySelector("#topViewLegend");
const topViewPng = document.querySelector("#topViewPng");
const resetButton = document.querySelector("#resetButton");
const modelBadge = document.querySelector("#modelBadge");

const boxForm = document.querySelector("#boxForm");
const boxStatus = document.querySelector("#boxStatus");
const boxSourceBody = document.querySelector("#boxSourceBody");
const boxResultBody = document.querySelector("#boxResultBody");
const boxModelBadge = document.querySelector("#boxModelBadge");
const boxTopView = document.querySelector("#boxTopView");
const boxTopViewHeading = document.querySelector("#boxTopViewTitle");
const boxTopViewLegend = document.querySelector("#boxTopViewLegend");
const boxTopViewPng = document.querySelector("#boxTopViewPng");
const boxZ = document.querySelector("#boxZ");
const boxZHeading = document.querySelector("#boxZTitle");
const boxZPng = document.querySelector("#boxZPng");

const NUMERIC_FIELDS = Object.freeze([
  "targetElevationMslFt",
  "releaseSpeedKcas",
  "speedOvershootKcas",
  "fragmentHeightMarginPercent",
  "maneuverInitiationDelaySec",
  "recoveryG",
  "gOnsetTimeSec",
  "diveAngleDeg",
  "releaseFpaDeg",
  "windDirectionDeg",
  "windSpeedKt",
  "initialSpeedValue",
  "initialAltitudeMslFt",
  "trackingTimeSec",
  "releaseAltitudeMslFt",
  "angleOffDeg",
  "rollInBankAngleDeg",
  "rollInG",
]);

const BOX_NUMERIC_FIELDS = Object.freeze([
  "baseTurnG",
  "crossTurnG",
  "crossLegExtensionNm",
]);

// Display precision (docs/TERMINOLOGY.md): NM 1 decimal; s, ft, kt and angles integer; G 1 decimal.
const RESULT_ROWS = Object.freeze([
  ["Effective Release Altitude", "effectiveReleaseAltitudeMslFt", "ft MSL", formatFt],
  ["Resolved Initial Altitude", "resolvedInitialAltitudeMslFt", "ft MSL", formatFt],
  ["Resolved Initial Speed", "resolvedInitialSpeedKcas", "KCAS", formatKt],
  ["Track Point Altitude", "trackPointAltitudeMslFt", "ft MSL", formatFt],
  ["Tracking Time", "trackingTimeSec", "s", formatSec],
  ["Roll-in Range", "rollInRangeNm", "NM", formatNm],
  ["MAP", "groundRangeNm", "NM", formatNm],
  ["Down Range Travel", "downRangeTravelNm", "NM", formatNm],
  ["Bomb Range", "bombRangeNm", "NM", formatNm],
  ["Bomb TOF", "bombTofSec", "s", formatSec],
  ["Radius (EFF)", "rollInRadiusNm", "NM", formatNm],
  ["Roll-in Time", "rollInTimeSec", "s", formatSec],
  ["Roll-in Ground Arc", "rollInGroundArcNm", "NM", formatNm],
  ["Base Distance", "baseDistanceNm", "NM", formatNm],
  ["Base Distance (S)", "baseDistanceSlantNm", "NM", formatNm],
  ["Roll-in Altitude Loss", "rollInAltitudeLossFt", "ft", formatFt],
  ["Roll-in LA", "leadAngleDeg", "°", formatDeg],
  ["MINALT", "minAltMslFt", "ft MSL", formatFt],
  ["NLT Release", "nltReleaseMslFt", "ft MSL", formatFt],
]);

const BOX_SOURCE_ROWS = Object.freeze([
  ["BOX Angle-Off", "fixedAngleOffDeg", "°", formatDeg],
  ["Initial TAS", "initialTasRoundedKt", "KTAS", formatKt],
  ["MAP", "groundRangeRoundedNm", "NM", formatNm],
  ["Radius (EFF)", "rollInRadiusRoundedNm", "NM", formatNm],
  ["Roll-in Range", "rollInRangeRoundedNm", "NM", formatNm],
  ["Base Distance", "baseDistanceNm", "NM", formatNm],
]);

const BOX_RESULT_ROWS = Object.freeze([
  ["Base Turn G", "baseG", "G", formatG],
  ["Base Turn Bank", "baseBankDeg", "°", formatDeg],
  ["Base Turn Radius", "baseRadiusNm", "NM", formatNm],
  ["Crosswind Turn G", "crossG", "G", formatG],
  ["Crosswind Turn Bank", "crossBankDeg", "°", formatDeg],
  ["Crosswind Turn Radius", "crossRadiusNm", "NM", formatNm],
  ["Abeam Extension Distance", "abeamExtensionDistanceNm", "NM", formatNm],
  ["Abeam Extension Time", "abeamExtensionTimeSec", "s", formatSec],
  ["Crosswind Leg Extension", "crossLegExtensionNm", "NM", formatNm],
  ["Crosswind Leg Time", "crossLegTimeSec", "s", formatSec],
  ["Pattern Width", "patternWidthNm", "NM", formatNm],
  ["Base Leg", "baseLegNm", "NM", formatNm],
]);

function readForm(formElement, numericFields) {
  const data = Object.fromEntries(new FormData(formElement).entries());
  for (const field of numericFields) {
    const value = Number(data[field]);
    if (!Number.isFinite(value)) throw new TypeError(`${field} must be a number`);
    data[field] = value;
  }
  return data;
}

function readPlannerInput() {
  return readForm(form, NUMERIC_FIELDS);
}

function readBoxInput() {
  return readForm(boxForm, BOX_NUMERIC_FIELDS);
}

function formatValue(value, format) {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return format(value);
}

function renderRows(tbody, source, rows) {
  tbody.replaceChildren();
  for (const [label, key, unit, format] of rows) {
    const row = document.createElement("tr");
    const labelCell = document.createElement("th");
    const valueCell = document.createElement("td");
    labelCell.scope = "row";
    // Result notation (docs/TERMINOLOGY.md): unit in the title, numeric-only value.
    labelCell.textContent = `${label} (${unit})`;
    valueCell.textContent = formatValue(source[key], format);
    row.append(labelCell, valueCell);
    tbody.append(row);
  }
}

function renderResults(result) {
  renderRows(resultBody, result.public, RESULT_ROWS);
}

function renderBoxResults(result) {
  renderRows(
    boxSourceBody,
    {
      fixedAngleOffDeg: result.fixedAngleOffDeg,
      ...result.profileSource,
    },
    BOX_SOURCE_ROWS,
  );
  renderRows(boxResultBody, result.pattern, BOX_RESULT_ROWS);
}

function clearBoxResults() {
  boxSourceBody.replaceChildren();
  boxResultBody.replaceChildren();
  boxTopView.replaceChildren();
  boxZ.replaceChildren();
}

// BOX #1 Top View / Z-Diagram: BOX-owned views over the BOX v0.2 result (common/diagram/SPEC.md F1-F4).
function renderBoxDiagrams(result) {
  renderBoxTopView(boxTopView, result);
  renderBoxZDiagram(boxZ, result);
}

// Roll-in Top View: the BDP-owned view draws everything inside the svg (common/diagram/SPEC.md F1-F4);
// the shell supplies the empty svg, the title, the legend and the PNG button.
function renderTopView(result) {
  renderBdpTopView(topView, result);
}

function pngFileName(title) {
  return `${title.replaceAll(" ", "_")}.png`;
}

function setStatus(element, message, kind = "ok") {
  element.textContent = message;
  element.dataset.kind = kind;
}

function calculatePlanner(input) {
  const result = calculateBombDelivery(input);
  renderResults(result);
  renderTopView(result);
  setStatus(
    status,
    `${result.model.id} · ballistic ${result.diagnostics.ballisticModelId} · calculation complete`,
    "ok",
  );
  return result;
}

function calculateBox(plannerInput) {
  const boxInput = readBoxInput();
  const result = calculateBoxPatternV0_2({
    bombDeliveryInput: plannerInput,
    ...boxInput,
  });
  renderBoxResults(result);
  renderBoxDiagrams(result);
  const plannerAngle = Number(plannerInput.angleOffDeg);
  const angleNote = plannerAngle === result.fixedAngleOffDeg
    ? ""
    : ` · planner display ${formatValue(plannerAngle, formatDeg)}°, BOX source fixed ${formatDeg(result.fixedAngleOffDeg)}°`;
  setStatus(
    boxStatus,
    `${result.model.id} · BDP ${result.bombDelivery.model.id}${angleNote}`,
    "ok",
  );
  return result;
}

function calculateAndRender() {
  try {
    const input = readPlannerInput();
    calculatePlanner(input);
    calculateBox(input);
  } catch (error) {
    resultBody.replaceChildren();
    topView.replaceChildren();
    clearBoxResults();
    const message = error instanceof Error ? error.message : String(error);
    setStatus(status, message, "error");
    setStatus(boxStatus, message, "error");
  }
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  calculateAndRender();
});

boxForm.addEventListener("submit", (event) => {
  event.preventDefault();
  try {
    const input = readPlannerInput();
    calculateBox(input);
  } catch (error) {
    clearBoxResults();
    setStatus(boxStatus, error instanceof Error ? error.message : String(error), "error");
  }
});

resetButton.addEventListener("click", () => {
  form.reset();
  boxForm.reset();
  calculateAndRender();
});

topViewTitle.textContent = bdpTopViewTitle();
topView.setAttribute("aria-label", bdpTopViewTitle());
installSvgLegend(topViewLegend, BDP_TOP_VIEW_V0_2.legend);
topViewPng.addEventListener("click", () => saveSvgAsPng(topView, pngFileName(bdpTopViewTitle())));
boxTopViewHeading.textContent = boxTopViewTitle();
boxTopView.setAttribute("aria-label", boxTopViewTitle());
installSvgLegend(boxTopViewLegend, BOX_TOP_VIEW_V0_3.legend);
boxTopViewPng.addEventListener("click", () => saveSvgAsPng(boxTopView, pngFileName(boxTopViewTitle())));
boxZHeading.textContent = boxZDiagramTitle();
boxZ.setAttribute("aria-label", boxZDiagramTitle());
boxZPng.addEventListener("click", () => saveSvgAsPng(boxZ, pngFileName(boxZDiagramTitle())));

modelBadge.textContent = `${BOMB_DELIVERY_PLANNER_MODEL_V0_3.id} · ${BOMB_DELIVERY_PLANNER_MODEL_V0_3.version}`;
boxModelBadge.textContent = `${BOX_BE_ENTRYPOINT_V0_2.officialRevision} oracle · ${BOX_V2_COMPOSITION_MODEL_V0_2.id}`;
calculateAndRender();
