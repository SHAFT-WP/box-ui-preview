import { calculateBombDeliveryV0_3Full as calculateBombDelivery } from "../bomb-delivery-planner/bomb-delivery-planner-v0.3.mjs";
import { calculateBoxGeometryV0_2Full } from "./box-adapter-v0.2.mjs";
import { calculateBoxOutClosureV0_1, calculateBoxOutManeuverV0_1Full } from "./box-out-maneuver-v0.1.mjs";
import { truncateBeOutput } from "../../../common/ui/display-precision-v0.1.mjs";

export const BOX_V2_COMPOSITION_MODEL_V0_2 = Object.freeze({
  id: "box-v2-composition-v0.2",
  // 0.2.1 (2026-09-29): Roll-in Long. D transfer (Pattern Width) and the Rev1.5 OUT (`out`).
  // 0.2.2 (2026-09-29): Crosswind Leg Extension source DEFAULT / USER with the Rev1.5 minimum
  // (`outClosure`, `crossLeg`).
  version: "0.2.2",
  status: "Work / Pure Composition / Not Official",
  bombDeliverySource: "bomb-delivery-planner-v0.3-js-facade",
  geometrySource: "box-adapter-v0.2 Base Distance Abeam geometry",
  outSource: "box-out-maneuver-v0.1 (Rev1.5 OUT)",
  fixedAngleOffDeg: 90,
});

function finite(name, value) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new TypeError(`${name} must be finite`);
  }
  return value;
}

// Crosswind Leg Extension source (2026-09-29): DEFAULT (the tool default, or after Default) is raised
// to the Rev1.5 minimum; USER (a value the user entered) is kept, and a value below the minimum is a
// geometry error that names the minimum.
const CROSS_LEG_SOURCES = Object.freeze(["USER", "DEFAULT"]);

function round1(value) {
  return Math.round(value * 10) / 10;
}

/**
 * Canonical BOX adapter for a current Bomb Delivery Planner result.
 *
 * Transfers canonical BDP Base Distance and the Roll-in Long. D (the OA1 → attack-line offset, which
 * sets Pattern Width and the OUT Turn radius; 2026-09-29) at full precision.
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
  const rollInLongitudinalDistanceNm = finite(
    "public.rollInDisplacement.forwardNm",
    result.public.rollInDisplacement?.forwardNm,
  );

  return {
    initialTasRoundedKt: round1(initialTasKt),
    groundRangeRoundedNm: round1(groundRangeNm),
    rollInRadiusRoundedNm: round1(rollInRadiusNm),
    rollInRangeRoundedNm: round1(rollInRangeNm),
    baseDistanceNm,
    rollInLongitudinalDistanceNm,
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
  crossLegExtensionSource = "USER",
  out: outOptions = {},
}) {
  if (!bombDeliveryInput || typeof bombDeliveryInput !== "object") {
    throw new TypeError("bombDeliveryInput must be an object");
  }
  finite("baseTurnG", baseTurnG);
  finite("crossTurnG", crossTurnG);
  finite("crossLegExtensionNm", crossLegExtensionNm);
  if (!CROSS_LEG_SOURCES.includes(crossLegExtensionSource)) {
    throw new RangeError("crossLegExtensionSource must be USER or DEFAULT");
  }

  const bombDelivery = calculateBombDelivery({
    ...bombDeliveryInput,
    angleOffDeg: BOX_V2_COMPOSITION_MODEL_V0_2.fixedAngleOffDeg,
  });
  const profileSource = adaptBombDeliveryResultToBoxFieldsV0_2(bombDelivery);
  const geometryFor = (crossLegNm) => calculateBoxGeometryV0_2Full({
    profileSource,
    baseTurnG,
    crossTurnG,
    crossLegExtensionNm: crossLegNm,
  });
  const requestedPattern = geometryFor(crossLegExtensionNm);
  // Rev1.5 OUT; its turn mirrors the Roll-in side of the pattern (OUT Turn radius = Roll-in Long. D).
  const out = calculateBoxOutManeuverV0_1Full(bombDelivery, {
    ...outOptions,
    outTurnRadiusNm: profileSource.rollInLongitudinalDistanceNm,
  });
  // The OUT closure and the Crosswind Leg minimum depend on the turn radii, not on the Crosswind Leg.
  const outClosure = calculateBoxOutClosureV0_1({
    out,
    outTurnRadiusNm: profileSource.rollInLongitudinalDistanceNm,
    crossTurnRadiusNm: requestedPattern.crossRadiusNm,
    baseTurnRadiusNm: requestedPattern.baseRadiusNm,
  });
  const minimumNm = outClosure.crossLegMinimumNm;
  // Rev1.5 raises a non-custom Crosswind Leg only when it is short by more than 0.5 m.
  const autoExtended = crossLegExtensionSource === "DEFAULT" && crossLegExtensionNm * 1852 + 0.5 < minimumNm * 1852;
  const effectiveNm = autoExtended ? minimumNm : crossLegExtensionNm;
  const pattern = autoExtended ? geometryFor(effectiveNm) : requestedPattern;
  const crossLeg = {
    source: crossLegExtensionSource,
    requestedNm: crossLegExtensionNm,
    minimumNm,
    effectiveNm,
    autoExtended,
    belowMinimum: effectiveNm * 1852 + 0.5 < minimumNm * 1852,
  };

  return {
    model: { ...BOX_V2_COMPOSITION_MODEL_V0_2 },
    fixedAngleOffDeg: BOX_V2_COMPOSITION_MODEL_V0_2.fixedAngleOffDeg,
    bombDelivery,
    profileSource,
    pattern,
    out,
    outClosure,
    crossLeg,
  };
}
