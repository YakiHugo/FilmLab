import type Konva from "konva";
import { useEffect, useRef } from "react";
import { useParams } from "@tanstack/react-router";
import { useCanvasStore } from "@/stores/canvasStore";
import { CanvasAssetPicker } from "./CanvasAssetPicker";
import { CanvasLayerPanel } from "./CanvasLayerPanel";
import { CanvasPropertiesPanel } from "./CanvasPropertiesPanel";
import { CanvasToolbar } from "./CanvasToolbar";
import { CanvasViewport } from "./CanvasViewport";

export function CanvasPage() {
  const stageRef = useRef<Konva.Stage>(null);
  const params = useParams({ from: "/canvas/$documentId", shouldThrow: false });
  const documentId = params?.documentId;
  const documents = useCanvasStore((state) => state.documents);
  const activeDocumentId = useCanvasStore((state) => state.activeDocumentId);
  const createDocument = useCanvasStore((state) => state.createDocument);
  const setActiveDocumentId = useCanvasStore((state) => state.setActiveDocumentId);

  useEffect(() => {
    if (!documentId) {
      if (documents.length === 0 && !activeDocumentId) {
        void createDocument();
      }
      return;
    }
    if (documentId !== activeDocumentId) {
      setActiveDocumentId(documentId);
    }
  }, [documentId, activeDocumentId, documents.length, createDocument, setActiveDocumentId]);

  return (
    <div className="grid h-[calc(100dvh-96px)] gap-3 lg:grid-cols-[220px_minmax(0,1fr)_280px]">
      <div className="hidden space-y-3 lg:block">
        <CanvasLayerPanel />
        <CanvasAssetPicker />
      </div>

      <section className="flex min-h-0 flex-col gap-3">
        <CanvasToolbar stageRef={stageRef} />
        <CanvasViewport stageRef={stageRef} />
      </section>

      <div className="hidden lg:block">
        <CanvasPropertiesPanel />
      </div>
    </div>
  );
}
