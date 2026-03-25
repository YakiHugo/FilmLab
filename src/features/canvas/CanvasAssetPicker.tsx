import { Images } from "lucide-react";
import { UploadButton } from "@/components/UploadButton";
import { cn } from "@/lib/utils";
import {
  canvasDockEmptyStateClassName,
  canvasDockIconBadgeClassName,
  canvasDockListItemClassName,
  canvasDockPanelContentClassName,
} from "./editDockTheme";
import { useCanvasEngine } from "./hooks/useCanvasEngine";

export function CanvasAssetPicker() {
  const { assets, addAssetToCanvas, canAddAssetsToCanvas, importAssetsToCanvas } =
    useCanvasEngine();
  const emptyStateMessage = canAddAssetsToCanvas
    ? "Use the upload button to import images. New uploads land on the active canvas immediately."
    : "Wait for the active workbench to recover, then upload images here.";

  return (
    <div className={cn(canvasDockPanelContentClassName, "gap-4")}>
      <div className="flex items-center justify-between gap-3">
        <h3 className="min-w-0 text-[13px] font-medium tracking-[-0.02em] text-[color:var(--canvas-edit-text)]">
          点击添加图片到画布
        </h3>
        <UploadButton
          label="Upload images to canvas"
          labelClassName="sr-only"
          variant="ghost"
          size="sm"
          disabled={!canAddAssetsToCanvas}
          className="h-9 w-9 shrink-0 rounded-[8px] border border-[color:var(--canvas-edit-border)] bg-[color:var(--canvas-edit-surface)] px-0 text-[color:var(--canvas-edit-text-muted)] transition hover:bg-[#202022] hover:text-[color:var(--canvas-edit-text)]"
          onFiles={(files) => {
            void importAssetsToCanvas(files);
          }}
        />
      </div>

      {!canAddAssetsToCanvas ? (
        <div className={cn(canvasDockEmptyStateClassName, "px-4 py-4 text-sm")}>
          <p className="font-medium text-[color:var(--canvas-edit-text)]">
            Workbench is still recovering.
          </p>
          <p className="mt-2 leading-6 text-[color:var(--canvas-edit-text-muted)]">
            Uploading and image placement are temporarily disabled until the active workbench is
            available.
          </p>
        </div>
      ) : null}

      {assets.length > 0 ? (
        <div className="min-h-0 flex-1 overflow-y-auto pr-1">
          <div className="grid grid-cols-3 gap-2">
            {assets.map((asset) => (
              <button
                key={asset.id}
                type="button"
                disabled={!canAddAssetsToCanvas}
                className={cn(
                  canvasDockListItemClassName,
                  "group relative aspect-square overflow-hidden rounded-[6px] bg-[color:var(--canvas-edit-surface-strong)] text-left transition duration-200 focus-visible:outline-none focus-visible:border-[color:var(--canvas-edit-divider)] disabled:cursor-not-allowed disabled:opacity-45",
                  canAddAssetsToCanvas &&
                    "hover:border-[color:var(--canvas-edit-divider)] hover:bg-[#1c1c1e]"
                )}
                onClick={() => {
                  void addAssetToCanvas(asset.id);
                }}
                title={
                  canAddAssetsToCanvas
                    ? asset.name
                    : `${asset.name} (waiting for an active workbench)`
                }
                aria-label={canAddAssetsToCanvas ? asset.name : `${asset.name}, unavailable`}
              >
                <img
                  src={asset.thumbnailUrl || asset.objectUrl}
                  alt={asset.name}
                  className="h-full w-full object-cover transition duration-300 ease-out group-hover:scale-[1.04]"
                />
                <div className="pointer-events-none absolute inset-x-0 bottom-0 flex min-h-0 items-end bg-gradient-to-t from-black/80 via-black/16 to-transparent px-2.5 py-2 opacity-0 transition duration-200 group-hover:opacity-100">
                  <span className="block truncate text-[10px] font-medium text-white/92">
                    {asset.name}
                  </span>
                </div>
              </button>
            ))}
          </div>
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
            No images yet.
          </p>
          <p className="mt-2 text-sm leading-6 text-[color:var(--canvas-edit-text-muted)]">
            {emptyStateMessage}
          </p>
        </div>
      )}
    </div>
  );
}
