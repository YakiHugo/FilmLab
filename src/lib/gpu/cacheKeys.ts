/**
 * Versioned cache key builder for the WebGPU render pipeline.
 *
 * All keys carry a schema-version prefix so that algorithm changes
 * automatically invalidate stale cached outputs. The v0 namespace is
 *
 * A single FNV-1a 32-bit hash helper is exposed here so every module
 * uses the same implementation instead of maintaining ad-hoc copies.
 */

export const FNV_OFFSET = 2166136261;
export const FNV_PRIME = 16777619;

export function fnv1a32(input: string): string {
  let hash = FNV_OFFSET;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, FNV_PRIME);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

const n = (value: number, precision = 3) =>
  Number.isFinite(value) ? value.toFixed(precision) : "x";

// ---------------------------------------------------------------------------
// v1 key builders
// ---------------------------------------------------------------------------

export const cacheKeys = {
  source(sourceId: string, w: number, h: number): string {
    return `v1:source:${sourceId}:${Math.round(w)}x${Math.round(h)}`;
  },

  geometry(sourceKey: string, fields: string): string {
    return `v1:geometry:${sourceKey}:${fnv1a32(fields)}`;
  },

  master(fields: string): string {
    return `v1:master:${fnv1a32(fields)}`;
  },

  hsl(fields: string): string {
    return `v1:hsl:${fnv1a32(fields)}`;
  },

  curve(fields: string): string {
    return `v1:curve:${fnv1a32(fields)}`;
  },

  detail(fields: string): string {
    return `v1:detail:${fnv1a32(fields)}`;
  },

  film(profileHash: string, grainSeed: number): string {
    return `v1:film:${profileHash}:${Math.round(grainSeed)}`;
  },

  pipeline(stageKeys: string[]): string {
    return `v1:pipeline:${fnv1a32(stageKeys.join("|"))}`;
  },

  output(pipelineKey: string, localKey: string, w: number, h: number): string {
    return `v1:output:${Math.round(w)}x${Math.round(h)}:${pipelineKey}:${localKey}`;
  },
} as const;

export { n as cacheKeyNum };
