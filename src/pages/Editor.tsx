import { useSearch } from "@tanstack/react-router";
import { useShallow } from "zustand/react/shallow";
import { Card, CardContent } from "@/components/ui/card";
import { useProjectStore } from "@/stores/projectStore";
import { EditorAdjustmentPanel } from "./editor/EditorAdjustmentPanel";
import { EditorAssetFilmstrip } from "./editor/EditorAssetFilmstrip";
import { EditorPresetCard } from "./editor/EditorPresetCard";
import { EditorPreviewCard } from "./editor/EditorPreviewCard";
import { EditorSidebarHeader } from "./editor/EditorSidebarHeader";
import { useEditorState } from "./editor/useEditorState";

export function Editor() {
  const { assets, updateAsset } = useProjectStore(
    useShallow((state) => ({
      assets: state.assets,
      updateAsset: state.updateAsset,
    }))
  );
  const { assetId } = useSearch({ from: "/editor" });

  const editor = useEditorState({
    assets,
    assetId,
    updateAsset,
  });

  return (
    <div className="app-bg h-screen overflow-hidden bg-slate-950 text-slate-100">
      <div className="flex h-full flex-col">
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
                <EditorPreviewCard
                  selectedAsset={editor.selectedAsset}
                  adjustments={editor.previewAdjustments}
                  presetLabel={editor.presetLabel}
                  showOriginal={editor.showOriginal}
                  onToggleOriginal={editor.toggleOriginal}
                  onResetAll={editor.handleResetAll}
                  onCopy={editor.handleCopy}
                  onPaste={editor.handlePaste}
                  canPaste={Boolean(editor.copiedAdjustments)}
                />
              </div>
              <EditorAssetFilmstrip
                assets={assets}
                selectedAssetId={editor.selectedAssetId}
                onSelectAsset={editor.setSelectedAssetId}
              />
            </section>

            <aside className="flex min-h-0 w-full flex-col border-t border-white/10 bg-slate-950/90 lg:w-[360px] lg:border-l lg:border-t-0">
              <EditorSidebarHeader
                selectedAsset={editor.selectedAsset}
                presetLabel={editor.presetLabel}
              />

              <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
                <EditorPresetCard
                  selectedAsset={editor.selectedAsset}
                  customPresets={editor.customPresets}
                  customPresetName={editor.customPresetName}
                  canSaveCustomPreset={Boolean(editor.previewAdjustments)}
                  onPresetNameChange={editor.setCustomPresetName}
                  onSelectPreset={editor.handleSelectPreset}
                  onSetIntensity={editor.handleSetIntensity}
                  onSaveCustomPreset={editor.handleSaveCustomPreset}
                  onExportPresets={editor.handleExportPresets}
                  onImportPresets={editor.handleImportPresets}
                />

                <EditorAdjustmentPanel
                  adjustments={editor.adjustments}
                  activeHslColor={editor.activeHslColor}
                  curveChannel={editor.curveChannel}
                  openSections={editor.openSections}
                  onSelectHslColor={editor.setActiveHslColor}
                  onSetCurveChannel={editor.setCurveChannel}
                  onToggleSection={editor.toggleSection}
                  onUpdateAdjustments={editor.updateAdjustments}
                  onUpdateAdjustmentValue={editor.updateAdjustmentValue}
                  onUpdateHslValue={editor.updateHslValue}
                  onToggleFlip={editor.toggleFlip}
                />
              </div>
            </aside>
          </div>
        )}
      </div>
    </div>
  );
}
