import type Konva from "konva";
import { useCallback, useEffect, useLayoutEffect, useMemo, useState, type RefObject } from "react";
import type { CanvasRenderableTextElement, CanvasTextElement } from "@/types";
import type { CanvasOverlayRect } from "../overlayGeometry";
import { resolveFloatingOverlayPosition } from "../overlayGeometry";
import {
  getDraftTextOverlayRect,
  getTextEditorLayout,
  overlayPositionEqual,
  resolveTrackedOverlayId,
  selectionOverlayEqual,
  type CanvasSelectionOverlayMetrics,
  type CanvasTextEditorLayout,
} from "../viewportOverlay";

const createTransformMatrix = (node: Konva.Node) => {
  const [a, b, c, d, e, f] = node.getAbsoluteTransform().getMatrix();
  return `matrix(${a}, ${b}, ${c}, ${d}, ${e}, ${f})`;
};

const getSelectionOverlayRect = (node: Konva.Node): CanvasOverlayRect => {
  const rect = node.getClientRect({
    skipShadow: true,
    skipStroke: true,
  });

  return {
    x: rect.x,
    y: rect.y,
    width: rect.width,
    height: rect.height,
  };
};

interface UseCanvasViewportOverlayOptions {
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
  selectedElementIds: string[];
  editingTextId: string | null;
  activeTextElement: CanvasTextElement | CanvasRenderableTextElement | null;
  activeTextElementIsEditable: boolean;
  editingTextRenderElement: CanvasTextElement | CanvasRenderableTextElement | null;
  textElementDraftRef: { current: CanvasTextElement | null };
  singleSelectedTextElement: CanvasRenderableTextElement | null;
  singleSelectedNonTextElement: { id: string } | null;
  textToolbarRef: RefObject<HTMLDivElement>;
  dimensionsBadgeRef: RefObject<HTMLDivElement>;
  toolbarSize: {
    width: number;
    height: number;
  };
  dimensionsBadgeSize: {
    width: number;
    height: number;
  };
  floatingToolbarGap: number;
  activeWorkbenchUpdatedAt?: string;
}

export function useCanvasViewportOverlay({
  stageRef,
  stageSize,
  viewport,
  zoom,
  selectedElementIds,
  editingTextId,
  activeTextElement,
  activeTextElementIsEditable,
  editingTextRenderElement,
  textElementDraftRef,
  singleSelectedTextElement,
  singleSelectedNonTextElement,
  textToolbarRef,
  dimensionsBadgeRef,
  toolbarSize,
  dimensionsBadgeSize,
  floatingToolbarGap,
  activeWorkbenchUpdatedAt,
}: UseCanvasViewportOverlayOptions): {
  selectionOverlay: CanvasSelectionOverlayMetrics | null;
  toolbarPosition: { left: number; top: number };
  dimensionsBadgePosition: { left: number; top: number };
  editingTextLayout: CanvasTextEditorLayout | null;
} {
  const [selectionOverlay, setSelectionOverlay] = useState<CanvasSelectionOverlayMetrics | null>(null);
  const [toolbarPosition, setToolbarPosition] = useState({
    left: 0,
    top: 0,
  });
  const [dimensionsBadgePosition, setDimensionsBadgePosition] = useState({
    left: 0,
    top: 0,
  });
  const trackedId = useMemo(
    () => resolveTrackedOverlayId(editingTextId, selectedElementIds),
    [editingTextId, selectedElementIds]
  );

  const syncSelectionOverlay = useCallback(() => {
    const stage = stageRef.current;
    if (!stage || !trackedId) {
      setSelectionOverlay((current) => (current ? null : current));
      return;
    }

    const node = stage.findOne(`#${trackedId}`);
    const trackedTextElement = editingTextId
      ? activeTextElementIsEditable
        ? (textElementDraftRef.current ?? activeTextElement)
        : null
      : singleSelectedTextElement;

    if (!node && !trackedTextElement) {
      setSelectionOverlay((current) => (current ? null : current));
      return;
    }

    const rect = node
      ? getSelectionOverlayRect(node)
      : trackedTextElement
        ? getDraftTextOverlayRect(trackedTextElement, viewport, zoom)
        : null;
    if (!rect) {
      setSelectionOverlay((current) => (current ? null : current));
      return;
    }

    const nextOverlay: CanvasSelectionOverlayMetrics = {
      rect,
      textMatrix:
        node && trackedTextElement && trackedId === trackedTextElement.id
          ? createTransformMatrix(node)
          : null,
    };

    setSelectionOverlay((current) =>
      selectionOverlayEqual(current, nextOverlay) ? current : nextOverlay
    );
  }, [
    activeTextElement,
    activeTextElementIsEditable,
    editingTextId,
    singleSelectedTextElement,
    stageRef,
    textElementDraftRef,
    trackedId,
    viewport,
    zoom,
  ]);

  useLayoutEffect(() => {
    syncSelectionOverlay();
  }, [activeWorkbenchUpdatedAt, syncSelectionOverlay, viewport.x, viewport.y, zoom]);

  useEffect(() => {
    const stage = stageRef.current;

    if (!stage || !trackedId) {
      setSelectionOverlay((current) => (current ? null : current));
      return;
    }

    const trackedNode = stage.findOne(`#${trackedId}`);
    if (!trackedNode) {
      setSelectionOverlay((current) => (current ? null : current));
      return;
    }
    const node = trackedNode as Konva.Node;

    const handleNodeChange = () => {
      syncSelectionOverlay();
    };

    node.on("dragmove transform dragend transformend", handleNodeChange);
    syncSelectionOverlay();

    return () => {
      node.off("dragmove transform dragend transformend", handleNodeChange);
    };
  }, [stageRef, syncSelectionOverlay, trackedId]);

  useLayoutEffect(() => {
    if (
      !selectionOverlay ||
      !activeTextElement ||
      activeTextElement.type !== "text" ||
      stageSize.width <= 0 ||
      stageSize.height <= 0
    ) {
      return;
    }

    const toolbarRect = textToolbarRef.current?.getBoundingClientRect();
    const nextPosition = resolveFloatingOverlayPosition({
      anchorRect: selectionOverlay.rect,
      containerHeight: stageSize.height,
      containerWidth: stageSize.width,
      gap: floatingToolbarGap,
      overlayHeight: Math.round(toolbarRect?.height ?? toolbarSize.height),
      overlayWidth: Math.round(toolbarRect?.width ?? toolbarSize.width),
    });

    setToolbarPosition((current) =>
      overlayPositionEqual(current, nextPosition) ? current : nextPosition
    );
  }, [
    activeTextElement,
    floatingToolbarGap,
    selectionOverlay,
    stageSize.height,
    stageSize.width,
    textToolbarRef,
    toolbarSize.height,
    toolbarSize.width,
  ]);

  useLayoutEffect(() => {
    if (
      !selectionOverlay ||
      !singleSelectedNonTextElement ||
      stageSize.width <= 0 ||
      stageSize.height <= 0
    ) {
      return;
    }

    const badgeRect = dimensionsBadgeRef.current?.getBoundingClientRect();
    const nextPosition = resolveFloatingOverlayPosition({
      anchorRect: selectionOverlay.rect,
      containerHeight: stageSize.height,
      containerWidth: stageSize.width,
      gap: floatingToolbarGap,
      overlayHeight: Math.round(badgeRect?.height ?? dimensionsBadgeSize.height),
      overlayWidth: Math.round(badgeRect?.width ?? dimensionsBadgeSize.width),
    });

    setDimensionsBadgePosition((current) =>
      overlayPositionEqual(current, nextPosition) ? current : nextPosition
    );
  }, [
    dimensionsBadgeRef,
    dimensionsBadgeSize.height,
    dimensionsBadgeSize.width,
    floatingToolbarGap,
    selectionOverlay,
    singleSelectedNonTextElement,
    stageSize.height,
    stageSize.width,
  ]);

  const editingTextLayout = useMemo(
    () =>
      editingTextRenderElement
        ? getTextEditorLayout({
            element: editingTextRenderElement,
            transform: selectionOverlay?.textMatrix ?? null,
            viewport,
            zoom,
          })
        : null,
    [editingTextRenderElement, selectionOverlay?.textMatrix, viewport, zoom]
  );

  return {
    selectionOverlay,
    toolbarPosition,
    dimensionsBadgePosition,
    editingTextLayout,
  };
}
