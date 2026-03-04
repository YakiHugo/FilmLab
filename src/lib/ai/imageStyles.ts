import type { ImageStyleId } from "@/types/imageGeneration";

export interface ImageStyleConfig {
  id: ImageStyleId;
  label: string;
  promptHint: string;
}

export const IMAGE_STYLES: ImageStyleConfig[] = [
  {
    id: "none",
    label: "None",
    promptHint: "No style hint.",
  },
  {
    id: "photorealistic",
    label: "Photorealistic",
    promptHint: "Natural lighting, realistic texture, true-to-life detail.",
  },
  {
    id: "cinematic",
    label: "Cinematic",
    promptHint: "Film-like lighting, dramatic contrast, subtle grain.",
  },
  {
    id: "anime",
    label: "Anime",
    promptHint: "Stylized outlines, expressive color, cel-shaded look.",
  },
  {
    id: "digital-art",
    label: "Digital Art",
    promptHint: "Painterly digital brushwork with high color control.",
  },
  {
    id: "oil-painting",
    label: "Oil Painting",
    promptHint: "Thick brush texture and classical painterly strokes.",
  },
  {
    id: "watercolor",
    label: "Watercolor",
    promptHint: "Soft pigment bleeding with paper texture feel.",
  },
  {
    id: "sketch",
    label: "Sketch",
    promptHint: "Graphite-like outlines, rough hand-drawn shading.",
  },
  {
    id: "3d-render",
    label: "3D Render",
    promptHint: "Physically based lighting and rendered material detail.",
  },
  {
    id: "pixel-art",
    label: "Pixel Art",
    promptHint: "Low-resolution pixel grid and retro game palette.",
  },
];

export const getImageStyleConfig = (styleId: ImageStyleId) =>
  IMAGE_STYLES.find((style) => style.id === styleId);
