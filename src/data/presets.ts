import { createNeutralCanvasImageRenderState, type CanvasImageRenderStateV1 } from "@/render/image";
import type { Preset } from "@/types";

const createPresetRenderState = ({
  filmProfileId = null,
  tone = {},
  color = {},
  detail = {},
  fx = {},
}: {
  filmProfileId?: string | null;
  tone?: Partial<CanvasImageRenderStateV1["develop"]["tone"]>;
  color?: Partial<CanvasImageRenderStateV1["develop"]["color"]>;
  detail?: Partial<CanvasImageRenderStateV1["develop"]["detail"]>;
  fx?: Partial<CanvasImageRenderStateV1["develop"]["fx"]>;
}): CanvasImageRenderStateV1 => {
  const state = createNeutralCanvasImageRenderState();
  state.develop.tone = {
    ...state.develop.tone,
    ...tone,
  };
  state.develop.color = {
    ...state.develop.color,
    ...color,
  };
  state.develop.detail = {
    ...state.develop.detail,
    ...detail,
  };
  state.develop.fx = {
    ...state.develop.fx,
    ...fx,
  };
  state.film.profileId = filmProfileId;
  return state;
};

export const presets: Preset[] = [
  {
    id: "original",
    name: "Original",
    tags: [],
    intensity: 0,
    description: "涓嶅仛浠讳綍澶勭悊锛屼繚鎸佸師濮嬪浘鍍忋€?",
    renderState: createPresetRenderState({}),
  },
  {
    id: "portrait-01",
    name: "Portrait Soft",
    tags: ["portrait"],
    intensity: 60,
    description: "鏌斿拰鑲よ壊涓庤嚜鐒堕珮鍏夎繃娓°€?",
    renderState: createPresetRenderState({
      filmProfileId: "film-portrait-soft-v1",
      tone: {
        exposure: 6,
        contrast: -8,
        highlights: -12,
        shadows: 8,
      },
      color: {
        temperature: 6,
        vibrance: 10,
        saturation: -4,
      },
      detail: {
        clarity: -6,
      },
    }),
  },
  {
    id: "portrait-02",
    name: "Portrait Muted",
    tags: ["portrait"],
    intensity: 55,
    description: "闄嶄綆楗卞拰搴︼紝閫傚悎闃村ぉ涓庨€嗗厜鍦烘櫙銆?",
    renderState: createPresetRenderState({
      filmProfileId: "film-portrait-fade-v1",
      tone: {
        exposure: 4,
        contrast: -6,
        highlights: -8,
        shadows: 10,
      },
      color: {
        vibrance: -6,
        saturation: -18,
      },
      detail: {
        clarity: -8,
      },
    }),
  },
  {
    id: "portrait-03",
    name: "Vintage Warm",
    tags: ["portrait"],
    intensity: 65,
    description: "鏆栬壊璋冩惌閰嶈交寰绮掓劅銆?",
    renderState: createPresetRenderState({
      filmProfileId: "film-portrait-fade-v1",
      tone: {
        highlights: -10,
        shadows: 6,
      },
      color: {
        temperature: 14,
        tint: 4,
        saturation: -6,
      },
      fx: {
        vignette: 8,
        grain: 18,
      },
    }),
  },
  {
    id: "landscape-01",
    name: "Landscape Clear",
    tags: ["landscape"],
    intensity: 70,
    description: "娓呴€忛攼鍒╋紝骞跺寮虹敾闈㈢旱娣辨劅銆?",
    renderState: createPresetRenderState({
      filmProfileId: "film-landscape-cool-v1",
      tone: {
        exposure: 6,
        contrast: 12,
        shadows: 14,
        highlights: -4,
      },
      color: {
        vibrance: 12,
      },
      detail: {
        dehaze: 8,
        clarity: 10,
      },
    }),
  },
  {
    id: "landscape-02",
    name: "Landscape Cool",
    tags: ["landscape"],
    intensity: 60,
    description: "鍐疯壊鍊惧悜锛屽己鍖栧ぉ绌哄眰娆″垎绂汇€?",
    renderState: createPresetRenderState({
      filmProfileId: "film-landscape-cool-v1",
      tone: {
        contrast: 6,
        shadows: 8,
      },
      color: {
        temperature: -12,
        tint: -6,
        vibrance: 10,
        saturation: 4,
      },
    }),
  },
  {
    id: "landscape-03",
    name: "Landscape Sunset",
    tags: ["landscape"],
    intensity: 75,
    description: "閲戣壊鏃跺埢鍏夋劅锛岄€傚悎鎴忓墽鍖栧満鏅€?",
    renderState: createPresetRenderState({
      filmProfileId: "film-landscape-golden-v1",
      tone: {
        highlights: -6,
        shadows: 6,
      },
      color: {
        temperature: 18,
        tint: 6,
        saturation: 10,
        vibrance: 12,
      },
      detail: {
        dehaze: 4,
      },
    }),
  },
  {
    id: "night-01",
    name: "Night Neon",
    tags: ["night"],
    intensity: 70,
    description: "鍘嬬缉楂樺厜骞舵彁浜湏铏硅壊褰┿€?",
    renderState: createPresetRenderState({
      filmProfileId: "film-night-neon-v1",
      tone: {
        exposure: -4,
        contrast: 16,
        highlights: -20,
        shadows: 10,
      },
      color: {
        saturation: 12,
        vibrance: 18,
      },
      detail: {
        dehaze: 12,
      },
    }),
  },
  {
    id: "night-02",
    name: "Night Detail",
    tags: ["night"],
    intensity: 55,
    description: "鍦ㄩ€備腑瀵规瘮涓嬫仮澶嶆殫閮ㄧ粏鑺傘€?",
    renderState: createPresetRenderState({
      filmProfileId: "film-night-neon-v1",
      tone: {
        exposure: 6,
        shadows: 18,
        blacks: 6,
        highlights: -12,
      },
      color: {
        saturation: 6,
      },
      detail: {
        clarity: 4,
      },
    }),
  },
  {
    id: "night-03",
    name: "Night Blue City",
    tags: ["night"],
    intensity: 65,
    description: "鍐疯皟鍩庡競澶滄櫙椋庢牸銆?",
    renderState: createPresetRenderState({
      filmProfileId: "film-night-neon-v1",
      tone: {
        contrast: 10,
        highlights: -8,
      },
      color: {
        temperature: -16,
        tint: -6,
        saturation: 8,
      },
    }),
  },
  {
    id: "bw-01",
    name: "BW Classic",
    tags: ["bw"],
    intensity: 60,
    description: "鍧囪　鐨勯粦鐧藉姣旇〃鐜般€?",
    renderState: createPresetRenderState({
      filmProfileId: "film-bw-soft-v1",
      tone: {
        contrast: 10,
      },
      color: {
        saturation: -80,
      },
      detail: {
        clarity: 8,
      },
      fx: {
        grain: 12,
      },
    }),
  },
  {
    id: "bw-02",
    name: "BW Hard",
    tags: ["bw"],
    intensity: 70,
    description: "寮虹粨鏋勬劅涓庨珮瀵规瘮椋庢牸銆?",
    renderState: createPresetRenderState({
      filmProfileId: "film-bw-contrast-v1",
      tone: {
        contrast: 24,
        highlights: -6,
        whites: 8,
        blacks: -10,
      },
      color: {
        saturation: -90,
      },
      detail: {
        clarity: 16,
      },
      fx: {
        grain: 16,
      },
    }),
  },
  {
    id: "bw-03",
    name: "BW Soft",
    tags: ["bw"],
    intensity: 50,
    description: "鏌斿拰鍗曡壊琛ㄧ幇骞朵繚鐣欑粏鑺傘€?",
    renderState: createPresetRenderState({
      filmProfileId: "film-bw-soft-v1",
      tone: {
        contrast: -6,
        highlights: -10,
        shadows: 10,
      },
      color: {
        saturation: -70,
      },
      detail: {
        clarity: -4,
      },
      fx: {
        grain: 14,
      },
    }),
  },
];
