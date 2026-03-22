import type Konva from "konva";
import {
  Fragment,
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from "react";
import { Crosshair, Hand, Minus, MousePointer2, Plus } from "lucide-react";
import { Layer, Line, Rect, Stage, Text as KonvaText } from "react-konva";
import { shallow } from "zustand/shallow";
import type {
  CanvasRenderableElement,
  CanvasRenderableTextElement,
  CanvasTextElement,
  CanvasShapeElement,
} from "@/types";
import { cn } from "@/lib/utils";
import { useCanvasStore } from "@/stores/canvasStore";
import { CanvasTextToolbar } from "./CanvasTextToolbar";
import { ImageElement } from "./elements/ImageElement";
import { ShapeElement } from "./elements/ShapeElement";
import { getVisibleWorldGridBounds, GRID_SIZE, quantizeDragPosition } from "./grid";
import {
  applyCanvasTextFontSizeTier,
  CANVAS_TEXT_LINE_HEIGHT_MULTIPLIER,
  CANVAS_TEXT_EDITOR_PLACEHOLDER,
  fitCanvasTextElementToContent,
} from "./textStyle";
import { TextElement, isCanvasTextElementEditable } from "./elements/TextElement";
import { useCanvasInteraction } from "./hooks/useCanvasInteraction";
import { useCanvasMarqueeSelection } from "./hooks/useCanvasMarqueeSelection";
import { useCanvasViewportOverlay } from "./hooks/useCanvasViewportOverlay";
import { useCanvasViewportNavigation } from "./hooks/useCanvasViewportNavigation";
import { useCanvasSelectionModel } from "./hooks/useCanvasSelectionModel";
import { useCanvasTextRuntimeViewModel } from "./hooks/useCanvasTextRuntimeViewModel";
import { useCanvasTextSession } from "./hooks/useCanvasTextSession";
import type { CanvasTextRuntimeSelectedElement } from "./textRuntimeViewModel";
import { resolveCanvasToolController } from "./tools/toolControllers";

interface CanvasViewportProps {
  stageRef: RefObject<Konva.Stage>;
  selectedSliceId?: string | null;
}

const BOARD_SURFACE_NODE_ID = "canvas-background";
const WORKSPACE_BACKGROUND_NODE_ID = "canvas-workspace-background";
const WORKSPACE_DOT_GRID_NODE_ID = "canvas-workspace-grid";
const DOT_RADIUS = 0.72;
const WORKSPACE_BACKGROUND_FILL = "rgb(38, 38, 38)";
const WORKSPACE_DOT_FILL = "rgb(68, 68, 68)";
const FLOATING_TOOLBAR_GAP = 12;
const DEFAULT_TEXT_TOOLBAR_SIZE = {
  width: 196,
  height: 48,
};
const DEFAULT_DIMENSIONS_BADGE_SIZE = {
  width: 116,
  height: 40,
};
const CANVAS_SELECTION_ACCENT = "#f59e0b";
const CANVAS_SELECTION_ACCENT_FILL = "rgba(245,158,11,0.12)";

const VIEWPORT_INSETS = {
  top: 88,
  right: 32,
  bottom: 104,
  left: 112,
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
  activeEditingTextId: string | null;
  dragBoundFunc: (position: { x: number; y: number }) => { x: number; y: number };
  editingTextDraft: CanvasRenderableTextElement | CanvasTextElement | null;
  elements: CanvasRenderableElement[];
  interactivePreviewElementId: string | null;
  onElementDragEnd: (elementId: string, x: number, y: number) => void;
  onElementSelect: (elementId: string, additive: boolean) => void;
  onTextElementDoubleClick: (elementId: string) => void;
}

const CanvasElementsLayer = memo(function CanvasElementsLayer({
  activeEditingTextId,
  dragBoundFunc,
  editingTextDraft,
  elements,
  interactivePreviewElementId,
  onElementDragEnd,
  onElementSelect,
  onTextElementDoubleClick,
}: CanvasElementsLayerProps) {
  return (
    <>
      {elements.map((element) => {
        if (element.type === "image") {
          return (
            <ImageElement
              key={element.id}
              element={element}
              previewPriority={
                element.id === interactivePreviewElementId ? "interactive" : "background"
              }
              dragBoundFunc={dragBoundFunc}
              onSelect={onElementSelect}
              onDragEnd={onElementDragEnd}
            />
          );
        }

        if (element.type === "shape") {
          return (
            <ShapeElement
              key={element.id}
              element={element}
              dragBoundFunc={dragBoundFunc}
              onSelect={onElementSelect}
              onDragEnd={onElementDragEnd}
            />
          );
        }

        const liveTextElement = editingTextDraft?.id === element.id ? editingTextDraft : element;
        return (
          <TextElement
            key={liveTextElement.id}
            element={liveTextElement}
            isEditing={activeEditingTextId === liveTextElement.id}
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
  selectedElements: CanvasTextRuntimeSelectedElement[];
}

const CanvasSelectionOutlineLayer = memo(function CanvasSelectionOutlineLayer({
  selectedElements,
}: CanvasSelectionOutlineLayerProps) {
  return (
    <>
      {selectedElements.map((element) => {
        const outlineElement =
          element.type === "group"
            ? {
                id: element.id,
                rotation: 0,
                x: element.bounds.x,
                y: element.bounds.y,
                width: element.bounds.width,
                height: element.bounds.height,
              }
            : element.type === "text"
              ? fitCanvasTextElementToContent(element)
              : element;

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
  const activeWorkbenchId = useCanvasStore((state) => state.activeWorkbenchId);
  const availableWorkbenchIds = useCanvasStore(
    (state) => state.workbenches.map((workbench) => workbench.id),
    shallow
  );
  const activeWorkbench = useCanvasStore((state) =>
    state.activeWorkbenchId
      ? (state.workbenches.find((document) => document.id === state.activeWorkbenchId) ?? null)
      : null
  );
  const executeCommandInWorkbench = useCanvasStore((state) => state.executeCommandInWorkbench);
  const upsertElement = useCanvasStore((state) => state.upsertElement);
  const upsertElementInWorkbench = useCanvasStore((state) => state.upsertElementInWorkbench);
  const tool = useCanvasStore((state) => state.tool);
  const activeShapeType = useCanvasStore((state) => state.activeShapeType);
  const setTool = useCanvasStore((state) => state.setTool);
  const zoom = useCanvasStore((state) => state.zoom);
  const setZoom = useCanvasStore((state) => state.setZoom);
  const viewport = useCanvasStore((state) => state.viewport);
  const setViewport = useCanvasStore((state) => state.setViewport);
  const { displaySelectedElementIds } = useCanvasSelectionModel();
  const { selectedElementIds, setSelectedElementIds, selectElement, clearSelection } =
    useCanvasInteraction();
  const textToolbarRef = useRef<HTMLDivElement>(null);
  const dimensionsBadgeRef = useRef<HTMLDivElement>(null);
  const textEditorRef = useRef<HTMLDivElement>(null);
  const textEditorInputRef = useRef<HTMLTextAreaElement>(null);
  const elementById = useMemo(
    () => new Map((activeWorkbench?.allNodes ?? []).map((element) => [element.id, element])),
    [activeWorkbench?.allNodes]
  );
  const elementByIdRef = useRef(elementById);
  const interactivePreviewElementId = useMemo(
    () => (displaySelectedElementIds.length === 1 ? displaySelectedElementIds[0]! : null),
    [displaySelectedElementIds]
  );
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
  const {
    adjustZoom,
    beginPanInteraction,
    cursor,
    endPanInteraction,
    handleStageWheel,
    resetView,
    shouldPan,
    stageSize,
    toCanvasPoint,
    toScreenPoint,
    updatePanInteraction,
    viewportContainerRef,
  } = useCanvasViewportNavigation({
    activeWorkbench,
    activeWorkbenchId,
    insets: VIEWPORT_INSETS,
    stageRef,
    tool,
    viewport,
    zoom,
    setViewport,
    setZoom,
  });
  const {
    beginMarqueeInteraction,
    commitMarqueeInteraction,
    hasMarqueeSession,
    isMarqueeDragging,
    marqueeRenderState,
    updateMarqueeInteraction,
  } = useCanvasMarqueeSelection({
    activeWorkbench,
    activeWorkbenchId,
    stageRef,
    tool,
    viewport,
    zoom,
    selectedElementIds,
    setSelectedElementIds,
  });
  const {
    editingTextId,
    editingTextDraft,
    editingTextValue,
    editingTextWorkbenchId,
    beginTextEdit,
    handleTextValueChange,
    handleTextInputKeyDown,
    updateSelectedTextElement,
  } = useCanvasTextSession({
    activeWorkbenchId,
    availableWorkbenchIds,
    elementById,
    selectedElementIds,
    singleSelectedTextElement,
    selectElement,
    clearSelection,
    upsertElementInWorkbench,
    executeCommandInWorkbench,
    textEditorRef,
    textToolbarRef,
  });
  const textRuntimeViewModel = useCanvasTextRuntimeViewModel({
    activeWorkbenchId,
    displaySelectedElementIds,
    editingTextDraft,
    editingTextId,
    editingTextWorkbenchId,
    hasMarqueeSession,
    isMarqueeDragging,
    nodeById: elementById,
    selectedElementIds,
  });

  useEffect(() => {
    elementByIdRef.current = elementById;
  }, [elementById]);

  const thirdsGuideLines = useMemo(() => {
    if (!activeWorkbench || !activeWorkbench.guides.showThirds) {
      return [];
    }
    return [
      [activeWorkbench.width / 3, 0, activeWorkbench.width / 3, activeWorkbench.height],
      [(activeWorkbench.width * 2) / 3, 0, (activeWorkbench.width * 2) / 3, activeWorkbench.height],
      [0, activeWorkbench.height / 3, activeWorkbench.width, activeWorkbench.height / 3],
      [0, (activeWorkbench.height * 2) / 3, activeWorkbench.width, (activeWorkbench.height * 2) / 3],
    ];
  }, [activeWorkbench]);

  const centerGuideLines = useMemo(() => {
    if (!activeWorkbench || !activeWorkbench.guides.showCenter) {
      return [];
    }
    return [
      [activeWorkbench.width / 2, 0, activeWorkbench.width / 2, activeWorkbench.height],
      [0, activeWorkbench.height / 2, activeWorkbench.width, activeWorkbench.height / 2],
    ];
  }, [activeWorkbench]);

  const workspaceGridBounds = useMemo(
    () => getVisibleWorldGridBounds(viewport, zoom, stageSize),
    [stageSize, viewport, zoom]
  );

  const dragBoundFunc = useCallback(
    (position: { x: number; y: number }) => quantizeDragPosition(position),
    []
  );

  const insertShapeElement = useCallback(
    (element: CanvasShapeElement) => {
      if (!activeWorkbenchId) {
        return;
      }
      void upsertElement(element);
    },
    [activeWorkbenchId, upsertElement]
  );

  const activeToolController = useMemo(
    () => resolveCanvasToolController(tool, shouldPan),
    [shouldPan, tool]
  );

  const activeToolContext = useMemo(
    () => ({
      activeWorkbenchId,
      activeShapeType,
      beginMarqueeSelection: beginMarqueeInteraction,
      beginPan: beginPanInteraction,
      beginTextEdit,
      clearSelection,
      commitMarqueeSelection: commitMarqueeInteraction,
      endPan: endPanInteraction,
      insertShape: insertShapeElement,
      selectElement: (elementId: string) => {
        selectElement(elementId);
      },
      setTool,
      updateMarqueeSelection: updateMarqueeInteraction,
      updatePan: updatePanInteraction,
    }),
    [
      activeWorkbenchId,
      activeShapeType,
      beginMarqueeInteraction,
      beginPanInteraction,
      beginTextEdit,
      clearSelection,
      commitMarqueeInteraction,
      endPanInteraction,
      insertShapeElement,
      selectElement,
      setTool,
      updateMarqueeInteraction,
      updatePanInteraction,
    ]
  );

  const handleWorkspacePointerDown = useCallback(
    (event: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => {
      const stage = stageRef.current;
      if (!stage || !activeWorkbench) {
        return;
      }

      const isBackgroundTarget =
        event.target === stage || event.target.id() === WORKSPACE_BACKGROUND_NODE_ID;
      if (!isBackgroundTarget) {
        return;
      }

      event.evt.preventDefault();
      activeToolController.onPointerDown(activeToolContext, {
        additive: Boolean(event.evt.shiftKey),
        canvasPoint: toCanvasPoint(stage),
        isBackgroundTarget,
        screenPoint: toScreenPoint(stage),
      });
    },
    [
      activeWorkbench,
      activeToolController,
      activeToolContext,
      stageRef,
      toCanvasPoint,
      toScreenPoint,
    ]
  );

  const handleWorkspacePointerMove = useCallback(
    (event?: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => {
      const stage = stageRef.current;
      if (!stage || !activeToolController.onPointerMove) {
        return;
      }

      event?.evt.preventDefault();
      activeToolController.onPointerMove(activeToolContext, {
        canvasPoint: toCanvasPoint(stage),
        screenPoint: toScreenPoint(stage),
      });
    },
    [
      activeToolController,
      activeToolContext,
      stageRef,
      toCanvasPoint,
      toScreenPoint,
    ]
  );

  const handleWorkspacePointerUp = useCallback(
    (event?: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => {
      if (!activeToolController.onPointerUp && !shouldPan) {
        return;
      }
      event?.evt.preventDefault();
      const stage = stageRef.current;
      activeToolController.onPointerUp?.(activeToolContext, {
        canvasPoint: stage ? toCanvasPoint(stage) : null,
        screenPoint: stage ? toScreenPoint(stage) : null,
      });
    },
    [
      activeToolController,
      activeToolContext,
      shouldPan,
      stageRef,
      toCanvasPoint,
      toScreenPoint,
    ]
  );

  const handleElementSelect = useCallback(
    (elementId: string, additive: boolean) => {
      const element = elementByIdRef.current.get(elementId);
      if (!element || element.effectiveLocked || !element.effectiveVisible) {
        return;
      }

      selectElement(elementId, { additive });
    },
    [selectElement]
  );

  const handleElementDragEnd = useCallback(
    (elementId: string, x: number, y: number) => {
      const element = elementByIdRef.current.get(elementId);
      if (!activeWorkbenchId || !element || element.effectiveLocked || !element.effectiveVisible) {
        return;
      }

      void upsertElement({
        ...element,
        id: elementId,
        x,
        y,
      });
    },
    [activeWorkbenchId, upsertElement]
  );

  const handleTextElementDoubleClick = useCallback(
    (elementId: string) => {
      const element = elementByIdRef.current.get(elementId);
      if (element?.type !== "text" || !isCanvasTextElementEditable(element)) {
        return;
      }

      beginTextEdit(element);
    },
    [beginTextEdit]
  );
  const { selectionOverlay, toolbarPosition, dimensionsBadgePosition, editingTextLayout } =
    useCanvasViewportOverlay({
      stageRef,
      stageSize,
      viewport,
      zoom,
      trackedOverlayId: textRuntimeViewModel.trackedOverlayId,
      textOverlayModel: textRuntimeViewModel.textOverlayModel,
      textEditorModel: textRuntimeViewModel.activeTextEditorModel,
      singleSelectedNonTextElement,
      textToolbarRef,
      dimensionsBadgeRef,
      toolbarSize: DEFAULT_TEXT_TOOLBAR_SIZE,
      dimensionsBadgeSize: DEFAULT_DIMENSIONS_BADGE_SIZE,
      floatingToolbarGap: FLOATING_TOOLBAR_GAP,
      activeWorkbenchUpdatedAt: activeWorkbench?.updatedAt,
    });
  const showDimensionsBadge = Boolean(
    selectionOverlay && singleSelectedNonTextElement && selectedElementIds.length === 1
  );

  if (!activeWorkbench) {
    return (
      <div className="absolute inset-0 flex items-center justify-center text-sm text-zinc-500">
        Create or open a 工作台 to start composing on canvas.
      </div>
    );
  }

  return (
    <div
      ref={viewportContainerRef}
      className="absolute inset-0"
      style={{
        cursor,
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
        onWheel={handleStageWheel}
        onMouseDown={handleWorkspacePointerDown}
        onTouchStart={handleWorkspacePointerDown}
        onMouseMove={handleWorkspacePointerMove}
        onTouchMove={handleWorkspacePointerMove}
        onMouseUp={handleWorkspacePointerUp}
        onTouchEnd={handleWorkspacePointerUp}
        onTouchCancel={handleWorkspacePointerUp}
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
            width={activeWorkbench.width}
            height={activeWorkbench.height}
            fill={activeWorkbench.backgroundColor}
            listening={false}
            perfectDrawEnabled={false}
          />

          {activeWorkbench.guides.showSafeArea ? (
            <Rect
              x={activeWorkbench.safeArea.left}
              y={activeWorkbench.safeArea.top}
              width={Math.max(
                1,
                activeWorkbench.width - activeWorkbench.safeArea.left - activeWorkbench.safeArea.right
              )}
              height={Math.max(
                1,
                activeWorkbench.height - activeWorkbench.safeArea.top - activeWorkbench.safeArea.bottom
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
            activeEditingTextId={textRuntimeViewModel.activeEditingTextId}
            dragBoundFunc={dragBoundFunc}
            editingTextDraft={textRuntimeViewModel.renderedEditingTextDraft}
            elements={activeWorkbench.elements}
            interactivePreviewElementId={interactivePreviewElementId}
            onElementDragEnd={handleElementDragEnd}
            onElementSelect={handleElementSelect}
            onTextElementDoubleClick={handleTextElementDoubleClick}
          />
        </Layer>

        <Layer listening={false}>
          <CanvasSelectionOutlineLayer selectedElements={textRuntimeViewModel.displaySelectedElements} />
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
          {activeWorkbench.slices.map((slice) => {
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

      {textRuntimeViewModel.showEditingTextSelectionOutline && selectionOverlay ? (
        <div
          className="pointer-events-none absolute z-10"
          style={{
            left: selectionOverlay.rect.x,
            top: selectionOverlay.rect.y,
            width: Math.max(1, selectionOverlay.rect.width),
            height: Math.max(1, selectionOverlay.rect.height),
            border: `1.5px solid ${CANVAS_SELECTION_ACCENT}`,
            boxSizing: "border-box",
          }}
        />
      ) : null}

      {showDimensionsBadge && singleSelectedNonTextElement ? (
        <div
          ref={dimensionsBadgeRef}
          className="absolute z-20 rounded-[12px] border border-white/10 bg-black/90 px-3 py-2 text-sm font-semibold text-zinc-50 shadow-[0_20px_48px_-32px_rgba(0,0,0,0.95)] backdrop-blur-xl"
          style={{
            left: dimensionsBadgePosition.left,
            top: dimensionsBadgePosition.top,
          }}
        >
          {Math.round(
            singleSelectedNonTextElement.type === "group"
              ? singleSelectedNonTextElement.bounds.width
              : singleSelectedNonTextElement.width
          )}{" "}
          x{" "}
          {Math.round(
            singleSelectedNonTextElement.type === "group"
              ? singleSelectedNonTextElement.bounds.height
              : singleSelectedNonTextElement.height
          )}
        </div>
      ) : null}

      {textRuntimeViewModel.showTextToolbar &&
      textRuntimeViewModel.activeTextEditorModel &&
      selectionOverlay ? (
        <CanvasTextToolbar
          ref={textToolbarRef}
          element={textRuntimeViewModel.activeTextEditorModel}
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

      {textRuntimeViewModel.showTextEditor &&
      textRuntimeViewModel.activeTextEditorModel &&
      editingTextLayout ? (
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
              handleTextValueChange(event.target.value);
            }}
            onKeyDown={handleTextInputKeyDown}
            autoFocus
            placeholder={CANVAS_TEXT_EDITOR_PLACEHOLDER}
            spellCheck={false}
            wrap="off"
            className="absolute inset-0 m-0 w-full resize-none border-0 bg-transparent p-0 outline-none"
            style={{
              boxSizing: "border-box",
              color: textRuntimeViewModel.activeTextEditorModel.color,
              fontFamily: textRuntimeViewModel.activeTextEditorModel.fontFamily,
              fontSize: textRuntimeViewModel.activeTextEditorModel.fontSize,
              lineHeight: CANVAS_TEXT_LINE_HEIGHT_MULTIPLIER,
              overflow: "hidden",
              textAlign: textRuntimeViewModel.activeTextEditorModel.textAlign,
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
          aria-label="Center 工作台"
          title="Center 工作台"
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
