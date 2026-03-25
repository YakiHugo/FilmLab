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

export interface CanvasPersistedNodeBase {
  id: CanvasNodeId;
  type: CanvasNodeType;
  transform: CanvasNodeTransform;
  zIndex?: number;
  opacity: number;
  locked: boolean;
  visible: boolean;
}

export interface CanvasPersistedGroupNode extends CanvasPersistedNodeBase {
  type: "group";
  name: string;
}

export interface CanvasPersistedImageElement extends CanvasPersistedNodeBase {
  type: "image";
  assetId: string;
  filmProfileId?: string;
  adjustments?: EditingAdjustments;
}

export interface CanvasPersistedTextElement extends CanvasPersistedNodeBase {
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

export interface CanvasPersistedShapeElement extends CanvasPersistedNodeBase {
  type: "shape";
  shapeType: CanvasShapeType;
  fill: string;
  stroke: string;
  strokeWidth: number;
  radius?: number;
  points?: CanvasShapePoint[];
  arrowHead?: CanvasShapeArrowHead;
}

export type CanvasPersistedElement =
  | CanvasPersistedImageElement
  | CanvasPersistedTextElement
  | CanvasPersistedShapeElement;
export type CanvasPersistedNode = CanvasPersistedGroupNode | CanvasPersistedElement;

export interface CanvasNodeBase extends CanvasPersistedNodeBase {
  parentId: CanvasNodeId | null;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
}

export interface CanvasGroupNode extends CanvasNodeBase, Omit<CanvasPersistedGroupNode, keyof CanvasPersistedNodeBase> {
  type: "group";
  childIds?: CanvasNodeId[];
}

export interface CanvasImageElement
  extends CanvasNodeBase,
    Omit<CanvasPersistedImageElement, keyof CanvasPersistedNodeBase> {
  type: "image";
}

export interface CanvasTextElement
  extends CanvasNodeBase,
    Omit<CanvasPersistedTextElement, keyof CanvasPersistedNodeBase> {
  type: "text";
}

export interface CanvasShapeElement
  extends CanvasNodeBase,
    Omit<CanvasPersistedShapeElement, keyof CanvasPersistedNodeBase> {
  type: "shape";
}

export type CanvasElement = CanvasImageElement | CanvasTextElement | CanvasShapeElement;
export type CanvasNode = CanvasGroupNode | CanvasElement;

interface CanvasWriteBoundaryGuardFields {
  bounds?: never;
  depth?: never;
  effectiveLocked?: never;
  effectiveVisible?: never;
  worldOpacity?: never;
}

export type CanvasEditableGroupNode = CanvasGroupNode & CanvasWriteBoundaryGuardFields;
export type CanvasEditableImageElement = CanvasImageElement &
  CanvasWriteBoundaryGuardFields & {
    childIds?: never;
  };
export type CanvasEditableTextElement = CanvasTextElement &
  CanvasWriteBoundaryGuardFields & {
    childIds?: never;
  };
export type CanvasEditableShapeElement = CanvasShapeElement &
  CanvasWriteBoundaryGuardFields & {
    childIds?: never;
  };
export type CanvasEditableElement =
  | CanvasEditableImageElement
  | CanvasEditableTextElement
  | CanvasEditableShapeElement;
export type CanvasEditableNode = CanvasEditableGroupNode | CanvasEditableElement;

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
    Omit<CanvasGroupNode, "childIds" | keyof CanvasRenderableNodeBase> {
  type: "group";
  childIds: CanvasNodeId[];
}

export interface CanvasRenderableImageElement
  extends CanvasRenderableNodeBase,
    Omit<CanvasImageElement, keyof CanvasRenderableNodeBase> {
  type: "image";
}

export interface CanvasRenderableTextElement
  extends CanvasRenderableNodeBase,
    Omit<CanvasTextElement, keyof CanvasRenderableNodeBase> {
  type: "text";
}

export interface CanvasRenderableShapeElement
  extends CanvasRenderableNodeBase,
    Omit<CanvasShapeElement, keyof CanvasRenderableNodeBase> {
  type: "shape";
}

export type CanvasRenderableElement =
  | CanvasRenderableImageElement
  | CanvasRenderableTextElement
  | CanvasRenderableShapeElement;
export type CanvasRenderableNode = CanvasRenderableGroupNode | CanvasRenderableElement;

export interface CanvasWorkbenchSnapshot {
  id: string;
  version: 3;
  ownerRef: {
    userId: string;
  };
  name: string;
  width: number;
  height: number;
  presetId: CanvasPresetId;
  backgroundColor: string;
  nodes: Record<string, CanvasPersistedNode>;
  rootIds: CanvasNodeId[];
  groupChildren: Record<string, CanvasNodeId[]>;
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

export type CanvasDocumentMetaPatch = Partial<
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

export type CanvasDocumentOp =
  | { type: "patchDocumentMeta"; patch: CanvasDocumentMetaPatch }
  | { type: "putNode"; node: CanvasPersistedNode }
  | { type: "deleteNode"; nodeId: CanvasNodeId }
  | { type: "setRootOrder"; rootIds: CanvasNodeId[] }
  | { type: "setGroupChildren"; groupId: CanvasNodeId; childIds: CanvasNodeId[] };

export interface CanvasDocumentChangeSet {
  operations: CanvasDocumentOp[];
}

export interface CanvasHistoryEntry {
  commandType: CanvasCommand["type"];
  forwardChangeSet: CanvasDocumentChangeSet;
  inverseChangeSet: CanvasDocumentChangeSet;
}

export type CanvasNodePropertyPatch = Partial<
  Pick<CanvasPersistedNodeBase, "locked" | "opacity" | "visible">
> &
  Partial<CanvasNodeTransform> &
  Partial<
    Pick<CanvasPersistedGroupNode, "name"> &
      Pick<CanvasPersistedImageElement, "adjustments" | "filmProfileId"> &
      Pick<
        CanvasPersistedTextElement,
        "color" | "content" | "fontFamily" | "fontSize" | "fontSizeTier" | "textAlign"
      > &
      Pick<
        CanvasPersistedShapeElement,
        "arrowHead" | "fill" | "points" | "radius" | "shapeType" | "stroke" | "strokeWidth"
      >
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
      nodes: CanvasEditableNode[];
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
