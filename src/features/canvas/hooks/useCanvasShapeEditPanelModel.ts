import { useCallback, useMemo } from "react";
import type { CanvasShapeEditTarget } from "../editPanelSelection";
import { resolveCanvasShapeEffectiveFillStyle } from "../shapeStyle";
import { useCanvasLoadedWorkbenchCommands } from "./useCanvasLoadedWorkbenchCommands";
import { commitCanvasNodePropertyIntent } from "./useCanvasNodePropertyActions";

export function useCanvasShapeEditPanelModel(
  shape: CanvasShapeEditTarget | null
) {
  const { executeCommand } = useCanvasLoadedWorkbenchCommands();

  const commitIntent = useCallback(
    (intent: Parameters<typeof commitCanvasNodePropertyIntent>[0]["intent"]) => {
      if (!shape) {
        return;
      }

      void commitCanvasNodePropertyIntent({
        executeCommand,
        intent,
        node: shape,
        workbench: null,
      });
    },
    [executeCommand, shape]
  );

  const shapeFillStyle = useMemo(() => {
    if (!shape) {
      return null;
    }

    return resolveCanvasShapeEffectiveFillStyle({
      fill: shape.fill,
      fillStyle: shape.fillStyle,
    });
  }, [shape]);

  return {
    shape,
    shapeFillStyle,
    setFill: (value: string) =>
      commitIntent({ type: "set-shape-fill", value }),
    setOpacity: (value: number) => commitIntent({ type: "set-opacity", value }),
    setShapeFillGradientAngle: (value: number) =>
      commitIntent({ type: "set-shape-fill-gradient-angle", value }),
    setShapeFillGradientFrom: (value: string) =>
      commitIntent({ type: "set-shape-fill-gradient-from", value }),
    setShapeFillGradientTo: (value: string) =>
      commitIntent({ type: "set-shape-fill-gradient-to", value }),
    setShapeFillMode: (value: "solid" | "linear-gradient") =>
      commitIntent({ type: "set-shape-fill-mode", value }),
    setStroke: (value: string) => commitIntent({ type: "set-shape-stroke", value }),
    setStrokeWidth: (value: number) => commitIntent({ type: "set-shape-stroke-width", value }),
  };
}
