import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAssetStore } from "@/stores/assetStore";
import type { Asset } from "@/types";

interface AssetDetailPanelProps {
  asset: Asset | null;
}

const splitTags = (raw: string) =>
  raw
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);

export function AssetDetailPanel({ asset }: AssetDetailPanelProps) {
  const navigate = useNavigate();
  const deleteAssets = useAssetStore((state) => state.deleteAssets);
  const setAssetTags = useAssetStore((state) => state.setAssetTags);
  const [tagInput, setTagInput] = useState("");
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

  useEffect(() => {
    setTagInput((asset?.tags ?? []).join(", "));
  }, [asset?.id, asset?.tags]);

  const exifRows = useMemo(
    () =>
      asset
        ? [
            ["Camera", `${asset.metadata?.cameraMake ?? "-"} ${asset.metadata?.cameraModel ?? ""}`.trim()],
            ["Lens", asset.metadata?.lensModel ?? "-"],
            ["Aperture", asset.metadata?.aperture ? `f/${asset.metadata.aperture}` : "-"],
            ["Shutter", asset.metadata?.shutterSpeed ?? "-"],
            ["ISO", asset.metadata?.iso ? String(asset.metadata.iso) : "-"],
            ["Focal", asset.metadata?.focalLength ? `${asset.metadata.focalLength}mm` : "-"],
          ]
        : [],
    [asset]
  );

  return (
    <aside className="rounded-2xl border border-white/10 bg-black/35 p-4">
      <h2 className="text-xs uppercase tracking-[0.2em] text-zinc-500">Asset Detail</h2>
      {!asset && <p className="mt-3 text-xs text-zinc-500">Select one asset from the grid.</p>}
      {asset && (
        <div className="mt-3 space-y-3 text-xs text-zinc-300">
          <img
            src={asset.thumbnailUrl || asset.objectUrl}
            alt={asset.name}
            className="aspect-square w-full rounded-xl border border-white/10 object-cover"
          />

          <p className="truncate text-sm font-medium text-zinc-100">{asset.name}</p>
          <p>ID: <span className="text-zinc-500">{asset.id}</span></p>
          <p>Type: {asset.type}</p>
          <p>Size: {Math.round(asset.size / 1024)} KB</p>
          <p>
            Dimensions: {asset.metadata?.width ?? "-"} x {asset.metadata?.height ?? "-"}
          </p>
          <p>Created: {new Date(asset.createdAt).toLocaleString()}</p>

          <div className="space-y-1">
            <p className="text-[11px] uppercase tracking-[0.14em] text-zinc-500">Tags</p>
            <div className="flex flex-wrap gap-1">
              {(asset.tags ?? []).map((tag) => (
                <span key={tag} className="rounded-full border border-white/10 bg-black/35 px-2 py-0.5 text-[11px]">
                  {tag}
                </span>
              ))}
              {(asset.tags ?? []).length === 0 && <span className="text-zinc-500">No tags</span>}
            </div>
            <Input
              value={tagInput}
              onChange={(event) => setTagInput(event.target.value)}
              placeholder="tag1, tag2"
              className="h-8 rounded-lg border-white/10 bg-black/35 px-2 text-xs"
            />
            <Button
              size="sm"
              variant="secondary"
              className="h-8 rounded-lg border border-white/10 bg-black/45 text-xs"
              onClick={() => setAssetTags(asset.id, splitTags(tagInput))}
            >
              Save Tags
            </Button>
          </div>

          <div className="space-y-1">
            <p className="text-[11px] uppercase tracking-[0.14em] text-zinc-500">EXIF</p>
            <div className="space-y-1 rounded-xl border border-white/10 bg-black/35 p-2">
              {exifRows.map(([label, value]) => (
                <div key={label} className="flex items-center justify-between gap-2">
                  <span className="text-zinc-500">{label}</span>
                  <span className="truncate">{value}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <Button
              size="sm"
              variant="secondary"
              className="rounded-lg border border-white/10 bg-black/45"
              onClick={() => {
                void navigate({
                  to: "/editor",
                  search: { assetId: asset.id },
                });
              }}
            >
              Open Editor
            </Button>
            <Button
              size="sm"
              variant="secondary"
              className="rounded-lg border border-rose-400/30 bg-rose-400/10 text-rose-200 hover:bg-rose-400/20"
              onClick={() => {
                setDeleteConfirmOpen(true);
              }}
            >
              Delete
            </Button>
          </div>

          <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
            <AlertDialogContent>
              <AlertDialogTitle>Delete this asset?</AlertDialogTitle>
              <AlertDialogDescription>
                This will permanently remove "{asset.name}" from the library.
              </AlertDialogDescription>
              <div className="mt-5 flex justify-end gap-3">
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => {
                    void deleteAssets([asset.id]);
                    setDeleteConfirmOpen(false);
                  }}
                >
                  Delete
                </AlertDialogAction>
              </div>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      )}
    </aside>
  );
}
