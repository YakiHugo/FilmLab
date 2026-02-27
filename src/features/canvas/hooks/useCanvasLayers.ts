import { useMemo } from "react";
import { useCanvasStore } from "@/stores/canvasStore";

export function useCanvasLayers() {
  const documents = useCanvasStore((state) => state.documents);
  const activeDocumentId = useCanvasStore((state) => state.activeDocumentId);

  const layers = useMemo(() => {
    const active = documents.find((document) => document.id === activeDocumentId);
    return (active?.elements ?? []).slice().sort((a, b) => b.zIndex - a.zIndex);
  }, [documents, activeDocumentId]);

  return { layers };
}
