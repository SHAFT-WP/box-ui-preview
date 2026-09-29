// BOX pattern geometry v0.2 — the whole BOX Rev1.5 racetrack as world stations and paths, built from
// the BOX v0.2 result (AG/bombing/box-pattern/SPEC.md "BOX #n Top View / Z-Diagram — V2 views").
// User decision 2026-09-29 ("박스는 1.5봐봐라"): the V2 BOX Top View follows Rev1.5 — OUT Maneuver,
// OUT Turn, Crosswind Leg, Crosswind Turn, Downwind, Abeam, Abeam Extension, Base Turn, Base Leg,
// Roll-in — with the approved V2 revisions:
// - OA1, Track Point, Release and Target are the BDP stations (Target-based calculation state);
// - Abeam Extension Distance = Base Distance − Base Turn Radius (2026-09-06);
// - the Roll-in side of the pattern is the Roll-in Long. D, the actual OA1 → attack-line offset, where
//   Rev1.5 used the rounded Radius (EFF): Pattern Width = Roll-in Long. D + Crosswind Leg Extension +
//   Crosswind Turn Radius, and the OUT Turn radius equals it (Rev1.5 mirrors the Roll-in).
// The OUT Turn Start, its geometry minimum and the Crosswind Leg minimum follow Rev1.5 `recalc`; the
// composition computes them (`outClosure`, `crossLeg`) and this module reads them.
//
// Frame (NM), Rev1.5's local frame: alongNm along the Attack Heading from the Target (+ past it),
// sideNm toward the pattern side. The BOX v0.2 result carries no L/R; views draw Rev1.5's default
// RIGHT pattern.

export const BOX_PATTERN_GEOMETRY_MODEL_V0_2 = Object.freeze({
  id: "box-pattern-geometry-v0.2",
  // 0.2.1 (2026-09-29): reads the composition's OUT closure and Crosswind Leg minimum.
  version: "0.2.1",
  status: "Work / Pure Geometry / Not Official",
  source: "box-v2-composition-v0.2 result (pattern + out + outClosure + crossLeg)",
  legacyOracle: "BOX Rev1.5 · R_20260831 recalc / draw",
  frame: "ATTACK_ALONG_PATTERN_SIDE",
});

const ARC_SAMPLES = 24;
const M_PER_NM = 1852;
const KT_TO_MPS = 0.514444;
const EPS_NM = 0.5 / M_PER_NM; // Rev1.5 validation tolerance (0.5 m)

function finite(name, value) {
  if (typeof value !== "number" || !Number.isFinite(value)) throw new TypeError(`${name} must be finite`);
  return value;
}

const at = (alongNm, sideNm) => ({ alongNm, sideNm });
// The required minimum is stated rounded up to the NM display step, so entering it satisfies it.
const formatMinimumNm = (nm) => (Math.ceil(nm * 10 - 1e-9) / 10).toFixed(1);
const quarter = (fn) => Array.from({ length: ARC_SAMPLES + 1 }, (_, index) => fn((Math.PI / 2) * (index / ARC_SAMPLES)));

export function buildBoxPatternGeometryV0_2(boxResult) {
  const semantic = boxResult?.bombDelivery?.visualization?.semanticState;
  if (!semantic || !boxResult?.pattern || !boxResult?.out || !boxResult?.outClosure || !boxResult?.crossLeg || !boxResult?.profileSource) {
    throw new TypeError("boxResult must be a BOX v0.2 pattern result with its OUT Maneuver and closure");
  }
  const pattern = boxResult.pattern;
  const out = boxResult.out;
  const pub = boxResult.bombDelivery.public;
  const target = semantic.stations.target;
  // BDP semantic frame (forward = pre-roll-in heading, turn side = Attack Heading) → attack frame.
  const toAttack = (point, name) => at(
    finite(`${name}.turnSideNm`, point.turnSideNm) - target.turnSideNm,
    target.forwardNm - finite(`${name}.forwardNm`, point.forwardNm),
  );

  const rollInSideNm = finite("profileSource.rollInLongitudinalDistanceNm", boxResult.profileSource.rollInLongitudinalDistanceNm);
  const outTurnRadiusNm = rollInSideNm;
  const baseTurnRadiusNm = finite("pattern.baseRadiusNm", pattern.baseRadiusNm);
  const crossTurnRadiusNm = finite("pattern.crossRadiusNm", pattern.crossRadiusNm);
  const crossLegNm = finite("pattern.crossLegExtensionNm", pattern.crossLegExtensionNm);
  const abeamExtensionNm = finite("pattern.abeamExtensionDistanceNm", pattern.abeamExtensionDistanceNm);
  const baseLegNm = finite("pattern.baseLegNm", pattern.baseLegNm);
  const widthNm = finite("pattern.patternWidthNm", pattern.patternWidthNm);

  // Rev1.5 recalc: OUT Turn Start = max(Target, Release + Recovery Distance, geometry minimum).
  const closure = boxResult.outClosure;
  const { effectiveOutNm, outAutoExtensionNm, climbCrossMinNm } = closure;
  const downwindNm = effectiveOutNm + outTurnRadiusNm - crossTurnRadiusNm;

  const oa1 = toAttack(semantic.stations.rollInStart, "rollInStart");
  const trackPoint = toAttack(semantic.stations.trackPoint, "trackPoint");
  const release = toAttack(semantic.stations.release, "release");
  const stations = {
    target: at(0, 0),
    trackPoint,
    release,
    recoveryEnd: at(out.recoveryEndTargetNm, 0),
    outTurnStart: at(effectiveOutNm, 0),
    outTurnEnd: at(effectiveOutNm + outTurnRadiusNm, outTurnRadiusNm),
    crossTurnStart: at(effectiveOutNm + outTurnRadiusNm, outTurnRadiusNm + crossLegNm),
    crossTurnEnd: at(downwindNm, widthNm),
    abeam: at(0, widthNm),
    oa2: at(-abeamExtensionNm, widthNm),
    baseTurnEnd: at(-abeamExtensionNm - baseTurnRadiusNm, widthNm - baseTurnRadiusNm),
    oa1,
  };
  const paths = {
    tracking: [trackPoint, release],
    outManeuver: [release, stations.outTurnStart],
    outTurn: quarter((t) => at(effectiveOutNm + outTurnRadiusNm * Math.sin(t), outTurnRadiusNm * (1 - Math.cos(t)))),
    crossLeg: [stations.outTurnEnd, stations.crossTurnStart],
    crossTurn: quarter((t) => at(
      effectiveOutNm + outTurnRadiusNm - crossTurnRadiusNm * (1 - Math.cos(t)),
      outTurnRadiusNm + crossLegNm + crossTurnRadiusNm * Math.sin(t),
    )),
    downwind: [stations.crossTurnEnd, stations.abeam],
    abeamExtension: [stations.abeam, stations.oa2],
    baseTurn: quarter((t) => at(-abeamExtensionNm - baseTurnRadiusNm * Math.sin(t), widthNm - baseTurnRadiusNm * (1 - Math.cos(t)))),
    baseLeg: [stations.baseTurnEnd, oa1],
    rollIn: semantic.paths.rollIn.map((point) => toAttack(point, "rollIn")),
  };

  // Rev1.5 validateGeometry, on the V2 quantities.
  const errors = [...out.validation.errors];
  if (!(outTurnRadiusNm > 0)) errors.push("Roll-in Long. D / OUT Turn Radius must be greater than 0.");
  if (!(baseTurnRadiusNm > 0)) errors.push("Base Turn Radius must be greater than 0.");
  if (!(crossTurnRadiusNm > 0)) errors.push("Crosswind Turn Radius must be greater than 0.");
  if (abeamExtensionNm < -EPS_NM) errors.push("Abeam Extension Distance must be 0 or greater (Base Turn Radius exceeds Base Distance).");
  // A USER Crosswind Leg below the minimum is kept and reported; DEFAULT was raised by the composition.
  const minCrossLegNm = boxResult.crossLeg.minimumNm;
  if (crossLegNm + EPS_NM < minCrossLegNm) errors.push(`Crosswind Leg Extension is below minimum. Required >= ${formatMinimumNm(minCrossLegNm)} NM.`);
  if (widthNm + EPS_NM < outTurnRadiusNm + baseTurnRadiusNm) errors.push("Pattern Width must be >= Roll-in Long. D + Base Turn Radius.");
  if (baseLegNm < -EPS_NM) errors.push("Base Leg is negative; the Base Turn cannot connect to the Roll-in.");

  // Pattern legs fly the inherited Initial speed (BOX v0.2 speed policy).
  const patternTasKt = finite("profileSource.initialTasRoundedKt", boxResult.profileSource.initialTasRoundedKt);
  const legTimeSec = (distanceNm) => (Math.abs(distanceNm) * M_PER_NM) / (patternTasKt * KT_TO_MPS);

  return {
    model: { ...BOX_PATTERN_GEOMETRY_MODEL_V0_2 },
    frame: BOX_PATTERN_GEOMETRY_MODEL_V0_2.frame,
    direction: "RIGHT",
    stations,
    paths,
    values: {
      patternWidthNm: widthNm,
      rollInLongitudinalDistanceNm: rollInSideNm,
      outTurnRadiusNm,
      baseTurnRadiusNm,
      crossTurnRadiusNm,
      crossLegExtensionNm: crossLegNm,
      abeamExtensionDistanceNm: abeamExtensionNm,
      baseLegNm,
      baseDistanceNm: pattern.baseDistanceNm,
      rollInRangeNm: pub.rollInRangeNm,
      effectiveOutNm,
      outAutoExtensionNm,
      climbCrossMinNm,
      crossLegMinimumNm: minCrossLegNm,
      crossLegAutoExtended: boxResult.crossLeg.autoExtended,
      downwindNm,
      downwindTimeSec: legTimeSec(downwindNm),
      baseLegTimeSec: legTimeSec(baseLegNm),
      patternSpeedKcas: pub.resolvedInitialSpeedKcas,
      // Closure residuals (0 when the V2 quantities are consistent): Base Leg into OA1, and Abeam on the
      // Target abeam line at Base Distance.
      baseLegClosureNm: Math.hypot(
        stations.baseTurnEnd.alongNm - oa1.alongNm,
        stations.baseTurnEnd.sideNm - baseLegNm - oa1.sideNm,
      ),
    },
    validation: { valid: errors.length === 0, errors },
  };
}
