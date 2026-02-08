import { Link } from "@tanstack/react-router";
import { Film } from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import { useProjectStore } from "@/stores/projectStore";
import { Badge } from "@/components/ui/badge";
import { UploadButton } from "@/components/UploadButton";

export function AppHeader() {
  const { project, assets, selectedAssetIds } = useProjectStore(
    useShallow((state) => ({
      project: state.project,
      assets: state.assets,
      selectedAssetIds: state.selectedAssetIds,
    }))
  );

  return (
    <header className="sticky top-0 z-30 border-b border-white/5 bg-slate-950/70 backdrop-blur">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-3 px-4 pb-3 pt-4 md:flex-row md:items-center md:justify-between md:px-8">
        <div className="flex items-center gap-3">
          <Link
            to="/"
            search={{ step: "library" }}
            className="flex h-10 w-10 items-center justify-center rounded-2xl border border-sky-300/30 bg-sky-300/10 text-sky-200 shadow-glow"
          >
            <Film className="h-5 w-5" />
          </Link>
          <div className="space-y-1">
            <p className="text-[11px] uppercase tracking-[0.3em] text-slate-500">
              FilmLab Workspace
            </p>
            <h1 className="font-display text-lg text-white">
              {project?.name ?? "Untitled Project"}
            </h1>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Badge size="control" className="min-w-[88px] border-white/10 bg-white/5 text-slate-200">
            Assets {assets.length}
          </Badge>
          <Badge size="control" className="min-w-[96px] border-white/10 bg-white/5 text-slate-200">
            Selected {selectedAssetIds.length}
          </Badge>
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

