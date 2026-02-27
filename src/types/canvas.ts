import type { EditingAdjustments } from "./index";

export type CanvasElementType = "image" | "text" | "shape";

export interface CanvasElementBase {
  id: string;
  type: CanvasElementType;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  opacity: number;
  locked: boolean;
  visible: boolean;
  zIndex: number;
}

export interface CanvasImageElement extends CanvasElementBase {
  type: "image";
  assetId: string;
  filmProfileId?: string;
  adjustments?: EditingAdjustments;
}

export interface CanvasTextElement extends CanvasElementBase {
  type: "text";
  content: string;
  fontFamily: string;
  fontSize: number;
  color: string;
  textAlign: "left" | "center" | "right";
}

export interface CanvasShapeElement extends CanvasElementBase {
  type: "shape";
  shape: "rect" | "circle" | "line";
  fill: string;
  stroke?: string;
  strokeWidth?: number;
}

export type CanvasElement = CanvasImageElement | CanvasTextElement | CanvasShapeElement;

export interface CanvasDocument {
  id: string;
  name: string;
  width: number;
  height: number;
  backgroundColor: string;
  elements: CanvasElement[];
  createdAt: string;
  updatedAt: string;
  thumbnailBlob?: Blob;
}
