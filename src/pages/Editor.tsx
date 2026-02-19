import { useEffect } from "react";
import { Link, useSearch } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { resolveEditorReturnStep } from "@/features/workspace/navigation";
import { useEditorStore } from "@/stores/editorStore";
import { useProjectStore } from "@/stores/projectStore";
import { EditorAdjustmentPanel } from "./editor/EditorAdjustmentPanel";
import { EditorAssetFilmstrip } from "./editor/EditorAssetFilmstrip";
import { EditorPresetCard } from "./editor/EditorPresetCard";
import { EditorPreviewCard } from "./editor/EditorPreviewCard";
import { EditorSidebarHeader } from "./editor/EditorSidebarHeader";

export function Editor() {
  const assets = useProjectStore((state) => state.assets);
  const selectedAssetId = useEditorStore((state) => state.selectedAssetId);
  const setSelectedAssetId = useEditorStore((state) => state.setSelectedAssetId);
  const { assetId, returnStep } = useSearch({ from: "/editor" });
  const resolvedReturnStep = resolveEditorReturnStep(returnStep);

  useEffect(() => {
    if (assetId && assets.some((asset) => asset.id === assetId)) {
      setSelectedAssetId(assetId);
    }
  }, [assetId, assets, setSelectedAssetId]);

  useEffect(() => {
    if (selectedAssetId && assets.some((asset) => asset.id === selectedAssetId)) {
      return;
    }
    if (assets.length === 0) {
      setSelectedAssetId(null);
      return;
    }
    const fallbackId = assets.some((asset) => asset.id === assetId)
      ? assetId
      : assets[0].id;
    setSelectedAssetId(fallbackId ?? null);
  }, [assetId, assets, selectedAssetId, setSelectedAssetId]);

  return (
    <div className="app-bg h-screen overflow-hidden bg-slate-950 text-slate-100">
      <div className="flex h-full flex-col">
        <div className="shrink-0 border-b border-white/10 px-6 py-3">
          <Button size="sm" variant="secondary" asChild>
            <Link to="/" search={{ step: resolvedReturnStep }}>
              返回工作台
            </Link>
          </Button>
        </div>
        {assets.length === 0 ? (
          <div className="flex flex-1 items-center justify-center p-6">
            <Card className="w-full max-w-lg animate-fade-up">
              <CardContent className="p-6 text-center text-sm text-slate-400">
                还没有素材，请先在工作台导入照片。
              </CardContent>
            </Card>
          </div>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
            <section className="flex min-w-0 flex-1 flex-col">
              <div className="flex min-h-0 flex-1 flex-col gap-4 p-6">
                <EditorPreviewCard />
              </div>
              <EditorAssetFilmstrip />
            </section>

            <aside className="flex min-h-0 w-full flex-col border-t border-white/10 bg-slate-950/90 lg:w-[360px] lg:border-l lg:border-t-0">
              <EditorSidebarHeader />

              <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
                <EditorPresetCard />
                <EditorAdjustmentPanel />
              </div>
            </aside>
          </div>
        )}
      </div>
    </div>
  );
}
