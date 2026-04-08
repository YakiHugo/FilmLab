import type { CanvasRenderableElement, CanvasTextElement } from "@/types";

export const isCanvasTextElementEditable = (
  element:
    | (Partial<Pick<CanvasTextElement, "locked" | "visible">> &
        Partial<
          Pick<
            Extract<CanvasRenderableElement, { type: "text" }>,
            "effectiveLocked" | "effectiveVisible"
          >
        >)
    | null
    | undefined
) =>
  Boolean(
    element &&
      !(element.effectiveLocked ?? element.locked) &&
      (element.effectiveVisible ?? element.visible)
  );
