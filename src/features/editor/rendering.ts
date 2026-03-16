import type { EditorLayerRenderEntry } from "./renderPreparation";
import type { LayerPreviewEntry } from "./preview/contracts";

type LayerCompositeEntry = Pick<EditorLayerRenderEntry, "blendMode" | "layer" | "opacity">;
type PreviewCompositeEntry = Pick<LayerPreviewEntry, "blendMode" | "layer" | "opacity">;

export const requiresLayerComposite = (
  entry: LayerCompositeEntry | PreviewCompositeEntry
) =>
  Boolean(entry.layer.mask) ||
  entry.opacity < 0.9999 ||
  entry.blendMode !== "normal";

export const resolveSingleRenderableLayerEntry = <
  T extends LayerCompositeEntry | PreviewCompositeEntry,
>(
  entries: T[]
) => (entries.length === 1 ? entries[0]! : null);
