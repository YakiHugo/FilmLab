import { useEffect, useMemo, useRef, useState } from "react";
import { Layers, SlidersHorizontal, Upload } from "lucide-react";
import { UploadButton } from "@/components/UploadButton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { presets as basePresets } from "@/data/presets";
import { renderImageToCanvas } from "@/lib/imageProcessing";
import { cn } from "@/lib/utils";
import { AiMatchingCard } from "@/features/workspace/components/AiMatchingCard";
import { LibraryOverviewCard } from "@/features/workspace/components/LibraryOverviewCard";
import { LibraryPanel } from "@/features/workspace/components/LibraryPanel";
import { PreviewPanel as WorkspacePreviewPanel } from "@/features/workspace/components/PreviewPanel";
import { WORKSPACE_STEPS } from "@/features/workspace/constants";
import { useWorkspaceState } from "@/features/workspace/hooks/useWorkspaceState";

export function Workspace() {
  const {
    project,
    assets,
    isImporting,
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
    handleImportResult,
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

  const StepIndicator = () => (
    <div className="grid grid-cols-3 gap-2 rounded-2xl border border-white/10 bg-slate-950/60 p-2">
      {WORKSPACE_STEPS.map((item, index) => {
        const Icon = item.icon;
        const isActive = item.id === currentStep;
        const isComplete = index < stepIndex;
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => setStep(item.id)}
            className={cn(
              "flex min-h-[104px] flex-col items-center gap-1.5 rounded-2xl px-3 py-2.5 text-xs transition",
              isActive
                ? "bg-white/10 text-white"
                : "text-slate-400 hover:bg-white/5",
            )}
          >
            <span
              className={cn(
                "flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-slate-200",
                isActive && "border-sky-200/30 bg-sky-300/20 text-sky-200",
              )}
            >
              <Icon className="h-4 w-4" />
            </span>
            <span className="font-medium">{item.label}</span>
            <span className="text-[11px] text-slate-500">
              {item.description}
            </span>
            <span
              className={cn(
                "min-h-[12px] text-[10px]",
                isComplete ? "text-emerald-300" : "text-transparent",
              )}
              aria-hidden={!isComplete}
            >
              已完成
            </span>
          </button>
        );
      })}
    </div>
  );

  const PreviewPanel = () => {
    const frameRef = useRef<HTMLDivElement | null>(null);
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const [frameSize, setFrameSize] = useState({ width: 0, height: 0 });

    const previewRatio = useMemo(() => {
      if (!activeAsset?.metadata?.width || !activeAsset?.metadata?.height) {
        return "4 / 3";
      }
      return `${activeAsset.metadata.width} / ${activeAsset.metadata.height}`;
    }, [activeAsset?.metadata?.height, activeAsset?.metadata?.width]);

    useEffect(() => {
      if (!frameRef.current) {
        return undefined;
      }
      const element = frameRef.current;
      const observer = new ResizeObserver((entries) => {
        const entry = entries[0];
        if (!entry) {
          return;
        }
        const { width, height } = entry.contentRect;
        setFrameSize({
          width: Math.max(1, Math.floor(width)),
          height: Math.max(1, Math.floor(height)),
        });
      });
      observer.observe(element);
      return () => observer.disconnect();
    }, []);

    useEffect(() => {
      if (!activeAsset || !previewAdjustments || showOriginal) {
        return undefined;
      }
      const canvas = canvasRef.current;
      if (!canvas || frameSize.width === 0 || frameSize.height === 0) {
        return undefined;
      }
      const controller = new AbortController();
      const dpr = window.devicePixelRatio || 1;
      void renderImageToCanvas({
        canvas,
        source: activeAsset.blob ?? activeAsset.objectUrl,
        adjustments: previewAdjustments,
        filmProfile: previewFilmProfile ?? undefined,
        targetSize: {
          width: Math.round(frameSize.width * dpr),
          height: Math.round(frameSize.height * dpr),
        },
        seedKey: activeAsset.id,
        signal: controller.signal,
      }).catch(() => undefined);
      return () => controller.abort();
    }, [
      activeAsset?.blob,
      activeAsset?.id,
      activeAsset?.objectUrl,
      frameSize.height,
      frameSize.width,
      previewAdjustments,
      previewFilmProfile,
      showOriginal,
    ]);

    return (
      <Card className="min-w-0">
        <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle>预览</CardTitle>
            <p className="text-xs text-slate-400 line-clamp-1">
              {activeAsset?.name ?? "尚未选择素材"}
            </p>
          </div>
          <Button
            size="sm"
            variant={showOriginal ? "default" : "secondary"}
            onClick={() => setShowOriginal((prev) => !prev)}
            disabled={!activeAsset}
          >
            对比原图
          </Button>
        </CardHeader>
        <CardContent>
          {activeAsset ? (
            <div
              ref={frameRef}
              className="relative w-full overflow-hidden rounded-2xl border border-white/10 bg-slate-950/60"
              style={{ aspectRatio: previewRatio }}
            >
              {showOriginal || !previewAdjustments ? (
                <img
                  src={activeAsset.objectUrl}
                  alt={activeAsset.name}
                  className="h-full w-full object-cover"
                />
              ) : (
                <canvas
                  ref={canvasRef}
                  role="img"
                  aria-label={`${activeAsset.name} 预览`}
                  className="block h-full w-full"
                />
              )}
              {showOriginal && (
                <span className="absolute left-3 top-3 rounded-full border border-white/10 bg-slate-950/80 px-3 py-1 text-xs text-slate-200">
                  原图
                </span>
              )}
            </div>
          ) : (
            <div className="rounded-2xl border border-white/10 bg-slate-950/60 p-6 text-center text-sm text-slate-400">
              还没有素材，导入后即可预览。
            </div>
          )}
        </CardContent>
      </Card>
    );
  };

  const renderLibraryStep = () => (
    <div className="space-y-4">
      <Card className="animate-fade-up">
        <CardHeader>
          <CardTitle>导入</CardTitle>
        </CardHeader>
        <CardContent>
          <div
            className={cn(
              "flex min-h-[160px] flex-col items-center justify-center gap-2 rounded-3xl border-2 border-dashed p-6 text-center transition",
              isDragging
                ? "border-sky-200/50 bg-sky-300/10"
                : "border-white/10 bg-slate-950/40",
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
              <p className="text-sm text-slate-200">
                拖拽 JPG/PNG/WebP 到此处导入
              </p>
              <p className="text-xs text-slate-500">
                {isImporting
                  ? "正在导入与生成缩略图..."
                  : "自动生成缩略图与元信息"}
              </p>
            </div>
            <UploadButton
              size="sm"
              variant="secondary"
              label="点此导入"
              onImportResult={handleImportResult}
            />
            <p
              className={cn(
                "min-h-[16px] text-xs text-sky-200",
                !importNotice && "opacity-0",
              )}
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

      <Card
        className="animate-fade-up"
        style={{ animationDelay: "80ms" }}
      >
        <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle>风格包</CardTitle>
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <Layers className="h-4 w-4" />
            已选 {selectedAssetIds.length} 张
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {activeRecommendedTopPresets.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs uppercase tracking-[0.24em] text-sky-200/80">
                AI 推荐（当前图片）
              </p>
              <div className="flex gap-3 overflow-x-auto pb-2">
                {activeRecommendedTopPresets.map(
                  ({ preset, recommendation }, index) => {
                    const isActive = preset.id === selectedPresetId;
                    return (
                      <button
                        key={`${preset.id}-${index}`}
                        type="button"
                        onClick={() => applyPreset(preset.id)}
                        className={cn(
                          "min-w-[220px] rounded-2xl border border-white/10 bg-slate-950/60 p-3 text-left transition",
                          isActive && "border-sky-200/40 bg-sky-300/10",
                        )}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <p className="font-medium text-slate-100">
                            {preset.name}
                          </p>
                          <Badge className="border-sky-200/30 bg-sky-300/20 text-sky-100">
                            Top {index + 1}
                          </Badge>
                        </div>
                        <p className="mt-2 text-xs text-slate-400 line-clamp-2">
                          {recommendation.reason}
                        </p>
                      </button>
                    );
                  },
                )}
              </div>
            </div>
          )}

          <div className="flex gap-3 overflow-x-auto pb-2">
            {basePresets.map((preset, index) => {
              const isActive = preset.id === selectedPresetId;
              return (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => applyPreset(preset.id)}
                  className={cn(
                    "min-w-[180px] rounded-2xl border border-white/10 bg-slate-950/60 p-3 text-left transition",
                    isActive && "border-sky-200/40 bg-sky-300/10",
                  )}
                >
                  <div className="flex items-center justify-between">
                    <p className="font-medium text-slate-100">{preset.name}</p>
                    {index === 0 && (
                      <Badge className="border-sky-200/30 bg-sky-300/20 text-sky-200">
                        推荐
                      </Badge>
                    )}
                  </div>
                  <p className="mt-2 text-xs text-slate-400 line-clamp-2">
                    {preset.description}
                  </p>
                </button>
              );
            })}
          </div>

          {customPresets.length > 0 && (
            <div>
              <p className="text-xs uppercase tracking-[0.24em] text-slate-500">
                自定义风格
              </p>
              <div className="mt-2 flex gap-3 overflow-x-auto pb-2">
                {customPresets.map((preset) => {
                  const isActive = preset.id === selectedPresetId;
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => applyPreset(preset.id)}
                      className={cn(
                        "min-w-[180px] rounded-2xl border border-white/10 bg-slate-950/60 p-3 text-left transition",
                        isActive && "border-emerald-200/40 bg-emerald-300/10",
                      )}
                    >
                      <p className="font-medium text-slate-100">
                        {preset.name}
                      </p>
                      <p className="mt-2 text-xs text-slate-400 line-clamp-2">
                        {preset.description}
                      </p>
                      <Badge className="mt-3 border-emerald-200/30 bg-emerald-300/10 text-emerald-200">
                        自定义
                      </Badge>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div className="rounded-2xl border border-white/10 bg-slate-950/60 p-3">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span className="text-slate-300">风格强度</span>
              <span>{intensity}</span>
            </div>
            <Slider
              value={[intensity]}
              min={0}
              max={100}
              step={1}
              onValueChange={(value) => handleIntensityChange(value[0] ?? 0)}
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              onClick={() =>
                applyPresetToSelection(
                  targetSelection,
                  selectedPresetId,
                  intensity,
                )
              }
              disabled={assets.length === 0}
            >
              应用到已选
            </Button>
            <Button
              variant="secondary"
              onClick={() =>
                selectedGroup !== "all"
                  ? applyPresetToGroup(
                      selectedGroup,
                      selectedPresetId,
                      intensity,
                    )
                  : undefined
              }
              disabled={selectedGroup === "all"}
            >
              应用到当前分组
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <Card className="animate-fade-up" style={{ animationDelay: "120ms" }}>
          <CardHeader>
            <CardTitle>快速微调</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {activeAdjustments ? (
              [
                { key: "exposure", label: "曝光", min: -50, max: 50 },
                { key: "contrast", label: "对比", min: -50, max: 50 },
                { key: "saturation", label: "饱和", min: -50, max: 50 },
              ].map((tool) => {
                const key = tool.key as "exposure" | "contrast" | "saturation";
                const currentValue = activeAdjustments[key];
                return (
                  <div
                    key={tool.key}
                    className="rounded-2xl border border-white/10 bg-slate-950/60 p-3"
                  >
                    <div className="flex items-center justify-between text-xs text-slate-400">
                      <span className="text-slate-300">{tool.label}</span>
                      <span>{currentValue}</span>
                    </div>
                    <Slider
                      value={[currentValue]}
                      min={tool.min}
                      max={tool.max}
                      step={1}
                      onValueChange={(value) =>
                        updateAdjustmentValue(key, value[0] ?? 0)
                      }
                    />
                  </div>
                );
              })
            ) : (
              <p className="text-sm text-slate-400">请选择素材后再微调。</p>
            )}
          </CardContent>
        </Card>

        <Card className="animate-fade-up" style={{ animationDelay: "160ms" }}>
          <CardHeader className="flex items-center justify-between">
            <CardTitle>进阶预设</CardTitle>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setAdvancedOpen((prev) => !prev)}
            >
              {advancedOpen ? "收起" : "展开"}
            </Button>
          </CardHeader>
          <CardContent className="space-y-4">
            {advancedOpen ? (
              <>
                <div className="rounded-2xl border border-white/10 bg-slate-950/60 p-3">
                  <div className="flex items-center justify-between text-xs text-slate-400">
                    <span className="text-slate-300">色温</span>
                    <span>{activeAdjustments?.temperature ?? 0}</span>
                  </div>
                  <Slider
                    value={[activeAdjustments?.temperature ?? 0]}
                    min={-50}
                    max={50}
                    step={1}
                    onValueChange={(value) =>
                      updateAdjustmentValue("temperature", value[0] ?? 0)
                    }
                  />
                </div>
                <div className="rounded-2xl border border-white/10 bg-slate-950/60 p-3">
                  <div className="flex items-center justify-between text-xs text-slate-400">
                    <span className="text-slate-300">颗粒</span>
                    <span>{activeAdjustments?.grain ?? 0}</span>
                  </div>
                  <Slider
                    value={[activeAdjustments?.grain ?? 0]}
                    min={0}
                    max={40}
                    step={1}
                    onValueChange={(value) =>
                      updateAdjustmentValue("grain", value[0] ?? 0)
                    }
                  />
                </div>
                <div className="rounded-2xl border border-white/10 bg-slate-950/60 p-3">
                  <div className="flex items-center justify-between text-xs text-slate-400">
                    <span className="text-slate-300">暗角</span>
                    <span>{activeAdjustments?.vignette ?? 0}</span>
                  </div>
                  <Slider
                    value={[activeAdjustments?.vignette ?? 0]}
                    min={-40}
                    max={40}
                    step={1}
                    onValueChange={(value) =>
                      updateAdjustmentValue("vignette", value[0] ?? 0)
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs text-slate-400">
                    保存为自定义风格
                  </Label>
                  <Input
                    value={customPresetName}
                    onChange={(event) =>
                      setCustomPresetName(event.target.value)
                    }
                    placeholder="输入风格名称"
                  />
                  <Button
                    className="w-full"
                    onClick={handleSaveCustomPreset}
                    disabled={!customPresetName.trim() || !previewAdjustments}
                  >
                    保存风格
                  </Button>
                </div>
              </>
            ) : (
              <p className="text-sm text-slate-400">
                进阶玩家可保存自定义风格包并重复使用。
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );

  const renderExportStep = () => (
    <div className="space-y-6">
      <Card className="animate-fade-up">
        <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle>导出设置</CardTitle>
          <div className="text-xs text-slate-400">
            可导出 {assets.length} 张 · 占用{" "}
            {(totalSize / 1024 / 1024).toFixed(1)} MB
          </div>
        </CardHeader>
        <CardContent className="space-y-4 text-sm text-slate-300">
          <div className="space-y-2">
            <Label className="text-xs text-slate-400">格式</Label>
            <Select
              value={format}
              onValueChange={(value) => setFormat(value as typeof format)}
            >
              <SelectTrigger>
                <SelectValue placeholder="选择导出格式" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="original">跟随原文件</SelectItem>
                <SelectItem value="jpeg">JPG</SelectItem>
                <SelectItem value="png">PNG</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="rounded-2xl border border-white/10 bg-slate-950/60 p-3">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span className="text-slate-300">质量</span>
              <span>{quality}%</span>
            </div>
            <Slider
              value={[quality]}
              min={70}
              max={100}
              step={1}
              onValueChange={(value) => setQuality(value[0] ?? 92)}
            />
            <p className="mt-2 text-[11px] text-slate-500">
              PNG 忽略质量参数，JPG 建议 85% 以上。
            </p>
          </div>
          <div className="space-y-2">
            <Label className="text-xs text-slate-400">最长边尺寸</Label>
            <Select
              value={String(maxDimension)}
              onValueChange={(value) => setMaxDimension(Number(value))}
            >
              <SelectTrigger>
                <SelectValue placeholder="选择尺寸" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="0">不缩放</SelectItem>
                <SelectItem value="2048">2048 px</SelectItem>
                <SelectItem value="3072">3072 px</SelectItem>
                <SelectItem value="4096">4096 px</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="rounded-2xl border border-white/10 bg-slate-950/60 p-3 text-xs text-slate-300">
            当前配置：格式 {formatLabel} · 质量 {quality}% ·
            {maxDimension > 0 ? ` 最长边 ${maxDimension}px` : " 原始尺寸"}
          </div>
        </CardContent>
      </Card>

      <Card className="animate-fade-up" style={{ animationDelay: "80ms" }}>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>导出进度</CardTitle>
          <Badge>
            {completedCount}/{assets.length}
          </Badge>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-slate-300">
          <div className="flex items-center justify-between">
            <span>完成率</span>
            <span>{progress}%</span>
          </div>
          <div className="rounded-full border border-white/10 bg-slate-950/60">
            <div
              className="h-2 rounded-full bg-sky-300 transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
          {tasks.length === 0 ? (
            <p className="text-xs text-slate-400">点击开始导出后显示进度。</p>
          ) : (
            <p className="text-xs text-slate-400">
              已完成 {completedCount} / {assets.length}
            </p>
          )}
          {progress === 100 && tasks.length > 0 && (
            <Button
              size="sm"
              variant="secondary"
              onClick={() => setStep("library")}
            >
              回到素材库
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );

  return (
    <div className="space-y-6">
      <section className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-slate-500">
              FilmLab 工作台
            </p>
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
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="secondary"
              className="md:hidden"
              onClick={() => setIsLibraryOpen(true)}
            >
              打开素材库
            </Button>
            <div className="hidden sm:flex items-center gap-2">
              <Badge className="border-white/10 bg-white/5 text-slate-200">
                素材 {assets.length}
              </Badge>
              <Badge className="border-white/10 bg-white/5 text-slate-200">
                已选 {selectedAssetIds.length}
              </Badge>
            </div>
          </div>
        </div>
        <StepIndicator />
      </section>

      <div className="grid gap-6 lg:grid-cols-[280px_minmax(0,1fr)]">
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
        <section className="min-w-0">
          {currentStep === "library" && renderLibraryStep()}
          {currentStep === "style" && renderStyleStep()}
          {currentStep === "export" && renderExportStep()}
        </section>
      </div>

      {isLibraryOpen && (
        <div className="fixed inset-x-0 bottom-20 z-40 rounded-t-3xl border border-white/10 bg-slate-950/95 p-4 backdrop-blur md:hidden">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-sm font-medium text-white">素材库</p>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setIsLibraryOpen(false)}
            >
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
            exportFeedback.kind === "error" && "border-rose-200/40",
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
              onImportResult={handleImportResult}
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
