import { streamText, type UIMessage } from "ai";
import { z } from "zod";
import { type ApiRequest, type ApiResponse, readJsonBody, sendError, handleRouteError, providerSchema, hasAnyApiKey } from "./_utils";
import { resolveModel } from "../src/lib/ai/provider";
import { aiControllableAdjustmentsSchema } from "../src/lib/ai/editSchema";
import { buildSystemPrompt } from "../src/lib/ai/prompts";
import { histogramSummarySchema } from "../src/lib/ai/schemas";

const messageSchema = z.object({
  role: z.enum(["user", "assistant", "system"]),
  content: z.any(),
});

const requestSchema = z.object({
  messages: z.array(messageSchema).min(1),
  provider: providerSchema.default("openai"),
  model: z.string().default("gpt-4.1-mini"),
  imageDataUrl: z.string().optional(),
  histogramSummary: histogramSummarySchema.optional(),
  currentAdjustments: z.record(z.unknown()).optional(),
  currentFilmProfileId: z.string().optional(),
  referenceImages: z.array(z.object({
    imageDataUrl: z.string(),
    histogramSummary: histogramSummarySchema.optional(),
  })).max(3).optional(),
});

export default async function handler(request: ApiRequest, response: ApiResponse) {
  if (request.method !== "POST") {
    sendError(response, 405, "Method not allowed");
    return;
  }

  if (!hasAnyApiKey()) {
    sendError(response, 500, "No AI API key is configured.");
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

  const systemPrompt = buildSystemPrompt({
    histogramSummary: payload.histogramSummary,
    currentAdjustments: payload.currentAdjustments as Record<string, unknown> | undefined,
    currentFilmProfileId: payload.currentFilmProfileId,
    referenceImages: payload.referenceImages?.map((ref) => ({
      histogramSummary: ref.histogramSummary,
    })),
  });

  // Find the last user message index for image attachment
  let lastUserIdx = -1;
  for (let i = payload.messages.length - 1; i >= 0; i--) {
    if (payload.messages[i].role === "user") {
      lastUserIdx = i;
      break;
    }
  }

  // Build messages with image content attached to the last user message
  const messages = payload.messages.map((msg, idx) => {
    if (msg.role === "user" && idx === lastUserIdx && payload.imageDataUrl) {
      const contentParts: Array<{ type: string; text?: string; image?: string }> = [];
      if (typeof msg.content === "string") {
        contentParts.push({ type: "text", text: msg.content });
      }
      contentParts.push({ type: "image", image: payload.imageDataUrl });
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
      model: await resolveModel(payload.provider, payload.model),
      system: systemPrompt,
      messages: messages as Parameters<typeof streamText>[0]["messages"],
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
    handleRouteError(response, error, "AI edit request failed.");
  }
}
