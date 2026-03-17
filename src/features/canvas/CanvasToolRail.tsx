import { useState } from "react";
import { Frame, Images, Layers3, Shapes, SlidersHorizontal, Type } from "lucide-react";
import { cn } from "@/lib/utils";
import { useCanvasStore } from "@/stores/canvasStore";
import type { CanvasShapeType } from "@/stores/canvasStore";

const toolButtons = [
  { tool: "text" as const, icon: Type, label: "Text" },
  { tool: "shape" as const, icon: Shapes, label: "Shape" },
] as const;

const shapeOptions: { value: CanvasShapeType; label: string }[] = [
  { value: "rect", label: "Rectangle" },
  { value: "circle", label: "Circle" },
  { value: "line", label: "Line" },
];

const panelButtons = [
  { panel: "library" as const, icon: Images, label: "Library" },
  { panel: "layers" as const, icon: Layers3, label: "Layers" },
  { panel: "story" as const, icon: Frame, label: "Story" },
  { panel: "edit" as const, icon: SlidersHorizontal, label: "Edit" },
] as const;

export function CanvasToolRail() {
  const tool = useCanvasStore((s) => s.tool);
  const setTool = useCanvasStore((s) => s.setTool);
  const shapeType = useCanvasStore((s) => s.shapeType);
  const setShapeType = useCanvasStore((s) => s.setShapeType);
  const activePanel = useCanvasStore((s) => s.activePanel);
  const togglePanel = useCanvasStore((s) => s.togglePanel);
  const [shapePopover, setShapePopover] = useState(false);

  return (
    <div className="absolute bottom-4 left-3 top-[64px] z-20 flex w-11 flex-col items-center justify-between rounded-2xl border border-white/10 bg-black/60 py-2 shadow-lg backdrop-blur-xl">
      <div className="flex flex-col items-center gap-0.5">
        {toolButtons.map((btn) => {
          const Icon = btn.icon;
          const active = tool === btn.tool;
          return (
            <div key={btn.tool} className="relative">
              <button
                type="button"
                onClick={() => {
                  setTool(btn.tool);
                  if (btn.tool === "shape") {
                    setShapePopover((v) => !v);
                  } else {
                    setShapePopover(false);
                  }
                }}
                className={cn(
                  "flex h-9 w-9 items-center justify-center rounded-xl transition",
                  active
                    ? "bg-white text-zinc-950"
                    : "text-zinc-400 hover:bg-white/10 hover:text-zinc-200"
                )}
                aria-label={btn.label}
                title={btn.label}
              >
                <Icon className="h-4 w-4" />
              </button>
              {btn.tool === "shape" && active && shapePopover && (
                <div className="absolute left-12 top-0 z-30 flex flex-col gap-0.5 rounded-xl border border-white/10 bg-black/80 p-1 shadow-lg backdrop-blur-xl">
                  {shapeOptions.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => {
                        setShapeType(opt.value);
                        setShapePopover(false);
                      }}
                      className={cn(
                        "whitespace-nowrap rounded-lg px-3 py-1.5 text-left text-xs transition",
                        shapeType === opt.value
                          ? "bg-white/15 text-zinc-100"
                          : "text-zinc-400 hover:bg-white/10 hover:text-zinc-200"
                      )}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}

        <div className="mx-2 my-1 h-px w-6 bg-white/10" />

        {panelButtons.slice(0, 2).map((btn) => {
          const Icon = btn.icon;
          const active = activePanel === btn.panel;
          return (
            <button
              key={btn.panel}
              type="button"
              onClick={() => togglePanel(btn.panel)}
              className={cn(
                "flex h-9 w-9 items-center justify-center rounded-xl transition",
                active
                  ? "bg-white text-zinc-950"
                  : "text-zinc-400 hover:bg-white/10 hover:text-zinc-200"
              )}
              aria-label={btn.label}
              title={btn.label}
            >
              <Icon className="h-4 w-4" />
            </button>
          );
        })}
      </div>

      <div className="flex flex-col items-center gap-0.5">
        {panelButtons.slice(2).map((btn) => {
          const Icon = btn.icon;
          const active = activePanel === btn.panel;
          return (
            <button
              key={btn.panel}
              type="button"
              onClick={() => togglePanel(btn.panel)}
              className={cn(
                "flex h-9 w-9 items-center justify-center rounded-xl transition",
                active
                  ? "bg-white text-zinc-950"
                  : "text-zinc-400 hover:bg-white/10 hover:text-zinc-200"
              )}
              aria-label={btn.label}
              title={btn.label}
            >
              <Icon className="h-4 w-4" />
            </button>
          );
        })}
      </div>
    </div>
  );
}
