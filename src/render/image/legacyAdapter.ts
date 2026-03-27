import { createDefaultAdjustments, normalizeAdjustments } from "@/lib/adjustments";
import { getBuiltInFilmProfile } from "@/lib/film";
import type { Asset, AsciiAdjustments, EditingAdjustments, FilmProfile } from "@/types";
import {
  createImageRenderDocument,
  type ImageAsciiEffectNode,
  type ImageEffectNode,
  type ImageFilter2dEffectNode,
  type ImageRenderDocument,
  type ImageRenderGeometry,
  type ImageRenderMaskState,
  type ImageRenderOutputState,
  type ImageRenderSource,
} from "./types";

const DEFAULT_ADJUSTMENTS = createDefaultAdjustments();

const clampEffectNumber = (value: number | undefined) => {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return 0;
  }
  return value;
};

const resolveLegacySource = (asset: Asset): ImageRenderSource => ({
  assetId: asset.id,
  objectUrl: asset.objectUrl,
  contentHash: asset.contentHash ?? null,
  name: asset.name,
  mimeType: asset.type,
  width: asset.metadata?.width,
  height: asset.metadata?.height,
});

const resolveLegacyGeometry = (adjustments: EditingAdjustments): ImageRenderGeometry => ({
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

const resolveLegacyOutput = (adjustments: EditingAdjustments): ImageRenderOutputState => ({
  timestamp: {
    enabled: adjustments.timestampEnabled,
    position: adjustments.timestampPosition,
    size: adjustments.timestampSize,
    opacity: adjustments.timestampOpacity,
  },
});

const stripLegacyEffectFields = (adjustments: EditingAdjustments): EditingAdjustments => ({
  ...adjustments,
  brightness: 0,
  hue: 0,
  blur: 0,
  dilate: 0,
  ascii: {
    ...(adjustments.ascii ?? DEFAULT_ADJUSTMENTS.ascii!),
    enabled: false,
  },
  timestampEnabled: false,
});

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

const resolveLegacyEffects = (adjustments: EditingAdjustments): ImageEffectNode[] => {
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

const resolveLegacyMasks = (adjustments: EditingAdjustments): ImageRenderMaskState => {
  const localAdjustments = adjustments.localAdjustments ?? [];
  const byId = Object.fromEntries(
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
  );

  return {
    byId,
    localAdjustments,
  };
};

const resolveLegacyFilmState = ({
  asset,
  filmProfile,
  filmProfileId,
}: {
  asset: Asset;
  filmProfile?: FilmProfile | null | undefined;
  filmProfileId?: string | null | undefined;
}) => {
  if (filmProfile !== undefined) {
    return {
      profileId: filmProfile?.id ?? null,
      profile: filmProfile,
    };
  }

  if (typeof filmProfileId === "string" && filmProfileId.length > 0) {
    return {
      profileId: filmProfileId,
      profile: getBuiltInFilmProfile(filmProfileId) ?? undefined,
    };
  }

  const resolvedProfile =
    asset.filmProfile ??
    (asset.filmProfileId ? getBuiltInFilmProfile(asset.filmProfileId) ?? undefined : undefined) ??
    undefined;
  const resolvedProfileId = resolvedProfile?.id ?? asset.filmProfileId ?? null;

  return {
    profileId: resolvedProfileId,
    profile: resolvedProfile,
  };
};

export interface LegacyImageRenderDocumentOptions {
  id: string;
  asset: Asset;
  adjustments?: EditingAdjustments;
  filmProfileId?: string | null | undefined;
  filmProfile?: FilmProfile | null | undefined;
}

export const legacyEditingAdjustmentsToImageRenderDocument = ({
  id,
  asset,
  adjustments,
  filmProfileId,
  filmProfile,
}: LegacyImageRenderDocumentOptions): ImageRenderDocument => {
  const normalized = normalizeAdjustments(adjustments ?? asset.adjustments ?? DEFAULT_ADJUSTMENTS);
  return createImageRenderDocument({
    id,
    source: resolveLegacySource(asset),
    geometry: resolveLegacyGeometry(normalized),
    develop: {
      adjustments: stripLegacyEffectFields(normalized),
    },
    masks: resolveLegacyMasks(normalized),
    effects: resolveLegacyEffects(normalized),
    film: resolveLegacyFilmState({ asset, filmProfileId, filmProfile }),
    output: resolveLegacyOutput(normalized),
  });
};
