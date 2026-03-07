import { generateObject, type LanguageModel } from "ai";
import type { FastifyPluginAsync } from "fastify";
import { ZodError, z } from "zod";
import { getConfig } from "../config";

const providerSchema = z.enum(["openai", "anthropic", "google"]);
type RecommendationProvider = z.infer<typeof providerSchema>;

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

const API_KEY_BY_PROVIDER: Record<RecommendationProvider, string> = {
  openai: "OPENAI_API_KEY",
  anthropic: "ANTHROPIC_API_KEY",
  google: "GOOGLE_GENERATIVE_AI_API_KEY",
};

const buildPrompt = (
  payload: z.infer<typeof requestSchema>,
  candidateIds: string[]
) =>
  [
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

const toSafeReason = (value: string | undefined) => {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : "Matched by visual style.";
};

const toSafeConfidence = (value: number | undefined) => {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return 0.5;
  }
  return Math.min(1, Math.max(0, value));
};

const sanitizeTopPresetRecommendations = (
  incoming: Array<{ presetId?: string; reason?: string; confidence?: number }> | undefined,
  candidatePresetIds: string[],
  topK: number
) => {
  const candidates = Array.from(new Set(candidatePresetIds));
  const candidateSet = new Set(candidates);
  const used = new Set<string>();
  const output: Array<{ presetId: string; reason: string; confidence: number }> = [];

  if (!Array.isArray(incoming)) {
    return output;
  }

  for (const item of incoming) {
    const presetId = typeof item?.presetId === "string" ? item.presetId : "";
    if (!presetId || used.has(presetId) || !candidateSet.has(presetId)) {
      continue;
    }

    used.add(presetId);
    output.push({
      presetId,
      reason: toSafeReason(item.reason),
      confidence: toSafeConfidence(item.confidence),
    });

    if (output.length >= topK) {
      break;
    }
  }

  return output;
};

const resolveRecommendationModel = async (
  provider: RecommendationProvider,
  modelId: string
): Promise<LanguageModel> => {
  switch (provider) {
    case "anthropic": {
      const { anthropic } = await import("@ai-sdk/anthropic");
      return anthropic(modelId);
    }
    case "google": {
      const { google } = await import("@ai-sdk/google");
      return google(modelId);
    }
    default: {
      const { openai } = await import("@ai-sdk/openai");
      return openai(modelId);
    }
  }
};

export const recommendFilmRoute: FastifyPluginAsync = async (app) => {
  const config = getConfig();

  app.post(
    "/api/recommend-film",
    {
      config: {
        rateLimit: {
          max: config.rateLimitMax,
          timeWindow: config.rateLimitTimeWindowMs,
        },
      },
    },
    async (request, reply) => {
      let payload: z.infer<typeof requestSchema>;

      try {
        payload = requestSchema.parse(request.body);
      } catch (error) {
        const message =
          error instanceof ZodError ? "Invalid request payload." : "Request body could not be parsed.";
        return reply.code(400).send({
          error: message,
          code: "ModelError",
        });
      }

      const requiredEnvVar = API_KEY_BY_PROVIDER[payload.provider];
      if (!process.env[requiredEnvVar]) {
        return reply.code(500).send({
          error: `${requiredEnvVar} is not configured.`,
          code: "ConfigMissing",
        });
      }

      const candidatePresetIds = payload.candidates.map((candidate) => candidate.id);

      try {
        const aiResult = await generateObject({
          model: await resolveRecommendationModel(payload.provider, payload.model),
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

        return reply.code(200).send({
          model: payload.model,
          topPresets: sanitizeTopPresetRecommendations(
            aiResult.object.topPresets,
            candidatePresetIds,
            payload.topK
          ),
        });
      } catch (error) {
        app.log.error(error);
        return reply.code(500).send({
          error: "Recommendation failed.",
          code: "ModelError",
        });
      }
    }
  );
};
