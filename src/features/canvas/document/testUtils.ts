import type { CanvasDocument, CanvasGroupNode, CanvasNode, CanvasNodeId, CanvasShapeElement } from "@/types";
import { normalizeCanvasDocument } from "../studioPresets";

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
  x,
  y,
  width,
  height,
  rotation,
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
  x,
  y,
  width,
  height,
  rotation,
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
}): CanvasDocument =>
  normalizeCanvasDocument({
    id: "doc-1",
    version: 2,
    name: "Board",
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
