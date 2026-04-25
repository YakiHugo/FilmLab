import type { ChannelDriftAdjustments, HalftoneAdjustments } from "@/types";

export const halftoneAdjustmentsEqual = (
  left: HalftoneAdjustments | undefined,
  right: HalftoneAdjustments | undefined
) => {
  if (left === right) return true;
  if (!left || !right) return false;
  return (
    left.enabled === right.enabled &&
    left.frequency === right.frequency &&
    left.angle === right.angle &&
    left.shape === right.shape &&
    left.colorMode === right.colorMode &&
    left.dotScale === right.dotScale &&
    left.contrast === right.contrast &&
    left.invert === right.invert &&
    left.backgroundColor === right.backgroundColor &&
    left.backgroundOpacity === right.backgroundOpacity
  );
};

export const channelDriftAdjustmentsEqual = (
  left: ChannelDriftAdjustments | undefined,
  right: ChannelDriftAdjustments | undefined
) => {
  if (left === right) return true;
  if (!left || !right) return false;
  return (
    left.enabled === right.enabled &&
    left.redOffsetX === right.redOffsetX &&
    left.redOffsetY === right.redOffsetY &&
    left.greenOffsetX === right.greenOffsetX &&
    left.greenOffsetY === right.greenOffsetY &&
    left.blueOffsetX === right.blueOffsetX &&
    left.blueOffsetY === right.blueOffsetY &&
    left.intensity === right.intensity
  );
};
