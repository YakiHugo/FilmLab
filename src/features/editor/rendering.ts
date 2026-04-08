import type { EditorLayerRenderEntry } from "./renderPreparation";

type LayerCompositeEntry = Pick<EditorLayerRenderEntry, "blendMode" | "layer" | "opacity">;

export const requiresLayerComposite = (
  entry: LayerCompositeEntry
) =>
  Boolean(entry.layer.mask) ||
  entry.opacity < 0.9999 ||
  entry.blendMode !== "normal";

export const resolveSingleRenderableLayerEntry = <
  T extends LayerCompositeEntry,
>(
  entries: T[]
) => (entries.length === 1 ? entries[0]! : null);
