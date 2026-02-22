import { streamText } from "ai";
import { z } from "zod";
import { resolveModel } from "../src/lib/ai/provider";
import { aiControllableAdjustmentsSchema } from "../src/lib/ai/editSchema";
import { buildSystemPrompt } from "../src/lib/ai/prompts";

const histogramSummarySchema = z.object({
  meanBrightness: z.number(),
  contrastSpread: z.number(),
  temperature: z.enum(["warm", "neutral", "cool"]),
  saturationLevel: z.enum(["low", "medium", "high"]),
  shadowCharacter: z.enum(["crushed", "normal", "lifted"]),
  highlightCharacter: z.enum(["clipped", "normal", "rolled"]),
  isMonochrome: z.boolean(),
}).optional();

const messageSchema = z.object({
  role: z.enum(["user", "assistant", "system"]),
  content: z.any(),
});

const requestSchema = z.object({
  messages: z.array(messageSchema).min(1),
  provider: z.string().default("openai"),
  model: z.string().default("gpt-4.1-mini"),
  imageDataUrl: z.string().optional(),
  histogramSummary: histogramSummarySchema,
  currentAdjustments: z.record(z.unknown()).optional(),
  currentFilmProfileId: z.string().optional(),
  referenceImages: z.array(z.object({
    imageDataUrl: z.string(),
    histogramSummary: histogramSummarySchema,
  })).max(3).optional(),
});

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
  if (!raw) return {};
  return JSON.parse(raw) as unknown;
};

export default async function handler(request: any, response: any) {
  if (request.method !== "POST") {
    response.status(405).json({ error: "Method not allowed" });
    return;
  }

  // Check for at least one API key
  if (!process.env.OPENAI_API_KEY && !process.env.ANTHROPIC_API_KEY && !process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
    response.status(500).json({ error: "No AI API key is configured." });
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

  const systemPrompt = buildSystemPrompt({
    histogramSummary: payload.histogramSummary as any,
    currentAdjustments: payload.currentAdjustments as any,
    currentFilmProfileId: payload.currentFilmProfileId,
    referenceImages: payload.referenceImages?.map((ref) => ({
      histogramSummary: ref.histogramSummary as any,
    })),
  });

  // Build messages with image content
  const messages = payload.messages.map((msg, idx) => {
    // Attach the current image to the first user message
    if (msg.role === "user" && idx === 0 && payload.imageDataUrl) {
      const contentParts: any[] = [];
      if (typeof msg.content === "string") {
        contentParts.push({ type: "text", text: msg.content });
      }
      contentParts.push({ type: "image", image: payload.imageDataUrl });
      // Attach reference images if present
      if (payload.referenceImages) {
        for (const ref of payload.referenceImages) {
          contentParts.push({ type: "image", image: ref.imageDataUrl });
        }
      }
      return { ...msg, content: contentParts };
    }
    return msg;
  });

  try {
    const result = streamText({
      model: resolveModel(payload.provider, payload.model),
      system: systemPrompt,
      messages: messages as any,
      tools: {
        applyAdjustments: {
          description: "Apply photo editing adjustments to the current image. You MUST call this tool after analyzing the image.",
          parameters: z.object({
            adjustments: aiControllableAdjustmentsSchema,
            filmProfileId: z.string().optional().describe("Optional film profile ID to apply. Only set if the style strongly aligns with a profile."),
          }),
        },
      },
      toolChoice: "auto",
      temperature: 0.3,
      maxSteps: 1,
    });

    result.pipeUIMessageStreamToResponse(response);
  } catch (error) {
    response.status(500).json({
      error: error instanceof Error ? error.message : "AI edit request failed.",
    });
  }
}
