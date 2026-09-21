import {
  BOMB_DELIVERY_PLANNER_MODEL_V0_3,
  calculateBombDelivery,
} from "../../AG/bombing/bomb-delivery-planner/bomb-delivery-planner-v0.3.mjs";
import {
  BOX_BE_ENTRYPOINT_V0_2,
  BOX_V2_COMPOSITION_MODEL_V0_2,
  calculateBoxPatternV0_2,
} from "../../AG/bombing/box-pattern/box-be-v0.2.mjs";

const form = document.querySelector("#plannerForm");
const resultBody = document.querySelector("#resultBody");
const status = document.querySelector("#status");
const topView = document.querySelector("#topView");
const resetButton = document.querySelector("#resetButton");
const modelBadge = document.querySelector("#modelBadge");

const boxForm = document.querySelector("#boxForm");
const boxStatus = document.querySelector("#boxStatus");
const boxSourceBody = document.querySelector("#boxSourceBody");
const boxResultBody = document.querySelector("#boxResultBody");
const boxModelBadge = document.querySelector("#boxModelBadge");

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

const RESULT_ROWS = Object.freeze([
  ["Effective Release Altitude", "effectiveReleaseAltitudeMslFt", "ft MSL", 0],
  ["Resolved Initial Altitude", "resolvedInitialAltitudeMslFt", "ft MSL", 0],
  ["Resolved Initial Speed", "resolvedInitialSpeedKcas", "KCAS", 0],
  ["Track Point Altitude", "trackPointAltitudeMslFt", "ft MSL", 0],
  ["Tracking Time", "trackingTimeSec", "sec", 1],
  ["Roll-in Range", "rollInRangeNm", "NM", 2],
  ["MAP", "groundRangeNm", "NM", 2],
  ["Down Range Travel", "downRangeTravelNm", "NM", 2],
  ["Bomb Range", "bombRangeNm", "NM", 2],
  ["Bomb TOF", "bombTofSec", "sec", 1],
  ["Radius (EFF)", "rollInRadiusNm", "NM", 2],
  ["Roll-in Time", "rollInTimeSec", "sec", 1],
  ["Roll-in Ground Arc", "rollInGroundArcNm", "NM", 2],
  ["Base Distance", "baseDistanceNm", "NM", 2],
  ["Base Distance (S)", "baseDistanceSlantNm", "NM", 2],
  ["Roll-in Altitude Loss", "rollInAltitudeLossFt", "ft", 0],
  ["Roll-in LA", "leadAngleDeg", "deg", 1],
  ["MINALT", "minAltMslFt", "ft MSL", 0],
  ["NLT Release", "nltReleaseMslFt", "ft MSL", 0],
]);

const BOX_SOURCE_ROWS = Object.freeze([
  ["BOX Angle-Off", "fixedAngleOffDeg", "deg", 0],
  ["Initial TAS", "initialTasRoundedKt", "kt", 1],
  ["MAP", "groundRangeRoundedNm", "NM", 1],
  ["Radius (EFF)", "rollInRadiusRoundedNm", "NM", 1],
  ["Roll-in Range", "rollInRangeRoundedNm", "NM", 1],
  ["Base Distance", "baseDistanceNm", "NM", 2],
]);

const BOX_RESULT_ROWS = Object.freeze([
  ["Base Turn G", "baseG", "G", 1],
  ["Base Turn Bank", "baseBankDeg", "deg", 1],
  ["Base Turn Radius", "baseRadiusNm", "NM", 2],
  ["Crosswind Turn G", "crossG", "G", 1],
  ["Crosswind Turn Bank", "crossBankDeg", "deg", 1],
  ["Crosswind Turn Radius", "crossRadiusNm", "NM", 2],
  ["Abeam Extension Distance", "abeamExtensionDistanceNm", "NM", 2],
  ["Abeam Extension Time", "abeamExtensionTimeSec", "sec", 1],
  ["Crosswind Leg Extension", "crossLegExtensionNm", "NM", 2],
  ["Crosswind Leg Time", "crossLegTimeSec", "sec", 1],
  ["Pattern Width", "patternWidthNm", "NM", 2],
  ["Base Leg", "baseLegNm", "NM", 2],
]);

const SVG_NS = "http://www.w3.org/2000/svg";

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

function formatValue(value, decimals) {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return value.toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function renderRows(tbody, source, rows) {
  tbody.replaceChildren();
  for (const [label, key, unit, decimals] of rows) {
    const row = document.createElement("tr");
    const labelCell = document.createElement("th");
    const valueCell = document.createElement("td");
    labelCell.scope = "row";
    labelCell.textContent = label;
    valueCell.textContent = `${formatValue(source[key], decimals)} ${unit}`;
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
}

function svgElement(name, attributes = {}) {
  const node = document.createElementNS(SVG_NS, name);
  for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, String(value));
  return node;
}

function collectSemanticPoints(semantic) {
  const stationPoints = Object.values(semantic.stations).filter(Boolean);
  return [
    ...stationPoints,
    ...semantic.paths.rollIn,
    ...semantic.paths.tracking,
    ...semantic.paths.bomb,
  ].filter((point) => Number.isFinite(point.forwardNm) && Number.isFinite(point.turnSideNm));
}

function buildProjection(points) {
  const width = 720;
  const height = 520;
  const margin = 54;
  const forwards = points.map((point) => point.forwardNm);
  const sides = points.map((point) => point.turnSideNm);
  let minForward = Math.min(...forwards);
  let maxForward = Math.max(...forwards);
  let minSide = Math.min(...sides);
  let maxSide = Math.max(...sides);

  const forwardSpan = Math.max(maxForward - minForward, 0.25);
  const sideSpan = Math.max(maxSide - minSide, 0.25);
  minForward -= forwardSpan * 0.08;
  maxForward += forwardSpan * 0.08;
  minSide -= sideSpan * 0.12;
  maxSide += sideSpan * 0.12;

  const scale = Math.min(
    (width - margin * 2) / (maxForward - minForward),
    (height - margin * 2) / (maxSide - minSide),
  );

  const usedWidth = (maxForward - minForward) * scale;
  const usedHeight = (maxSide - minSide) * scale;
  const offsetX = (width - usedWidth) / 2;
  const offsetY = (height - usedHeight) / 2;

  return (point) => ({
    x: offsetX + (point.forwardNm - minForward) * scale,
    y: height - (offsetY + (point.turnSideNm - minSide) * scale),
  });
}

function pathData(points, project) {
  return points
    .map((point, index) => {
      const screen = project(point);
      return `${index === 0 ? "M" : "L"} ${screen.x.toFixed(2)} ${screen.y.toFixed(2)}`;
    })
    .join(" ");
}

function addPath(points, project, className) {
  if (!points || points.length < 2) return;
  topView.append(svgElement("path", {
    d: pathData(points, project),
    class: className,
    fill: "none",
  }));
}

function addStation(name, point, project) {
  if (!point) return;
  const screen = project(point);
  const group = svgElement("g", { class: "station" });
  group.append(svgElement("circle", { cx: screen.x, cy: screen.y, r: 5 }));
  const label = svgElement("text", { x: screen.x + 9, y: screen.y - 9 });
  label.textContent = name;
  group.append(label);
  topView.append(group);
}

function renderTopView(result) {
  const semantic = result.visualization.semanticState;
  const points = collectSemanticPoints(semantic);
  topView.replaceChildren();

  if (!points.length) return;
  const project = buildProjection(points);

  const grid = svgElement("rect", { x: 1, y: 1, width: 718, height: 518, class: "plot-frame" });
  topView.append(grid);

  addPath(semantic.paths.rollIn, project, "path-rollin");
  addPath(semantic.paths.tracking, project, "path-tracking");
  addPath(semantic.paths.bomb, project, "path-bomb");

  addStation("Roll-in Start", semantic.stations.rollInStart, project);
  addStation("Track Point", semantic.stations.trackPoint, project);
  addStation("Release", semantic.stations.release, project);
  addStation("Target", semantic.stations.target, project);
  if (semantic.stations.aimOffPoint) addStation("Aim-off", semantic.stations.aimOffPoint, project);
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
  const plannerAngle = Number(plannerInput.angleOffDeg);
  const angleNote = plannerAngle === result.fixedAngleOffDeg
    ? ""
    : ` · planner display ${formatValue(plannerAngle, 1)}°, BOX source fixed ${result.fixedAngleOffDeg}°`;
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

modelBadge.textContent = `${BOMB_DELIVERY_PLANNER_MODEL_V0_3.id} · ${BOMB_DELIVERY_PLANNER_MODEL_V0_3.version}`;
boxModelBadge.textContent = `${BOX_BE_ENTRYPOINT_V0_2.officialRevision} oracle · ${BOX_V2_COMPOSITION_MODEL_V0_2.id}`;
calculateAndRender();
