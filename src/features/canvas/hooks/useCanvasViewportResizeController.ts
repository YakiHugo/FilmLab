import type Konva from "konva";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  Asset,
  CanvasCommand,
  CanvasRenderableElement,
  CanvasRenderableNode,
  CanvasWorkbench,
} from "@/types";
import { CANVAS_SELECTION_ACCENT } from "../canvasViewportConstants";
import {
  constrainCanvasResizeBoxToAspectRatio,
  planCanvasElementResize,
  resolveMinimumCanvasImageDimensions,
  type CanvasResizePlan,
  type CanvasResizeTransformBox,
} from "../resizeGeometry";
import type { CanvasResizeMutableNode } from "../resizeNodePreview";
import { fitCanvasTextElementToContent } from "../textStyle";

const TRANSFORMER_ENABLED_ANCHORS = [
  "top-left",
  "top-center",
  "top-right",
  "middle-left",
  "middle-right",
  "bottom-left",
  "bottom-center",
  "bottom-right",
] as const;

const MIN_TRANSFORM_BOX_DIMENSION = 1;
const MIN_TRANSFORM_TEXT_FONT_SIZE = 8;

type TransformerShiftBehavior = "default" | "inverted" | "none";

export interface CanvasResizeTransformerConfig {
  anchorFill: string;
  anchorSize: number;
  anchorStyleFunc?: (anchor: Konva.Rect) => void;
  anchorStroke: string;
  anchorStrokeWidth: number;
  borderStroke: string;
  boundBoxFunc: (
    oldBox: CanvasResizeTransformBox,
    newBox: CanvasResizeTransformBox,
    context: { activeAnchor: string | null }
  ) => CanvasResizeTransformBox;
  enabledAnchors: string[];
  flipEnabled: boolean;
  ignoreStroke: boolean;
  keepRatio: boolean;
  rotateEnabled: boolean;
  shouldOverdrawWholeArea: boolean;
  shiftBehavior: TransformerShiftBehavior;
  useSingleNodeRotation: boolean;
}

interface UseCanvasViewportResizeControllerOptions {
  activeEditingTextId: string | null;
  assetById: Map<string, Asset>;
  activeWorkbench: CanvasWorkbench | null;
  activeWorkbenchId: string | null;
  canManipulateSelection: boolean;
  beginInteraction: () => { interactionId: string } | null;
  commitInteraction: (interactionId: string) => Promise<CanvasWorkbench | null>;
  hasMarqueeSession: boolean;
  interactionBlocked: boolean;
  isMarqueeDragging: boolean;
  onInteractionError: (message: string) => void;
  previewCommand: (interactionId: string, command: CanvasCommand) => CanvasWorkbench | null;
  rollbackInteraction: (interactionId: string) => CanvasWorkbench | null;
  selectedElementIds: string[];
  singleSelectedElement: CanvasRenderableNode | null;
}

const EDGE_ANCHOR_NAMES = new Set([
  "top-center",
  "middle-left",
  "middle-right",
  "bottom-center",
]);

export const resolveCanvasImageAspectRatio = ({
  asset,
  element,
}: {
  asset: Pick<Asset, "metadata"> | null | undefined;
  element: Pick<Extract<CanvasRenderableElement, { type: "image" }>, "height" | "width">;
}) => {
  const metadataWidth = asset?.metadata?.width;
  const metadataHeight = asset?.metadata?.height;

  if (
    typeof metadataWidth === "number" &&
    Number.isFinite(metadataWidth) &&
    metadataWidth > 0 &&
    typeof metadataHeight === "number" &&
    Number.isFinite(metadataHeight) &&
    metadataHeight > 0
  ) {
    return metadataWidth / metadataHeight;
  }

  if (element.width > 0 && element.height > 0) {
    return element.width / element.height;
  }

  return null;
};

export const resolveCanvasResizeAnchorStyle = (anchorName: string) => {
  if (EDGE_ANCHOR_NAMES.has(anchorName)) {
    const isHorizontalEdge =
      anchorName === "top-center" || anchorName === "bottom-center";

    return {
      width: isHorizontalEdge ? 18 : 6,
      height: isHorizontalEdge ? 6 : 18,
      offsetX: isHorizontalEdge ? 9 : 3,
      offsetY: isHorizontalEdge ? 3 : 9,
      cornerRadius: 999,
      fill: "rgba(24,24,27,0.72)",
      stroke: CANVAS_SELECTION_ACCENT,
      strokeWidth: 1.5,
    };
  }

  return {
    width: 8,
    height: 8,
    offsetX: 4,
    offsetY: 4,
    cornerRadius: 2,
    fill: CANVAS_SELECTION_ACCENT,
    stroke: "rgba(24,24,27,0.92)",
    strokeWidth: 1.5,
  };
};

export const canShowCanvasSelectionTransformer = ({
  activeEditingTextId,
  canManipulateSelection,
  hasMarqueeSession,
  interactionBlocked,
  isTransforming,
  isMarqueeDragging,
  selectedElement,
  selectedElementIds,
}: {
  activeEditingTextId: string | null;
  canManipulateSelection: boolean;
  hasMarqueeSession: boolean;
  interactionBlocked: boolean;
  isTransforming: boolean;
  isMarqueeDragging: boolean;
  selectedElement: CanvasRenderableNode | null;
  selectedElementIds: string[];
}) =>
  Boolean(
    canManipulateSelection &&
    (!interactionBlocked || isTransforming) &&
    selectedElement &&
      selectedElement.type !== "group" &&
      !selectedElement.effectiveLocked &&
      selectedElement.effectiveVisible &&
      selectedElementIds.length === 1 &&
      !hasMarqueeSession &&
      !isMarqueeDragging &&
      activeEditingTextId !== selectedElement.id
  );

const resolveTransformerRatioConfig = (
  element: CanvasRenderableElement
): Pick<CanvasResizeTransformerConfig, "keepRatio" | "shiftBehavior"> => {
  if (element.type === "image") {
    return {
      keepRatio: true,
      shiftBehavior: "inverted",
    };
  }

  if (element.type === "text") {
    return {
      keepRatio: true,
      shiftBehavior: "none",
    };
  }

  return {
    keepRatio: false,
    shiftBehavior: "none",
  };
};

const resolveCanvasTextAspectRatio = (
  element: Extract<CanvasRenderableElement, { type: "text" }>
) => {
  const layoutElement = fitCanvasTextElementToContent(element);
  return layoutElement.width > 0 && layoutElement.height > 0
    ? layoutElement.width / layoutElement.height
    : null;
};

const resolveMinimumTransformerDimensions = (element: CanvasRenderableElement) => {
  if (element.type === "image") {
    return {
      width: 32,
      height: 32,
    };
  }

  if (element.type !== "text") {
    return {
      width: MIN_TRANSFORM_BOX_DIMENSION,
      height: MIN_TRANSFORM_BOX_DIMENSION,
    };
  }

  const layoutElement = fitCanvasTextElementToContent(element);
  const minimumScale =
    MIN_TRANSFORM_TEXT_FONT_SIZE /
    Math.max(element.fontSize, MIN_TRANSFORM_TEXT_FONT_SIZE);

  return {
    width: Math.max(MIN_TRANSFORM_BOX_DIMENSION, layoutElement.width * minimumScale),
    height: Math.max(MIN_TRANSFORM_BOX_DIMENSION, layoutElement.height * minimumScale),
  };
};

type CanvasResizePreviewDimensions =
  | {
      elementId: string;
      width: number;
      height: number;
    }
  | null;

const previewDimensionsEqual = (
  left: CanvasResizePreviewDimensions,
  right: CanvasResizePreviewDimensions
) =>
  left === right ||
  (left !== null &&
    right !== null &&
    left.elementId === right.elementId &&
    left.width === right.width &&
    left.height === right.height);

const resolveShiftKeyState = (event: Event | undefined | null) =>
  Boolean(event && "shiftKey" in event && typeof event.shiftKey === "boolean" && event.shiftKey);

interface CanvasResizeSessionState {
  commitInteraction: ((interactionId: string) => Promise<CanvasWorkbench | null>) | null;
  elementId: string | null;
  interactionId: string | null;
  latestPlan: CanvasResizePlan | null;
  node: CanvasResizeMutableNode | null;
  previewCommand: ((interactionId: string, command: CanvasCommand) => CanvasWorkbench | null) | null;
  previewFrameId: number | null;
  rollbackInteraction: ((interactionId: string) => CanvasWorkbench | null) | null;
  sourceWorkbenchId: string | null;
  token: number;
}

export function useCanvasViewportResizeController({
  activeEditingTextId,
  assetById,
  activeWorkbench,
  activeWorkbenchId,
  canManipulateSelection,
  beginInteraction,
  commitInteraction,
  hasMarqueeSession,
  interactionBlocked,
  isMarqueeDragging,
  onInteractionError,
  previewCommand,
  rollbackInteraction,
  selectedElementIds,
  singleSelectedElement,
}: UseCanvasViewportResizeControllerOptions) {
  const [isTransforming, setIsTransforming] = useState(false);
  const selectedElement: CanvasRenderableElement | null =
    singleSelectedElement && singleSelectedElement.type !== "group"
      ? singleSelectedElement
      : null;
  const previewDimensionsRef = useRef<CanvasResizePreviewDimensions>(null);
  const previewDimensionsListenersRef = useRef(new Set<() => void>());
  const previewDimensionsNotificationFrameRef = useRef<number | null>(null);
  const selectedElementRef = useRef<CanvasRenderableElement | null>(selectedElement);
  const assetByIdRef = useRef(assetById);
  const activeWorkbenchRef = useRef(activeWorkbench);
  const isImageAspectUnlockedRef = useRef(false);
  const transformAnchorRef = useRef<string | null>(null);
  const transformSessionRef = useRef<CanvasResizeSessionState>({
    commitInteraction: null,
    elementId: null,
    interactionId: null,
    latestPlan: null,
    node: null,
    previewCommand: null,
    previewFrameId: null,
    rollbackInteraction: null,
    sourceWorkbenchId: null,
    token: 0,
  });

  useEffect(() => {
    selectedElementRef.current = selectedElement;
  }, [selectedElement]);

  useEffect(() => {
    assetByIdRef.current = assetById;
  }, [assetById]);

  useEffect(() => {
    activeWorkbenchRef.current = activeWorkbench;
  }, [activeWorkbench]);

  const setPreviewDimensions = useCallback((nextPreviewDimensions: CanvasResizePreviewDimensions) => {
    if (previewDimensionsEqual(previewDimensionsRef.current, nextPreviewDimensions)) {
      return;
    }

    previewDimensionsRef.current = nextPreviewDimensions;
    if (typeof window === "undefined") {
      previewDimensionsListenersRef.current.forEach((listener) => {
        listener();
      });
      return;
    }

    if (previewDimensionsNotificationFrameRef.current !== null) {
      return;
    }

    previewDimensionsNotificationFrameRef.current = window.requestAnimationFrame(() => {
      previewDimensionsNotificationFrameRef.current = null;
      previewDimensionsListenersRef.current.forEach((listener) => {
        listener();
      });
    });
  }, []);

  const previewDimensionsStore = useMemo(
    () => ({
      getSnapshot: () => previewDimensionsRef.current,
      subscribe: (listener: () => void) => {
        previewDimensionsListenersRef.current.add(listener);
        return () => {
          previewDimensionsListenersRef.current.delete(listener);
        };
      },
    }),
    []
  );

  const showTransformer = useMemo(
    () =>
      canShowCanvasSelectionTransformer({
        activeEditingTextId,
        canManipulateSelection,
        hasMarqueeSession,
        interactionBlocked,
        isTransforming,
        isMarqueeDragging,
        selectedElement,
        selectedElementIds,
      }),
    [
      activeEditingTextId,
      canManipulateSelection,
      hasMarqueeSession,
      interactionBlocked,
      isTransforming,
      isMarqueeDragging,
      selectedElement,
      selectedElementIds,
    ]
  );

  const imageAspectRatio = useMemo(() => {
    if (!selectedElement || selectedElement.type !== "image") {
      return null;
    }

    return resolveCanvasImageAspectRatio({
      asset: assetById.get(selectedElement.assetId) ?? null,
      element: selectedElement,
    });
  }, [assetById, selectedElement]);

  const textAspectRatio = useMemo(() => {
    if (!selectedElement || selectedElement.type !== "text") {
      return null;
    }

    return resolveCanvasTextAspectRatio(selectedElement);
  }, [selectedElement]);

  useEffect(() => {
    isImageAspectUnlockedRef.current = false;

    if (
      typeof window === "undefined" ||
      !showTransformer ||
      selectedElement?.type !== "image"
    ) {
      return;
    }

    const syncKeyboardState = (event: KeyboardEvent) => {
      isImageAspectUnlockedRef.current = event.shiftKey;
    };
    const resetKeyboardState = () => {
      isImageAspectUnlockedRef.current = false;
    };

    window.addEventListener("keydown", syncKeyboardState);
    window.addEventListener("keyup", syncKeyboardState);
    window.addEventListener("blur", resetKeyboardState);

    return () => {
      window.removeEventListener("keydown", syncKeyboardState);
      window.removeEventListener("keyup", syncKeyboardState);
      window.removeEventListener("blur", resetKeyboardState);
      isImageAspectUnlockedRef.current = false;
    };
  }, [selectedElement?.id, selectedElement?.type, showTransformer]);

  const transformerConfig = useMemo<CanvasResizeTransformerConfig | null>(() => {
    if (!showTransformer || !selectedElement) {
      return null;
    }

    const minimumDimensions = resolveMinimumTransformerDimensions(selectedElement);
    const lockedImageMinimumDimensions = resolveMinimumCanvasImageDimensions(imageAspectRatio);
    const ratioConfig = resolveTransformerRatioConfig(selectedElement);

    return {
      anchorFill: CANVAS_SELECTION_ACCENT,
      anchorSize: 8,
      anchorStyleFunc: (anchor) => {
        anchor.setAttrs(resolveCanvasResizeAnchorStyle(anchor.name().split(" ")[0] ?? ""));
      },
      anchorStroke: "rgba(24,24,27,0.92)",
      anchorStrokeWidth: 1.5,
      borderStroke: CANVAS_SELECTION_ACCENT,
      boundBoxFunc: (oldBox, newBox, { activeAnchor }) => {
        if (selectedElement.type === "image") {
          if (!transformAnchorRef.current && activeAnchor) {
            transformAnchorRef.current = activeAnchor;
          }

          if (
            transformAnchorRef.current &&
            activeAnchor &&
            transformAnchorRef.current !== activeAnchor
          ) {
            return oldBox;
          }

          if (imageAspectRatio && !isImageAspectUnlockedRef.current) {
            return constrainCanvasResizeBoxToAspectRatio({
              activeAnchor,
              aspectRatio: imageAspectRatio,
              minimumDimensions: lockedImageMinimumDimensions,
              newBox,
              oldBox,
            });
          }
        }

        if (selectedElement.type === "text" && textAspectRatio) {
          return constrainCanvasResizeBoxToAspectRatio({
            activeAnchor,
            aspectRatio: textAspectRatio,
            minimumDimensions,
            newBox,
            oldBox,
          });
        }

        if (
          newBox.width < minimumDimensions.width ||
          newBox.height < minimumDimensions.height
        ) {
          return oldBox;
        }

        return newBox;
      },
      enabledAnchors: Array.from(TRANSFORMER_ENABLED_ANCHORS),
      flipEnabled: false,
      ignoreStroke: true,
      keepRatio: ratioConfig.keepRatio,
      rotateEnabled: false,
      // Let the selected bounds proxy drag gestures so explicit selection stays movable.
      shouldOverdrawWholeArea: true,
      shiftBehavior: ratioConfig.shiftBehavior,
      useSingleNodeRotation: true,
    };
  }, [imageAspectRatio, selectedElement, showTransformer, textAspectRatio]);

  useEffect(() => {
    if (isTransforming) {
      return;
    }
    setPreviewDimensions(null);
    transformAnchorRef.current = null;
  }, [isTransforming, selectedElement?.id, setPreviewDimensions]);

  const resolvePlanForNode = useCallback((node: CanvasResizeMutableNode) => {
    const currentElement = selectedElementRef.current;
    const currentWorkbench = activeWorkbenchRef.current;
    if (!currentElement || !currentWorkbench) {
      return null;
    }

    const resolvedImageAspectRatio =
      currentElement.type === "image"
        ? resolveCanvasImageAspectRatio({
            asset: assetByIdRef.current.get(currentElement.assetId) ?? null,
            element: currentElement,
          })
        : null;

    return planCanvasElementResize({
      element: currentElement,
      imageAspectRatio: resolvedImageAspectRatio,
      preserveImageAspectRatio:
        currentElement.type === "image"
          ? !isImageAspectUnlockedRef.current
          : undefined,
      snapshot: {
        x: node.x(),
        y: node.y(),
        scaleX: node.scaleX(),
        scaleY: node.scaleY(),
      },
      workbench: currentWorkbench,
    });
  }, []);

  const flushResizePreview = useCallback(
    (session: CanvasResizeSessionState) => {
      if (!session.interactionId || !session.latestPlan || !session.elementId) {
        return true;
      }

      const command: CanvasCommand = {
        type: "UPDATE_NODE_PROPS",
        updates: [
          {
            id: session.elementId,
            patch: session.latestPlan.patch,
          },
        ],
      };
      const nextWorkbench = session.previewCommand?.(session.interactionId, command) ?? null;
      if (!nextWorkbench) {
        session.rollbackInteraction?.(session.interactionId);
        session.interactionId = null;
        return false;
      }

      const node = session.node;
      if (node) {
        if (Math.abs(node.scaleX() - 1) > 0.0001 || Math.abs(node.scaleY() - 1) > 0.0001) {
          node.scaleX(1);
          node.scaleY(1);
        }
        node.position({
          x: session.latestPlan.preview.x,
          y: session.latestPlan.preview.y,
        });
        node.getLayer()?.batchDraw();
      }

      return true;
    },
    []
  );

  const scheduleResizePreview = useCallback(
    (session: CanvasResizeSessionState) => {
      if (session.previewFrameId !== null) {
        return;
      }

      session.previewFrameId = window.requestAnimationFrame(() => {
        session.previewFrameId = null;
        if (!flushResizePreview(session)) {
          onInteractionError("Resize preview failed and was rolled back.");
        }
      });
    },
    [flushResizePreview, onInteractionError]
  );

  useEffect(
    () => () => {
      const session = transformSessionRef.current;
      if (previewDimensionsNotificationFrameRef.current !== null) {
        window.cancelAnimationFrame(previewDimensionsNotificationFrameRef.current);
        previewDimensionsNotificationFrameRef.current = null;
      }
      if (session.previewFrameId !== null) {
        window.cancelAnimationFrame(session.previewFrameId);
      }
      if (session.interactionId) {
        session.rollbackInteraction?.(session.interactionId);
      }
      transformSessionRef.current = {
        commitInteraction: null,
        elementId: null,
        interactionId: null,
        latestPlan: null,
        node: null,
        previewCommand: null,
        previewFrameId: null,
        rollbackInteraction: null,
        sourceWorkbenchId: null,
        token: session.token,
      };
    },
    []
  );

  useEffect(() => {
    const session = transformSessionRef.current;
    if (!session.interactionId || session.sourceWorkbenchId === activeWorkbenchId) {
      return;
    }

    if (session.previewFrameId !== null) {
      window.cancelAnimationFrame(session.previewFrameId);
    }
    session.rollbackInteraction?.(session.interactionId);
    transformSessionRef.current = {
      commitInteraction: null,
      elementId: null,
      interactionId: null,
      latestPlan: null,
      node: null,
      previewCommand: null,
      previewFrameId: null,
      rollbackInteraction: null,
      sourceWorkbenchId: null,
      token: session.token,
    };
    transformAnchorRef.current = null;
    isImageAspectUnlockedRef.current = false;
    setIsTransforming(false);
    setPreviewDimensions(null);
  }, [activeWorkbenchId, setPreviewDimensions]);

  const handleElementTransformStart = useCallback(
    (elementId: string, event: Konva.KonvaEventObject<Event>) => {
      if (!showTransformer || selectedElementRef.current?.id !== elementId) {
        return;
      }

      transformAnchorRef.current = null;
      isImageAspectUnlockedRef.current = resolveShiftKeyState(event.evt);
      const sessionToken = transformSessionRef.current.token + 1;
      const interaction = beginInteraction();
      const node = event.target as CanvasResizeMutableNode;
      if (!interaction) {
        node.getStage()?.findOne<Konva.Transformer>("Transformer")?.stopTransform();
        const currentElement = selectedElementRef.current;
        node.scaleX(1);
        node.scaleY(1);
        if (currentElement) {
          node.position({
            x: currentElement.x,
            y: currentElement.y,
          });
        }
        transformAnchorRef.current = null;
        isImageAspectUnlockedRef.current = false;
        setIsTransforming(false);
        setPreviewDimensions(null);
        event.cancelBubble = true;
        node.getLayer()?.batchDraw();
        return;
      }
      const session: CanvasResizeSessionState = {
        commitInteraction,
        elementId,
        interactionId: interaction.interactionId,
        latestPlan: null,
        node,
        previewCommand,
        previewFrameId: null,
        rollbackInteraction,
        sourceWorkbenchId: activeWorkbenchId,
        token: sessionToken,
      };
      transformSessionRef.current = session;
      setIsTransforming(true);

      const plan = resolvePlanForNode(node);
      if (!plan) {
        setPreviewDimensions(null);
        return;
      }

      session.latestPlan = plan;
      setPreviewDimensions({
        elementId,
        width: plan.preview.width,
        height: plan.preview.height,
      });
      scheduleResizePreview(session);
    },
    [
      activeWorkbenchId,
      beginInteraction,
      commitInteraction,
      previewCommand,
      resolvePlanForNode,
      rollbackInteraction,
      scheduleResizePreview,
      setPreviewDimensions,
      showTransformer,
    ]
  );

  const handleElementTransform = useCallback(
    (elementId: string, event: Konva.KonvaEventObject<Event>) => {
      const session = transformSessionRef.current;
      if (
        !showTransformer ||
        selectedElementRef.current?.id !== elementId ||
        session.elementId !== elementId
      ) {
        return;
      }

      isImageAspectUnlockedRef.current = resolveShiftKeyState(event.evt);
      const node = event.target as CanvasResizeMutableNode;
      session.node = node;
      const plan = resolvePlanForNode(node);
      if (!plan) {
        return;
      }

      session.latestPlan = plan;
      setPreviewDimensions({
        elementId,
        width: plan.preview.width,
        height: plan.preview.height,
      });
      scheduleResizePreview(session);
    },
    [resolvePlanForNode, scheduleResizePreview, setPreviewDimensions, showTransformer]
  );

  const handleElementTransformEnd = useCallback(
    (elementId: string, event: Konva.KonvaEventObject<Event>) => {
      const session = transformSessionRef.current;
      if (session.elementId !== elementId) {
        return;
      }

      isImageAspectUnlockedRef.current = resolveShiftKeyState(event.evt);
      const node = event.target as CanvasResizeMutableNode;
      session.node = node;
      const finalPlan = resolvePlanForNode(node);
      if (finalPlan) {
        session.latestPlan = finalPlan;
      }

      if (session.previewFrameId !== null) {
        window.cancelAnimationFrame(session.previewFrameId);
        session.previewFrameId = null;
      }
      if (!flushResizePreview(session)) {
        onInteractionError("Resize preview failed and was rolled back.");
      }

      const interactionId = session.interactionId;
      const sessionToken = session.token;
      const commitSessionInteraction = session.commitInteraction;
      transformSessionRef.current = {
        commitInteraction: null,
        elementId: null,
        interactionId: null,
        latestPlan: null,
        node: null,
        previewCommand: null,
        previewFrameId: null,
        rollbackInteraction: null,
        sourceWorkbenchId: null,
        token: sessionToken,
      };
      transformAnchorRef.current = null;
      isImageAspectUnlockedRef.current = false;
      setIsTransforming(false);
      setPreviewDimensions(null);

      if (!interactionId) {
        return;
      }

      void (commitSessionInteraction ?? commitInteraction)(interactionId)
        .then((nextWorkbench) => {
          if (!nextWorkbench) {
            onInteractionError("Resize commit failed and was rolled back.");
          }
        })
        .catch(() => {
          onInteractionError("Resize commit failed and was rolled back.");
        });
    },
    [
      commitInteraction,
      flushResizePreview,
      onInteractionError,
      resolvePlanForNode,
      setPreviewDimensions,
    ]
  );

  return {
    handleElementTransform,
    handleElementTransformEnd,
    handleElementTransformStart,
    previewDimensionsStore,
    showTransformer,
    transformer: transformerConfig,
    transformerElementId: showTransformer && selectedElement ? selectedElement.id : null,
  };
}
