export type GlErrorOp =
  | "compileShader"
  | "linkProgram"
  | "fbo"
  | "drawArrays"
  | "texImage"
  | "uniform-binding";

export interface GlErrorEvent {
  op: GlErrorOp;
  rendererLabel: string;
  shaderName?: string;
  passId?: string;
  glError?: number;
  compileLog?: string;
  declaredOrphans?: readonly string[];
  boundOrphans?: readonly string[];
  cause?: unknown;
}

export const GL_ERROR_RING_LIMIT = 50;

const RING_KEY = "__filmlab_glErrors" as const;

type RingHost = typeof globalThis & { [RING_KEY]?: GlErrorEvent[] };

const getRing = (): GlErrorEvent[] => {
  const host = globalThis as RingHost;
  if (!host[RING_KEY]) {
    host[RING_KEY] = [];
  }
  return host[RING_KEY]!;
};

export const reportGlError = (event: GlErrorEvent): void => {
  if (import.meta.env.DEV) {
    const ring = getRing();
    ring.push(event);
    if (ring.length > GL_ERROR_RING_LIMIT) {
      ring.splice(0, ring.length - GL_ERROR_RING_LIMIT);
    }
  }
  console.error("[gl-error]", event);
};

export const readGlErrorRing = (): readonly GlErrorEvent[] => {
  if (!import.meta.env.DEV) {
    return [];
  }
  return getRing().slice();
};

export const clearGlErrorRing = (): void => {
  if (!import.meta.env.DEV) {
    return;
  }
  const host = globalThis as RingHost;
  host[RING_KEY] = [];
};
