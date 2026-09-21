import { tasToCas } from "../../../../../common/airspeed/airspeed-v0.1.mjs";
import { calculateWingsLevelRecoveryPull } from "../../../../../common/maneuvers/recovery-pull/recovery-pull-v0.1.mjs";

const G_FTPS2 = 32.174;
const KT_TO_FPS = 1.687809857;
const FT_PER_NM = 6076.11549;
const DEG_TO_RAD = Math.PI / 180;

export const CLIMB_SEM_MODEL_V0_2 = Object.freeze({
  id: "csem-energy-neutral-point-mass-v0.2",
  version: "0.2.0",
  integrationStepSec: 0.01,
});

export const CLIMB_SEM_BASELINE_V0_2 = Object.freeze({
  recoveryG: 5,
  gOnsetTimeSec: 2,
  gRelaxationFpaDeg: 20,
  terminalFpaDeg: 30,
});

const ASSUMPTIONS = Object.freeze([
  "ENERGY_NEUTRAL_POINT_MASS",
  "COMMON_LINEAR_G_ONSET",
  "SEM_LINEAR_G_RELAXATION",
  "WINGS_LEVEL_BASELINE",
]);

function finiteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function normalizeInput(input = {}) {
  return {
    releaseAltitudeFtMsl: input.releaseAltitudeFtMsl,
    releaseSpeedKcas: input.releaseSpeedKcas,
    releaseFpaDeg: input.releaseFpaDeg,
    recoveryG: input.recoveryG ?? CLIMB_SEM_BASELINE_V0_2.recoveryG,
    gOnsetTimeSec: input.gOnsetTimeSec ?? CLIMB_SEM_BASELINE_V0_2.gOnsetTimeSec,
    gRelaxationFpaDeg: input.gRelaxationFpaDeg ?? CLIMB_SEM_BASELINE_V0_2.gRelaxationFpaDeg,
    terminalFpaDeg: input.terminalFpaDeg ?? CLIMB_SEM_BASELINE_V0_2.terminalFpaDeg,
  };
}

function validateInput(input) {
  const errors = [];
  const warnings = [
    "MODEL_ASSUMPTION_ENERGY_NEUTRAL_POINT_MASS",
    "MODEL_ASSUMPTION_COMMON_LINEAR_G_ONSET",
    "MODEL_ASSUMPTION_LINEAR_G_RELAXATION",
  ];
  if (!finiteNumber(input.releaseAltitudeFtMsl)) errors.push("RELEASE_ALTITUDE_REQUIRED");
  else if (input.releaseAltitudeFtMsl < -1000 || input.releaseAltitudeFtMsl > 100000) errors.push("RELEASE_ALTITUDE_OUT_OF_RANGE");
  if (!finiteNumber(input.releaseSpeedKcas)) errors.push("RELEASE_SPEED_REQUIRED");
  else if (input.releaseSpeedKcas < 50 || input.releaseSpeedKcas > 1000) errors.push("RELEASE_SPEED_OUT_OF_RANGE");
  if (!finiteNumber(input.releaseFpaDeg)) errors.push("RELEASE_FPA_REQUIRED");
  else if (input.releaseFpaDeg <= -90 || input.releaseFpaDeg >= 0) errors.push("RELEASE_FPA_MUST_BE_DESCENDING");
  if (!finiteNumber(input.recoveryG)) errors.push("RECOVERY_G_REQUIRED");
  else if (input.recoveryG <= 1 || input.recoveryG > 9) errors.push("RECOVERY_G_OUT_OF_RANGE");
  if (!finiteNumber(input.gOnsetTimeSec)) errors.push("G_ONSET_TIME_REQUIRED");
  else if (input.gOnsetTimeSec <= 0 || input.gOnsetTimeSec > 10) errors.push("G_ONSET_TIME_OUT_OF_RANGE");
  if (!finiteNumber(input.gRelaxationFpaDeg)) errors.push("G_RELAXATION_FPA_REQUIRED");
  if (!finiteNumber(input.terminalFpaDeg)) errors.push("TERMINAL_FPA_REQUIRED");
  if (finiteNumber(input.gRelaxationFpaDeg) && finiteNumber(input.terminalFpaDeg) && input.gRelaxationFpaDeg >= input.terminalFpaDeg) errors.push("G_RELAXATION_FPA_MUST_PRECEDE_TERMINAL_FPA");
  if (finiteNumber(input.terminalFpaDeg) && Math.abs(input.terminalFpaDeg - 30) > 1e-9) errors.push("TERMINAL_FPA_NOT_SPECIFICATION_30_DEG");
  if (finiteNumber(input.recoveryG) && Math.abs(input.recoveryG - 5) > 1e-9) warnings.push("NON_BASELINE_RECOVERY_G");
  if (finiteNumber(input.gOnsetTimeSec) && Math.abs(input.gOnsetTimeSec - 2) > 1e-9) warnings.push("NON_BASELINE_G_ONSET_TIME");
  if (finiteNumber(input.gRelaxationFpaDeg) && Math.abs(input.gRelaxationFpaDeg - 20) > 1e-9) warnings.push("NON_BASELINE_G_RELAXATION_FPA");
  return { errors, warnings };
}

function invalidResult(input, errors, warnings) {
  return {
    semType: "CLIMB_SEM",
    model: { ...CLIMB_SEM_MODEL_V0_2 },
    inputs: input,
    terminationState: null,
    elapsedTimeSec: null,
    horizontalDistanceNm: null,
    pathDistanceNm: null,
    altitudeChangeFt: null,
    minAltitudeFtMsl: null,
    terminationAltitudeFtMsl: null,
    terminationSpeedKcas: null,
    assumptions: [...ASSUMPTIONS],
    validation: { valid: false, status: "INVALID_INPUT", errors, warnings },
  };
}

function integrateStep(state, loadFactor, dt) {
  const velocity = state.velocityFps;
  const fpa = state.fpaRad;
  const speedRate = -G_FTPS2 * Math.sin(fpa);
  const fpaRate = (G_FTPS2 / velocity) * (loadFactor - Math.cos(fpa));
  const midVelocity = Math.max(80, velocity + (speedRate * dt) / 2);
  const midFpa = fpa + (fpaRate * dt) / 2;
  const midSpeedRate = -G_FTPS2 * Math.sin(midFpa);
  const midFpaRate = (G_FTPS2 / midVelocity) * (loadFactor - Math.cos(midFpa));
  state.velocityFps = Math.max(80, velocity + midSpeedRate * dt);
  state.fpaRad = fpa + midFpaRate * dt;
  state.horizontalDistanceFt += midVelocity * Math.cos(midFpa) * dt;
  state.altitudeMslFt += midVelocity * Math.sin(midFpa) * dt;
  state.pathDistanceFt += midVelocity * dt;
  state.elapsedTimeSec += dt;
  state.minAltitudeMslFt = Math.min(state.minAltitudeMslFt, state.altitudeMslFt);
}

function runRelaxation(startState, input, durationSec) {
  const state = { ...startState };
  let localElapsed = 0;
  const terminalEquilibriumG = Math.cos(input.terminalFpaDeg * DEG_TO_RAD);
  while (localElapsed < durationSec - 1e-9) {
    const dt = Math.min(CLIMB_SEM_MODEL_V0_2.integrationStepSec, durationSec - localElapsed);
    const fraction = (localElapsed + dt / 2) / durationSec;
    const loadFactor = input.recoveryG + (terminalEquilibriumG - input.recoveryG) * fraction;
    integrateStep(state, loadFactor, dt);
    localElapsed += dt;
  }
  return state;
}

export function calculateClimbSemV0_2(rawInput) {
  const input = normalizeInput(rawInput);
  const { errors, warnings } = validateInput(input);
  if (errors.length) return invalidResult(input, errors, warnings);

  let pull;
  try {
    pull = calculateWingsLevelRecoveryPull({
      startAltitudeMslFt: input.releaseAltitudeFtMsl,
      startSpeedKcas: input.releaseSpeedKcas,
      startFpaDeg: input.releaseFpaDeg,
      targetFpaDeg: input.gRelaxationFpaDeg,
      recoveryG: input.recoveryG,
      gOnsetTimeSec: input.gOnsetTimeSec,
      maneuverInitiationDelaySec: 0,
    });
  } catch (error) {
    return invalidResult(input, [error.message || String(error)], warnings);
  }

  const relaxationStart = {
    elapsedTimeSec: pull.elapsedTimeSec,
    horizontalDistanceFt: pull.horizontalDistanceNm * FT_PER_NM,
    pathDistanceFt: pull.pathDistanceNm * FT_PER_NM,
    altitudeMslFt: pull.terminationAltitudeMslFt,
    minAltitudeMslFt: pull.minAltitudeMslFt,
    velocityFps: pull.terminationSpeedKtas * KT_TO_FPS,
    fpaRad: input.gRelaxationFpaDeg * DEG_TO_RAD,
  };
  const terminalFpaRad = input.terminalFpaDeg * DEG_TO_RAD;
  let lowDuration = 0.05;
  let highDuration = 12;
  while (runRelaxation(relaxationStart, input, highDuration).fpaRad < terminalFpaRad && highDuration < 30) highDuration *= 1.5;
  if (runRelaxation(relaxationStart, input, highDuration).fpaRad < terminalFpaRad) return invalidResult(input, ["TERMINAL_FPA_NOT_REACHED"], warnings);
  for (let i = 0; i < 35; i += 1) {
    const mid = (lowDuration + highDuration) / 2;
    if (runRelaxation(relaxationStart, input, mid).fpaRad < terminalFpaRad) lowDuration = mid;
    else highDuration = mid;
  }
  const termination = runRelaxation(relaxationStart, input, (lowDuration + highDuration) / 2);
  termination.fpaRad = terminalFpaRad;
  const terminationTasKt = termination.velocityFps / KT_TO_FPS;
  const terminationKcas = tasToCas(terminationTasKt, termination.altitudeMslFt);

  return {
    semType: "CLIMB_SEM",
    model: { ...CLIMB_SEM_MODEL_V0_2 },
    inputs: input,
    releaseFpaDeg: input.releaseFpaDeg,
    recoveryG: input.recoveryG,
    gOnsetTimeSec: input.gOnsetTimeSec,
    gRelaxationFpaDeg: input.gRelaxationFpaDeg,
    terminalFpaDeg: input.terminalFpaDeg,
    terminationHeadingChangeDeg: 0,
    terminationState: {
      elapsedTimeSec: termination.elapsedTimeSec,
      horizontalDistanceFt: termination.horizontalDistanceFt,
      crossrangeDistanceFt: 0,
      altitudeFtMsl: termination.altitudeMslFt,
      fpaDeg: input.terminalFpaDeg,
      headingChangeDeg: 0,
      speedKcas: terminationKcas,
      speedKtas: terminationTasKt,
    },
    elapsedTimeSec: termination.elapsedTimeSec,
    horizontalDistanceNm: termination.horizontalDistanceFt / FT_PER_NM,
    pathDistanceNm: termination.pathDistanceFt / FT_PER_NM,
    altitudeChangeFt: termination.altitudeMslFt - input.releaseAltitudeFtMsl,
    minAltitudeFtMsl: termination.minAltitudeMslFt,
    terminationAltitudeFtMsl: termination.altitudeMslFt,
    terminationSpeedKcas: terminationKcas,
    assumptions: [...ASSUMPTIONS],
    validation: { valid: true, status: "VALID_WITH_MODEL_ASSUMPTIONS", errors: [], warnings },
  };
}
