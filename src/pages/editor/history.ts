import type {
  Asset,
  ColorGradingAdjustments,
  ColorGradingZone,
  EditingAdjustments,
  FilmModuleConfig,
  FilmProfile,
  FilmProfileOverrides,
  HslAdjustments,
  HslChannel,
  HslColorKey,
} from "@/types";

export const MAX_HISTORY_PER_ASSET = 50;

export interface EditorAssetSnapshot {
  presetId: string | undefined;
  intensity: number | undefined;
  adjustments: EditingAdjustments | undefined;
  filmProfileId: string | undefined;
  filmProfile: FilmProfile | undefined;
  filmOverrides: FilmProfileOverrides | undefined;
}

const cloneValue = <T>(value: T): T => {
  if (typeof structuredClone === "function") {
    return structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value)) as T;
};

export const cloneEditorAssetSnapshot = (
  snapshot: EditorAssetSnapshot
): EditorAssetSnapshot => cloneValue(snapshot);

export const createEditorAssetSnapshot = (asset: Asset): EditorAssetSnapshot => ({
  presetId: asset.presetId,
  intensity: asset.intensity,
  adjustments: asset.adjustments ? cloneValue(asset.adjustments) : undefined,
  filmProfileId: asset.filmProfileId,
  filmProfile: asset.filmProfile ? cloneValue(asset.filmProfile) : undefined,
  filmOverrides: asset.filmOverrides ? cloneValue(asset.filmOverrides) : undefined,
});

// ---------------------------------------------------------------------------
// Lightweight deep-equal helpers (avoid JSON.stringify in hot paths)
// ---------------------------------------------------------------------------

const shallowRecordEqual = (
  a: Record<string, unknown> | undefined,
  b: Record<string, unknown> | undefined
): boolean => {
  if (a === b) return true;
  if (!a || !b) return a === b;
  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  if (keysA.length !== keysB.length) return false;
  for (const k of keysA) {
    const va = a[k];
    const vb = b[k];
    if (va === vb) continue;
    if (Array.isArray(va) && Array.isArray(vb)) {
      if (va.length !== vb.length || va.some((v, i) => v !== vb[i])) return false;
    } else {
      return false;
    }
  }
  return true;
};

const hslChannelEqual = (a: HslChannel, b: HslChannel): boolean =>
  a.hue === b.hue && a.saturation === b.saturation && a.luminance === b.luminance;

const HSL_KEYS: HslColorKey[] = [
  "red", "orange", "yellow", "green", "aqua", "blue", "purple", "magenta",
];

const hslEqual = (
  a: HslAdjustments | undefined,
  b: HslAdjustments | undefined
): boolean => {
  if (a === b) return true;
  if (!a || !b) return false;
  for (const k of HSL_KEYS) {
    if (!hslChannelEqual(a[k], b[k])) return false;
  }
  return true;
};

const cgZoneEqual = (a: ColorGradingZone, b: ColorGradingZone): boolean =>
  a.hue === b.hue && a.saturation === b.saturation && a.luminance === b.luminance;

const colorGradingEqual = (
  a: ColorGradingAdjustments | undefined,
  b: ColorGradingAdjustments | undefined
): boolean => {
  if (a === b) return true;
  if (!a || !b) return false;
  return (
    a.blend === b.blend &&
    a.balance === b.balance &&
    cgZoneEqual(a.shadows, b.shadows) &&
    cgZoneEqual(a.midtones, b.midtones) &&
    cgZoneEqual(a.highlights, b.highlights)
  );
};

const adjustmentsEqual = (
  a: EditingAdjustments | undefined,
  b: EditingAdjustments | undefined
): boolean => {
  if (a === b) return true;
  if (!a || !b) return false;
  return (
    a.exposure === b.exposure &&
    a.contrast === b.contrast &&
    a.highlights === b.highlights &&
    a.shadows === b.shadows &&
    a.whites === b.whites &&
    a.blacks === b.blacks &&
    a.temperature === b.temperature &&
    a.tint === b.tint &&
    a.vibrance === b.vibrance &&
    a.saturation === b.saturation &&
    a.texture === b.texture &&
    a.clarity === b.clarity &&
    a.dehaze === b.dehaze &&
    a.curveHighlights === b.curveHighlights &&
    a.curveLights === b.curveLights &&
    a.curveDarks === b.curveDarks &&
    a.curveShadows === b.curveShadows &&
    a.sharpening === b.sharpening &&
    a.masking === b.masking &&
    a.noiseReduction === b.noiseReduction &&
    a.colorNoiseReduction === b.colorNoiseReduction &&
    a.vignette === b.vignette &&
    a.grain === b.grain &&
    a.grainSize === b.grainSize &&
    a.grainRoughness === b.grainRoughness &&
    a.rotate === b.rotate &&
    a.rightAngleRotation === b.rightAngleRotation &&
    a.vertical === b.vertical &&
    a.horizontal === b.horizontal &&
    a.scale === b.scale &&
    a.flipHorizontal === b.flipHorizontal &&
    a.flipVertical === b.flipVertical &&
    a.aspectRatio === b.aspectRatio &&
    a.customAspectRatio === b.customAspectRatio &&
    a.timestampEnabled === b.timestampEnabled &&
    a.timestampPosition === b.timestampPosition &&
    a.timestampSize === b.timestampSize &&
    a.timestampOpacity === b.timestampOpacity &&
    a.opticsProfile === b.opticsProfile &&
    a.opticsCA === b.opticsCA &&
    hslEqual(a.hsl, b.hsl) &&
    colorGradingEqual(a.colorGrading, b.colorGrading)
  );
};

const filmModuleEqual = (a: FilmModuleConfig, b: FilmModuleConfig): boolean => {
  if (a.id !== b.id || a.enabled !== b.enabled || a.amount !== b.amount ||
      a.seedMode !== b.seedMode || a.seed !== b.seed) {
    return false;
  }
  const pa = a.params as Record<string, unknown>;
  const pb = b.params as Record<string, unknown>;
  const keys = Object.keys(pa);
  if (keys.length !== Object.keys(pb).length) return false;
  for (const k of keys) {
    const va = pa[k];
    const vb = pb[k];
    if (va === vb) continue;
    if (Array.isArray(va) && Array.isArray(vb)) {
      if (va.length !== vb.length || va.some((v, i) => v !== vb[i])) return false;
    } else {
      return false;
    }
  }
  return true;
};

const filmProfileEqual = (
  a: FilmProfile | undefined,
  b: FilmProfile | undefined
): boolean => {
  if (a === b) return true;
  if (!a || !b) return false;
  if (
    a.id !== b.id ||
    a.version !== b.version ||
    a.name !== b.name ||
    a.description !== b.description ||
    a.modules.length !== b.modules.length
  ) {
    return false;
  }
  // Compare tags arrays
  const tagsA = a.tags;
  const tagsB = b.tags;
  if (tagsA !== tagsB) {
    if (!tagsA || !tagsB || tagsA.length !== tagsB.length) return false;
    for (let i = 0; i < tagsA.length; i++) {
      if (tagsA[i] !== tagsB[i]) return false;
    }
  }
  for (let i = 0; i < a.modules.length; i++) {
    if (!filmModuleEqual(a.modules[i], b.modules[i])) return false;
  }
  return true;
};

const filmOverridesEqual = (
  a: FilmProfileOverrides | undefined,
  b: FilmProfileOverrides | undefined
): boolean => {
  if (a === b) return true;
  if (!a || !b) return false;
  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  if (keysA.length !== keysB.length) return false;
  for (const k of keysA) {
    const oa = a[k as keyof FilmProfileOverrides];
    const ob = b[k as keyof FilmProfileOverrides];
    if (oa === ob) continue;
    if (!oa || !ob) return false;
    if (
      oa.enabled !== ob.enabled ||
      oa.amount !== ob.amount ||
      !shallowRecordEqual(
        oa.params as Record<string, unknown> | undefined,
        ob.params as Record<string, unknown> | undefined
      )
    ) {
      return false;
    }
  }
  return true;
};

export const isEditorAssetSnapshotEqual = (
  a: EditorAssetSnapshot,
  b: EditorAssetSnapshot
): boolean =>
  a.presetId === b.presetId &&
  a.intensity === b.intensity &&
  a.filmProfileId === b.filmProfileId &&
  adjustmentsEqual(a.adjustments, b.adjustments) &&
  filmProfileEqual(a.filmProfile, b.filmProfile) &&
  filmOverridesEqual(a.filmOverrides, b.filmOverrides);

/**
 * Lightweight snapshot that borrows references instead of cloning.
 * Use ONLY for transient comparison — never store the result.
 */
export const createEditorAssetSnapshotRef = (asset: Asset): EditorAssetSnapshot => ({
  presetId: asset.presetId,
  intensity: asset.intensity,
  adjustments: asset.adjustments,
  filmProfileId: asset.filmProfileId,
  filmProfile: asset.filmProfile,
  filmOverrides: asset.filmOverrides,
});

export const editorSnapshotToAssetPatch = (
  snapshot: EditorAssetSnapshot
): Partial<Asset> => ({
  presetId: snapshot.presetId,
  intensity: snapshot.intensity,
  adjustments: snapshot.adjustments ? cloneValue(snapshot.adjustments) : undefined,
  filmProfileId: snapshot.filmProfileId,
  filmProfile: snapshot.filmProfile ? cloneValue(snapshot.filmProfile) : undefined,
  filmOverrides: snapshot.filmOverrides ? cloneValue(snapshot.filmOverrides) : undefined,
});
