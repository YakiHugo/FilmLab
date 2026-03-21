import { Link } from "@tanstack/react-router";
import { ArrowUpRight, Images } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  canvasDockActionChipClassName,
  canvasDockBadgeClassName,
  canvasDockBodyTextClassName,
  canvasDockEmptyStateClassName,
  canvasDockHeadingClassName,
  canvasDockIconBadgeClassName,
  canvasDockInteractiveListItemClassName,
  canvasDockListItemClassName,
  canvasDockOverlineClassName,
  canvasDockPanelContentClassName,
  canvasDockSectionClassName,
} from "./editDockTheme";
import { useCanvasEngine } from "./hooks/useCanvasEngine";

export function CanvasAssetPicker() {
  const { assets, addAssetToCanvas } = useCanvasEngine();

  return (
    <div className={canvasDockPanelContentClassName}>
      <section className={canvasDockSectionClassName}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className={canvasDockOverlineClassName}>Library Feed</p>
            <h3 className={canvasDockHeadingClassName}>Source material ready for placement.</h3>
            <p className={cn(canvasDockBodyTextClassName, "mt-2")}>
              Imported shots and saved AI outputs stay here. Click any tile to place it on the
              active canvas as a new image layer.
            </p>
          </div>
          <div className={canvasDockIconBadgeClassName}>
            <Images className="h-4 w-4 text-[color:var(--canvas-edit-text-soft)]" />
          </div>
        </div>

        <div className="mt-4 flex items-center justify-between gap-3">
          <span className={canvasDockBadgeClassName}>
            {assets.length} item{assets.length === 1 ? "" : "s"}
          </span>
          <Button size="sm" variant="secondary" className={canvasDockActionChipClassName} asChild>
            <Link to="/library">
              Open Library
              <ArrowUpRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
        </div>
      </section>

      {assets.length > 0 ? (
        <div className="grid min-h-0 flex-1 grid-cols-2 gap-3 overflow-y-auto pr-1">
          {assets.map((asset) => (
            <button
              key={asset.id}
              type="button"
              className={cn(
                canvasDockListItemClassName,
                canvasDockInteractiveListItemClassName,
                "group overflow-hidden text-left"
              )}
              onClick={() => {
                void addAssetToCanvas(asset.id);
              }}
              title={asset.name}
            >
              <div className="relative aspect-[4/5] overflow-hidden bg-black/40">
                <img
                  src={asset.thumbnailUrl || asset.objectUrl}
                  alt={asset.name}
                  className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]"
                />
                <div className="pointer-events-none absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-black/80 via-black/12 to-transparent" />
                <span className="absolute left-3 top-3 rounded-full border border-white/10 bg-black/55 px-2 py-1 text-[10px] uppercase tracking-[0.18em] text-[color:var(--canvas-edit-text)]">
                  Add
                </span>
              </div>
              <div className="space-y-1 px-3 py-3">
                <p className="truncate text-sm font-medium text-[color:var(--canvas-edit-text)]">
                  {asset.name}
                </p>
                <p className="truncate text-xs text-[color:var(--canvas-edit-text-muted)]">
                  Insert as a new image layer.
                </p>
              </div>
            </button>
          ))}
        </div>
      ) : (
        <div
          className={cn(
            canvasDockEmptyStateClassName,
            "flex flex-1 flex-col items-start justify-center px-4 py-5"
          )}
        >
          <div className={canvasDockIconBadgeClassName}>
            <Images className="h-4 w-4 text-[color:var(--canvas-edit-text-soft)]" />
          </div>
          <p className="mt-4 text-sm font-medium text-[color:var(--canvas-edit-text)]">
            Library is empty.
          </p>
          <p className="mt-2 text-sm leading-6 text-[color:var(--canvas-edit-text-muted)]">
            Import a few reference images first, then pull them into the active composition from
            here.
          </p>
        </div>
      )}
    </div>
  );
}
