import { useMemo } from "react";
import { useAssetStore } from "@/stores/assetStore";
import { useCanvasStore } from "@/stores/canvasStore";

export function useCanvasLayers() {
  const documents = useCanvasStore((state) => state.documents);
  const activeDocumentId = useCanvasStore((state) => state.activeDocumentId);
  const executeCommand = useCanvasStore((state) => state.executeCommand);
  const reorderElements = useCanvasStore((state) => state.reorderElements);
  const toggleElementVisibility = useCanvasStore((state) => state.toggleElementVisibility);
  const toggleElementLock = useCanvasStore((state) => state.toggleElementLock);
  const deleteElements = useCanvasStore((state) => state.deleteElements);
  const assets = useAssetStore((state) => state.assets);
  const reparentNodes = async (
    documentId: string,
    ids: string[],
    parentId: string | null,
    index?: number
  ) => {
    await executeCommand(documentId, {
      type: "REPARENT_NODES",
      ids,
      index,
      parentId,
    });
  };

  const active = useMemo(
    () => documents.find((document) => document.id === activeDocumentId) ?? null,
    [documents, activeDocumentId]
  );

  const layers = useMemo(() => {
    if (!active) {
      return [];
    }

    const ordered: typeof active.allNodes = [];
    const visit = (nodeId: string) => {
      const node = active.allNodes.find((candidate) => candidate.id === nodeId);
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

    active.rootIds
      .slice()
      .reverse()
      .forEach((nodeId) => {
        visit(nodeId);
      });

    return ordered;
  }, [active]);

  const assetById = useMemo(() => new Map(assets.map((asset) => [asset.id, asset])), [assets]);

  return {
    activeDocument: active,
    activeDocumentId,
    layers,
    assetById,
    reparentNodes,
    reorderElements,
    toggleElementVisibility,
    toggleElementLock,
    deleteElements,
  };
}
