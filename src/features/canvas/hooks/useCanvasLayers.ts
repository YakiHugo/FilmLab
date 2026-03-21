import { useMemo } from "react";
import { useAssetStore } from "@/stores/assetStore";
import { selectActiveWorkbench, useCanvasStore } from "@/stores/canvasStore";

export function useCanvasLayers() {
  const activeWorkbench = useCanvasStore(selectActiveWorkbench);
  const activeWorkbenchId = useCanvasStore((state) => state.activeWorkbenchId);
  const reorderElements = useCanvasStore((state) => state.reorderElements);
  const reparentNodes = useCanvasStore((state) => state.reparentNodes);
  const toggleElementVisibility = useCanvasStore((state) => state.toggleElementVisibility);
  const toggleElementLock = useCanvasStore((state) => state.toggleElementLock);
  const deleteElements = useCanvasStore((state) => state.deleteElements);
  const assets = useAssetStore((state) => state.assets);

  const layers = useMemo(() => {
    if (!activeWorkbench) {
      return [];
    }

    const ordered: typeof activeWorkbench.allNodes = [];
    const visit = (nodeId: string) => {
      const node = activeWorkbench.allNodes.find((candidate) => candidate.id === nodeId);
      if (!node) {
        return;
      }
      ordered.push(node);
      if (node.type === "group") {
        node.childIds
          .slice()
          .reverse()
          .forEach((childId) => {
            visit(childId);
          });
      }
    };

    activeWorkbench.rootIds
      .slice()
      .reverse()
      .forEach((nodeId) => {
        visit(nodeId);
      });

    return ordered;
  }, [activeWorkbench]);

  const assetById = useMemo(() => new Map(assets.map((asset) => [asset.id, asset])), [assets]);

  return {
    activeWorkbench,
    activeWorkbenchId,
    layers,
    assetById,
    reparentNodes,
    reorderElements,
    toggleElementVisibility,
    toggleElementLock,
    deleteElements,
  };
}
