import { createDefaultAdjustments } from "@/lib/adjustments";
import { createDefaultFilmProfile } from "@/lib/film";
import { describe, expect, it } from "vitest";
import {
  compileImageRenderDocumentToProcessSettings,
  compileImageRenderOutputToLegacyTimestampAdjustments,
  createDefaultCanvasImageRenderState,
} from "./stateCompiler";
import { createImageRenderDocument } from "./types";

describe("stateCompiler", () => {
  it("applies film profile overrides before entering the low-level render pipeline", () => {
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
    const document = createImageRenderDocument({
      id: "image-1",
      source: {
        assetId: "asset-1",
        objectUrl: "blob:asset-1",
        contentHash: null,
        name: "asset-1.jpg",
        mimeType: "image/jpeg",
      },
      ...state,
    });

    const processSettings = compileImageRenderDocumentToProcessSettings(document);
    const resolvedModule = processSettings.filmProfile?.modules.find((module) => module.id === moduleId);

    expect(resolvedModule?.amount).toBe(37);
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
