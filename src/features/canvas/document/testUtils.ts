import { createDefaultCanvasImageRenderState } from "@/render/image";
import type {
  CanvasGroupNode,
  CanvasImageElement,
  CanvasNode,
  CanvasNodeId,
  CanvasShapeElement,
  CanvasWorkbench,
} from "@/types";
import { normalizeCanvasWorkbench } from "../studioPresets";

export const createShapeNode = ({
  id,
  parentId = null,
  x,
  y,
  width = 120,
  height = 80,
  rotation = 0,
  opacity = 1,
  locked = false,
  visible = true,
}: {
  id: CanvasNodeId;
  parentId?: CanvasNodeId | null;
  x: number;
  y: number;
  width?: number;
  height?: number;
  rotation?: number;
  opacity?: number;
  locked?: boolean;
  visible?: boolean;
}): CanvasShapeElement => ({
  id,
  type: "shape",
  parentId,
  transform: {
    x,
    y,
    width,
    height,
    rotation,
  },
  opacity,
  locked,
  visible,
  shapeType: "rect",
  fill: "#ffffff",
  stroke: "#111111",
  strokeWidth: 1,
});

export const createImageNode = ({
  assetId = "asset-1",
  renderState,
  id,
  parentId = null,
  x,
  y,
  width = 120,
  height = 80,
  rotation = 0,
  opacity = 1,
  locked = false,
  visible = true,
}: {
  assetId?: string;
  renderState?: CanvasImageElement["renderState"];
  id: CanvasNodeId;
  parentId?: CanvasNodeId | null;
  x: number;
  y: number;
  width?: number;
  height?: number;
  rotation?: number;
  opacity?: number;
  locked?: boolean;
  visible?: boolean;
}): CanvasImageElement => ({
  id,
  type: "image",
  parentId,
  assetId,
  transform: {
    x,
    y,
    width,
    height,
    rotation,
  },
  opacity,
  locked,
  visible,
  renderState: renderState ?? createDefaultCanvasImageRenderState(),
});

export const createGroupNode = ({
  id,
  parentId = null,
  childIds = [],
  x,
  y,
  width = 1,
  height = 1,
  rotation = 0,
  opacity = 1,
  locked = false,
  visible = true,
  name = "Group",
}: {
  id: CanvasNodeId;
  parentId?: CanvasNodeId | null;
  childIds?: CanvasNodeId[];
  x: number;
  y: number;
  width?: number;
  height?: number;
  rotation?: number;
  opacity?: number;
  locked?: boolean;
  visible?: boolean;
  name?: string;
}): CanvasGroupNode => ({
  id,
  type: "group",
  parentId,
  transform: {
    x,
    y,
    width,
    height,
    rotation,
  },
  opacity,
  locked,
  visible,
  childIds,
  name,
});

export const createCanvasTestDocument = ({
  nodes,
  rootIds,
}: {
  nodes: Record<string, CanvasNode>;
  rootIds: CanvasNodeId[];
}): CanvasWorkbench =>
  normalizeCanvasWorkbench({
    id: "doc-1",
    version: 5,
    name: "Workbench",
    width: 1200,
    height: 900,
    presetId: "custom",
    backgroundColor: "#000000",
    nodes,
    rootIds,
    slices: [],
    guides: {
      showCenter: false,
      showThirds: false,
      showSafeArea: false,
    },
    safeArea: {
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
    },
    createdAt: "2026-03-17T00:00:00.000Z",
    updatedAt: "2026-03-17T00:00:00.000Z",
  });
