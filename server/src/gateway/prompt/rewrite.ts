import { z } from "zod";
import type { ParsedImageGenerationRequest } from "../../shared/imageGenerationSchema";
import type { AppConfig } from "../../config";
import type { ConversationCreativeState, TurnDelta } from "./types";

const turnDeltaSchema = z.object({
  prompt: z.string().trim().min(1),
  preserve: z.array(z.string().trim().min(1)).default([]),
  avoid: z.array(z.string().trim().min(1)).default([]),
  styleDirectives: z.array(z.string().trim().min(1)).default([]),
  continuityTargets: z
    .array(z.enum(["subject", "style", "composition", "text"]))
    .default([]),
  editOps: z
    .array(
      z.object({
        op: z.enum(["add", "remove", "replace", "emphasize", "deemphasize"]),
        target: z.string().trim().min(1),
        value: z.string().trim().optional(),
      })
    )
    .default([]),
  referenceAssetIds: z.array(z.string().trim().min(1)).default([]),
});

const normalizeText = (value: string) => value.trim().replace(/\s+/g, " ");

const dedupe = (values: string[]) => {
  const seen = new Set<string>();
  const next: string[] = [];
  for (const value of values.map(normalizeText).filter(Boolean)) {
    const key = value.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    next.push(value);
  }
  return next;
};

const buildDeterministicTurnDelta = (
  request: ParsedImageGenerationRequest
): TurnDelta => ({
  prompt: normalizeText(request.prompt),
  preserve: dedupe(request.promptIntent?.preserve ?? []),
  avoid: dedupe(request.promptIntent?.avoid ?? []),
  styleDirectives: dedupe(request.promptIntent?.styleDirectives ?? []),
  continuityTargets: [...(request.promptIntent?.continuityTargets ?? [])],
  editOps: (request.promptIntent?.editOps ?? []).map((entry) => ({ ...entry })),
  referenceAssetIds: dedupe(
    request.assetRefs
      .filter((entry) => entry.role === "reference")
      .map((entry) => entry.assetId)
  ),
});

const createRewriteSystemPrompt = (state: ConversationCreativeState) => `
## Identity
You are a prompt normalizer for a multi-turn image generation compiler.

## Instructions
- Return valid JSON only.
- Normalize the user turn into a TurnDelta.
- Preserve hard user intent.
- Do not invent assets that were not provided.
- Keep arrays short and deduplicated.
- Use continuityTargets only when continuity is explicitly requested.
- Use referenceAssetIds only for assets that should persist as generic reference guidance across turns.
- Do not put edit or variation source assets into referenceAssetIds unless the user is explicitly converting them into reusable references.

## Committed State
${JSON.stringify(state.committed, null, 2)}

## Output Contract
Return a JSON object with:
- prompt
- preserve
- avoid
- styleDirectives
- continuityTargets
- editOps
- referenceAssetIds
`.trim();

const createRewriteUserPrompt = (request: ParsedImageGenerationRequest) => `
## User Prompt
${request.prompt.trim()}

## Structured Intent
${JSON.stringify(request.promptIntent ?? null, null, 2)}

## Asset Refs
${JSON.stringify(request.assetRefs, null, 2)}

## Reference Images
${JSON.stringify(
  request.referenceImages.map((entry) => ({
    id: entry.id,
    type: entry.type,
    sourceAssetId: entry.sourceAssetId ?? null,
  })),
  null,
  2
)}
`.trim();

const parseChatCompletionContent = (payload: unknown) => {
  if (typeof payload !== "object" || payload === null) {
    return null;
  }

  const choices = Array.isArray((payload as { choices?: unknown[] }).choices)
    ? (payload as { choices: unknown[] }).choices
    : [];
  const firstChoice = choices[0];
  if (typeof firstChoice !== "object" || firstChoice === null) {
    return null;
  }

  const message = (firstChoice as { message?: unknown }).message;
  if (typeof message !== "object" || message === null) {
    return null;
  }

  const content = (message as { content?: unknown }).content;
  if (typeof content === "string" && content.trim()) {
    return content.trim();
  }

  return null;
};

const resolveRewriteApiUrl = (baseUrl: string) =>
  new URL("/v1/chat/completions", `${baseUrl.replace(/\/+$/, "")}/`).toString();

export const rewriteTurn = async (
  request: ParsedImageGenerationRequest,
  state: ConversationCreativeState,
  config: AppConfig,
  options?: { signal?: AbortSignal }
): Promise<{ turnDelta: TurnDelta; degraded: boolean; warning: string | null }> => {
  const fallback = buildDeterministicTurnDelta(request);
  const baseUrl = config.promptRewriteBaseUrl?.trim();
  const apiKey = config.promptRewriteApiKey?.trim();
  const model = config.promptRewriteModel?.trim();

  if (!baseUrl || !apiKey || !model) {
    return {
      turnDelta: fallback,
      degraded: true,
      warning: "Prompt rewrite degraded to deterministic fallback.",
    };
  }

  try {
    const response = await fetch(resolveRewriteApiUrl(baseUrl), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: createRewriteSystemPrompt(state),
          },
          {
            role: "user",
            content: createRewriteUserPrompt(request),
          },
        ],
      }),
      signal: options?.signal,
    });

    if (!response.ok) {
      throw new Error(`Rewrite upstream failed with status ${response.status}.`);
    }

    const payload = (await response.json()) as unknown;
    const content = parseChatCompletionContent(payload);
    if (!content) {
      throw new Error("Rewrite response did not contain JSON content.");
    }

    const parsed = turnDeltaSchema.parse(JSON.parse(content));
    return {
      turnDelta: {
        prompt: normalizeText(parsed.prompt),
        preserve: dedupe(parsed.preserve),
        avoid: dedupe(parsed.avoid),
        styleDirectives: dedupe(parsed.styleDirectives),
        continuityTargets: [...parsed.continuityTargets],
        editOps: parsed.editOps.map((entry) => ({ ...entry })),
        referenceAssetIds: dedupe(parsed.referenceAssetIds),
      },
      degraded: false,
      warning: null,
    };
  } catch {
    return {
      turnDelta: fallback,
      degraded: true,
      warning: "Prompt rewrite degraded to deterministic fallback.",
    };
  }
};

export const buildFallbackTurnDelta = buildDeterministicTurnDelta;
