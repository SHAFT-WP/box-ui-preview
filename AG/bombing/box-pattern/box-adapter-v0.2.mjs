import { casToTas } from "../../../common/airspeed/airspeed-v0.1.mjs";
import { bankAngleDegFromLoadFactor } from "../../../common/maneuvers/turn-performance/turn-performance-v0.1.mjs";
import { calculateBombDeliveryLegacyEquivalent } from "../bomb-delivery-planner/bomb-delivery-planner-v0.1.mjs";
import { truncateBeOutput } from "../../../common/ui/display-precision-v0.1.mjs";

const LEGACY_G_MPS2 = 9.80665;
const LEGACY_NM_M = 1852;
const LEGACY_KT_TO_MPS = 0.514444;

export const BOX_ADAPTER_MODEL_V0_2 = Object.freeze({
  id: "box-adapter-v0.2-base-distance-abeam-extension",
  version: "0.2.0",
  status: "Work / Pure Calculation / Not Official",
});

function round1(value) {
  return Math.round(value * 10) / 10;
}

function finite(name, value) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new TypeError(`${name} must be finite`);
  }
  return value;
}

function legacyBoxTurnFromTasAndG(tasKt, loadFactorG) {
  const bankAngleDeg = bankAngleDegFromLoadFactor(loadFactorG);
  const speedMps = tasKt * LEGACY_KT_TO_MPS;
  const radiusM =
    (speedMps * speedMps) /
    (LEGACY_G_MPS2 * Math.tan((bankAngleDeg * Math.PI) / 180));
  return {
    bankAngleDeg,
    turnRadiusNm: radiusM / LEGACY_NM_M,
  };
}

/**
 * Legacy Bomb Delivery Planner bridge.
 *
 * Base Distance is intentionally transferred at full calculation precision.
 * It is the canonical V2 name for the value exposed by the legacy BDP key
 * `rollInLateralSeparationNm`. The other rounded fields remain only where the
 * Rev1.5 migration boundary still requires them.
 */
export function adaptBombDeliveryToBoxFieldsV0_2(profileInput) {
  const profile = calculateBombDeliveryLegacyEquivalent({
    ...profileInput,
    angleOffDeg: 90,
    rollHeading: 90,
  });
  const initialTasKt = casToTas(
    profile.public.resolvedInitialSpeedKcas,
    profile.public.resolvedInitialAltitudeMslFt,
  );
  const baseDistanceNm = finite(
    "profile.public.rollInLateralSeparationNm",
    profile.public.rollInLateralSeparationNm,
  );

  return {
    initialTasRoundedKt: round1(initialTasKt),
    groundRangeRoundedNm: round1(profile.public.groundRangeNm),
    rollInRadiusRoundedNm: round1(profile.public.rollInRadiusNm),
    rollInRangeRoundedNm: round1(profile.public.rollInRangeNm),
    baseDistanceNm,
    rollInTrajectorySamples: profile.visualization.rollInTrajectorySamples,
    profile,
  };
}

/**
 * BOX pattern geometry using the current canonical Abeam Extension contract.
 *
 * Abeam Extension Distance = Base Distance - Base Turn Radius
 * Abeam Extension Time = Abeam Extension Distance / Abeam Extension Speed
 *
 * In this migration core Abeam Extension Speed remains the inherited Initial
 * TAS boundary, matching the surrounding V0.1 BOX turn calculation model.
 *
 * Public entrypoint: result truncated to 5 decimals (docs/FE-BE-RULES.md). BOX composition calls
 * calculateBoxGeometryV0_2Full, which keeps full precision.
 */
export function calculateBoxGeometryV0_2(input) {
  return truncateBeOutput(calculateBoxGeometryV0_2Full(input));
}

export function calculateBoxGeometryV0_2Full({
  profileSource,
  baseTurnG,
  crossTurnG,
  crossLegExtensionNm,
}) {
  const tasKt = finite("profileSource.initialTasRoundedKt", profileSource.initialTasRoundedKt);
  const baseDistanceNm = finite("profileSource.baseDistanceNm", profileSource.baseDistanceNm);
  const speedMps = tasKt * LEGACY_KT_TO_MPS;
  const base = legacyBoxTurnFromTasAndG(tasKt, baseTurnG);
  const cross = legacyBoxTurnFromTasAndG(tasKt, crossTurnG);

  const abeamExtensionDistanceNm = baseDistanceNm - base.turnRadiusNm;
  const abeamExtensionTimeSec =
    (abeamExtensionDistanceNm * LEGACY_NM_M) / speedMps;
  const crossLegTimeSec =
    (crossLegExtensionNm * LEGACY_NM_M) / speedMps;
  const patternWidthNm =
    profileSource.rollInRadiusRoundedNm + crossLegExtensionNm + cross.turnRadiusNm;
  const baseLegNm = crossLegExtensionNm + cross.turnRadiusNm - base.turnRadiusNm;

  return {
    baseDistanceNm,
    baseG: baseTurnG,
    baseRadiusNm: base.turnRadiusNm,
    baseBankDeg: base.bankAngleDeg,
    crossG: crossTurnG,
    crossRadiusNm: cross.turnRadiusNm,
    crossBankDeg: cross.bankAngleDeg,
    abeamExtensionDistanceNm,
    abeamExtensionTimeSec,
    crossLegExtensionNm,
    crossLegTimeSec,
    patternWidthNm,
    baseLegNm,
  };
}
