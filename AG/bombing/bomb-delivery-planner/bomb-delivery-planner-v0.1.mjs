import { casToTas, tasToCas } from "../../../common/airspeed/airspeed-v0.1.mjs";
import { calculateBombTrajectory, ACTIVE_BALLISTIC_MODEL_ID } from "./ballistics-v0.1.mjs";
import { integrateRollIn } from "./roll-in-v0.1.mjs";
import { calculateLegacySafety } from "./safety-legacy-v0.1.mjs";
import { getWeaponById } from "./weapon-data-v0.1.mjs";

const FT_PER_NM = 6076.11549;
const KT_TO_FPS = 1.687809857;

export const BOMB_DELIVERY_PLANNER_MODEL_V0_1 = Object.freeze({
  id: "bomb-delivery-planner-v0.1-legacy-equivalent",
  version: "0.1.0",
  source: "Bomb Profile REV.1.9 · R_20260830",
});

function requireNumber(name, value) {
  if (typeof value !== "number" || !Number.isFinite(value)) throw new TypeError(`${name} must be a finite number`);
}

function normalizeInput(input) {
  const normalized = {
    weaponId: input.weaponId ?? "M82",
    targetElevationMslFt: input.targetElevationMslFt ?? input.targetElevation,
    releaseSpeedKcas: input.releaseSpeedKcas ?? input.releaseSpeed,
    legacyEscapeG: input.legacyEscapeG ?? input.escapeG ?? 5,
    speedOvershootKcas: input.speedOvershootKcas ?? input.rnltSpeedMargin ?? 50,
    maneuverInitiationDelaySec: input.maneuverInitiationDelaySec ?? input.maneuverTime ?? 2,
    diveAngleDeg: input.diveAngleDeg ?? input.diveAngle,
    windDirectionDeg: input.windDirectionDeg ?? input.windDirection ?? 0,
    windSpeedMps:
      input.windSpeedMps ?? input.windSpeed ?? ((input.windSpeedKt ?? 0) * 0.5144444444444445),
    initialSpeedValue: input.initialSpeedValue ?? input.initialSpeed,
    initialSpeedMode: input.initialSpeedMode ?? input.initialUnit ?? "CAS",
    enteredInitialAltitudeMslFt: input.initialAltitudeMslFt ?? input.initialAltitude,
    solveMode: input.solveMode ?? "height",
    enteredTrackingTimeSec: Math.round(input.trackingTimeSec ?? input.trackingTime ?? 0),
    enteredReleaseAltitudeMslFt: input.releaseAltitudeMslFt ?? input.releaseMsl,
    angleOffDeg: input.angleOffDeg ?? input.rollHeading,
    rollInBankAngleDeg: input.rollInBankAngleDeg ?? input.rollBank,
    rollInG: input.rollInG ?? input.rollG,
    ballisticModelId: input.ballisticModelId ?? ACTIVE_BALLISTIC_MODEL_ID,
  };
  normalized.maneuverInitiationDelaySec = Math.round(normalized.maneuverInitiationDelaySec);
  return normalized;
}

function validateInput(p) {
  [
    ["targetElevationMslFt", p.targetElevationMslFt],
    ["releaseSpeedKcas", p.releaseSpeedKcas],
    ["legacyEscapeG", p.legacyEscapeG],
    ["speedOvershootKcas", p.speedOvershootKcas],
    ["maneuverInitiationDelaySec", p.maneuverInitiationDelaySec],
    ["diveAngleDeg", p.diveAngleDeg],
    ["windDirectionDeg", p.windDirectionDeg],
    ["windSpeedMps", p.windSpeedMps],
    ["initialSpeedValue", p.initialSpeedValue],
    ["enteredInitialAltitudeMslFt", p.enteredInitialAltitudeMslFt],
    ["enteredTrackingTimeSec", p.enteredTrackingTimeSec],
    ["enteredReleaseAltitudeMslFt", p.enteredReleaseAltitudeMslFt],
    ["angleOffDeg", p.angleOffDeg],
    ["rollInBankAngleDeg", p.rollInBankAngleDeg],
    ["rollInG", p.rollInG],
  ].forEach(([name, value]) => requireNumber(name, value));

  if (!(p.initialSpeedValue > 0)) throw new RangeError("initialSpeedValue must be > 0");
  if (!(p.diveAngleDeg >= 0 && p.diveAngleDeg < 90)) throw new RangeError("diveAngleDeg must be >= 0 and < 90");
  if (!(p.enteredReleaseAltitudeMslFt > p.targetElevationMslFt)) throw new RangeError("Release altitude must be above Target elevation");
  if (!(p.releaseSpeedKcas > 0)) throw new RangeError("releaseSpeedKcas must be > 0");
  if (!(p.legacyEscapeG > 1 && p.legacyEscapeG <= 9)) throw new RangeError("legacyEscapeG must be > 1 and <= 9");
  if (!(p.speedOvershootKcas >= 0)) throw new RangeError("speedOvershootKcas must be >= 0");
  if (!(p.maneuverInitiationDelaySec >= 0)) throw new RangeError("maneuverInitiationDelaySec must be >= 0");
  if (!(p.windDirectionDeg >= 0 && p.windDirectionDeg <= 360)) throw new RangeError("windDirectionDeg must be in [0, 360]");
  if (!(p.windSpeedMps >= 0)) throw new RangeError("windSpeedMps must be >= 0");
  if (!(p.rollInBankAngleDeg > 0 && p.rollInBankAngleDeg < 180)) throw new RangeError("rollInBankAngleDeg must be > 0 and < 180");
  if (!(p.rollInG > 1 && p.rollInG <= 9)) throw new RangeError("rollInG must be > 1 and <= 9");
  if (!(p.angleOffDeg > 0 && p.angleOffDeg < 180)) throw new RangeError("angleOffDeg must be > 0 and < 180");
  if (p.diveAngleDeg > 0 && p.solveMode === "height" && !(p.enteredInitialAltitudeMslFt > p.enteredReleaseAltitudeMslFt)) {
    throw new RangeError("Initial altitude must be above entered Release altitude in height solve mode");
  }
  if ((p.solveMode === "time" || Math.abs(p.diveAngleDeg) < 1e-9) && !(p.enteredTrackingTimeSec > 0)) {
    throw new RangeError("Tracking Time must be > 0");
  }
  if (p.initialSpeedMode !== "CAS" && p.initialSpeedMode !== "MACH") throw new RangeError("initialSpeedMode must be CAS or MACH");
}

function calculateProfile(p, bomb, safety) {
  const angleRad = (p.diveAngleDeg * Math.PI) / 180;
  const levelDelivery = Math.abs(p.diveAngleDeg) < 1e-9;
  const effectiveReleaseAltitudeMslFt = Math.max(
    p.enteredReleaseAltitudeMslFt,
    safety.legacyRnltReleaseMslFt,
  );
  const releaseAglFt = effectiveReleaseAltitudeMslFt - p.targetElevationMslFt;
  const releaseTasKt = casToTas(p.releaseSpeedKcas, effectiveReleaseAltitudeMslFt);

  let initialAglFt;
  let initialMslFt;
  let trackAglFt;
  let pathFt;
  let trackingTimeSec;
  let roll;

  const rollParams = {
    initialSpeedValue: p.initialSpeedValue,
    initialSpeedMode: p.initialSpeedMode,
    diveAngleDeg: p.diveAngleDeg,
    angleOffDeg: p.angleOffDeg,
    rollInBankAngleDeg: p.rollInBankAngleDeg,
    rollInG: p.rollInG,
  };

  if (levelDelivery) {
    trackingTimeSec = p.enteredTrackingTimeSec;
    initialAglFt = releaseAglFt;
    for (let iteration = 0; iteration < 12; iteration += 1) {
      initialMslFt = p.targetElevationMslFt + initialAglFt;
      roll = integrateRollIn(rollParams, initialMslFt);
      initialAglFt = releaseAglFt + roll.altitudeLossFt;
    }
    initialMslFt = p.targetElevationMslFt + initialAglFt;
    roll = integrateRollIn(rollParams, initialMslFt);
    trackAglFt = initialAglFt - roll.altitudeLossFt;
    pathFt = ((roll.finalTasKt + releaseTasKt) / 2) * KT_TO_FPS * trackingTimeSec;
  } else if (p.solveMode === "height") {
    initialMslFt = p.enteredInitialAltitudeMslFt;
    initialAglFt = initialMslFt - p.targetElevationMslFt;
    roll = integrateRollIn(rollParams, initialMslFt);
    trackAglFt = initialAglFt - roll.altitudeLossFt;
    if (!(trackAglFt > releaseAglFt)) throw new Error("Initial altitude minus roll-in loss is below effective Release altitude");
    pathFt = (trackAglFt - releaseAglFt) / Math.sin(angleRad);
    trackingTimeSec = pathFt / (((roll.finalTasKt + releaseTasKt) / 2) * KT_TO_FPS);
  } else {
    trackingTimeSec = p.enteredTrackingTimeSec;
    initialAglFt = releaseAglFt + trackingTimeSec * releaseTasKt * KT_TO_FPS * Math.sin(angleRad) + 2500;
    for (let iteration = 0; iteration < 30; iteration += 1) {
      initialMslFt = p.targetElevationMslFt + initialAglFt;
      roll = integrateRollIn(rollParams, initialMslFt);
      pathFt = ((roll.finalTasKt + releaseTasKt) / 2) * KT_TO_FPS * trackingTimeSec;
      const nextInitial = releaseAglFt + pathFt * Math.sin(angleRad) + roll.altitudeLossFt;
      initialAglFt = 0.45 * initialAglFt + 0.55 * nextInitial;
    }
    initialMslFt = p.targetElevationMslFt + initialAglFt;
    roll = integrateRollIn(rollParams, initialMslFt);
    pathFt = ((roll.finalTasKt + releaseTasKt) / 2) * KT_TO_FPS * trackingTimeSec;
    trackAglFt = initialAglFt - roll.altitudeLossFt;
  }

  const downRangeTravelFt = pathFt * Math.cos(angleRad);
  const groundRangeFt = downRangeTravelFt + bomb.bombRangeFt;
  const groundSlantRangeFt = Math.hypot(trackAglFt, groundRangeFt);
  const losDeg = (Math.atan2(trackAglFt, groundRangeFt) * 180) / Math.PI;
  const aimOffRangeFt = bomb.aimOffDistanceFt === null ? null : groundRangeFt + bomb.aimOffDistanceFt;
  const offsetDistanceFt = aimOffRangeFt === null ? groundRangeFt : aimOffRangeFt;
  const headingRad = (p.angleOffDeg * Math.PI) / 180;
  const targetForwardFt = roll.displacementForwardFt + groundRangeFt * Math.cos(headingRad);
  const targetTurnSideFt = roll.displacementTurnSideFt + groundRangeFt * Math.sin(headingRad);
  const offsetForwardFt = roll.displacementForwardFt + offsetDistanceFt * Math.cos(headingRad);
  const offsetTurnSideFt = roll.displacementTurnSideFt + offsetDistanceFt * Math.sin(headingRad);
  const targetBearingDeg = (Math.atan2(targetTurnSideFt, targetForwardFt) * 180) / Math.PI;
  const offsetBearingDeg = (Math.atan2(offsetTurnSideFt, offsetForwardFt) * 180) / Math.PI;
  const leadAngleDeg = p.angleOffDeg - targetBearingDeg;
  const legacyOffsetLeadDeg = p.angleOffDeg - offsetBearingDeg;
  const rollInRangeFt = Math.hypot(targetForwardFt, targetTurnSideFt);

  return {
    initialAglFt,
    initialMslFt,
    initialTasKt: roll.initialTasKt,
    rolloutTasKt: roll.finalTasKt,
    trackAglFt,
    trackMslFt: p.targetElevationMslFt + trackAglFt,
    releaseAglFt,
    effectiveReleaseAltitudeMslFt,
    releaseTasKt,
    trackingTimeSec,
    downRangeTravelFt,
    groundRangeFt,
    groundSlantRangeFt,
    aimOffRangeFt,
    rollInRangeFt,
    totalGroundTrackFt: roll.groundArcFt + groundRangeFt,
    initialSlantFt: Math.hypot(initialAglFt, rollInRangeFt),
    targetBearingDeg,
    offsetBearingDeg,
    leadAngleDeg,
    legacyOffsetLeadDeg,
    losDeg,
    aimOffAngleDeg: losDeg - p.diveAngleDeg,
    levelDelivery,
    targetForwardFt,
    targetTurnSideFt,
    roll,
  };
}

export function calculateBombDeliveryLegacyEquivalent(rawInput) {
  const input = normalizeInput(rawInput);
  validateInput(input);
  const weapon = getWeaponById(input.weaponId);
  const safety = calculateLegacySafety({
    weapon,
    targetElevationMslFt: input.targetElevationMslFt,
    releaseSpeedKcas: input.releaseSpeedKcas,
    speedOvershootKcas: input.speedOvershootKcas,
    diveAngleDeg: input.diveAngleDeg,
    escapeG: input.legacyEscapeG,
    maneuverDelaySec: input.maneuverInitiationDelaySec,
  });

  const effectiveReleaseAltitudeMslFt = Math.max(
    input.enteredReleaseAltitudeMslFt,
    safety.legacyRnltReleaseMslFt,
  );
  const releaseAglFt = effectiveReleaseAltitudeMslFt - input.targetElevationMslFt;
  const releaseTasKt = casToTas(input.releaseSpeedKcas, effectiveReleaseAltitudeMslFt);
  const bomb = calculateBombTrajectory({
    params: {
      diveAngleDeg: input.diveAngleDeg,
      releaseAglFt,
      windDirectionDeg: input.windDirectionDeg,
      windSpeedMps: input.windSpeedMps,
    },
    weapon,
    releaseTasKt,
    modelId: input.ballisticModelId,
  });
  const profile = calculateProfile(input, bomb, safety);

  const resolvedInitialSpeedKcas =
    input.initialSpeedMode === "CAS"
      ? input.initialSpeedValue
      : tasToCas(profile.initialTasKt, profile.initialMslFt);

  return {
    model: { ...BOMB_DELIVERY_PLANNER_MODEL_V0_1 },
    weapon,
    inputs: input,
    public: {
      effectiveReleaseAltitudeMslFt: profile.effectiveReleaseAltitudeMslFt,
      resolvedInitialAltitudeMslFt: profile.initialMslFt,
      resolvedInitialSpeedKcas,
      trackPointAltitudeMslFt: profile.trackMslFt,
      trackingTimeSec: profile.trackingTimeSec,
      rollInRangeNm: profile.rollInRangeFt / FT_PER_NM,
      groundRangeNm: profile.groundRangeFt / FT_PER_NM,
      downRangeTravelNm: profile.downRangeTravelFt / FT_PER_NM,
      bombRangeNm: bomb.bombRangeFt / FT_PER_NM,
      bombTofSec: bomb.bombTofSec,
      rollInRadiusNm: profile.roll.equivalentRadiusFt / FT_PER_NM,
      rollInTimeSec: profile.roll.rollInTimeSec,
      rollInGroundArcNm: profile.roll.groundArcFt / FT_PER_NM,
      rollInDisplacement: {
        forwardNm: profile.roll.displacementForwardFt / FT_PER_NM,
        turnSideNm: profile.roll.displacementTurnSideFt / FT_PER_NM,
      },
      rollInLateralSeparationNm: Math.abs(profile.targetTurnSideFt) / FT_PER_NM,
      rollInAltitudeLossFt: profile.roll.altitudeLossFt,
      leadAngleDeg: profile.leadAngleDeg,
      minAltMslFt: safety.minAltMslFt,
      nltReleaseMslFt: safety.legacyRnltReleaseMslFt,
    },
    local: {
      aimOffPointRangeNm: profile.aimOffRangeFt === null ? null : profile.aimOffRangeFt / FT_PER_NM,
      aimOffAngleDeg: profile.aimOffAngleDeg,
      aimOffDistanceNm: bomb.aimOffDistanceFt === null ? null : bomb.aimOffDistanceFt / FT_PER_NM,
      rollInRangeProfileFitNm: (profile.rollInRangeFt - profile.groundRangeFt) / FT_PER_NM,
      legacyOffsetLeadDeg: profile.legacyOffsetLeadDeg,
    },
    visualization: {
      rollInTrajectorySamples: profile.roll.samples.map((sample) => ({
        forwardNm: sample.forwardFt / FT_PER_NM,
        turnSideNm: sample.turnSideFt / FT_PER_NM,
        groundArcNm: sample.groundArcFt / FT_PER_NM,
        altitudeLossFt: sample.altitudeLossFt,
        headingChangeDeg: (sample.headingChangeRad * 180) / Math.PI,
      })),
      bombTrajectorySamples: bomb.samples.map((sample) => ({
        downRangeNm: sample.xFt / FT_PER_NM,
        altitudeAglFt: sample.altitudeAglFt,
      })),
    },
    diagnostics: {
      targetForwardNm: profile.targetForwardFt / FT_PER_NM,
      targetTurnSideNm: profile.targetTurnSideFt / FT_PER_NM,
      initialTasKt: profile.initialTasKt,
      releaseTasKt: profile.releaseTasKt,
      ballisticModelId: bomb.modelId,
      ballisticModelVersion: bomb.modelVersion,
    },
  };
}
