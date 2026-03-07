import { memo, type ComponentProps } from "react";
import { EditorSliderRow } from "@/features/editor/EditorSliderRow";

type SliderControlProps = ComponentProps<typeof EditorSliderRow>;

/**
 * Reusable slider control primitive for editor panels.
 * Keeps panel implementations focused on state wiring.
 */
export const SliderControl = memo(function SliderControl(props: SliderControlProps) {
  return <EditorSliderRow {...props} />;
});
