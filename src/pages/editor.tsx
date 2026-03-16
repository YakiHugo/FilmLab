import { useLayoutEffect, useMemo } from "react";
import { Link, useSearch } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { EditorFooterBar } from "@/features/editor/layout/EditorFooterBar";
import { EditorInspectorPanel } from "@/features/editor/layout/EditorInspectorPanel";
import { EditorLayerPopover } from "@/features/editor/layout/EditorLayerPopover";
import { QuickAdjustPanel } from "@/features/editor/layout/QuickAdjustPanel";
import { EditorPreviewCard } from "@/features/editor/EditorPreviewCard";
import { resolveEditorSelectedAssetId } from "@/features/editor/selection";
import { useAssetStore } from "@/stores/assetStore";
import { useEditorStore } from "@/stores/editorStore";

export function EditorPage() {
  const assets = useAssetStore((state) => state.assets);
  const selectedAssetId = useEditorStore((state) => state.selectedAssetId);
  const setSelectedAssetId = useEditorStore((state) => state.setSelectedAssetId);
  const { assetId, mode } = useSearch({ from: "/editor" });
  const isAdvancedMode = mode === "advanced";

  const resolvedSelectedAssetId = useMemo(
    () =>
      resolveEditorSelectedAssetId({
        assetId,
        assets,
        currentSelectedAssetId: selectedAssetId,
      }),
    [assetId, assets, selectedAssetId]
  );

  const selectedAsset = useMemo(
    () => assets.find((asset) => asset.id === resolvedSelectedAssetId) ?? null,
    [assets, resolvedSelectedAssetId]
  );

  useLayoutEffect(() => {
    if (selectedAssetId !== resolvedSelectedAssetId) {
      setSelectedAssetId(resolvedSelectedAssetId);
    }
  }, [resolvedSelectedAssetId, selectedAssetId, setSelectedAssetId]);

  return (
    <div className="editor-shell flex h-full min-h-0 w-full overflow-hidden bg-[#121214] text-slate-100">
      {assets.length === 0 ? (
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex min-h-0 flex-1 items-center justify-center p-6">
            <Card className="w-full max-w-lg animate-fade-up border-white/10 bg-black/35">
              <CardContent className="p-6 text-center text-sm text-slate-300">
                Import assets in Library before entering Editor.
              </CardContent>
            </Card>
          </div>
          <EditorFooterBar />
        </div>
      ) : !selectedAsset ? (
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex min-h-0 flex-1 items-center justify-center p-6">
            <Card className="w-full max-w-lg animate-fade-up border-white/10 bg-black/35">
              <CardContent className="space-y-4 p-6 text-center">
                <div className="space-y-1">
                  <p className="text-sm text-slate-100">No asset selected</p>
                  <p className="text-sm text-slate-300">
                    Open an asset from Library to start editing. The editor no longer auto-picks the
                    first item when the URL does not include an `assetId`.
                  </p>
                </div>
                <Button asChild>
                  <Link to="/library">Open Library</Link>
                </Button>
              </CardContent>
            </Card>
          </div>
          <EditorFooterBar />
        </div>
      ) : (
        <ErrorBoundary>
          <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
            <div className="border-b border-white/8 px-4 py-4 lg:px-6">
              <div className="flex items-end justify-between gap-4">
                <div className="space-y-1">
                  <p className="text-[11px] uppercase tracking-[0.28em] text-slate-500">
                    {isAdvancedMode ? "Advanced Edit" : "Quick Adjust"}
                  </p>
                  <h1 className="font-['Syne'] text-2xl text-slate-100">
                    {isAdvancedMode ? "Refine with full control." : "Adjust fast, keep the feeling."}
                  </h1>
                  <p className="max-w-xl text-sm text-slate-400">
                    {isAdvancedMode
                      ? "All professional controls remain available here when you need them."
                      : "This editing view stays intentionally compact so you can shape tone and crop without getting buried in analysis tools."}
                  </p>
                </div>

                <Button asChild variant="secondary" className="rounded-xl border border-white/10 bg-black/35">
                  <Link
                    to="/editor"
                    search={{
                      assetId: resolvedSelectedAssetId ?? undefined,
                      mode: isAdvancedMode ? undefined : "advanced",
                    }}
                  >
                    {isAdvancedMode ? "Back to Quick Adjust" : "Open Advanced Edit"}
                  </Link>
                </Button>
              </div>
            </div>

            <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden md:flex-row">
              {isAdvancedMode ? <EditorLayerPopover /> : null}

              <div className="flex min-w-0 flex-1 flex-col">
                <section className="min-h-0 flex-1 overflow-hidden">
                  <EditorPreviewCard />
                </section>
                <EditorFooterBar />
              </div>

              {isAdvancedMode ? (
                <EditorInspectorPanel className="max-h-[44vh] md:max-h-none" />
              ) : (
                <QuickAdjustPanel />
              )}
            </div>
          </div>
        </ErrorBoundary>
      )}
    </div>
  );
}
