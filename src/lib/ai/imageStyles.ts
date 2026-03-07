import type { ImageStyleId } from "@/types/imageGeneration";
import { getStylePromptHint } from "../../../shared/imageStyleHints";

export interface ImageStyleConfig {
  id: ImageStyleId;
  label: string;
  promptHint: string;
}

export const IMAGE_STYLES: ImageStyleConfig[] = [
  {
    id: "none",
    label: "None",
    promptHint: getStylePromptHint("none"),
  },
  {
    id: "photorealistic",
    label: "Photorealistic",
    promptHint: getStylePromptHint("photorealistic"),
  },
  {
    id: "cinematic",
    label: "Cinematic",
    promptHint: getStylePromptHint("cinematic"),
  },
  {
    id: "anime",
    label: "Anime",
    promptHint: getStylePromptHint("anime"),
  },
  {
    id: "digital-art",
    label: "Digital Art",
    promptHint: getStylePromptHint("digital-art"),
  },
  {
    id: "oil-painting",
    label: "Oil Painting",
    promptHint: getStylePromptHint("oil-painting"),
  },
  {
    id: "watercolor",
    label: "Watercolor",
    promptHint: getStylePromptHint("watercolor"),
  },
  {
    id: "sketch",
    label: "Sketch",
    promptHint: getStylePromptHint("sketch"),
  },
  {
    id: "3d-render",
    label: "3D Render",
    promptHint: getStylePromptHint("3d-render"),
  },
  {
    id: "pixel-art",
    label: "Pixel Art",
    promptHint: getStylePromptHint("pixel-art"),
  },
];

export const getImageStyleConfig = (styleId: ImageStyleId) =>
  IMAGE_STYLES.find((style) => style.id === styleId);
