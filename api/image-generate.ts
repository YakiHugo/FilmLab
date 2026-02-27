import { z } from "zod";
import {
  type ApiRequest,
  type ApiResponse,
  readJsonBody,
  sendError,
} from "./_utils";

const requestSchema = z.object({
  prompt: z.string().min(1),
  provider: z.enum(["openai", "stability"]).default("openai"),
  model: z.string().default("gpt-image-1"),
  size: z.string().default("1024x1024"),
});

export default async function handler(request: ApiRequest, response: ApiResponse) {
  if (request.method !== "POST") {
    sendError(response, 405, "Method not allowed");
    return;
  }

  let payload: z.infer<typeof requestSchema>;
  try {
    payload = requestSchema.parse(await readJsonBody(request));
  } catch {
    sendError(response, 400, "Invalid request payload.");
    return;
  }

  if (payload.provider !== "openai") {
    sendError(response, 501, "Stability provider is not wired yet.");
    return;
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    sendError(response, 500, "OPENAI_API_KEY is not configured.");
    return;
  }

  try {
    const upstream = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: payload.model,
        prompt: payload.prompt,
        size: payload.size,
      }),
    });

    if (!upstream.ok) {
      const errorText = await upstream.text();
      sendError(response, upstream.status, errorText || "OpenAI image generation failed.");
      return;
    }

    const json = (await upstream.json()) as {
      data?: Array<{ b64_json?: string; url?: string }>;
    };
    const first = json.data?.[0];
    if (!first) {
      sendError(response, 502, "No image returned from provider.");
      return;
    }

    const imageUrl = first.url ?? (first.b64_json ? `data:image/png;base64,${first.b64_json}` : null);
    if (!imageUrl) {
      sendError(response, 502, "Provider response missing image data.");
      return;
    }

    response.status(200).json({ imageUrl });
  } catch (error) {
    sendError(response, 500, error instanceof Error ? error.message : "Image generation failed.");
  }
}
