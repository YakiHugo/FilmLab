import { useMemo } from "react";
import { useAssetStore } from "@/stores/assetStore";
import { useCanvasCommittedLoadedWorkbenchState } from "./useCanvasCommittedLoadedWorkbenchState";
import { useCanvasLoadedWorkbenchStructure } from "./useCanvasLoadedWorkbenchStructure";

export function useCanvasLayers() {
  const { loadedWorkbench, loadedWorkbenchId } = useCanvasCommittedLoadedWorkbenchState();
  const {
    deleteNodes,
    groupNodes,
    reorderElements,
    reparentNodes,
    toggleElementLock,
    toggleElementVisibility,
    ungroupNode,
  } = useCanvasLoadedWorkbenchStructure();
  const assets = useAssetStore((state) => state.assets);

  const layers = useMemo(() => {
    if (!loadedWorkbench) {
      return [];
    }

    const ordered: typeof loadedWorkbench.allNodes = [];
    const visit = (nodeId: string) => {
      const node = loadedWorkbench.allNodes.find((candidate) => candidate.id === nodeId);
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

    loadedWorkbench.rootIds
      .slice()
      .reverse()
      .forEach((nodeId) => {
        visit(nodeId);
      });

    return ordered;
  }, [loadedWorkbench]);

  const assetById = useMemo(() => new Map(assets.map((asset) => [asset.id, asset])), [assets]);

  return {
    activeWorkbench: loadedWorkbench,
    activeWorkbenchId: loadedWorkbenchId,
    layers,
    assetById,
    reparentNodes,
    reorderElements,
    groupNodes,
    toggleElementVisibility,
    toggleElementLock,
    ungroupNode,
    deleteNodes,
  };
}
