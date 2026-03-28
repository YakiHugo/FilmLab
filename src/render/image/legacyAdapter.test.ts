import { createDefaultAdjustments } from "@/lib/adjustments";
import type { Asset, LocalAdjustment } from "@/types";
import { listBuiltInFilmProfiles } from "@/lib/film";
import { describe, expect, it } from "vitest";
import { legacyEditingAdjustmentsToImageRenderDocument } from "./legacyAdapter";

const createAsset = (): Asset => ({
  id: "asset-1",
  name: "asset-1.jpg",
  type: "image/jpeg",
  size: 1234,
  createdAt: "2026-03-27T00:00:00.000Z",
  objectUrl: "blob:asset-1",
  metadata: {
    width: 1600,
    height: 900,
  },
});

const createLocalAdjustment = (): LocalAdjustment => ({
  id: "local-1",
  enabled: true,
  amount: 75,
  mask: {
    mode: "radial",
    centerX: 0.5,
    centerY: 0.5,
    radiusX: 0.3,
    radiusY: 0.3,
    feather: 0.2,
  },
  adjustments: {
    exposure: 10,
  },
});

describe("legacyEditingAdjustmentsToImageRenderDocument", () => {
  it("extracts ordered legacy effects and output metadata", () => {
    const adjustments = createDefaultAdjustments();
    adjustments.ascii = {
      ...adjustments.ascii!,
      enabled: true,
      charsetPreset: "blocks",
      colorMode: "full-color",
      cellSize: 10,
      characterSpacing: 1.25,
      contrast: 1.6,
      dither: "floyd-steinberg",
      invert: true,
    };
    adjustments.brightness = 12;
    adjustments.hue = -20;
    adjustments.blur = 18;
    adjustments.dilate = 6;
    adjustments.timestampEnabled = true;
    adjustments.timestampPosition = "top-left";
    adjustments.timestampSize = 18;
    adjustments.timestampOpacity = 70;
    adjustments.localAdjustments = [createLocalAdjustment()];

    const document = legacyEditingAdjustmentsToImageRenderDocument({
      id: "image:asset-1",
      asset: createAsset(),
      adjustments,
    });

    expect(document.effects.map((effect) => effect.type)).toEqual(["ascii", "filter2d"]);
    expect(document.effects[0]).toMatchObject({
      type: "ascii",
      placement: "afterFilm",
      analysisSource: "afterFilm",
      params: {
        renderMode: "glyph",
        preset: "blocks",
        colorMode: "full-color",
        backgroundMode: "cell-solid",
        backgroundColor: "#000000",
      },
    });
    expect(document.effects[1]).toMatchObject({
      type: "filter2d",
      placement: "afterOutput",
      params: {
        brightness: 12,
        hue: -20,
        blur: 18,
        dilate: 6,
      },
    });
    expect(document.develop.tone.exposure).toBe(adjustments.exposure);
    expect(document.develop.color.hue).toBe(0);
    expect(document.develop.regions).toHaveLength(1);
    expect(document.develop.regions[0]).toMatchObject({
      id: "local-1",
      enabled: true,
      amount: 75,
      maskId: "local-1",
      adjustments: {
        exposure: 10,
      },
    });
    expect(document.output.timestamp).toEqual({
      enabled: true,
      position: "top-left",
      size: 18,
      opacity: 70,
    });
    expect(document.masks.byId["local-1"]).toMatchObject({
      id: "local-1",
      kind: "legacy-local-adjustment",
      sourceLocalAdjustmentId: "local-1",
    });
  });

  it("omits inactive legacy effects while keeping geometry and film state", () => {
    const adjustments = createDefaultAdjustments();
    adjustments.rotate = 12;
    adjustments.flipHorizontal = true;
    adjustments.opticsProfile = true;
    adjustments.opticsCA = true;
    adjustments.opticsDistortionK1 = 14;
    adjustments.opticsDistortionK2 = -7;
    adjustments.opticsCaAmount = 31;
    adjustments.opticsVignette = 22;
    adjustments.opticsVignetteMidpoint = 61;

    const document = legacyEditingAdjustmentsToImageRenderDocument({
      id: "image:asset-1",
      asset: {
        ...createAsset(),
        filmProfile: {
          id: "film-1",
          name: "Film 1",
        } as Asset["filmProfile"],
      },
      adjustments,
    });

    expect(document.effects).toEqual([]);
    expect(document.geometry).toMatchObject({
      rotate: 12,
      flipHorizontal: true,
      opticsProfile: true,
      opticsCA: true,
      opticsDistortionK1: 14,
      opticsDistortionK2: -7,
      opticsCaAmount: 31,
      opticsVignette: 22,
      opticsVignetteMidpoint: 61,
    });
    expect(document.film.profile).toMatchObject({
      id: "film-1",
    });
    expect(document.film.profileId).toBe("film-1");
  });

  it("resolves built-in film profiles from legacy filmProfileId provenance", () => {
    const builtInProfile = listBuiltInFilmProfiles()[0];
    expect(builtInProfile).toBeTruthy();

    const document = legacyEditingAdjustmentsToImageRenderDocument({
      id: "image:asset-1",
      asset: {
        ...createAsset(),
        filmProfileId: builtInProfile!.id,
      },
      adjustments: createDefaultAdjustments(),
    });

    expect(document.film.profileId).toBe(builtInProfile!.id);
    expect(document.film.profile).toMatchObject({
      id: builtInProfile!.id,
    });
  });

  it("keeps profileId aligned with the actual resolved inline asset profile", () => {
    const builtInProfile = listBuiltInFilmProfiles()[0];
    expect(builtInProfile).toBeTruthy();

    const document = legacyEditingAdjustmentsToImageRenderDocument({
      id: "image:asset-1",
      asset: {
        ...createAsset(),
        filmProfileId: builtInProfile!.id,
        filmProfile: {
          id: "inline-profile",
          name: "Inline Profile",
        } as Asset["filmProfile"],
      },
      adjustments: createDefaultAdjustments(),
    });

    expect(document.film.profileId).toBe("inline-profile");
    expect(document.film.profile).toMatchObject({
      id: "inline-profile",
    });
  });

  it("does not inherit the asset film profile when an explicit filmProfileId misses", () => {
    const document = legacyEditingAdjustmentsToImageRenderDocument({
      id: "image:asset-1",
      asset: {
        ...createAsset(),
        filmProfile: {
          id: "asset-inline-profile",
          name: "Asset Inline Profile",
        } as Asset["filmProfile"],
      },
      adjustments: createDefaultAdjustments(),
      filmProfileId: "missing-profile",
    });

    expect(document.film.profileId).toBe("missing-profile");
    expect(document.film.profile).toBeUndefined();
  });
});
