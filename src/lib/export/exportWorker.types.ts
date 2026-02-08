import type { EditingAdjustments, FilmProfile } from "@/types";

export type ExportRendererMode = "auto" | "webgl2" | "cpu";

export interface ExportWorkerPayload {
  taskId: string;
  source: Blob;
  outputType: string;
  quality: number;
  maxDimension?: number;
  adjustments: EditingAdjustments;
  filmProfile: FilmProfile;
  seedKey?: string;
  seedSalt?: number;
  exportSeed?: number;
  renderer?: ExportRendererMode;
}

export interface ExportWorkerStartMessage {
  type: "start";
  payload: ExportWorkerPayload;
}

export type ExportWorkerInputMessage = ExportWorkerStartMessage;

export interface ExportWorkerStartEvent {
  type: "start";
  taskId: string;
}

export interface ExportWorkerProgressEvent {
  type: "progress";
  taskId: string;
  progress: number;
  stage: "decode" | "render" | "encode";
}

export interface ExportWorkerResultEvent {
  type: "result";
  taskId: string;
  blob: Blob;
}

export interface ExportWorkerErrorEvent {
  type: "error";
  taskId: string;
  message: string;
}

export type ExportWorkerOutputMessage =
  | ExportWorkerStartEvent
  | ExportWorkerProgressEvent
  | ExportWorkerResultEvent
  | ExportWorkerErrorEvent;

