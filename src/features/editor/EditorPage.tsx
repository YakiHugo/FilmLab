import { useEffect } from "react";
import { useSearch } from "@tanstack/react-router";
import { Card, CardContent } from "@/components/ui/card";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { EditorInspectorPanel } from "@/features/editor/layout/EditorInspectorPanel";
import { EditorLayerPanel } from "@/features/editor/layout/EditorLayerPanel";
import { EditorTopBar } from "@/features/editor/layout/EditorTopBar";
import { EditorPreviewCard } from "@/features/editor/EditorPreviewCard";
import { useAssetStore } from "@/stores/assetStore";
import { useEditorStore } from "@/stores/editorStore";

export function EditorPage() {
  const assets = useAssetStore((state) => state.assets);
  const selectedAssetId = useEditorStore((state) => state.selectedAssetId);
  const setSelectedAssetId = useEditorStore((state) => state.setSelectedAssetId);
  const { assetId } = useSearch({ from: "/editor" });

  useEffect(() => {
    // Priority 1: Use URL parameter if valid
    if (assetId && assets.some((asset) => asset.id === assetId)) {
      if (selectedAssetId !== assetId) {
        setSelectedAssetId(assetId);
      }
      return;
    }

    // Priority 2: Keep current selection if still valid
    if (selectedAssetId && assets.some((asset) => asset.id === selectedAssetId)) {
      return;
    }

    // Priority 3: Fallback to first asset or null
    if (assets.length === 0) {
      if (selectedAssetId !== null) {
        setSelectedAssetId(null);
      }
      return;
    }

    const fallbackId = assets[0]?.id ?? null;
    if (fallbackId !== selectedAssetId) {
      setSelectedAssetId(fallbackId);
    }
  }, [assetId, assets, selectedAssetId, setSelectedAssetId]);

  return (
    <div className="editor-shell flex h-[calc(100dvh-64px)] min-h-0 flex-1 flex-col overflow-hidden border border-white/10 bg-[#121316] text-slate-100">
      <EditorTopBar />

      {assets.length === 0 ? (
        <div className="flex min-h-0 flex-1 items-center justify-center p-6">
          <Card className="w-full max-w-lg animate-fade-up border-white/10 bg-black/35">
            <CardContent className="p-6 text-center text-sm text-slate-300">
              Import assets in Library before entering Editor.
            </CardContent>
          </Card>
        </div>
      ) : (
        <ErrorBoundary>
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden lg:grid lg:h-full lg:grid-cols-[280px_minmax(0,1fr)_360px] lg:grid-rows-[minmax(0,1fr)]">
            <EditorLayerPanel className="order-2 lg:order-1" />

            <section className="order-1 min-h-[300px] overflow-hidden lg:order-2 lg:h-full lg:min-h-0">
              <EditorPreviewCard />
            </section>

            <EditorInspectorPanel className="order-3 max-h-[48vh] lg:order-3 lg:max-h-none" />
          </div>
        </ErrorBoundary>
      )}
    </div>
  );
}
