import { createHash } from "node:crypto";
import type { PersistedPromptSnapshot, PersistedSemanticLoss } from "../../../../shared/chatImageTypes";
import type { ParsedImageGenerationRequest } from "../../shared/imageGenerationSchema";
import type { ResolvedRouteTarget } from "../router/types";
import {
  PROMPT_CAPABILITY_VERSION,
  getPromptCompilerCapabilities,
} from "./targetCapabilities";
import type {
  ConversationCreativeState,
  CreativeState,
  PromptCompilationContext,
  PromptIR,
  SemanticLoss,
  TurnDelta,
} from "./types";
import {
  cloneConversationCreativeState,
  cloneCreativeState,
} from "./types";

export const PROMPT_COMPILER_VERSION = "prompt-compiler.v1.1";

const normalizeText = (value: string) => value.trim().replace(/\s+/g, " ");

const dedupeStrings = (values: string[]) => {
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

const stringifyStable = (value: unknown) => JSON.stringify(value, null, 2);

const hashValue = (value: unknown) =>
  createHash("sha256").update(typeof value === "string" ? value : stringifyStable(value)).digest("hex");

const joinBulletList = (title: string, values: string[]) =>
  values.length === 0 ? null : `${title}\n${values.map((entry) => `- ${entry}`).join("\n")}`;

const createSemanticLoss = (
  loss: PersistedSemanticLoss
): SemanticLoss => ({ ...loss });

export const applyTurnDelta = (
  state: ConversationCreativeState,
  delta: TurnDelta,
  turnId: string
): ConversationCreativeState => {
  const nextState = cloneConversationCreativeState(state);
  const candidate: CreativeState = cloneCreativeState(nextState.committed);

  candidate.prompt = delta.prompt;
  candidate.preserve = dedupeStrings([...candidate.preserve, ...delta.preserve]);
  candidate.avoid = dedupeStrings([...candidate.avoid, ...delta.avoid]);
  candidate.styleDirectives = dedupeStrings([
    ...candidate.styleDirectives,
    ...delta.styleDirectives,
  ]);
  candidate.continuityTargets = Array.from(
    new Set([...candidate.continuityTargets, ...delta.continuityTargets])
  );
  candidate.editOps = [...candidate.editOps, ...delta.editOps.map((entry) => ({ ...entry }))];
  candidate.referenceAssetIds = dedupeStrings([
    ...candidate.referenceAssetIds,
    ...delta.referenceAssetIds,
  ]);

  nextState.candidate = candidate;
  nextState.candidateTurnId = turnId;
  nextState.revision += 1;
  return nextState;
};

export const buildPromptIR = (
  request: ParsedImageGenerationRequest,
  state: ConversationCreativeState
): PromptIR => ({
  operation: "image.generate",
  goal: normalizeText(request.prompt),
  preserve: dedupeStrings(state.candidate?.preserve ?? state.committed.preserve),
  negativeConstraints: dedupeStrings([
    ...(state.candidate?.avoid ?? state.committed.avoid),
    ...(request.negativePrompt?.trim()
      ? request.negativePrompt
          .split(/[\n,]+/)
          .map((entry) => entry.trim())
          .filter(Boolean)
      : []),
  ]),
  styleDirectives: dedupeStrings(
    state.candidate?.styleDirectives ?? state.committed.styleDirectives
  ),
  continuityTargets: [...(state.candidate?.continuityTargets ?? state.committed.continuityTargets)],
  editOps: (state.candidate?.editOps ?? state.committed.editOps).map((entry) => ({ ...entry })),
  assetRefs: request.assetRefs.map((entry) => ({ ...entry })),
  referenceImages: request.referenceImages.map((entry) => ({
    id: entry.id ?? `ref-${hashValue(entry.url).slice(0, 12)}`,
    type: entry.type,
    sourceAssetId: entry.sourceAssetId,
  })),
  output: {
    aspectRatio: request.aspectRatio,
    width: request.width ?? null,
    height: request.height ?? null,
    batchSize: request.batchSize,
    style: request.style,
    stylePreset: request.stylePreset ?? null,
  },
});

const buildStablePromptPrefix = (
  state: ConversationCreativeState,
  context: PromptCompilationContext
) =>
  [
    "## Identity",
    "You are compiling a multi-turn image request for a routed image generation platform.",
    "",
    "## Instructions",
    "- Preserve committed continuity unless the user explicitly changes it.",
    "- Respect hard preservation and avoid constraints.",
    "- Prefer explicit, structured phrasing over stylistic flourishes.",
    "",
    "## Compiler Context",
    `- compiler_version: ${context.compilerVersion}`,
    `- capability_version: ${context.capabilityVersion}`,
    `- operation: ${context.operation}`,
    `- retry_mode: ${context.retryMode}`,
    "",
    "## Committed State",
    stringifyStable(state.committed),
  ].join("\n");

const buildCompiledPrompt = (
  ir: PromptIR,
  state: ConversationCreativeState,
  context: PromptCompilationContext,
  includeNegativeConstraints: boolean
) => {
  const sections = [
    buildStablePromptPrefix(state, context),
    "## Current Turn",
    `Goal: ${ir.goal}`,
    joinBulletList("Preserve", ir.preserve),
    joinBulletList("Style Direction", ir.styleDirectives),
    joinBulletList(
      "Continuity Targets",
      ir.continuityTargets.map((entry) => `keep ${entry} continuity`)
    ),
    joinBulletList(
      "Edit Operations",
      ir.editOps.map((entry) =>
        entry.value ? `${entry.op} ${entry.target} -> ${entry.value}` : `${entry.op} ${entry.target}`
      )
    ),
    includeNegativeConstraints
      ? joinBulletList("Avoid", ir.negativeConstraints)
      : null,
    ir.assetRefs.length > 0
      ? `## Asset References\n${ir.assetRefs
          .map((entry, index) => `- #${index + 1} ${entry.role}:${entry.assetId}`)
          .join("\n")}`
      : null,
    ir.referenceImages.length > 0
      ? `## Reference Images\n${ir.referenceImages
          .map(
            (entry, index) =>
              `- #${index + 1} ${entry.type}:${entry.id}${
                entry.sourceAssetId ? ` (source ${entry.sourceAssetId})` : ""
              }`
          )
          .join("\n")}`
      : null,
    "## Output Contract",
    `- aspect_ratio: ${ir.output.aspectRatio}`,
    `- batch_size: ${ir.output.batchSize}`,
    ir.output.width && ir.output.height
      ? `- dimensions: ${ir.output.width}x${ir.output.height}`
      : null,
    ir.output.style !== "none" ? `- style_hint: ${ir.output.style}` : null,
    ir.output.stylePreset ? `- style_preset: ${ir.output.stylePreset}` : null,
  ];

  return sections.filter((entry): entry is string => Boolean(entry)).join("\n");
};

export interface CompiledTargetPrompt {
  targetKey: string;
  compiledPrompt: string;
  dispatchedPrompt: string;
  providerEffectivePrompt: string | null;
  negativePrompt: string | null;
  semanticLosses: SemanticLoss[];
  warnings: string[];
  prefixHash: string;
  payloadHash: string;
}

export const compilePromptForTarget = (
  request: ParsedImageGenerationRequest,
  ir: PromptIR,
  state: ConversationCreativeState,
  target: ResolvedRouteTarget,
  context: PromptCompilationContext
): CompiledTargetPrompt => {
  const capabilities = getPromptCompilerCapabilities(target);
  const semanticLosses: SemanticLoss[] = [];
  const warnings: string[] = [];
  const sourceImageRequested =
    ir.assetRefs.some((entry) => entry.role === "edit" || entry.role === "variation") ||
    ir.referenceImages.length > 0;

  if (ir.editOps.length > 0) {
    semanticLosses.push(
      createSemanticLoss({
        code: "APPROXIMATED_AS_REGENERATION",
        severity: "warn",
        fieldPath: "promptIR.editOps",
        degradeMode: "approximated",
        userMessage: "Edit operations are approximated as a new generation in this version.",
      })
    );
  }

  if (sourceImageRequested && !capabilities.supportsSourceImageExecution) {
    semanticLosses.push(
      createSemanticLoss({
        code: "SOURCE_IMAGE_NOT_EXECUTABLE",
        severity: "warn",
        fieldPath: "promptIR.assetRefs",
        degradeMode: "approximated",
        userMessage:
          "The selected model cannot execute source-image editing, so the request degrades to prompt-guided regeneration.",
      })
    );
  }

  if (
    ir.continuityTargets.includes("text") &&
    capabilities.textContinuity !== "strong"
  ) {
    semanticLosses.push(
      createSemanticLoss({
        code: "EXACT_TEXT_CONTINUITY_AT_RISK",
        severity: "warn",
        fieldPath: "promptIR.continuityTargets",
        degradeMode: "softened",
        userMessage:
          "Exact text continuity is not guaranteed on the selected model.",
      })
    );
  }

  if (ir.negativeConstraints.length > 0 && !capabilities.nativeNegativePrompt) {
    semanticLosses.push(
      createSemanticLoss({
        code: "NEGATIVE_PROMPT_DEGRADED_TO_TEXT",
        severity: "warn",
        fieldPath: "promptIR.negativeConstraints",
        degradeMode: "merged",
        userMessage:
          "Negative constraints were merged into the main prompt because the selected model has no native negative prompt channel.",
      })
    );
  }

  if (
    capabilities.styleReferenceMode === "collapsed" &&
    ir.assetRefs.some((entry) => entry.role !== "reference")
  ) {
    semanticLosses.push(
      createSemanticLoss({
        code: "STYLE_REFERENCE_ROLE_COLLAPSED",
        severity: "warn",
        fieldPath: "promptIR.assetRefs",
        degradeMode: "merged",
        userMessage:
          "Reference roles were collapsed into generic guidance for the selected model.",
      })
    );
  }

  const compiledPrompt = buildCompiledPrompt(
    ir,
    state,
    context,
    !capabilities.nativeNegativePrompt
  );
  const dispatchedPrompt = buildCompiledPrompt(
    ir,
    state,
    context,
    !capabilities.nativeNegativePrompt
  );
  const negativePrompt = capabilities.nativeNegativePrompt
    ? ir.negativeConstraints.join(", ") || null
    : null;

  for (const loss of semanticLosses) {
    warnings.push(loss.userMessage);
  }

  const prefixHash = hashValue(buildStablePromptPrefix(state, context));
  const payloadHash = hashValue({
    prompt: dispatchedPrompt,
    negativePrompt,
    target: {
      provider: target.provider.id,
      model: target.deployment.providerModel,
    },
  });

  return {
    targetKey: `${target.provider.id}:${target.deployment.providerModel}`,
    compiledPrompt,
    dispatchedPrompt,
    providerEffectivePrompt: null,
    negativePrompt,
    semanticLosses,
    warnings,
    prefixHash,
    payloadHash,
  };
};

export const toPromptSnapshot = (input: {
  originalPrompt: string;
  compiledPrompt: string;
  dispatchedPrompt: string | null;
  providerEffectivePrompt?: string | null;
  semanticLosses?: SemanticLoss[];
  warnings?: string[];
}): PersistedPromptSnapshot => ({
  originalPrompt: normalizeText(input.originalPrompt),
  compiledPrompt: input.compiledPrompt,
  dispatchedPrompt: input.dispatchedPrompt,
  providerEffectivePrompt: input.providerEffectivePrompt ?? null,
  semanticLosses: (input.semanticLosses ?? []).map((entry) => ({ ...entry })),
  warnings: [...(input.warnings ?? [])],
});

export const withProviderEffectivePrompt = (
  prompt: PersistedPromptSnapshot,
  providerEffectivePrompt: string | null
): PersistedPromptSnapshot => ({
  ...prompt,
  providerEffectivePrompt:
    providerEffectivePrompt?.trim() ? providerEffectivePrompt.trim() : prompt.providerEffectivePrompt,
});

export const createPromptCompilationContext = (
  state: ConversationCreativeState,
  rewriteModel: string,
  retryMode: "exact" | "recompile"
): PromptCompilationContext => ({
  compilerVersion: PROMPT_COMPILER_VERSION,
  capabilityVersion: PROMPT_CAPABILITY_VERSION,
  stateBaseRevision: state.revision,
  rewriteModel,
  operation: "image.generate",
  retryMode,
});

export const createPromptHashes = (input: {
  committedStateBefore: CreativeState | null;
  candidateStateAfter: CreativeState | null;
  promptIR: PromptIR | null;
  prefix: string | null;
  payload: unknown;
}) => ({
  stateHash: hashValue(input.candidateStateAfter ?? input.committedStateBefore ?? {}),
  irHash: hashValue(input.promptIR ?? {}),
  prefixHash: hashValue(input.prefix ?? ""),
  payloadHash: hashValue(input.payload),
});
