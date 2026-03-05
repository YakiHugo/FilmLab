import { useEffect } from "react";
import { useSearch } from "@tanstack/react-router";
import { Card, CardContent } from "@/components/ui/card";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { EditorFooterBar } from "@/features/editor/layout/EditorFooterBar";
import { EditorInspectorPanel } from "@/features/editor/layout/EditorInspectorPanel";
import { EditorLayerPopover } from "@/features/editor/layout/EditorLayerPopover";
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
      ) : (
        <ErrorBoundary>
          <div className="flex min-w-0 flex-1 flex-col overflow-hidden md:flex-row">
            {/* Layer Panel - fixed on the left */}
            <EditorLayerPopover />

            <div className="flex min-w-0 flex-1 flex-col">
              {/* Top bar */}
              <div className="h-8 shrink-0 bg-[#121214]" />

              <section className="min-h-0 flex-1 overflow-hidden">
                <EditorPreviewCard />
              </section>
              <EditorFooterBar />
            </div>

            <EditorInspectorPanel className="max-h-[44vh] md:max-h-none" />
          </div>
        </ErrorBoundary>
      )}
    </div>
  );
}
