import { useMemo } from "react";
import { useAssetStore } from "@/stores/assetStore";
import { useCanvasCommittedWorkbenchState } from "./useCanvasCommittedWorkbenchState";
import { useCanvasActiveWorkbenchStructure } from "./useCanvasActiveWorkbenchStructure";

export function useCanvasLayers() {
  const { activeWorkbench, activeWorkbenchId } = useCanvasCommittedWorkbenchState();
  const {
    deleteNodes,
    groupNodes,
    reorderElements,
    reparentNodes,
    toggleElementLock,
    toggleElementVisibility,
    ungroupNode,
  } = useCanvasActiveWorkbenchStructure();
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
    groupNodes,
    toggleElementVisibility,
    toggleElementLock,
    ungroupNode,
    deleteNodes,
  };
}
