import type {
  CanvasWorkbench,
  CanvasWorkbenchListEntry,
  CanvasWorkbenchSnapshot,
} from "@/types";

const isImageAssetReferenced = (
  workbench: Pick<CanvasWorkbenchSnapshot, "nodes">,
  assetId: string
) =>
  Object.values(workbench.nodes).some(
    (node) => node.type === "image" && node.assetId === assetId
  );

const resolveFallbackCoverAssetId = (
  workbench: Pick<CanvasWorkbenchSnapshot, "nodes">
) => {
  for (const node of Object.values(workbench.nodes)) {
    if (node.type === "image") {
      return node.assetId;
    }
  }

  return null;
};

export const resolveCanvasWorkbenchCoverAssetId = (
  workbench: Pick<CanvasWorkbenchSnapshot, "nodes" | "preferredCoverAssetId">
) => {
  if (
    workbench.preferredCoverAssetId &&
    isImageAssetReferenced(workbench, workbench.preferredCoverAssetId)
  ) {
    return workbench.preferredCoverAssetId;
  }

  return resolveFallbackCoverAssetId(workbench);
};

export const materializeCanvasWorkbenchListEntry = (
  workbench: Pick<
    CanvasWorkbench,
    | "createdAt"
    | "elements"
    | "height"
    | "id"
    | "name"
    | "nodes"
    | "preferredCoverAssetId"
    | "presetId"
    | "updatedAt"
    | "width"
  >
): CanvasWorkbenchListEntry => ({
  id: workbench.id,
  name: workbench.name,
  createdAt: workbench.createdAt,
  updatedAt: workbench.updatedAt,
  presetId: workbench.presetId,
  width: workbench.width,
  height: workbench.height,
  elementCount: workbench.elements.length,
  coverAssetId: resolveCanvasWorkbenchCoverAssetId(workbench),
});
