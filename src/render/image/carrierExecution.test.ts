import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  applyImageCarrierTransforms,
  applyImageCarrierTransformsToSurfaceIfSupported,
} from "./carrierExecution";

const applyImageAsciiCarrierTransformMock = vi.fn();
const applyImageAsciiCarrierTransformToSurfaceIfSupportedMock = vi.fn();
const applyMaskedStageOperationToSurfaceIfSupportedMock = vi.fn();
const applyMaskedStageOperationMock = vi.fn();

vi.mock("./asciiEffect", () => ({
  applyImageAsciiCarrierTransform: (...args: unknown[]) =>
    Reflect.apply(applyImageAsciiCarrierTransformMock, undefined, args),
  applyImageAsciiCarrierTransformToSurfaceIfSupported: (...args: unknown[]) =>
    Reflect.apply(applyImageAsciiCarrierTransformToSurfaceIfSupportedMock, undefined, args),
}));

vi.mock("./stageMaskComposite", () => ({
  applyMaskedStageOperation: (...args: unknown[]) =>
    Reflect.apply(applyMaskedStageOperationMock, undefined, args),
  applyMaskedStageOperationToSurfaceIfSupported: (...args: unknown[]) =>
    Reflect.apply(applyMaskedStageOperationToSurfaceIfSupportedMock, undefined, args),
}));

const createSurface = (slotId: string) =>
  ({
    kind: "renderer-slot",
    mode: "preview",
    slotId,
    width: 128,
    height: 72,
    sourceCanvas: {
      width: 128,
      height: 72,
      getContext: vi.fn(() => null),
    } as unknown as HTMLCanvasElement,
    materializeToCanvas: vi.fn(),
    cloneToCanvas: vi.fn(),
  }) as const;

const createRequest = () =>
  ({
    intent: "preview",
    quality: "interactive",
    targetSize: {
      width: 128,
      height: 72,
    },
  }) as const;

const createDocument = () =>
  ({
    revisionKey: "rev-1",
    masks: {
      byId: {},
    },
  }) as const;

describe("carrierExecution.applyImageCarrierTransformsToSurfaceIfSupported", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    applyMaskedStageOperationMock.mockImplementation(async ({ applyOperation, canvas }) =>
      applyOperation({
        canvas,
        maskRevisionKey: null,
      })
    );
    applyMaskedStageOperationToSurfaceIfSupportedMock.mockImplementation(
      async ({ surface, maskDefinition, applyOperation }) => {
        if (!maskDefinition) {
          return applyOperation({
            surface,
            maskRevisionKey: null,
          });
        }
        return applyOperation({
          surface,
          maskRevisionKey: `mask:${maskDefinition.id}`,
        });
      }
    );
  });

  it("chains unmasked ascii carriers on renderer surfaces", async () => {
    const initialSurface = createSurface("slot:base");
    const firstCarrierSurface = createSurface("slot:carrier-1");
    const secondCarrierSurface = createSurface("slot:carrier-2");
    applyImageAsciiCarrierTransformToSurfaceIfSupportedMock
      .mockResolvedValueOnce(firstCarrierSurface)
      .mockResolvedValueOnce(secondCarrierSurface);

    const result = await applyImageCarrierTransformsToSurfaceIfSupported({
      surface: initialSurface,
      carrierTransforms: [
        {
          id: "ascii-1",
          type: "ascii",
          enabled: true,
          analysisSource: "style",
          params: {},
        },
        {
          id: "ascii-2",
          type: "ascii",
          enabled: true,
          analysisSource: "develop",
          params: {},
        },
      ] as never,
      document: createDocument() as never,
      request: createRequest() as never,
      snapshots: {
        develop: {
          width: 128,
          height: 72,
          getContext: vi.fn(() => null),
        } as unknown as HTMLCanvasElement,
        style: {
          width: 128,
          height: 72,
          getContext: vi.fn(() => null),
        } as unknown as HTMLCanvasElement,
      },
    });

    expect(result).toBe(secondCarrierSurface);
    expect(applyImageAsciiCarrierTransformToSurfaceIfSupportedMock).toHaveBeenCalledTimes(2);
    expect(applyImageAsciiCarrierTransformToSurfaceIfSupportedMock.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({
        baseSurface: initialSurface,
      })
    );
    expect(applyImageAsciiCarrierTransformToSurfaceIfSupportedMock.mock.calls[1]?.[0]).toEqual(
      expect.objectContaining({
        baseSurface: firstCarrierSurface,
      })
    );
  });

  it("supports masked carriers through the surface-aware stage mask path", async () => {
    const initialSurface = createSurface("slot:base");
    const maskedCarrierSurface = createSurface("slot:carrier-masked");
    applyImageAsciiCarrierTransformToSurfaceIfSupportedMock.mockResolvedValueOnce(maskedCarrierSurface);

    const result = await applyImageCarrierTransformsToSurfaceIfSupported({
      surface: initialSurface,
      carrierTransforms: [
        {
          id: "ascii-1",
          type: "ascii",
          enabled: true,
          analysisSource: "style",
          maskId: "mask-1",
          params: {},
        },
      ] as never,
      document: {
        ...createDocument(),
        masks: {
          byId: {
            "mask-1": {
              id: "mask-1",
              kind: "local-adjustment",
              sourceLocalAdjustmentId: "local-1",
              mask: {
                mode: "radial",
                centerX: 0.5,
                centerY: 0.5,
                radiusX: 0.3,
                radiusY: 0.3,
                feather: 0.2,
              },
            },
          },
        },
      } as never,
      request: createRequest() as never,
      snapshots: {
        develop: null,
        style: {
          width: 128,
          height: 72,
          getContext: vi.fn(() => null),
        } as unknown as HTMLCanvasElement,
      },
    });

    expect(result).toBe(maskedCarrierSurface);
    expect(applyMaskedStageOperationToSurfaceIfSupportedMock).toHaveBeenCalledWith(
      expect.objectContaining({
        surface: initialSurface,
        maskDefinition: expect.objectContaining({
          id: "mask-1",
        }),
        blendSlotId: "carrier-mask:ascii-1",
      })
    );
    expect(applyImageAsciiCarrierTransformToSurfaceIfSupportedMock).toHaveBeenCalledWith(
      expect.objectContaining({
        baseSurface: initialSurface,
        maskRevisionKey: "mask:mask-1",
      })
    );
  });

  it("passes export mode through the canvas carrier path", async () => {
    await applyImageCarrierTransforms({
      canvas: createSurface("slot:canvas").sourceCanvas,
      carrierTransforms: [
        {
          id: "ascii-export",
          type: "ascii",
          enabled: true,
          analysisSource: "style",
          params: {},
        },
      ] as never,
      document: createDocument() as never,
      request: {
        ...createRequest(),
        intent: "export",
        quality: "full",
      } as never,
      snapshots: {
        develop: null,
        style: createSurface("slot:style").sourceCanvas,
      },
    });

    expect(applyImageAsciiCarrierTransformMock).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: "export",
      })
    );
  });
});
