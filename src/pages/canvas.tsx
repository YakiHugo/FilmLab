import type Konva from "konva";
import { useEffect, useRef, useState } from "react";
import { useParams } from "@tanstack/react-router";
import { useCanvasStore } from "@/stores/canvasStore";
import { CanvasAssetPicker } from "@/features/canvas/CanvasAssetPicker";
import { CanvasLayerPanel } from "@/features/canvas/CanvasLayerPanel";
import { CanvasPropertiesPanel } from "@/features/canvas/CanvasPropertiesPanel";
import { CanvasStoryPanel } from "@/features/canvas/CanvasStoryPanel";
import { CanvasToolbar } from "@/features/canvas/CanvasToolbar";
import { CanvasViewport } from "@/features/canvas/CanvasViewport";

export function CanvasPage() {
  const stageRef = useRef<Konva.Stage>(null);
  const [selectedSliceId, setSelectedSliceId] = useState<string | null>(null);
  const params = useParams({ from: "/canvas/$documentId", shouldThrow: false });
  const documentId = params?.documentId;
  const documents = useCanvasStore((state) => state.documents);
  const activeDocumentId = useCanvasStore((state) => state.activeDocumentId);
  const isLoading = useCanvasStore((state) => state.isLoading);
  const init = useCanvasStore((state) => state.init);
  const createDocument = useCanvasStore((state) => state.createDocument);
  const setActiveDocumentId = useCanvasStore((state) => state.setActiveDocumentId);

  useEffect(() => {
    void init();
  }, [init]);

  useEffect(() => {
    if (isLoading) {
      return;
    }
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
    const activeDocument = documents.find((document) => document.id === activeDocumentId);
    const nextSlices = activeDocument?.slices ?? [];
    if (!selectedSliceId) {
      if (nextSlices[0]) {
        setSelectedSliceId(nextSlices[0].id);
      }
      return;
    }
    if (!nextSlices.some((slice) => slice.id === selectedSliceId)) {
      setSelectedSliceId(nextSlices[0]?.id ?? null);
    }
  }, [activeDocumentId, documents, selectedSliceId]);

  return (
    <div className="flex h-[calc(100dvh-44px)] min-h-0 flex-col bg-[radial-gradient(circle_at_top_left,rgba(248,190,74,0.08),transparent_30%),linear-gradient(180deg,#14110e_0%,#0b0908_100%)]">
      <div className="border-b border-white/6 px-4 py-4 lg:px-6">
        <div className="mx-auto flex max-w-[1680px] items-end justify-between gap-6">
          <div className="space-y-2">
            <p className="text-[11px] uppercase tracking-[0.34em] text-stone-500">Social Creation Studio</p>
            <h1 className="font-['Syne'] text-3xl leading-none text-stone-100">Compose once, export as a set.</h1>
            <p className="max-w-2xl text-sm leading-6 text-stone-400">
              Build cover posts, carousel stories, and moodboard-like layouts without dropping into a
              heavy editing workflow. Keep it loose, calm, and share-ready.
            </p>
          </div>
        </div>
      </div>

      <div className="mx-auto grid min-h-0 w-full max-w-[1680px] flex-1 gap-4 overflow-hidden px-4 py-4 lg:grid-cols-[320px_minmax(0,1fr)_320px] lg:px-6">
        <div className="hidden min-h-0 space-y-4 overflow-y-auto pr-1 lg:block">
          <CanvasAssetPicker />
          <CanvasLayerPanel />
        </div>

        <section className="flex min-h-0 flex-col gap-4">
          <CanvasToolbar stageRef={stageRef} />
          <CanvasViewport stageRef={stageRef} selectedSliceId={selectedSliceId} />
        </section>

        <div className="hidden min-h-0 space-y-4 overflow-y-auto pl-1 lg:block">
          <CanvasStoryPanel selectedSliceId={selectedSliceId} onSelectSlice={setSelectedSliceId} />
          <CanvasPropertiesPanel />
        </div>
      </div>
    </div>
  );
}
