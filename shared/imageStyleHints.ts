import type { ImageStyleId } from "./imageGeneration";

export const IMAGE_STYLE_HINTS: Record<ImageStyleId, string> = {
  none: "No style hint.",
  photorealistic: "Natural lighting, realistic texture, true-to-life detail.",
  cinematic: "Film-like lighting, dramatic contrast, subtle grain.",
  anime: "Stylized outlines, expressive color, cel-shaded look.",
  "digital-art": "Painterly digital brushwork with high color control.",
  "oil-painting": "Thick brush texture and classical painterly strokes.",
  watercolor: "Soft pigment bleeding with paper texture feel.",
  sketch: "Graphite-like outlines, rough hand-drawn shading.",
  "3d-render": "Physically based lighting and rendered material detail.",
  "pixel-art": "Low-resolution pixel grid and retro game palette.",
};

export const getStylePromptHint = (styleId: ImageStyleId) => IMAGE_STYLE_HINTS[styleId];
