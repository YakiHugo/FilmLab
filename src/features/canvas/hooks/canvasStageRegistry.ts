import type Konva from "konva";

let registeredStage: Konva.Stage | null = null;

export function registerCanvasStage(stage: Konva.Stage | null) {
  registeredStage = stage;
}

export function getRegisteredCanvasStage() {
  return registeredStage;
}
