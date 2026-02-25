import type {
  Asset,
  AssetUpdate,
  ColorGradingAdjustments,
  ColorGradingZone,
  EditingAdjustments,
  FilmModuleConfig,
  FilmProfile,
  FilmProfileOverrides,
  HslAdjustments,
  HslChannel,
  HslColorKey,
  LocalAdjustment,
  LocalAdjustmentDelta,
  LocalAdjustmentMask,
  PointCurveAdjustments,
  PointCurvePoint,
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

export const cloneEditorAssetSnapshot = (snapshot: EditorAssetSnapshot): EditorAssetSnapshot =>
  cloneValue(snapshot);

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
  "red",
  "orange",
  "yellow",
  "green",
  "aqua",
  "blue",
  "purple",
  "magenta",
];

const hslEqual = (a: HslAdjustments | undefined, b: HslAdjustments | undefined): boolean => {
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

const pointCurvePointEqual = (a: PointCurvePoint, b: PointCurvePoint): boolean =>
  a.x === b.x && a.y === b.y;

const pointCurveChannelEqual = (a: PointCurvePoint[], b: PointCurvePoint[]): boolean =>
  a.length === b.length && a.every((point, index) => pointCurvePointEqual(point, b[index]!));

const pointCurveEqual = (
  a: PointCurveAdjustments | undefined,
  b: PointCurveAdjustments | undefined
): boolean => {
  if (a === b) return true;
  if (!a || !b) return false;
  return (
    pointCurveChannelEqual(a.rgb, b.rgb) &&
    pointCurveChannelEqual(a.red, b.red) &&
    pointCurveChannelEqual(a.green, b.green) &&
    pointCurveChannelEqual(a.blue, b.blue)
  );
};

const LOCAL_DELTA_KEYS: Array<keyof LocalAdjustmentDelta> = [
  "exposure",
  "contrast",
  "highlights",
  "shadows",
  "whites",
  "blacks",
  "temperature",
  "tint",
  "vibrance",
  "saturation",
  "texture",
  "clarity",
  "dehaze",
  "sharpening",
  "noiseReduction",
  "colorNoiseReduction",
];

const localMaskEqual = (a: LocalAdjustmentMask, b: LocalAdjustmentMask): boolean => {
  if (a.mode !== b.mode || Boolean(a.invert) !== Boolean(b.invert)) {
    return false;
  }
  if (
    (a.lumaMin ?? 0) !== (b.lumaMin ?? 0) ||
    (a.lumaMax ?? 1) !== (b.lumaMax ?? 1) ||
    (a.lumaFeather ?? 0) !== (b.lumaFeather ?? 0) ||
    (a.hueCenter ?? 0) !== (b.hueCenter ?? 0) ||
    (a.hueRange ?? 180) !== (b.hueRange ?? 180) ||
    (a.hueFeather ?? 0) !== (b.hueFeather ?? 0) ||
    (a.satMin ?? 0) !== (b.satMin ?? 0) ||
    (a.satFeather ?? 0) !== (b.satFeather ?? 0)
  ) {
    return false;
  }
  if (a.mode === "radial" && b.mode === "radial") {
    return (
      a.centerX === b.centerX &&
      a.centerY === b.centerY &&
      a.radiusX === b.radiusX &&
      a.radiusY === b.radiusY &&
      a.feather === b.feather
    );
  }
  if (a.mode === "linear" && b.mode === "linear") {
    return (
      a.startX === b.startX &&
      a.startY === b.startY &&
      a.endX === b.endX &&
      a.endY === b.endY &&
      a.feather === b.feather
    );
  }
  if (a.mode === "brush" && b.mode === "brush") {
    if (
      a.brushSize !== b.brushSize ||
      a.feather !== b.feather ||
      a.flow !== b.flow ||
      a.points.length !== b.points.length
    ) {
      return false;
    }
    for (let i = 0; i < a.points.length; i += 1) {
      const pa = a.points[i]!;
      const pb = b.points[i]!;
      if (pa.x !== pb.x || pa.y !== pb.y || (pa.pressure ?? 1) !== (pb.pressure ?? 1)) {
        return false;
      }
    }
    return true;
  }
  return false;
};

const localAdjustmentEqual = (a: LocalAdjustment, b: LocalAdjustment): boolean => {
  if (
    a.id !== b.id ||
    a.enabled !== b.enabled ||
    a.amount !== b.amount ||
    !localMaskEqual(a.mask, b.mask)
  ) {
    return false;
  }
  return LOCAL_DELTA_KEYS.every((key) => (a.adjustments[key] ?? 0) === (b.adjustments[key] ?? 0));
};

const localAdjustmentsEqual = (
  a: LocalAdjustment[] | undefined,
  b: LocalAdjustment[] | undefined
): boolean => {
  const listA = a ?? [];
  const listB = b ?? [];
  if (listA.length !== listB.length) {
    return false;
  }
  return listA.every((item, index) => localAdjustmentEqual(item, listB[index]!));
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
    (a.temperatureKelvin ?? null) === (b.temperatureKelvin ?? null) &&
    (a.tintMG ?? null) === (b.tintMG ?? null) &&
    a.vibrance === b.vibrance &&
    a.saturation === b.saturation &&
    a.texture === b.texture &&
    a.clarity === b.clarity &&
    a.dehaze === b.dehaze &&
    a.curveHighlights === b.curveHighlights &&
    a.curveLights === b.curveLights &&
    a.curveDarks === b.curveDarks &&
    a.curveShadows === b.curveShadows &&
    (a.bwEnabled ?? false) === (b.bwEnabled ?? false) &&
    (a.bwMix?.red ?? 0) === (b.bwMix?.red ?? 0) &&
    (a.bwMix?.green ?? 0) === (b.bwMix?.green ?? 0) &&
    (a.bwMix?.blue ?? 0) === (b.bwMix?.blue ?? 0) &&
    (a.calibration?.redHue ?? 0) === (b.calibration?.redHue ?? 0) &&
    (a.calibration?.redSaturation ?? 0) === (b.calibration?.redSaturation ?? 0) &&
    (a.calibration?.greenHue ?? 0) === (b.calibration?.greenHue ?? 0) &&
    (a.calibration?.greenSaturation ?? 0) === (b.calibration?.greenSaturation ?? 0) &&
    (a.calibration?.blueHue ?? 0) === (b.calibration?.blueHue ?? 0) &&
    (a.calibration?.blueSaturation ?? 0) === (b.calibration?.blueSaturation ?? 0) &&
    a.sharpening === b.sharpening &&
    a.sharpenRadius === b.sharpenRadius &&
    a.sharpenDetail === b.sharpenDetail &&
    a.masking === b.masking &&
    a.noiseReduction === b.noiseReduction &&
    a.colorNoiseReduction === b.colorNoiseReduction &&
    a.vignette === b.vignette &&
    a.grain === b.grain &&
    a.grainSize === b.grainSize &&
    a.grainRoughness === b.grainRoughness &&
    a.rotate === b.rotate &&
    a.rightAngleRotation === b.rightAngleRotation &&
    (a.perspectiveEnabled ?? false) === (b.perspectiveEnabled ?? false) &&
    (a.perspectiveHorizontal ?? 0) === (b.perspectiveHorizontal ?? 0) &&
    (a.perspectiveVertical ?? 0) === (b.perspectiveVertical ?? 0) &&
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
    a.opticsVignette === b.opticsVignette &&
    localAdjustmentsEqual(a.localAdjustments, b.localAdjustments) &&
    pointCurveEqual(a.pointCurve, b.pointCurve) &&
    hslEqual(a.hsl, b.hsl) &&
    colorGradingEqual(a.colorGrading, b.colorGrading)
  );
};

const filmModuleEqual = (a: FilmModuleConfig, b: FilmModuleConfig): boolean => {
  if (
    a.id !== b.id ||
    a.enabled !== b.enabled ||
    a.amount !== b.amount ||
    a.seedMode !== b.seedMode ||
    a.seed !== b.seed
  ) {
    return false;
  }
  const pa = a.params as unknown as Record<string, unknown>;
  const pb = b.params as unknown as Record<string, unknown>;
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

const filmProfileEqual = (a: FilmProfile | undefined, b: FilmProfile | undefined): boolean => {
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

export const editorSnapshotToAssetPatch = (snapshot: EditorAssetSnapshot): AssetUpdate => ({
  presetId: snapshot.presetId,
  intensity: snapshot.intensity,
  adjustments: snapshot.adjustments ? cloneValue(snapshot.adjustments) : undefined,
  filmProfileId: snapshot.filmProfileId,
  filmProfile: snapshot.filmProfile ? cloneValue(snapshot.filmProfile) : undefined,
  filmOverrides: snapshot.filmOverrides ? cloneValue(snapshot.filmOverrides) : undefined,
});
