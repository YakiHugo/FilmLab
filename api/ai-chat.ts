import { convertToModelMessages, streamText, type UIMessage } from "ai";
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
import { buildHubPrompt } from "../src/lib/ai/chatPrompts";
import {
  addTextToCanvasToolSchema,
  applyPresetToAssetsToolSchema,
  createCanvasToolSchema,
  deleteAssetsToolSchema,
  describeAssetsToolSchema,
  exportCanvasToolSchema,
  generateImageToolSchema,
  openInEditorToolSchema,
  selectAssetsToolSchema,
  tagAssetsToolSchema,
} from "../src/lib/ai/chatTools";
import { resolveModel } from "../src/lib/ai/provider";

const messageContentPartSchema = z
  .object({
    type: z.string(),
    text: z.string().optional(),
    image: z.string().optional(),
    image_url: z.string().optional(),
  })
  .passthrough();

const uiMessagePartSchema = z
  .object({
    type: z.string(),
  })
  .passthrough();

const messageSchema = z
  .object({
    id: z.string().optional(),
    role: z.enum(["user", "assistant", "system"]),
    // Keep this broad for AI SDK compatibility while avoiding fully untyped `any`.
    parts: z.array(uiMessagePartSchema).optional(),
    content: z.union([z.string(), z.array(messageContentPartSchema)]).optional(),
  })
  .passthrough();

const requestSchema = z.object({
  messages: z.array(messageSchema).min(1),
  provider: providerSchema.default("openai"),
  model: z.string().default("gpt-4.1-mini"),
  context: z
    .object({
      assetCount: z.number().optional(),
      selectedAssetCount: z.number().optional(),
      selectedAssets: z
        .array(
          z.object({
            id: z.string(),
            name: z.string(),
            tags: z.array(z.string()).optional(),
            source: z.string().optional(),
          })
        )
        .optional(),
      activeCanvas: z
        .object({
          id: z.string(),
          name: z.string(),
          elementCount: z.number(),
          size: z.object({
            width: z.number(),
            height: z.number(),
          }),
        })
        .nullable()
        .optional(),
    })
    .optional(),
});

const MAX_CONTEXT_MESSAGES = 24;

const trimMessagesForContextWindow = (
  messages: Array<z.infer<typeof messageSchema>>
) => {
  if (messages.length <= MAX_CONTEXT_MESSAGES) {
    return messages;
  }

  const systemMessages = messages.filter((message) => message.role === "system");
  const nonSystemMessages = messages.filter((message) => message.role !== "system");
  const recentNonSystem = nonSystemMessages.slice(-MAX_CONTEXT_MESSAGES);

  return [...systemMessages.slice(0, 1), ...recentNonSystem];
};

const toUiMessage = (message: z.infer<typeof messageSchema>, index: number): UIMessage => {
  if (Array.isArray(message.parts) && message.parts.length > 0) {
    return {
      id: message.id ?? `chat-msg-${index}`,
      role: message.role,
      parts: message.parts as UIMessage["parts"],
    };
  }

  if (typeof message.content === "string") {
    return {
      id: message.id ?? `chat-msg-${index}`,
      role: message.role,
      parts: [{ type: "text", text: message.content }],
    };
  }

  const parts: UIMessage["parts"] = [];
  for (const entry of message.content ?? []) {
    if (!entry || typeof entry !== "object") {
      continue;
    }
    if (entry.type === "text" && typeof entry.text === "string") {
      parts.push({ type: "text", text: entry.text });
      continue;
    }
    const imageUrl =
      typeof entry.image === "string"
        ? entry.image
        : typeof entry.image_url === "string"
          ? entry.image_url
          : null;
    if (imageUrl) {
      parts.push({
        type: "file",
        mediaType: "image/*",
        url: imageUrl,
      });
    }
  }

  return {
    id: message.id ?? `chat-msg-${index}`,
    role: message.role,
    parts,
  };
};

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
    const trimmedMessages = trimMessagesForContextWindow(payload.messages);
    const uiMessages = trimmedMessages.map(toUiMessage);
    const modelMessages = await convertToModelMessages(uiMessages, {
      ignoreIncompleteToolCalls: true,
    });

    const result = streamText({
      model: await resolveModel(payload.provider, payload.model),
      system: buildHubPrompt(payload.context),
      messages: modelMessages,
      tools: {
        selectAssets: {
          description: "Select assets by semantic filter and return matching IDs.",
          parameters: selectAssetsToolSchema,
        },
        openInEditor: {
          description: "Open one asset in editor.",
          parameters: openInEditorToolSchema,
        },
        createCanvas: {
          description: "Create a canvas board and optionally place assets.",
          parameters: createCanvasToolSchema,
        },
        generateImage: {
          description: "Generate and import an image from text prompt.",
          parameters: generateImageToolSchema,
        },
        applyPresetToAssets: {
          description: "Apply a preset to target assets.",
          parameters: applyPresetToAssetsToolSchema,
        },
        tagAssets: {
          description: "Add or remove tags from assets.",
          parameters: tagAssetsToolSchema,
        },
        deleteAssets: {
          description: "Delete assets, requires confirm=true.",
          parameters: deleteAssetsToolSchema,
        },
        addTextToCanvas: {
          description: "Add text layer onto the active or specified canvas.",
          parameters: addTextToCanvasToolSchema,
        },
        exportCanvas: {
          description: "Export the active canvas as PNG or JPEG.",
          parameters: exportCanvasToolSchema,
        },
        describeAssets: {
          description: "Read concise metadata of selected assets.",
          parameters: describeAssetsToolSchema,
        },
      },
      toolChoice: "auto",
      maxSteps: 5,
      temperature: 0.5,
    });

    result.pipeUIMessageStreamToResponse(response);
  } catch (error) {
    handleRouteError(response, error, "AI chat request failed.");
  }
}
