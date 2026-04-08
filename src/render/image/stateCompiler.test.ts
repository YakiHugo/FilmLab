import { createDefaultFilmProfile } from "@/lib/film";
import { describe, expect, it } from "vitest";
import {
  createDefaultCanvasImageRenderState,
  createNeutralCanvasImageRenderState,
} from "./stateCompiler";

describe("stateCompiler", () => {
  it("builds a neutral canonical render state without adjustment-shaped inputs", () => {
    const state = createNeutralCanvasImageRenderState();

    expect(state).toMatchObject({
      carrierTransforms: [],
      develop: {
        tone: {
          exposure: 0,
          contrast: 0,
        },
      },
      effects: [],
      masks: {
        byId: {},
      },
      film: {
        profileId: null,
        profileOverrides: null,
      },
    });
  });

  it("preserves film profile overrides on canonical film state", () => {
    const baseProfile = createDefaultFilmProfile();
    const moduleId = baseProfile.modules[0]?.id;
    if (!moduleId) {
      throw new Error("Expected film profile module.");
    }

    const state = createDefaultCanvasImageRenderState();
    state.film.profile = baseProfile;
    state.film.profileId = baseProfile.id;
    state.film.profileOverrides = {
      [moduleId]: {
        amount: 37,
      },
    };

    expect(state.film.profileOverrides).toEqual({
      [moduleId]: {
        amount: 37,
      },
    });
  });
});
