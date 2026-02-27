import { streamText } from "ai";
import { z } from "zod";
import {
  type ApiRequest,
  type ApiResponse,
  handleRouteError,
  hasAnyApiKey,
  providerSchema,
  readJsonBody,
  sendError,
} from "./_utils";
import { HUB_SYSTEM_PROMPT } from "../src/lib/ai/chatPrompts";
import {
  createCanvasToolSchema,
  generateImageToolSchema,
  openInEditorToolSchema,
  selectAssetsToolSchema,
} from "../src/lib/ai/chatTools";
import { resolveModel } from "../src/lib/ai/provider";

const messageSchema = z.object({
  role: z.enum(["user", "assistant", "system"]),
  content: z.any(),
});

const requestSchema = z.object({
  messages: z.array(messageSchema).min(1),
  provider: providerSchema.default("openai"),
  model: z.string().default("gpt-4.1-mini"),
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
  } catch {
    sendError(response, 400, "Invalid request payload.");
    return;
  }

  try {
    const result = streamText({
      model: await resolveModel(payload.provider, payload.model),
      system: HUB_SYSTEM_PROMPT,
      messages: payload.messages as Parameters<typeof streamText>[0]["messages"],
      tools: {
        selectAssets: {
          description: "Select assets by natural-language filter and return filter intent.",
          parameters: selectAssetsToolSchema,
          execute: async (args) => ({
            tool: "selectAssets",
            status: "requested",
            args,
          }),
        },
        openInEditor: {
          description: "Request opening one asset in editor.",
          parameters: openInEditorToolSchema,
          execute: async (args) => ({
            tool: "openInEditor",
            status: "requested",
            args,
          }),
        },
        createCanvas: {
          description: "Create a canvas document and optionally place assets.",
          parameters: createCanvasToolSchema,
          execute: async (args) => ({
            tool: "createCanvas",
            status: "requested",
            args,
          }),
        },
        generateImage: {
          description: "Generate a new image from text prompt.",
          parameters: generateImageToolSchema,
          execute: async (args) => ({
            tool: "generateImage",
            status: "requested",
            args,
          }),
        },
      },
      toolChoice: "auto",
      maxSteps: 2,
      temperature: 0.5,
    });

    result.pipeUIMessageStreamToResponse(response);
  } catch (error) {
    handleRouteError(response, error, "AI chat request failed.");
  }
}
