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
import { normalizeAdjustments } from "@/lib/adjustments";
import { resolveLayerAdjustments } from "@/lib/editorLayers";
import { renderImageToCanvas } from "@/lib/imageProcessing";
import { applyMaskToLayerCanvas, generateMaskTexture } from "@/lib/layerMaskTexture";
import { resolveAssetTimestampText } from "@/lib/timestamp";
import { copyJpegExif } from "@/lib/export/jpegExif";
import { encodeRgbaToTiff } from "@/lib/export/tiff";
import type {
  Asset,
  EditingAdjustments,
  EditorLayerBlendMode,
  ExportColorSpace,
  ExportFormat,
  ExportMetadataMode,
  ExportResolutionPreset,
} from "@/types";
import { EditorSliderRow } from "./EditorSliderRow";
import { useEditorState } from "./useEditorState";

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

const resolveLayerBlendOperation = (
  blendMode: EditorLayerBlendMode
): GlobalCompositeOperation => {
  if (blendMode === "multiply") {
    return "multiply";
  }
  if (blendMode === "screen") {
    return "screen";
  }
  if (blendMode === "overlay") {
    return "overlay";
  }
  if (blendMode === "softLight") {
    return "soft-light";
  }
  return "source-over";
};

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
  const {
    assets,
    selectedAsset,
    layers,
    adjustments,
    previewAdjustments,
    previewFilmProfile,
  } = useEditorState();
  const [format, setFormat] = useState<ExportFormat>("jpeg");
  const [quality, setQuality] = useState(92);
  const [pngCompression, setPngCompression] = useState(6);
  const [resolutionPreset, setResolutionPreset] = useState<ExportResolutionPreset>("original");
  const [customWidth, setCustomWidth] = useState(0);
  const [customHeight, setCustomHeight] = useState(0);
  const [colorSpace, setColorSpace] = useState<ExportColorSpace>("srgb");
  const [metadataMode, setMetadataMode] = useState<ExportMetadataMode>("strip");
  const [isExporting, setIsExporting] = useState(false);
  const [isExportingLut, setIsExportingLut] = useState(false);
  const [cubeLutSize, setCubeLutSize] = useState<CubeLutSize>(33);

  const activeAdjustments = (previewAdjustments ?? adjustments) as EditingAdjustments | null;

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

  const assetById = useMemo(() => new Map(assets.map((asset) => [asset.id, asset])), [assets]);

  const exportLayers = useMemo(
    () => {
      if (!selectedAsset) {
        return [];
      }
      return layers
        .map((layer) => {
          const sourceAsset =
            layer.type === "texture" && layer.textureAssetId
              ? assetById.get(layer.textureAssetId) ?? null
              : selectedAsset;
          if (!sourceAsset || !layer.visible) {
            return null;
          }
          const opacity = Math.max(0, Math.min(1, layer.opacity / 100));
          if (opacity <= 0.0001) {
            return null;
          }
          return {
            layer,
            sourceAsset,
            opacity,
            blendMode: layer.blendMode,
            adjustments: resolveLayerAdjustments(layer, selectedAsset.adjustments),
          };
        })
        .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));
    },
    [assetById, layers, selectedAsset]
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

      const timestampText = resolveAssetTimestampText(selectedAsset.metadata, selectedAsset.createdAt);
      const shouldCompositeExport = exportLayers.length > 1;

      if (shouldCompositeExport) {
        const compositeCanvas = document.createElement("canvas");
        compositeCanvas.width = targetSize.width;
        compositeCanvas.height = targetSize.height;
        const compositeContext = compositeCanvas.getContext("2d", { willReadFrequently: true });
        if (!compositeContext) {
          throw new Error("Failed to initialize composite export context.");
        }
        compositeContext.clearRect(0, 0, compositeCanvas.width, compositeCanvas.height);

        const layerCanvas = document.createElement("canvas");
        const layerMaskCanvas = document.createElement("canvas");
        const layerMaskScratchCanvas = document.createElement("canvas");
        const maskedLayerCanvas = document.createElement("canvas");
        const sourceBlobCache = new Map<string, Blob>();
        const layersBottomToTop = [...exportLayers].reverse();
        for (let layerIndex = 0; layerIndex < layersBottomToTop.length; layerIndex += 1) {
          const layer = layersBottomToTop[layerIndex]!;
          let layerSourceBlob = sourceBlobCache.get(layer.sourceAsset.id);
          if (!layerSourceBlob) {
            layerSourceBlob = await resolveAssetSourceBlob(layer.sourceAsset);
            sourceBlobCache.set(layer.sourceAsset.id, layerSourceBlob);
          }
          const layerAdjustments = normalizeAdjustments(layer.adjustments);
          const layerFilmProfile =
            layer.sourceAsset.id === selectedAsset.id
              ? previewFilmProfile ?? layer.sourceAsset.filmProfile
              : layer.sourceAsset.filmProfile;

          await renderImageToCanvas({
            canvas: layerCanvas,
            source: layerSourceBlob,
            adjustments: layerAdjustments,
            filmProfile: layerFilmProfile ?? undefined,
            timestampText: null,
            targetSize,
            seedKey: `${selectedAsset.id}:${layer.layer.id}`,
            sourceCacheKey: `export:${layer.sourceAsset.id}:${layer.layer.id}:${layer.sourceAsset.size}`,
            mode: "export",
            qualityProfile: "full",
            strictErrors: true,
            renderSlot: `export-panel:layer:${layer.layer.id}:${layerIndex}`,
          });

          let drawSource: CanvasImageSource = layerCanvas;
          if (layer.layer.mask) {
            const generatedMask = generateMaskTexture(layer.layer.mask, {
              width: compositeCanvas.width,
              height: compositeCanvas.height,
              referenceSource: layerCanvas,
              targetCanvas: layerMaskCanvas,
              scratchCanvas: layerMaskScratchCanvas,
            });
            if (generatedMask) {
              drawSource = applyMaskToLayerCanvas(layerCanvas, generatedMask, maskedLayerCanvas);
            }
          }

          compositeContext.save();
          compositeContext.globalAlpha = layer.opacity;
          compositeContext.globalCompositeOperation = resolveLayerBlendOperation(layer.blendMode);
          compositeContext.drawImage(drawSource, 0, 0, compositeCanvas.width, compositeCanvas.height);
          compositeContext.restore();
        }

        if (renderCanvas.width !== compositeCanvas.width || renderCanvas.height !== compositeCanvas.height) {
          renderCanvas.width = compositeCanvas.width;
          renderCanvas.height = compositeCanvas.height;
        }
        const renderContext = renderCanvas.getContext("2d", { willReadFrequently: true });
        if (!renderContext) {
          throw new Error("Failed to initialize final export context.");
        }
        renderContext.clearRect(0, 0, renderCanvas.width, renderCanvas.height);
        renderContext.drawImage(compositeCanvas, 0, 0, renderCanvas.width, renderCanvas.height);
        layerCanvas.width = 0;
        layerCanvas.height = 0;
        layerMaskCanvas.width = 0;
        layerMaskCanvas.height = 0;
        layerMaskScratchCanvas.width = 0;
        layerMaskScratchCanvas.height = 0;
        maskedLayerCanvas.width = 0;
        maskedLayerCanvas.height = 0;
        compositeCanvas.width = 0;
        compositeCanvas.height = 0;
      } else {
        await renderImageToCanvas({
          canvas: renderCanvas,
          source: sourceBlob,
          adjustments: activeAdjustments,
          filmProfile: previewFilmProfile ?? undefined,
          timestampText,
          targetSize,
          seedKey: selectedAsset.id,
          sourceCacheKey: `export:${selectedAsset.id}:${selectedAsset.size}`,
          mode: "export",
          qualityProfile: "full",
          strictErrors: true,
          renderSlot: `export-panel:${selectedAsset.id}`,
        });
      }

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
      } else if (colorSpace !== "srgb") {
        console.warn("Current renderer outputs sRGB; custom color space is a UI preference.");
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
          <Select value={colorSpace} onValueChange={(value: ExportColorSpace) => setColorSpace(value)}>
            <SelectTrigger className="h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="srgb">sRGB</SelectItem>
              <SelectItem value="display-p3">Display P3</SelectItem>
              <SelectItem value="adobe-rgb">Adobe RGB</SelectItem>
            </SelectContent>
          </Select>
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
