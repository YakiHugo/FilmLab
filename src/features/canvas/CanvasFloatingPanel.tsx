import { X } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { useCanvasStore, type CanvasFloatingPanel as PanelType } from "@/stores/canvasStore";
import { CanvasAssetPicker } from "./CanvasAssetPicker";
import { CanvasLayerPanel } from "./CanvasLayerPanel";
import { CanvasPropertiesPanel } from "./CanvasPropertiesPanel";
import { CanvasStoryPanel } from "./CanvasStoryPanel";
import { CanvasProjectPanel } from "./CanvasProjectPanel";
import { ProjectEditPanel } from "./ProjectEditPanel";

interface CanvasFloatingPanelProps {
  selectedSliceId: string | null;
  onSelectSlice: (sliceId: string | null) => void;
}

export function CanvasFloatingPanel({ selectedSliceId, onSelectSlice }: CanvasFloatingPanelProps) {
  const activePanel = useCanvasStore((s) => s.activePanel);
  const setActivePanel = useCanvasStore((s) => s.setActivePanel);

  return (
    <AnimatePresence mode="wait">
      {activePanel && (
        <motion.div
          key={activePanel}
          initial={{ x: -20, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: -20, opacity: 0 }}
          transition={{ duration: 0.18, ease: "easeOut" }}
          className="absolute bottom-4 left-16 top-[64px] z-10 flex w-[320px] flex-col overflow-hidden rounded-[24px] border border-white/10 bg-[linear-gradient(180deg,rgba(18,18,20,0.96),rgba(10,10,11,0.94))] shadow-[0_30px_90px_-48px_rgba(0,0,0,0.95)] backdrop-blur-xl"
        >
          <div className="flex items-center justify-end px-3 pt-3">
            <button
              type="button"
              onClick={() => setActivePanel(null)}
              className="flex h-7 w-7 items-center justify-center rounded-lg text-zinc-500 transition hover:bg-white/10 hover:text-zinc-300"
              aria-label="Close panel"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-1 pb-3">
            <PanelContent
              panel={activePanel}
              selectedSliceId={selectedSliceId}
              onSelectSlice={onSelectSlice}
            />
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function PanelContent({
  panel,
  selectedSliceId,
  onSelectSlice,
}: {
  panel: NonNullable<PanelType>;
  selectedSliceId: string | null;
  onSelectSlice: (sliceId: string | null) => void;
}) {
  switch (panel) {
    case "edit":
      return (
        <div className="space-y-3">
          <ProjectEditPanel />
          <CanvasPropertiesPanel />
        </div>
      );
    case "layers":
      return <CanvasLayerPanel />;
    case "library":
      return <CanvasAssetPicker />;
    case "story":
      return <CanvasStoryPanel selectedSliceId={selectedSliceId} onSelectSlice={onSelectSlice} />;
    case "project":
      return <CanvasProjectPanel />;
    case "properties":
      return <CanvasPropertiesPanel />;
    default:
      return null;
  }
}
