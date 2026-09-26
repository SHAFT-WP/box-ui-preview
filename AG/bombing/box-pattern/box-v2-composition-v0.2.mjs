import { calculateBombDeliveryV0_3Full as calculateBombDelivery } from "../bomb-delivery-planner/bomb-delivery-planner-v0.3.mjs";
import { calculateBoxGeometryV0_2Full } from "./box-adapter-v0.2.mjs";
import { truncateBeOutput } from "../../../common/ui/display-precision-v0.1.mjs";

export const BOX_V2_COMPOSITION_MODEL_V0_2 = Object.freeze({
  id: "box-v2-composition-v0.2",
  version: "0.2.0",
  status: "Work / Pure Composition / Not Official",
  bombDeliverySource: "bomb-delivery-planner-v0.3-js-facade",
  geometrySource: "box-adapter-v0.2 Base Distance Abeam geometry",
  fixedAngleOffDeg: 90,
});

function finite(name, value) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new TypeError(`${name} must be finite`);
  }
  return value;
}

function round1(value) {
  return Math.round(value * 10) / 10;
}

/**
 * Canonical BOX adapter for a current Bomb Delivery Planner result.
 *
 * Transfers canonical BDP Base Distance at full precision.
 */
export function adaptBombDeliveryResultToBoxFieldsV0_2(result) {
  if (!result || typeof result !== "object") throw new TypeError("result must be an object");
  if (!result.public || !result.diagnostics) {
    throw new TypeError("result must be a Bomb Delivery Planner v0.3 result");
  }

  const initialTasKt = result.diagnostics.initialTasKt;
  const groundRangeNm = result.public.groundRangeNm;
  const rollInRadiusNm = result.public.rollInRadiusNm;
  const rollInRangeNm = result.public.rollInRangeNm;
  const baseDistanceNm = result.public.baseDistanceNm;

  finite("diagnostics.initialTasKt", initialTasKt);
  finite("public.groundRangeNm", groundRangeNm);
  finite("public.rollInRadiusNm", rollInRadiusNm);
  finite("public.rollInRangeNm", rollInRangeNm);
  finite("public.baseDistanceNm", baseDistanceNm);

  return {
    initialTasRoundedKt: round1(initialTasKt),
    groundRangeRoundedNm: round1(groundRangeNm),
    rollInRadiusRoundedNm: round1(rollInRadiusNm),
    rollInRangeRoundedNm: round1(rollInRangeNm),
    baseDistanceNm,
    rollInTrajectorySamples: result.visualization?.rollInTrajectorySamples ?? [],
    profile: result,
  };
}

// Public entrypoint: result truncated to 5 decimals (docs/FE-BE-RULES.md). BE-to-BE composition
// and relation checks use calculateBoxPatternV0_2Full, which keeps full precision.
export function calculateBoxPatternV0_2(input) {
  return truncateBeOutput(calculateBoxPatternV0_2Full(input));
}

export function calculateBoxPatternV0_2Full({
  bombDeliveryInput,
  baseTurnG,
  crossTurnG,
  crossLegExtensionNm,
}) {
  if (!bombDeliveryInput || typeof bombDeliveryInput !== "object") {
    throw new TypeError("bombDeliveryInput must be an object");
  }
  finite("baseTurnG", baseTurnG);
  finite("crossTurnG", crossTurnG);
  finite("crossLegExtensionNm", crossLegExtensionNm);

  const bombDelivery = calculateBombDelivery({
    ...bombDeliveryInput,
    angleOffDeg: BOX_V2_COMPOSITION_MODEL_V0_2.fixedAngleOffDeg,
  });
  const profileSource = adaptBombDeliveryResultToBoxFieldsV0_2(bombDelivery);
  const pattern = calculateBoxGeometryV0_2Full({
    profileSource,
    baseTurnG,
    crossTurnG,
    crossLegExtensionNm,
  });

  return {
    model: { ...BOX_V2_COMPOSITION_MODEL_V0_2 },
    fixedAngleOffDeg: BOX_V2_COMPOSITION_MODEL_V0_2.fixedAngleOffDeg,
    bombDelivery,
    profileSource,
    pattern,
  };
}
