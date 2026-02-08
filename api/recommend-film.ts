import { generateObject } from "ai";
import { openai } from "@ai-sdk/openai";
import { z } from "zod";

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

const MODEL_ID = "gpt-4.1-mini";

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

const sanitizeTopPresetRecommendations = (
  incoming: Array<{ presetId: string; reason: string; confidence: number }>,
  candidatePresetIds: string[],
  topK: number
) => {
  const candidates = Array.from(new Set(candidatePresetIds));
  const candidateSet = new Set(candidates);
  const used = new Set<string>();
  const output: Array<{ presetId: string; reason: string; confidence: number }> = [];

  for (const item of incoming) {
    if (!item || typeof item.presetId !== "string") {
      continue;
    }
    if (!candidateSet.has(item.presetId) || used.has(item.presetId)) {
      continue;
    }
    used.add(item.presetId);
    output.push({
      presetId: item.presetId,
      reason:
        typeof item.reason === "string" && item.reason.trim().length > 0
          ? item.reason.trim()
          : "Matched by visual style.",
      confidence:
        typeof item.confidence === "number" && Number.isFinite(item.confidence)
          ? clamp(item.confidence, 0, 1)
          : 0.5,
    });
    if (output.length >= topK) {
      break;
    }
  }

  for (const presetId of candidates) {
    if (output.length >= topK) {
      break;
    }
    if (used.has(presetId)) {
      continue;
    }
    output.push({
      presetId,
      reason: "Fallback recommendation.",
      confidence: 0.4,
    });
  }

  return output;
};

const readJsonBody = async (request: any) => {
  if (typeof request.body === "string") {
    return JSON.parse(request.body) as unknown;
  }
  if (request.body && typeof request.body === "object") {
    return request.body as unknown;
  }
  if (typeof request.on !== "function") {
    return {};
  }

  const chunks: Buffer[] = [];
  await new Promise<void>((resolve, reject) => {
    request.on?.("data", (chunk: Buffer) => chunks.push(Buffer.from(chunk)));
    request.on?.("end", () => resolve());
    request.on?.("error", (error: unknown) =>
      reject(error instanceof Error ? error : new Error("Request stream failed."))
    );
  });
  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw) {
    return {};
  }
  return JSON.parse(raw) as unknown;
};

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

export default async function handler(request: any, response: any) {
  if (request.method !== "POST") {
    response.status(405).json({ error: "Method not allowed" });
    return;
  }

  if (!process.env.OPENAI_API_KEY) {
    response.status(500).json({ error: "OPENAI_API_KEY is not configured." });
    return;
  }

  let payload: z.infer<typeof requestSchema>;
  try {
    const body = await readJsonBody(request);
    payload = requestSchema.parse(body);
  } catch (error) {
    response.status(400).json({ error: "Invalid request payload." });
    return;
  }

  const candidatePresetIds = payload.candidates.map((item) => item.id);

  try {
    const aiResult = await generateObject({
      model: openai(MODEL_ID),
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
      model: MODEL_ID,
      topPresets,
    });
  } catch (error) {
    response.status(500).json({
      error: error instanceof Error ? error.message : "Recommendation failed.",
    });
  }
}
