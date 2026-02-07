import { memo } from "react";
import { cn } from "@/lib/utils";
import type { Asset } from "@/types";

interface EditorAssetFilmstripProps {
  assets: Asset[];
  selectedAssetId: string | null;
  onSelectAsset: (assetId: string) => void;
}

export const EditorAssetFilmstrip = memo(function EditorAssetFilmstrip({
  assets,
  selectedAssetId,
  onSelectAsset,
}: EditorAssetFilmstripProps) {
  return (
    <div className="shrink-0 border-t border-white/10 bg-slate-950/80 px-6 py-4">
      <div className="flex items-center justify-between text-xs text-slate-400">
        <span>素材胶片</span>
        <span>共 {assets.length} 张</span>
      </div>
      <div className="mt-3 flex gap-3 overflow-x-auto pb-2">
        {assets.map((asset) => {
          const isActive = asset.id === selectedAssetId;
          return (
            <button
              key={asset.id}
              type="button"
              className={cn(
                "flex min-w-[160px] items-center gap-3 rounded-2xl border border-white/10 bg-slate-950/60 p-3 text-left transition",
                isActive && "border-sky-200/40 bg-sky-300/10"
              )}
              onClick={() => onSelectAsset(asset.id)}
            >
              <img
                src={asset.thumbnailUrl ?? asset.objectUrl}
                alt={asset.name}
                className="h-12 w-12 rounded-xl object-cover"
              />
              <div className="text-xs text-slate-300">
                <p className="line-clamp-1 font-medium text-slate-100">{asset.name}</p>
                <p>分组：{asset.group ?? "未分组"}</p>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
});
