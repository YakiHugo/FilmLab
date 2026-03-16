import type Konva from "konva";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { Crosshair, Minus, Plus } from "lucide-react";
import { Circle, Layer, Line, Rect, Stage, Text as KonvaText, Transformer } from "react-konva";
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
  selectedSliceId?: string | null;
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

export function CanvasViewport({ stageRef, selectedSliceId }: CanvasViewportProps) {
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
  const [stageSize, setStageSize] = useState({ width: 800, height: 600 });

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
    const container = containerRef.current;
    if (!container) return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) {
        setStageSize({
          width: Math.round(entry.contentRect.width),
          height: Math.round(entry.contentRect.height),
        });
      }
    });
    observer.observe(container);
    setStageSize({
      width: container.clientWidth,
      height: container.clientHeight,
    });
    return () => observer.disconnect();
  }, []);

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

  const adjustZoom = (direction: "in" | "out") => {
    const scaleBy = 1.08;
    const nextZoom = clamp(direction === "in" ? zoom * scaleBy : zoom / scaleBy, 0.2, 4);
    setZoom(nextZoom);
  };

  const resetView = () => {
    setZoom(1);
    setViewport({ x: 0, y: 0 });
  };

  if (!activeDocument) {
    return (
      <div className="absolute inset-0 flex items-center justify-center text-sm text-zinc-500">
        Create or open a board to start composing on canvas.
      </div>
    );
  }

  const shouldPan = tool === "hand" || isSpacePressed;

  return (
    <div
      ref={containerRef}
      className="absolute inset-0"
      style={{ cursor: shouldPan ? (isPanning ? "grabbing" : "grab") : "default" }}
    >
      <Stage
        ref={stageRef}
        width={stageSize.width}
        height={stageSize.height}
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
            onMouseDown={(event) => {
              const stage = stageRef.current;
              if (!stage) {
                return;
              }
              const isBackgroundTarget = event.target === stage || event.target.id() === BACKGROUND_NODE_ID;
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
                      fill: "#f59e0b",
                      stroke: "#f59e0b",
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
                      fill:
                        shapeType === "rect" ? "rgba(245, 158, 11, 0.2)" : "rgba(245, 158, 11, 0.35)",
                      stroke: "#f59e0b",
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
                    stroke="#f59e0b"
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
                    fill="rgba(245, 158, 11, 0.18)"
                    stroke="#f59e0b"
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
                    fill="rgba(245, 158, 11, 0.22)"
                    stroke="#f59e0b"
                    strokeWidth={2}
                    dash={[8, 6]}
                  />
                )}
              </>
            )}

            <Transformer
              ref={transformerRef}
              rotateEnabled
              borderStroke="#f59e0b"
              anchorStroke="#f59e0b"
              anchorFill="#111111"
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

      <div className="absolute bottom-4 left-1/2 z-10 flex -translate-x-1/2 items-center gap-1 rounded-[24px] border border-white/10 bg-black/65 px-2 py-2 shadow-[0_20px_60px_-32px_rgba(0,0,0,0.95)] backdrop-blur-xl">
        <button
          type="button"
          onClick={() => adjustZoom("out")}
          className="flex h-10 w-10 items-center justify-center rounded-2xl text-zinc-300 transition hover:bg-white/10"
          aria-label="Zoom out"
        >
          <Minus className="h-4 w-4" />
        </button>
        <div className="min-w-[64px] rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-2 text-center text-xs text-zinc-200">
          {Math.round(zoom * 100)}%
        </div>
        <button
          type="button"
          onClick={() => adjustZoom("in")}
          className="flex h-10 w-10 items-center justify-center rounded-2xl text-zinc-300 transition hover:bg-white/10"
          aria-label="Zoom in"
        >
          <Plus className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={resetView}
          className="ml-1 flex h-10 items-center justify-center gap-2 rounded-2xl border border-white/10 px-3 text-xs text-zinc-200 transition hover:bg-white/10"
        >
          <Crosshair className="h-4 w-4" />
          100%
        </button>
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
          className="absolute resize-none rounded-lg border border-amber-300/40 bg-slate-950/85 p-2 text-sm text-zinc-100 outline-none"
          style={{
            left: editingTextElement.x * zoom + viewport.x,
            top: editingTextElement.y * zoom + viewport.y,
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
