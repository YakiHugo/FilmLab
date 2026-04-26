/**
 * GPUDevice acquisition, feature/limit detection, and lost-device lifecycle.
 *
 * This is the entry point of the per-frame WebGPU pipeline (`src/lib/gpu/`).
 * Stage choreography (`src/render/image/`) sits on top of this module via the
 * backend adapter introduced in Slice 5.5.
 */

export type GPUContextErrorCode =
  | "no-navigator-gpu"
  | "no-adapter"
  | "device-request-failed";

export class GPUContextError extends Error {
  readonly code: GPUContextErrorCode;

  constructor(code: GPUContextErrorCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "GPUContextError";
    this.code = code;
  }
}

export interface GPUContextFeatures {
  /** `shader-f16` enables half-precision arithmetic (mobile-friendly perf). */
  shaderF16: boolean;
  /** `timestamp-query` enables on-device latency measurement. */
  timestampQuery: boolean;
  /** Float-render fallback gate for HDR work. */
  rg11b10ufloatRenderable: boolean;
  /** 16-bit float color attachments (matches WebGL2 RGBA16F path). */
  float32Filterable: boolean;
}

export interface GPUContext {
  readonly device: GPUDevice;
  readonly adapter: GPUAdapter;
  readonly features: GPUContextFeatures;
  readonly limits: GPUSupportedLimits;
  /** Resolves whenever the device is destroyed (intentional or accidental). */
  readonly lost: Promise<GPUDeviceLostInfo>;
  /** True after dispose() or accidental loss. */
  isLost: () => boolean;
  /** Subscribe to device-lost notifications. Returns an unsubscribe handle. */
  onLost: (handler: (info: GPUDeviceLostInfo) => void) => () => void;
  /**
   * Tear the context down. Idempotent. Triggers `device.lost`, which fans out
   * to subscribers registered via `onLost`.
   */
  dispose: () => void;
}

export interface RequestGPUContextOptions {
  powerPreference?: GPUPowerPreference;
  forceFallbackAdapter?: boolean;
  /**
   * Features to request. Unsupported entries are silently dropped — caller
   * checks the returned `features` snapshot for what actually landed.
   */
  requestedFeatures?: readonly GPUFeatureName[];
  requiredLimits?: Record<string, number>;
  label?: string;
}

const detectFeatures = (device: GPUDevice): GPUContextFeatures => ({
  shaderF16: device.features.has("shader-f16"),
  timestampQuery: device.features.has("timestamp-query"),
  rg11b10ufloatRenderable: device.features.has("rg11b10ufloat-renderable"),
  float32Filterable: device.features.has("float32-filterable"),
});

export async function requestGPUContext(
  options: RequestGPUContextOptions = {}
): Promise<GPUContext> {
  if (typeof navigator === "undefined" || !navigator.gpu) {
    throw new GPUContextError(
      "no-navigator-gpu",
      "WebGPU is not available: navigator.gpu is undefined."
    );
  }

  const adapter = await navigator.gpu.requestAdapter({
    powerPreference: options.powerPreference,
    forceFallbackAdapter: options.forceFallbackAdapter,
  });
  if (!adapter) {
    throw new GPUContextError(
      "no-adapter",
      "navigator.gpu.requestAdapter returned null."
    );
  }

  const requestedFeatures = (options.requestedFeatures ?? []).filter((feature) =>
    adapter.features.has(feature)
  );

  let device: GPUDevice;
  try {
    device = await adapter.requestDevice({
      label: options.label,
      requiredFeatures: requestedFeatures,
      requiredLimits: options.requiredLimits,
    });
  } catch (cause) {
    throw new GPUContextError(
      "device-request-failed",
      "adapter.requestDevice() failed.",
      { cause }
    );
  }

  let isLost = false;
  const handlers = new Set<(info: GPUDeviceLostInfo) => void>();

  const lost = device.lost.then((info) => {
    isLost = true;
    for (const handler of handlers) {
      handler(info);
    }
    return info;
  });

  return {
    device,
    adapter,
    features: detectFeatures(device),
    limits: device.limits,
    lost,
    isLost: () => isLost,
    onLost: (handler) => {
      // Late registration after loss must still receive the notification —
      // dispatching via the resolved promise covers both timings.
      if (isLost) {
        void lost.then(handler);
        return () => {};
      }
      handlers.add(handler);
      return () => {
        handlers.delete(handler);
      };
    },
    dispose: () => {
      if (isLost) return;
      isLost = true;
      device.destroy();
    },
  };
}
