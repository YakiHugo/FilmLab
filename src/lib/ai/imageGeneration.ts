import { imageGenerationRequestSchema, type ImageGenerationRequest } from "./imageGenerationSchema";

interface ImageGenerationResponse {
  imageUrl: string;
}

export async function generateImage(request: ImageGenerationRequest): Promise<ImageGenerationResponse> {
  const payload = imageGenerationRequestSchema.parse(request);
  const response = await fetch("/api/image-generate", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    throw new Error("Image generation failed.");
  }
  return (await response.json()) as ImageGenerationResponse;
}
