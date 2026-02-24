import { SlidersHorizontal, Upload } from "lucide-react";
import { UploadButton } from "@/components/UploadButton";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { AiMatchingCard } from "@/features/workspace/components/AiMatchingCard";
import { ExportSettingsCard } from "@/features/workspace/components/ExportSettingsCard";
import { LibraryOverviewCard } from "@/features/workspace/components/LibraryOverviewCard";
import { LibraryPanel } from "@/features/workspace/components/LibraryPanel";
import { PresetSelectionCard } from "@/features/workspace/components/PresetSelectionCard";
import { PreviewPanel as WorkspacePreviewPanel } from "@/features/workspace/components/PreviewPanel";
import { StepIndicator } from "@/features/workspace/components/StepIndicator";
import { useWorkspaceState } from "@/features/workspace/hooks/useWorkspaceState";

export function Workspace() {
  const {
    project,
    assets,
    isImporting,
    importProgress,
    selectedAssetIds,
    clearAssetSelection,
    applyPresetToGroup,
    applyPresetToSelection,
    updateAsset,
    isDragging,
    setIsDragging,
    isLibraryOpen,
    setIsLibraryOpen,
    searchText,
    setSearchText,
    selectedGroup,
    setSelectedGroup,
    activeAssetId,
    setActiveAssetId,
    selectedPresetId,
    intensity,
    showOriginal,
    setShowOriginal,
    advancedOpen,
    setAdvancedOpen,
    customPresetName,
    setCustomPresetName,
    customPresets,
    tasks,
    exportPreviewItems,
    format,
    setFormat,
    quality,
    setQuality,
    maxDimension,
    setMaxDimension,
    selectionNotice,
    importNotice,
    exportFeedback,
    allPresets,
    aiPresetCandidates,
    selectedSet,
    selectedAssets,
    groupOptions,
    filteredAssets,
    filteredSelectedCount,
    allFilteredSelected,
    activeAsset,
    activeRecommendedTopPresets,
    activeAdjustments,
    previewAdjustments,
    previewFilmProfile,
    handleToggleAssetSelection,
    handleToggleAllFilteredAssets,
    handleFiles,
    applyPreset,
    handleIntensityChange,
    updateAdjustmentValue,
    handleSaveCustomPreset,
    totalSize,
    formatLabel,
    currentStep,
    stepIndex,
    setStep,
    openFineTunePage,
    targetSelection,
    primaryAction,
    completedCount,
    progress,
    dismissExportFeedback,
  } = useWorkspaceState();

  const renderLibraryStep = () => (
    <div className="space-y-4">
      <Card className="animate-fade-up">
        <CardHeader>
          <CardTitle>导入</CardTitle>
        </CardHeader>
        <CardContent>
          <div
            className={cn(
              "flex min-h-[160px] flex-col items-center justify-center gap-2 rounded-2xl border border-dashed p-6 text-center transition",
              isDragging ? "border-sky-300/40 bg-sky-400/5 shadow-[inset_0_0_40px_rgba(56,189,248,0.05)]" : "border-white/15 bg-slate-950/40"
            )}
            onDragOver={(event) => {
              event.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={(event) => {
              event.preventDefault();
              setIsDragging(false);
              handleFiles(event.dataTransfer.files);
            }}
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-sky-200">
              <Upload className="h-6 w-6" />
            </div>
            <div>
              <p className="text-sm text-slate-200">拖拽 JPG/PNG/WebP 到此处导入</p>
              <p className="text-xs text-slate-500">
                {isImporting
                  ? importProgress
                    ? `正在导入 (${importProgress.current}/${importProgress.total})...`
                    : "正在导入与生成缩略图..."
                  : "自动生成缩略图与元信息"}
              </p>
            </div>
            <UploadButton
              size="sm"
              variant="secondary"
              label="点此导入"
              onFiles={handleFiles}
            />
            <p
              className={cn("min-h-[16px] text-xs text-sky-200", !importNotice && "opacity-0")}
              role="status"
              aria-live="polite"
            >
              {importNotice ?? "占位"}
            </p>
          </div>
        </CardContent>
      </Card>

      <LibraryOverviewCard
        filteredAssets={filteredAssets}
        selectedSet={selectedSet}
        activeAssetId={activeAssetId}
        filteredSelectedCount={filteredSelectedCount}
        allFilteredSelected={allFilteredSelected}
        searchText={searchText}
        selectedGroup={selectedGroup}
        groupOptions={groupOptions}
        onSearchTextChange={setSearchText}
        onSelectedGroupChange={setSelectedGroup}
        onToggleAllFilteredAssets={handleToggleAllFilteredAssets}
        onClearAssetSelection={clearAssetSelection}
        onSetActiveAssetId={setActiveAssetId}
        onToggleAssetSelection={handleToggleAssetSelection}
      />
    </div>
  );

  const renderStyleStep = () => (
    <div className="space-y-6">
      <WorkspacePreviewPanel
        activeAsset={activeAsset}
        previewAdjustments={previewAdjustments}
        previewFilmProfile={previewFilmProfile}
        showOriginal={showOriginal}
        setShowOriginal={setShowOriginal}
      />

      <AiMatchingCard
        selectedAssets={selectedAssets}
        allPresets={allPresets}
        aiPresetCandidates={aiPresetCandidates}
        updateAsset={updateAsset}
      />

      <PresetSelectionCard
        selectedAssetIds={selectedAssetIds}
        selectedPresetId={selectedPresetId}
        intensity={intensity}
        activeRecommendedTopPresets={activeRecommendedTopPresets}
        customPresets={customPresets}
        activeAdjustments={activeAdjustments}
        advancedOpen={advancedOpen}
        customPresetName={customPresetName}
        previewAdjustments={previewAdjustments}
        selectedGroup={selectedGroup}
        assets={assets}
        targetSelection={targetSelection}
        onApplyPreset={applyPreset}
        onIntensityChange={handleIntensityChange}
        onUpdateAdjustmentValue={updateAdjustmentValue}
        onApplyPresetToSelection={applyPresetToSelection}
        onApplyPresetToGroup={applyPresetToGroup}
        onSetAdvancedOpen={setAdvancedOpen}
        onSetCustomPresetName={setCustomPresetName}
        onSaveCustomPreset={handleSaveCustomPreset}
      />
    </div>
  );

  const renderExportStep = () => (
    <ExportSettingsCard
      assets={assets}
      totalSize={totalSize}
      format={format}
      setFormat={setFormat}
      quality={quality}
      setQuality={setQuality}
      maxDimension={maxDimension}
      setMaxDimension={setMaxDimension}
      formatLabel={formatLabel}
      tasks={tasks}
      completedCount={completedCount}
      progress={progress}
      exportPreviewItems={exportPreviewItems}
      setStep={setStep}
    />
  );

  return (
    <div className="space-y-6">
      <section className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="font-display text-2xl text-white sm:text-3xl">
              {currentStep === "library" && "导入素材"}
              {currentStep === "style" && "选择风格"}
              {currentStep === "export" && "导出交付"}
            </h2>
            <p className="text-sm text-slate-300">
              {currentStep === "library" && "拖拽导入，自动进库。"}
              {currentStep === "style" && "选风格，一键应用。"}
              {currentStep === "export" && "确认参数，完成导出。"}
            </p>
          </div>
          {currentStep !== "library" && (
            <Button
              size="sm"
              variant="secondary"
              className="md:hidden"
              onClick={() => setIsLibraryOpen(true)}
            >
              打开素材库
            </Button>
          )}
        </div>
        <StepIndicator currentStep={currentStep} stepIndex={stepIndex} onStepChange={setStep} />
      </section>

      <div className={cn("grid gap-6", currentStep !== "library" && "lg:grid-cols-[280px_minmax(0,1fr)]")}>
        {currentStep !== "library" && (
          <aside className="hidden lg:block">
            <Card className="sticky top-24">
              <CardContent className="p-4">
                <LibraryPanel
                  projectName={project?.name ?? "未命名项目"}
                  filteredAssets={filteredAssets}
                  selectedSet={selectedSet}
                  activeAssetId={activeAssetId}
                  selectedAssetCount={selectedAssetIds.length}
                  filteredSelectedCount={filteredSelectedCount}
                  allFilteredSelected={allFilteredSelected}
                  totalSize={totalSize}
                  selectionNotice={selectionNotice}
                  searchText={searchText}
                  selectedGroup={selectedGroup}
                  groupOptions={groupOptions}
                  onSearchTextChange={setSearchText}
                  onSelectedGroupChange={setSelectedGroup}
                  onToggleAllFilteredAssets={handleToggleAllFilteredAssets}
                  onClearAssetSelection={clearAssetSelection}
                  onSetActiveAssetId={setActiveAssetId}
                  onToggleAssetSelection={handleToggleAssetSelection}
                />
              </CardContent>
            </Card>
          </aside>
        )}
        <section className="min-w-0">
          {currentStep === "library" && renderLibraryStep()}
          {currentStep === "style" && renderStyleStep()}
          {currentStep === "export" && renderExportStep()}
        </section>
      </div>

      {isLibraryOpen && currentStep !== "library" && (
        <div className="fixed inset-x-0 bottom-20 z-40 rounded-t-3xl border border-white/10 bg-slate-950/95 p-4 backdrop-blur md:hidden">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-sm font-medium text-white">素材库</p>
            <Button size="sm" variant="ghost" onClick={() => setIsLibraryOpen(false)}>
              关闭
            </Button>
          </div>
          <LibraryPanel
            compact
            projectName={project?.name ?? "未命名项目"}
            filteredAssets={filteredAssets}
            selectedSet={selectedSet}
            activeAssetId={activeAssetId}
            selectedAssetCount={selectedAssetIds.length}
            filteredSelectedCount={filteredSelectedCount}
            allFilteredSelected={allFilteredSelected}
            totalSize={totalSize}
            selectionNotice={selectionNotice}
            searchText={searchText}
            selectedGroup={selectedGroup}
            groupOptions={groupOptions}
            onSearchTextChange={setSearchText}
            onSelectedGroupChange={setSelectedGroup}
            onToggleAllFilteredAssets={handleToggleAllFilteredAssets}
            onClearAssetSelection={clearAssetSelection}
            onSetActiveAssetId={setActiveAssetId}
            onToggleAssetSelection={handleToggleAssetSelection}
          />
        </div>
      )}

      {exportFeedback && (
        <div
          className={cn(
            "fixed right-4 top-20 z-50 w-[min(92vw,420px)] rounded-2xl border bg-slate-950/95 p-4 shadow-glow backdrop-blur",
            exportFeedback.kind === "success" && "border-emerald-200/40",
            exportFeedback.kind === "mixed" && "border-amber-200/40",
            exportFeedback.kind === "error" && "border-rose-200/40"
          )}
          role="status"
          aria-live="polite"
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-white">{exportFeedback.title}</p>
              <p className="mt-1 text-xs text-slate-300">{exportFeedback.detail}</p>
            </div>
            <button
              type="button"
              className="text-xs text-slate-400 transition hover:text-slate-200"
              onClick={dismissExportFeedback}
            >
              关闭
            </button>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                setStep("library");
                dismissExportFeedback();
              }}
            >
              返回素材库
            </Button>
          </div>
        </div>
      )}

      <div className="fixed inset-x-4 bottom-4 z-40 flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-slate-950/90 px-4 py-3 text-sm text-slate-100 shadow-glow backdrop-blur md:static md:inset-auto md:mt-2 md:justify-end md:bg-transparent md:p-0 md:shadow-none">
        <div className="hidden md:flex items-center gap-2 text-xs text-slate-400">
          <SlidersHorizontal className="h-4 w-4" />
          默认强度 {intensity} · 已选 {selectedAssetIds.length} 张
        </div>
        <div className="flex w-full flex-1 flex-col gap-2 md:w-auto md:flex-row md:justify-end">
          {currentStep === "style" && (
            <Button
              className="w-full md:w-auto"
              variant="secondary"
              onClick={openFineTunePage}
              disabled={!activeAssetId}
            >
              进入精修
            </Button>
          )}
          {currentStep === "library" && assets.length === 0 ? (
            <UploadButton
              className="w-full md:w-auto"
              label={primaryAction.label}
              onFiles={handleFiles}
            />
          ) : (
            <Button
              className="w-full md:w-auto"
              onClick={primaryAction.action}
              disabled={primaryAction.disabled}
            >
              {primaryAction.label}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
