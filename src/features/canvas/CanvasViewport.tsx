import type Konva from "konva";
import { Crosshair, Hand, Minus, MousePointer2, Plus } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, type RefObject } from "react";
import { shallow } from "zustand/shallow";
import type { CanvasShapeElement } from "@/types";
import { cn } from "@/lib/utils";
import { useCanvasStore } from "@/stores/canvasStore";
import { CanvasViewportOverlayHost } from "./CanvasViewportOverlayHost";
import { CanvasViewportStageShell } from "./CanvasViewportStageShell";
import { VIEWPORT_INSETS } from "./canvasViewportConstants";
import { isCanvasTextElementEditable } from "./elements/TextElement";
import { getVisibleWorldGridBounds, quantizeDragPosition } from "./grid";
import { useCanvasActiveWorkbenchCommands } from "./hooks/useCanvasActiveWorkbenchCommands";
import { useCanvasActiveWorkbenchState } from "./hooks/useCanvasActiveWorkbenchState";
import { useCanvasInteraction } from "./hooks/useCanvasInteraction";
import { useCanvasMarqueeSelection } from "./hooks/useCanvasMarqueeSelection";
import { useCanvasSelectionModel } from "./hooks/useCanvasSelectionModel";
import { useCanvasTextRuntimeViewModel } from "./hooks/useCanvasTextRuntimeViewModel";
import { useCanvasTextSession } from "./hooks/useCanvasTextSession";
import { useCanvasViewportLifecycle } from "./hooks/useCanvasViewportLifecycle";
import { useCanvasViewportNavigation } from "./hooks/useCanvasViewportNavigation";
import { useCanvasViewportToolOrchestrator } from "./hooks/useCanvasViewportToolOrchestrator";
import { applyCanvasTextFontSizeTier } from "./textStyle";
import type { CanvasToolName } from "./tools/toolControllers";

interface CanvasViewportProps {
  stageRef: RefObject<Konva.Stage>;
  selectedSliceId?: string | null;
}

interface CanvasViewportControlsProps {
  adjustZoom: (direction: "in" | "out") => void;
  resetView: () => void;
  setTool: (tool: CanvasToolName) => void;
  shouldPan: boolean;
  tool: CanvasToolName;
}

function CanvasViewportControls({
  adjustZoom,
  resetView,
  setTool,
  shouldPan,
  tool,
}: CanvasViewportControlsProps) {
  return (
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
  );
}

export function CanvasViewport({ stageRef, selectedSliceId }: CanvasViewportProps) {
  const { activeWorkbench, activeWorkbenchId } = useCanvasActiveWorkbenchState();
  const { executeCommand, upsertElement } = useCanvasActiveWorkbenchCommands();
  const availableWorkbenchIds = useCanvasStore(
    (state) => state.workbenches.map((workbench) => workbench.id),
    shallow
  );
  const executeCommandInWorkbench = useCanvasStore((state) => state.executeCommandInWorkbench);
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

  const elementById = useMemo(
    () => new Map((activeWorkbench?.allNodes ?? []).map((element) => [element.id, element])),
    [activeWorkbench?.allNodes]
  );
  const elementByIdRef = useRef(elementById);

  useEffect(() => {
    elementByIdRef.current = elementById;
  }, [elementById]);

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
      singleSelectedElement && singleSelectedElement.type !== "text"
        ? singleSelectedElement
        : null,
    [singleSelectedElement]
  );

  const { fitView, isSpacePressed, stageSize, viewportContainerRef } =
    useCanvasViewportLifecycle({
      activeWorkbench,
      activeWorkbenchId,
      insets: VIEWPORT_INSETS,
      stageRef,
      setViewport,
      setZoom,
    });
  const shouldPan = tool === "hand" || isSpacePressed;
  const {
    adjustZoom,
    beginPanInteraction,
    cursor,
    endPanInteraction,
    handleStageWheel,
    resetView,
    toCanvasPoint,
    toScreenPoint,
    updatePanInteraction,
  } = useCanvasViewportNavigation({
    fitView,
    shouldPan,
    stageRef,
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
    actions: textSessionActions,
    session: textSession,
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
  });
  const textRuntimeViewModel = useCanvasTextRuntimeViewModel({
    activeWorkbenchId,
    displaySelectedElementIds,
    hasMarqueeSession,
    isMarqueeDragging,
    nodeById: elementById,
    selectedElementIds,
    textSession,
  });

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

  const {
    handleWorkspacePointerDown,
    handleWorkspacePointerMove,
    handleWorkspacePointerUp,
  } = useCanvasViewportToolOrchestrator({
    activeShapeType,
    activeWorkbench,
    activeWorkbenchId,
    beginMarqueeInteraction,
    beginPanInteraction,
    beginTextEdit: textSessionActions.begin,
    clearSelection,
    commitMarqueeInteraction,
    endPanInteraction,
    insertShapeElement,
    selectElement: (elementId: string) => {
      selectElement(elementId);
    },
    setTool,
    shouldPan,
    stageRef,
    toCanvasPoint,
    toScreenPoint,
    tool,
    updateMarqueeInteraction,
    updatePanInteraction,
  });

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

      const dx = x - element.x;
      const dy = y - element.y;
      if (dx === 0 && dy === 0) {
        return;
      }

      void executeCommand({
        type: "MOVE_NODES",
        ids: [elementId],
        dx,
        dy,
      });
    },
    [activeWorkbenchId, executeCommand]
  );

  const handleTextElementDoubleClick = useCallback(
    (elementId: string) => {
      const element = elementByIdRef.current.get(elementId);
      if (!element?.type || element.type !== "text" || !isCanvasTextElementEditable(element)) {
        return;
      }

      textSessionActions.begin(element);
    },
    [textSessionActions]
  );

  const handleTextColorChange = useCallback(
    (color: string) => {
      textSessionActions.updateDraft((element) => ({
        ...element,
        color,
      }));
    },
    [textSessionActions]
  );

  const handleTextFontFamilyChange = useCallback(
    (fontFamily: string) => {
      textSessionActions.updateDraft((element) => ({
        ...element,
        fontFamily,
      }));
    },
    [textSessionActions]
  );

  const handleTextFontSizeTierChange = useCallback(
    (fontSizeTier: Parameters<typeof applyCanvasTextFontSizeTier>[1]) => {
      textSessionActions.updateDraft((element) =>
        applyCanvasTextFontSizeTier(element, fontSizeTier)
      );
    },
    [textSessionActions]
  );

  if (!activeWorkbench) {
    return (
      <div className="absolute inset-0 flex items-center justify-center text-sm text-zinc-500">
        Create or open a 工作台 to start composing on canvas.
      </div>
    );
  }

  return (
    <div className="absolute inset-0">
      <CanvasViewportStageShell
        activeEditingTextId={textRuntimeViewModel.activeEditingTextId}
        activeWorkbench={activeWorkbench}
        centerGuideLines={centerGuideLines}
        containerRef={viewportContainerRef}
        cursor={cursor}
        dragBoundFunc={dragBoundFunc}
        editingTextDraft={textRuntimeViewModel.renderedEditingTextDraft}
        interactivePreviewElementId={interactivePreviewElementId}
        isMarqueeDragging={isMarqueeDragging}
        marqueeRect={marqueeRenderState.rect}
        onElementDragEnd={handleElementDragEnd}
        onElementSelect={handleElementSelect}
        onStageWheel={handleStageWheel}
        onTextElementDoubleClick={handleTextElementDoubleClick}
        onWorkspacePointerDown={handleWorkspacePointerDown}
        onWorkspacePointerMove={handleWorkspacePointerMove}
        onWorkspacePointerUp={handleWorkspacePointerUp}
        selectedElements={textRuntimeViewModel.displaySelectedElements}
        selectedSliceId={selectedSliceId}
        stageRef={stageRef}
        stageSize={stageSize}
        thirdsGuideLines={thirdsGuideLines}
        viewport={viewport}
        workspaceGridBounds={workspaceGridBounds}
        zoom={zoom}
      />

      <CanvasViewportOverlayHost
        activeWorkbenchUpdatedAt={activeWorkbench.updatedAt}
        editingTextId={textSession.id}
        editingTextValue={textSession.value}
        onCancelTextEdit={textSessionActions.cancel}
        onCommitTextEdit={textSessionActions.commit}
        onFontFamilyChange={handleTextFontFamilyChange}
        onFontSizeTierChange={handleTextFontSizeTierChange}
        onTextColorChange={handleTextColorChange}
        onTextInputKeyDown={textSessionActions.handleInputKeyDown}
        onTextValueChange={textSessionActions.changeValue}
        selectedElementCount={selectedElementIds.length}
        singleSelectedNonTextElement={singleSelectedNonTextElement}
        stageRef={stageRef}
        stageSize={stageSize}
        textRuntimeViewModel={textRuntimeViewModel}
        viewport={viewport}
        zoom={zoom}
      />

      <CanvasViewportControls
        adjustZoom={adjustZoom}
        resetView={resetView}
        setTool={setTool}
        shouldPan={shouldPan}
        tool={tool}
      />
    </div>
  );
}
