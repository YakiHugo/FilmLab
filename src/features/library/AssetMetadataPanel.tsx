import { useState } from "react";
import { Trash2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useAssetStore } from "@/stores/assetStore";
import type { Asset } from "@/types";
import { useBatchOperations } from "./hooks/useBatchOperations";
import { CollapsibleSection } from "./CollapsibleSection";

interface AssetMetadataPanelProps {
  asset: Asset | null;
  selectedCount: number;
  className?: string;
}

const sourceLabel = (source: Asset["source"]) =>
  source === "ai-generated" ? "AI Generated" : "Imported";
const toKb = (size: number) => `${Math.max(1, Math.round(size / 1024))} KB`;
const syncStatusLabel = (
  status: Asset["remote"] extends infer T ? (T extends { status: infer S } ? S : never) : never
) => {
  switch (status) {
    case "synced":
      return "Synced";
    case "uploading":
      return "Uploading";
    case "upload_queued":
      return "Queued";
    case "upload_failed":
      return "Sync Failed";
    case "delete_queued":
      return "Delete Queued";
    case "deleting":
      return "Deleting";
    case "delete_failed":
      return "Delete Failed";
    case "deleted":
      return "Deleted";
    case "local_only":
    default:
      return "Local Only";
  }
};

export function AssetMetadataPanel({ asset, selectedCount, className }: AssetMetadataPanelProps) {
  const retryAssetSyncForAsset = useAssetStore((state) => state.retryAssetSyncForAsset);
  const { selectedAssetIds, removeSelection } = useBatchOperations();

  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

  const hasSelection = selectedAssetIds.length > 0;
  const isSingleSelection = selectedCount === 1 && Boolean(asset);
  const controlClass =
    "rounded-sm border border-white/10 bg-black/45 text-zinc-200 hover:border-white/20 hover:bg-white/[0.08] focus-visible:border-yellow-500/60 focus-visible:ring-0";

  return (
    <aside className={cn("min-h-0 overflow-y-auto bg-[#121214] p-3", className)}>
      <h2 className="text-xs uppercase tracking-[0.2em] text-zinc-500">Metadata & Actions</h2>

      {!hasSelection && (
        <p className="mt-3 text-xs text-zinc-500">
          Select assets to inspect metadata and run operations.
        </p>
      )}

      {selectedCount > 1 && (
        <div className="mt-3 border border-white/10 bg-black/30 p-3 text-xs text-zinc-300">
          <p className="text-sm text-zinc-100">{selectedCount} selected</p>
          <p className="mt-1 text-zinc-500">Batch operations are available below.</p>
        </div>
      )}

      {isSingleSelection && asset && (
        <div className="mt-3 space-y-3 text-xs text-zinc-300">
          <div className="border border-white/10 bg-black/35 p-2">
            <img
              src={asset.thumbnailUrl || asset.objectUrl}
              alt={asset.name}
              className="max-h-[240px] w-full object-contain"
            />
          </div>

          <div className="space-y-1 border border-white/10 bg-black/30 p-3">
            <p className="truncate text-sm text-zinc-100">{asset.name}</p>
            <p>Type: {asset.type}</p>
            <p>Size: {toKb(asset.size)}</p>
            <p>
              Dimensions: {asset.metadata?.width ?? "-"} x {asset.metadata?.height ?? "-"}
            </p>
            <p>Created: {new Date(asset.createdAt).toLocaleString()}</p>
            <p>
              Source:{" "}
              <span className="inline-block border border-white/10 bg-black/35 px-2 py-0.5 text-[11px]">
                {sourceLabel(asset.source)}
              </span>
            </p>
            <p>
              Sync:{" "}
              <span className="inline-block border border-white/10 bg-black/35 px-2 py-0.5 text-[11px]">
                {syncStatusLabel(asset.remote?.status ?? "local_only")}
              </span>
            </p>
          </div>

          <CollapsibleSection title="EXIF" defaultOpen={false}>
            <div className="space-y-1 border border-white/10 bg-black/30 p-3">
              <p>
                Camera:{" "}
                {`${asset.metadata?.cameraMake ?? "-"} ${asset.metadata?.cameraModel ?? ""}`.trim()}
              </p>
              <p>Lens: {asset.metadata?.lensModel ?? "-"}</p>
              <p>Aperture: {asset.metadata?.aperture ? `f/${asset.metadata.aperture}` : "-"}</p>
              <p>Shutter: {asset.metadata?.shutterSpeed ?? "-"}</p>
              <p>ISO: {asset.metadata?.iso ?? "-"}</p>
              <p>Focal: {asset.metadata?.focalLength ? `${asset.metadata.focalLength}mm` : "-"}</p>
            </div>
          </CollapsibleSection>

          {asset.remote?.status === "upload_failed" ? (
            <Button
              size="sm"
              variant="secondary"
              className={cn("w-full", controlClass)}
              onClick={() => {
                void retryAssetSyncForAsset(asset.id);
              }}
            >
              Retry Sync
            </Button>
          ) : null}
        </div>
      )}

      <div className="mt-3 border border-white/10 bg-black/25 p-3">
        <CollapsibleSection title="Batch Actions" count={selectedAssetIds.length}>
          <div className="space-y-2">
            <Button
              type="button"
              size="sm"
              variant="secondary"
              className="h-8 w-full rounded-sm border border-rose-400/35 bg-rose-400/10 text-rose-200 hover:bg-rose-400/20 focus-visible:border-rose-300/50 focus-visible:ring-0"
              onClick={() => setDeleteConfirmOpen(true)}
              disabled={!hasSelection}
            >
              <Trash2 className="mr-1 h-3.5 w-3.5" />
              Delete Selected
            </Button>
          </div>
        </CollapsibleSection>
      </div>

      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent className="rounded-sm border-white/10 bg-[#121316] p-5 shadow-none">
          <AlertDialogTitle className="text-zinc-100">Delete selected assets?</AlertDialogTitle>
          <AlertDialogDescription className="text-zinc-400">
            This will permanently remove {selectedAssetIds.length} selected asset(s) from the
            library.
          </AlertDialogDescription>
          <div className="mt-5 flex justify-end gap-3">
            <AlertDialogCancel className={cn("h-9 rounded-sm text-zinc-200", controlClass)}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              className="h-9 rounded-sm border border-yellow-500/70 bg-yellow-500/10 px-3 text-zinc-100 hover:bg-yellow-500/20 focus-visible:border-yellow-400 focus-visible:ring-0"
              onClick={() => {
                void removeSelection();
                setDeleteConfirmOpen(false);
              }}
            >
              Delete
            </AlertDialogAction>
          </div>
        </AlertDialogContent>
      </AlertDialog>
    </aside>
  );
}
