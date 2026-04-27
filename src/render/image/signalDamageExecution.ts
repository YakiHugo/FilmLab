import type { RenderSurfaceHandle } from "@/lib/renderSurfaceHandle";
import {
  applyChannelDriftOnSurface,
  type ChannelDriftPassParams,
} from "@/lib/gpu/passes/signalDamage/channelDrift";
import { clamp } from "@/lib/math";
import { applyMaskedStageOperationToSurfaceIfSupported } from "./stageMaskComposite";
import type {
  ImageChannelDriftDamageNode,
  ImageRenderDocument,
  SignalDamageNode,
} from "./types";

const CHANNEL_DRIFT_SLOT_ID = "channel-drift";

const prepareChannelDriftGpuInput = (
  node: ImageChannelDriftDamageNode,
  width: number,
  height: number
): ChannelDriftPassParams => {
  const params = node.params;
  return {
    canvasWidth: width,
    canvasHeight: height,
    redOffsetX: clamp(params.redOffsetX, -100, 100),
    redOffsetY: clamp(params.redOffsetY, -100, 100),
    greenOffsetX: clamp(params.greenOffsetX, -100, 100),
    greenOffsetY: clamp(params.greenOffsetY, -100, 100),
    blueOffsetX: clamp(params.blueOffsetX, -100, 100),
    blueOffsetY: clamp(params.blueOffsetY, -100, 100),
    intensity: clamp(params.intensity, 0, 1),
  };
};

const applyChannelDrift = async ({
  baseSurface,
  node,
}: {
  baseSurface: RenderSurfaceHandle;
  node: ImageChannelDriftDamageNode;
}): Promise<RenderSurfaceHandle | null> => {
  const input = prepareChannelDriftGpuInput(
    node,
    baseSurface.width,
    baseSurface.height
  );
  return applyChannelDriftOnSurface({
    surface: baseSurface,
    input,
    slotId: CHANNEL_DRIFT_SLOT_ID,
  });
};

export const applyImageSignalDamage = async ({
  surface,
  signalDamage,
  document,
  stageReferenceCanvas,
}: {
  surface: RenderSurfaceHandle;
  signalDamage: readonly SignalDamageNode[];
  document: ImageRenderDocument;
  stageReferenceCanvas?: HTMLCanvasElement;
}): Promise<RenderSurfaceHandle> => {
  let currentSurface = surface;

  for (const node of signalDamage) {
    const maskDefinition = node.maskId
      ? document.masks.byId[node.maskId] ?? null
      : null;

    const nextSurface = await applyMaskedStageOperationToSurfaceIfSupported({
      surface: currentSurface,
      maskDefinition,
      maskReferenceCanvas: stageReferenceCanvas,
      blendSlotId: node.maskId ? `signal-damage-mask:${node.id}` : undefined,
      applyOperation: async ({ surface: targetSurface }) => {
        switch (node.type) {
          case "channel-drift":
            return applyChannelDrift({
              baseSurface: targetSurface,
              node,
            });
          default:
            return null;
        }
      },
    });

    if (!nextSurface) {
      throw new Error(`Signal damage GPU pass failed for node ${node.id}`);
    }
    currentSurface = nextSurface;
  }

  return currentSurface;
};
