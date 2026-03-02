import { createDefaultAdjustments, normalizeAdjustments } from "@/lib/adjustments";
import type { Asset, EditingAdjustments, EditorLayer, EditorLayerBlendMode } from "@/types";

const LAYER_BLEND_MODES: EditorLayerBlendMode[] = [
  "normal",
  "multiply",
  "screen",
  "overlay",
  "softLight",
];

const hasBlendMode = (value: unknown): value is EditorLayerBlendMode =>
  typeof value === "string" && LAYER_BLEND_MODES.includes(value as EditorLayerBlendMode);

const clampOpacity = (value: unknown) => {
  const numeric = typeof value === "number" && Number.isFinite(value) ? value : 100;
  return Math.max(0, Math.min(100, Math.round(numeric)));
};

const cloneLayer = (layer: EditorLayer): EditorLayer => {
  if (typeof structuredClone === "function") {
    return structuredClone(layer);
  }
  return JSON.parse(JSON.stringify(layer)) as EditorLayer;
};

export const createEditorLayerId = (prefix = "layer") => {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Math.random().toString(16).slice(2)}`;
};

export const createBaseLayer = (asset: Pick<Asset, "id" | "adjustments">): EditorLayer => ({
  id: `base-${asset.id}`,
  name: "Background",
  type: "base",
  visible: true,
  opacity: 100,
  blendMode: "normal",
  adjustments: normalizeAdjustments(asset.adjustments ?? createDefaultAdjustments()),
});

export const normalizeEditorLayer = (
  layer: EditorLayer,
  index: number,
  fallbackAssetId: string
): EditorLayer => ({
  id: typeof layer.id === "string" && layer.id.trim().length > 0 ? layer.id : `${fallbackAssetId}-layer-${index}`,
  name:
    typeof layer.name === "string" && layer.name.trim().length > 0
      ? layer.name
      : layer.type === "base"
        ? "Background"
        : `Layer ${index + 1}`,
  type: layer.type,
  visible: layer.visible !== false,
  opacity: clampOpacity(layer.opacity),
  blendMode: hasBlendMode(layer.blendMode) ? layer.blendMode : "normal",
  adjustments: layer.adjustments ? normalizeAdjustments(layer.adjustments) : undefined,
  textureAssetId: layer.textureAssetId,
  mask: layer.mask,
});

export const ensureAssetLayers = (asset: Pick<Asset, "id" | "adjustments" | "layers">): EditorLayer[] => {
  const rawLayers = Array.isArray(asset.layers) ? asset.layers : [];

  if (rawLayers.length === 0) {
    return [createBaseLayer(asset)];
  }

  const normalized = rawLayers.map((layer, index) =>
    normalizeEditorLayer(layer, index, asset.id)
  );

  const hasBase = normalized.some((layer) => layer.type === "base");
  if (!hasBase) {
    normalized.push(createBaseLayer(asset));
  }

  return normalized;
};

export const resolveBaseLayer = (layers: EditorLayer[]): EditorLayer | null => {
  const found = layers.find((layer) => layer.type === "base");
  if (found) {
    return found;
  }
  return layers.length > 0 ? layers[layers.length - 1]! : null;
};

export const resolveLayerAdjustments = (
  layer: EditorLayer | null | undefined,
  fallback?: EditingAdjustments
): EditingAdjustments => {
  if (layer?.adjustments) {
    return normalizeAdjustments(layer.adjustments);
  }
  return normalizeAdjustments(fallback ?? createDefaultAdjustments());
};

export const resolveBaseAdjustmentsFromLayers = (
  layers: EditorLayer[],
  fallback?: EditingAdjustments
): EditingAdjustments => {
  const base = resolveBaseLayer(layers);
  return resolveLayerAdjustments(base, fallback);
};

export const cloneEditorLayers = (layers: EditorLayer[]) => layers.map((layer) => cloneLayer(layer));

export const moveLayerToIndex = (
  layers: EditorLayer[],
  layerId: string,
  toIndex: number
): EditorLayer[] => {
  const fromIndex = layers.findIndex((layer) => layer.id === layerId);
  if (fromIndex < 0 || toIndex < 0 || toIndex >= layers.length || fromIndex === toIndex) {
    return layers;
  }
  const next = cloneEditorLayers(layers);
  const [moved] = next.splice(fromIndex, 1);
  if (!moved) {
    return layers;
  }
  next.splice(toIndex, 0, moved);
  return next;
};

export const moveLayerByDirection = (
  layers: EditorLayer[],
  layerId: string,
  direction: "up" | "down"
): EditorLayer[] => {
  const index = layers.findIndex((layer) => layer.id === layerId);
  if (index < 0) {
    return layers;
  }
  const targetIndex = direction === "up" ? index - 1 : index + 1;
  return moveLayerToIndex(layers, layerId, targetIndex);
};
