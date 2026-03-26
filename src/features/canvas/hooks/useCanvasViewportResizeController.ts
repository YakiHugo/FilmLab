import type Konva from "konva";
import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { flushSync } from "react-dom";
import type {
  Asset,
  CanvasCommand,
  CanvasRenderableElement,
  CanvasRenderableNode,
  CanvasShapePoint,
  CanvasWorkbench,
} from "@/types";
import { CANVAS_SELECTION_ACCENT } from "../canvasViewportConstants";
import { areEqual } from "../document/shared";
import {
  applyCanvasResizePreviewToNode,
  type CanvasResizeMutableNode,
} from "../resizeNodePreview";
import {
  type CanvasResizePreview,
  constrainCanvasResizeBoxToAspectRatio,
  planCanvasElementResize,
  resolveMinimumCanvasImageDimensions,
  type CanvasResizeTransformBox,
} from "../resizeGeometry";
import { createCanvasResizePreviewFromElement } from "../resizeGeometry";
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
  shiftBehavior: TransformerShiftBehavior;
  useSingleNodeRotation: boolean;
}

const isResizePatchNoop = (
  element: CanvasRenderableElement,
  patch: Record<string, unknown>
) =>
  Object.entries(patch).every(([key, value]) => {
    if (key === "x") {
      return areEqual(element.transform.x, value);
    }
    if (key === "y") {
      return areEqual(element.transform.y, value);
    }
    if (key === "width") {
      return areEqual(element.transform.width, value);
    }
    if (key === "height") {
      return areEqual(element.transform.height, value);
    }

    return areEqual(
      (element as unknown as Record<string, unknown>)[key],
      value
    );
  });

interface UseCanvasViewportResizeControllerOptions {
  activeEditingTextId: string | null;
  assetById: Map<string, Asset>;
  activeWorkbench: CanvasWorkbench | null;
  executeCommand: (
    command: CanvasCommand,
    options?: { trackHistory?: boolean }
  ) => Promise<CanvasWorkbench | null>;
  hasMarqueeSession: boolean;
  isMarqueeDragging: boolean;
  selectedElementIds: string[];
  stageRef: RefObject<Konva.Stage>;
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
  hasMarqueeSession,
  isMarqueeDragging,
  selectedElement,
  selectedElementIds,
}: {
  activeEditingTextId: string | null;
  hasMarqueeSession: boolean;
  isMarqueeDragging: boolean;
  selectedElement: CanvasRenderableNode | null;
  selectedElementIds: string[];
}) =>
  Boolean(
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

const resolveMinimumTransformerDimensions = (
  element: CanvasRenderableElement,
) => {
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
  const minimumScale = MIN_TRANSFORM_TEXT_FONT_SIZE / Math.max(element.fontSize, MIN_TRANSFORM_TEXT_FONT_SIZE);

  return {
    width: Math.max(MIN_TRANSFORM_BOX_DIMENSION, layoutElement.width * minimumScale),
    height: Math.max(MIN_TRANSFORM_BOX_DIMENSION, layoutElement.height * minimumScale),
  };
};

const toPreviewDimensions = ({
  elementId,
  preview,
}: {
  elementId: string;
  preview: { height: number; width: number };
}) => ({
  elementId,
  width: preview.width,
  height: preview.height,
});

type CanvasResizePreviewDimensions = ReturnType<typeof toPreviewDimensions> | null;

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

const resolveShiftKeyState = (event: Event) =>
  "shiftKey" in event &&
  typeof event.shiftKey === "boolean"
    ? event.shiftKey
    : false;

interface CanvasResizeSessionState {
  elementId: string | null;
  endHandled: boolean;
  token: number;
}

const canvasShapePointsEqual = (
  left: CanvasShapePoint[] | undefined,
  right: CanvasShapePoint[] | undefined
) => {
  if (!left && !right) {
    return true;
  }

  if (!left || !right || left.length !== right.length) {
    return false;
  }

  return left.every(
    (point, index) =>
      areEqual(point.x, right[index]?.x) && areEqual(point.y, right[index]?.y)
  );
};

const doesElementMatchResizePreview = (
  element: CanvasRenderableElement,
  preview: CanvasResizePreview
) => {
  if (
    !areEqual(element.x, preview.x) ||
    !areEqual(element.y, preview.y) ||
    !areEqual(element.width, preview.width) ||
    !areEqual(element.height, preview.height)
  ) {
    return false;
  }

  if (element.type === "text") {
    return (
      areEqual(element.fontSize, preview.fontSize) &&
      areEqual(element.fontSizeTier, preview.fontSizeTier)
    );
  }

  if (element.type === "shape") {
    return (
      areEqual(element.strokeWidth, preview.strokeWidth ?? element.strokeWidth) &&
      areEqual(element.radius, preview.radius ?? element.radius) &&
      canvasShapePointsEqual(element.points, preview.points)
    );
  }

  return true;
};

export function useCanvasViewportResizeController({
  activeEditingTextId,
  assetById,
  activeWorkbench,
  executeCommand,
  hasMarqueeSession,
  isMarqueeDragging,
  selectedElementIds,
  stageRef,
  singleSelectedElement,
}: UseCanvasViewportResizeControllerOptions) {
  const [isTransforming, setIsTransforming] = useState(false);
  const [pendingCommitPreview, setPendingCommitPreview] = useState<{
    elementId: string;
    preview: CanvasResizePreview;
    sessionToken: number;
  } | null>(null);
  const previewDimensionsRef = useRef<CanvasResizePreviewDimensions>(null);
  const previewDimensionsListenersRef = useRef(new Set<() => void>());
  const selectedElement: CanvasRenderableElement | null =
    singleSelectedElement && singleSelectedElement.type !== "group"
      ? singleSelectedElement
      : null;
  const selectedElementRef = useRef<CanvasRenderableElement | null>(selectedElement);
  const assetByIdRef = useRef(assetById);
  const activeWorkbenchRef = useRef(activeWorkbench);
  const isTransformingRef = useRef(isTransforming);
  const isImageAspectUnlockedRef = useRef(false);
  const transformAnchorRef = useRef<string | null>(null);
  const transformSessionRef = useRef<CanvasResizeSessionState>({
    elementId: null,
    endHandled: false,
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

  useEffect(() => {
    isTransformingRef.current = isTransforming;
  }, [isTransforming]);

  const setPreviewDimensions = useCallback(
    (
      nextPreviewDimensions: CanvasResizePreviewDimensions,
      options?: { notify?: boolean }
    ) => {
      if (previewDimensionsEqual(previewDimensionsRef.current, nextPreviewDimensions)) {
        return;
      }

      previewDimensionsRef.current = nextPreviewDimensions;
      if (options?.notify === false) {
        return;
      }

      previewDimensionsListenersRef.current.forEach((listener) => {
        listener();
      });
    },
    []
  );

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
        hasMarqueeSession,
        isMarqueeDragging,
        selectedElement,
        selectedElementIds,
      }),
    [
      activeEditingTextId,
      hasMarqueeSession,
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
    const lockedImageMinimumDimensions = resolveMinimumCanvasImageDimensions(
      imageAspectRatio
    );
    const ratioConfig = resolveTransformerRatioConfig(selectedElement);

    return {
      anchorFill: CANVAS_SELECTION_ACCENT,
      anchorSize: 8,
      anchorStyleFunc: (anchor) => {
        anchor.setAttrs(
          resolveCanvasResizeAnchorStyle(anchor.name().split(" ")[0] ?? "")
        );
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
      shiftBehavior: ratioConfig.shiftBehavior,
      useSingleNodeRotation: true,
    };
  }, [imageAspectRatio, selectedElement, showTransformer, textAspectRatio]);

  useEffect(() => {
    if (isTransformingRef.current || pendingCommitPreview) {
      return;
    }
    transformSessionRef.current = {
      elementId: null,
      endHandled: false,
      token: transformSessionRef.current.token,
    };
    transformAnchorRef.current = null;
    setPreviewDimensions(null);
  }, [activeWorkbench?.updatedAt, pendingCommitPreview, selectedElement?.id, setPreviewDimensions]);

  useEffect(() => {
    if (!pendingCommitPreview) {
      return;
    }

    const pendingElement =
      activeWorkbench?.allNodes.find((element) => element.id === pendingCommitPreview.elementId) ?? null;
    if (!pendingElement || pendingElement.type === "group") {
      setPendingCommitPreview(null);
      setPreviewDimensions(null);
      return;
    }

    if (doesElementMatchResizePreview(pendingElement, pendingCommitPreview.preview)) {
      setPendingCommitPreview((current) =>
        current?.sessionToken === pendingCommitPreview.sessionToken ? null : current
      );
      setPreviewDimensions(null);
      return;
    }

    const node = stageRef.current?.findOne<CanvasResizeMutableNode>(`#${pendingCommitPreview.elementId}`);
    if (!node) {
      return;
    }

    applyCanvasResizePreviewToNode({
      element: pendingElement,
      node,
      preview: pendingCommitPreview.preview,
    });
    node.getStage()?.batchDraw();
  }, [activeWorkbench?.updatedAt, pendingCommitPreview, setPreviewDimensions, stageRef]);

  const resolvePlanForNode = useCallback((node: CanvasResizeMutableNode) => {
    const currentElement = selectedElementRef.current;
    const currentWorkbench = activeWorkbenchRef.current;
    if (!currentElement || !currentWorkbench) {
      return null;
    }

    const imageAspectRatio =
      currentElement.type === "image"
        ? resolveCanvasImageAspectRatio({
            asset: assetByIdRef.current.get(currentElement.assetId) ?? null,
            element: currentElement,
          })
        : null;

    return planCanvasElementResize({
      element: currentElement,
      imageAspectRatio,
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

  const handleElementTransformStart = useCallback(
    (elementId: string, event: Konva.KonvaEventObject<Event>) => {
      if (!showTransformer || selectedElementRef.current?.id !== elementId) {
        return;
      }

      transformAnchorRef.current = null;
      isImageAspectUnlockedRef.current = resolveShiftKeyState(event.evt);
      transformSessionRef.current = {
        elementId,
        endHandled: false,
        token: transformSessionRef.current.token + 1,
      };
      const plan = resolvePlanForNode(event.target as CanvasResizeMutableNode);
      setIsTransforming(true);
      setPreviewDimensions(
        plan
          ? toPreviewDimensions({
              elementId,
              preview: plan.preview,
            })
          : null,
        {
        notify: false,
        }
      );
    },
    [resolvePlanForNode, showTransformer]
  );

  const handleElementTransform = useCallback(
    (elementId: string, event: Konva.KonvaEventObject<Event>) => {
      if (!showTransformer || selectedElementRef.current?.id !== elementId) {
        return;
      }

      isImageAspectUnlockedRef.current = resolveShiftKeyState(event.evt);
      const plan = resolvePlanForNode(event.target as CanvasResizeMutableNode);
      setPreviewDimensions(
        plan
          ? toPreviewDimensions({
              elementId,
              preview: plan.preview,
            })
          : null,
        {
        notify: false,
        }
      );
    },
    [resolvePlanForNode, showTransformer]
  );

  const handleElementTransformEnd = useCallback(
    (elementId: string, event: Konva.KonvaEventObject<Event>) => {
      const currentElement = selectedElementRef.current;
      const currentSession = transformSessionRef.current;
      if (
        currentSession.elementId === elementId &&
        currentSession.endHandled
      ) {
        return;
      }
      const nextSession = {
        elementId,
        endHandled: true,
        token:
          currentSession.elementId === elementId
            ? currentSession.token
            : currentSession.token + 1,
      };
      transformSessionRef.current = nextSession;
      const sessionToken = nextSession.token;

      if (!showTransformer || !currentElement || currentElement.id !== elementId) {
        transformAnchorRef.current = null;
        isImageAspectUnlockedRef.current = false;
        setIsTransforming(false);
        setPreviewDimensions(null);
        return;
      }

      isImageAspectUnlockedRef.current = resolveShiftKeyState(event.evt);
      const node = event.target as CanvasResizeMutableNode;
      const plan = resolvePlanForNode(node);
      if (!plan) {
        transformAnchorRef.current = null;
        isImageAspectUnlockedRef.current = false;
        setIsTransforming(false);
        setPreviewDimensions(null);
        return;
      }

      flushSync(() => {
        setIsTransforming(false);
        setPendingCommitPreview({
          elementId,
          preview: plan.preview,
          sessionToken,
        });
        setPreviewDimensions(
          toPreviewDimensions({
            elementId,
            preview: plan.preview,
          })
        );
      });

      applyCanvasResizePreviewToNode({
        element: currentElement,
        node,
        preview: plan.preview,
      });
      node.getStage()?.batchDraw();
      transformAnchorRef.current = null;

      if (isResizePatchNoop(currentElement, plan.patch)) {
        isImageAspectUnlockedRef.current = false;
        setPendingCommitPreview(null);
        setPreviewDimensions(null);
        return;
      }

      const revertNodeToCurrentElement = () => {
        applyCanvasResizePreviewToNode({
          element: currentElement,
          node,
          preview: createCanvasResizePreviewFromElement(currentElement),
        });
        node.getStage()?.batchDraw();
      };
      const isCurrentResizeSession = () => {
        const session = transformSessionRef.current;
        return session.elementId === elementId && session.token === sessionToken;
      };

      void executeCommand({
        type: "UPDATE_NODE_PROPS",
        updates: [
          {
            id: currentElement.id,
            patch: plan.patch,
          },
        ],
      })
        .then((nextWorkbench) => {
          if (!isCurrentResizeSession()) {
            return;
          }

          if (nextWorkbench) {
            return;
          }

          revertNodeToCurrentElement();
          flushSync(() => {
            setPendingCommitPreview(null);
            setPreviewDimensions(null);
          });
        })
        .catch(() => {
          if (!isCurrentResizeSession()) {
            return;
          }

          revertNodeToCurrentElement();
          flushSync(() => {
            setPendingCommitPreview(null);
            setPreviewDimensions(null);
          });
        })
        .finally(() => {
          if (isCurrentResizeSession()) {
            isImageAspectUnlockedRef.current = false;
          }
        });
    },
    [executeCommand, resolvePlanForNode, showTransformer]
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
