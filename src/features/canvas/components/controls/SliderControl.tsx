import { memo, type ComponentProps } from "react";
import { CanvasSliderRow } from "@/features/canvas/components/CanvasSliderRow";

type SliderControlProps = ComponentProps<typeof CanvasSliderRow>;

export const SliderControl = memo(function SliderControl(props: SliderControlProps) {
  return <CanvasSliderRow {...props} />;
});
