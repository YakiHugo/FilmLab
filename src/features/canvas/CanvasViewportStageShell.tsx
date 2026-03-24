import type Konva from "konva";
import { Fragment, memo, useEffect, useMemo, useState, type RefObject } from "react";
import { Layer, Line, Rect, Stage, Text as KonvaText } from "react-konva";
import type {
  CanvasRenderableElement,
  CanvasRenderableTextElement,
  CanvasTextElement,
  CanvasWorkbench,
} from "@/types";
import { createId } from "@/utils";
import {
  CANVAS_SELECTION_ACCENT,
  CANVAS_SELECTION_ACCENT_FILL,
  WORKSPACE_BACKGROUND_NODE_ID,
} from "./canvasViewportConstants";
import { ImageElement } from "./elements/ImageElement";
import { ShapeElement } from "./elements/ShapeElement";
import { TextElement } from "./elements/TextElement";
import { GRID_SIZE } from "./grid";
import { fitCanvasTextElementToContent } from "./textStyle";
import type { CanvasTextRuntimeSelectedElement } from "./textRuntimeViewModel";

const BOARD_SURFACE_NODE_ID = "canvas-background";
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

const CanvasSelectionOutlineLayer = memo(function CanvasSelectionOutlineLayer({
  stageRef,
  selectedElements,
}: {
  stageRef: RefObject<Konva.Stage>;
  selectedElements: CanvasTextRuntimeSelectedElement[];
}) {
  const baseOutlineRects = useMemo(
    () => selectedElements.map((element) => resolveBaseSelectionOutlineRect(element)),
    [selectedElements]
  );
  const selectionSnapshotKey = useMemo(
    () =>
      `${selectedElements.map((element) => element.id).join("|")}::${createId("selection-outline")}`,
    [selectedElements]
  );
  const [liveOutlineState, setLiveOutlineState] = useState<{
    rects: CanvasSelectionOutlineRect[] | null;
    selectionSnapshotKey: string;
  }>({
    rects: null,
    selectionSnapshotKey,
  });

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage || selectedElements.length === 0) {
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

    const runtimeTargets = selectedElements.map((element, index) => {
      const baseOutlineRect = baseOutlineRects[index]!;
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
      const nextOutlineRects = runtimeTargets.map((target) =>
        target.node
          ? resolveLiveSelectionOutlineRect(target.baseOutlineRect, target.node)
          : target.baseOutlineRect
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

    syncOutlineRects();

    trackedNodes.forEach((node) => {
      node.on("dragmove transform dragend transformend", syncOutlineRects);
    });

    return () => {
      trackedNodes.forEach((node) => {
        node.off("dragmove transform dragend transformend", syncOutlineRects);
      });
    };
  }, [baseOutlineRects, selectedElements, selectionSnapshotKey, stageRef]);

  const outlineRects =
    liveOutlineState.selectionSnapshotKey === selectionSnapshotKey && liveOutlineState.rects
      ? liveOutlineState.rects
      : baseOutlineRects;

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
            strokeWidth={1.5}
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

interface CanvasViewportStageShellProps {
  activeEditingTextId: string | null;
  activeWorkbench: CanvasWorkbench;
  centerGuideLines: number[][];
  containerRef: RefObject<HTMLDivElement>;
  cursor: string;
  dragBoundFunc: (position: { x: number; y: number }) => { x: number; y: number };
  editingTextDraft: CanvasRenderableTextElement | CanvasTextElement | null;
  interactivePreviewElementId: string | null;
  isMarqueeDragging: boolean;
  marqueeRect: { x: number; y: number; width: number; height: number } | null;
  onElementDragEnd: (elementId: string, x: number, y: number) => void;
  onElementSelect: (elementId: string, additive: boolean) => void;
  onStageWheel: (event: Konva.KonvaEventObject<WheelEvent>) => void;
  onTextElementDoubleClick: (elementId: string) => void;
  onWorkspacePointerDown: (event: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => void;
  onWorkspacePointerMove: (event?: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => void;
  onWorkspacePointerUp: (event?: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => void;
  selectedElements: CanvasTextRuntimeSelectedElement[];
  selectedSliceId?: string | null;
  stageRef: RefObject<Konva.Stage>;
  stageSize: {
    width: number;
    height: number;
  };
  thirdsGuideLines: number[][];
  viewport: {
    x: number;
    y: number;
  };
  workspaceGridBounds: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  zoom: number;
}

export function CanvasViewportStageShell({
  activeEditingTextId,
  activeWorkbench,
  centerGuideLines,
  containerRef,
  cursor,
  dragBoundFunc,
  editingTextDraft,
  interactivePreviewElementId,
  isMarqueeDragging,
  marqueeRect,
  onElementDragEnd,
  onElementSelect,
  onStageWheel,
  onTextElementDoubleClick,
  onWorkspacePointerDown,
  onWorkspacePointerMove,
  onWorkspacePointerUp,
  selectedElements,
  selectedSliceId,
  stageRef,
  stageSize,
  thirdsGuideLines,
  viewport,
  workspaceGridBounds,
  zoom,
}: CanvasViewportStageShellProps) {
  return (
    <div
      ref={containerRef}
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
        onWheel={onStageWheel}
        onMouseDown={onWorkspacePointerDown}
        onTouchStart={onWorkspacePointerDown}
        onMouseMove={onWorkspacePointerMove}
        onTouchMove={onWorkspacePointerMove}
        onMouseUp={onWorkspacePointerUp}
        onTouchEnd={onWorkspacePointerUp}
        onTouchCancel={onWorkspacePointerUp}
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
                activeWorkbench.width -
                  activeWorkbench.safeArea.left -
                  activeWorkbench.safeArea.right
              )}
              height={Math.max(
                1,
                activeWorkbench.height -
                  activeWorkbench.safeArea.top -
                  activeWorkbench.safeArea.bottom
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
            activeEditingTextId={activeEditingTextId}
            dragBoundFunc={dragBoundFunc}
            editingTextDraft={editingTextDraft}
            elements={activeWorkbench.elements}
            interactivePreviewElementId={interactivePreviewElementId}
            onElementDragEnd={onElementDragEnd}
            onElementSelect={onElementSelect}
            onTextElementDoubleClick={onTextElementDoubleClick}
          />
        </Layer>

        <Layer listening={false}>
          <CanvasSelectionOutlineLayer stageRef={stageRef} selectedElements={selectedElements} />
        </Layer>

        <Layer listening={false}>
          {isMarqueeDragging && marqueeRect ? (
            <Rect
              x={marqueeRect.x}
              y={marqueeRect.y}
              width={Math.max(1, marqueeRect.width)}
              height={Math.max(1, marqueeRect.height)}
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
    </div>
  );
}
