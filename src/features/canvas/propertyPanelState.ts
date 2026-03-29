import { getCanvasNodeWorldTransform, worldPointToLocalPoint } from "./documentGraph";
import { resolveCanvasShapeEffectiveFillStyle } from "./shapeStyle";
import { applyCanvasTextFontSizeTier } from "./textStyle";
import type {
  CanvasCommand,
  CanvasNodePropertyPatch,
  CanvasPersistedShapeElement,
  CanvasRenderableNode,
  CanvasShapeFillStyle,
  CanvasTextFontSizeTier,
  CanvasWorkbench,
} from "@/types";

export type CanvasNodePropertyIntent =
  | { type: "set-height"; value: number }
  | { type: "set-opacity"; value: number }
  | { type: "set-rotation"; value: number }
  | { type: "set-shape-fill"; value: string }
  | { type: "set-shape-fill-mode"; value: CanvasShapeFillStyle["kind"] }
  | { type: "set-shape-fill-gradient-angle"; value: number }
  | { type: "set-shape-fill-gradient-from"; value: string }
  | { type: "set-shape-fill-gradient-to"; value: string }
  | { type: "set-shape-stroke"; value: string }
  | { type: "set-shape-stroke-width"; value: number }
  | { type: "set-text-align"; value: "left" | "center" | "right" }
  | { type: "set-text-color"; value: string }
  | { type: "set-text-content"; value: string }
  | { type: "set-text-font-family"; value: string }
  | { type: "set-text-font-size-tier"; value: CanvasTextFontSizeTier }
  | { type: "set-width"; value: number }
  | { type: "set-x"; value: number }
  | { type: "set-y"; value: number };

export type CanvasNodePropertyPlannerTarget =
  | CanvasRenderableNode
  | Pick<
      CanvasPersistedShapeElement,
      "fill" | "fillStyle" | "id" | "opacity" | "stroke" | "strokeWidth" | "type"
    >;

const clampOpacity = (value: number) => Math.max(0, Math.min(1, value));

const clampPositiveSize = (value: number) => Math.max(1, value);

const resolveShapeFillPatch = (
  nextFillStyle: CanvasShapeFillStyle
): CanvasNodePropertyPatch => ({
  fill: nextFillStyle.kind === "solid" ? nextFillStyle.color : nextFillStyle.from,
  fillStyle: nextFillStyle,
});

const resolveNextShapeFillStyle = (
  node: Extract<CanvasNodePropertyPlannerTarget, { type: "shape" }>,
  updater: (current: CanvasShapeFillStyle) => CanvasShapeFillStyle
) => updater(
  resolveCanvasShapeEffectiveFillStyle({
    fill: node.fill,
    fillStyle: node.fillStyle,
  })
);

const resolveTransformPatch = ({
  node,
  patch,
  workbench,
}: {
  node: CanvasRenderableNode;
  patch: CanvasNodePropertyPatch;
  workbench: CanvasWorkbench;
}) => {
  const nextPatch = { ...patch };
  const hasPosition = patch.x !== undefined || patch.y !== undefined;

  if (hasPosition) {
    const localPosition = worldPointToLocalPoint(workbench, node.parentId ?? null, {
      x: patch.x ?? node.x,
      y: patch.y ?? node.y,
    });
    if (patch.x !== undefined) {
      nextPatch.x = localPosition.x;
    }
    if (patch.y !== undefined) {
      nextPatch.y = localPosition.y;
    }
  }

  if (patch.rotation !== undefined) {
    const parentRotation = node.parentId
      ? (getCanvasNodeWorldTransform(workbench, node.parentId)?.rotation ?? 0)
      : 0;
    nextPatch.rotation = patch.rotation - parentRotation;
  }

  return nextPatch;
};

const isCanvasRenderablePropertyTarget = (
  node: CanvasNodePropertyPlannerTarget
): node is CanvasRenderableNode => "parentId" in node;

const createUpdateNodePropsCommand = (
  nodeId: string,
  patch: CanvasNodePropertyPatch
): Extract<CanvasCommand, { type: "UPDATE_NODE_PROPS" }> => ({
  type: "UPDATE_NODE_PROPS",
  updates: [{ id: nodeId, patch }],
});

export const planCanvasNodePropertyCommand = ({
  intent,
  node,
  workbench,
}: {
  intent: CanvasNodePropertyIntent;
  node: CanvasNodePropertyPlannerTarget;
  workbench?: CanvasWorkbench | null;
}): Extract<CanvasCommand, { type: "UPDATE_NODE_PROPS" }> | null => {
  switch (intent.type) {
    case "set-height":
      return createUpdateNodePropsCommand(node.id, { height: clampPositiveSize(intent.value) });
    case "set-opacity":
      return createUpdateNodePropsCommand(node.id, { opacity: clampOpacity(intent.value) });
    case "set-rotation":
      if (!workbench || !isCanvasRenderablePropertyTarget(node)) {
        return null;
      }
      return createUpdateNodePropsCommand(
        node.id,
        resolveTransformPatch({
          node,
          patch: { rotation: intent.value },
          workbench,
        })
      );
    case "set-shape-fill":
      return node.type === "shape"
        ? createUpdateNodePropsCommand(
            node.id,
            resolveShapeFillPatch({
              kind: "solid",
              color: intent.value,
            })
          )
        : null;
    case "set-shape-fill-mode":
      return node.type === "shape"
        ? createUpdateNodePropsCommand(
            node.id,
            resolveShapeFillPatch(
              resolveNextShapeFillStyle(node, (current) =>
                intent.value === "solid"
                  ? {
                      kind: "solid",
                      color: current.kind === "solid" ? current.color : current.from,
                    }
                  : current.kind === "linear-gradient"
                    ? current
                    : {
                        kind: "linear-gradient",
                        angle: 0,
                        from: current.color,
                        to: current.color,
                      }
              )
            )
          )
        : null;
    case "set-shape-fill-gradient-angle":
      return node.type === "shape"
        ? createUpdateNodePropsCommand(
            node.id,
            resolveShapeFillPatch(
              resolveNextShapeFillStyle(node, (current) => ({
                kind: "linear-gradient",
                angle: intent.value,
                from: current.kind === "linear-gradient" ? current.from : current.color,
                to: current.kind === "linear-gradient" ? current.to : current.color,
              }))
            )
          )
        : null;
    case "set-shape-fill-gradient-from":
      return node.type === "shape"
        ? createUpdateNodePropsCommand(
            node.id,
            resolveShapeFillPatch(
              resolveNextShapeFillStyle(node, (current) => ({
                kind: "linear-gradient",
                angle: current.kind === "linear-gradient" ? current.angle : 0,
                from: intent.value,
                to: current.kind === "linear-gradient" ? current.to : current.color,
              }))
            )
          )
        : null;
    case "set-shape-fill-gradient-to":
      return node.type === "shape"
        ? createUpdateNodePropsCommand(
            node.id,
            resolveShapeFillPatch(
              resolveNextShapeFillStyle(node, (current) => ({
                kind: "linear-gradient",
                angle: current.kind === "linear-gradient" ? current.angle : 0,
                from: current.kind === "linear-gradient" ? current.from : current.color,
                to: intent.value,
              }))
            )
          )
        : null;
    case "set-shape-stroke":
      return node.type === "shape"
        ? createUpdateNodePropsCommand(node.id, { stroke: intent.value })
        : null;
    case "set-shape-stroke-width":
      return node.type === "shape"
        ? createUpdateNodePropsCommand(node.id, {
            strokeWidth: Math.max(0, intent.value),
          })
        : null;
    case "set-text-align":
      return node.type === "text"
        ? createUpdateNodePropsCommand(node.id, { textAlign: intent.value })
        : null;
    case "set-text-color":
      return node.type === "text"
        ? createUpdateNodePropsCommand(node.id, { color: intent.value })
        : null;
    case "set-text-content":
      return node.type === "text"
        ? createUpdateNodePropsCommand(node.id, { content: intent.value })
        : null;
    case "set-text-font-family":
      return node.type === "text"
        ? createUpdateNodePropsCommand(node.id, { fontFamily: intent.value })
        : null;
    case "set-text-font-size-tier": {
      if (node.type !== "text" || !isCanvasRenderablePropertyTarget(node)) {
        return null;
      }
      const nextTextNode = applyCanvasTextFontSizeTier(node, intent.value);
      return createUpdateNodePropsCommand(node.id, {
        fontSize: nextTextNode.fontSize,
        fontSizeTier: nextTextNode.fontSizeTier,
      });
    }
    case "set-width":
      return createUpdateNodePropsCommand(node.id, { width: clampPositiveSize(intent.value) });
    case "set-x":
      if (!workbench || !isCanvasRenderablePropertyTarget(node)) {
        return null;
      }
      return createUpdateNodePropsCommand(
        node.id,
        resolveTransformPatch({
          node,
          patch: { x: intent.value },
          workbench,
        })
      );
    case "set-y":
      if (!workbench || !isCanvasRenderablePropertyTarget(node)) {
        return null;
      }
      return createUpdateNodePropsCommand(
        node.id,
        resolveTransformPatch({
          node,
          patch: { y: intent.value },
          workbench,
        })
      );
    default:
      return null;
  }
};
