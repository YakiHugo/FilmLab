import type Konva from "konva";
import { memo, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { Layer, Rect, Stage, Transformer } from "react-konva";
import type {
  CanvasRenderableElement,
  CanvasRenderableTextElement,
  CanvasTextElement,
  CanvasWorkbench,
} from "@/types";
import {
  CANVAS_SELECTION_ACCENT,
  CANVAS_SELECTION_ACCENT_FILL,
  WORKSPACE_BACKGROUND_NODE_ID,
} from "./canvasViewportConstants";
import { ImageElement } from "./elements/ImageElement";
import { ShapeElement } from "./elements/ShapeElement";
import { TextElement } from "./elements/TextElement";
import { GRID_SIZE } from "./grid";
import type { CanvasResizeTransformerConfig } from "./hooks/useCanvasViewportResizeController";
import { fitCanvasTextElementToContent } from "./textStyle";
import type { CanvasTextRuntimeSelectedElement } from "./textRuntimeViewModel";

const WORKSPACE_DOT_GRID_NODE_ID = "canvas-workspace-grid";
const DOT_RADIUS = 0.72;
const WORKSPACE_BACKGROUND_FILL = "rgb(38, 38, 38)";
const WORKSPACE_DOT_FILL = "rgb(68, 68, 68)";

interface CanvasSelectionOutlineRect {
  id: string;
  rotation: number;
  width: number;
  height: number;
  x: number;
  y: number;
}

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
  canManipulateElements: boolean;
  dragBoundFunc: (position: { x: number; y: number }) => { x: number; y: number };
  editingTextDraft: CanvasRenderableTextElement | CanvasTextElement | null;
  elements: CanvasRenderableElement[];
  onElementDragMove: (elementId: string, x: number, y: number) => void;
  onElementDragStart: (elementId: string, event: Konva.KonvaEventObject<DragEvent>) => void;
  interactivePreviewElementId: string | null;
  onElementDragEnd: (elementId: string, x: number, y: number) => void;
  onElementSelect: (elementId: string, additive: boolean) => void;
  onElementTransform: (elementId: string, event: Konva.KonvaEventObject<Event>) => void;
  onElementTransformEnd: (elementId: string, event: Konva.KonvaEventObject<Event>) => void;
  onElementTransformStart: (elementId: string, event: Konva.KonvaEventObject<Event>) => void;
  onTextElementDoubleClick: (elementId: string) => void;
}

const CanvasElementsLayer = memo(function CanvasElementsLayer({
  activeEditingTextId,
  canManipulateElements,
  dragBoundFunc,
  editingTextDraft,
  elements,
  onElementDragMove,
  onElementDragStart,
  interactivePreviewElementId,
  onElementDragEnd,
  onElementSelect,
  onElementTransform,
  onElementTransformEnd,
  onElementTransformStart,
  onTextElementDoubleClick,
}: CanvasElementsLayerProps) {
  return (
    <>
      {elements.map((element) => {
        if (element.type === "image") {
          return (
            <ImageElement
              key={element.id}
              canDrag={canManipulateElements}
              element={element}
              previewPriority={
                element.id === interactivePreviewElementId ? "interactive" : "background"
              }
              dragBoundFunc={dragBoundFunc}
              onSelect={onElementSelect}
              onDragMove={onElementDragMove}
              onDragStart={onElementDragStart}
              onDragEnd={onElementDragEnd}
              onTransform={onElementTransform}
              onTransformEnd={onElementTransformEnd}
              onTransformStart={onElementTransformStart}
            />
          );
        }

        if (element.type === "shape") {
          return (
            <ShapeElement
              key={element.id}
              canDrag={canManipulateElements}
              element={element}
              dragBoundFunc={dragBoundFunc}
              onSelect={onElementSelect}
              onDragMove={onElementDragMove}
              onDragStart={onElementDragStart}
              onDragEnd={onElementDragEnd}
              onTransform={onElementTransform}
              onTransformEnd={onElementTransformEnd}
              onTransformStart={onElementTransformStart}
            />
          );
        }

        const liveTextElement =
          editingTextDraft?.id === element.id ? editingTextDraft : element;
        return (
          <TextElement
            key={liveTextElement.id}
            canDrag={canManipulateElements}
            element={liveTextElement}
            isEditing={activeEditingTextId === liveTextElement.id}
            dragBoundFunc={dragBoundFunc}
            onSelect={onElementSelect}
            onDragMove={onElementDragMove}
            onDragStart={onElementDragStart}
            onDoubleClick={onTextElementDoubleClick}
            onDragEnd={onElementDragEnd}
            onTransform={onElementTransform}
            onTransformEnd={onElementTransformEnd}
            onTransformStart={onElementTransformStart}
          />
        );
      })}
    </>
  );
});

const CanvasSelectionOutlineLayer = memo(function CanvasSelectionOutlineLayer({
  stageRef,
  selectedElements,
  suppressSingleSelectionOutline,
}: {
  stageRef: RefObject<Konva.Stage>;
  selectedElements: CanvasTextRuntimeSelectedElement[];
  suppressSingleSelectionOutline: boolean;
}) {
  const baseOutlineRects = useMemo(
    () => selectedElements.map((element) => resolveBaseSelectionOutlineRect(element)),
    [selectedElements]
  );
  const selectionSnapshotKey = useMemo(
    () => selectedElements.map((element) => element.id).join("|"),
    [selectedElements]
  );
  const baseOutlineRectsRef = useRef(baseOutlineRects);
  const selectedElementsRef = useRef(selectedElements);
  const syncOutlineRectsRef = useRef<(() => void) | null>(null);
  const hideSingleSelectionOutline =
    suppressSingleSelectionOutline && selectedElements.length === 1;
  const [liveOutlineState, setLiveOutlineState] = useState<{
    rects: CanvasSelectionOutlineRect[] | null;
    selectionSnapshotKey: string;
  }>({
    rects: null,
    selectionSnapshotKey,
  });

  useEffect(() => {
    baseOutlineRectsRef.current = baseOutlineRects;
    selectedElementsRef.current = selectedElements;
  }, [baseOutlineRects, selectedElements]);

  useEffect(() => {
    if (hideSingleSelectionOutline) {
      syncOutlineRectsRef.current = null;
      setLiveOutlineState((current) =>
        current.selectionSnapshotKey === selectionSnapshotKey && current.rects === null
          ? current
          : {
              rects: null,
              selectionSnapshotKey,
            }
      );
      return;
    }

    const stage = stageRef.current;
    if (!stage || selectionSnapshotKey.length === 0) {
      syncOutlineRectsRef.current = null;
      setLiveOutlineState((current) =>
        current.selectionSnapshotKey === selectionSnapshotKey && current.rects === null
          ? current
          : {
              rects: null,
              selectionSnapshotKey,
            }
      );
      return;
    }

    const runtimeTargets = selectedElementsRef.current.map((element, index) => {
      const baseOutlineRect = baseOutlineRectsRef.current[index]!;
      if (element.type === "group") {
        return {
          baseOutlineRect,
          node: null,
        };
      }

      const node = stage.findOne(`#${element.id}`);
      return {
        baseOutlineRect,
        node: node ?? null,
      };
    });
    const trackedNodes = runtimeTargets
      .map((target) => target.node)
      .filter((node): node is Konva.Node => Boolean(node));

    if (trackedNodes.length === 0) {
      syncOutlineRectsRef.current = null;
      setLiveOutlineState((current) =>
        current.selectionSnapshotKey === selectionSnapshotKey && current.rects === null
          ? current
          : {
              rects: null,
              selectionSnapshotKey,
            }
      );
      return;
    }

    const syncOutlineRects = () => {
      const latestBaseOutlineRects = baseOutlineRectsRef.current;
      const nextOutlineRects = runtimeTargets.map((target, index) =>
        target.node
          ? resolveLiveSelectionOutlineRect(latestBaseOutlineRects[index]!, target.node)
          : latestBaseOutlineRects[index]!
      );
      setLiveOutlineState((current) =>
        current.selectionSnapshotKey === selectionSnapshotKey &&
        current.rects &&
        selectionOutlineRectsEqual(current.rects, nextOutlineRects)
          ? current
          : {
              rects: nextOutlineRects,
              selectionSnapshotKey,
            }
      );
    };
    syncOutlineRectsRef.current = syncOutlineRects;

    syncOutlineRects();

    trackedNodes.forEach((node) => {
      node.on("dragmove transform dragend transformend", syncOutlineRects);
    });

    return () => {
      trackedNodes.forEach((node) => {
        node.off("dragmove transform dragend transformend", syncOutlineRects);
      });
      if (syncOutlineRectsRef.current === syncOutlineRects) {
        syncOutlineRectsRef.current = null;
      }
    };
  }, [hideSingleSelectionOutline, selectionSnapshotKey, stageRef]);

  useEffect(() => {
    syncOutlineRectsRef.current?.();
  }, [baseOutlineRects, selectedElements]);

  const outlineRects =
    liveOutlineState.selectionSnapshotKey === selectionSnapshotKey && liveOutlineState.rects
      ? liveOutlineState.rects
      : baseOutlineRects;

  if (hideSingleSelectionOutline) {
    return null;
  }

  return (
    <>
      {outlineRects.map((outlineElement) => {
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
            strokeWidth={1}
            strokeScaleEnabled={false}
          />
        );
      })}
    </>
  );
});

const resolveBaseSelectionOutlineRect = (
  element: CanvasTextRuntimeSelectedElement
): CanvasSelectionOutlineRect =>
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
      : {
          id: element.id,
          rotation: element.rotation,
          x: element.x,
          y: element.y,
          width: element.width,
          height: element.height,
        };

const resolveLiveSelectionOutlineRect = (
  baseOutlineRect: CanvasSelectionOutlineRect,
  node: Konva.Node
): CanvasSelectionOutlineRect => {
  const scaleX = Math.abs(node.scaleX()) || 1;
  const scaleY = Math.abs(node.scaleY()) || 1;

  return {
    ...baseOutlineRect,
    rotation: node.rotation(),
    width: baseOutlineRect.width * scaleX,
    height: baseOutlineRect.height * scaleY,
    x: node.x(),
    y: node.y(),
  };
};

const selectionOutlineRectsEqual = (
  left: CanvasSelectionOutlineRect[],
  right: CanvasSelectionOutlineRect[]
) =>
  left.length === right.length &&
  left.every((rect, index) => {
    const candidate = right[index];
    if (!candidate) {
      return false;
    }

    return (
      rect.id === candidate.id &&
      Math.abs(rect.rotation - candidate.rotation) < 0.01 &&
      Math.abs(rect.width - candidate.width) < 0.5 &&
      Math.abs(rect.height - candidate.height) < 0.5 &&
      Math.abs(rect.x - candidate.x) < 0.5 &&
      Math.abs(rect.y - candidate.y) < 0.5
    );
  });

const CanvasSelectionTransformerLayer = memo(function CanvasSelectionTransformerLayer({
  stageRef,
  transformer,
  transformerElementId,
}: {
  stageRef: RefObject<Konva.Stage>;
  transformer: CanvasResizeTransformerConfig | null;
  transformerElementId: string | null;
}) {
  const transformerRef = useRef<Konva.Transformer>(null);
  const hasTransformer = Boolean(transformer);

  useEffect(() => {
    const transformerNode = transformerRef.current;
    const stage = stageRef.current;
    if (!transformerNode) {
      return;
    }

    if (!stage || !hasTransformer || !transformerElementId) {
      transformerNode.nodes([]);
      transformerNode.getLayer()?.batchDraw();
      return;
    }

    const attachedNode = stage.findOne<Konva.Node>(`#${transformerElementId}`);
    if (!attachedNode) {
      transformerNode.nodes([]);
      transformerNode.getLayer()?.batchDraw();
      return;
    }

    transformerNode.nodes([attachedNode]);
    transformerNode.getLayer()?.batchDraw();

    return () => {
      transformerNode.nodes([]);
      transformerNode.getLayer()?.batchDraw();
    };
  }, [hasTransformer, stageRef, transformerElementId]);

  if (!transformer || !transformerElementId) {
    return null;
  }

  const {
    anchorStyleFunc,
    boundBoxFunc,
    ...transformerProps
  } = transformer;

  return (
    <Transformer
      ref={transformerRef}
      {...transformerProps}
      anchorStyleFunc={anchorStyleFunc}
      boundBoxFunc={(oldBox, newBox) =>
        boundBoxFunc(oldBox, newBox, {
          activeAnchor: transformerRef.current?.getActiveAnchor() ?? null,
        })
      }
    />
  );
});

interface CanvasViewportStageShellProps {
  interaction: {
    canManipulateElements: boolean;
    containerRef: RefObject<HTMLDivElement>;
    cursor: string;
    dragBoundFunc: (position: { x: number; y: number }) => { x: number; y: number };
    handleElementDragMove: (elementId: string, x: number, y: number) => void;
    handleElementDragStart: (elementId: string, event: Konva.KonvaEventObject<DragEvent>) => void;
    handleElementDragEnd: (elementId: string, x: number, y: number) => void;
    handleElementSelect: (elementId: string, additive: boolean) => void;
    handleElementTransform: (elementId: string, event: Konva.KonvaEventObject<Event>) => void;
    handleElementTransformEnd: (elementId: string, event: Konva.KonvaEventObject<Event>) => void;
    handleElementTransformStart: (elementId: string, event: Konva.KonvaEventObject<Event>) => void;
    handleStageWheel: (event: Konva.KonvaEventObject<WheelEvent>) => void;
    handleTextElementDoubleClick: (elementId: string) => void;
    handleWorkspacePointerDown: (event: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => void;
    handleWorkspacePointerMove: (
      event?: Konva.KonvaEventObject<MouseEvent | TouchEvent>
    ) => void;
    handleWorkspacePointerUp: (
      event?: Konva.KonvaEventObject<MouseEvent | TouchEvent>
    ) => void;
    isMarqueeDragging: boolean;
    marqueeRect: { x: number; y: number; width: number; height: number } | null;
    stageRef: RefObject<Konva.Stage>;
    stageSize: {
      width: number;
      height: number;
    };
    viewport: {
      x: number;
      y: number;
    };
    zoom: number;
  };
  resize: {
    showTransformer: boolean;
    transformer: CanvasResizeTransformerConfig | null;
    transformerElementId: string | null;
  };
  scene: {
    activeWorkbench: CanvasWorkbench;
    interactivePreviewElementId: string | null;
    workspaceGridBounds: {
      x: number;
      y: number;
      width: number;
      height: number;
    };
  };
  textEditing: {
    activeEditingTextId: string | null;
    editingTextDraft: CanvasRenderableTextElement | CanvasTextElement | null;
    selectedElements: CanvasTextRuntimeSelectedElement[];
  };
}

export function CanvasViewportStageShell({
  interaction,
  resize,
  scene,
  textEditing,
}: CanvasViewportStageShellProps) {
  return (
    <div
      ref={interaction.containerRef}
      className="absolute inset-0"
      style={{
        cursor: interaction.cursor,
        touchAction: "none",
      }}
    >
      <Stage
        ref={interaction.stageRef}
        width={Math.max(interaction.stageSize.width, 1)}
        height={Math.max(interaction.stageSize.height, 1)}
        x={interaction.viewport.x}
        y={interaction.viewport.y}
        scaleX={interaction.zoom}
        scaleY={interaction.zoom}
        onWheel={interaction.handleStageWheel}
        onMouseDown={interaction.handleWorkspacePointerDown}
        onTouchStart={interaction.handleWorkspacePointerDown}
        onMouseMove={interaction.handleWorkspacePointerMove}
        onTouchMove={interaction.handleWorkspacePointerMove}
        onMouseUp={interaction.handleWorkspacePointerUp}
        onTouchEnd={interaction.handleWorkspacePointerUp}
        onTouchCancel={interaction.handleWorkspacePointerUp}
      >
        <Layer>
          <Rect
            id={WORKSPACE_BACKGROUND_NODE_ID}
            x={scene.workspaceGridBounds.x}
            y={scene.workspaceGridBounds.y}
            width={scene.workspaceGridBounds.width}
            height={scene.workspaceGridBounds.height}
            fill={WORKSPACE_BACKGROUND_FILL}
            perfectDrawEnabled={false}
          />

          <DotGrid bounds={scene.workspaceGridBounds} />
        </Layer>

        <Layer>
          <CanvasElementsLayer
            activeEditingTextId={textEditing.activeEditingTextId}
            canManipulateElements={interaction.canManipulateElements}
            dragBoundFunc={interaction.dragBoundFunc}
            editingTextDraft={textEditing.editingTextDraft}
            elements={scene.activeWorkbench.elements}
            interactivePreviewElementId={scene.interactivePreviewElementId}
            onElementDragMove={interaction.handleElementDragMove}
            onElementDragStart={interaction.handleElementDragStart}
            onElementDragEnd={interaction.handleElementDragEnd}
            onElementSelect={interaction.handleElementSelect}
            onElementTransform={interaction.handleElementTransform}
            onElementTransformEnd={interaction.handleElementTransformEnd}
            onElementTransformStart={interaction.handleElementTransformStart}
            onTextElementDoubleClick={interaction.handleTextElementDoubleClick}
          />
        </Layer>

        <Layer listening={false}>
          <CanvasSelectionOutlineLayer
            stageRef={interaction.stageRef}
            selectedElements={textEditing.selectedElements}
            suppressSingleSelectionOutline={resize.showTransformer}
          />
        </Layer>

        <Layer>
          <CanvasSelectionTransformerLayer
            stageRef={interaction.stageRef}
            transformer={resize.transformer}
            transformerElementId={resize.transformerElementId}
          />
        </Layer>

        <Layer listening={false}>
          {interaction.isMarqueeDragging && interaction.marqueeRect ? (
            <Rect
              x={interaction.marqueeRect.x}
              y={interaction.marqueeRect.y}
              width={Math.max(1, interaction.marqueeRect.width)}
              height={Math.max(1, interaction.marqueeRect.height)}
              fill={CANVAS_SELECTION_ACCENT_FILL}
              stroke={CANVAS_SELECTION_ACCENT}
              strokeWidth={1}
              strokeScaleEnabled={false}
            />
          ) : null}
        </Layer>
      </Stage>
    </div>
  );
}
