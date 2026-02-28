import type Konva from "konva";
import { useEffect, useMemo, useRef, useState } from "react";
import { Circle, Layer, Line, Rect, Stage, Transformer } from "react-konva";
import type { CanvasElement, CanvasShapeElement, CanvasTextElement } from "@/types";
import { useAssetStore } from "@/stores/assetStore";
import { useCanvasStore } from "@/stores/canvasStore";
import { ImageElement } from "./elements/ImageElement";
import { ShapeElement } from "./elements/ShapeElement";
import { TextElement } from "./elements/TextElement";
import { registerCanvasStage } from "./hooks/canvasStageRegistry";
import { useCanvasInteraction } from "./hooks/useCanvasInteraction";

interface CanvasViewportProps {
  stageRef: React.RefObject<Konva.Stage>;
}

interface ShapeDraft {
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
}

const BACKGROUND_NODE_ID = "canvas-background";

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
  return tagName === "input" || tagName === "textarea" || tagName === "select" || target.isContentEditable;
};

export function CanvasViewport({ stageRef }: CanvasViewportProps) {
  const documents = useCanvasStore((state) => state.documents);
  const activeDocumentId = useCanvasStore((state) => state.activeDocumentId);
  const upsertElement = useCanvasStore((state) => state.upsertElement);
  const upsertElements = useCanvasStore((state) => state.upsertElements);
  const tool = useCanvasStore((state) => state.tool);
  const shapeType = useCanvasStore((state) => state.shapeType);
  const zoom = useCanvasStore((state) => state.zoom);
  const setZoom = useCanvasStore((state) => state.setZoom);
  const viewport = useCanvasStore((state) => state.viewport);
  const setViewport = useCanvasStore((state) => state.setViewport);
  const assets = useAssetStore((state) => state.assets);
  const { selectedElementIds, selectElement, clearSelection } = useCanvasInteraction();
  const transformerRef = useRef<Konva.Transformer>(null);
  const [isSpacePressed, setIsSpacePressed] = useState(false);
  const [isPanning, setIsPanning] = useState(false);
  const [shapeDraft, setShapeDraft] = useState<ShapeDraft | null>(null);
  const [editingTextId, setEditingTextId] = useState<string | null>(null);
  const [editingTextValue, setEditingTextValue] = useState("");
  const panningAnchorRef = useRef<{ x: number; y: number } | null>(null);
  const viewportAnchorRef = useRef<{ x: number; y: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const activeDocument = useMemo(
    () => documents.find((document) => document.id === activeDocumentId) ?? null,
    [documents, activeDocumentId]
  );

  const elementById = useMemo(
    () => new Map((activeDocument?.elements ?? []).map((element) => [element.id, element])),
    [activeDocument?.elements]
  );

  const assetUrlById = useMemo(() => {
    const map = new Map<string, string>();
    for (const asset of assets) {
      map.set(asset.id, asset.objectUrl);
    }
    return map;
  }, [assets]);

  const editingTextElement = useMemo(() => {
    if (!editingTextId) {
      return null;
    }
    const element = elementById.get(editingTextId);
    return element?.type === "text" ? element : null;
  }, [editingTextId, elementById]);

  useEffect(() => {
    const transformer = transformerRef.current;
    const stage = stageRef.current;
    if (!transformer || !stage) {
      return;
    }

    const nodes = selectedElementIds
      .map((id) => stage.findOne(`#${id}`))
      .filter((node): node is Konva.Node => Boolean(node));
    transformer.nodes(nodes);
    transformer.getLayer()?.batchDraw();
  }, [selectedElementIds, stageRef, activeDocument?.updatedAt]);

  useEffect(() => {
    registerCanvasStage(stageRef.current);
    return () => {
      registerCanvasStage(null);
    };
  }, [stageRef, activeDocumentId]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.code === "Space" && !isInputLikeElement(event.target)) {
        event.preventDefault();
        setIsSpacePressed(true);
      }
      if (event.key === "Escape") {
        setEditingTextId(null);
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
  }, []);

  const toCanvasPoint = (stage: Konva.Stage) => {
    const pointer = stage.getPointerPosition();
    if (!pointer) {
      return null;
    }
    return {
      x: (pointer.x - viewport.x) / zoom,
      y: (pointer.y - viewport.y) / zoom,
    };
  };

  const commitTextEdit = () => {
    if (!editingTextElement || !activeDocumentId) {
      setEditingTextId(null);
      return;
    }
    const nextContent = editingTextValue.trim();
    if (nextContent) {
      void upsertElement(activeDocumentId, {
        ...editingTextElement,
        content: nextContent,
      });
    }
    setEditingTextId(null);
  };

  if (!activeDocument) {
    return (
      <div className="flex h-[620px] items-center justify-center rounded-2xl border border-white/10 bg-black/35 text-sm text-zinc-500">
        Create or open a canvas document.
      </div>
    );
  }

  const shouldPan = tool === "hand" || isSpacePressed;

  return (
    <div
      ref={containerRef}
      className="relative overflow-auto rounded-2xl border border-white/10 bg-[#242426] p-6"
      style={{ cursor: shouldPan ? (isPanning ? "grabbing" : "grab") : "default" }}
    >
      <div className="mx-auto w-fit">
        <Stage
          ref={stageRef}
          width={activeDocument.width}
          height={activeDocument.height}
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
            const nextZoom = clamp(
              direction > 0 ? zoom * scaleBy : zoom / scaleBy,
              0.2,
              4
            );
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
          onMouseDown={(event) => {
            const stage = stageRef.current;
            if (!stage) {
              return;
            }
            const isBackgroundTarget =
              event.target === stage || event.target.id() === BACKGROUND_NODE_ID;
            const point = toCanvasPoint(stage);

            if (shouldPan && isBackgroundTarget) {
              const pointer = stage.getPointerPosition();
              if (!pointer) {
                return;
              }
              setIsPanning(true);
              panningAnchorRef.current = pointer;
              viewportAnchorRef.current = viewport;
              return;
            }

            if (!isBackgroundTarget || !point) {
              return;
            }

            if (tool === "select") {
              clearSelection();
              return;
            }

            if (tool === "text") {
              const elementId = createElementId();
              const textElement: CanvasTextElement = {
                id: elementId,
                type: "text",
                content: "Double-click to edit",
                x: point.x,
                y: point.y,
                width: 260,
                height: 72,
                rotation: 0,
                opacity: 1,
                locked: false,
                visible: true,
                zIndex: activeDocument.elements.length + 1,
                fontFamily: "Georgia",
                fontSize: 36,
                color: "#f5f5f5",
                textAlign: "left",
              };
              void upsertElement(activeDocument.id, textElement);
              selectElement(elementId);
              setEditingTextId(elementId);
              setEditingTextValue(textElement.content);
              return;
            }

            if (tool === "shape") {
              setShapeDraft({
                startX: point.x,
                startY: point.y,
                currentX: point.x,
                currentY: point.y,
              });
            }
          }}
          onMouseMove={() => {
            const stage = stageRef.current;
            if (!stage) {
              return;
            }
            if (isPanning && shouldPan) {
              const pointer = stage.getPointerPosition();
              if (!pointer || !panningAnchorRef.current || !viewportAnchorRef.current) {
                return;
              }
              setViewport({
                x: viewportAnchorRef.current.x + (pointer.x - panningAnchorRef.current.x),
                y: viewportAnchorRef.current.y + (pointer.y - panningAnchorRef.current.y),
              });
              return;
            }

            if (!shapeDraft || tool !== "shape") {
              return;
            }
            const point = toCanvasPoint(stage);
            if (!point) {
              return;
            }
            setShapeDraft((previous) =>
              previous
                ? {
                    ...previous,
                    currentX: point.x,
                    currentY: point.y,
                  }
                : null
            );
          }}
          onMouseUp={() => {
            if (isPanning) {
              setIsPanning(false);
            }
            if (!shapeDraft || tool !== "shape") {
              return;
            }

            const dx = shapeDraft.currentX - shapeDraft.startX;
            const dy = shapeDraft.currentY - shapeDraft.startY;
            if (Math.abs(dx) < 2 && Math.abs(dy) < 2) {
              setShapeDraft(null);
              return;
            }

            const nextElement: CanvasShapeElement =
              shapeType === "line"
                ? {
                    id: createElementId(),
                    type: "shape",
                    shape: "line",
                    x: shapeDraft.startX,
                    y: shapeDraft.startY,
                    width: dx,
                    height: dy,
                    rotation: 0,
                    opacity: 1,
                    locked: false,
                    visible: true,
                    zIndex: activeDocument.elements.length + 1,
                    fill: "#38bdf8",
                    stroke: "#38bdf8",
                    strokeWidth: 4,
                  }
                : {
                    id: createElementId(),
                    type: "shape",
                    shape: shapeType,
                    x: Math.min(shapeDraft.startX, shapeDraft.currentX),
                    y: Math.min(shapeDraft.startY, shapeDraft.currentY),
                    width: Math.max(1, Math.abs(dx)),
                    height: Math.max(1, Math.abs(dy)),
                    rotation: 0,
                    opacity: 1,
                    locked: false,
                    visible: true,
                    zIndex: activeDocument.elements.length + 1,
                    fill: shapeType === "rect" ? "rgba(56, 189, 248, 0.2)" : "rgba(56, 189, 248, 0.35)",
                    stroke: "#38bdf8",
                    strokeWidth: 2,
                  };

            void upsertElement(activeDocument.id, nextElement);
            selectElement(nextElement.id);
            setShapeDraft(null);
          }}
        >
          <Layer>
            <Rect
              id={BACKGROUND_NODE_ID}
              x={0}
              y={0}
              width={activeDocument.width}
              height={activeDocument.height}
              fill={activeDocument.backgroundColor}
              onClick={() => clearSelection()}
              onTap={() => clearSelection()}
            />
          </Layer>

          <Layer>
            {activeDocument.elements.map((element) => {
              const isSelected = selectedElementIds.includes(element.id);

              if (element.type === "image") {
                return (
                  <ImageElement
                    key={element.id}
                    element={element}
                    src={assetUrlById.get(element.assetId)}
                    isSelected={isSelected}
                    onSelect={(additive) => {
                      if (!element.locked) {
                        selectElement(element.id, { additive });
                      }
                    }}
                    onDragEnd={(x, y) => {
                      void upsertElement(activeDocument.id, {
                        ...element,
                        x,
                        y,
                      });
                    }}
                  />
                );
              }

              if (element.type === "text") {
                return (
                  <TextElement
                    key={element.id}
                    element={element}
                    isSelected={isSelected}
                    onSelect={(additive) => {
                      if (!element.locked) {
                        selectElement(element.id, { additive });
                      }
                    }}
                    onDoubleClick={() => {
                      setEditingTextId(element.id);
                      setEditingTextValue(element.content);
                    }}
                    onDragEnd={(x, y) => {
                      void upsertElement(activeDocument.id, {
                        ...element,
                        x,
                        y,
                      });
                    }}
                  />
                );
              }

              return (
                <ShapeElement
                  key={element.id}
                  element={element}
                  isSelected={isSelected}
                  onSelect={(additive) => {
                    if (!element.locked) {
                      selectElement(element.id, { additive });
                    }
                  }}
                  onDragEnd={(x, y) => {
                    void upsertElement(activeDocument.id, {
                      ...element,
                      x,
                      y,
                    });
                  }}
                />
              );
            })}

            {shapeDraft && tool === "shape" && (
              <>
                {shapeType === "line" && (
                  <Line
                    points={[
                      shapeDraft.startX,
                      shapeDraft.startY,
                      shapeDraft.currentX,
                      shapeDraft.currentY,
                    ]}
                    stroke="#38bdf8"
                    strokeWidth={3}
                    dash={[8, 6]}
                  />
                )}
                {shapeType === "rect" && (
                  <Rect
                    x={Math.min(shapeDraft.startX, shapeDraft.currentX)}
                    y={Math.min(shapeDraft.startY, shapeDraft.currentY)}
                    width={Math.abs(shapeDraft.currentX - shapeDraft.startX)}
                    height={Math.abs(shapeDraft.currentY - shapeDraft.startY)}
                    fill="rgba(56, 189, 248, 0.18)"
                    stroke="#38bdf8"
                    strokeWidth={2}
                    dash={[8, 6]}
                  />
                )}
                {shapeType === "circle" && (
                  <Circle
                    x={(shapeDraft.startX + shapeDraft.currentX) / 2}
                    y={(shapeDraft.startY + shapeDraft.currentY) / 2}
                    radius={
                      Math.min(
                        Math.abs(shapeDraft.currentX - shapeDraft.startX),
                        Math.abs(shapeDraft.currentY - shapeDraft.startY)
                      ) / 2
                    }
                    fill="rgba(56, 189, 248, 0.22)"
                    stroke="#38bdf8"
                    strokeWidth={2}
                    dash={[8, 6]}
                  />
                )}
              </>
            )}

            <Transformer
              ref={transformerRef}
              rotateEnabled
              borderStroke="#38bdf8"
              anchorStroke="#38bdf8"
              anchorFill="#0b1220"
              onTransformEnd={() => {
                const stage = stageRef.current;
                if (!stage || !activeDocumentId || selectedElementIds.length === 0) {
                  return;
                }
                const updates: CanvasElement[] = [];
                for (const selectedId of selectedElementIds) {
                  const element = elementById.get(selectedId);
                  const node = stage.findOne(`#${selectedId}`);
                  if (!element || !node) {
                    continue;
                  }
                  const scaleX = node.scaleX();
                  const scaleY = node.scaleY();
                  const baseWidth = element.width;
                  const baseHeight = element.height;

                  const nextWidth =
                    element.type === "shape" && element.shape === "line"
                      ? baseWidth * scaleX
                      : Math.max(1, Math.abs(baseWidth * scaleX));
                  const nextHeight =
                    element.type === "shape" && element.shape === "line"
                      ? baseHeight * scaleY
                      : Math.max(1, Math.abs(baseHeight * scaleY));

                  updates.push({
                    ...element,
                    x: node.x(),
                    y: node.y(),
                    width: nextWidth,
                    height: nextHeight,
                    rotation: node.rotation(),
                  });

                  node.scaleX(1);
                  node.scaleY(1);
                }
                if (updates.length > 0) {
                  void upsertElements(activeDocumentId, updates);
                }
              }}
            />
          </Layer>
        </Stage>
      </div>

      {editingTextElement && (
        <textarea
          value={editingTextValue}
          onChange={(event) => setEditingTextValue(event.target.value)}
          onBlur={commitTextEdit}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              setEditingTextId(null);
            }
            if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
              event.preventDefault();
              commitTextEdit();
            }
          }}
          autoFocus
          className="absolute resize-none rounded-lg border border-sky-300/40 bg-slate-950/85 p-2 text-sm text-zinc-100 outline-none"
          style={{
            left: editingTextElement.x * zoom + viewport.x + 24,
            top: editingTextElement.y * zoom + viewport.y + 24,
            width: Math.max(120, editingTextElement.width * zoom),
            height: Math.max(48, editingTextElement.height * zoom),
            fontFamily: editingTextElement.fontFamily,
            fontSize: Math.max(12, editingTextElement.fontSize * zoom),
            color: editingTextElement.color,
            textAlign: editingTextElement.textAlign,
            transform: `rotate(${editingTextElement.rotation}deg)`,
            transformOrigin: "top left",
          }}
        />
      )}
    </div>
  );
}
