import { memo, useRef } from "react";
import { useEditorStore } from "@/stores/editorStore";
import { useProjectStore } from "@/stores/projectStore";
import { cn } from "@/lib/utils";

export const EditorAssetFilmstrip = memo(function EditorAssetFilmstrip() {
  const assets = useProjectStore((state) => state.assets);
  const selectedAssetId = useEditorStore((state) => state.selectedAssetId);
  const setSelectedAssetId = useEditorStore((state) => state.setSelectedAssetId);
  const itemRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  const focusAssetByIndex = (index: number) => {
    const next = assets[index];
    if (!next) {
      return;
    }
    setSelectedAssetId(next.id);
    itemRefs.current[next.id]?.focus();
  };

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
              aria-pressed={isActive}
              aria-current={isActive ? "true" : undefined}
              ref={(node) => {
                itemRefs.current[asset.id] = node;
              }}
              className={cn(
                "flex min-w-[160px] items-center gap-3 rounded-2xl border border-white/10 bg-slate-950/60 p-3 text-left transition",
                isActive && "border-sky-200/40 bg-sky-300/10"
              )}
              onClick={() => setSelectedAssetId(asset.id)}
              onKeyDown={(event) => {
                const currentIndex = assets.findIndex((item) => item.id === asset.id);
                if (currentIndex < 0) {
                  return;
                }
                if (event.key === "ArrowRight") {
                  event.preventDefault();
                  focusAssetByIndex(Math.min(assets.length - 1, currentIndex + 1));
                  return;
                }
                if (event.key === "ArrowLeft") {
                  event.preventDefault();
                  focusAssetByIndex(Math.max(0, currentIndex - 1));
                  return;
                }
                if (event.key === "Home") {
                  event.preventDefault();
                  focusAssetByIndex(0);
                  return;
                }
                if (event.key === "End") {
                  event.preventDefault();
                  focusAssetByIndex(assets.length - 1);
                }
              }}
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
