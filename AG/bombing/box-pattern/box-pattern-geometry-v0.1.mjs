// BOX pattern geometry v0.1 — the attack half of the V2 BOX pattern as world stations and paths,
// built from the BOX v0.2 result (AG/bombing/box-pattern/SPEC.md "BOX Top View geometry").
//
// Frame: the BDP semantic frame of the BOX's own BDP solve (Angle-Off 90°):
//   forwardNm  — along the pre-roll-in heading (the Base Leg heading),
//   turnSideNm — toward the Roll-in turn side (the Attack Heading).
// OA1, Track Point, Release and Target are the BDP stations (Target-based calculation state). The
// pattern is closed backwards from OA1 with the BOX lengths, never from Radius (EFF):
//   Base Turn End = OA1 − Base Leg along the Base Leg heading;
//   Base Turn     = 90° turn of Base Turn Radius from the Downwind heading to the Base Leg heading;
//   OA2 (iBT)     = Base Turn start = end of Abeam Extension;
//   Abeam         = OA2 + Abeam Extension Distance back along the Downwind heading.
// Because Abeam Extension Distance = Base Distance − Base Turn Radius, Abeam lies on the Target's
// abeam line (same turnSideNm as Target); the test pins that closure.
//
// The post-release segments (OUT / CLIMB SEM, Turn to Crosswind, Crosswind Leg, Crosswind Turn) are
// not part of the BOX v0.2 result and are not produced here.

export const BOX_PATTERN_GEOMETRY_MODEL_V0_1 = Object.freeze({
  id: "box-pattern-geometry-v0.1",
  version: "0.1.0",
  status: "Work / Pure Geometry / Not Official",
  source: "box-v2-composition-v0.2 result",
  frame: "BDP_SEMANTIC_FORWARD_TURN_SIDE",
});

const BASE_TURN_ARC_SAMPLES = 24;

function finite(name, value) {
  if (typeof value !== "number" || !Number.isFinite(value)) throw new TypeError(`${name} must be finite`);
  return value;
}

function station(name, value) {
  if (!value) throw new TypeError(`${name} station is required`);
  return { forwardNm: finite(`${name}.forwardNm`, value.forwardNm), turnSideNm: finite(`${name}.turnSideNm`, value.turnSideNm) };
}

const at = (forwardNm, turnSideNm) => ({ forwardNm, turnSideNm });
const range = (a, b) => Math.hypot(b.forwardNm - a.forwardNm, b.turnSideNm - a.turnSideNm);

export function buildBoxPatternGeometryV0_1(boxResult) {
  if (!boxResult?.bombDelivery?.visualization?.semanticState || !boxResult?.pattern) {
    throw new TypeError("boxResult must be a BOX v0.2 pattern result");
  }
  const semantic = boxResult.bombDelivery.visualization.semanticState;
  const pattern = boxResult.pattern;
  const oa1 = station("rollInStart", semantic.stations.rollInStart);
  const trackPoint = station("trackPoint", semantic.stations.trackPoint);
  const target = station("target", semantic.stations.target);
  const release = semantic.stations.release ? station("release", semantic.stations.release) : null;

  const baseLegNm = finite("pattern.baseLegNm", pattern.baseLegNm);
  const baseTurnRadiusNm = finite("pattern.baseRadiusNm", pattern.baseRadiusNm);
  const abeamExtensionDistanceNm = finite("pattern.abeamExtensionDistanceNm", pattern.abeamExtensionDistanceNm);
  const baseDistanceNm = finite("pattern.baseDistanceNm", pattern.baseDistanceNm);

  const baseTurnEnd = at(oa1.forwardNm - baseLegNm, oa1.turnSideNm);
  // Base Turn centre: turn-side of the Base Leg heading at Base Turn End.
  const center = at(baseTurnEnd.forwardNm, baseTurnEnd.turnSideNm + baseTurnRadiusNm);
  const oa2 = at(center.forwardNm - baseTurnRadiusNm, center.turnSideNm);
  const abeam = at(oa2.forwardNm, oa2.turnSideNm + abeamExtensionDistanceNm);
  const baseTurn = Array.from({ length: BASE_TURN_ARC_SAMPLES + 1 }, (_, index) => {
    const angle = (Math.PI / 2) * (index / BASE_TURN_ARC_SAMPLES);
    return at(center.forwardNm - baseTurnRadiusNm * Math.cos(angle), center.turnSideNm - baseTurnRadiusNm * Math.sin(angle));
  });

  return {
    model: { ...BOX_PATTERN_GEOMETRY_MODEL_V0_1 },
    frame: BOX_PATTERN_GEOMETRY_MODEL_V0_1.frame,
    stations: { abeam, oa2, baseTurnEnd, oa1, trackPoint, release, target },
    paths: {
      abeamExtension: [abeam, oa2],
      baseTurn,
      baseLeg: [baseTurnEnd, oa1],
      rollIn: semantic.paths.rollIn.map((point) => station("rollIn", point)),
      attack: [trackPoint, target],
    },
    values: {
      baseDistanceNm,
      abeamExtensionDistanceNm,
      baseTurnRadiusNm,
      baseLegNm,
      targetAbeamRangeNm: range(target, abeam),
      oa1RangeNm: range(target, oa1),
      oa2RangeNm: range(target, oa2),
      // Abeam closure residual along the attack axis (0 when Base Distance, Abeam Extension and
      // Base Turn Radius are consistent).
      abeamClosureNm: abeam.turnSideNm - target.turnSideNm,
    },
  };
}
