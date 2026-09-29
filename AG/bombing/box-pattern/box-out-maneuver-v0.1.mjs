import { casToTas } from "../../../common/airspeed/airspeed-v0.1.mjs";
import { truncateBeOutput } from "../../../common/ui/display-precision-v0.1.mjs";

// BOX OUT Maneuver v0.1 — the BOX Rev1.5 OUT (Recovery + CLIMB) ported to a pure V2 BE module
// (user decision 2026-09-29: "박스는 1.5봐봐라" → Rev1.5 OUT is used until OUT moves to the V2
// CLIMB SEM / CSEM boundary; AG/bombing/box-pattern/SPEC.md "OUT Maneuver — Rev1.5 port").
// Equations, constants and defaults follow Rev1.5 `calcOut` (bombing/box-pattern/box-pattern.html);
// the inputs come from the V2 BDP result instead of the embedded profile.

export const BOX_OUT_MANEUVER_MODEL_V0_1 = Object.freeze({
  id: "box-out-maneuver-v0.1",
  version: "0.1.0",
  status: "Work / Rev1.5-equivalent OUT / Not Official",
  legacyOracle: "BOX Rev1.5 · R_20260831 calcOut",
});

const FT_PER_NM = 6076.11549;
const M_PER_NM = 1852;
const KT_TO_FPS = 1.687809857;
const KT_TO_MPS = 0.514444;
const G_FPS2 = 32.174;
const G_MPS2 = 9.80665;
const OUT_MODES = Object.freeze(["CLIMB", "LEVEL"]);

function finite(name, value) {
  if (typeof value !== "number" || !Number.isFinite(value)) throw new TypeError(`${name} must be finite`);
  return value;
}

// Rev1.5 `syncOutDefaults`: OUT Speed = Release Speed, Recovery G 5, Climb Angle = Dive − 10°,
// Climb G = Recovery G / 2, Level-off Speed = Initial KCAS, mode CLIMB.
export function resolveBoxOutInputsV0_1(bombDeliveryResult, options = {}) {
  const input = bombDeliveryResult.canonicalInputs;
  const pub = bombDeliveryResult.public;
  const mode = options.outMode ?? "CLIMB";
  if (!OUT_MODES.includes(mode)) throw new RangeError("outMode must be CLIMB or LEVEL");
  const recoveryG = finite("outRecoveryG", options.outRecoveryG ?? 5);
  return {
    mode,
    outSpeedKcas: finite("outSpeedKcas", options.outSpeedKcas ?? input.releaseSpeedKcas),
    recoveryG,
    climbAngleDeg: finite("outClimbAngleDeg", options.outClimbAngleDeg ?? Math.max(0, input.diveAngleDeg - 10)),
    climbG: finite("outClimbG", options.outClimbG ?? recoveryG / 2),
    levelOffSpeedKcas: finite("outLevelOffSpeedKcas", options.outLevelOffSpeedKcas ?? pub.resolvedInitialSpeedKcas),
  };
}

export function calculateBoxOutManeuverV0_1(bombDeliveryResult, options = {}) {
  return truncateBeOutput(calculateBoxOutManeuverV0_1Full(bombDeliveryResult, options));
}

// options: the OUT overrides of resolveBoxOutInputsV0_1, plus outTurnRadiusNm (the BOX OUT Turn
// radius, which Rev1.5 takes from the Roll-in side of the pattern) for the OUT Turn bank.
export function calculateBoxOutManeuverV0_1Full(bombDeliveryResult, options = {}) {
  if (!bombDeliveryResult?.public || !bombDeliveryResult?.canonicalInputs) {
    throw new TypeError("bombDeliveryResult must be a Bomb Delivery Planner v0.3 result");
  }
  const input = bombDeliveryResult.canonicalInputs;
  const pub = bombDeliveryResult.public;
  const out = resolveBoxOutInputsV0_1(bombDeliveryResult, options);
  const theta = (finite("diveAngleDeg", input.diveAngleDeg) * Math.PI) / 180;
  const releaseMslFt = finite("effectiveReleaseAltitudeMslFt", pub.effectiveReleaseAltitudeMslFt);
  const initialMslFt = finite("resolvedInitialAltitudeMslFt", pub.resolvedInitialAltitudeMslFt);

  // Recovery: Maneuver Initiation Delay straight, then a pull to level at Recovery G.
  const outTasKt = casToTas(Math.max(1, out.outSpeedKcas), releaseMslFt);
  const speedFps = outTasKt * KT_TO_FPS;
  const delaySec = Math.max(0, finite("maneuverInitiationDelaySec", input.maneuverInitiationDelaySec));
  const recoveryLoadFactor = Math.max(1.01, out.recoveryG);
  const delayHorizontalFt = speedFps * Math.cos(theta) * delaySec;
  const delayLossFt = speedFps * Math.sin(theta) * delaySec;
  const recoveryRadiusFt = (speedFps * speedFps) / (G_FPS2 * Math.max(0.01, recoveryLoadFactor - Math.cos(theta)));
  const pullHorizontalFt = recoveryRadiusFt * Math.sin(theta);
  const pullAltitudeFt = recoveryRadiusFt * (1 - Math.cos(theta));
  // Rev1.5 as written: the pull term is added (SPEC "OUT Maneuver — Rev1.5 port" records this sign).
  const levelOffAltitudeMslFt = releaseMslFt - delayLossFt + pullAltitudeFt;
  const recoveryDistanceFt = delayHorizontalFt + pullHorizontalFt;

  // CLIMB: pitch-up arc to the Climb Angle at Climb G, then a straight climb to the Initial altitude.
  const errors = [];
  let climbDistanceFt = 0;
  if (out.mode === "CLIMB") {
    const pitch = (Math.max(0, out.climbAngleDeg) * Math.PI) / 180;
    if (initialMslFt > levelOffAltitudeMslFt + 1 && pitch <= 1e-9) {
      errors.push("CLIMB mode cannot reach the Initial altitude with Climb Angle 0°.");
    } else if (initialMslFt > levelOffAltitudeMslFt + 1) {
      const endTasKt = casToTas(Math.max(1, out.levelOffSpeedKcas), initialMslFt);
      const averageFps = ((outTasKt + endTasKt) / 2) * KT_TO_FPS;
      const climbLoadFactor = Math.max(1.01, out.climbG);
      const arcRadiusFt = (averageFps * averageFps) / (G_FPS2 * Math.max(0.01, climbLoadFactor - Math.cos(pitch / 2)));
      const arcHorizontalFt = arcRadiusFt * Math.sin(pitch);
      const arcGainFt = arcRadiusFt * (1 - Math.cos(pitch));
      const remainingFt = Math.max(0, initialMslFt - (levelOffAltitudeMslFt + arcGainFt));
      climbDistanceFt = arcHorizontalFt + remainingFt / Math.tan(pitch);
    }
  }

  // OUT Turn bank for the given OUT Turn radius at the mean OUT / Level-off horizontal speed.
  let outTurnBankDeg = null;
  if (Number.isFinite(options.outTurnRadiusNm)) {
    const pitchRad = ((out.mode === "CLIMB" ? Math.max(0, out.climbAngleDeg) : 0) * Math.PI) / 180;
    const endTasKt = casToTas(Math.max(1, out.levelOffSpeedKcas), initialMslFt);
    const horizontalMps = ((outTasKt + endTasKt) / 2) * KT_TO_MPS * Math.cos(pitchRad);
    const radiusM = Math.max(1, options.outTurnRadiusNm * M_PER_NM);
    outTurnBankDeg = (Math.atan2(horizontalMps * horizontalMps, G_MPS2 * radiusM) * 180) / Math.PI;
  }

  const recoveryDistanceNm = recoveryDistanceFt / FT_PER_NM;
  const releaseToTargetNm = Math.max(0, finite("bombRangeNm", pub.bombRangeNm));
  const recoveryEndTargetNm = recoveryDistanceNm - releaseToTargetNm;
  const climbDistanceNm = climbDistanceFt / FT_PER_NM;
  return {
    model: { ...BOX_OUT_MANEUVER_MODEL_V0_1 },
    inputs: out,
    outTasKt,
    recoveryDistanceNm,
    levelOffAltitudeMslFt,
    climbDistanceNm,
    releaseToTargetNm,
    recoveryEndTargetNm,
    // OUT Turn Start before the geometry minimum (Rev1.5 `baseOut`): past the Target, never before it.
    outDistanceNm: Math.max(0, recoveryEndTargetNm),
    outTurnBankDeg,
    totalHorizontalNm: recoveryDistanceNm + climbDistanceNm,
    validation: { valid: errors.length === 0, errors },
  };
}
