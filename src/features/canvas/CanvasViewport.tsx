import type Konva from "konva";
import {
  Fragment,
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from "react";
import { unstable_batchedUpdates } from "react-dom";
import { Crosshair, Hand, Minus, MousePointer2, Plus } from "lucide-react";
import { Layer, Line, Rect, Stage, Text as KonvaText } from "react-konva";
import type { CanvasElement, CanvasTextElement } from "@/types";
import { cn } from "@/lib/utils";
import { useCanvasStore } from "@/stores/canvasStore";
import { useCanvasRuntimeStore } from "@/stores/canvasRuntimeStore";
import { CanvasTextToolbar } from "./CanvasTextToolbar";
import { ImageElement } from "./elements/ImageElement";
import { getVisibleWorldGridBounds, GRID_SIZE, quantizeDragPosition, snapPoint } from "./grid";
import type { CanvasOverlayRect } from "./overlayGeometry";
import { resolveFloatingOverlayPosition } from "./overlayGeometry";
import {
  isSelectableSelectionTarget,
  normalizeSelectionRect,
  resolveCompletedMarqueeSelectionIds,
  resolveMarqueeSelectionIds,
  screenRectToWorldRect,
  selectionDistanceExceedsThreshold,
  type CanvasSelectionTarget,
  type CanvasSelectionPoint,
} from "./selectionGeometry";
import {
  applyCanvasTextFontSizeTier,
  CANVAS_TEXT_LINE_HEIGHT_MULTIPLIER,
  DEFAULT_CANVAS_TEXT_COLOR,
  DEFAULT_CANVAS_TEXT_FONT_FAMILY,
  DEFAULT_CANVAS_TEXT_FONT_SIZE,
  DEFAULT_CANVAS_TEXT_FONT_SIZE_TIER,
  fitCanvasTextElementToContent,
} from "./textStyle";
import { createTextMutationQueue } from "./textMutationQueue";
import { TextElement } from "./elements/TextElement";
import { registerCanvasStage } from "./hooks/canvasStageRegistry";
import { useCanvasInteraction } from "./hooks/useCanvasInteraction";
import { useCanvasSelectionModel } from "./hooks/useCanvasSelectionModel";
import { selectionIdsEqual } from "./selectionModel";

interface CanvasViewportProps {
  stageRef: RefObject<Konva.Stage>;
  selectedSliceId?: string | null;
}

type EditingTextMode = "existing" | "create";

const BOARD_SURFACE_NODE_ID = "canvas-background";
const WORKSPACE_BACKGROUND_NODE_ID = "canvas-workspace-background";
const WORKSPACE_DOT_GRID_NODE_ID = "canvas-workspace-grid";
const DOT_RADIUS = 0.72;
const WORKSPACE_BACKGROUND_FILL = "rgb(38, 38, 38)";
const WORKSPACE_DOT_FILL = "rgb(68, 68, 68)";
const VIEWPORT_INSETS = {
  top: 88,
  right: 32,
  bottom: 104,
  left: 112,
};
const FLOATING_TOOLBAR_GAP = 12;
const DEFAULT_TEXT_TOOLBAR_SIZE = {
  width: 196,
  height: 48,
};
const DEFAULT_DIMENSIONS_BADGE_SIZE = {
  width: 116,
  height: 40,
};
const MARQUEE_DRAG_THRESHOLD_PX = 4;
const CANVAS_SELECTION_ACCENT = "#f59e0b";
const CANVAS_SELECTION_ACCENT_FILL = "rgba(245,158,11,0.12)";

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const createElementId = () => {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `canvas-el-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
};

const isInputLikeElement = (target: EventTarget | null) => {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  const tagName = target.tagName.toLowerCase();
  return (
    tagName === "input" ||
    tagName === "textarea" ||
    tagName === "select" ||
    target.isContentEditable
  );
};

interface CanvasSelectionOverlayMetrics {
  rect: CanvasOverlayRect;
  textMatrix: string | null;
}

const createTransformMatrix = (node: Konva.Node) => {
  const [a, b, c, d, e, f] = node.getAbsoluteTransform().getMatrix();
  return `matrix(${a}, ${b}, ${c}, ${d}, ${e}, ${f})`;
};

const getSelectionOverlayRect = (node: Konva.Node): CanvasOverlayRect => {
  const rect = node.getClientRect({
    skipShadow: true,
    skipStroke: true,
  });

  return {
    x: rect.x,
    y: rect.y,
    width: rect.width,
    height: rect.height,
  };
};

const selectionOverlayEqual = (
  left: CanvasSelectionOverlayMetrics | null,
  right: CanvasSelectionOverlayMetrics | null
) => {
  if (left === right) {
    return true;
  }
  if (!left || !right) {
    return false;
  }

  return (
    left.textMatrix === right.textMatrix &&
    Math.abs(left.rect.x - right.rect.x) < 0.5 &&
    Math.abs(left.rect.y - right.rect.y) < 0.5 &&
    Math.abs(left.rect.width - right.rect.width) < 0.5 &&
    Math.abs(left.rect.height - right.rect.height) < 0.5
  );
};

const getDraftTextOverlayRect = (
  element: CanvasTextElement,
  viewport: { x: number; y: number },
  zoom: number
): CanvasOverlayRect => {
  const layoutElement = fitCanvasTextElementToContent(element);

  return {
    x: layoutElement.x * zoom + viewport.x,
    y: layoutElement.y * zoom + viewport.y,
    width: Math.max(1, layoutElement.width * zoom),
    height: Math.max(1, layoutElement.height * zoom),
  };
};

interface CanvasTextEditorLayout {
  left: number;
  top: number;
  width: number;
  height: number;
  transform: string;
  transformOrigin: "top left";
}

interface MarqueeSelectionState {
  additive: boolean;
  baseSelectedIds: string[];
  currentCanvas: CanvasSelectionPoint;
  currentScreen: CanvasSelectionPoint;
  hasActivated: boolean;
  startCanvas: CanvasSelectionPoint;
  startScreen: CanvasSelectionPoint;
}

interface MarqueeSelectionRenderState {
  hasSession: boolean;
  isDragging: boolean;
  rect: CanvasOverlayRect | null;
}

const EMPTY_MARQUEE_RENDER_STATE: MarqueeSelectionRenderState = {
  hasSession: false,
  isDragging: false,
  rect: null,
};

const marqueeRenderStateEqual = (
  left: MarqueeSelectionRenderState,
  right: MarqueeSelectionRenderState
) => {
  const rectsEqual =
    left.rect === right.rect ||
    (!!left.rect &&
      !!right.rect &&
      Math.abs(left.rect.x - right.rect.x) < 0.5 &&
      Math.abs(left.rect.y - right.rect.y) < 0.5 &&
      Math.abs(left.rect.width - right.rect.width) < 0.5 &&
      Math.abs(left.rect.height - right.rect.height) < 0.5);

  if (!rectsEqual) {
    return false;
  }

  if (left.hasSession !== right.hasSession || left.isDragging !== right.isDragging) {
    return false;
  }
  return true;
};

const getTextEditorLayout = ({
  element,
  transform,
  viewport,
  zoom,
}: {
  element: CanvasTextElement;
  transform: string | null;
  viewport: { x: number; y: number };
  zoom: number;
}): CanvasTextEditorLayout => {
  const layoutElement = fitCanvasTextElementToContent(element);

  if (transform) {
    return {
      left: 0,
      top: 0,
      width: layoutElement.width,
      height: layoutElement.height,
      transform,
      transformOrigin: "top left",
    };
  }

  return {
    left: 0,
    top: 0,
    width: layoutElement.width,
    height: layoutElement.height,
    transform: `translate(${layoutElement.x * zoom + viewport.x}px, ${layoutElement.y * zoom + viewport.y}px) scale(${zoom}) rotate(${layoutElement.rotation}deg)`,
    transformOrigin: "top left",
  };
};

function DotGrid({
  bounds,
}: {
  bounds: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}) {
  const [dotGridPattern, setDotGridPattern] = useState<HTMLImageElement | null>(null);

  useEffect(() => {
    if (typeof document === "undefined") {
      return;
    }

    const canvas = document.createElement("canvas");
    canvas.width = GRID_SIZE;
    canvas.height = GRID_SIZE;

    const context = canvas.getContext("2d");
    if (!context) {
      return;
    }

    context.clearRect(0, 0, GRID_SIZE, GRID_SIZE);
    context.fillStyle = WORKSPACE_DOT_FILL;
    context.beginPath();
    context.arc(0, 0, DOT_RADIUS, 0, Math.PI * 2, false);
    context.fill();

    const patternImage = new Image();
    let isActive = true;
    patternImage.onload = () => {
      if (isActive) {
        setDotGridPattern(patternImage);
      }
    };
    patternImage.src = canvas.toDataURL("image/png");

    return () => {
      isActive = false;
      patternImage.onload = null;
    };
  }, []);

  if (!dotGridPattern || bounds.width <= 0 || bounds.height <= 0) {
    return null;
  }

  return (
    <Rect
      id={WORKSPACE_DOT_GRID_NODE_ID}
      listening={false}
      perfectDrawEnabled={false}
      x={bounds.x}
      y={bounds.y}
      width={bounds.width}
      height={bounds.height}
      fillPatternImage={dotGridPattern}
      fillPatternRepeat="repeat"
      fillPatternX={0}
      fillPatternY={0}
    />
  );
}

interface CanvasElementsLayerProps {
  dragBoundFunc: (position: { x: number; y: number }) => { x: number; y: number };
  editingTextDraft: CanvasTextElement | null;
  editingTextId: string | null;
  elements: CanvasElement[];
  interactivePreviewElementId: string | null;
  onElementDragEnd: (elementId: string, x: number, y: number) => void;
  onElementSelect: (elementId: string, additive: boolean) => void;
  onTextElementDoubleClick: (elementId: string) => void;
}

const CanvasElementsLayer = memo(function CanvasElementsLayer({
  dragBoundFunc,
  editingTextDraft,
  editingTextId,
  elements,
  interactivePreviewElementId,
  onElementDragEnd,
  onElementSelect,
  onTextElementDoubleClick,
}: CanvasElementsLayerProps) {
  return (
    <>
      {elements.map((element) => {
        const liveTextElement =
          element.type === "text" && editingTextDraft?.id === element.id
            ? editingTextDraft
            : element;

        if (liveTextElement.type === "image") {
          return (
            <ImageElement
              key={liveTextElement.id}
              element={liveTextElement}
              previewPriority={
                liveTextElement.id === interactivePreviewElementId ? "interactive" : "background"
              }
              dragBoundFunc={dragBoundFunc}
              onSelect={onElementSelect}
              onDragEnd={onElementDragEnd}
            />
          );
        }

        return (
          <TextElement
            key={liveTextElement.id}
            element={liveTextElement}
            isEditing={editingTextId === liveTextElement.id}
            dragBoundFunc={dragBoundFunc}
            onSelect={onElementSelect}
            onDoubleClick={onTextElementDoubleClick}
            onDragEnd={onElementDragEnd}
          />
        );
      })}
    </>
  );
});

interface CanvasSelectionOutlineLayerProps {
  selectedElements: CanvasElement[];
}

const CanvasSelectionOutlineLayer = memo(function CanvasSelectionOutlineLayer({
  selectedElements,
}: CanvasSelectionOutlineLayerProps) {
  return (
    <>
      {selectedElements.map((element) => {
        const outlineElement =
          element.type === "text" ? fitCanvasTextElementToContent(element) : element;

        return (
          <Rect
            key={outlineElement.id}
            listening={false}
            x={outlineElement.x}
            y={outlineElement.y}
            width={outlineElement.width}
            height={outlineElement.height}
            rotation={outlineElement.rotation}
            stroke={CANVAS_SELECTION_ACCENT}
            strokeWidth={1.5}
            strokeScaleEnabled={false}
          />
        );
      })}
    </>
  );
});

export function CanvasViewport({ stageRef, selectedSliceId }: CanvasViewportProps) {
  const activeDocumentId = useCanvasStore((state) => state.activeDocumentId);
  const activeDocument = useCanvasStore((state) =>
    state.activeDocumentId
      ? (state.documents.find((document) => document.id === state.activeDocumentId) ?? null)
      : null
  );
  const deleteElements = useCanvasStore((state) => state.deleteElements);
  const upsertElement = useCanvasStore((state) => state.upsertElement);
  const tool = useCanvasStore((state) => state.tool);
  const setTool = useCanvasStore((state) => state.setTool);
  const zoom = useCanvasStore((state) => state.zoom);
  const setZoom = useCanvasStore((state) => state.setZoom);
  const viewport = useCanvasStore((state) => state.viewport);
  const setViewport = useCanvasStore((state) => state.setViewport);
  const setSelectionPreviewElementIds = useCanvasRuntimeStore(
    (state) => state.setSelectionPreviewElementIds
  );
  const clearSelectionPreview = useCanvasRuntimeStore((state) => state.clearSelectionPreview);
  const { displaySelectedElementIds } = useCanvasSelectionModel();
  const { selectedElementIds, setSelectedElementIds, selectElement, clearSelection } =
    useCanvasInteraction();
  const viewportContainerRef = useRef<HTMLDivElement>(null);
  const textToolbarRef = useRef<HTMLDivElement>(null);
  const dimensionsBadgeRef = useRef<HTMLDivElement>(null);
  const textEditorRef = useRef<HTMLDivElement>(null);
  const textEditorInputRef = useRef<HTMLTextAreaElement>(null);
  const [isSpacePressed, setIsSpacePressed] = useState(false);
  const [isPanning, setIsPanning] = useState(false);
  const [marqueeRenderState, setMarqueeRenderState] = useState<MarqueeSelectionRenderState>(
    EMPTY_MARQUEE_RENDER_STATE
  );
  const [editingTextId, setEditingTextId] = useState<string | null>(null);
  const [editingTextMode, setEditingTextMode] = useState<EditingTextMode | null>(null);
  const [editingTextValue, setEditingTextValue] = useState("");
  const [editingTextDraft, setEditingTextDraft] = useState<CanvasTextElement | null>(null);
  const [selectionOverlay, setSelectionOverlay] = useState<CanvasSelectionOverlayMetrics | null>(
    null
  );
  const [toolbarPosition, setToolbarPosition] = useState({
    left: 0,
    top: 0,
  });
  const [dimensionsBadgePosition, setDimensionsBadgePosition] = useState({
    left: 0,
    top: 0,
  });
  const panningAnchorRef = useRef<{ x: number; y: number } | null>(null);
  const viewportAnchorRef = useRef<{ x: number; y: number } | null>(null);
  const initializedDocumentIdsRef = useRef<Set<string>>(new Set());
  const textMutationQueueRef = useRef<ReturnType<typeof createTextMutationQueue> | null>(null);
  const textElementDraftRef = useRef<CanvasTextElement | null>(null);
  const createdTextElementRef = useRef(false);
  const marqueeRenderFrameRef = useRef<number | null>(null);
  const marqueeSelectionRef = useRef<MarqueeSelectionState | null>(null);
  const marqueeSelectionTargetsRef = useRef<CanvasSelectionTarget[]>([]);
  const selectedElementIdsRef = useRef(selectedElementIds);
  const [stageSize, setStageSize] = useState(() => ({
    width: 0,
    height: 0,
  }));

  const elementById = useMemo(
    () => new Map((activeDocument?.elements ?? []).map((element) => [element.id, element])),
    [activeDocument?.elements]
  );
  const elementByIdRef = useRef(elementById);
  const interactivePreviewElementId = useMemo(
    () => (displaySelectedElementIds.length === 1 ? displaySelectedElementIds[0]! : null),
    [displaySelectedElementIds]
  );
  const displaySelectedElements = useMemo(
    () =>
      displaySelectedElementIds
        .map((elementId) => {
          const element = elementById.get(elementId);
          if (!element) {
            return null;
          }
          return element.type === "text" && editingTextDraft?.id === element.id
            ? editingTextDraft
            : element;
        })
        .filter((element): element is CanvasElement => Boolean(element)),
    [displaySelectedElementIds, editingTextDraft, elementById]
  );

  const editingTextElement = useMemo(() => {
    if (!editingTextId) {
      return null;
    }
    const element = elementById.get(editingTextId);
    return element?.type === "text" ? element : null;
  }, [editingTextId, elementById]);

  const singleSelectedElement = useMemo(() => {
    if (selectedElementIds.length !== 1) {
      return null;
    }
    return elementById.get(selectedElementIds[0]!) ?? null;
  }, [elementById, selectedElementIds]);

  const singleSelectedTextElement = useMemo(
    () => (singleSelectedElement?.type === "text" ? singleSelectedElement : null),
    [singleSelectedElement]
  );
  const singleSelectedNonTextElement = useMemo(
    () =>
      singleSelectedElement && singleSelectedElement.type !== "text" ? singleSelectedElement : null,
    [singleSelectedElement]
  );
  const isDraggingMarqueeSelection = useCallback(
    (state: MarqueeSelectionState) =>
      selectionDistanceExceedsThreshold(
        state.startScreen,
        state.currentScreen,
        MARQUEE_DRAG_THRESHOLD_PX
      ),
    []
  );
  const isMarqueeDragging = marqueeRenderState.isDragging;
  const hasMarqueeSession = marqueeRenderState.hasSession;

  const activeTextElement =
    editingTextDraft ??
    editingTextElement ??
    (editingTextId ? textElementDraftRef.current : null) ??
    singleSelectedTextElement;

  if (!textMutationQueueRef.current) {
    textMutationQueueRef.current = createTextMutationQueue();
  }

  useEffect(() => {
    selectedElementIdsRef.current = selectedElementIds;
  }, [selectedElementIds]);

  useEffect(() => {
    elementByIdRef.current = elementById;
  }, [elementById]);

  useEffect(() => {
    if (editingTextDraft) {
      textElementDraftRef.current = editingTextDraft;
      return;
    }
    if (editingTextElement) {
      textElementDraftRef.current = editingTextElement;
      return;
    }
    if (singleSelectedTextElement) {
      textElementDraftRef.current = singleSelectedTextElement;
      return;
    }
    if (!editingTextId) {
      textElementDraftRef.current = null;
    }
  }, [editingTextDraft, editingTextElement, editingTextId, singleSelectedTextElement]);

  useEffect(() => {
    if (editingTextMode === "create" && editingTextElement) {
      createdTextElementRef.current = true;
    }
  }, [editingTextElement, editingTextMode]);

  const thirdsGuideLines = useMemo(() => {
    if (!activeDocument || !activeDocument.guides.showThirds) {
      return [];
    }
    return [
      [activeDocument.width / 3, 0, activeDocument.width / 3, activeDocument.height],
      [(activeDocument.width * 2) / 3, 0, (activeDocument.width * 2) / 3, activeDocument.height],
      [0, activeDocument.height / 3, activeDocument.width, activeDocument.height / 3],
      [0, (activeDocument.height * 2) / 3, activeDocument.width, (activeDocument.height * 2) / 3],
    ];
  }, [activeDocument]);

  const centerGuideLines = useMemo(() => {
    if (!activeDocument || !activeDocument.guides.showCenter) {
      return [];
    }
    return [
      [activeDocument.width / 2, 0, activeDocument.width / 2, activeDocument.height],
      [0, activeDocument.height / 2, activeDocument.width, activeDocument.height / 2],
    ];
  }, [activeDocument]);

  const fitZoom = useMemo(() => {
    if (!activeDocument || stageSize.width <= 0 || stageSize.height <= 0) {
      return 1;
    }
    const usableWidth = Math.max(1, stageSize.width - VIEWPORT_INSETS.left - VIEWPORT_INSETS.right);
    const usableHeight = Math.max(
      1,
      stageSize.height - VIEWPORT_INSETS.top - VIEWPORT_INSETS.bottom
    );
    return clamp(
      Math.min(usableWidth / activeDocument.width, usableHeight / activeDocument.height, 1),
      0.2,
      1
    );
  }, [activeDocument, stageSize.height, stageSize.width]);

  const workspaceGridBounds = useMemo(
    () => getVisibleWorldGridBounds(viewport, zoom, stageSize),
    [stageSize, viewport, zoom]
  );

  const dragBoundFunc = useCallback(
    (position: { x: number; y: number }) => quantizeDragPosition(position),
    []
  );

  const shouldPan = tool === "hand" || isSpacePressed;

  const beginTextEdit = useCallback(
    (element: CanvasTextElement, options?: { mode?: EditingTextMode }) => {
      const mode = options?.mode ?? "existing";
      const nextElement = fitCanvasTextElementToContent(element);
      createdTextElementRef.current = mode === "existing";
      textElementDraftRef.current = nextElement;
      setEditingTextDraft(nextElement);
      setEditingTextId(nextElement.id);
      setEditingTextMode(mode);
      setEditingTextValue(nextElement.content);
    },
    []
  );

  const toCanvasPoint = useCallback(
    (stage: Konva.Stage) => {
      const pointer = stage.getPointerPosition();
      if (!pointer) {
        return null;
      }
      return {
        x: (pointer.x - viewport.x) / zoom,
        y: (pointer.y - viewport.y) / zoom,
      };
    },
    [viewport.x, viewport.y, zoom]
  );

  const toScreenPoint = useCallback((stage: Konva.Stage) => {
    const pointer = stage.getPointerPosition();
    if (!pointer) {
      return null;
    }
    return {
      x: pointer.x,
      y: pointer.y,
    };
  }, []);

  const buildMarqueeSelectionTargets = useCallback(() => {
    const stage = stageRef.current;
    if (!activeDocument || !stage) {
      return [];
    }

    const nextTargets: CanvasSelectionTarget[] = [];
    for (const element of activeDocument.elements) {
      if (!isSelectableSelectionTarget(element)) {
        continue;
      }

      const node = stage.findOne(`#${element.id}`);
      if (!node) {
        continue;
      }

      nextTargets.push({
        id: element.id,
        rect: screenRectToWorldRect(getSelectionOverlayRect(node), viewport, zoom),
      });
    }

    return nextTargets;
  }, [activeDocument, stageRef, viewport, zoom]);

  const cancelQueuedMarqueeSelection = useCallback(() => {
    if (marqueeRenderFrameRef.current === null) {
      return;
    }

    cancelAnimationFrame(marqueeRenderFrameRef.current);
    marqueeRenderFrameRef.current = null;
  }, []);

  useEffect(() => {
    cancelQueuedMarqueeSelection();
    marqueeSelectionRef.current = null;
    marqueeSelectionTargetsRef.current = [];
    unstable_batchedUpdates(() => {
      clearSelectionPreview();
      setMarqueeRenderState((current) =>
        marqueeRenderStateEqual(current, EMPTY_MARQUEE_RENDER_STATE)
          ? current
          : EMPTY_MARQUEE_RENDER_STATE
      );
    });
  }, [activeDocumentId, cancelQueuedMarqueeSelection, clearSelectionPreview]);

  const commitSelectedElementIds = useCallback(
    (nextSelectedIds: string[]) => {
      if (selectionIdsEqual(selectedElementIdsRef.current, nextSelectedIds)) {
        return;
      }

      selectedElementIdsRef.current = nextSelectedIds;
      setSelectedElementIds(nextSelectedIds);
    },
    [setSelectedElementIds]
  );

  const resolveMarqueeStateSelectionIds = useCallback(
    (state: MarqueeSelectionState) => {
      const selectionRect = normalizeSelectionRect(state.startCanvas, state.currentCanvas);
      const targets =
        marqueeSelectionTargetsRef.current.length > 0
          ? marqueeSelectionTargetsRef.current
          : buildMarqueeSelectionTargets();
      if (marqueeSelectionTargetsRef.current.length === 0) {
        marqueeSelectionTargetsRef.current = targets;
      }

      return resolveMarqueeSelectionIds(
        selectionRect,
        targets,
        state.baseSelectedIds,
        state.additive
      );
    },
    [buildMarqueeSelectionTargets]
  );

  const queueMarqueeRenderState = useCallback(() => {
    if (marqueeRenderFrameRef.current !== null) {
      return;
    }

    marqueeRenderFrameRef.current = requestAnimationFrame(() => {
      marqueeRenderFrameRef.current = null;
      const nextState = marqueeSelectionRef.current;
      if (!nextState) {
        return;
      }

      const nextPreviewSelectedIds = nextState.hasActivated
        ? resolveMarqueeStateSelectionIds(nextState)
        : null;
      const nextRenderState: MarqueeSelectionRenderState = {
        hasSession: true,
        isDragging: nextState.hasActivated,
        rect: nextState.hasActivated
          ? normalizeSelectionRect(nextState.startCanvas, nextState.currentCanvas)
          : null,
      };

      unstable_batchedUpdates(() => {
        setSelectionPreviewElementIds(nextPreviewSelectedIds);
        setMarqueeRenderState((current) =>
          marqueeRenderStateEqual(current, nextRenderState) ? current : nextRenderState
        );
      });
    });
  }, [resolveMarqueeStateSelectionIds, setSelectionPreviewElementIds]);

  useEffect(() => {
    if (tool === "select") {
      return;
    }
    cancelQueuedMarqueeSelection();
    marqueeSelectionRef.current = null;
    marqueeSelectionTargetsRef.current = [];
    unstable_batchedUpdates(() => {
      clearSelectionPreview();
      setMarqueeRenderState((current) =>
        marqueeRenderStateEqual(current, EMPTY_MARQUEE_RENDER_STATE)
          ? current
          : EMPTY_MARQUEE_RENDER_STATE
      );
    });
  }, [cancelQueuedMarqueeSelection, clearSelectionPreview, tool]);

  useEffect(
    () => () => {
      cancelQueuedMarqueeSelection();
      clearSelectionPreview();
    },
    [cancelQueuedMarqueeSelection, clearSelectionPreview]
  );

  const handleWorkspacePointerDown = useCallback(
    (event: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => {
      const stage = stageRef.current;
      if (!stage || !activeDocument) {
        return;
      }

      const isBackgroundTarget =
        event.target === stage || event.target.id() === WORKSPACE_BACKGROUND_NODE_ID;
      const point = toCanvasPoint(stage);

      if (shouldPan && isBackgroundTarget) {
        const pointer = toScreenPoint(stage);
        if (!pointer) {
          return;
        }
        event.evt.preventDefault();
        setIsPanning(true);
        panningAnchorRef.current = pointer;
        viewportAnchorRef.current = viewport;
        return;
      }

      if (!isBackgroundTarget || !point) {
        return;
      }

      event.evt.preventDefault();

      if (tool === "select") {
        const screenPoint = toScreenPoint(stage);
        if (!screenPoint) {
          return;
        }
        const additive = Boolean(event.evt.shiftKey);
        const baseSelectedIds = additive ? selectedElementIdsRef.current : [];
        const nextSelection: MarqueeSelectionState = {
          additive,
          baseSelectedIds,
          currentCanvas: point,
          currentScreen: screenPoint,
          hasActivated: false,
          startCanvas: point,
          startScreen: screenPoint,
        };
        cancelQueuedMarqueeSelection();
        marqueeSelectionRef.current = nextSelection;
        marqueeSelectionTargetsRef.current = [];
        unstable_batchedUpdates(() => {
          clearSelectionPreview();
          setMarqueeRenderState((current) => {
            const nextRenderState: MarqueeSelectionRenderState = {
              hasSession: true,
              isDragging: false,
              rect: null,
            };
            return marqueeRenderStateEqual(current, nextRenderState) ? current : nextRenderState;
          });
        });
        return;
      }

      if (tool === "text") {
        const snappedPoint = snapPoint(point);
        const textElement = fitCanvasTextElementToContent({
          id: createElementId(),
          type: "text",
          content: "",
          x: snappedPoint.x,
          y: snappedPoint.y,
          width: 1,
          height: 1,
          rotation: 0,
          opacity: 1,
          locked: false,
          visible: true,
          zIndex: activeDocument.elements.length + 1,
          fontFamily: DEFAULT_CANVAS_TEXT_FONT_FAMILY,
          fontSize: DEFAULT_CANVAS_TEXT_FONT_SIZE,
          fontSizeTier: DEFAULT_CANVAS_TEXT_FONT_SIZE_TIER,
          color: DEFAULT_CANVAS_TEXT_COLOR,
          textAlign: "left",
        });
        clearSelection();
        setTool("select");
        beginTextEdit(textElement, { mode: "create" });
      }
    },
    [
      activeDocument,
      beginTextEdit,
      clearSelection,
      shouldPan,
      setIsPanning,
      setTool,
      stageRef,
      cancelQueuedMarqueeSelection,
      toScreenPoint,
      toCanvasPoint,
      tool,
      viewport,
      clearSelectionPreview,
    ]
  );

  const handleWorkspacePointerMove = useCallback(
    (event?: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => {
      const stage = stageRef.current;
      if (!stage) {
        return;
      }

      if (isPanning && shouldPan) {
        event?.evt.preventDefault();
        const pointer = toScreenPoint(stage);
        if (!pointer || !panningAnchorRef.current || !viewportAnchorRef.current) {
          return;
        }
        setViewport({
          x: viewportAnchorRef.current.x + (pointer.x - panningAnchorRef.current.x),
          y: viewportAnchorRef.current.y + (pointer.y - panningAnchorRef.current.y),
        });
        return;
      }

      const currentSelection = marqueeSelectionRef.current;
      if (!currentSelection || tool !== "select" || shouldPan) {
        return;
      }

      const currentCanvas = toCanvasPoint(stage);
      const currentScreen = toScreenPoint(stage);
      if (!currentCanvas || !currentScreen) {
        return;
      }

      event?.evt.preventDefault();
      const nextSelectionDraft: MarqueeSelectionState = {
        ...currentSelection,
        currentCanvas,
        currentScreen,
      };
      const nextSelection: MarqueeSelectionState = {
        ...nextSelectionDraft,
        hasActivated:
          currentSelection.hasActivated || isDraggingMarqueeSelection(nextSelectionDraft),
      };
      marqueeSelectionRef.current = nextSelection;
      if (!nextSelection.hasActivated) {
        return;
      }

      queueMarqueeRenderState();
      if (marqueeSelectionTargetsRef.current.length === 0) {
        marqueeSelectionTargetsRef.current = buildMarqueeSelectionTargets();
      }
    },
    [
      buildMarqueeSelectionTargets,
      isDraggingMarqueeSelection,
      isPanning,
      queueMarqueeRenderState,
      setViewport,
      shouldPan,
      stageRef,
      toCanvasPoint,
      toScreenPoint,
      tool,
    ]
  );

  const handleWorkspacePointerUp = useCallback(
    (event?: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => {
      event?.evt.preventDefault();
      if (isPanning) {
        setIsPanning(false);
      }
      panningAnchorRef.current = null;
      viewportAnchorRef.current = null;

      const currentSelection = marqueeSelectionRef.current;
      if (!currentSelection) {
        return;
      }

      let nextSelection = currentSelection;
      const stage = stageRef.current;
      if (stage) {
        const currentCanvas = toCanvasPoint(stage);
        const currentScreen = toScreenPoint(stage);
        if (currentCanvas && currentScreen) {
          nextSelection = {
            ...currentSelection,
            currentCanvas,
            currentScreen,
          };
        }
      }

      cancelQueuedMarqueeSelection();
      const nextPreviewSelectedIds = nextSelection.hasActivated
        ? resolveMarqueeStateSelectionIds(nextSelection)
        : nextSelection.baseSelectedIds;
      const nextSelectedIds = resolveCompletedMarqueeSelectionIds({
        additive: nextSelection.additive,
        baseSelectedIds: nextSelection.baseSelectedIds,
        hasActivated: nextSelection.hasActivated,
        nextSelectedIds: nextPreviewSelectedIds,
      });

      unstable_batchedUpdates(() => {
        commitSelectedElementIds(nextSelectedIds);
        clearSelectionPreview();
        setMarqueeRenderState((current) =>
          marqueeRenderStateEqual(current, EMPTY_MARQUEE_RENDER_STATE)
            ? current
            : EMPTY_MARQUEE_RENDER_STATE
        );
      });

      marqueeSelectionRef.current = null;
      marqueeSelectionTargetsRef.current = [];
    },
    [
      cancelQueuedMarqueeSelection,
      clearSelectionPreview,
      commitSelectedElementIds,
      isPanning,
      resolveMarqueeStateSelectionIds,
      stageRef,
      toCanvasPoint,
      toScreenPoint,
    ]
  );

  const handleElementSelect = useCallback(
    (elementId: string, additive: boolean) => {
      const element = elementByIdRef.current.get(elementId);
      if (!element || element.locked) {
        return;
      }

      selectElement(elementId, { additive });
    },
    [selectElement]
  );

  const handleElementDragEnd = useCallback(
    (elementId: string, x: number, y: number) => {
      const element = elementByIdRef.current.get(elementId);
      if (!activeDocumentId || !element) {
        return;
      }

      void upsertElement(activeDocumentId, {
        ...element,
        id: elementId,
        x,
        y,
      });
    },
    [activeDocumentId, upsertElement]
  );

  const handleTextElementDoubleClick = useCallback(
    (elementId: string) => {
      const element = elementByIdRef.current.get(elementId);
      if (element?.type !== "text") {
        return;
      }

      beginTextEdit(element);
    },
    [beginTextEdit]
  );

  useEffect(() => {
    registerCanvasStage(stageRef.current);
    return () => {
      registerCanvasStage(null);
    };
  }, [stageRef, activeDocumentId]);

  useEffect(() => {
    const container = viewportContainerRef.current;
    if (!container) {
      return;
    }

    const updateStageSize = (width: number, height: number) => {
      setStageSize((current) =>
        current.width === width && current.height === height ? current : { width, height }
      );
    };

    const measure = () => {
      const rect = container.getBoundingClientRect();
      updateStageSize(Math.round(rect.width), Math.round(rect.height));
    };

    measure();

    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", measure);
      return () => {
        window.removeEventListener("resize", measure);
      };
    }

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) {
        return;
      }
      updateStageSize(Math.round(entry.contentRect.width), Math.round(entry.contentRect.height));
    });
    observer.observe(container);

    return () => {
      observer.disconnect();
    };
  }, []);

  useEffect(() => {
    if (!activeDocument || stageSize.width <= 0 || stageSize.height <= 0) {
      return;
    }
    if (initializedDocumentIdsRef.current.has(activeDocument.id)) {
      return;
    }
    initializedDocumentIdsRef.current.add(activeDocument.id);
    const usableWidth = Math.max(1, stageSize.width - VIEWPORT_INSETS.left - VIEWPORT_INSETS.right);
    const usableHeight = Math.max(
      1,
      stageSize.height - VIEWPORT_INSETS.top - VIEWPORT_INSETS.bottom
    );
    setZoom(fitZoom);
    setViewport({
      x: Math.round(VIEWPORT_INSETS.left + (usableWidth - activeDocument.width * fitZoom) / 2),
      y: Math.round(VIEWPORT_INSETS.top + (usableHeight - activeDocument.height * fitZoom) / 2),
    });
  }, [activeDocument, fitZoom, setViewport, setZoom, stageSize.height, stageSize.width]);

  const cancelTextEdit = useCallback(() => {
    setEditingTextMode(null);
    setEditingTextId(null);
    setEditingTextValue("");
    setEditingTextDraft(null);
    createdTextElementRef.current = false;
    textElementDraftRef.current = null;
  }, []);

  const commitTextEdit = useCallback(() => {
    const currentTextElement = textElementDraftRef.current ?? activeTextElement;
    if (!currentTextElement || !activeDocumentId) {
      cancelTextEdit();
      return;
    }

    const nextContent = editingTextValue.trim();
    if (nextContent) {
      const nextElement = fitCanvasTextElementToContent({
        ...currentTextElement,
        content: nextContent,
      });
      textElementDraftRef.current = nextElement;
      setEditingTextDraft(nextElement);
      void textMutationQueueRef.current!.enqueue(() =>
        upsertElement(activeDocumentId, nextElement)
      );
      selectElement(nextElement.id);
    } else if (editingTextMode === "create") {
      clearSelection();
      if (createdTextElementRef.current) {
        void textMutationQueueRef.current!.enqueue(() =>
          deleteElements(activeDocumentId, [currentTextElement.id])
        );
      }
    }

    cancelTextEdit();
  }, [
    activeDocumentId,
    cancelTextEdit,
    clearSelection,
    deleteElements,
    editingTextMode,
    editingTextValue,
    activeTextElement,
    selectElement,
    upsertElement,
  ]);

  const syncSelectionOverlay = useCallback(() => {
    const stage = stageRef.current;
    const trackedId =
      editingTextId ?? (selectedElementIds.length === 1 ? selectedElementIds[0]! : null);

    if (!stage || !trackedId) {
      setSelectionOverlay((current) => (current ? null : current));
      return;
    }

    const node = stage.findOne(`#${trackedId}`);
    const trackedTextElement = editingTextId
      ? (textElementDraftRef.current ?? activeTextElement)
      : singleSelectedTextElement;

    if (!node && !trackedTextElement) {
      setSelectionOverlay((current) => (current ? null : current));
      return;
    }

    const rect = node
      ? getSelectionOverlayRect(node)
      : trackedTextElement
        ? getDraftTextOverlayRect(trackedTextElement, viewport, zoom)
        : null;
    if (!rect) {
      setSelectionOverlay((current) => (current ? null : current));
      return;
    }

    const nextOverlay: CanvasSelectionOverlayMetrics = {
      rect,
      textMatrix:
        node && trackedTextElement && trackedId === trackedTextElement.id
          ? createTransformMatrix(node)
          : null,
    };

    setSelectionOverlay((current) =>
      selectionOverlayEqual(current, nextOverlay) ? current : nextOverlay
    );
  }, [
    activeTextElement,
    editingTextId,
    selectedElementIds,
    stageRef,
    singleSelectedTextElement,
    viewport,
    zoom,
  ]);

  const updateSelectedTextElement = useCallback(
    (updater: (element: CanvasTextElement) => CanvasTextElement) => {
      const currentTextElement = textElementDraftRef.current ?? activeTextElement;
      if (!activeDocumentId || !currentTextElement) {
        return;
      }
      const nextElement = fitCanvasTextElementToContent(updater(currentTextElement));
      textElementDraftRef.current = nextElement;
      if (editingTextId === currentTextElement.id) {
        setEditingTextDraft(nextElement);
      }
      if (editingTextMode === "create" && !createdTextElementRef.current) {
        return;
      }
      void textMutationQueueRef.current!.enqueue(() =>
        upsertElement(activeDocumentId, nextElement)
      );
    },
    [activeDocumentId, activeTextElement, editingTextId, editingTextMode, upsertElement]
  );

  useLayoutEffect(() => {
    syncSelectionOverlay();
  }, [syncSelectionOverlay, activeDocument?.updatedAt, zoom, viewport.x, viewport.y]);

  useEffect(() => {
    const stage = stageRef.current;
    const trackedId =
      editingTextId ?? (selectedElementIds.length === 1 ? selectedElementIds[0]! : null);

    if (!stage || !trackedId) {
      setSelectionOverlay((current) => (current ? null : current));
      return;
    }

    const trackedNode = stage.findOne(`#${trackedId}`);
    if (!trackedNode) {
      setSelectionOverlay((current) => (current ? null : current));
      return;
    }
    const node = trackedNode as Konva.Node;

    const handleNodeChange = () => {
      syncSelectionOverlay();
    };

    node.on("dragmove transform dragend transformend", handleNodeChange);
    syncSelectionOverlay();

    return () => {
      node.off("dragmove transform dragend transformend", handleNodeChange);
    };
  }, [editingTextId, selectedElementIds, stageRef, syncSelectionOverlay]);

  useLayoutEffect(() => {
    if (
      !selectionOverlay ||
      !activeTextElement ||
      activeTextElement.type !== "text" ||
      stageSize.width <= 0 ||
      stageSize.height <= 0
    ) {
      return;
    }

    const toolbarRect = textToolbarRef.current?.getBoundingClientRect();
    const nextPosition = resolveFloatingOverlayPosition({
      anchorRect: selectionOverlay.rect,
      containerHeight: stageSize.height,
      containerWidth: stageSize.width,
      gap: FLOATING_TOOLBAR_GAP,
      overlayHeight: Math.round(toolbarRect?.height ?? DEFAULT_TEXT_TOOLBAR_SIZE.height),
      overlayWidth: Math.round(toolbarRect?.width ?? DEFAULT_TEXT_TOOLBAR_SIZE.width),
    });

    setToolbarPosition((current) =>
      Math.abs(current.left - nextPosition.left) < 0.5 &&
      Math.abs(current.top - nextPosition.top) < 0.5
        ? current
        : nextPosition
    );
  }, [activeTextElement, selectionOverlay, stageSize.height, stageSize.width]);

  useLayoutEffect(() => {
    if (
      !selectionOverlay ||
      !singleSelectedNonTextElement ||
      stageSize.width <= 0 ||
      stageSize.height <= 0
    ) {
      return;
    }

    const badgeRect = dimensionsBadgeRef.current?.getBoundingClientRect();
    const nextPosition = resolveFloatingOverlayPosition({
      anchorRect: selectionOverlay.rect,
      containerHeight: stageSize.height,
      containerWidth: stageSize.width,
      gap: FLOATING_TOOLBAR_GAP,
      overlayHeight: Math.round(badgeRect?.height ?? DEFAULT_DIMENSIONS_BADGE_SIZE.height),
      overlayWidth: Math.round(badgeRect?.width ?? DEFAULT_DIMENSIONS_BADGE_SIZE.width),
    });

    setDimensionsBadgePosition((current) =>
      Math.abs(current.left - nextPosition.left) < 0.5 &&
      Math.abs(current.top - nextPosition.top) < 0.5
        ? current
        : nextPosition
    );
  }, [selectionOverlay, singleSelectedNonTextElement, stageSize.height, stageSize.width]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.code === "Space" && !isInputLikeElement(event.target)) {
        event.preventDefault();
        setIsSpacePressed(true);
      }
      if (event.key === "Escape") {
        cancelTextEdit();
      }
    };
    const handleKeyUp = (event: KeyboardEvent) => {
      if (event.code === "Space") {
        setIsSpacePressed(false);
        setIsPanning(false);
        panningAnchorRef.current = null;
        viewportAnchorRef.current = null;
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, [cancelTextEdit]);

  useEffect(() => {
    if (!editingTextId) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) {
        return;
      }
      if (textEditorRef.current?.contains(target) || textToolbarRef.current?.contains(target)) {
        return;
      }
      commitTextEdit();
    };

    document.addEventListener("pointerdown", handlePointerDown, true);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown, true);
    };
  }, [commitTextEdit, editingTextId]);

  const adjustZoom = (direction: "in" | "out") => {
    const scaleBy = 1.08;
    const nextZoom = clamp(direction === "in" ? zoom * scaleBy : zoom / scaleBy, 0.2, 4);
    setZoom(nextZoom);
  };

  const resetView = () => {
    if (!activeDocument) {
      return;
    }
    const usableWidth = Math.max(1, stageSize.width - VIEWPORT_INSETS.left - VIEWPORT_INSETS.right);
    const usableHeight = Math.max(
      1,
      stageSize.height - VIEWPORT_INSETS.top - VIEWPORT_INSETS.bottom
    );
    setZoom(fitZoom);
    setViewport({
      x: Math.round(VIEWPORT_INSETS.left + (usableWidth - activeDocument.width * fitZoom) / 2),
      y: Math.round(VIEWPORT_INSETS.top + (usableHeight - activeDocument.height * fitZoom) / 2),
    });
  };

  const showTextToolbar = Boolean(
    selectionOverlay && activeTextElement?.type === "text" && selectedElementIds.length === 1
  );
  const editingTextRenderElement = activeTextElement?.type === "text" ? activeTextElement : null;
  const showTextEditor = Boolean(
    !hasMarqueeSession && !isMarqueeDragging && editingTextId && editingTextRenderElement
  );
  const showDimensionsBadge = Boolean(
    selectionOverlay && singleSelectedNonTextElement && selectedElementIds.length === 1
  );
  const editingTextLayout = editingTextRenderElement
    ? getTextEditorLayout({
        element: editingTextRenderElement,
        transform: selectionOverlay?.textMatrix ?? null,
        viewport,
        zoom,
      })
    : null;

  useEffect(() => {
    if (editingTextId && !activeTextElement) {
      cancelTextEdit();
    }
  }, [activeTextElement, cancelTextEdit, editingTextId]);

  if (!activeDocument) {
    return (
      <div className="absolute inset-0 flex items-center justify-center text-sm text-zinc-500">
        Create or open a board to start composing on canvas.
      </div>
    );
  }

  return (
    <div
      ref={viewportContainerRef}
      className="absolute inset-0"
      style={{
        cursor: shouldPan ? (isPanning ? "grabbing" : "grab") : "default",
        touchAction: "none",
      }}
    >
      <Stage
        ref={stageRef}
        width={Math.max(stageSize.width, 1)}
        height={Math.max(stageSize.height, 1)}
        x={viewport.x}
        y={viewport.y}
        scaleX={zoom}
        scaleY={zoom}
        onWheel={(event) => {
          event.evt.preventDefault();
          const stage = stageRef.current;
          if (!stage) {
            return;
          }
          const pointer = stage.getPointerPosition();
          if (!pointer) {
            return;
          }
          const scaleBy = 1.08;
          const direction = event.evt.deltaY > 0 ? -1 : 1;
          const nextZoom = clamp(direction > 0 ? zoom * scaleBy : zoom / scaleBy, 0.2, 4);
          const worldPoint = {
            x: (pointer.x - viewport.x) / zoom,
            y: (pointer.y - viewport.y) / zoom,
          };
          setZoom(nextZoom);
          setViewport({
            x: pointer.x - worldPoint.x * nextZoom,
            y: pointer.y - worldPoint.y * nextZoom,
          });
        }}
        onMouseDown={(event: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => {
          const stage = stageRef.current;
          if (!stage) {
            return;
          }
          const isBackgroundTarget =
            event.target === stage || event.target.id() === WORKSPACE_BACKGROUND_NODE_ID;
          if (!isBackgroundTarget) {
            return;
          }
          handleWorkspacePointerDown(event);
        }}
        onTouchStart={(event: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => {
          handleWorkspacePointerDown(event);
        }}
        onMouseMove={(event: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => {
          handleWorkspacePointerMove(event);
        }}
        onTouchMove={(event: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => {
          handleWorkspacePointerMove(event);
        }}
        onMouseUp={(event: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => {
          handleWorkspacePointerUp(event);
        }}
        onTouchEnd={(event: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => {
          handleWorkspacePointerUp(event);
        }}
        onTouchCancel={(event: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => {
          handleWorkspacePointerUp(event);
        }}
      >
        <Layer>
          <Rect
            id={WORKSPACE_BACKGROUND_NODE_ID}
            x={workspaceGridBounds.x}
            y={workspaceGridBounds.y}
            width={workspaceGridBounds.width}
            height={workspaceGridBounds.height}
            fill={WORKSPACE_BACKGROUND_FILL}
            perfectDrawEnabled={false}
          />

          <DotGrid bounds={workspaceGridBounds} />

          <Rect
            id={BOARD_SURFACE_NODE_ID}
            x={0}
            y={0}
            width={activeDocument.width}
            height={activeDocument.height}
            fill={activeDocument.backgroundColor}
            listening={false}
            perfectDrawEnabled={false}
          />

          {activeDocument.guides.showSafeArea ? (
            <Rect
              x={activeDocument.safeArea.left}
              y={activeDocument.safeArea.top}
              width={Math.max(
                1,
                activeDocument.width - activeDocument.safeArea.left - activeDocument.safeArea.right
              )}
              height={Math.max(
                1,
                activeDocument.height - activeDocument.safeArea.top - activeDocument.safeArea.bottom
              )}
              stroke="rgba(255,255,255,0.22)"
              strokeWidth={1}
              dash={[10, 10]}
              listening={false}
            />
          ) : null}

          {thirdsGuideLines.map((points, index) => (
            <Line
              key={`thirds-${index}`}
              points={points}
              stroke="rgba(255,255,255,0.14)"
              strokeWidth={1}
              dash={[10, 10]}
              listening={false}
            />
          ))}

          {centerGuideLines.map((points, index) => (
            <Line
              key={`center-${index}`}
              points={points}
              stroke="rgba(251,191,36,0.22)"
              strokeWidth={1}
              dash={[14, 10]}
              listening={false}
            />
          ))}
        </Layer>

        <Layer>
          <CanvasElementsLayer
            dragBoundFunc={dragBoundFunc}
            editingTextDraft={editingTextDraft}
            editingTextId={editingTextId}
            elements={activeDocument.elements}
            interactivePreviewElementId={interactivePreviewElementId}
            onElementDragEnd={handleElementDragEnd}
            onElementSelect={handleElementSelect}
            onTextElementDoubleClick={handleTextElementDoubleClick}
          />
        </Layer>

        <Layer listening={false}>
          <CanvasSelectionOutlineLayer selectedElements={displaySelectedElements} />
        </Layer>

        <Layer listening={false}>
          {isMarqueeDragging && marqueeRenderState.rect ? (
            <Rect
              x={marqueeRenderState.rect.x}
              y={marqueeRenderState.rect.y}
              width={Math.max(1, marqueeRenderState.rect.width)}
              height={Math.max(1, marqueeRenderState.rect.height)}
              fill={CANVAS_SELECTION_ACCENT_FILL}
              stroke={CANVAS_SELECTION_ACCENT}
              strokeWidth={1.5}
              dash={[8, 5]}
              strokeScaleEnabled={false}
            />
          ) : null}
        </Layer>

        <Layer listening={false}>
          {activeDocument.slices.map((slice) => {
            const selected = slice.id === selectedSliceId;
            return (
              <Fragment key={slice.id}>
                <Rect
                  x={slice.x}
                  y={slice.y}
                  width={slice.width}
                  height={slice.height}
                  stroke={selected ? "#f5c97a" : "rgba(255,255,255,0.28)"}
                  strokeWidth={selected ? 2 : 1}
                  dash={selected ? [18, 10] : [10, 10]}
                  fill={selected ? "rgba(245, 201, 122, 0.06)" : "rgba(255,255,255,0.015)"}
                />
                <KonvaText
                  x={slice.x + 16}
                  y={slice.y + 16}
                  text={`${String(slice.order).padStart(2, "0")}  ${slice.name}`}
                  fontFamily="Manrope"
                  fontSize={18}
                  fill={selected ? "#f7e0b2" : "rgba(255,255,255,0.68)"}
                  padding={8}
                />
              </Fragment>
            );
          })}
        </Layer>
      </Stage>

      {showDimensionsBadge && singleSelectedNonTextElement ? (
        <div
          ref={dimensionsBadgeRef}
          className="absolute z-20 rounded-[12px] border border-white/10 bg-black/90 px-3 py-2 text-sm font-semibold text-zinc-50 shadow-[0_20px_48px_-32px_rgba(0,0,0,0.95)] backdrop-blur-xl"
          style={{
            left: dimensionsBadgePosition.left,
            top: dimensionsBadgePosition.top,
          }}
        >
          {Math.round(singleSelectedNonTextElement.width)} x{" "}
          {Math.round(singleSelectedNonTextElement.height)}
        </div>
      ) : null}

      {showTextToolbar && editingTextRenderElement && selectionOverlay ? (
        <CanvasTextToolbar
          ref={textToolbarRef}
          element={editingTextRenderElement}
          position={toolbarPosition}
          onColorChange={(color) => {
            updateSelectedTextElement((element) => ({
              ...element,
              color,
            }));
          }}
          onFontFamilyChange={(fontFamily) => {
            updateSelectedTextElement((element) => ({
              ...element,
              fontFamily,
            }));
          }}
          onFontSizeTierChange={(fontSizeTier) => {
            updateSelectedTextElement((element) =>
              applyCanvasTextFontSizeTier(element, fontSizeTier)
            );
          }}
        />
      ) : null}

      {showTextEditor && editingTextRenderElement && editingTextLayout ? (
        <div
          ref={textEditorRef}
          className="absolute z-20"
          style={{
            left: editingTextLayout.left,
            top: editingTextLayout.top,
            width: editingTextLayout.width,
            height: editingTextLayout.height,
            transform: editingTextLayout.transform,
            transformOrigin: editingTextLayout.transformOrigin,
          }}
          onPointerDown={(event) => {
            event.stopPropagation();
          }}
        >
          <textarea
            ref={textEditorInputRef}
            value={editingTextValue}
            onChange={(event) => {
              const nextValue = event.target.value;
              setEditingTextValue(nextValue);

              const sourceElement =
                textElementDraftRef.current ?? editingTextRenderElement ?? activeTextElement;
              if (!sourceElement) {
                return;
              }

              const nextElement = fitCanvasTextElementToContent({
                ...sourceElement,
                content: nextValue,
              });
              textElementDraftRef.current = nextElement;
              setEditingTextDraft(nextElement);

              if (
                editingTextMode === "create" &&
                !createdTextElementRef.current &&
                nextValue.trim().length > 0 &&
                activeDocumentId
              ) {
                createdTextElementRef.current = true;
                selectElement(nextElement.id);
                void textMutationQueueRef.current!.enqueue(() =>
                  upsertElement(activeDocumentId, nextElement)
                );
              }
            }}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.preventDefault();
                cancelTextEdit();
              }
              if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
                event.preventDefault();
                commitTextEdit();
              }
            }}
            autoFocus
            placeholder="Add Text"
            spellCheck={false}
            wrap="off"
            className="absolute inset-0 m-0 w-full resize-none border-0 bg-transparent p-0 outline-none"
            style={{
              boxSizing: "border-box",
              color: editingTextRenderElement.color,
              fontFamily: editingTextRenderElement.fontFamily,
              fontSize: editingTextRenderElement.fontSize,
              lineHeight: CANVAS_TEXT_LINE_HEIGHT_MULTIPLIER,
              overflow: "hidden",
              textAlign: editingTextRenderElement.textAlign,
            }}
          />
        </div>
      ) : null}

      <div className="absolute bottom-4 left-1/2 z-10 flex -translate-x-1/2 items-center gap-1 rounded-[24px] border border-white/10 bg-black/65 px-2 py-2 shadow-[0_20px_60px_-32px_rgba(0,0,0,0.95)] backdrop-blur-xl">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setTool("select")}
            className={cn(
              "flex h-10 w-10 items-center justify-center rounded-2xl transition",
              !shouldPan && tool === "select"
                ? "bg-white text-zinc-950"
                : "text-zinc-300 hover:bg-white/10"
            )}
            aria-label="Pointer tool"
            title="Pointer"
          >
            <MousePointer2 className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => setTool("hand")}
            className={cn(
              "flex h-10 w-10 items-center justify-center rounded-2xl transition",
              shouldPan ? "bg-white text-zinc-950" : "text-zinc-300 hover:bg-white/10"
            )}
            aria-label="Drag canvas tool"
            title="Drag"
          >
            <Hand className="h-4 w-4" />
          </button>
        </div>
        <div className="mx-1 h-8 w-px bg-white/10" />
        <button
          type="button"
          onClick={() => adjustZoom("out")}
          className="flex h-10 w-10 items-center justify-center rounded-2xl text-zinc-300 transition hover:bg-white/10"
          aria-label="Zoom out"
          title="Zoom out"
        >
          <Minus className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={resetView}
          className="flex h-10 w-10 items-center justify-center rounded-2xl text-zinc-300 transition hover:bg-white/10"
          aria-label="Center board"
          title="Center board"
        >
          <Crosshair className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => adjustZoom("in")}
          className="flex h-10 w-10 items-center justify-center rounded-2xl text-zinc-300 transition hover:bg-white/10"
          aria-label="Zoom in"
          title="Zoom in"
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
