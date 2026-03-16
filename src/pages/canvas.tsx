import type Konva from "konva";
import { useEffect, useRef, useState } from "react";
import { useParams } from "@tanstack/react-router";
import { CanvasAppBar } from "@/features/canvas/CanvasAppBar";
import { CanvasExportDialog } from "@/features/canvas/CanvasExportDialog";
import { CanvasFloatingPanel } from "@/features/canvas/CanvasFloatingPanel";
import { CanvasToolRail } from "@/features/canvas/CanvasToolRail";
import { CanvasViewport } from "@/features/canvas/CanvasViewport";
import { useCanvasStore } from "@/stores/canvasStore";

export function CanvasPage() {
  const stageRef = useRef<Konva.Stage>(null);
  const [selectedSliceId, setSelectedSliceId] = useState<string | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const params = useParams({ from: "/canvas/$documentId", shouldThrow: false });
  const documentId = params?.documentId;
  const documents = useCanvasStore((state) => state.documents);
  const activeDocumentId = useCanvasStore((state) => state.activeDocumentId);
  const isLoading = useCanvasStore((state) => state.isLoading);
  const init = useCanvasStore((state) => state.init);
  const createDocument = useCanvasStore((state) => state.createDocument);
  const setActiveDocumentId = useCanvasStore((state) => state.setActiveDocumentId);
  const selectedElementIds = useCanvasStore((state) => state.selectedElementIds);
  const setActivePanel = useCanvasStore((state) => state.setActivePanel);

  useEffect(() => {
    void init();
  }, [init]);

  useEffect(() => {
    if (isLoading) return;
    if (!documentId) {
      if (documents.length === 0 && !activeDocumentId) {
        void createDocument();
      }
      return;
    }
    if (documentId !== activeDocumentId) {
      setActiveDocumentId(documentId);
    }
  }, [documentId, activeDocumentId, documents.length, createDocument, isLoading, setActiveDocumentId]);

  useEffect(() => {
    const activeDocument = documents.find((d) => d.id === activeDocumentId);
    const nextSlices = activeDocument?.slices ?? [];
    if (!selectedSliceId) {
      if (nextSlices[0]) setSelectedSliceId(nextSlices[0].id);
      return;
    }
    if (!nextSlices.some((s) => s.id === selectedSliceId)) {
      setSelectedSliceId(nextSlices[0]?.id ?? null);
    }
  }, [activeDocumentId, documents, selectedSliceId]);

  // Auto-open edit panel when an image element is selected
  useEffect(() => {
    if (selectedElementIds.length === 0) return;
    const activeDocument = documents.find((d) => d.id === activeDocumentId);
    if (!activeDocument) return;
    const hasImage = selectedElementIds.some((id) => {
      const el = activeDocument.elements.find((e) => e.id === id);
      return el?.type === "image";
    });
    if (hasImage) {
      setActivePanel("edit");
    }
  }, [selectedElementIds, documents, activeDocumentId, setActivePanel]);

  return (
    <div className="relative h-[calc(100dvh-44px)] w-full overflow-hidden bg-[#0a0a0b]">
      <CanvasViewport stageRef={stageRef} selectedSliceId={selectedSliceId} />
      <CanvasAppBar onExport={() => setExportOpen(true)} />
      <CanvasToolRail />
      <CanvasFloatingPanel
        selectedSliceId={selectedSliceId}
        onSelectSlice={setSelectedSliceId}
      />
      <CanvasExportDialog
        open={exportOpen}
        onOpenChange={setExportOpen}
        stage={stageRef.current}
      />
    </div>
  );
}
