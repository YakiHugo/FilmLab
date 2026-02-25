import { generateObject } from "ai";
import { z } from "zod";
import { type ApiRequest, type ApiResponse, readJsonBody, sendError } from "./_utils";
import { resolveModel } from "../src/lib/ai/provider";
import { sanitizeTopPresetRecommendations } from "../src/lib/ai/recommendationUtils";

const providerSchema = z.enum(["openai", "anthropic", "google"]);

const candidateSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().default(""),
  tags: z.array(z.string()).default([]),
  intensity: z.number().min(0).max(100),
  isCustom: z.boolean(),
});

const requestSchema = z.object({
  assetId: z.string().min(1),
  imageDataUrl: z.string().min(16),
  metadata: z
    .object({
      width: z.number().optional(),
      height: z.number().optional(),
      cameraMake: z.string().optional(),
      cameraModel: z.string().optional(),
      lensModel: z.string().optional(),
      focalLength: z.number().optional(),
      aperture: z.number().optional(),
      shutterSpeed: z.string().optional(),
      iso: z.number().optional(),
      capturedAt: z.string().optional(),
    })
    .partial()
    .optional(),
  candidates: z.array(candidateSchema).min(1),
  topK: z.number().int().min(1).max(8).default(5),
  provider: providerSchema.default("openai"),
  model: z.string().min(1).default("gpt-4.1-mini"),
});

const resultSchema = z.object({
  topPresets: z.array(
    z.object({
      presetId: z.string(),
      reason: z.string(),
      confidence: z.number(),
    })
  ),
});

const API_KEY_BY_PROVIDER = {
  openai: "OPENAI_API_KEY",
  anthropic: "ANTHROPIC_API_KEY",
  google: "GOOGLE_GENERATIVE_AI_API_KEY",
} as const;

const buildPrompt = (
  payload: z.infer<typeof requestSchema>,
  candidateIds: string[]
) => {
  return [
    "You are a film-look recommendation model.",
    `Return exactly ${payload.topK} results if possible.`,
    "Only use candidate preset IDs from the provided list.",
    "Rank by visual match quality.",
    "Reason must be concise and specific.",
    "Confidence must be between 0 and 1.",
    `Asset ID: ${payload.assetId}`,
    `Metadata: ${JSON.stringify(payload.metadata ?? {})}`,
    `Candidate IDs: ${candidateIds.join(", ")}`,
    `Candidates: ${JSON.stringify(payload.candidates)}`,
  ].join("\n");
};

export default async function handler(request: ApiRequest, response: ApiResponse) {
  if (request.method !== "POST") {
    sendError(response, 405, "Method not allowed");
    return;
  }

  let payload: z.infer<typeof requestSchema>;
  try {
    const body = await readJsonBody(request);
    payload = requestSchema.parse(body);
  } catch (error) {
    sendError(response, 400, "Invalid request payload.");
    return;
  }

  const providerApiKeyEnv = API_KEY_BY_PROVIDER[payload.provider];
  if (!process.env[providerApiKeyEnv]) {
    sendError(response, 500, `${providerApiKeyEnv} is not configured.`);
    return;
  }

  const candidatePresetIds = payload.candidates.map((item) => item.id);

  try {
    const aiResult = await generateObject({
      model: resolveModel(payload.provider, payload.model),
      schema: resultSchema,
      temperature: 0.15,
      messages: [
        {
          role: "system",
          content:
            "Recommend film presets based on image and metadata. Never output IDs outside candidates.",
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: buildPrompt(payload, candidatePresetIds),
            },
            {
              type: "image",
              image: payload.imageDataUrl,
            },
          ],
        },
      ],
    });

    const topPresets = sanitizeTopPresetRecommendations(
      aiResult.object.topPresets,
      candidatePresetIds,
      payload.topK
    );

    response.status(200).json({
      model: payload.model,
      topPresets,
    });
  } catch (error) {
    sendError(response, 500, error instanceof Error ? error.message : "Recommendation failed.");
  }
}
