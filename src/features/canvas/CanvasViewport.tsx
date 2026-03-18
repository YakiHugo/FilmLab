import type Konva from "konva";
import { Fragment, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { Crosshair, Hand, Minus, MousePointer2, Plus } from "lucide-react";
import { Layer, Line, Rect, Stage, Text as KonvaText, Transformer } from "react-konva";
import type { CanvasElement, CanvasTextElement } from "@/types";
import { cn } from "@/lib/utils";
import { useCanvasStore } from "@/stores/canvasStore";
import { ImageElement } from "./elements/ImageElement";
import { GRID_SIZE, snapPoint, snapRect } from "./grid";
import { TextElement } from "./elements/TextElement";
import { registerCanvasStage } from "./hooks/canvasStageRegistry";
import { useCanvasInteraction } from "./hooks/useCanvasInteraction";

interface CanvasViewportProps {
  stageRef: RefObject<Konva.Stage>;
  selectedSliceId?: string | null;
}

const BACKGROUND_NODE_ID = "canvas-background";
const DOT_RADIUS = 0.72;
const VIEWPORT_INSETS = {
  top: 88,
  right: 32,
  bottom: 104,
  left: 112,
};

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

function DotGrid({
  documentHeight,
  documentWidth,
}: {
  documentHeight: number;
  documentWidth: number;
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
    context.fillStyle = "rgba(255,255,255,0.18)";
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

  if (!dotGridPattern) {
    return null;
  }

  return (
    <Rect
      listening={false}
      perfectDrawEnabled={false}
      x={0}
      y={0}
      width={documentWidth}
      height={documentHeight}
      fillPatternImage={dotGridPattern}
      fillPatternRepeat="repeat"
      fillPatternX={0}
      fillPatternY={0}
    />
  );
}

export function CanvasViewport({ stageRef, selectedSliceId }: CanvasViewportProps) {
  const activeDocumentId = useCanvasStore((state) => state.activeDocumentId);
  const activeDocument = useCanvasStore((state) =>
    state.activeDocumentId
      ? state.documents.find((document) => document.id === state.activeDocumentId) ?? null
      : null
  );
  const upsertElement = useCanvasStore((state) => state.upsertElement);
  const upsertElements = useCanvasStore((state) => state.upsertElements);
  const tool = useCanvasStore((state) => state.tool);
  const setTool = useCanvasStore((state) => state.setTool);
  const zoom = useCanvasStore((state) => state.zoom);
  const setZoom = useCanvasStore((state) => state.setZoom);
  const viewport = useCanvasStore((state) => state.viewport);
  const setViewport = useCanvasStore((state) => state.setViewport);
  const { selectedElementIds, selectElement, clearSelection } = useCanvasInteraction();
  const transformerRef = useRef<Konva.Transformer>(null);
  const [isSpacePressed, setIsSpacePressed] = useState(false);
  const [isPanning, setIsPanning] = useState(false);
  const [editingTextId, setEditingTextId] = useState<string | null>(null);
  const [editingTextValue, setEditingTextValue] = useState("");
  const panningAnchorRef = useRef<{ x: number; y: number } | null>(null);
  const viewportAnchorRef = useRef<{ x: number; y: number } | null>(null);
  const initializedDocumentIdsRef = useRef<Set<string>>(new Set());
  const [stageSize, setStageSize] = useState(() => ({
    width: typeof window === "undefined" ? 0 : window.innerWidth,
    height: typeof window === "undefined" ? 0 : window.innerHeight,
  }));

  const elementById = useMemo(
    () => new Map((activeDocument?.elements ?? []).map((element) => [element.id, element])),
    [activeDocument?.elements]
  );

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
    const updateStageSize = () => {
      setStageSize({
        width: window.innerWidth,
        height: window.innerHeight,
      });
    };
    updateStageSize();
    window.addEventListener("resize", updateStageSize);
    return () => {
      window.removeEventListener("resize", updateStageSize);
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
      className="absolute inset-0"
      style={{ cursor: shouldPan ? (isPanning ? "grabbing" : "grab") : "default" }}
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
            const snappedPoint = snapPoint(point);
            const elementId = createElementId();
            const textElement: CanvasTextElement = {
              id: elementId,
              type: "text",
              content: "Double-click to edit",
              x: snappedPoint.x,
              y: snappedPoint.y,
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
          }
        }}
        onMouseMove={() => {
          const stage = stageRef.current;
          if (!stage || !isPanning || !shouldPan) {
            return;
          }
          const pointer = stage.getPointerPosition();
          if (!pointer || !panningAnchorRef.current || !viewportAnchorRef.current) {
            return;
          }
          setViewport({
            x: viewportAnchorRef.current.x + (pointer.x - panningAnchorRef.current.x),
            y: viewportAnchorRef.current.y + (pointer.y - panningAnchorRef.current.y),
          });
        }}
        onMouseUp={() => {
          if (isPanning) {
            setIsPanning(false);
          }
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

          <DotGrid
            documentWidth={activeDocument.width}
            documentHeight={activeDocument.height}
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
                  isSelected={isSelected}
                  onSelect={(additive) => {
                    if (!element.locked) {
                      selectElement(element.id, { additive });
                    }
                  }}
                  onDragEnd={(x, y) => {
                    const snappedPosition = snapPoint({ x, y });
                    void upsertElement(activeDocument.id, {
                      ...element,
                      x: snappedPosition.x,
                      y: snappedPosition.y,
                    });
                  }}
                />
              );
            }

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
                  const snappedPosition = snapPoint({ x, y });
                  void upsertElement(activeDocument.id, {
                    ...element,
                    x: snappedPosition.x,
                    y: snappedPosition.y,
                  });
                }}
              />
            );
          })}

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

                const snappedRect = snapRect({
                  x: node.x(),
                  y: node.y(),
                  width: Math.max(1, Math.abs(element.width * node.scaleX())),
                  height: Math.max(1, Math.abs(element.height * node.scaleY())),
                });

                updates.push({
                  ...element,
                  x: snappedRect.x,
                  y: snappedRect.y,
                  width: Math.max(GRID_SIZE, snappedRect.width),
                  height: Math.max(GRID_SIZE, snappedRect.height),
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
