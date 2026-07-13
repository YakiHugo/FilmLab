import { X } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { useCanvasStore, type CanvasFloatingPanel as PanelType } from "@/stores/canvasStore";
import { CanvasAsciiEditPanel } from "./CanvasAsciiEditPanel";
import { CanvasCaptionEditPanel } from "./CanvasCaptionEditPanel";
import { CanvasHalftoneEditPanel } from "./CanvasHalftoneEditPanel";
import { CanvasOutputPanel } from "./CanvasOutputPanel";
import { CanvasSignalDamageEditPanel } from "./CanvasSignalDamageEditPanel";
import { CanvasStyleLabPanel } from "./CanvasStyleLabPanel";
import { CanvasTimestampEditPanel } from "./CanvasTimestampEditPanel";
import { CanvasWatermarkEditPanel } from "./CanvasWatermarkEditPanel";
import { CanvasAssetPicker } from "./CanvasAssetPicker";
import { CanvasEditPanel } from "./CanvasEditPanel";
import { CanvasLayerPanel } from "./CanvasLayerPanel";
import {
  canvasEditDockBoundsClassName,
  canvasEditDockPanelStyle,
  canvasEditDockStyle,
} from "./editDockTheme";

const PANEL_TITLES: Record<NonNullable<PanelType>, string> = {
  edit: "编辑",
  styles: "Style Lab",
  ascii: "ASCII",
  halftone: "Halftone",
  "signal-damage": "Signal Damage",
  output: "Output",
  caption: "Caption",
  timestamp: "Timestamp",
  watermark: "Watermark",
  layers: "Layers",
  library: "Library",
};

export function CanvasFloatingPanel({ onExport }: { onExport: () => void }) {
  const activePanel = useCanvasStore((s) => s.activePanel);
  const setActivePanel = useCanvasStore((s) => s.setActivePanel);
  const isEditDock =
    activePanel === "edit" ||
    activePanel === "styles" ||
    activePanel === "ascii" ||
    activePanel === "halftone" ||
    activePanel === "signal-damage" ||
    activePanel === "output" ||
    activePanel === "caption" ||
    activePanel === "timestamp" ||
    activePanel === "watermark";

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
              aria-label="关闭面板"
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
            <PanelContent panel={activePanel} onExport={onExport} />
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

function PanelContent({
  panel,
  onExport,
}: {
  panel: NonNullable<PanelType>;
  onExport: () => void;
}) {
  switch (panel) {
    case "edit":
      return <CanvasEditPanel />;
    case "styles":
      return <CanvasStyleLabPanel />;
    case "ascii":
      return <CanvasAsciiEditPanel />;
    case "halftone":
      return <CanvasHalftoneEditPanel />;
    case "signal-damage":
      return <CanvasSignalDamageEditPanel />;
    case "output":
      return <CanvasOutputPanel onExport={onExport} />;
    case "caption":
      return <CanvasCaptionEditPanel />;
    case "timestamp":
      return <CanvasTimestampEditPanel />;
    case "watermark":
      return <CanvasWatermarkEditPanel />;
    case "layers":
      return <CanvasLayerPanel />;
    case "library":
      return <CanvasAssetPicker />;
    default:
      return null;
  }
}
