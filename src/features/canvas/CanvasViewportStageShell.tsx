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
  interaction: {
    containerRef: RefObject<HTMLDivElement>;
    cursor: string;
    dragBoundFunc: (position: { x: number; y: number }) => { x: number; y: number };
    handleElementDragEnd: (elementId: string, x: number, y: number) => void;
    handleElementSelect: (elementId: string, additive: boolean) => void;
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
  scene: {
    activeWorkbench: CanvasWorkbench;
    centerGuideLines: number[][];
    interactivePreviewElementId: string | null;
    selectedSliceId?: string | null;
    thirdsGuideLines: number[][];
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

          <Rect
            id={BOARD_SURFACE_NODE_ID}
            x={0}
            y={0}
            width={scene.activeWorkbench.width}
            height={scene.activeWorkbench.height}
            fill={scene.activeWorkbench.backgroundColor}
            listening={false}
            perfectDrawEnabled={false}
          />

          {scene.activeWorkbench.guides.showSafeArea ? (
            <Rect
              x={scene.activeWorkbench.safeArea.left}
              y={scene.activeWorkbench.safeArea.top}
              width={Math.max(
                1,
                scene.activeWorkbench.width -
                  scene.activeWorkbench.safeArea.left -
                  scene.activeWorkbench.safeArea.right
              )}
              height={Math.max(
                1,
                scene.activeWorkbench.height -
                  scene.activeWorkbench.safeArea.top -
                  scene.activeWorkbench.safeArea.bottom
              )}
              stroke="rgba(255,255,255,0.22)"
              strokeWidth={1}
              dash={[10, 10]}
              listening={false}
            />
          ) : null}

          {scene.thirdsGuideLines.map((points, index) => (
            <Line
              key={`thirds-${index}`}
              points={points}
              stroke="rgba(255,255,255,0.14)"
              strokeWidth={1}
              dash={[10, 10]}
              listening={false}
            />
          ))}

          {scene.centerGuideLines.map((points, index) => (
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
            activeEditingTextId={textEditing.activeEditingTextId}
            dragBoundFunc={interaction.dragBoundFunc}
            editingTextDraft={textEditing.editingTextDraft}
            elements={scene.activeWorkbench.elements}
            interactivePreviewElementId={scene.interactivePreviewElementId}
            onElementDragEnd={interaction.handleElementDragEnd}
            onElementSelect={interaction.handleElementSelect}
            onTextElementDoubleClick={interaction.handleTextElementDoubleClick}
          />
        </Layer>

        <Layer listening={false}>
          <CanvasSelectionOutlineLayer
            stageRef={interaction.stageRef}
            selectedElements={textEditing.selectedElements}
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
              strokeWidth={1.5}
              dash={[8, 5]}
              strokeScaleEnabled={false}
            />
          ) : null}
        </Layer>

        <Layer listening={false}>
          {scene.activeWorkbench.slices.map((slice) => {
            const selected = slice.id === scene.selectedSliceId;
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
