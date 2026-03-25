import type Konva from "konva";
import { useEffect, useRef, type KeyboardEventHandler, type RefObject } from "react";
import type { CanvasRenderableNode, CanvasTextFontSizeTier } from "@/types";
import {
  CANVAS_SELECTION_ACCENT,
  DEFAULT_DIMENSIONS_BADGE_SIZE,
  DEFAULT_TEXT_TOOLBAR_SIZE,
  FLOATING_TOOLBAR_GAP,
} from "./canvasViewportConstants";
import { CanvasTextToolbar } from "./CanvasTextToolbar";
import { useCanvasViewportOverlay } from "./hooks/useCanvasViewportOverlay";
import {
  CANVAS_TEXT_EDITOR_PLACEHOLDER,
  CANVAS_TEXT_LINE_HEIGHT_MULTIPLIER,
} from "./textStyle";
import type { CanvasTextRuntimeViewModel } from "./textRuntimeViewModel";

interface CanvasViewportOverlayHostProps {
  overlay: {
    activeWorkbenchUpdatedAt?: string;
    selectedElementCount: number;
    singleSelectedNonTextElement: Exclude<CanvasRenderableNode, { type: "text" }> | null;
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
  textEditing: {
    onCancelTextEdit: () => void;
    onCommitTextEdit: () => void;
    onFontFamilyChange: (fontFamily: string) => void;
    onFontSizeTierChange: (fontSizeTier: CanvasTextFontSizeTier) => void;
    onTextColorChange: (color: string) => void;
    onTextInputKeyDown: KeyboardEventHandler<HTMLTextAreaElement>;
    onTextValueChange: (nextValue: string) => void;
    runtimeViewModel: CanvasTextRuntimeViewModel;
    session: {
      id: string | null;
      value: string;
    };
  };
}

export function CanvasViewportOverlayHost({
  overlay,
  textEditing,
}: CanvasViewportOverlayHostProps) {
  const textToolbarRef = useRef<HTMLDivElement>(null);
  const dimensionsBadgeRef = useRef<HTMLDivElement>(null);
  const textEditorRef = useRef<HTMLDivElement>(null);

  const { selectionOverlay, toolbarPosition, dimensionsBadgePosition, editingTextLayout } =
    useCanvasViewportOverlay({
      stageRef: overlay.stageRef,
      stageSize: overlay.stageSize,
      viewport: overlay.viewport,
      zoom: overlay.zoom,
      trackedOverlayId: textEditing.runtimeViewModel.trackedOverlayId,
      textOverlayModel: textEditing.runtimeViewModel.textOverlayModel,
      textEditorModel: textEditing.runtimeViewModel.activeTextEditorModel,
      singleSelectedNonTextElement: overlay.singleSelectedNonTextElement,
      textToolbarRef,
      dimensionsBadgeRef,
      toolbarSize: DEFAULT_TEXT_TOOLBAR_SIZE,
      dimensionsBadgeSize: DEFAULT_DIMENSIONS_BADGE_SIZE,
      floatingToolbarGap: FLOATING_TOOLBAR_GAP,
      activeWorkbenchUpdatedAt: overlay.activeWorkbenchUpdatedAt,
    });
  const editingTextId = textEditing.session.id;
  const editingTextValue = textEditing.session.value;
  const handleCancelTextEdit = textEditing.onCancelTextEdit;
  const handleCommitTextEdit = textEditing.onCommitTextEdit;

  useEffect(() => {
    if (!editingTextId) {
      return;
    }

    const handleWindowKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        handleCancelTextEdit();
      }
    };

    window.addEventListener("keydown", handleWindowKeyDown);
    return () => {
      window.removeEventListener("keydown", handleWindowKeyDown);
    };
  }, [editingTextId, handleCancelTextEdit]);

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

      handleCommitTextEdit();
    };

    document.addEventListener("pointerdown", handlePointerDown, true);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown, true);
    };
  }, [editingTextId, handleCommitTextEdit]);

  const showDimensionsBadge = Boolean(
    selectionOverlay &&
      overlay.singleSelectedNonTextElement &&
      overlay.selectedElementCount === 1
  );

  return (
    <>
      {textEditing.runtimeViewModel.showEditingTextSelectionOutline && selectionOverlay ? (
        <div
          className="pointer-events-none absolute z-10"
          style={{
            left: selectionOverlay.rect.x,
            top: selectionOverlay.rect.y,
            width: Math.max(1, selectionOverlay.rect.width),
            height: Math.max(1, selectionOverlay.rect.height),
            border: `1px solid ${CANVAS_SELECTION_ACCENT}`,
            boxSizing: "border-box",
          }}
        />
      ) : null}

      {showDimensionsBadge && overlay.singleSelectedNonTextElement ? (
        <div
          ref={dimensionsBadgeRef}
          className="absolute z-20 rounded-[12px] border border-white/10 bg-black/90 px-3 py-2 text-sm font-semibold text-zinc-50 shadow-[0_20px_48px_-32px_rgba(0,0,0,0.95)] backdrop-blur-xl"
          style={{
            left: dimensionsBadgePosition.left,
            top: dimensionsBadgePosition.top,
          }}
        >
          {Math.round(
            overlay.singleSelectedNonTextElement.type === "group"
              ? overlay.singleSelectedNonTextElement.bounds.width
              : overlay.singleSelectedNonTextElement.width
          )}{" "}
          x{" "}
          {Math.round(
            overlay.singleSelectedNonTextElement.type === "group"
              ? overlay.singleSelectedNonTextElement.bounds.height
              : overlay.singleSelectedNonTextElement.height
          )}
        </div>
      ) : null}

      {textEditing.runtimeViewModel.showTextToolbar &&
      textEditing.runtimeViewModel.activeTextEditorModel &&
      selectionOverlay ? (
        <CanvasTextToolbar
          ref={textToolbarRef}
          element={textEditing.runtimeViewModel.activeTextEditorModel}
          position={toolbarPosition}
          onColorChange={textEditing.onTextColorChange}
          onFontFamilyChange={textEditing.onFontFamilyChange}
          onFontSizeTierChange={textEditing.onFontSizeTierChange}
        />
      ) : null}

      {textEditing.runtimeViewModel.showTextEditor &&
      textEditing.runtimeViewModel.activeTextEditorModel &&
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
            value={editingTextValue}
            onChange={(event) => {
              textEditing.onTextValueChange(event.target.value);
            }}
            onKeyDown={textEditing.onTextInputKeyDown}
            autoFocus
            placeholder={CANVAS_TEXT_EDITOR_PLACEHOLDER}
            spellCheck={false}
            wrap="off"
            className="absolute inset-0 m-0 w-full resize-none border-0 bg-transparent p-0 outline-none"
            style={{
              boxSizing: "border-box",
              color: textEditing.runtimeViewModel.activeTextEditorModel.color,
              fontFamily: textEditing.runtimeViewModel.activeTextEditorModel.fontFamily,
              fontSize: textEditing.runtimeViewModel.activeTextEditorModel.fontSize,
              lineHeight: CANVAS_TEXT_LINE_HEIGHT_MULTIPLIER,
              overflow: "hidden",
              textAlign: textEditing.runtimeViewModel.activeTextEditorModel.textAlign,
            }}
          />
        </div>
      ) : null}
    </>
  );
}
