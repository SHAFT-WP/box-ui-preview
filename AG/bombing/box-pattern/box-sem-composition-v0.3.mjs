import { calculateBombDeliveryV0_2 } from "../bomb-delivery-planner/bomb-delivery-planner-v0.2.mjs";
import { calculateClimbSemV0_2 } from "../../../flight/maneuvers/safe-escape/work/v0.2/climb-sem-core-v0.2.mjs";
import { calculateBoxPatternReentryV0_3Full } from "./pattern-reentry-v0.3.mjs";
import { truncateBeOutput } from "../../../common/ui/display-precision-v0.1.mjs";

// Public entrypoint: result truncated to 5 decimals (docs/FE-BE-RULES.md); the Full variant keeps
// full precision for composition and relation checks.
export function calculateBoxClimbSemCompositionV0_3(rawInput) {
  return truncateBeOutput(calculateBoxClimbSemCompositionV0_3Full(rawInput));
}

export function calculateBoxClimbSemCompositionV0_3Full(rawInput) {
  const delivery = calculateBombDeliveryV0_2({
    ...rawInput,
    angleOffDeg: 90,
    rollHeading: 90,
  });

  const sem = calculateClimbSemV0_2({
    releaseAltitudeFtMsl: delivery.public.effectiveReleaseAltitudeMslFt,
    releaseSpeedKcas: delivery.inputs.releaseSpeedKcas,
    releaseFpaDeg: delivery.inputs.releaseFpaDeg,
    recoveryG: delivery.inputs.recoveryG,
    gOnsetTimeSec: delivery.inputs.gOnsetTimeSec,
    gRelaxationFpaDeg: rawInput.gRelaxationFpaDeg ?? 20,
    terminalFpaDeg: rawInput.terminalFpaDeg ?? 30,
  });

  if (!sem.validation.valid) {
    return {
      delivery,
      sem,
      patternReentry: null,
      validation: { valid: false, stage: "SEM", errors: [...sem.validation.errors] },
    };
  }

  const patternAltitudeMslFt =
    rawInput.patternAltitudeMslFt ?? delivery.public.resolvedInitialAltitudeMslFt;
  if (typeof rawInput.patternClimbSpeedKcas !== "number") {
    throw new TypeError("patternClimbSpeedKcas is required for BOX post-SEM composition");
  }
  if (typeof rawInput.crossTurnRadiusNm !== "number") {
    throw new TypeError("crossTurnRadiusNm is required for BOX Pattern Entry");
  }
  if (typeof rawInput.patternEntryMaxBankAngleDeg !== "number") {
    throw new TypeError("patternEntryMaxBankAngleDeg is required for BOX Pattern Entry");
  }
  if (typeof rawInput.patternEntryMaxLoadFactorG !== "number") {
    throw new TypeError("patternEntryMaxLoadFactorG is required for BOX Pattern Entry");
  }

  const patternReentry = calculateBoxPatternReentryV0_3Full({
    semTerminationAltitudeMslFt: sem.terminationAltitudeFtMsl,
    semTerminationFpaDeg: sem.terminalFpaDeg,
    patternAltitudeMslFt,
    patternClimbSpeedKcas: rawInput.patternClimbSpeedKcas,
    patternClimbFpaDeg: sem.terminalFpaDeg,
    crossTurnRadiusNm: rawInput.crossTurnRadiusNm,
    patternEntryBankAngleDeg: rawInput.patternEntryBankAngleDeg ?? null,
    patternEntryMaxBankAngleDeg: rawInput.patternEntryMaxBankAngleDeg,
    patternEntryMaxLoadFactorG: rawInput.patternEntryMaxLoadFactorG,
    headingChangeDeg: 90,
    patternDirection: rawInput.patternDirection ?? "RIGHT",
  });

  return {
    delivery,
    sem,
    patternReentry,
    boundaries: {
      bombsAwayAltitudeMslFt: delivery.public.effectiveReleaseAltitudeMslFt,
      semEndAltitudeMslFt: sem.terminationAltitudeFtMsl,
      semEndFpaDeg: sem.terminalFpaDeg,
      patternEntryTurnStartAltitudeMslFt: sem.terminationAltitudeFtMsl,
      patternAltitudeMslFt,
    },
    timing: {
      rollInToReleaseSec: delivery.public.rollInTimeSec + delivery.public.trackingTimeSec,
      semElapsedSec: sem.elapsedTimeSec,
      patternReentryElapsedSec: patternReentry.path.elapsedTimeSec,
      bombTofSec: delivery.public.bombTofSec,
    },
    validation: {
      valid: patternReentry.validation.valid,
      stage: patternReentry.validation.valid ? "COMPLETE" : "PATTERN_REENTRY",
      errors: patternReentry.validation.valid ? [] : ["PATTERN_REENTRY_FAILURE"],
    },
  };
}
