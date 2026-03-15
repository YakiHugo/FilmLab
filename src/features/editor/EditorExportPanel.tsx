import { useEffect, useMemo, useState } from "react";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { copyJpegExif } from "@/lib/export/jpegExif";
import { encodeRgbaToTiff } from "@/lib/export/tiff";
import { ensureAssetLayers } from "@/lib/editorLayers";
import { resolveAssetTimestampText } from "@/lib/timestamp";
import type {
  Asset,
  EditingAdjustments,
  ExportFormat,
  ExportMetadataMode,
  ExportResolutionPreset,
} from "@/types";
import { EditorSliderRow } from "./EditorSliderRow";
import { createRenderDocument } from "./document";
import { renderDocumentToCanvas } from "./renderDocumentCanvas";
import {
  useEditorAdjustmentState,
  useEditorDocumentState,
  useEditorSelectionState,
} from "./useEditorSlices";

interface ExportFormatOption {
  id: ExportFormat;
  label: string;
  mimeType: string;
  extension: string;
}

const EXPORT_FORMATS: ExportFormatOption[] = [
  { id: "jpeg", label: "JPEG", mimeType: "image/jpeg", extension: "jpg" },
  { id: "png", label: "PNG", mimeType: "image/png", extension: "png" },
  { id: "tiff", label: "TIFF", mimeType: "image/tiff", extension: "tiff" },
  { id: "webp", label: "WebP", mimeType: "image/webp", extension: "webp" },
];

type CubeLutSize = 17 | 33;

const CUBE_LUT_OPTIONS: ReadonlyArray<{ label: string; value: CubeLutSize }> = [
  { label: "17 (Fast)", value: 17 },
  { label: "33 (High Quality)", value: 33 },
];

const clampInt = (value: number, min: number, max: number) => Math.min(max, Math.max(min, Math.round(value)));

const canvasToBlob = (canvas: HTMLCanvasElement, type: string, quality?: number) =>
  new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error("Failed to encode export image."));
          return;
        }
        resolve(blob);
      },
      type,
      quality
    );
  });

const resolveAssetSourceBlob = async (asset: Asset) => {
  if (asset.blob) {
    return asset.blob;
  }
  const response = await fetch(asset.objectUrl);
  if (!response.ok) {
    throw new Error("Failed to load source asset blob.");
  }
  return response.blob();
};

const resolveSourceSize = async (sourceBlob: Blob, fallback: { width: number; height: number }) => {
  if (typeof createImageBitmap !== "function") {
    return fallback;
  }
  const bitmap = await createImageBitmap(sourceBlob, { imageOrientation: "from-image" });
  try {
    return {
      width: bitmap.width,
      height: bitmap.height,
    };
  } finally {
    bitmap.close();
  }
};

const resolveBaseName = (fileName: string) => fileName.replace(/\.[^/.]+$/, "");

const resolveTargetSize = (
  source: { width: number; height: number },
  preset: ExportResolutionPreset,
  custom: { width: number; height: number }
) => {
  if (preset === "half") {
    return { width: clampInt(source.width * 0.5, 1, 16384), height: clampInt(source.height * 0.5, 1, 16384) };
  }
  if (preset === "quarter") {
    return { width: clampInt(source.width * 0.25, 1, 16384), height: clampInt(source.height * 0.25, 1, 16384) };
  }
  if (preset === "custom") {
    return {
      width: clampInt(custom.width, 1, 16384),
      height: clampInt(custom.height, 1, 16384),
    };
  }
  return source;
};

export function EditorExportPanel() {
  const { selectedAsset } = useEditorSelectionState();
  const { adjustments, renderAdjustments, previewFilmProfile } = useEditorAdjustmentState();
  const { exportRenderDocument } = useEditorDocumentState();
  const [format, setFormat] = useState<ExportFormat>("jpeg");
  const [quality, setQuality] = useState(92);
  const [pngCompression, setPngCompression] = useState(6);
  const [resolutionPreset, setResolutionPreset] = useState<ExportResolutionPreset>("original");
  const [customWidth, setCustomWidth] = useState(0);
  const [customHeight, setCustomHeight] = useState(0);
  const [metadataMode, setMetadataMode] = useState<ExportMetadataMode>("strip");
  const [isExporting, setIsExporting] = useState(false);
  const [isExportingLut, setIsExportingLut] = useState(false);
  const [cubeLutSize, setCubeLutSize] = useState<CubeLutSize>(33);

  const activeAdjustments = (renderAdjustments ?? adjustments) as EditingAdjustments | null;

  useEffect(() => {
    if (!selectedAsset) {
      return;
    }
    const width = selectedAsset.metadata?.width ?? 0;
    const height = selectedAsset.metadata?.height ?? 0;
    if (width > 0 && height > 0) {
      setCustomWidth(width);
      setCustomHeight(height);
    }
  }, [selectedAsset]);

  const selectedFormat = useMemo(
    () => EXPORT_FORMATS.find((item) => item.id === format) ?? EXPORT_FORMATS[0]!,
    [format]
  );

  const canExportImage = Boolean(selectedAsset && activeAdjustments && !isExporting && !isExportingLut);
  const canExportCubeLut = Boolean(selectedAsset && activeAdjustments && !isExporting && !isExportingLut);

  const handleExport = async () => {
    if (!selectedAsset || !activeAdjustments) {
      return;
    }

    setIsExporting(true);

    const renderCanvas = document.createElement("canvas");

    try {
      const sourceBlob = await resolveAssetSourceBlob(selectedAsset);
      const sourceSize = await resolveSourceSize(sourceBlob, {
        width: selectedAsset.metadata?.width ?? 1,
        height: selectedAsset.metadata?.height ?? 1,
      });
      const targetSize = resolveTargetSize(sourceSize, resolutionPreset, {
        width: customWidth || sourceSize.width,
        height: customHeight || sourceSize.height,
      });

      const timestampText = resolveAssetTimestampText(
        selectedAsset.metadata,
        selectedAsset.createdAt
      );

      await renderDocumentToCanvas({
        canvas: renderCanvas,
        document:
          exportRenderDocument ??
          createRenderDocument({
            key: `editor:${selectedAsset.id}:export-fallback`,
            assetById: new Map([[selectedAsset.id, selectedAsset]]),
            documentAsset: selectedAsset,
            layers: ensureAssetLayers(selectedAsset),
            adjustments: activeAdjustments,
            filmProfile: previewFilmProfile ?? selectedAsset.filmProfile ?? undefined,
            showOriginal: false,
          }),
        intent: "export-full",
        targetSize,
        timestampText,
        strictErrors: true,
      });

      let blob: Blob;
      if (format === "tiff") {
        const context = renderCanvas.getContext("2d", { willReadFrequently: true });
        if (!context) {
          throw new Error("Failed to read rendered pixels for TIFF export.");
        }
        const imageData = context.getImageData(0, 0, renderCanvas.width, renderCanvas.height);
        blob = encodeRgbaToTiff(imageData.data, renderCanvas.width, renderCanvas.height);
      } else {
        const qualityFactor =
          format === "jpeg" || format === "webp" ? Math.max(0.1, Math.min(1, quality / 100)) : undefined;
        blob = await canvasToBlob(renderCanvas, selectedFormat.mimeType, qualityFactor);
      }

      if (metadataMode === "preserve" && format === "jpeg") {
        blob = await copyJpegExif(sourceBlob, blob);
      }

      const fileBaseName = resolveBaseName(selectedAsset.name);
      const fileName = `${fileBaseName}-${renderCanvas.width}x${renderCanvas.height}.${selectedFormat.extension}`;
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = fileName;
      anchor.click();
      URL.revokeObjectURL(url);

      if (metadataMode === "preserve" && format !== "jpeg") {
        console.warn("Metadata preservation currently applies to JPEG only.");
      }
    } catch (error) {
      console.error("Export failed.", error);
    } finally {
      renderCanvas.width = 0;
      renderCanvas.height = 0;
      setIsExporting(false);
    }
  };

  const handleExportCubeLut = async () => {
    if (!selectedAsset || !activeAdjustments) {
      return;
    }

    setIsExportingLut(true);

    const [{ generateCubeLUT }, { PipelineRenderer }] = await Promise.all([
      import("@/lib/export/lutGenerator"),
      import("@/lib/renderer/PipelineRenderer"),
    ]);
    const lutCanvas = document.createElement("canvas");
    const renderer = new PipelineRenderer(lutCanvas, 1, 1, { label: "export" });

    try {
      const cubeText = await generateCubeLUT(
        renderer,
        activeAdjustments,
        previewFilmProfile ?? selectedAsset.filmProfile ?? null,
        cubeLutSize
      );

      const blob = new Blob([cubeText], { type: "text/plain;charset=utf-8" });
      const fileBaseName = resolveBaseName(selectedAsset.name);
      const fileName = `${fileBaseName}-lut-${cubeLutSize}.cube`;
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = fileName;
      anchor.click();
      URL.revokeObjectURL(url);

    } catch (error) {
      console.error("LUT export failed.", error);
    } finally {
      renderer.dispose();
      lutCanvas.width = 0;
      lutCanvas.height = 0;
      setIsExportingLut(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <p className="text-sm font-medium text-zinc-100">Export</p>
        <p className="text-xs text-zinc-400">
          Render current adjustments into JPEG, PNG, TIFF, or WebP.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-2">
          <p className="text-xs text-zinc-300">Format</p>
          <Select value={format} onValueChange={(value: ExportFormat) => setFormat(value)}>
            <SelectTrigger className="h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {EXPORT_FORMATS.map((option) => (
                <SelectItem key={option.id} value={option.id}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <p className="text-xs text-zinc-300">Resolution</p>
          <Select
            value={resolutionPreset}
            onValueChange={(value: ExportResolutionPreset) => setResolutionPreset(value)}
          >
            <SelectTrigger className="h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="original">Original</SelectItem>
              <SelectItem value="half">50%</SelectItem>
              <SelectItem value="quarter">25%</SelectItem>
              <SelectItem value="custom">Custom</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {resolutionPreset === "custom" && (
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="space-y-1 text-xs text-zinc-300">
            Width
            <input
              type="number"
              min={1}
              step={1}
              className="h-8 w-full rounded-md border border-white/10 bg-[#0f1114]/80 px-2 text-xs text-zinc-100"
              value={customWidth || ""}
              onChange={(event) => setCustomWidth(clampInt(Number(event.currentTarget.value) || 0, 0, 16384))}
            />
          </label>
          <label className="space-y-1 text-xs text-zinc-300">
            Height
            <input
              type="number"
              min={1}
              step={1}
              className="h-8 w-full rounded-md border border-white/10 bg-[#0f1114]/80 px-2 text-xs text-zinc-100"
              value={customHeight || ""}
              onChange={(event) =>
                setCustomHeight(clampInt(Number(event.currentTarget.value) || 0, 0, 16384))
              }
            />
          </label>
        </div>
      )}

      {(format === "jpeg" || format === "webp") && (
        <EditorSliderRow
          label="Quality"
          value={quality}
          min={10}
          max={100}
          step={1}
          format={(value) => `${Math.round(value)}%`}
          onChange={(value) => setQuality(Math.round(value))}
          onCommit={(value) => setQuality(Math.round(value))}
          onReset={() => setQuality(92)}
          defaultValue={92}
        />
      )}

      {format === "png" && (
        <EditorSliderRow
          label="Compression Level"
          value={pngCompression}
          min={0}
          max={9}
          step={1}
          onChange={(value) => setPngCompression(Math.round(value))}
          onCommit={(value) => setPngCompression(Math.round(value))}
          onReset={() => setPngCompression(6)}
          defaultValue={6}
        />
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-2">
          <p className="text-xs text-zinc-300">Color Space</p>
          <div className="flex h-8 items-center rounded-md border border-white/10 bg-[#0f1114]/80 px-2 text-xs text-zinc-200">
            sRGB
          </div>
          <p className="text-[11px] text-zinc-500">
            Export is currently locked to the renderer&apos;s real output transform.
          </p>
        </div>
        <div className="space-y-2">
          <p className="text-xs text-zinc-300">Metadata</p>
          <Select
            value={metadataMode}
            onValueChange={(value: ExportMetadataMode) => setMetadataMode(value)}
          >
            <SelectTrigger className="h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="strip">Strip Metadata</SelectItem>
              <SelectItem value="preserve">Preserve EXIF</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {format === "png" && (
        <p className="text-[11px] text-zinc-500">
          PNG compression is managed by browser encoder. The slider is kept for forward compatibility.
        </p>
      )}

      <Button
        type="button"
        className="w-full"
        disabled={!canExportImage}
        onClick={() => {
          void handleExport();
        }}
      >
        <Download className="h-4 w-4" />
        {isExporting ? "Exporting..." : `Export ${selectedFormat.label}`}
      </Button>

      <div className="space-y-2 rounded-lg border border-white/10 bg-white/5 p-2.5">
        <div className="space-y-1">
          <p className="text-xs font-medium text-zinc-100">LUT Export (.cube)</p>
          <p className="text-[11px] text-zinc-400">
            Export current global + film look as a 3D LUT.
          </p>
        </div>
        <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
          <Select value={`${cubeLutSize}`} onValueChange={(value) => setCubeLutSize(value === "17" ? 17 : 33)}>
            <SelectTrigger className="h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CUBE_LUT_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={`${option.value}`}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            type="button"
            variant="secondary"
            className="h-8"
            disabled={!canExportCubeLut}
            onClick={() => {
              void handleExportCubeLut();
            }}
          >
            {isExportingLut ? "Exporting LUT..." : "Export LUT"}
          </Button>
        </div>
      </div>

    </div>
  );
}
