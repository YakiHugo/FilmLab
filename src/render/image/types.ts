import type { Asset, AsciiAdjustments, EditingAdjustments, FilmProfile, LocalAdjustment } from "@/types";

export const IMAGE_RENDER_INTENTS = ["preview", "export"] as const;
export type ImageRenderIntent = (typeof IMAGE_RENDER_INTENTS)[number];

export const IMAGE_RENDER_QUALITIES = ["interactive", "full"] as const;
export type ImageRenderQuality = (typeof IMAGE_RENDER_QUALITIES)[number];

export const IMAGE_EFFECT_PLACEMENTS = ["afterDevelop", "afterFilm", "afterOutput"] as const;
export type ImageEffectPlacement = (typeof IMAGE_EFFECT_PLACEMENTS)[number];
export type ImageAnalysisSource = Exclude<ImageEffectPlacement, "afterOutput">;

export interface ImageRenderTargetSize {
  width: number;
  height: number;
}

export interface NormalizedRect {
  x: number;
  y: number;
  width: number;
  height: number;
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
  aspectRatio: EditingAdjustments["aspectRatio"];
  customAspectRatio: number;
  opticsProfile: boolean;
  opticsCA: boolean;
  opticsDistortionK1: number;
  opticsDistortionK2: number;
  opticsCaAmount: number;
  opticsVignette: number;
  opticsVignetteMidpoint: number;
}

export interface ImageRenderDevelopState {
  // Transitional bundle until the new kernel fully stops reading legacy adjustment shapes.
  adjustments: EditingAdjustments;
}

export interface ImageRenderMaskDefinition {
  id: string;
  kind: "legacy-local-adjustment";
  sourceLocalAdjustmentId: string;
  mask: LocalAdjustment["mask"];
}

export interface ImageRenderMaskState {
  byId: Record<string, ImageRenderMaskDefinition>;
  localAdjustments: LocalAdjustment[];
}

export interface ImageRenderFilmState {
  profileId: string | null;
  profile: FilmProfile | null | undefined;
}

export interface ImageRenderOutputState {
  timestamp: {
    enabled: boolean;
    position: EditingAdjustments["timestampPosition"];
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

export interface ImageAsciiEffectNode {
  id: string;
  type: "ascii";
  enabled: boolean;
  placement: ImageEffectPlacement;
  analysisSource: ImageAnalysisSource;
  maskId?: string;
  params: ImageAsciiEffectParams;
}

export type ImageEffectNode = ImageAsciiEffectNode | ImageFilter2dEffectNode;

export interface ImageRenderDocument {
  id: string;
  source: ImageRenderSource;
  geometry: ImageRenderGeometry;
  develop: ImageRenderDevelopState;
  masks: ImageRenderMaskState;
  effects: ImageEffectNode[];
  film: ImageRenderFilmState;
  output: ImageRenderOutputState;
  revisionKey: string;
}

export interface ImageRenderRequest {
  intent: ImageRenderIntent;
  quality: ImageRenderQuality;
  targetSize: ImageRenderTargetSize;
  roi?: NormalizedRect | null;
  timestampText?: string | null;
  signal?: AbortSignal;
  renderSlotId?: string;
}

const hashString = (value: string) => {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16);
};

const serializeRevisionPayload = (document: Omit<ImageRenderDocument, "revisionKey">) =>
  JSON.stringify({
    id: document.id,
    source: document.source,
    geometry: document.geometry,
    develop: document.develop,
    masks: document.masks,
    effects: document.effects,
    film: document.film,
    output: document.output,
  });

export const buildImageRenderDocumentRevisionKey = (
  document: Omit<ImageRenderDocument, "revisionKey">
) => hashString(serializeRevisionPayload(document));

export const createImageRenderDocument = (
  document: Omit<ImageRenderDocument, "revisionKey">
): ImageRenderDocument => ({
  ...document,
  revisionKey: buildImageRenderDocumentRevisionKey(document),
});

export const resolveImageRenderEffectsForPlacement = (
  effects: readonly ImageEffectNode[],
  placement: ImageEffectPlacement
) => effects.filter((effect) => effect.enabled && effect.placement === placement);
