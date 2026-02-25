import { useMemo, useState } from "react";
import { renderImageToBlob } from "@/lib/imageProcessing";
import { resolveExportConcurrency } from "@/lib/renderer/config";
import { resolveAssetTimestampText } from "@/lib/timestamp";
import type {
  EditingAdjustments,
  FilmProfile,
  FilmProfileOverrides,
  AssetMetadata,
  Preset,
} from "@/types";
import type { ExportPreviewItem, ExportTask } from "../types";
import { resolveAdjustments, resolveFilmProfile } from "../utils";
import {
  downloadBlob,
  openExportDirectory,
  supportsDirectoryExport,
  toUniqueFileName,
  writeBlobToDirectory,
  type DirectoryHandleLike,
  type ExportFeedback,
} from "./exportHelpers";

interface ExportableAsset {
  id: string;
  name: string;
  type: string;
  blob?: Blob | null;
  objectUrl: string;
  thumbnailUrl?: string | null;
  adjustments?: EditingAdjustments;
  presetId?: string;
  intensity?: number;
  filmProfileId?: string;
  filmProfile?: FilmProfile;
  filmOverrides?: FilmProfileOverrides;
  metadata?: AssetMetadata;
  createdAt?: string;
}

interface UseExportOptions {
  assets: ExportableAsset[];
  allPresets: Preset[];
  activeAssetId: string | null;
  format: "original" | "jpeg" | "png";
  quality: number;
  maxDimension: number;
}

export function useExport({
  assets,
  allPresets,
  activeAssetId,
  format,
  quality,
  maxDimension,
}: UseExportOptions) {
  const [tasks, setTasks] = useState<ExportTask[]>([]);
  const [exportFeedback, setExportFeedback] = useState<ExportFeedback | null>(null);

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
    setExportFeedback(null);
    const canPickDirectory = supportsDirectoryExport();
    let directoryHandle: DirectoryHandleLike | null = null;
    if (canPickDirectory) {
      try {
        directoryHandle = await openExportDirectory();
      } catch {
        setExportFeedback({
          kind: "error",
          title: "导出失败",
          detail: "无法访问所选文件夹，请重试。",
        });
        return;
      }
      if (!directoryHandle) {
        return;
      }
    }
    const newTasks = assets.map((asset) => ({
      id: asset.id,
      name: asset.name,
      status: "等待" as const,
    }));
    setTasks(newTasks);
    let successCount = 0;
    let failedCount = 0;
    const usedFileNames = new Set<string>();

    const EXPORT_CONCURRENCY = resolveExportConcurrency();
    let nextIndex = 0;

    const processAsset = async (asset: ExportableAsset, workerIndex: number) => {
      setTasks((prev) =>
        prev.map((item) => (item.id === asset.id ? { ...item, status: "处理中" } : item))
      );
      try {
        if (!asset?.blob) {
          throw new Error("缺少原图数据");
        }
        const adjustments = resolveAdjustments(
          asset.adjustments,
          asset.presetId,
          asset.intensity,
          allPresets
        );
        const filmProfile = resolveFilmProfile(
          adjustments,
          asset.presetId,
          asset.filmProfileId,
          asset.filmProfile,
          asset.intensity,
          allPresets,
          asset.filmOverrides
        );
        const outputType = resolveOutputType(asset.type);
        const blob = await renderImageToBlob(asset.blob, adjustments, {
          type: outputType,
          quality: quality / 100,
          maxDimension: maxDimension > 0 ? maxDimension : undefined,
          filmProfile: filmProfile ?? undefined,
          timestampText: resolveAssetTimestampText(asset.metadata, asset.createdAt),
          seedKey: asset.id,
          renderSlot: `export-slot-${workerIndex}`,
        });
        const outputFileName = toUniqueFileName(
          buildDownloadName(asset.name, outputType),
          usedFileNames
        );
        if (directoryHandle) {
          await writeBlobToDirectory(directoryHandle, outputFileName, blob);
        } else {
          downloadBlob(blob, outputFileName);
        }
        successCount += 1;
        setTasks((prev) =>
          prev.map((item) => (item.id === asset.id ? { ...item, status: "完成" } : item))
        );
      } catch {
        failedCount += 1;
        setTasks((prev) =>
          prev.map((item) => (item.id === asset.id ? { ...item, status: "失败" } : item))
        );
      }
    };

    const workers = Array.from({ length: Math.min(EXPORT_CONCURRENCY, assets.length) }, (_, index) =>
      (async () => {
        while (true) {
          const asset = assets[nextIndex];
          nextIndex += 1;
          if (!asset) {
            return;
          }
          await processAsset(asset, index);
        }
      })()
    );

    await Promise.all(workers);

    if (failedCount === 0) {
      setExportFeedback({
        kind: "success",
        title: "导出完成",
        detail: `成功导出 ${successCount} 张图片。`,
      });
      return;
    }

    if (successCount === 0) {
      setExportFeedback({
        kind: "error",
        title: "导出失败",
        detail: "所有图片导出失败，请调整参数后重试。",
      });
      return;
    }

    setExportFeedback({
      kind: "mixed",
      title: "导出已完成（部分失败）",
      detail: `成功 ${successCount} 张，失败 ${failedCount} 张。`,
    });
  };

  const completedCount = tasks.filter((task) => task.status === "完成").length;
  const progress = tasks.length > 0 ? Math.round((completedCount / tasks.length) * 100) : 0;
  const isExporting = tasks.some((task) => task.status === "处理中");
  const taskStatusById = useMemo(
    () => new Map(tasks.map((task) => [task.id, task.status])),
    [tasks]
  );
  const exportPreviewItems = useMemo<ExportPreviewItem[]>(
    () =>
      assets.map((asset) => ({
        assetId: asset.id,
        name: asset.name,
        thumbnailUrl: asset.thumbnailUrl ?? asset.objectUrl,
        status: taskStatusById.get(asset.id) ?? "未开始",
        isActive: asset.id === activeAssetId,
      })),
    [activeAssetId, assets, taskStatusById]
  );

  const dismissExportFeedback = () => {
    setExportFeedback(null);
  };

  return {
    tasks,
    setTasks,
    exportPreviewItems,
    exportFeedback,
    handleExportAll,
    completedCount,
    progress,
    isExporting,
    dismissExportFeedback,
  };
}

