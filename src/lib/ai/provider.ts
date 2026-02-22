import { openai } from "@ai-sdk/openai";
import { anthropic } from "@ai-sdk/anthropic";
import { google } from "@ai-sdk/google";
export interface ModelOption {
  provider: string;
  id: string;
  label: string;
  vision: boolean;
}

export const AVAILABLE_MODELS: ModelOption[] = [
  { provider: "openai", id: "gpt-4.1-mini", label: "GPT-4.1 Mini", vision: true },
  { provider: "openai", id: "gpt-4.1", label: "GPT-4.1", vision: true },
  { provider: "anthropic", id: "claude-sonnet-4-20250514", label: "Claude Sonnet 4", vision: true },
  { provider: "google", id: "gemini-2.0-flash", label: "Gemini 2.0 Flash", vision: true },
];

export const DEFAULT_MODEL: ModelOption = AVAILABLE_MODELS[0];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function resolveModel(provider: string, modelId: string): any {
  switch (provider) {
    case "anthropic":
      return anthropic(modelId);
    case "google":
      return google(modelId);
    default:
      return openai(modelId);
  }
}
