import type Konva from "konva";
import { Crosshair, Hand, Minus, MousePointer2, Plus } from "lucide-react";
import { useCallback, useEffect, useMemo, useState, type RefObject } from "react";
import { cn } from "@/lib/utils";
import { useAssetStore } from "@/stores/assetStore";
import { useCanvasStore } from "@/stores/canvasStore";
import { CanvasViewportOverlayHost } from "./CanvasViewportOverlayHost";
import { CanvasViewportStageShell } from "./CanvasViewportStageShell";
import { VIEWPORT_INSETS } from "./canvasViewportConstants";
import { useCanvasActiveWorkbenchCommands } from "./hooks/useCanvasActiveWorkbenchCommands";
import { useCanvasActiveWorkbenchState } from "./hooks/useCanvasActiveWorkbenchState";
import { useCanvasInteraction } from "./hooks/useCanvasInteraction";
import { useCanvasDisplaySelectedElementIds } from "./hooks/useCanvasSelectionModel";
import { useCanvasTextSessionPort } from "./hooks/useCanvasTextSessionPort";
import { useCanvasViewportInteractionController } from "./hooks/useCanvasViewportInteractionController";
import { useCanvasViewportLifecycle } from "./hooks/useCanvasViewportLifecycle";
import { useCanvasViewportResizeController } from "./hooks/useCanvasViewportResizeController";
import { useCanvasViewportSceneState } from "./hooks/useCanvasViewportSceneState";
import {
  useCanvasViewportTextEditingController,
  useCanvasViewportTextSessionController,
} from "./hooks/useCanvasViewportTextEditingController";
import {
  shouldCanvasToolSelectElements,
  type CanvasToolName,
} from "./tools/toolControllers";
import type { CanvasInteractionNotice } from "./viewportOverlay";

interface CanvasViewportProps {
  stageRef: RefObject<Konva.Stage>;
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
        aria-label="Center 宸ヤ綔鍙?"
        title="Center 宸ヤ綔鍙?"
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

export function CanvasViewport({ stageRef }: CanvasViewportProps) {
  const { activeWorkbench, activeWorkbenchId } = useCanvasActiveWorkbenchState();
  const {
    beginInteraction,
    commitInteraction,
    executeCommand,
    previewCommand,
    rollbackInteraction,
    upsertElement,
  } = useCanvasActiveWorkbenchCommands();
  const tool = useCanvasStore((state) => state.tool);
  const activeShapeType = useCanvasStore((state) => state.activeShapeType);
  const setTool = useCanvasStore((state) => state.setTool);
  const zoom = useCanvasStore((state) => state.zoom);
  const setZoom = useCanvasStore((state) => state.setZoom);
  const viewport = useCanvasStore((state) => state.viewport);
  const setViewport = useCanvasStore((state) => state.setViewport);
  const assets = useAssetStore((state) => state.assets);
  const displaySelectedElementIds = useCanvasDisplaySelectedElementIds();
  const { selectedElementIds, setSelectedElementIds, selectElement, clearSelection } =
    useCanvasInteraction();
  const activeWorkbenchInteractionStatus = useCanvasStore((state) =>
    activeWorkbenchId ? state.interactionStatusByWorkbenchId[activeWorkbenchId] ?? null : null
  );
  const isViewportInteractionBlocked =
    (activeWorkbenchInteractionStatus?.queuedMutations ?? 0) > 0;
  const [interactionNotice, setInteractionNotice] = useState<CanvasInteractionNotice | null>(null);
  const assetById = useMemo(() => new Map(assets.map((asset) => [asset.id, asset])), [assets]);

  useEffect(() => {
    if (!interactionNotice) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setInteractionNotice(null);
    }, 2400);
    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [interactionNotice]);

  const handleInteractionError = useCallback((message: string) => {
    setInteractionNotice({
      type: "error",
      message,
    });
  }, []);

  const { fitView, isSpacePressed, stageSize, viewportContainerRef } =
    useCanvasViewportLifecycle({
      activeWorkbench,
      activeWorkbenchId,
      insets: VIEWPORT_INSETS,
      stageRef,
      setViewport,
      setZoom,
    });
  const canManipulateSelection = shouldCanvasToolSelectElements({
    shouldPan: tool === "hand" || isSpacePressed,
    tool,
  });
  const sceneState = useCanvasViewportSceneState({
    activeWorkbench,
    displaySelectedElementIds,
    selectedElementIds,
    stageSize,
    viewport,
    zoom,
  });
  const selectSingleElement = useCallback(
    (elementId: string) => {
      selectElement(elementId);
    },
    [selectElement]
  );
  const textSessionPort = useCanvasTextSessionPort({
    clearSelection,
    selectElement: selectSingleElement,
  });
  const textSessionState = useCanvasViewportTextSessionController({
    elementById: sceneState.elementById,
    port: textSessionPort,
    selectedElementIds,
    singleSelectedTextElement: sceneState.singleSelectedTextElement,
  });
  const interactionState = useCanvasViewportInteractionController({
    activeShapeType,
    activeWorkbench,
    activeWorkbenchId,
    beginInteraction,
    beginTextEdit: textSessionState.textSessionActions.begin,
    clearSelection,
    commitInteraction,
    elementByIdRef: sceneState.elementByIdRef,
    fitView,
    isSpacePressed,
    onInteractionError: handleInteractionError,
    previewCommand,
    rollbackInteraction,
    selectElement,
    selectedElementIds,
    setSelectedElementIds,
    setTool,
    setViewport,
    setZoom,
    stageRef,
    stageSize,
    tool,
    upsertElement,
    viewport,
    viewportContainerRef,
    zoom,
  });
  const textEditingState = useCanvasViewportTextEditingController({
    activeWorkbench,
    activeWorkbenchId,
    displaySelectedElementIds,
    elementById: sceneState.elementById,
    executeCommand,
    hasMarqueeSession: interactionState.marquee.hasMarqueeSession,
    isMarqueeDragging: interactionState.marquee.isMarqueeDragging,
    selectedElementIds,
    singleSelectedTextElement: sceneState.singleSelectedTextElement,
    textSession: textSessionState.textSession,
    textSessionActions: textSessionState.textSessionActions,
  });
  const resizeState = useCanvasViewportResizeController({
    activeEditingTextId: textEditingState.textRuntimeViewModel.activeEditingTextId,
    assetById,
    activeWorkbench,
    activeWorkbenchId,
    canManipulateSelection,
    beginInteraction,
    commitInteraction,
    hasMarqueeSession: interactionState.marquee.hasMarqueeSession,
    interactionBlocked: isViewportInteractionBlocked,
    isMarqueeDragging: interactionState.marquee.isMarqueeDragging,
    onInteractionError: handleInteractionError,
    previewCommand,
    rollbackInteraction,
    selectedElementIds,
    singleSelectedElement: sceneState.singleSelectedElement,
  });

  if (!activeWorkbench) {
    return (
      <div className="absolute inset-0 flex items-center justify-center text-sm text-zinc-500">
        Create or open a 宸ヤ綔鍙?to start composing on canvas.
      </div>
    );
  }

  const scene = {
    activeWorkbench,
    interactivePreviewElementId: sceneState.interactivePreviewElementId,
    workspaceGridBounds: sceneState.workspaceGridBounds,
  };
  const interaction = {
    ...interactionState.stage,
    handleElementTransform: resizeState.handleElementTransform,
    handleElementTransformEnd: resizeState.handleElementTransformEnd,
    handleElementTransformStart: resizeState.handleElementTransformStart,
    isMarqueeDragging: interactionState.marquee.isMarqueeDragging,
    marqueeRect: interactionState.marquee.marqueeRect,
    showTransformer: resizeState.showTransformer,
    };
  const textEditing = {
    activeEditingTextId: textEditingState.textRuntimeViewModel.activeEditingTextId,
    editingTextDraft: textEditingState.textRuntimeViewModel.renderedEditingTextDraft,
    onCancelTextEdit: textSessionState.textSessionActions.cancel,
    onCommitTextEdit: textSessionState.textSessionActions.commit,
    onFontFamilyChange: textEditingState.handleTextFontFamilyChange,
    onFontSizeTierChange: textEditingState.handleTextFontSizeTierChange,
    onTextColorChange: textEditingState.handleTextColorChange,
    onTextInputKeyDown: textSessionState.textSessionActions.handleInputKeyDown,
    onTextValueChange: textSessionState.textSessionActions.changeValue,
    runtimeViewModel: textEditingState.textRuntimeViewModel,
    selectedElements: textEditingState.textRuntimeViewModel.displaySelectedElements,
    session: textSessionState.textSession,
  };
  const overlay = {
    activeWorkbenchUpdatedAt: activeWorkbench.updatedAt,
    interactionNotice,
    suspendDocumentOverlaySync: Boolean(activeWorkbenchInteractionStatus?.active),
    previewDimensionsStore: resizeState.previewDimensionsStore,
    selectedElementCount: selectedElementIds.length,
    singleSelectedNonTextElement: sceneState.singleSelectedNonTextElement,
    stageRef,
    stageSize,
    viewport,
    zoom,
  };
  const resize = {
    showTransformer: resizeState.showTransformer,
    transformer: resizeState.transformer,
    transformerElementId: resizeState.transformerElementId,
  };

  return (
    <div className="absolute inset-0">
      <CanvasViewportStageShell
        interaction={interaction}
        resize={resize}
        scene={scene}
        textEditing={textEditing}
      />

      <CanvasViewportOverlayHost
        overlay={overlay}
        textEditing={textEditing}
      />

      <CanvasViewportControls
        adjustZoom={interactionState.controls.adjustZoom}
        resetView={interactionState.controls.resetView}
        setTool={setTool}
        shouldPan={interactionState.controls.shouldPan}
        tool={tool}
      />
    </div>
  );
}
