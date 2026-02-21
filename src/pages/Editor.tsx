import { useEffect } from "react";
import { useSearch } from "@tanstack/react-router";
import { Card, CardContent } from "@/components/ui/card";
import { resolveEditorReturnStep } from "@/features/workspace/navigation";
import { useEditorStore } from "@/stores/editorStore";
import { useProjectStore } from "@/stores/projectStore";
import { EditorPreviewCard } from "./editor/EditorPreviewCard";
import { EditorInspectorPanel } from "./editor/layout/EditorInspectorPanel";
import { EditorToolRail } from "./editor/layout/EditorToolRail";
import { EditorTopBar } from "./editor/layout/EditorTopBar";

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
    <div className="editor-shell flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-slate-950 text-slate-100">
      <EditorTopBar returnStep={resolvedReturnStep} />

      {assets.length === 0 ? (
        <div className="flex min-h-0 flex-1 items-center justify-center p-6">
          <Card className="w-full max-w-lg animate-fade-up">
            <CardContent className="p-6 text-center text-sm text-slate-300">
              还没有素材，请先在工作台导入照片。
            </CardContent>
          </Card>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden lg:grid lg:h-full lg:grid-cols-[minmax(0,1fr)_400px_56px] lg:grid-rows-[minmax(0,1fr)]">
          <section className="order-1 h-[54vh] min-h-[320px] overflow-hidden p-3 lg:order-1 lg:h-full lg:min-h-0 lg:p-6">
            <EditorPreviewCard />
          </section>

          <EditorToolRail className="order-2 lg:order-3" />

          <EditorInspectorPanel className="order-3 max-h-[58vh] lg:order-2 lg:max-h-none" />
        </div>
      )}
    </div>
  );
}
