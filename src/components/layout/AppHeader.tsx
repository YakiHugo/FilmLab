import { useMemo } from "react";
import { Link } from "@tanstack/react-router";
import { Film } from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import { useProjectStore } from "@/stores/projectStore";
import { Badge } from "@/components/ui/badge";
import { UploadButton } from "@/components/UploadButton";

export function AppHeader() {
  const { project, assets, selectedAssetIds, isLoading } = useProjectStore(
    useShallow((state) => ({
      project: state.project,
      assets: state.assets,
      selectedAssetIds: state.selectedAssetIds,
      isLoading: state.isLoading,
    }))
  );

  const totalSize = useMemo(() => {
    return assets.reduce((sum, asset) => sum + asset.size, 0);
  }, [assets]);

  const totalSizeMb = useMemo(
    () => `${(totalSize / 1024 / 1024).toFixed(1)} MB`,
    [totalSize]
  );

  return (
    <header className="sticky top-0 z-30 border-b border-white/5 bg-slate-950/70 backdrop-blur">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-3 px-4 pb-3 pt-4 md:flex-row md:items-center md:justify-between md:px-8">
        <div className="flex items-center gap-3">
          <Link
            to="/"
            className="flex h-10 w-10 items-center justify-center rounded-2xl border border-amber-300/30 bg-amber-300/10 text-amber-200 shadow-glow"
          >
            <Film className="h-5 w-5" />
          </Link>
          <div className="space-y-1">
            <p className="text-[11px] uppercase tracking-[0.3em] text-slate-400">
              FilmLab Workspace
            </p>
            <h1 className="font-display text-lg text-white">
              {project?.name ?? "未命名项目"}
            </h1>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Badge className="border-white/10 bg-white/5 text-slate-200">
            素材 {assets.length}
          </Badge>
          <Badge className="border-white/10 bg-white/5 text-slate-200">
            已选 {selectedAssetIds.length}
          </Badge>
          <Badge className="border-white/10 bg-white/5 text-slate-200">
            占用 {totalSizeMb}
          </Badge>
          {isLoading ? (
            <Badge className="border-amber-300/30 bg-amber-300/10 text-amber-200">
              同步中
            </Badge>
          ) : (
            <Badge className="border-emerald-300/30 bg-emerald-300/10 text-emerald-200">
              已同步
            </Badge>
          )}
          <UploadButton
            size="sm"
            variant="secondary"
            compact
            className="hidden sm:inline-flex"
          />
        </div>
      </div>
    </header>
  );
}
