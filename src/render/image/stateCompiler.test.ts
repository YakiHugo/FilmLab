import { createDefaultAdjustments } from "@/lib/adjustments";
import { createDefaultFilmProfile } from "@/lib/film";
import { describe, expect, it } from "vitest";
import {
  compileImageRenderOutputToLegacyTimestampAdjustments,
  createDefaultCanvasImageRenderState,
} from "./stateCompiler";

describe("stateCompiler", () => {
  it("preserves film profile overrides on canonical film state", () => {
    const baseProfile = createDefaultFilmProfile();
    const moduleId = baseProfile.modules[0]?.id;
    if (!moduleId) {
      throw new Error("Expected film profile module.");
    }

    const state = createDefaultCanvasImageRenderState({
      adjustments: createDefaultAdjustments(),
      filmProfile: baseProfile,
      filmProfileOverrides: {
        [moduleId]: {
          amount: 37,
        },
      },
    });

    expect(state.film.profileOverrides).toEqual({
      [moduleId]: {
        amount: 37,
      },
    });
  });

  it("compiles canonical output timestamp state into the legacy overlay shape", () => {
    const adjustments = compileImageRenderOutputToLegacyTimestampAdjustments({
      timestamp: {
        enabled: true,
        position: "top-left",
        size: 18,
        opacity: 64,
      },
    });

    expect(adjustments).toEqual({
      timestampEnabled: true,
      timestampPosition: "top-left",
      timestampSize: 18,
      timestampOpacity: 64,
    });
  });
});
