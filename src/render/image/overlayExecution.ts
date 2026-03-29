import {
  applyTimestampOverlay,
  type TimestampOverlayAdjustments,
} from "@/lib/timestampOverlay";
import type { ImageRenderOutputState } from "./types";

interface TimestampImageOverlay {
  type: "timestamp";
  adjustments: TimestampOverlayAdjustments;
  text?: string | null;
}

export type ImageOverlayNode = TimestampImageOverlay;

const createTimestampAdjustmentsFromOutput = (
  output: ImageRenderOutputState
): TimestampOverlayAdjustments => ({
  timestampEnabled: output.timestamp.enabled,
  timestampOpacity: output.timestamp.opacity,
  timestampPosition: output.timestamp.position,
  timestampSize: output.timestamp.size,
});

export const resolveImageOverlays = ({
  output,
  timestampText,
}: {
  output: ImageRenderOutputState;
  timestampText?: string | null;
}): ImageOverlayNode[] =>
  output.timestamp.enabled
    ? [
        {
          type: "timestamp",
          adjustments: createTimestampAdjustmentsFromOutput(output),
          text: timestampText,
        },
      ]
    : [];

export const resolveLegacyTimestampOverlays = ({
  adjustments,
  timestampText,
}: {
  adjustments: TimestampOverlayAdjustments;
  timestampText?: string | null;
}): ImageOverlayNode[] =>
  adjustments.timestampEnabled
    ? [
        {
          type: "timestamp",
          adjustments,
          text: timestampText,
        },
      ]
    : [];

export const applyImageOverlays = async ({
  canvas,
  overlays,
}: {
  canvas: HTMLCanvasElement;
  overlays: readonly ImageOverlayNode[];
}) => {
  for (const overlay of overlays) {
    switch (overlay.type) {
      case "timestamp":
        await applyTimestampOverlay(canvas, overlay.adjustments, overlay.text);
        break;
      default: {
        const exhaustiveCheck: never = overlay;
        throw new Error(`Unsupported image overlay: ${String(exhaustiveCheck)}`);
      }
    }
  }
};
