import type { ImageRenderTargetSize } from "./types";

export const resolveImageCompositionScale = ({
  referenceSize,
  targetSize,
}: {
  referenceSize?: ImageRenderTargetSize;
  targetSize: ImageRenderTargetSize;
}) => {
  const referenceWidth = Math.max(1, referenceSize?.width ?? targetSize.width);
  const referenceHeight = Math.max(1, referenceSize?.height ?? targetSize.height);
  const x = Math.max(1, targetSize.width) / referenceWidth;
  const y = Math.max(1, targetSize.height) / referenceHeight;
  return {
    x,
    y,
    uniform: Math.min(x, y),
  };
};
