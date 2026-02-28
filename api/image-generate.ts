import { z } from "zod";
import { type ApiRequest, type ApiResponse, readJsonBody, sendError } from "./_utils";

const requestSchema = z.object({
  prompt: z.string().min(1),
  provider: z.enum(["openai", "stability"]).default("openai"),
  model: z.string().default("gpt-image-1"),
  size: z.string().default("1024x1024"),
});

const sizeToAspectRatio = (size: string) => {
  if (size === "1024x1536") {
    return "2:3";
  }
  if (size === "1536x1024") {
    return "3:2";
  }
  return "1:1";
};

const toDataUrl = (bytes: ArrayBuffer, mimeType: string) =>
  `data:${mimeType};base64,${Buffer.from(bytes).toString("base64")}`;

async function generateWithOpenAI(payload: z.infer<typeof requestSchema>) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not configured.");
  }

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
    throw new Error((await upstream.text()) || "OpenAI image generation failed.");
  }

  const json = (await upstream.json()) as {
    data?: Array<{ b64_json?: string; url?: string }>;
  };
  const first = json.data?.[0];
  if (!first) {
    throw new Error("No image returned from provider.");
  }

  const imageUrl = first.url ?? (first.b64_json ? `data:image/png;base64,${first.b64_json}` : null);
  if (!imageUrl) {
    throw new Error("Provider response missing image data.");
  }
  return imageUrl;
}

async function generateWithStability(payload: z.infer<typeof requestSchema>) {
  const apiKey = process.env.STABILITY_API_KEY;
  if (!apiKey) {
    throw new Error("STABILITY_API_KEY is not configured.");
  }

  const endpoint = payload.model.includes("ultra")
    ? "https://api.stability.ai/v2beta/stable-image/generate/ultra"
    : "https://api.stability.ai/v2beta/stable-image/generate/core";

  const formData = new FormData();
  formData.append("prompt", payload.prompt);
  formData.append("output_format", "png");
  formData.append("aspect_ratio", sizeToAspectRatio(payload.size));

  const upstream = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: "image/*",
    },
    body: formData,
  });

  if (!upstream.ok) {
    throw new Error((await upstream.text()) || "Stability image generation failed.");
  }

  const arrayBuffer = await upstream.arrayBuffer();
  return toDataUrl(arrayBuffer, "image/png");
}

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

  try {
    const imageUrl =
      payload.provider === "stability"
        ? await generateWithStability(payload)
        : await generateWithOpenAI(payload);
    response.status(200).json({ imageUrl });
  } catch (error) {
    sendError(response, 500, error instanceof Error ? error.message : "Image generation failed.");
  }
}
