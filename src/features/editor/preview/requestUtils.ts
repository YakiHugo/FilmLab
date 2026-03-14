export const buildPreviewRenderSlotPrefix = (documentKey: string) => `preview:${documentKey}`;

export const buildPreviewRenderSlot = (documentKey: string, suffix = "main") =>
  `${buildPreviewRenderSlotPrefix(documentKey)}:${suffix}`;
