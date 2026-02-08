import { featureFlags } from "@/lib/features";
import type {
  ExportWorkerOutputMessage,
  ExportWorkerPayload,
} from "./exportWorker.types";

export const isWorkerExportSupported = () =>
  featureFlags.enableWorkerExport &&
  typeof Worker !== "undefined" &&
  typeof OffscreenCanvas !== "undefined" &&
  typeof createImageBitmap === "function";

export const renderExportInWorker = (
  payload: ExportWorkerPayload,
  onProgress?: (progress: number) => void
) =>
  new Promise<Blob>((resolve, reject) => {
    const worker = new Worker(new URL("./export.worker.ts", import.meta.url), {
      type: "module",
    });

    const cleanup = () => {
      worker.terminate();
    };

    worker.onmessage = (event: MessageEvent<ExportWorkerOutputMessage>) => {
      const message = event.data;
      if (!message || message.taskId !== payload.taskId) {
        return;
      }
      if (message.type === "progress") {
        onProgress?.(message.progress);
        return;
      }
      if (message.type === "result") {
        onProgress?.(100);
        cleanup();
        resolve(message.blob);
        return;
      }
      if (message.type === "error") {
        cleanup();
        reject(new Error(message.message));
      }
    };

    worker.onerror = (event) => {
      cleanup();
      reject(new Error(event.message || "Worker export crashed."));
    };

    worker.postMessage({
      type: "start",
      payload,
    });
  });

