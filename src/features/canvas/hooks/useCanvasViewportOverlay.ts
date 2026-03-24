import type Konva from "konva";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from "react";
import type { CanvasOverlayRect } from "../overlayGeometry";
import { resolveFloatingOverlayPosition } from "../overlayGeometry";
import type { CanvasTextEditorModel, CanvasTextOverlayModel } from "../textRuntimeViewModel";
import {
  getTextEditorLayout,
  overlayPositionEqual,
  resolveSelectionOverlayMetrics,
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
  trackedOverlayId: string | null;
  textOverlayModel: CanvasTextOverlayModel | null;
  textEditorModel: CanvasTextEditorModel | null;
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
  trackedOverlayId,
  textOverlayModel,
  textEditorModel,
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

  const syncSelectionOverlay = useCallback(() => {
    const stage = stageRef.current;
    if (!stage || !trackedOverlayId) {
      setSelectionOverlay((current) => (current ? null : current));
      return;
    }

    const node = stage.findOne(`#${trackedOverlayId}`);
    const nextOverlay = resolveSelectionOverlayMetrics({
      textOverlayModel,
      textMatrix:
        node && textOverlayModel && trackedOverlayId === textOverlayModel.id
          ? createTransformMatrix(node)
          : null,
      viewport,
      zoom,
      nodeRect: node ? getSelectionOverlayRect(node) : null,
    });
    if (!nextOverlay) {
      setSelectionOverlay((current) => (current ? null : current));
      return;
    }

    setSelectionOverlay((current) =>
      selectionOverlayEqual(current, nextOverlay) ? current : nextOverlay
    );
  }, [
    stageRef,
    trackedOverlayId,
    textOverlayModel,
    viewport,
    zoom,
  ]);

  useLayoutEffect(() => {
    syncSelectionOverlay();
  }, [activeWorkbenchUpdatedAt, syncSelectionOverlay, viewport.x, viewport.y, zoom]);

  const syncSelectionOverlayRef = useRef(syncSelectionOverlay);

  useEffect(() => {
    syncSelectionOverlayRef.current = syncSelectionOverlay;
  }, [syncSelectionOverlay]);

  useEffect(() => {
    const stage = stageRef.current;

    if (!stage || !trackedOverlayId) {
      setSelectionOverlay((current) => (current ? null : current));
      return;
    }

    const trackedNode = stage.findOne(`#${trackedOverlayId}`);
    if (!trackedNode) {
      syncSelectionOverlayRef.current();
      return;
    }
    const node = trackedNode as Konva.Node;

    const handleNodeChange = () => {
      syncSelectionOverlayRef.current();
    };

    node.on("dragmove transform dragend transformend", handleNodeChange);
    syncSelectionOverlayRef.current();

    return () => {
      node.off("dragmove transform dragend transformend", handleNodeChange);
    };
  }, [stageRef, trackedOverlayId]);

  useLayoutEffect(() => {
    if (!selectionOverlay || !textEditorModel || stageSize.width <= 0 || stageSize.height <= 0) {
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
    floatingToolbarGap,
    selectionOverlay,
    stageSize.height,
    stageSize.width,
    textEditorModel,
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
      textEditorModel
        ? getTextEditorLayout({
            element: textEditorModel,
            transform: selectionOverlay?.textMatrix ?? null,
            viewport,
            zoom,
          })
        : null,
    [textEditorModel, selectionOverlay?.textMatrix, viewport, zoom]
  );

  return {
    selectionOverlay,
    toolbarPosition,
    dimensionsBadgePosition,
    editingTextLayout,
  };
}
