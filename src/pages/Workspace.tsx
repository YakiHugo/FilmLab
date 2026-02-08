import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearch } from "@tanstack/react-router";
import {
  Download,
  Layers,
  SlidersHorizontal,
  Sparkles,
  Upload,
} from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import { useProjectStore, type AddAssetsResult } from "@/stores/projectStore";
import { UploadButton } from "@/components/UploadButton";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { presets as basePresets } from "@/data/presets";
import {
  applyPresetAdjustments,
  createDefaultAdjustments,
} from "@/lib/adjustments";
import type { RecommendFilmPresetCandidate } from "@/lib/ai/client";
import { requestFilmRecommendationWithRetry } from "@/lib/ai/client";
import { toRecommendationImageDataUrl } from "@/lib/ai/image";
import {
  DEFAULT_TOP_K,
  MAX_RECOMMENDATION_RETRIES,
  MAX_STYLE_SELECTION,
  applySelectionLimit,
  findAutoApplyPreset,
  sanitizeTopPresetRecommendations,
  toggleSelectionWithLimit,
} from "@/lib/ai/recommendationUtils";
import { resolveFilmProfile as resolveRuntimeFilmProfile } from "@/lib/film";
import { renderImageToBlob, renderImageToCanvas } from "@/lib/imageProcessing";
import { cn } from "@/lib/utils";
import type {
  Asset,
  AiPresetRecommendation,
  EditingAdjustments,
  FilmProfileOverrides,
  FilmProfile,
  Preset,
  PresetAdjustmentKey,
  PresetAdjustments,
} from "@/types";

const CUSTOM_PRESETS_KEY = "filmlab.customPresets";

type WorkspaceStep = "library" | "style" | "export";

const steps: Array<{
  id: WorkspaceStep;
  label: string;
  description: string;
  icon: typeof Upload;
}> = [
  {
    id: "library",
    label: "素材",
    description: "导入与选择",
    icon: Upload,
  },
  {
    id: "style",
    label: "风格",
    description: "一键统一",
    icon: Sparkles,
  },
  {
    id: "export",
    label: "导出",
    description: "交付输出",
    icon: Download,
  },
];

const presetAdjustmentKeys: PresetAdjustmentKey[] = [
  "exposure",
  "contrast",
  "highlights",
  "shadows",
  "whites",
  "blacks",
  "temperature",
  "tint",
  "vibrance",
  "saturation",
  "clarity",
  "dehaze",
  "vignette",
  "grain",
];
const SUPPORTED_IMPORT_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);
const SUPPORTED_IMPORT_EXTENSIONS = /\.(jpe?g|png|webp)$/i;

const isSupportedImportFile = (file: File) => {
  if (SUPPORTED_IMPORT_TYPES.has(file.type)) {
    return true;
  }
  if (file.type.startsWith("image/")) {
    return true;
  }
  return SUPPORTED_IMPORT_EXTENSIONS.test(file.name);
};

const loadCustomPresets = () => {
  if (typeof window === "undefined") {
    return [] as Preset[];
  }
  const stored = window.localStorage.getItem(CUSTOM_PRESETS_KEY);
  if (!stored) {
    return [] as Preset[];
  }
  try {
    const parsed = JSON.parse(stored) as Preset[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [] as Preset[];
  }
};

const buildCustomAdjustments = (adjustments: EditingAdjustments) => {
  const base = createDefaultAdjustments();
  return presetAdjustmentKeys.reduce<PresetAdjustments>((result, key) => {
    const delta = adjustments[key] - base[key];
    if (Math.abs(delta) >= 1) {
      result[key] = delta;
    }
    return result;
  }, {});
};

const resolveAdjustments = (
  adjustments: EditingAdjustments | undefined,
  presetId: string | undefined,
  intensity: number | undefined,
  presets: Preset[],
) => {
  const base = adjustments ?? createDefaultAdjustments();
  if (!presetId) {
    return base;
  }
  const preset = presets.find((item) => item.id === presetId);
  if (!preset) {
    return base;
  }
  const resolvedIntensity =
    typeof intensity === "number" ? intensity : preset.intensity;
  return applyPresetAdjustments(base, preset.adjustments, resolvedIntensity);
};

const resolveFilmProfile = (
  adjustments: EditingAdjustments | undefined,
  presetId: string | undefined,
  filmProfileId: string | undefined,
  filmProfile: FilmProfile | undefined,
  intensity: number | undefined,
  presets: Preset[],
  overrides?: FilmProfileOverrides,
): FilmProfile | null => {
  if (!adjustments) {
    return null;
  }
  return resolveRuntimeFilmProfile({
    adjustments,
    presetId,
    filmProfileId,
    filmProfile,
    intensity,
    presets,
    overrides,
  });
};

interface ExportTask {
  id: string;
  name: string;
  status: "等待" | "处理中" | "完成" | "失败";
}

interface AiMatchingProgress {
  running: boolean;
  total: number;
  processed: number;
  succeeded: number;
  failed: number;
}

export function Workspace() {
  const navigate = useNavigate({ from: "/" });
  const { step } = useSearch({ from: "/" });
  const {
    project,
    assets,
    addAssets,
    isImporting,
    selectedAssetIds,
    setSelectedAssetIds,
    clearAssetSelection,
    applyPresetToGroup,
    applyPresetToSelection,
    updateAsset,
  } = useProjectStore(
    useShallow((state) => ({
      project: state.project,
      assets: state.assets,
      addAssets: state.addAssets,
      isImporting: state.isImporting,
      selectedAssetIds: state.selectedAssetIds,
      setSelectedAssetIds: state.setSelectedAssetIds,
      clearAssetSelection: state.clearAssetSelection,
      applyPresetToGroup: state.applyPresetToGroup,
      applyPresetToSelection: state.applyPresetToSelection,
      updateAsset: state.updateAsset,
    })),
  );

  const [isDragging, setIsDragging] = useState(false);
  const [isLibraryOpen, setIsLibraryOpen] = useState(false);
  const [searchText, setSearchText] = useState("");
  const [selectedGroup, setSelectedGroup] = useState("all");
  const [activeAssetId, setActiveAssetId] = useState<string | null>(null);
  const [selectedPresetId, setSelectedPresetId] = useState(
    basePresets[0]?.id ?? "",
  );
  const [intensity, setIntensity] = useState(basePresets[0]?.intensity ?? 60);
  const [showOriginal, setShowOriginal] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [customPresetName, setCustomPresetName] = useState("");
  const [customPresets, setCustomPresets] =
    useState<Preset[]>(loadCustomPresets);
  const [tasks, setTasks] = useState<ExportTask[]>([]);
  const [format, setFormat] = useState<"original" | "jpeg" | "png">("original");
  const [quality, setQuality] = useState(92);
  const [maxDimension, setMaxDimension] = useState(0);
  const [selectionNotice, setSelectionNotice] = useState<string | null>(null);
  const [importNotice, setImportNotice] = useState<string | null>(null);
  const [aiProgress, setAiProgress] = useState<AiMatchingProgress>({
    running: false,
    total: 0,
    processed: 0,
    succeeded: 0,
    failed: 0,
  });
  const didAutoSelect = useRef(false);
  const aiRunInFlightRef = useRef(false);

  useEffect(() => {
    if (!importNotice) {
      return undefined;
    }
    const timer = window.setTimeout(() => {
      setImportNotice(null);
    }, 2800);
    return () => window.clearTimeout(timer);
  }, [importNotice]);

  const allPresets = useMemo(() => {
    return [...basePresets, ...customPresets];
  }, [customPresets]);
  const customPresetIdSet = useMemo(
    () => new Set(customPresets.map((preset) => preset.id)),
    [customPresets],
  );
  const presetById = useMemo(
    () => new Map(allPresets.map((preset) => [preset.id, preset])),
    [allPresets],
  );
  const aiPresetCandidates = useMemo<RecommendFilmPresetCandidate[]>(
    () =>
      allPresets.map((preset) => ({
        id: preset.id,
        name: preset.name,
        description: preset.description,
        tags: preset.tags,
        intensity: preset.intensity,
        isCustom: customPresetIdSet.has(preset.id),
      })),
    [allPresets, customPresetIdSet],
  );

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    window.localStorage.setItem(
      CUSTOM_PRESETS_KEY,
      JSON.stringify(customPresets),
    );
  }, [customPresets]);

  useEffect(() => {
    if (!assets.length) {
      setActiveAssetId(null);
      return;
    }
    const exists = assets.some((asset) => asset.id === activeAssetId);
    if (!exists) {
      setActiveAssetId(assets[0]?.id ?? null);
    }
  }, [assets, activeAssetId]);

  useEffect(() => {
    if (didAutoSelect.current) {
      return;
    }
    if (assets.length > 0 && selectedAssetIds.length === 0) {
      const limitedSelection = applySelectionLimit(
        assets.map((asset) => asset.id),
        MAX_STYLE_SELECTION,
      );
      setSelectedAssetIds(limitedSelection.ids);
      if (limitedSelection.limited) {
        setSelectionNotice(`最多可选择 ${MAX_STYLE_SELECTION} 张素材。`);
      }
      didAutoSelect.current = true;
    }
  }, [assets, selectedAssetIds.length, setSelectedAssetIds]);

  useEffect(() => {
    const asset = assets.find((item) => item.id === activeAssetId);
    if (!asset) {
      return;
    }
    const fallbackPresetId = asset.presetId ?? basePresets[0]?.id ?? "";
    setSelectedPresetId(fallbackPresetId);
    if (typeof asset.intensity === "number") {
      setIntensity(asset.intensity);
    }
  }, [activeAssetId, assets]);

  const selectedSet = useMemo(
    () => new Set(selectedAssetIds),
    [selectedAssetIds],
  );
  const selectedAssets = useMemo(
    () => assets.filter((asset) => selectedSet.has(asset.id)),
    [assets, selectedSet],
  );
  const failedAiAssets = useMemo(
    () =>
      selectedAssets.filter(
        (asset) => asset.aiRecommendation?.status === "failed",
      ),
    [selectedAssets],
  );

  const groupOptions = useMemo(() => {
    const groups = new Set<string>();
    assets.forEach((asset) => groups.add(asset.group ?? "未分组"));
    return Array.from(groups);
  }, [assets]);

  const normalizedSearch = searchText.trim().toLowerCase();
  const filteredAssets = useMemo(() => {
    return assets.filter((asset) => {
      const group = asset.group ?? "未分组";
      if (selectedGroup !== "all" && group !== selectedGroup) {
        return false;
      }
      if (
        normalizedSearch &&
        !asset.name.toLowerCase().includes(normalizedSearch)
      ) {
        return false;
      }
      return true;
    });
  }, [assets, normalizedSearch, selectedGroup]);

  const activeAsset = useMemo(
    () => assets.find((asset) => asset.id === activeAssetId) ?? null,
    [assets, activeAssetId],
  );
  const activeRecommendedTopPresets = useMemo(() => {
    if (!activeAsset?.aiRecommendation) {
      return [] as Array<{
        preset: Preset;
        recommendation: AiPresetRecommendation;
      }>;
    }
    return activeAsset.aiRecommendation.topPresets
      .map((item) => {
        const preset = presetById.get(item.presetId);
        if (!preset) {
          return null;
        }
        return {
          preset,
          recommendation: item,
        };
      })
      .filter(
        (
          item,
        ): item is { preset: Preset; recommendation: AiPresetRecommendation } =>
          item !== null,
      );
  }, [activeAsset?.aiRecommendation, presetById]);

  const activeAdjustments = useMemo(() => {
    if (!activeAsset) {
      return null;
    }
    return activeAsset.adjustments ?? createDefaultAdjustments();
  }, [activeAsset]);

  const previewAdjustments = useMemo(() => {
    if (!activeAsset) {
      return null;
    }
    return resolveAdjustments(
      activeAdjustments ?? undefined,
      activeAsset.presetId,
      activeAsset.intensity,
      allPresets,
    );
  }, [activeAdjustments, activeAsset, allPresets]);

  const previewFilmProfile = useMemo(() => {
    if (!activeAsset || !previewAdjustments) {
      return null;
    }
    return resolveFilmProfile(
      previewAdjustments,
      activeAsset.presetId,
      activeAsset.filmProfileId,
      activeAsset.filmProfile,
      activeAsset.intensity,
      allPresets,
      activeAsset.filmOverrides,
    );
  }, [activeAsset, allPresets, previewAdjustments]);

  const setSelectionWithLimit = useCallback(
    (assetIds: string[]) => {
      const limited = applySelectionLimit(assetIds, MAX_STYLE_SELECTION);
      setSelectedAssetIds(limited.ids);
      setSelectionNotice(
        limited.limited ? `最多可选择 ${MAX_STYLE_SELECTION} 张素材。` : null,
      );
    },
    [setSelectedAssetIds],
  );

  const handleToggleAssetSelection = useCallback(
    (assetId: string) => {
      const next = toggleSelectionWithLimit(
        selectedAssetIds,
        assetId,
        MAX_STYLE_SELECTION,
      );
      setSelectedAssetIds(next.ids);
      setSelectionNotice(
        next.limited ? `最多可选择 ${MAX_STYLE_SELECTION} 张素材。` : null,
      );
    },
    [selectedAssetIds, setSelectedAssetIds],
  );

  const handleSelectFilteredAssets = useCallback(() => {
    setSelectionWithLimit(filteredAssets.map((asset) => asset.id));
  }, [filteredAssets, setSelectionWithLimit]);

  const runAiMatchingForAssets = useCallback(
    async (targetAssets: Asset[]) => {
      if (targetAssets.length === 0 || aiPresetCandidates.length === 0) {
        return;
      }

      const candidateIds = aiPresetCandidates.map((item) => item.id);
      let processed = 0;
      let succeeded = 0;
      let failed = 0;

      aiRunInFlightRef.current = true;
      setAiProgress({
        running: true,
        total: targetAssets.length,
        processed: 0,
        succeeded: 0,
        failed: 0,
      });

      for (const asset of targetAssets) {
        try {
          const imageDataUrl = await toRecommendationImageDataUrl(asset);
          const result = await requestFilmRecommendationWithRetry(
            {
              assetId: asset.id,
              imageDataUrl,
              metadata: asset.metadata,
              candidates: aiPresetCandidates,
              topK: DEFAULT_TOP_K,
            },
            { maxRetries: MAX_RECOMMENDATION_RETRIES },
          );

          const topPresets = sanitizeTopPresetRecommendations(
            result.topPresets,
            candidateIds,
            DEFAULT_TOP_K,
          );
          const autoPreset = findAutoApplyPreset(allPresets, topPresets);

          updateAsset(asset.id, {
            aiRecommendation: {
              version: 1,
              model: result.model,
              matchedAt: new Date().toISOString(),
              attempts: result.attempts,
              topPresets,
              autoAppliedPresetId: autoPreset?.id,
              status: "succeeded",
            },
            ...(autoPreset
              ? {
                  presetId: autoPreset.id,
                  intensity: autoPreset.intensity,
                  filmProfileId: autoPreset.filmProfileId,
                  filmProfile: autoPreset.filmProfile,
                  filmOverrides: undefined,
                }
              : {}),
          });
          succeeded += 1;
        } catch {
          updateAsset(asset.id, {
            aiRecommendation: {
              version: 1,
              model: "gpt-4.1-mini",
              matchedAt: new Date().toISOString(),
              attempts: MAX_RECOMMENDATION_RETRIES,
              topPresets: [],
              status: "failed",
            },
          });
          failed += 1;
        } finally {
          processed += 1;
          setAiProgress({
            running: true,
            total: targetAssets.length,
            processed,
            succeeded,
            failed,
          });
        }
      }

      setAiProgress((current) => ({
        ...current,
        running: false,
      }));
      aiRunInFlightRef.current = false;
    },
    [aiPresetCandidates, allPresets, updateAsset],
  );

  const handleRetryFailedRecommendations = useCallback(() => {
    if (aiRunInFlightRef.current || failedAiAssets.length === 0) {
      return;
    }
    void runAiMatchingForAssets(failedAiAssets);
  }, [failedAiAssets, runAiMatchingForAssets]);

  const handleImportResult = useCallback(
    (result: AddAssetsResult) => {
      if (result.added > 0) {
        setActiveAssetId(result.addedAssetIds[0] ?? null);
        setSelectionWithLimit([...selectedAssetIds, ...result.addedAssetIds]);
      }
      if (result.added > 0 && result.failed === 0) {
        setImportNotice(`已导入 ${result.added} 张素材。`);
        return;
      }
      if (result.added > 0 && result.failed > 0) {
        setImportNotice(
          `已导入 ${result.added} 张，失败 ${result.failed} 张。`,
        );
        return;
      }
      setImportNotice("导入失败，请重试或更换文件。");
    },
    [selectedAssetIds, setSelectionWithLimit],
  );

  const handleFiles = useCallback(
    (files: FileList | null) => {
      if (isImporting) {
        setImportNotice("正在导入，请稍候。");
        return;
      }
      if (!files || files.length === 0) return;
      const filtered = Array.from(files).filter((file) =>
        isSupportedImportFile(file),
      );
      if (filtered.length === 0) {
        setImportNotice("仅支持导入 JPG / PNG / WebP 图片。");
        return;
      }
      setSearchText("");
      setSelectedGroup("all");
      void addAssets(filtered)
        .then((result) => handleImportResult(result))
        .catch(() => {
          setImportNotice("导入失败，请重试或更换文件。");
        });
    },
    [addAssets, handleImportResult, isImporting],
  );

  const applyPreset = (presetId: string) => {
    if (!activeAsset) {
      return;
    }
    const preset = allPresets.find((item) => item.id === presetId);
    setSelectedPresetId(presetId);
    updateAsset(activeAsset.id, {
      presetId,
      intensity,
      filmProfileId: preset?.filmProfileId,
      filmProfile: preset?.filmProfile,
      filmOverrides: undefined,
    });
  };

  const handleIntensityChange = (value: number) => {
    setIntensity(value);
    if (!activeAsset) {
      return;
    }
    updateAsset(activeAsset.id, { intensity: value });
  };

  const updateAdjustmentValue = (
    key: keyof EditingAdjustments,
    value: number,
  ) => {
    if (!activeAsset || !activeAdjustments) {
      return;
    }
    updateAsset(activeAsset.id, {
      adjustments: {
        ...activeAdjustments,
        [key]: value,
      },
    });
  };

  const handleSaveCustomPreset = () => {
    if (!previewAdjustments) {
      return;
    }
    const name = customPresetName.trim();
    if (!name) {
      return;
    }
    const custom: Preset = {
      id: `custom-${Date.now()}`,
      name,
      tags: ["portrait"],
      intensity: 100,
      description: "自定义风格",
      adjustments: buildCustomAdjustments(previewAdjustments),
      filmProfile: previewFilmProfile ?? undefined,
    };
    setCustomPresets((prev) => [custom, ...prev]);
    setCustomPresetName("");
    setSelectedPresetId(custom.id);
    if (activeAsset) {
      updateAsset(activeAsset.id, {
        presetId: custom.id,
        intensity: 100,
        filmProfile: custom.filmProfile,
        filmProfileId: undefined,
        filmOverrides: undefined,
      });
    }
  };

  const resolveOutputType = (assetType: string) => {
    if (format === "png") {
      return "image/png";
    }
    if (format === "jpeg") {
      return "image/jpeg";
    }
    return assetType === "image/png" ? "image/png" : "image/jpeg";
  };

  const buildDownloadName = (name: string, type: string) => {
    const base = name.replace(/\.[^/.]+$/, "");
    const extension = type === "image/png" ? ".png" : ".jpg";
    if (format === "original") {
      return name;
    }
    return `${base}${extension}`;
  };

  const handleExportAll = async () => {
    if (assets.length === 0) {
      return;
    }
    const newTasks = assets.map((asset) => ({
      id: asset.id,
      name: asset.name,
      status: "等待" as const,
    }));
    setTasks(newTasks);

    for (const asset of assets) {
      setTasks((prev) =>
        prev.map((item) =>
          item.id === asset.id ? { ...item, status: "处理中" } : item,
        ),
      );
      try {
        if (!asset?.blob) {
          throw new Error("缺少原图数据");
        }
        const adjustments = resolveAdjustments(
          asset.adjustments,
          asset.presetId,
          asset.intensity,
          allPresets,
        );
        const filmProfile = resolveFilmProfile(
          adjustments,
          asset.presetId,
          asset.filmProfileId,
          asset.filmProfile,
          asset.intensity,
          allPresets,
          asset.filmOverrides,
        );
        const outputType = resolveOutputType(asset.type);
        const blob = await renderImageToBlob(asset.blob, adjustments, {
          type: outputType,
          quality: quality / 100,
          maxDimension: maxDimension > 0 ? maxDimension : undefined,
          filmProfile: filmProfile ?? undefined,
          seedKey: asset.id,
        });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = buildDownloadName(asset.name, outputType);
        link.click();
        URL.revokeObjectURL(url);
        setTasks((prev) =>
          prev.map((item) =>
            item.id === asset.id ? { ...item, status: "完成" } : item,
          ),
        );
      } catch (error) {
        setTasks((prev) =>
          prev.map((item) =>
            item.id === asset.id ? { ...item, status: "失败" } : item,
          ),
        );
      }
    }
  };

  const completedCount = tasks.filter((task) => task.status === "完成").length;
  const progress =
    tasks.length > 0 ? Math.round((completedCount / tasks.length) * 100) : 0;
  const isExporting = tasks.some((task) => task.status === "处理中");

  const totalSize = useMemo(
    () => assets.reduce((sum, asset) => sum + asset.size, 0),
    [assets],
  );

  const formatLabel =
    format === "original" ? "跟随原文件" : format === "png" ? "PNG" : "JPG";

  const currentStep = (step ?? "library") as WorkspaceStep;
  const stepIndex = steps.findIndex((item) => item.id === currentStep);

  useEffect(() => {
    if (currentStep !== "style" || aiRunInFlightRef.current) {
      return;
    }
    const pendingAssets = selectedAssets
      .filter((asset) => !asset.aiRecommendation)
      .slice(0, MAX_STYLE_SELECTION);
    if (pendingAssets.length === 0) {
      return;
    }
    void runAiMatchingForAssets(pendingAssets);
  }, [currentStep, runAiMatchingForAssets, selectedAssets]);

  const setStep = (nextStep: WorkspaceStep) => {
    void navigate({ search: { step: nextStep } });
  };

  const openFineTunePage = () => {
    if (!activeAssetId) {
      return;
    }
    void navigate({ to: "/editor", search: { assetId: activeAssetId } });
  };

  const targetSelection =
    selectedAssetIds.length > 0
      ? selectedAssetIds
      : applySelectionLimit(
          assets.map((asset) => asset.id),
          MAX_STYLE_SELECTION,
        ).ids;

  const primaryAction = (() => {
    if (currentStep === "library") {
      return {
        label: assets.length > 0 ? "下一步：选风格" : "导入素材",
        action: () => {
          if (assets.length > 0) {
            setStep("style");
          } else {
            setIsLibraryOpen(true);
          }
        },
        disabled: false,
      };
    }
    if (currentStep === "style") {
      return {
        label: "下一步：导出",
        action: () => setStep("export"),
        disabled: assets.length === 0,
      };
    }
    return {
      label: isExporting ? "导出中" : "开始导出",
      action: handleExportAll,
      disabled: assets.length === 0 || isExporting,
    };
  })();

  const StepIndicator = () => (
    <div className="grid grid-cols-3 gap-2 rounded-2xl border border-white/10 bg-slate-950/60 p-2">
      {steps.map((item, index) => {
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

  const LibraryPanel = ({ compact }: { compact?: boolean }) => (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-slate-500">
            素材库
          </p>
          <p className="text-sm text-white">{project?.name ?? "未命名项目"}</p>
        </div>
        <Badge className="border-white/10 bg-white/5 text-slate-200">
          {filteredAssets.length}
        </Badge>
      </div>
      <div className="space-y-2">
        <Label className="text-xs text-slate-400" htmlFor="library-search">
          搜索素材
        </Label>
        <Input
          id="library-search"
          value={searchText}
          onChange={(event) => setSearchText(event.target.value)}
          placeholder="输入文件名关键词"
        />
      </div>
      <div className="space-y-2">
        <Label className="text-xs text-slate-400">按分组筛选</Label>
        <Select value={selectedGroup} onValueChange={setSelectedGroup}>
          <SelectTrigger>
            <SelectValue placeholder="全部分组" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部分组</SelectItem>
            {groupOptions.map((group) => (
              <SelectItem key={group} value={group}>
                {group}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          onClick={handleSelectFilteredAssets}
          disabled={filteredAssets.length === 0}
        >
          选择筛选结果
        </Button>
        <Button
          size="sm"
          variant="secondary"
          onClick={clearAssetSelection}
          disabled={selectedAssetIds.length === 0}
        >
          清空选择
        </Button>
      </div>
      <div className="space-y-2 text-xs text-slate-400">
        <div className="flex items-center justify-between">
          <span>已选素材</span>
          <span className="text-white">{selectedAssetIds.length} 张</span>
        </div>
        <div className="flex items-center justify-between">
          <span>本地占用</span>
          <span>{(totalSize / 1024 / 1024).toFixed(1)} MB</span>
        </div>
        <p
          className={cn(
            "min-h-[16px] text-amber-300",
            !selectionNotice && "opacity-0",
          )}
          role="status"
          aria-live="polite"
        >
          {selectionNotice ?? "占位"}
        </p>
      </div>

      <div
        className={cn(
          "space-y-2",
          compact
            ? "max-h-[45vh] overflow-y-auto"
            : "max-h-[50vh] overflow-y-auto",
        )}
      >
        {filteredAssets.length === 0 && (
          <div className="rounded-2xl border border-white/10 bg-slate-950/60 p-4 text-center text-xs text-slate-400">
            还没有素材，导入后显示在这里。
          </div>
        )}
        {filteredAssets.map((asset) => {
          const isSelected = selectedSet.has(asset.id);
          const isActive = asset.id === activeAssetId;
          return (
            <button
              key={asset.id}
              type="button"
              onClick={() => setActiveAssetId(asset.id)}
              className={cn(
                "flex w-full items-center gap-3 rounded-2xl border border-white/10 bg-slate-950/60 p-2 text-left transition",
                isActive && "border-sky-200/40 bg-sky-300/10",
              )}
            >
              <img
                src={asset.thumbnailUrl ?? asset.objectUrl}
                alt={asset.name}
                className="h-12 w-12 rounded-xl object-cover"
                loading="lazy"
              />
              <div className="min-w-0 flex-1 text-xs text-slate-300">
                <p className="font-medium text-slate-100 line-clamp-1">
                  {asset.name}
                </p>
                <p>分组：{asset.group ?? "未分组"}</p>
              </div>
              <label
                className="flex items-center gap-1 rounded-full border border-white/10 bg-slate-950/80 px-2 py-1 text-[10px] text-slate-200"
                onClick={(event) => event.stopPropagation()}
              >
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={() => handleToggleAssetSelection(asset.id)}
                  className="h-3 w-3 accent-sky-300"
                  aria-label={`选择 ${asset.name}`}
                />
                选中
              </label>
            </button>
          );
        })}
      </div>
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
      activeAsset,
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

      <Card className="animate-fade-up" style={{ animationDelay: "80ms" }}>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>素材一览</CardTitle>
          <Badge className="border-white/10 bg-white/5 text-slate-200">
            {filteredAssets.length} 张
          </Badge>
        </CardHeader>
        <CardContent>
          {filteredAssets.length === 0 ? (
            <div className="rounded-2xl border border-white/10 bg-slate-950/60 p-6 text-center text-sm text-slate-400">
              还没有素材，导入后显示在这里。
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {filteredAssets.slice(0, 9).map((asset) => {
                const isSelected = selectedSet.has(asset.id);
                return (
                  <div
                    key={asset.id}
                    className={cn(
                      "overflow-hidden rounded-2xl border border-white/10 bg-slate-950/60",
                      isSelected && "ring-2 ring-sky-200/40",
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => setActiveAssetId(asset.id)}
                      className="block w-full text-left"
                    >
                      <img
                        src={asset.thumbnailUrl ?? asset.objectUrl}
                        alt={asset.name}
                        className="h-40 w-full object-cover"
                        loading="lazy"
                      />
                    </button>
                    <div className="space-y-2 p-3 text-xs text-slate-300">
                      <p className="font-medium text-slate-100 line-clamp-1">
                        {asset.name}
                      </p>
                      <div className="flex items-center justify-between">
                        <label className="flex items-center gap-2 text-[11px] text-slate-300">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() =>
                              handleToggleAssetSelection(asset.id)
                            }
                            className="h-3 w-3 accent-sky-300"
                          />
                          选中
                        </label>
                        <Badge className="border-white/10 bg-white/5 text-slate-200">
                          {asset.group ?? "未分组"}
                        </Badge>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );

  const renderStyleStep = () => (
    <div className="space-y-6">
      <PreviewPanel />

      <Card className="animate-fade-up">
        <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle>AI 滤镜匹配</CardTitle>
          <Badge className="border-white/10 bg-white/5 text-slate-200">
            {aiProgress.running ? "识别中" : "已就绪"}
          </Badge>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-slate-300">
          <p>
            已处理 {aiProgress.processed}/
            {aiProgress.total || selectedAssets.length} 张， 成功{" "}
            {aiProgress.succeeded} 张，失败 {aiProgress.failed} 张。
          </p>
          <div className="rounded-full border border-white/10 bg-slate-950/60">
            <div
              className="h-2 rounded-full bg-sky-300 transition-all"
              style={{
                width:
                  aiProgress.total > 0
                    ? `${Math.round((aiProgress.processed / aiProgress.total) * 100)}%`
                    : "0%",
              }}
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              variant="secondary"
              onClick={handleRetryFailedRecommendations}
              disabled={aiProgress.running || failedAiAssets.length === 0}
            >
              重试失败项
            </Button>
            {failedAiAssets.length > 0 && (
              <span className="text-xs text-amber-300">
                当前有 {failedAiAssets.length} 张失败，重试前不会改动原设置。
              </span>
            )}
          </div>
        </CardContent>
      </Card>

      <Card className="animate-fade-up" style={{ animationDelay: "80ms" }}>
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
              <LibraryPanel />
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
          <LibraryPanel compact />
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
