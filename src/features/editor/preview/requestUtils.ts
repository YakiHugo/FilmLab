export const buildPreviewRenderSlotPrefix = (documentKey: string) => `preview:${documentKey}`;

export const buildPreviewRenderSlot = (documentKey: string, suffix = "main") =>
  `${buildPreviewRenderSlotPrefix(documentKey)}:${suffix}`;

export const buildPreviewMainRenderSlot = (documentKey: string) =>
  buildPreviewRenderSlot(documentKey, "main");

export const buildPreviewLayerRenderSlot = (
  documentKey: string,
  layerId: string,
  variant: "base" | "composite" | "single" = "base"
) =>
  buildPreviewRenderSlot(
    documentKey,
    variant === "base" ? `layer:${layerId}` : `layer:${layerId}:${variant}`
  );
