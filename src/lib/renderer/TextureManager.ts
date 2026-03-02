import * as twgl from "twgl.js";

export interface SourceTextureRecord {
  texture: WebGLTexture;
  width: number;
  height: number;
  mutable: boolean;
}

export const SOURCE_TEXTURE_CACHE_LIMIT = 8;

export const isMutableSource = (source: TexImageSource): boolean =>
  (typeof HTMLCanvasElement !== "undefined" && source instanceof HTMLCanvasElement) ||
  (typeof OffscreenCanvas !== "undefined" && source instanceof OffscreenCanvas) ||
  (typeof HTMLVideoElement !== "undefined" && source instanceof HTMLVideoElement);

export const ensureSourceTextureRecord = (params: {
  gl: WebGL2RenderingContext;
  sourceTextureCache: Map<TexImageSource, SourceTextureRecord>;
  source: TexImageSource;
  width: number;
  height: number;
}): SourceTextureRecord => {
  const { gl, sourceTextureCache, source, width, height } = params;
  const existing = sourceTextureCache.get(source);
  if (existing && existing.width === width && existing.height === height) {
    return existing;
  }

  if (existing) {
    gl.deleteTexture(existing.texture);
  }

  const texture = twgl.createTexture(gl, {
    target: gl.TEXTURE_2D,
    width,
    height,
    internalFormat: gl.RGBA8,
    format: gl.RGBA,
    type: gl.UNSIGNED_BYTE,
    min: gl.LINEAR,
    mag: gl.LINEAR,
    wrapS: gl.CLAMP_TO_EDGE,
    wrapT: gl.CLAMP_TO_EDGE,
    auto: false,
  });
  const record: SourceTextureRecord = {
    texture,
    width,
    height,
    mutable: isMutableSource(source),
  };
  sourceTextureCache.set(source, record);
  return record;
};

export const uploadSourceTexture = (
  gl: WebGL2RenderingContext,
  texture: WebGLTexture,
  source: TexImageSource
): void => {
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 1);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 0);
  gl.bindTexture(gl.TEXTURE_2D, null);
};

export const resolveLutCacheKey = (
  url: string,
  level: 8 | 16,
  format: "RGBA8" | "RGBA16F"
): string => `${url}|${level}|${format}`;

export const touchSourceTextureLru = (
  lru: TexImageSource[],
  source: TexImageSource
): TexImageSource[] => {
  const next = lru.filter((entry) => entry !== source);
  next.push(source);
  return next;
};

export const pruneSourceTextureCache = (params: {
  gl: WebGL2RenderingContext;
  sourceTextureCache: Map<TexImageSource, SourceTextureRecord>;
  sourceTextureLru: TexImageSource[];
  currentSource: TexImageSource;
  pinnedSource: TexImageSource | null;
}): TexImageSource[] => {
  const { gl, sourceTextureCache, currentSource, pinnedSource } = params;
  const lru = [...params.sourceTextureLru];

  let scanBudget = lru.length;
  while (lru.length > SOURCE_TEXTURE_CACHE_LIMIT && scanBudget > 0) {
    const oldest = lru.shift();
    if (!oldest) {
      continue;
    }
    if (oldest === currentSource || oldest === pinnedSource) {
      lru.push(oldest);
      scanBudget -= 1;
      continue;
    }

    const record = sourceTextureCache.get(oldest);
    if (!record) {
      scanBudget -= 1;
      continue;
    }

    gl.deleteTexture(record.texture);
    sourceTextureCache.delete(oldest);
    scanBudget = lru.length;
  }

  return lru;
};
