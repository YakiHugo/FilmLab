import type { LanguageModel } from "ai";

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

export async function resolveModel(provider: string, modelId: string): Promise<LanguageModel> {
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
}
