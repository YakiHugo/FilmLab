import { Link } from "@tanstack/react-router";
import { ArrowUpRight, Images } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCanvasEngine } from "./hooks/useCanvasEngine";

export function CanvasAssetPicker() {
  const { assets, addAssetToCanvas } = useCanvasEngine();

  return (
    <div className="flex min-h-0 flex-col gap-4 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] uppercase tracking-[0.28em] text-zinc-500">Library Feed</p>
          <h3 className="mt-1 font-['Syne'] text-xl text-zinc-100">Pull source material straight in.</h3>
        </div>
        <span className="rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-1 text-[10px] tracking-[0.24em] text-zinc-400">
          {assets.length} item{assets.length === 1 ? "" : "s"}
        </span>
      </div>

      <p className="text-sm leading-6 text-zinc-400">
        Imported shots and saved AI results stay in Library. Click a tile to place it on the active
        board as a new image layer.
      </p>

      {assets.length > 0 ? (
        <div className="grid min-h-0 flex-1 grid-cols-2 gap-3 overflow-y-auto pr-1">
          {assets.map((asset) => (
            <button
              key={asset.id}
              type="button"
              className="group overflow-hidden rounded-[22px] border border-white/10 bg-black/35 text-left transition hover:border-amber-300/25 hover:bg-white/[0.04]"
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
                <div className="pointer-events-none absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-black/80 via-black/10 to-transparent" />
                <div className="absolute left-3 top-3 rounded-full border border-white/10 bg-black/45 px-2 py-1 text-[10px] uppercase tracking-[0.18em] text-zinc-200">
                  Add
                </div>
              </div>
              <div className="space-y-1 px-3 py-3">
                <p className="truncate text-sm font-medium text-zinc-100">{asset.name}</p>
                <p className="truncate text-xs text-zinc-500">
                  Click to insert as a new image layer.
                </p>
              </div>
            </button>
          ))}
        </div>
      ) : (
        <div className="flex flex-1 flex-col items-start justify-center rounded-[24px] border border-dashed border-white/10 bg-white/[0.02] px-4 py-5">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04]">
            <Images className="h-5 w-5 text-zinc-400" />
          </div>
          <p className="mt-4 text-sm font-medium text-zinc-100">Library is empty.</p>
          <p className="mt-1 text-sm leading-6 text-zinc-500">
            Import a few reference images first, then drag the composition together on canvas.
          </p>
        </div>
      )}

      <Button size="sm" variant="secondary" className="rounded-2xl" asChild>
        <Link to="/library">
          Open Library
          <ArrowUpRight className="ml-2 h-4 w-4" />
        </Link>
      </Button>
    </div>
  );
}
