import { useMemo } from "react";
import type { CanvasImageElement } from "@/types";
import { useAssetStore } from "@/stores/assetStore";
import { useCanvasStore } from "@/stores/canvasStore";

const createElementId = () => {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `el-${Date.now()}`;
};

export function useCanvasEngine() {
  const documents = useCanvasStore((state) => state.documents);
  const activeDocumentId = useCanvasStore((state) => state.activeDocumentId);
  const upsertElement = useCanvasStore((state) => state.upsertElement);
  const assets = useAssetStore((state) => state.assets);

  const activeDocument = useMemo(
    () => documents.find((document) => document.id === activeDocumentId) ?? null,
    [documents, activeDocumentId]
  );

  const addAssetToCanvas = async (assetId: string) => {
    if (!activeDocument) {
      return;
    }
    const index = activeDocument.elements.length + 1;
    const element: CanvasImageElement = {
      id: createElementId(),
      type: "image",
      assetId,
      x: 120 + index * 18,
      y: 100 + index * 18,
      width: 320,
      height: 320,
      rotation: 0,
      opacity: 1,
      locked: false,
      visible: true,
      zIndex: index,
    };
    await upsertElement(activeDocument.id, element);
  };

  return {
    assets,
    activeDocument,
    addAssetToCanvas,
  };
}
