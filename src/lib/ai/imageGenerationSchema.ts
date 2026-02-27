import { z } from "zod";

export const imageProviderSchema = z.enum(["openai", "stability"]);

export const imageGenerationRequestSchema = z.object({
  prompt: z.string().min(1),
  provider: imageProviderSchema.default("openai"),
  model: z.string(),
  size: z.string().optional(),
});

export type ImageProvider = z.infer<typeof imageProviderSchema>;
export type ImageGenerationRequest = z.infer<typeof imageGenerationRequestSchema>;
