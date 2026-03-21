import { X } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { useCanvasStore, type CanvasFloatingPanel as PanelType } from "@/stores/canvasStore";
import { CanvasAssetPicker } from "./CanvasAssetPicker";
import { CanvasImageEditPanel } from "./CanvasImageEditPanel";
import { CanvasLayerPanel } from "./CanvasLayerPanel";
import { CanvasPropertiesPanel } from "./CanvasPropertiesPanel";
import { CanvasStoryPanel } from "./CanvasStoryPanel";
import { CanvasWorkbenchPanel } from "./CanvasWorkbenchPanel";
import {
  canvasEditDockBoundsClassName,
  canvasEditDockPanelStyle,
  canvasEditDockStyle,
} from "./editDockTheme";

interface CanvasFloatingPanelProps {
  selectedSliceId: string | null;
  onSelectSlice: (sliceId: string | null) => void;
}

const PANEL_TITLES: Record<NonNullable<PanelType>, string> = {
  edit: "Edit",
  layers: "Layers",
  library: "Library",
  properties: "Inspector",
  story: "Story",
  workbench: "Workbench",
};

export function CanvasFloatingPanel({ selectedSliceId, onSelectSlice }: CanvasFloatingPanelProps) {
  const activePanel = useCanvasStore((s) => s.activePanel);
  const setActivePanel = useCanvasStore((s) => s.setActivePanel);
  const isEditDock = activePanel === "edit";

  return (
    <AnimatePresence mode="wait">
      {activePanel ? (
        <motion.div
          key={activePanel}
          initial={{ x: -20, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: -20, opacity: 0 }}
          transition={{ duration: 0.18, ease: "easeOut" }}
          style={{ ...canvasEditDockStyle, ...canvasEditDockPanelStyle }}
          className={cn(
            "absolute z-10 flex min-w-0 flex-col overflow-hidden rounded-r-[6px] border border-[color:var(--canvas-edit-border)] bg-[color:var(--canvas-edit-bg)] shadow-[var(--canvas-edit-shadow)]",
            canvasEditDockBoundsClassName
          )}
        >
          <div className="flex items-center justify-between border-b border-[color:var(--canvas-edit-divider)] px-6 py-5">
            <h2 className="text-[22px] font-medium tracking-[-0.03em] text-[color:var(--canvas-edit-text)]">
              {PANEL_TITLES[activePanel]}
            </h2>
            <button
              type="button"
              onClick={() => setActivePanel(null)}
              className="flex h-8 w-8 items-center justify-center text-[color:var(--canvas-edit-text-muted)] transition hover:text-[color:var(--canvas-edit-text)]"
              aria-label="Close panel"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
          <div
            className={cn(
              "flex min-h-0 flex-1 flex-col overflow-hidden pb-6",
              isEditDock ? "px-6 pt-1" : "px-6 pt-5"
            )}
          >
            <PanelContent
              panel={activePanel}
              selectedSliceId={selectedSliceId}
              onSelectSlice={onSelectSlice}
            />
          </div>
        </motion.div>
      ) : null}
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
        <CanvasImageEditPanel>
          <CanvasPropertiesPanel variant="embedded" />
        </CanvasImageEditPanel>
      );
    case "layers":
      return <CanvasLayerPanel />;
    case "library":
      return <CanvasAssetPicker />;
    case "story":
      return <CanvasStoryPanel selectedSliceId={selectedSliceId} onSelectSlice={onSelectSlice} />;
    case "workbench":
      return <CanvasWorkbenchPanel />;
    case "properties":
      return <CanvasPropertiesPanel variant="standalone" />;
    default:
      return null;
  }
}
