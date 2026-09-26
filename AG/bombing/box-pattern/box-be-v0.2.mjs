// Public calculate* entrypoints return output truncated to 5 decimals (docs/FE-BE-RULES.md).
// The *Full variants keep full precision for BE-to-BE composition and relation checks.
export {
  BOX_ADAPTER_MODEL_V0_2,
  adaptBombDeliveryToBoxFieldsV0_2,
  calculateBoxGeometryV0_2,
  calculateBoxGeometryV0_2Full,
} from "./box-adapter-v0.2.mjs";

export {
  BOX_V2_COMPOSITION_MODEL_V0_2,
  adaptBombDeliveryResultToBoxFieldsV0_2,
  calculateBoxPatternV0_2,
  calculateBoxPatternV0_2Full,
} from "./box-v2-composition-v0.2.mjs";

// Preserved compatibility/regression surfaces remain available explicitly.
export {
  adaptBombDeliveryToLegacyBoxFields,
  calculateBoxLegacyGeometry,
} from "./box-adapter-v0.1.mjs";

export {
  calculateBoxClimbSemCompositionV0_3,
  calculateBoxClimbSemCompositionV0_3Full,
} from "./box-sem-composition-v0.3.mjs";
export {
  calculateBoxPatternReentryV0_3,
  calculateBoxPatternReentryV0_3Full,
} from "./pattern-reentry-v0.3.mjs";

export const BOX_BE_ENTRYPOINT_V0_2 = Object.freeze({
  status: "Work / Pure Calculation / Not Official",
  entrypointVersion: "0.2.1",
  fixedAngleOffDeg: 90,
  canonicalBaseDistanceKey: "baseDistanceNm",
  canonicalAbeamDistanceKey: "abeamExtensionDistanceNm",
  canonicalAbeamTimeKey: "abeamExtensionTimeSec",
  officialStandalone: "bombing/box-pattern/box-pattern.html",
  officialRevision: "Rev1.5 · R_20260831",
});
