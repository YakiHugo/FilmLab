/**
 * Film Profile V2 — new profile format with 6-layer model.
 *
 * Coexists with the V1 `FilmProfile` type. V1 profiles are auto-migrated
 * to V2 at runtime via `ensureFilmProfileV2()`.
 */

import type { FilmProfile } from "./index";

/** Film Profile V2 with explicit layer configuration. */
export interface FilmProfileV2 {
  id: string;
  version: 2;
  name: string;
  description?: string;
  type: "negative" | "slide" | "instant" | "bw";
  tags?: string[];

  /** Layer 1: Tone Response — filmic S-curve */
  toneResponse: {
    enabled: boolean;
    shoulder: number; // [0, 1] highlight compression
    toe: number; // [0, 1] shadow lift
    gamma: number; // [0.5, 2.0] mid-tone curve
  };

  /** Layer 2: Color Matrix (Phase 3 — optional) */
  colorMatrix?: {
    enabled: boolean;
    /** 3x3 row-major color matrix */
    matrix: [number, number, number, number, number, number, number, number, number];
  };

  /** Layer 3: 3D LUT via HaldCLUT */
  lut: {
    enabled: boolean;
    /** HaldCLUT file path relative to public/luts/ */
    path: string;
    /** LUT level: 8 = 8^3 = 512px, 16 = 16^3 = 4096px */
    size: 8 | 16;
    /** Blend intensity [0, 1] */
    intensity: number;
  };

  /** Layer 4: Per-zone color cast */
  colorCast?: {
    enabled: boolean;
    shadows: [number, number, number]; // RGB offset
    midtones: [number, number, number]; // RGB offset
    highlights: [number, number, number]; // RGB offset
  };

  /** Layer 5: Halation — warm glow from bright areas bleeding through film base */
  halation?: {
    enabled: boolean;
    intensity: number; // [0, 1]
    threshold: number; // [0.5, 1]
    color: [number, number, number]; // glow tint (typically warm red)
    radius: number; // blur radius [1, 20]
  };

  /** Layer 5: Bloom — neutral bright-area glow */
  bloom?: {
    enabled: boolean;
    intensity: number; // [0, 1]
    threshold: number; // [0.5, 1]
    radius: number; // blur radius [1, 20]
  };

  /** Layer 6: Film grain */
  grain: {
    enabled: boolean;
    amount: number; // [0, 1]
    size: number; // [0.5, 2.0]
    colorGrain: boolean; // true = color grain, false = luminance-only
    roughness: number; // [0, 1]
    shadowBias: number; // [0, 1] shadow grain enhancement
  };

  /** Layer 6: Vignette */
  vignette: {
    enabled: boolean;
    amount: number; // [-1, 1] (negative = white corners)
    midpoint: number; // [0, 1] gradient start
    roundness: number; // [0, 1] ellipse shape
  };

  /** Film defects — light leaks, dust, scratches (migrated from V1) */
  defects?: {
    enabled: boolean;
    leakProbability: number; // [0, 1]
    leakStrength: number; // [0, 1]
    dustAmount: number; // [0, 1]
    scratchAmount: number; // [0, 1]
  };
}

/** Discriminated union of all film profile versions. Use `version` to narrow. */
export type FilmProfileAny = FilmProfile | FilmProfileV2;
