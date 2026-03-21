import type { EditingAdjustments } from "./index";

export type CanvasNodeId = string;
export type CanvasNodeType = "group" | "image" | "text" | "shape";
export type CanvasElementType = Exclude<CanvasNodeType, "group">;
export type CanvasPresetId =
  | "social-square"
  | "social-portrait"
  | "social-story"
  | "social-landscape"
  | "custom";
export type CanvasTextFontSizeTier = "small" | "medium" | "large" | "xl";
export type CanvasShapeType = "rect" | "ellipse" | "line" | "arrow";

export interface CanvasSlice {
  id: string;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  order: number;
}

export interface CanvasGuideSettings {
  showCenter: boolean;
  showThirds: boolean;
  showSafeArea: boolean;
}

export interface CanvasSafeArea {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface CanvasNodeTransform {
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
}

export interface CanvasNodeBase {
  id: CanvasNodeId;
  type: CanvasNodeType;
  parentId: CanvasNodeId | null;
  transform: CanvasNodeTransform;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  zIndex?: number;
  opacity: number;
  locked: boolean;
  visible: boolean;
}

export interface CanvasGroupNode extends CanvasNodeBase {
  type: "group";
  childIds: CanvasNodeId[];
  name: string;
}

export interface CanvasImageElement extends CanvasNodeBase {
  type: "image";
  assetId: string;
  filmProfileId?: string;
  adjustments?: EditingAdjustments;
}

export interface CanvasTextElement extends CanvasNodeBase {
  type: "text";
  content: string;
  fontFamily: string;
  fontSize: number;
  fontSizeTier: CanvasTextFontSizeTier;
  color: string;
  textAlign: "left" | "center" | "right";
}

export interface CanvasShapePoint {
  x: number;
  y: number;
}

export interface CanvasShapeArrowHead {
  start: boolean;
  end: boolean;
}

export interface CanvasShapeElement extends CanvasNodeBase {
  type: "shape";
  shapeType: CanvasShapeType;
  fill: string;
  stroke: string;
  strokeWidth: number;
  radius?: number;
  points?: CanvasShapePoint[];
  arrowHead?: CanvasShapeArrowHead;
}

export type CanvasElement = CanvasImageElement | CanvasTextElement | CanvasShapeElement;
export type CanvasNode = CanvasGroupNode | CanvasElement;

export interface CanvasRenderableNodeBase {
  id: CanvasNodeId;
  type: CanvasNodeType;
  parentId: CanvasNodeId | null;
  depth: number;
  bounds: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  childIds: CanvasNodeId[];
  opacity: number;
  worldOpacity: number;
  locked: boolean;
  visible: boolean;
  effectiveLocked: boolean;
  effectiveVisible: boolean;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  zIndex?: number;
  transform: CanvasNodeTransform;
}

export interface CanvasRenderableGroupNode
  extends CanvasRenderableNodeBase,
    Omit<CanvasGroupNode, "childIds" | "transform"> {
  type: "group";
  childIds: CanvasNodeId[];
}

export interface CanvasRenderableImageElement
  extends CanvasRenderableNodeBase,
    Omit<CanvasImageElement, "transform"> {
  type: "image";
}

export interface CanvasRenderableTextElement
  extends CanvasRenderableNodeBase,
    Omit<CanvasTextElement, "transform"> {
  type: "text";
}

export interface CanvasRenderableShapeElement
  extends CanvasRenderableNodeBase,
    Omit<CanvasShapeElement, "transform"> {
  type: "shape";
}

export type CanvasRenderableElement =
  | CanvasRenderableImageElement
  | CanvasRenderableTextElement
  | CanvasRenderableShapeElement;
export type CanvasRenderableNode = CanvasRenderableGroupNode | CanvasRenderableElement;

export interface CanvasWorkbenchSnapshot {
  id: string;
  version: 2;
  ownerRef: {
    userId: string;
  };
  name: string;
  width: number;
  height: number;
  presetId: CanvasPresetId;
  backgroundColor: string;
  nodes: Record<string, CanvasNode>;
  rootIds: CanvasNodeId[];
  slices: CanvasSlice[];
  guides: CanvasGuideSettings;
  safeArea: CanvasSafeArea;
  createdAt: string;
  updatedAt: string;
  thumbnailBlob?: Blob;
}

export interface CanvasWorkbench extends CanvasWorkbenchSnapshot {
  allNodes: CanvasRenderableNode[];
  elements: CanvasRenderableElement[];
}

export type CanvasWorkbenchPatchOperation =
  | { type: "putNode"; node: CanvasNode }
  | { type: "deleteNode"; nodeId: CanvasNodeId }
  | { type: "setRootIds"; rootIds: CanvasNodeId[] }
  | {
      type: "patchDocument";
      fields: Partial<
        Pick<
          CanvasWorkbenchSnapshot,
          | "backgroundColor"
          | "guides"
          | "height"
          | "name"
          | "presetId"
          | "safeArea"
          | "slices"
          | "thumbnailBlob"
          | "updatedAt"
          | "width"
        >
      >;
    };

export interface CanvasWorkbenchPatch {
  operations: CanvasWorkbenchPatchOperation[];
}

export interface CanvasHistoryEntry {
  commandType: CanvasCommand["type"];
  forwardPatch: CanvasWorkbenchPatch;
  inversePatch: CanvasWorkbenchPatch;
}

export type CanvasNodePropertyPatch = Partial<
  Pick<CanvasNodeBase, "locked" | "opacity" | "visible">
> &
  Partial<CanvasNodeTransform> &
  Partial<
    Pick<CanvasGroupNode, "name"> &
      Pick<CanvasImageElement, "adjustments" | "filmProfileId"> &
      Pick<CanvasTextElement, "color" | "content" | "fontFamily" | "fontSize" | "fontSizeTier" | "textAlign"> &
      Pick<CanvasShapeElement, "arrowHead" | "fill" | "points" | "radius" | "shapeType" | "stroke" | "strokeWidth">
  >;

export type CanvasCommand =
  | {
      type: "PATCH_DOCUMENT";
      patch: Partial<
        Pick<
          CanvasWorkbenchSnapshot,
          | "backgroundColor"
          | "guides"
          | "height"
          | "name"
          | "presetId"
          | "safeArea"
          | "slices"
          | "thumbnailBlob"
          | "width"
        >
      >;
    }
  | {
      type: "INSERT_NODES";
      nodes: CanvasNode[];
      index?: number;
      parentId?: CanvasNodeId | null;
    }
  | {
      type: "UPDATE_NODE_PROPS";
      updates: Array<{
        id: CanvasNodeId;
        patch: CanvasNodePropertyPatch;
      }>;
    }
  | {
      type: "MOVE_NODES";
      dx: number;
      dy: number;
      ids: CanvasNodeId[];
    }
  | {
      type: "DELETE_NODES";
      ids: CanvasNodeId[];
    }
  | {
      type: "GROUP_NODES";
      ids: CanvasNodeId[];
      groupId?: CanvasNodeId;
      name?: string;
    }
  | {
      type: "UNGROUP_NODE";
      id: CanvasNodeId;
    }
  | {
      type: "REPARENT_NODES";
      ids: CanvasNodeId[];
      index?: number;
      parentId: CanvasNodeId | null;
    }
  | {
      type: "REORDER_CHILDREN";
      orderedIds: CanvasNodeId[];
      parentId: CanvasNodeId | null;
    }
  | {
      type: "TOGGLE_NODE_LOCK";
      id: CanvasNodeId;
    }
  | {
      type: "TOGGLE_NODE_VISIBILITY";
      id: CanvasNodeId;
    }
  | {
      type: "APPLY_IMAGE_ADJUSTMENTS";
      adjustments: EditingAdjustments | undefined;
      id: CanvasNodeId;
    };
