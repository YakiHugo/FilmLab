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
  activeWorkbenchUpdatedAt?: string;
  editingTextId: string | null;
  editingTextValue: string;
  onCancelTextEdit: () => void;
  onCommitTextEdit: () => void;
  onFontFamilyChange: (fontFamily: string) => void;
  onFontSizeTierChange: (fontSizeTier: CanvasTextFontSizeTier) => void;
  onTextColorChange: (color: string) => void;
  onTextInputKeyDown: KeyboardEventHandler<HTMLTextAreaElement>;
  onTextValueChange: (nextValue: string) => void;
  selectedElementCount: number;
  singleSelectedNonTextElement: Exclude<CanvasRenderableNode, { type: "text" }> | null;
  stageRef: RefObject<Konva.Stage>;
  stageSize: {
    width: number;
    height: number;
  };
  textRuntimeViewModel: CanvasTextRuntimeViewModel;
  viewport: {
    x: number;
    y: number;
  };
  zoom: number;
}

export function CanvasViewportOverlayHost({
  activeWorkbenchUpdatedAt,
  editingTextId,
  editingTextValue,
  onCancelTextEdit,
  onCommitTextEdit,
  onFontFamilyChange,
  onFontSizeTierChange,
  onTextColorChange,
  onTextInputKeyDown,
  onTextValueChange,
  selectedElementCount,
  singleSelectedNonTextElement,
  stageRef,
  stageSize,
  textRuntimeViewModel,
  viewport,
  zoom,
}: CanvasViewportOverlayHostProps) {
  const textToolbarRef = useRef<HTMLDivElement>(null);
  const dimensionsBadgeRef = useRef<HTMLDivElement>(null);
  const textEditorRef = useRef<HTMLDivElement>(null);

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
      activeWorkbenchUpdatedAt,
    });

  useEffect(() => {
    if (!editingTextId) {
      return;
    }

    const handleWindowKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onCancelTextEdit();
      }
    };

    window.addEventListener("keydown", handleWindowKeyDown);
    return () => {
      window.removeEventListener("keydown", handleWindowKeyDown);
    };
  }, [editingTextId, onCancelTextEdit]);

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

      onCommitTextEdit();
    };

    document.addEventListener("pointerdown", handlePointerDown, true);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown, true);
    };
  }, [editingTextId, onCommitTextEdit]);

  const showDimensionsBadge = Boolean(
    selectionOverlay && singleSelectedNonTextElement && selectedElementCount === 1
  );

  return (
    <>
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
          onColorChange={onTextColorChange}
          onFontFamilyChange={onFontFamilyChange}
          onFontSizeTierChange={onFontSizeTierChange}
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
            value={editingTextValue}
            onChange={(event) => {
              onTextValueChange(event.target.value);
            }}
            onKeyDown={onTextInputKeyDown}
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
    </>
  );
}
