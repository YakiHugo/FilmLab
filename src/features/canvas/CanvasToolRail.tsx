import {
  ArrowRight,
  Circle,
  Images,
  Layers3,
  Slash,
  SlidersHorizontal,
  Square,
  Type,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useCanvasStore } from "@/stores/canvasStore";
import {
  canvasEditDockBoundsClassName,
  canvasEditDockRailLeftClassName,
  canvasEditDockStyle,
} from "./editDockTheme";

const toolButtons = [
  { tool: "text" as const, icon: Type, label: "Text" },
  { tool: "shape" as const, icon: Square, label: "Shape" },
] as const;

const shapeButtons = [
  { shapeType: "rect" as const, icon: Square, label: "Rectangle" },
  { shapeType: "ellipse" as const, icon: Circle, label: "Ellipse" },
  { shapeType: "line" as const, icon: Slash, label: "Line" },
  { shapeType: "arrow" as const, icon: ArrowRight, label: "Arrow" },
] as const;

const panelButtons = [
  { panel: "library" as const, icon: Images, label: "Library" },
  { panel: "layers" as const, icon: Layers3, label: "Layers" },
  { panel: "edit" as const, icon: SlidersHorizontal, label: "Edit" },
] as const;

export function CanvasToolRail() {
  const tool = useCanvasStore((s) => s.tool);
  const setTool = useCanvasStore((s) => s.setTool);
  const activeShapeType = useCanvasStore((s) => s.activeShapeType);
  const setActiveShapeType = useCanvasStore((s) => s.setActiveShapeType);
  const activePanel = useCanvasStore((s) => s.activePanel);
  const togglePanel = useCanvasStore((s) => s.togglePanel);

  const buttonClassName = (active: boolean) =>
    cn(
      "flex h-10 w-10 items-center justify-center rounded-[10px] transition",
      active
        ? "bg-[color:var(--canvas-edit-surface)] text-[color:var(--canvas-edit-text)]"
        : "text-[color:var(--canvas-edit-text-muted)] hover:bg-[color:var(--canvas-edit-surface)] hover:text-[color:var(--canvas-edit-text)]"
    );

  return (
    <div
      style={canvasEditDockStyle}
      className={cn(
        "absolute z-20 flex flex-col items-center justify-between",
        canvasEditDockBoundsClassName,
        canvasEditDockRailLeftClassName,
        "w-[var(--canvas-edit-rail-width)] rounded-l-[6px] border border-[color:var(--canvas-edit-border)] border-r-0 bg-[color:var(--canvas-edit-bg)] py-4"
      )}
    >
      <div className="flex flex-col items-center gap-1.5">
        {toolButtons.map((btn) => {
          const Icon = btn.icon;
          const active = tool === btn.tool;
          return (
            <div key={btn.tool} className="relative">
              <button
                type="button"
                onClick={() => setTool(btn.tool)}
                className={buttonClassName(active)}
                aria-label={btn.label}
                title={btn.label}
              >
                <Icon className="h-[18px] w-[18px]" />
              </button>
            </div>
          );
        })}

        {tool === "shape" ? (
          <div className="mt-1 flex flex-col items-center gap-1.5">
            {shapeButtons.map((btn) => {
              const Icon = btn.icon;
              const active = activeShapeType === btn.shapeType;
              return (
                <button
                  key={btn.shapeType}
                  type="button"
                  onClick={() => {
                    setActiveShapeType(btn.shapeType);
                    setTool("shape");
                  }}
                  className={cn(
                    "flex h-9 w-9 items-center justify-center rounded-[10px] transition",
                    active
                      ? "bg-[color:var(--canvas-edit-surface)] text-[color:var(--canvas-edit-text)]"
                      : "text-[color:var(--canvas-edit-text-soft)] hover:bg-[color:var(--canvas-edit-surface)] hover:text-[color:var(--canvas-edit-text)]"
                  )}
                  aria-label={btn.label}
                  title={btn.label}
                >
                  <Icon className="h-4 w-4" />
                </button>
              );
            })}
          </div>
        ) : null}

        <div
          className={cn(
            "mx-2 h-px w-6",
            "my-2 bg-[color:var(--canvas-edit-divider)]"
          )}
        />

        {panelButtons.map((btn) => {
          const Icon = btn.icon;
          const active = activePanel === btn.panel;
          return (
            <button
              key={btn.panel}
              type="button"
              onClick={() => togglePanel(btn.panel)}
              className={buttonClassName(active)}
              aria-label={btn.label}
              title={btn.label}
            >
              <Icon className="h-[18px] w-[18px]" />
            </button>
          );
        })}
      </div>
    </div>
  );
}
