import { useMemo } from "react";
import { useAssetStore } from "@/stores/assetStore";
import { useCanvasStore } from "@/stores/canvasStore";

export function useCanvasLayers() {
  const documents = useCanvasStore((state) => state.documents);
  const activeDocumentId = useCanvasStore((state) => state.activeDocumentId);
  const reorderElements = useCanvasStore((state) => state.reorderElements);
  const toggleElementVisibility = useCanvasStore((state) => state.toggleElementVisibility);
  const toggleElementLock = useCanvasStore((state) => state.toggleElementLock);
  const deleteElements = useCanvasStore((state) => state.deleteElements);
  const assets = useAssetStore((state) => state.assets);

  const active = useMemo(
    () => documents.find((document) => document.id === activeDocumentId) ?? null,
    [documents, activeDocumentId]
  );

  const layers = useMemo(
    () => (active?.elements ?? []).slice().sort((a, b) => b.zIndex - a.zIndex),
    [active?.elements]
  );

  const assetById = useMemo(() => new Map(assets.map((asset) => [asset.id, asset])), [assets]);

  return {
    activeDocumentId,
    layers,
    assetById,
    reorderElements,
    toggleElementVisibility,
    toggleElementLock,
    deleteElements,
  };
}
