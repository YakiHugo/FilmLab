import type {
  AspectRatio,
  Asset,
  AsciiAdjustments,
  BwMixAdjustments,
  CalibrationAdjustments,
  ColorGradingAdjustments,
  FilmProfileOverrides,
  HslAdjustments,
  LocalAdjustmentDelta,
  LocalAdjustmentMask,
  PointCurveAdjustments,
} from "@/types";
import type { FilmProfileAny } from "@/types/film";

export const IMAGE_RENDER_INTENTS = ["preview", "export"] as const;
export type ImageRenderIntent = (typeof IMAGE_RENDER_INTENTS)[number];

export const IMAGE_RENDER_QUALITIES = ["interactive", "full"] as const;
export type ImageRenderQuality = (typeof IMAGE_RENDER_QUALITIES)[number];

export const IMAGE_EFFECT_PLACEMENTS = ["develop", "style", "finalize"] as const;
export type ImageEffectPlacement = (typeof IMAGE_EFFECT_PLACEMENTS)[number];
export type ImageAnalysisSource = Exclude<ImageEffectPlacement, "finalize">;

export interface ImageRenderTargetSize {
  width: number;
  height: number;
}

export interface ImageRenderDebugOptions {
  trace?: boolean;
  outputHash?: boolean;
  pipelineOverrides?: {
    incrementalPipeline?: boolean;
    gpuGeometryPass?: boolean;
    enableHslPass?: boolean;
    enableCurvePass?: boolean;
    enableDetailPass?: boolean;
    enableFilmPass?: boolean;
    enableOpticsPass?: boolean;
    keepLastPreviewFrameOnError?: boolean;
  };
}

export interface ImageRenderSource {
  assetId: string;
  objectUrl: string;
  contentHash?: string | null;
  name: string;
  mimeType: Asset["type"];
  width?: number;
  height?: number;
}

export interface ImageRenderGeometry {
  rotate: number;
  rightAngleRotation: number;
  perspectiveEnabled: boolean;
  perspectiveHorizontal: number;
  perspectiveVertical: number;
  vertical: number;
  horizontal: number;
  scale: number;
  flipHorizontal: boolean;
  flipVertical: boolean;
  aspectRatio: AspectRatio;
  customAspectRatio: number;
  opticsProfile: boolean;
  opticsCA: boolean;
  opticsDistortionK1: number;
  opticsDistortionK2: number;
  opticsCaAmount: number;
  opticsVignette: number;
  opticsVignetteMidpoint: number;
}

export interface ImageRenderToneState {
  exposure: number;
  contrast: number;
  highlights: number;
  shadows: number;
  whites: number;
  blacks: number;
}

export interface ImageRenderColorState {
  temperature: number;
  tint: number;
  hue: number;
  temperatureKelvin?: number;
  tintMG?: number;
  vibrance: number;
  saturation: number;
  pointCurve: PointCurveAdjustments;
  hsl: HslAdjustments;
  bwEnabled: boolean;
  bwMix: BwMixAdjustments;
  calibration: CalibrationAdjustments;
  colorGrading: ColorGradingAdjustments;
}

export interface ImageRenderDetailState {
  texture: number;
  clarity: number;
  dehaze: number;
  sharpening: number;
  sharpenRadius: number;
  sharpenDetail: number;
  masking: number;
  noiseReduction: number;
  colorNoiseReduction: number;
}

export interface ImageRenderFxState {
  vignette: number;
  grain: number;
  grainSize: number;
  grainRoughness: number;
  glowIntensity: number;
  glowMidtoneFocus: number;
  glowBias: number;
  glowRadius: number;
  customLut?: {
    enabled: boolean;
    path: string;
    size: 8 | 16;
    intensity: number;
  };
  pushPullEv?: number;
}

export interface ImageRenderDevelopRegion {
  id: string;
  enabled: boolean;
  amount: number;
  maskId: string;
  adjustments: LocalAdjustmentDelta;
}

export interface ImageRenderDevelopState {
  tone: ImageRenderToneState;
  color: ImageRenderColorState;
  detail: ImageRenderDetailState;
  fx: ImageRenderFxState;
  regions: ImageRenderDevelopRegion[];
}

export interface ImageRenderMaskDefinition {
  id: string;
  kind: "local-adjustment";
  sourceLocalAdjustmentId: string;
  mask: LocalAdjustmentMask;
}

export interface ImageRenderMaskState {
  byId: Record<string, ImageRenderMaskDefinition>;
}

export interface ImageRenderFilmState {
  profileId: string | null;
  profile: FilmProfileAny | null | undefined;
  profileOverrides?: FilmProfileOverrides | null;
}

export interface ImageRenderOutputState {
  timestamp: {
    enabled: boolean;
    position: "bottom-right" | "bottom-left" | "top-right" | "top-left";
    size: number;
    opacity: number;
  };
}

export interface ImageFilter2dEffectParams {
  brightness: number;
  hue: number;
  blur: number;
  dilate: number;
}

export interface ImageFilter2dEffectNode {
  id: string;
  type: "filter2d";
  enabled: boolean;
  placement: ImageEffectPlacement;
  maskId?: string;
  params: ImageFilter2dEffectParams;
}

export type ImageAsciiRenderMode = "glyph" | "dot";
export type ImageAsciiBackgroundMode = "none" | "solid" | "cell-solid" | "blurred-source";
export type ImageAsciiColorMode = AsciiAdjustments["colorMode"] | "duotone";

export interface ImageAsciiEffectParams {
  renderMode: ImageAsciiRenderMode;
  preset: AsciiAdjustments["charsetPreset"] | "custom";
  cellSize: number;
  characterSpacing: number;
  density: number;
  coverage: number;
  edgeEmphasis: number;
  brightness: number;
  contrast: number;
  dither: AsciiAdjustments["dither"];
  colorMode: ImageAsciiColorMode;
  foregroundOpacity: number;
  foregroundBlendMode: GlobalCompositeOperation;
  backgroundMode: ImageAsciiBackgroundMode;
  backgroundBlur: number;
  backgroundOpacity: number;
  backgroundColor: string | null;
  invert: boolean;
  gridOverlay: boolean;
}

export interface FeatureGridCell {
  x: number;
  y: number;
  width: number;
  height: number;
  alpha: number;
  tone: number;
  edge: number;
  sampleColor: {
    red: number;
    green: number;
    blue: number;
  };
}

export interface FeatureGrid {
  width: number;
  height: number;
  cellWidth: number;
  cellHeight: number;
  columns: number;
  rows: number;
  sourceCanvas: HTMLCanvasElement;
  cells: FeatureGridCell[];
}

export interface GridSurfaceCell {
  x: number;
  y: number;
  width: number;
  height: number;
  backgroundFill: string | null;
  foregroundFill: string | null;
  glyph: string | null;
  dotRadius: number | null;
}

export interface GridSurface {
  width: number;
  height: number;
  cellWidth: number;
  cellHeight: number;
  backgroundFill: string | null;
  backgroundCanvas: HTMLCanvasElement | null;
  foregroundBlendMode: GlobalCompositeOperation;
  gridOverlay: boolean;
  gridOverlayAlpha: number;
  cells: GridSurfaceCell[];
}

export interface ImageAsciiCarrierTransformNode {
  id: string;
  type: "ascii";
  enabled: boolean;
  analysisSource: ImageAnalysisSource;
  maskId?: string;
  params: ImageAsciiEffectParams;
}

export type CarrierTransformNode = ImageAsciiCarrierTransformNode;

export type ImageEffectNode = ImageFilter2dEffectNode;

export interface CanvasImageRenderStateV1 {
  geometry: ImageRenderGeometry;
  develop: ImageRenderDevelopState;
  masks: ImageRenderMaskState;
  carrierTransforms: CarrierTransformNode[];
  effects: ImageEffectNode[];
  film: ImageRenderFilmState;
  output: ImageRenderOutputState;
}

export interface ImageProcessState {
  geometry: ImageRenderGeometry;
  develop: ImageRenderDevelopState;
  masks: ImageRenderMaskState;
  film: ImageRenderFilmState;
}

export interface ImageRenderDocument extends CanvasImageRenderStateV1 {
  id: string;
  source: ImageRenderSource;
  revisionKey: string;
}

export interface ImageRenderRequest {
  intent: ImageRenderIntent;
  quality: ImageRenderQuality;
  targetSize: ImageRenderTargetSize;
  timestampText?: string | null;
  strictErrors?: boolean;
  signal?: AbortSignal;
  renderSlotId?: string;
  debug?: ImageRenderDebugOptions;
}

const hashString = (value: string) => {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16);
};

const cloneImageRenderValue = <T>(value: T): T => {
  if (typeof structuredClone === "function") {
    return structuredClone(value) as T;
  }
  return JSON.parse(JSON.stringify(value)) as T;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const isAsciiAnalysisSource = (value: unknown): value is ImageAnalysisSource =>
  value === "develop" || value === "style";

const isLegacyAsciiEffectNode = (
  value: unknown
): value is ImageAsciiCarrierTransformNode & { placement?: ImageEffectPlacement } => {
  if (!isRecord(value) || value.type !== "ascii" || !("params" in value)) {
    return false;
  }

  return isAsciiAnalysisSource(value.analysisSource);
};

const isFilter2dEffectNode = (value: unknown): value is ImageFilter2dEffectNode =>
  isRecord(value) && value.type === "filter2d" && "params" in value;

const isCarrierTransformNode = (value: unknown): value is CarrierTransformNode =>
  isRecord(value) && value.type === "ascii" && isAsciiAnalysisSource(value.analysisSource);

const mapLegacyAsciiEffectToCarrierTransform = (
  effect: ImageAsciiCarrierTransformNode & { placement?: ImageEffectPlacement }
): CarrierTransformNode => ({
  id: effect.id,
  type: "ascii",
  enabled: effect.enabled,
  analysisSource: effect.analysisSource,
  ...(effect.maskId ? { maskId: effect.maskId } : {}),
  params: cloneImageRenderValue(effect.params),
});

export const normalizeCanvasImageRenderState = (
  state: CanvasImageRenderStateV1
): CanvasImageRenderStateV1 => {
  const rawCarrierTransforms = Array.isArray(
    (state as CanvasImageRenderStateV1 & { carrierTransforms?: unknown[] }).carrierTransforms
  )
    ? ((state as CanvasImageRenderStateV1 & { carrierTransforms?: unknown[] }).carrierTransforms ??
        [])
    : [];
  const rawEffects = Array.isArray((state as CanvasImageRenderStateV1 & { effects?: unknown[] }).effects)
    ? ((state as CanvasImageRenderStateV1 & { effects?: unknown[] }).effects ?? [])
    : [];

  const explicitCarrierTransforms = rawCarrierTransforms
    .filter(isCarrierTransformNode)
    .map((transform) => cloneImageRenderValue(transform));
  const rasterEffects = rawEffects
    .filter(isFilter2dEffectNode)
    .map((effect) => cloneImageRenderValue(effect));
  const migratedCarrierTransforms =
    explicitCarrierTransforms.length > 0
      ? explicitCarrierTransforms
      : rawEffects.flatMap((effect) =>
          isLegacyAsciiEffectNode(effect) ? [mapLegacyAsciiEffectToCarrierTransform(effect)] : []
        );

  return {
    ...cloneImageRenderValue({
      geometry: state.geometry,
      develop: state.develop,
      masks: state.masks,
      film: state.film,
      output: state.output,
    }),
    carrierTransforms: migratedCarrierTransforms,
    effects: rasterEffects,
  };
};

const serializeRevisionPayload = (document: Omit<ImageRenderDocument, "revisionKey">) =>
  JSON.stringify({
    id: document.id,
    source: document.source,
    ...normalizeCanvasImageRenderState(document),
  });

export const buildImageRenderDocumentRevisionKey = (
  document: Omit<ImageRenderDocument, "revisionKey">
) => hashString(serializeRevisionPayload(document));

export const createImageRenderDocument = (
  document: Omit<ImageRenderDocument, "revisionKey">
): ImageRenderDocument => {
  const normalizedState = normalizeCanvasImageRenderState(document);
  const normalizedDocument = {
    ...document,
    ...normalizedState,
  };
  return {
    ...normalizedDocument,
    revisionKey: buildImageRenderDocumentRevisionKey(normalizedDocument),
  };
};

export const createImageRenderDocumentFromState = ({
  id,
  source,
  state,
}: {
  id: string;
  source: ImageRenderSource;
  state: CanvasImageRenderStateV1;
}) =>
  createImageRenderDocument({
    id,
    source,
    ...state,
  });

export const extractImageProcessState = (
  state: Pick<CanvasImageRenderStateV1, "geometry" | "develop" | "masks" | "film">
): ImageProcessState => ({
  geometry: state.geometry,
  develop: state.develop,
  masks: state.masks,
  film: state.film,
});

export const resolveImageRenderEffectsForPlacement = (
  effects: readonly ImageEffectNode[],
  placement: ImageEffectPlacement
) => effects.filter((effect) => effect.enabled && effect.placement === placement);

export const resolveImageCarrierTransforms = (
  carrierTransforms: readonly CarrierTransformNode[]
) => carrierTransforms.filter((transform) => transform.enabled);
