import { casToTas } from "../../../common/airspeed/airspeed-v0.1.mjs";
import { bankAngleDegFromLoadFactor } from "../../../common/maneuvers/turn-performance/turn-performance-v0.1.mjs";
import { calculateBombDeliveryLegacyEquivalent } from "../bomb-delivery-planner/bomb-delivery-planner-v0.1.mjs";

const LEGACY_G_MPS2 = 9.80665;
const LEGACY_NM_M = 1852;
const LEGACY_KT_TO_MPS = 0.514444;

function round1(value) {
  return Math.round(value * 10) / 10;
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

export function adaptBombDeliveryToLegacyBoxFields(profileInput) {
  const profile = calculateBombDeliveryLegacyEquivalent({
    ...profileInput,
    angleOffDeg: 90,
    rollHeading: 90,
  });
  const initialTasKt = casToTas(
    profile.public.resolvedInitialSpeedKcas,
    profile.public.resolvedInitialAltitudeMslFt,
  );
  return {
    initialTasRoundedKt: round1(initialTasKt),
    groundRangeRoundedNm: round1(profile.public.groundRangeNm),
    rollInRadiusRoundedNm: round1(profile.public.rollInRadiusNm),
    rollInRangeRoundedNm: round1(profile.public.rollInRangeNm),
    rollInTrajectorySamples: profile.visualization.rollInTrajectorySamples,
    profile,
  };
}

export function calculateBoxLegacyGeometry({
  profileSource,
  baseTurnG,
  crossTurnG,
  crossLegExtensionNm,
}) {
  const tasKt = profileSource.initialTasRoundedKt;
  const speedMps = tasKt * LEGACY_KT_TO_MPS;
  const base = legacyBoxTurnFromTasAndG(tasKt, baseTurnG);
  const cross = legacyBoxTurnFromTasAndG(tasKt, crossTurnG);
  const abeamExtensionNm = profileSource.rollInRangeRoundedNm - base.turnRadiusNm;
  const abeamExtensionTimeSec =
    (abeamExtensionNm * LEGACY_NM_M) / speedMps;
  const crossLegTimeSec =
    (crossLegExtensionNm * LEGACY_NM_M) / speedMps;
  const patternWidthNm =
    profileSource.rollInRadiusRoundedNm + crossLegExtensionNm + cross.turnRadiusNm;
  const baseLegNm = crossLegExtensionNm + cross.turnRadiusNm - base.turnRadiusNm;

  return {
    baseG: baseTurnG,
    baseRadiusNm: base.turnRadiusNm,
    baseBankDeg: base.bankAngleDeg,
    crossG: crossTurnG,
    crossRadiusNm: cross.turnRadiusNm,
    crossBankDeg: cross.bankAngleDeg,
    abeamExtensionNm,
    abeamExtensionTimeSec,
    crossLegExtensionNm,
    crossLegTimeSec,
    patternWidthNm,
    baseLegNm,
  };
}
