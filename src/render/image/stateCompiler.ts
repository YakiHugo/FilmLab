import { createDefaultAdjustments, normalizeAdjustments } from "@/lib/adjustments";
import { getBuiltInFilmProfile, resolveFilmProfile } from "@/lib/film";
import type {
  Asset,
  AsciiAdjustments,
  EditingAdjustments,
  FilmProfile,
  FilmProfileAny,
  FilmProfileOverrides,
  LocalAdjustment,
} from "@/types";
import type {
  CanvasImageRenderStateV1,
  ImageAsciiEffectNode,
  ImageEffectNode,
  ImageFilter2dEffectNode,
  ImageRenderDevelopRegion,
  ImageRenderDocument,
  ImageRenderFilmState,
  ImageRenderGeometry,
  ImageRenderMaskState,
  ImageRenderOutputState,
  ImageRenderSource,
} from "./types";

const DEFAULT_ADJUSTMENTS = createDefaultAdjustments();

const clampEffectNumber = (value: number | undefined) => {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return 0;
  }
  return value;
};

export const resolveImageRenderSource = (asset: Asset): ImageRenderSource => ({
  assetId: asset.id,
  objectUrl: asset.objectUrl,
  contentHash: asset.contentHash ?? null,
  name: asset.name,
  mimeType: asset.type,
  width: asset.metadata?.width,
  height: asset.metadata?.height,
});

export const resolveLegacyGeometry = (adjustments: EditingAdjustments): ImageRenderGeometry => ({
  rotate: adjustments.rotate,
  rightAngleRotation: adjustments.rightAngleRotation,
  perspectiveEnabled: adjustments.perspectiveEnabled ?? false,
  perspectiveHorizontal: adjustments.perspectiveHorizontal ?? 0,
  perspectiveVertical: adjustments.perspectiveVertical ?? 0,
  vertical: adjustments.vertical,
  horizontal: adjustments.horizontal,
  scale: adjustments.scale,
  flipHorizontal: adjustments.flipHorizontal,
  flipVertical: adjustments.flipVertical,
  aspectRatio: adjustments.aspectRatio,
  customAspectRatio: adjustments.customAspectRatio,
  opticsProfile: adjustments.opticsProfile,
  opticsCA: adjustments.opticsCA,
  opticsDistortionK1: adjustments.opticsDistortionK1 ?? 0,
  opticsDistortionK2: adjustments.opticsDistortionK2 ?? 0,
  opticsCaAmount: adjustments.opticsCaAmount ?? 0,
  opticsVignette: adjustments.opticsVignette,
  opticsVignetteMidpoint: adjustments.opticsVignetteMidpoint ?? 50,
});

export const resolveLegacyOutput = (adjustments: EditingAdjustments): ImageRenderOutputState => ({
  timestamp: {
    enabled: adjustments.timestampEnabled,
    position: adjustments.timestampPosition,
    size: adjustments.timestampSize,
    opacity: adjustments.timestampOpacity,
  },
});

export const resolveLegacyFilmStateFromInputs = ({
  filmProfile,
  filmProfileId,
  filmProfileOverrides,
}: {
  filmProfile?: FilmProfile | null | undefined;
  filmProfileId?: string | null | undefined;
  filmProfileOverrides?: FilmProfileOverrides | null | undefined;
}): ImageRenderFilmState => {
  if (filmProfile !== undefined) {
    return {
      profileId: filmProfile?.id ?? null,
      profile: filmProfile,
      profileOverrides: filmProfileOverrides ?? null,
    };
  }

  if (typeof filmProfileId === "string" && filmProfileId.length > 0) {
    return {
      profileId: filmProfileId,
      profile: getBuiltInFilmProfile(filmProfileId) ?? undefined,
      profileOverrides: filmProfileOverrides ?? null,
    };
  }

  return {
    profileId: null,
    profile: undefined,
    profileOverrides: filmProfileOverrides ?? null,
  };
};

const resolveLegacyAsciiEffect = (
  ascii: AsciiAdjustments | undefined
): ImageAsciiEffectNode | null => {
  if (!ascii?.enabled) {
    return null;
  }
  return {
    id: "legacy-ascii",
    type: "ascii",
    enabled: true,
    placement: "afterFilm",
    analysisSource: "afterFilm",
    params: {
      renderMode: "glyph",
      preset: ascii.charsetPreset,
      cellSize: ascii.cellSize,
      characterSpacing: ascii.characterSpacing,
      density: 1,
      coverage: 1,
      edgeEmphasis: 0,
      brightness: 0,
      contrast: ascii.contrast,
      dither: ascii.dither,
      colorMode: ascii.colorMode,
      foregroundOpacity: 1,
      foregroundBlendMode: "source-over",
      backgroundMode: "cell-solid",
      backgroundBlur: 0,
      backgroundOpacity: 1,
      backgroundColor: "#000000",
      invert: ascii.invert,
      gridOverlay: false,
    },
  };
};

const resolveLegacyFilter2dEffect = (
  adjustments: EditingAdjustments
): ImageFilter2dEffectNode | null => {
  const brightness = clampEffectNumber(adjustments.brightness);
  const hue = clampEffectNumber(adjustments.hue);
  const blur = clampEffectNumber(adjustments.blur);
  const dilate = clampEffectNumber(adjustments.dilate);

  if (
    Math.abs(brightness) <= 0.001 &&
    Math.abs(hue) <= 0.001 &&
    blur <= 0.001 &&
    dilate <= 0.001
  ) {
    return null;
  }

  return {
    id: "legacy-filter2d",
    type: "filter2d",
    enabled: true,
    placement: "afterOutput",
    params: {
      brightness,
      hue,
      blur,
      dilate,
    },
  };
};

export const resolveLegacyEffects = (adjustments: EditingAdjustments): ImageEffectNode[] => {
  const effects: ImageEffectNode[] = [];
  const ascii = resolveLegacyAsciiEffect(adjustments.ascii);
  if (ascii) {
    effects.push(ascii);
  }
  const filter2d = resolveLegacyFilter2dEffect(adjustments);
  if (filter2d) {
    effects.push(filter2d);
  }
  return effects;
};

export const resolveLegacyMasks = (adjustments: EditingAdjustments): ImageRenderMaskState => {
  const localAdjustments = adjustments.localAdjustments ?? [];
  return {
    byId: Object.fromEntries(
      localAdjustments.map((local, index) => {
        const id = local.id || `legacy-local-${index}`;
        return [
          id,
          {
            id,
            kind: "legacy-local-adjustment" as const,
            sourceLocalAdjustmentId: local.id || id,
            mask: local.mask,
          },
        ];
      })
    ),
  };
};

export const resolveLegacyFilmState = ({
  asset,
  filmProfile,
  filmProfileId,
}: {
  asset: Asset;
  filmProfile?: FilmProfile | null | undefined;
  filmProfileId?: string | null | undefined;
}): ImageRenderFilmState => {
  if (filmProfile !== undefined) {
    return resolveLegacyFilmStateFromInputs({
      filmProfile,
      filmProfileOverrides: asset.filmOverrides ?? null,
    });
  }

  if (typeof filmProfileId === "string" && filmProfileId.length > 0) {
    return resolveLegacyFilmStateFromInputs({
      filmProfileId,
      filmProfileOverrides: asset.filmOverrides ?? null,
    });
  }

  const resolvedProfile =
    asset.filmProfile ??
    (asset.filmProfileId ? getBuiltInFilmProfile(asset.filmProfileId) ?? undefined : undefined) ??
    undefined;
  const resolvedProfileId = resolvedProfile?.id ?? asset.filmProfileId ?? null;

  return resolveLegacyFilmStateFromInputs({
    filmProfile: resolvedProfile,
    filmProfileId: resolvedProfileId,
    filmProfileOverrides: asset.filmOverrides ?? null,
  });
};

const resolveLegacyRegions = (adjustments: EditingAdjustments): ImageRenderDevelopRegion[] =>
  (adjustments.localAdjustments ?? []).map((local, index) => ({
    id: local.id || `legacy-local-${index}`,
    enabled: local.enabled,
    amount: local.amount,
    maskId: local.id || `legacy-local-${index}`,
    adjustments: { ...local.adjustments },
  }));

const createCanvasImageRenderStateFromNormalizedLegacyInputs = ({
  adjustments,
  filmState,
}: {
  adjustments: EditingAdjustments;
  filmState: ImageRenderFilmState;
}): CanvasImageRenderStateV1 => ({
  geometry: resolveLegacyGeometry(adjustments),
  develop: {
    tone: {
      exposure: adjustments.exposure,
      contrast: adjustments.contrast,
      highlights: adjustments.highlights,
      shadows: adjustments.shadows,
      whites: adjustments.whites,
      blacks: adjustments.blacks,
    },
    color: {
      temperature: adjustments.temperature,
      tint: adjustments.tint,
      hue: 0,
      temperatureKelvin: adjustments.temperatureKelvin,
      tintMG: adjustments.tintMG,
      vibrance: adjustments.vibrance,
      saturation: adjustments.saturation,
      pointCurve: structuredClone(adjustments.pointCurve),
      hsl: structuredClone(adjustments.hsl),
      bwEnabled: Boolean(adjustments.bwEnabled),
      bwMix: structuredClone(adjustments.bwMix ?? DEFAULT_ADJUSTMENTS.bwMix!),
      calibration: structuredClone(adjustments.calibration ?? DEFAULT_ADJUSTMENTS.calibration!),
      colorGrading: structuredClone(adjustments.colorGrading),
    },
    detail: {
      texture: adjustments.texture,
      clarity: adjustments.clarity,
      dehaze: adjustments.dehaze,
      sharpening: adjustments.sharpening,
      sharpenRadius: adjustments.sharpenRadius,
      sharpenDetail: adjustments.sharpenDetail,
      masking: adjustments.masking,
      noiseReduction: adjustments.noiseReduction,
      colorNoiseReduction: adjustments.colorNoiseReduction,
    },
    fx: {
      vignette: adjustments.vignette,
      grain: adjustments.grain,
      grainSize: adjustments.grainSize,
      grainRoughness: adjustments.grainRoughness,
      glowIntensity: adjustments.glowIntensity,
      glowMidtoneFocus: adjustments.glowMidtoneFocus,
      glowBias: adjustments.glowBias,
      glowRadius: adjustments.glowRadius,
      customLut: adjustments.customLut ? structuredClone(adjustments.customLut) : undefined,
      pushPullEv: adjustments.pushPullEv,
    },
    regions: resolveLegacyRegions(adjustments),
  },
  masks: resolveLegacyMasks(adjustments),
  effects: resolveLegacyEffects(adjustments),
  film: filmState,
  output: resolveLegacyOutput(adjustments),
});

export const createDefaultCanvasImageRenderState = ({
  adjustments,
  filmProfile,
  filmProfileId,
  filmProfileOverrides,
}: {
  adjustments?: EditingAdjustments;
  filmProfile?: FilmProfile | null | undefined;
  filmProfileId?: string | null | undefined;
  filmProfileOverrides?: FilmProfileOverrides | null | undefined;
} = {}): CanvasImageRenderStateV1 => {
  const normalized = normalizeAdjustments(adjustments ?? DEFAULT_ADJUSTMENTS);
  return createCanvasImageRenderStateFromNormalizedLegacyInputs({
    adjustments: normalized,
    filmState: resolveLegacyFilmStateFromInputs({
      filmProfile,
      filmProfileId,
      filmProfileOverrides,
    }),
  });
};

export const createCanvasImageRenderStateFromAsset = ({
  asset,
  adjustments,
  filmProfileId,
  filmProfile,
}: {
  asset: Asset;
  adjustments?: EditingAdjustments;
  filmProfileId?: string | null | undefined;
  filmProfile?: FilmProfile | null | undefined;
}): CanvasImageRenderStateV1 => {
  const normalized = normalizeAdjustments(adjustments ?? asset.adjustments ?? DEFAULT_ADJUSTMENTS);
  return createCanvasImageRenderStateFromNormalizedLegacyInputs({
    adjustments: normalized,
    filmState: resolveLegacyFilmState({ asset, filmProfileId, filmProfile }),
  });
};

const resolveAsciiAdjustmentsFromEffects = (
  effects: readonly ImageEffectNode[]
): AsciiAdjustments => {
  const effect = effects.find(
    (candidate): candidate is ImageAsciiEffectNode =>
      candidate.type === "ascii" && candidate.enabled
  );
  return {
    ...(DEFAULT_ADJUSTMENTS.ascii ?? {
      enabled: false,
      charsetPreset: "standard",
      colorMode: "grayscale",
      cellSize: 12,
      characterSpacing: 1,
      contrast: 1,
      dither: "none",
      invert: false,
    }),
    enabled: Boolean(effect),
    charsetPreset:
      effect?.params.preset === "blocks" || effect?.params.preset === "detailed"
        ? effect.params.preset
        : "standard",
    colorMode: effect?.params.colorMode === "full-color" ? "full-color" : "grayscale",
    cellSize: effect?.params.cellSize ?? 12,
    characterSpacing: effect?.params.characterSpacing ?? 1,
    contrast: effect?.params.contrast ?? 1,
    dither: effect?.params.dither ?? "none",
    invert: Boolean(effect?.params.invert),
  };
};

const resolveFilter2dFromEffects = (effects: readonly ImageEffectNode[]) => {
  const effect = effects.find(
    (candidate): candidate is ImageFilter2dEffectNode =>
      candidate.type === "filter2d" && candidate.enabled
  );
  return {
    brightness: effect?.params.brightness ?? 0,
    hue: effect?.params.hue ?? 0,
    blur: effect?.params.blur ?? 0,
    dilate: effect?.params.dilate ?? 0,
  };
};

const resolveLocalAdjustmentsFromState = (
  state: CanvasImageRenderStateV1
): LocalAdjustment[] =>
  state.develop.regions
    .map((region) => {
      const maskDefinition = state.masks.byId[region.maskId];
      if (!maskDefinition) {
        return null;
      }
      return {
        id: region.id,
        enabled: region.enabled,
        amount: region.amount,
        mask: structuredClone(maskDefinition.mask),
        adjustments: structuredClone(region.adjustments),
      } satisfies LocalAdjustment;
    })
    .filter((entry): entry is LocalAdjustment => Boolean(entry));

export const compileImageRenderOutputToLegacyTimestampAdjustments = (
  output: ImageRenderOutputState
): Pick<
  EditingAdjustments,
  "timestampEnabled" | "timestampOpacity" | "timestampPosition" | "timestampSize"
> => ({
  timestampEnabled: output.timestamp.enabled,
  timestampPosition: output.timestamp.position,
  timestampSize: output.timestamp.size,
  timestampOpacity: output.timestamp.opacity,
});

export const resolveFilter2dPreviewValuesFromState = (state: CanvasImageRenderStateV1) =>
  resolveFilter2dFromEffects(state.effects);
