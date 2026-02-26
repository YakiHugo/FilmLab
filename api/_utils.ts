import type { IncomingMessage, ServerResponse } from "node:http";
import { z } from "zod";
import { AiError } from "../src/lib/ai/errors";

export interface ApiRequest extends IncomingMessage {
  body?: unknown;
  method?: string;
}

export interface ApiResponse extends ServerResponse {
  status: (statusCode: number) => ApiResponse;
  json: (payload: unknown) => void;
}

export const providerSchema = z.enum(["openai", "anthropic", "google"]);
export type AiProvider = z.infer<typeof providerSchema>;

const API_KEY_BY_PROVIDER: Record<AiProvider, string> = {
  openai: "OPENAI_API_KEY",
  anthropic: "ANTHROPIC_API_KEY",
  google: "GOOGLE_GENERATIVE_AI_API_KEY",
};

/** Returns the env var name if the key is missing, or null if present. */
export const checkProviderApiKey = (provider: AiProvider): string | null => {
  const envVar = API_KEY_BY_PROVIDER[provider];
  return process.env[envVar] ? null : envVar;
};

/** Returns true if at least one AI provider key is configured. */
export const hasAnyApiKey = (): boolean =>
  Object.values(API_KEY_BY_PROVIDER).some((envVar) => !!process.env[envVar]);

export const readJsonBody = async (request: ApiRequest) => {
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
    request.on("data", (chunk: Buffer | string) => {
      chunks.push(Buffer.from(chunk));
    });
    request.on("end", () => resolve());
    request.on("error", (error: unknown) =>
      reject(error instanceof Error ? error : new Error("Request stream failed."))
    );
  });

  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw) {
    return {};
  }

  return JSON.parse(raw) as unknown;
};

export const sendError = (response: ApiResponse, status: number, message: string) => {
  response.status(status).json({ error: message });
};

export const sendAiError = (response: ApiResponse, error: AiError) => {
  const status = error.statusCode ?? 500;
  response.status(status).json(error.toJSON());
};

/** Wrap an unknown caught error into an AiError and send it. */
export const handleRouteError = (
  response: ApiResponse,
  error: unknown,
  fallbackMessage: string
) => {
  if (error instanceof AiError) {
    sendAiError(response, error);
    return;
  }
  const aiError = new AiError(
    error instanceof Error ? error.message : fallbackMessage,
    "ModelError",
    { statusCode: 500, retryable: true, cause: error }
  );
  sendAiError(response, aiError);
};
