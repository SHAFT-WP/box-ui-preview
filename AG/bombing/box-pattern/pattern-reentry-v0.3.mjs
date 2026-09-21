import { casToTas } from "../../../common/airspeed/airspeed-v0.1.mjs";
import { coordinatedConstantFpaTurn } from "../../../common/maneuvers/turn-performance/turn-performance-v0.2.mjs";

const FT_PER_NM = 6076.11549;
const KT_TO_FPS = 1.687809857;
const DEG_TO_RAD = Math.PI / 180;
const RAD_TO_DEG = 180 / Math.PI;
const EPS = 1e-10;

export const BOX_PATTERN_REENTRY_MODEL_V0_3 = Object.freeze({
  id: "box-pattern-reentry-3d-v0.3",
  version: "0.3.0",
  bankIncrementDeg: 5,
  minRadiusFactor: 1.1,
});

function finite(name, value) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new TypeError(`${name} must be a finite number`);
  }
}

function positive(name, value) {
  finite(name, value);
  if (!(value > 0)) throw new RangeError(`${name} must be > 0`);
}

function isFiveDegreeIncrement(value) {
  return Math.abs(value / 5 - Math.round(value / 5)) <= 1e-9;
}

function rotateLocal(forwardNm, rightNm, signedHeadingRad) {
  return {
    forwardNm: forwardNm * Math.cos(signedHeadingRad) - rightNm * Math.sin(signedHeadingRad),
    rightNm: forwardNm * Math.sin(signedHeadingRad) + rightNm * Math.cos(signedHeadingRad),
  };
}

function normalizeInput(rawInput) {
  return {
    semTerminationAltitudeMslFt: rawInput.semTerminationAltitudeMslFt,
    semTerminationFpaDeg: rawInput.semTerminationFpaDeg ?? 30,
    patternAltitudeMslFt: rawInput.patternAltitudeMslFt,
    patternClimbSpeedKcas: rawInput.patternClimbSpeedKcas,
    patternClimbFpaDeg: rawInput.patternClimbFpaDeg ?? 30,
    crossTurnRadiusNm: rawInput.crossTurnRadiusNm,
    patternEntryBankAngleDeg: rawInput.patternEntryBankAngleDeg ?? null,
    patternEntryMaxBankAngleDeg: rawInput.patternEntryMaxBankAngleDeg,
    patternEntryMaxLoadFactorG: rawInput.patternEntryMaxLoadFactorG,
    headingChangeDeg: rawInput.headingChangeDeg ?? 90,
    patternDirection: rawInput.patternDirection ?? "RIGHT",
  };
}

function validate(input) {
  [
    "semTerminationAltitudeMslFt",
    "semTerminationFpaDeg",
    "patternAltitudeMslFt",
    "patternClimbSpeedKcas",
    "patternClimbFpaDeg",
    "crossTurnRadiusNm",
    "patternEntryMaxBankAngleDeg",
    "patternEntryMaxLoadFactorG",
    "headingChangeDeg",
  ].forEach((name) => finite(name, input[name]));
  if (input.patternEntryBankAngleDeg !== null) finite("patternEntryBankAngleDeg", input.patternEntryBankAngleDeg);
  if (input.patternAltitudeMslFt < input.semTerminationAltitudeMslFt) {
    throw new RangeError("patternAltitudeMslFt must not be below SEM termination altitude");
  }
  positive("patternClimbSpeedKcas", input.patternClimbSpeedKcas);
  if (!(input.patternClimbFpaDeg > 0 && input.patternClimbFpaDeg < 90)) {
    throw new RangeError("patternClimbFpaDeg must be between 0 and 90");
  }
  if (Math.abs(input.semTerminationFpaDeg - input.patternClimbFpaDeg) > 1e-9) {
    throw new RangeError("SEM termination FPA must equal Pattern Climb FPA at the handoff");
  }
  positive("crossTurnRadiusNm", input.crossTurnRadiusNm);
  if (!(input.patternEntryMaxBankAngleDeg >= 5 && input.patternEntryMaxBankAngleDeg < 90)) {
    throw new RangeError("patternEntryMaxBankAngleDeg must be in [5, 90)");
  }
  positive("patternEntryMaxLoadFactorG", input.patternEntryMaxLoadFactorG);
  if (!(input.headingChangeDeg > 0 && input.headingChangeDeg <= 180)) {
    throw new RangeError("headingChangeDeg must be in (0, 180]");
  }
  if (input.patternDirection !== "RIGHT" && input.patternDirection !== "LEFT") {
    throw new RangeError("patternDirection must be RIGHT or LEFT");
  }
  if (input.patternEntryBankAngleDeg !== null) {
    if (!(input.patternEntryBankAngleDeg >= 5 && input.patternEntryBankAngleDeg < 90)) {
      throw new RangeError("patternEntryBankAngleDeg must be in [5, 90)");
    }
    if (!isFiveDegreeIncrement(input.patternEntryBankAngleDeg)) {
      throw new RangeError("patternEntryBankAngleDeg must use 5 deg increments");
    }
    if (input.patternEntryBankAngleDeg > input.patternEntryMaxBankAngleDeg + EPS) {
      throw new RangeError("patternEntryBankAngleDeg exceeds patternEntryMaxBankAngleDeg");
    }
  }
}

function evaluateBank(input, tasKt, bankAngleDeg) {
  const totalHeadingRad = input.headingChangeDeg * DEG_TO_RAD;
  const altitudeNeededFt = input.patternAltitudeMslFt - input.semTerminationAltitudeMslFt;
  const minEntryTurnRadiusNm = input.crossTurnRadiusNm * BOX_PATTERN_REENTRY_MODEL_V0_3.minRadiusFactor;
  const direction = input.patternDirection;
  const gammaRad = input.patternClimbFpaDeg * DEG_TO_RAD;
  const horizontalToPatternAltitudeNm = altitudeNeededFt <= EPS
    ? 0
    : altitudeNeededFt / Math.tan(gammaRad) / FT_PER_NM;

  let climbSegment = null;
  let levelSegment = null;
  let straightClimbHorizontalNm = 0;
  let climbHeadingChangeDeg = 0;
  let levelHeadingChangeDeg = 0;

  if (altitudeNeededFt <= EPS) {
    levelSegment = coordinatedConstantFpaTurn({
      tasKt,
      fpaDeg: 0,
      bankAngleDeg,
      headingChangeDeg: input.headingChangeDeg,
      turnDirection: direction,
    });
    levelHeadingChangeDeg = input.headingChangeDeg;
  } else {
    const fullClimbTurn = coordinatedConstantFpaTurn({
      tasKt,
      fpaDeg: input.patternClimbFpaDeg,
      bankAngleDeg,
      headingChangeDeg: input.headingChangeDeg,
      turnDirection: direction,
    });
    const headingToAltitudeRad = horizontalToPatternAltitudeNm / fullClimbTurn.horizontalTurnRadiusNm;
    const altitudeReachedDuringTurn = headingToAltitudeRad < totalHeadingRad - EPS;

    if (altitudeReachedDuringTurn) {
      climbHeadingChangeDeg = Math.max(0, headingToAltitudeRad * RAD_TO_DEG);
      if (climbHeadingChangeDeg > EPS) {
        climbSegment = coordinatedConstantFpaTurn({
          tasKt,
          fpaDeg: input.patternClimbFpaDeg,
          bankAngleDeg,
          headingChangeDeg: climbHeadingChangeDeg,
          turnDirection: direction,
        });
      }
      levelHeadingChangeDeg = input.headingChangeDeg - climbHeadingChangeDeg;
      if (levelHeadingChangeDeg > EPS) {
        levelSegment = coordinatedConstantFpaTurn({
          tasKt,
          fpaDeg: 0,
          bankAngleDeg,
          headingChangeDeg: levelHeadingChangeDeg,
          turnDirection: direction,
        });
      }
    } else {
      climbSegment = fullClimbTurn;
      climbHeadingChangeDeg = input.headingChangeDeg;
      straightClimbHorizontalNm = Math.max(0, horizontalToPatternAltitudeNm - fullClimbTurn.horizontalArcDistanceNm);
    }
  }

  const activeTurnSegments = [climbSegment, levelSegment].filter(Boolean);
  const entryTurnRadiusNm = Math.min(...activeTurnSegments.map((segment) => segment.horizontalTurnRadiusNm));
  const maxObservedLoadFactorG = Math.max(...activeTurnSegments.map((segment) => segment.loadFactorG));
  const radiusValid = entryTurnRadiusNm + EPS >= minEntryTurnRadiusNm;
  const loadValid = maxObservedLoadFactorG <= input.patternEntryMaxLoadFactorG + EPS;

  let forwardNm = 0;
  let rightNm = 0;
  let signedHeadingRad = 0;
  const sign = direction === "RIGHT" ? 1 : -1;

  for (const segment of activeTurnSegments) {
    const rotated = rotateLocal(
      segment.displacement.forwardNm,
      segment.displacement.turnSideNm,
      signedHeadingRad,
    );
    forwardNm += rotated.forwardNm;
    rightNm += rotated.rightNm;
    signedHeadingRad += sign * segment.headingChangeDeg * DEG_TO_RAD;
  }

  if (straightClimbHorizontalNm > EPS) {
    const rotated = rotateLocal(straightClimbHorizontalNm, 0, signedHeadingRad);
    forwardNm += rotated.forwardNm;
    rightNm += rotated.rightNm;
  }

  const straightClimbPathNm = straightClimbHorizontalNm / Math.cos(gammaRad);
  const straightClimbTimeSec = straightClimbPathNm * FT_PER_NM / (tasKt * KT_TO_FPS);
  const turnElapsedTimeSec = activeTurnSegments.reduce((sum, segment) => sum + segment.elapsedTimeSec, 0);
  const horizontalPathNm = activeTurnSegments.reduce((sum, segment) => sum + segment.horizontalArcDistanceNm, 0) + straightClimbHorizontalNm;
  const spatialPathNm = activeTurnSegments.reduce((sum, segment) => sum + segment.spatialPathDistanceNm, 0) + straightClimbPathNm;

  return {
    bankAngleDeg,
    valid: radiusValid && loadValid,
    radiusValid,
    loadValid,
    minEntryTurnRadiusNm,
    entryTurnRadiusNm,
    maxObservedLoadFactorG,
    climbSegment,
    levelSegment,
    climbHeadingChangeDeg,
    levelHeadingChangeDeg,
    straightClimbHorizontalNm,
    horizontalPathNm,
    spatialPathNm,
    elapsedTimeSec: turnElapsedTimeSec + straightClimbTimeSec,
    finalDisplacement: { forwardNm, rightNm },
  };
}

function selectBank(input, tasKt) {
  if (input.patternEntryBankAngleDeg !== null) {
    const evaluation = evaluateBank(input, tasKt, input.patternEntryBankAngleDeg);
    if (!evaluation.radiusValid) {
      throw new RangeError("PATTERN_ENTRY_RADIUS_BELOW_110_PERCENT_CROSS_TURN_RADIUS");
    }
    if (!evaluation.loadValid) {
      throw new RangeError("PATTERN_ENTRY_LOAD_FACTOR_EXCEEDS_LIMIT");
    }
    return { mode: "EXPLICIT", evaluation };
  }

  const highestCandidate = Math.floor((input.patternEntryMaxBankAngleDeg + EPS) / 5) * 5;
  for (let bank = highestCandidate; bank >= 5; bank -= 5) {
    const evaluation = evaluateBank(input, tasKt, bank);
    if (evaluation.valid) return { mode: "AUTO_TIGHTEST_FEASIBLE_5_DEG", evaluation };
  }
  throw new RangeError("NO_FEASIBLE_PATTERN_ENTRY_BANK_5_DEG_INCREMENT");
}

export function calculateBoxPatternReentryV0_3(rawInput) {
  const input = normalizeInput(rawInput);
  validate(input);
  const tasAtHandoffKt = casToTas(input.patternClimbSpeedKcas, input.semTerminationAltitudeMslFt);
  const selection = selectBank(input, tasAtHandoffKt);
  const e = selection.evaluation;

  const adjustments = [];
  if (e.straightClimbHorizontalNm > EPS) adjustments.push("STRAIGHT_PATTERN_CLIMB_AFTER_TURN");
  if (e.levelSegment) adjustments.push("LEVEL_OFF_BEFORE_TURN_COMPLETE");

  return {
    model: { ...BOX_PATTERN_REENTRY_MODEL_V0_3 },
    inputs: input,
    speed: {
      patternClimbSpeedKcas: input.patternClimbSpeedKcas,
      calculationTasKt: tasAtHandoffKt,
      policy: "CONSTANT_TAS_FROM_HANDOFF_KCAS_WORK_ASSUMPTION",
    },
    geometry: {
      crossTurnRadiusNm: input.crossTurnRadiusNm,
      minEntryTurnRadiusNm: e.minEntryTurnRadiusNm,
      entryTurnRadiusNm: e.entryTurnRadiusNm,
    },
    turn: {
      selectionMode: selection.mode,
      patternEntryBankAngleDeg: e.bankAngleDeg,
      maxObservedLoadFactorG: e.maxObservedLoadFactorG,
      climbTurnRadiusNm: e.climbSegment?.horizontalTurnRadiusNm ?? null,
      levelTurnRadiusNm: e.levelSegment?.horizontalTurnRadiusNm ?? null,
      climbHeadingChangeDeg: e.climbHeadingChangeDeg,
      levelHeadingChangeDeg: e.levelHeadingChangeDeg,
      totalHeadingChangeDeg: input.headingChangeDeg,
    },
    path: {
      climbTurnHorizontalNm: e.climbSegment?.horizontalArcDistanceNm ?? 0,
      levelTurnHorizontalNm: e.levelSegment?.horizontalArcDistanceNm ?? 0,
      straightClimbHorizontalNm: e.straightClimbHorizontalNm,
      horizontalPathNm: e.horizontalPathNm,
      spatialPathNm: e.spatialPathNm,
      elapsedTimeSec: e.elapsedTimeSec,
    },
    rolloutState: {
      altitudeMslFt: input.patternAltitudeMslFt,
      fpaDeg: 0,
      headingChangeDeg: input.headingChangeDeg,
      forwardNm: e.finalDisplacement.forwardNm,
      turnSideNm: e.finalDisplacement.rightNm,
    },
    adjustments,
    validation: {
      valid: e.valid,
      bankIncrementDeg: 5,
      minRadiusFactor: 1.1,
      radiusValid: e.radiusValid,
      loadValid: e.loadValid,
    },
  };
}
