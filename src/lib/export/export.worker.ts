/// <reference lib="webworker" />

import { applyFilmPipeline, ensureFilmProfile } from "@/lib/film";
import { resolveLutAsset } from "@/lib/lut";
import type { EditingAdjustments } from "@/types";
import type {
  ExportWorkerInputMessage,
  ExportWorkerOutputMessage,
  ExportWorkerPayload,
} from "./exportWorker.types";

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

const parseAspectRatio = (
  value: EditingAdjustments["aspectRatio"],
  fallback?: number
) => {
  if (value === "original") {
    return fallback ?? 1;
  }
  const [w, h] = value.split(":").map(Number);
  if (!w || !h) {
    return fallback ?? 1;
  }
  return w / h;
};

const resolveTransform = (adjustments: EditingAdjustments, width: number, height: number) => {
  const scale = clamp(adjustments.scale / 100, 0.7, 1.3);
  const translateX = clamp(adjustments.horizontal / 5, -20, 20);
  const translateY = clamp(adjustments.vertical / 5, -20, 20);
  const flipHorizontal = adjustments.flipHorizontal ? -1 : 1;
  const flipVertical = adjustments.flipVertical ? -1 : 1;
  return {
    scale,
    rotate: (adjustments.rotate * Math.PI) / 180,
    translateX: (translateX / 100) * width,
    translateY: (translateY / 100) * height,
    flipHorizontal,
    flipVertical,
  };
};

const post = (message: ExportWorkerOutputMessage) => {
  self.postMessage(message);
};

const runExport = async (payload: ExportWorkerPayload) => {
  if (payload.renderer === "webgl2") {
    throw new Error("WebGL2 rendering is not supported inside export worker.");
  }
  if (typeof OffscreenCanvas === "undefined") {
    throw new Error("OffscreenCanvas is not available.");
  }
  post({ type: "start", taskId: payload.taskId });

  post({ type: "progress", taskId: payload.taskId, stage: "decode", progress: 10 });
  const bitmap = await createImageBitmap(payload.source, { imageOrientation: "from-image" });
  const fallbackRatio = bitmap.width / Math.max(1, bitmap.height);
  const targetRatio = parseAspectRatio(payload.adjustments.aspectRatio, fallbackRatio);
  const sourceRatio = bitmap.width / Math.max(1, bitmap.height);

  let cropWidth = bitmap.width;
  let cropHeight = bitmap.height;
  if (Math.abs(sourceRatio - targetRatio) > 0.001) {
    if (sourceRatio > targetRatio) {
      cropWidth = bitmap.height * targetRatio;
    } else {
      cropHeight = bitmap.width / targetRatio;
    }
  }

  const cropX = (bitmap.width - cropWidth) / 2;
  const cropY = (bitmap.height - cropHeight) / 2;
  let outputWidth = cropWidth;
  let outputHeight = cropHeight;
  if (payload.maxDimension) {
    const scale = Math.min(1, payload.maxDimension / Math.max(cropWidth, cropHeight));
    outputWidth = Math.max(1, Math.round(cropWidth * scale));
    outputHeight = Math.max(1, Math.round(cropHeight * scale));
  }

  const canvas = new OffscreenCanvas(Math.max(1, Math.round(outputWidth)), Math.max(1, Math.round(outputHeight)));
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) {
    bitmap.close();
    throw new Error("Failed to create 2D context.");
  }

  context.clearRect(0, 0, canvas.width, canvas.height);
  context.imageSmoothingQuality = "high";
  const transform = resolveTransform(payload.adjustments, canvas.width, canvas.height);
  context.save();
  context.translate(canvas.width / 2 + transform.translateX, canvas.height / 2 + transform.translateY);
  context.rotate(transform.rotate);
  context.scale(
    transform.scale * transform.flipHorizontal,
    transform.scale * transform.flipVertical
  );
  context.drawImage(
    bitmap,
    cropX,
    cropY,
    cropWidth,
    cropHeight,
    -canvas.width / 2,
    -canvas.height / 2,
    canvas.width,
    canvas.height
  );
  context.restore();
  bitmap.close();

  post({ type: "progress", taskId: payload.taskId, stage: "render", progress: 60 });
  const profile = ensureFilmProfile(payload.filmProfile);
  const colorModule = profile.modules.find((module) => module.id === "colorScience");
  const lutAsset = await resolveLutAsset(colorModule?.params.lutAssetId);
  const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
  applyFilmPipeline(imageData, profile, {
    seedKey: payload.seedKey,
    seedSalt: payload.seedSalt,
    renderSeed: payload.exportSeed ?? Date.now(),
    exportSeed: payload.exportSeed ?? Date.now(),
    lutAsset,
  });
  context.putImageData(imageData, 0, 0);

  post({ type: "progress", taskId: payload.taskId, stage: "encode", progress: 90 });
  const blob = await canvas.convertToBlob({
    type: payload.outputType,
    quality: payload.quality,
  });
  post({ type: "result", taskId: payload.taskId, blob });
};

self.addEventListener("message", (event: MessageEvent<ExportWorkerInputMessage>) => {
  const message = event.data;
  if (!message || message.type !== "start") {
    return;
  }
  void runExport(message.payload).catch((error) => {
    post({
      type: "error",
      taskId: message.payload.taskId,
      message: error instanceof Error ? error.message : "Worker export failed.",
    });
  });
});

