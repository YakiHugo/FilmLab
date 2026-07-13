import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RenderSurfaceHandle } from "@/lib/renderSurfaceHandle";
import { applyImageSignalDamage } from "./signalDamageExecution";

const applyChannelDriftOnSurfaceMock = vi.hoisted(() => vi.fn());
const applyMaskedStageOperationToSurfaceIfSupportedMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/gpu/passes/signalDamage/channelDrift", () => ({
  applyChannelDriftOnSurface: applyChannelDriftOnSurfaceMock,
}));

vi.mock("./stageMaskComposite", () => ({
  applyMaskedStageOperationToSurfaceIfSupported: applyMaskedStageOperationToSurfaceIfSupportedMock,
}));

const createSurface = (width: number, height: number) =>
  ({
    width,
    height,
    sourceCanvas: { width, height },
  }) as unknown as RenderSurfaceHandle;

describe("applyImageSignalDamage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    applyMaskedStageOperationToSurfaceIfSupportedMock.mockImplementation(
      async ({ applyOperation, surface }) => applyOperation({ surface })
    );
    applyChannelDriftOnSurfaceMock.mockImplementation(async ({ surface }) => surface);
  });

  it("maps authored channel offsets from composition space into output pixels", async () => {
    const surface = createSurface(2160, 2700);

    await applyImageSignalDamage({
      compositionReferenceSize: { width: 1080, height: 1350 },
      document: { masks: { byId: {} } } as never,
      signalDamage: [
        {
          id: "drift-1",
          type: "channel-drift",
          enabled: true,
          params: {
            redOffsetX: 14,
            redOffsetY: -3,
            greenOffsetX: -7,
            greenOffsetY: 4,
            blueOffsetX: 2,
            blueOffsetY: -10,
            intensity: 0.8,
          },
        },
      ],
      surface,
    });

    expect(applyChannelDriftOnSurfaceMock).toHaveBeenCalledWith({
      surface,
      input: {
        canvasWidth: 2160,
        canvasHeight: 2700,
        redOffsetX: 28,
        redOffsetY: -6,
        greenOffsetX: -14,
        greenOffsetY: 8,
        blueOffsetX: 4,
        blueOffsetY: -20,
        intensity: 0.8,
      },
      slotId: "channel-drift",
    });
  });
});
