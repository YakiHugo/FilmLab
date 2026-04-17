import { createHash } from "node:crypto";
import { PROMPT_COMPILER_CAPABILITY_VERSION } from "../../../../shared/imageModelCapabilityFacts";
import {
  resolveImagePromptCompilerOperation,
  type ImageInputAssetBinding,
  type ImagePromptCompilerOperationId,
} from "../../../../shared/imageGeneration";
import type { ParsedImageGenerationRequest } from "../../shared/imageGenerationSchema";
import type { ResolvedRouteTarget } from "../router/types";
import type {
  ConversationCreativeState,
  CreativeState,
  PromptCompilationContext,
  PromptIR,
  PromptSnapshot,
  SemanticLoss,
  TurnDelta,
} from "../../domain/prompt";
import {
  cloneConversationCreativeState,
  cloneCreativeState,
} from "../../domain/prompt";

export const PROMPT_COMPILER_VERSION = "prompt-compiler.v1.2";

import { normalizeText, dedupeStrings } from "./textUtils";

const stringifyStable = (value: unknown) => JSON.stringify(value, null, 2);

const hashValue = (value: unknown) =>
  createHash("sha256")
    .update(typeof value === "string" ? value : stringifyStable(value))
    .digest("hex");

const joinBulletList = (title: string, values: string[]) =>
  values.length === 0 ? null : `${title}\n${values.map((entry) => `- ${entry}`).join("\n")}`;

const createSemanticLoss = (loss: SemanticLoss): SemanticLoss => ({
  ...loss,
});

const getActiveCreativeState = (state: ConversationCreativeState) =>
  state.candidate ?? state.committed;

const resolveSourceRole = (
  operation: PromptIR["operation"]
): "reference" | "edit" | "variation" =>
  operation === "image.edit"
    ? "edit"
    : operation === "image.variation"
      ? "variation"
      : "reference";

const describeAssetHandling = (
  inputAsset: ImageInputAssetBinding,
  requestedOperation: PromptIR["operation"],
  handling:
    | "native"
    | "compiled_to_reference"
    | "compiled_to_text"
) => {
  const assetRole =
    inputAsset.binding === "guide"
      ? "reference"
      : resolveSourceRole(requestedOperation);
  if (handling === "native") {
    return `${assetRole}:${inputAsset.assetId}`;
  }
  if (handling === "compiled_to_reference") {
    return `${assetRole}:${inputAsset.assetId} (compiled as reference guidance)`;
  }
  return `${assetRole}:${inputAsset.assetId} (compiled as textual guidance only)`;
};

const toCompiledOperation = (
  requestedOperation: PromptIR["operation"],
  executableOperations: ImagePromptCompilerOperationId[]
): ImagePromptCompilerOperationId =>
  executableOperations.includes(requestedOperation) ? requestedOperation : "image.generate";

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
): PromptIR => {
  const activeState = getActiveCreativeState(state);
  const explicitInputAssets = request.inputAssets.map((entry) => ({ ...entry }));
  const persistedReferenceAssets = activeState.referenceAssetIds
    .filter(
      (assetId) => !explicitInputAssets.some((entry) => entry.assetId === assetId)
    )
    .map((assetId) => ({
      assetId,
      binding: "guide" as const,
      guideType: "content" as const,
      weight: 1,
    }));
  const inputAssets = [...explicitInputAssets, ...persistedReferenceAssets];
  const sourceAssets = explicitInputAssets.filter((entry) => entry.binding === "source");
  const referenceAssets = inputAssets.filter((entry) => entry.binding === "guide");

  return {
    operation: resolveImagePromptCompilerOperation(request.operation),
    goal: normalizeText(activeState.prompt ?? request.prompt),
    preserve: dedupeStrings(activeState.preserve),
    negativeConstraints: dedupeStrings([
      ...activeState.avoid,
      ...(request.negativePrompt?.trim()
        ? request.negativePrompt
            .split(/[\n,]+/)
            .map((entry) => entry.trim())
            .filter(Boolean)
        : []),
    ]),
    styleDirectives: dedupeStrings(activeState.styleDirectives),
    continuityTargets: [...activeState.continuityTargets],
    editOps: activeState.editOps.map((entry) => ({ ...entry })),
    sourceAssets,
    referenceAssets,
    inputAssets,
    output: {
      aspectRatio: request.aspectRatio,
      width: request.width ?? null,
      height: request.height ?? null,
      batchSize: request.batchSize,
      style: request.style,
      stylePreset: request.stylePreset ?? null,
    },
  };
};

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
  target: ResolvedRouteTarget,
  options: {
    compiledOperation: ImagePromptCompilerOperationId;
    includeNegativeConstraints: boolean;
  }
) => {
  const promptCompiler = target.frontendModel.promptCompiler;
  const sections = [
    buildStablePromptPrefix(state, context),
    "## Current Turn",
    `Requested Operation: ${ir.operation}`,
    options.compiledOperation !== ir.operation
      ? `Compiled Operation: ${options.compiledOperation}`
      : null,
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
    options.includeNegativeConstraints
      ? joinBulletList("Avoid", ir.negativeConstraints)
      : null,
    ir.sourceAssets.length > 0
      ? `## Source Assets\n${ir.sourceAssets
          .map(
            (entry, index) =>
              `- #${index + 1} ${describeAssetHandling(
                entry,
                ir.operation,
                promptCompiler.referenceRoleHandling[resolveSourceRole(ir.operation)]
              )}`
          )
          .join("\n")}`
      : null,
    ir.referenceAssets.length > 0
      ? `## Guide Assets\n${ir.referenceAssets
          .map(
            (entry, index) =>
              `- #${index + 1} ${describeAssetHandling(
                entry,
                ir.operation,
                promptCompiler.referenceRoleHandling.reference
              )}`
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

const buildDispatchedPrompt = (
  ir: PromptIR,
  options: {
    includeNegativeConstraints: boolean;
  }
): string => {
  const parts: string[] = [ir.goal];

  if (ir.preserve.length > 0) {
    parts.push(`Preserve: ${ir.preserve.join(", ")}`);
  }

  if (ir.styleDirectives.length > 0) {
    parts.push(ir.styleDirectives.join(", "));
  }

  if (ir.editOps.length > 0) {
    parts.push(
      ir.editOps
        .map((entry) =>
          entry.value ? `${entry.op} ${entry.target} -> ${entry.value}` : `${entry.op} ${entry.target}`
        )
        .join("; ")
    );
  }

  if (options.includeNegativeConstraints && ir.negativeConstraints.length > 0) {
    parts.push(`Avoid: ${ir.negativeConstraints.join(", ")}`);
  }

  return parts.filter(Boolean).join("\n");
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
  _request: ParsedImageGenerationRequest,
  ir: PromptIR,
  state: ConversationCreativeState,
  target: ResolvedRouteTarget,
  context: PromptCompilationContext
): CompiledTargetPrompt => {
  const promptCompiler = target.frontendModel.promptCompiler;
  const semanticLosses: SemanticLoss[] = [];
  const warnings: string[] = [];
  const compiledOperation = toCompiledOperation(
    ir.operation,
    promptCompiler.executableOperations
  );
  const hasSourceAssets = ir.sourceAssets.length > 0;
  const negativePromptIsNative =
    promptCompiler.negativePromptStrategy === "native";

  if (ir.operation !== compiledOperation) {
    semanticLosses.push(
      createSemanticLoss({
        code: "OPERATION_DEGRADED_TO_IMAGE_GENERATE",
        severity: "warn",
        fieldPath: "promptIR.operation",
        degradeMode: "approximated",
        userMessage:
          "The selected model cannot execute this operation natively, so the turn degrades to image generation.",
      })
    );
    semanticLosses.push(
      createSemanticLoss({
        code: "APPROXIMATED_AS_REGENERATION",
        severity: "warn",
        fieldPath: "promptIR.operation",
        degradeMode: "approximated",
        userMessage:
          "This edit or variation request is approximated as a new image generation in this version.",
      })
    );
  }

  if (
    hasSourceAssets &&
    promptCompiler.sourceImageExecution === "unsupported"
  ) {
    semanticLosses.push(
      createSemanticLoss({
        code: "SOURCE_IMAGE_NOT_EXECUTABLE",
        severity: "warn",
        fieldPath: "promptIR.sourceAssets",
        degradeMode: "approximated",
        userMessage:
          "The selected model cannot execute source-image editing, so the request degrades to prompt-guided generation.",
      })
    );
  }

  const sourceRoleHandling = hasSourceAssets
    ? promptCompiler.referenceRoleHandling[resolveSourceRole(ir.operation)]
    : "native";

  if (sourceRoleHandling === "compiled_to_reference") {
    semanticLosses.push(
      createSemanticLoss({
        code: "ASSET_ROLE_DEGRADED_TO_REFERENCE_GUIDANCE",
        severity: "warn",
        fieldPath: "promptIR.sourceAssets",
        degradeMode: "merged",
        userMessage:
          "Source asset roles were downgraded to generic reference guidance on the selected model.",
      })
    );
  } else if (sourceRoleHandling === "compiled_to_text") {
    semanticLosses.push(
      createSemanticLoss({
        code: "STYLE_REFERENCE_ROLE_COLLAPSED",
        severity: "warn",
        fieldPath: "promptIR.sourceAssets",
        degradeMode: "merged",
        userMessage:
          "Reference roles were collapsed into generic guidance for the selected model.",
      })
    );
  }

  if (
    ir.continuityTargets.includes("text") &&
    promptCompiler.continuityStrength.text !== "strong"
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

  if (ir.negativeConstraints.length > 0 && !negativePromptIsNative) {
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

  const compiledPrompt = buildCompiledPrompt(ir, state, context, target, {
    compiledOperation,
    includeNegativeConstraints: !negativePromptIsNative,
  });
  const dispatchedPrompt = buildDispatchedPrompt(ir, {
    includeNegativeConstraints: !negativePromptIsNative,
  });
  const negativePrompt = negativePromptIsNative
    ? ir.negativeConstraints.join(", ") || null
    : null;

  for (const loss of semanticLosses) {
    warnings.push(loss.userMessage);
  }

  const prefixHash = hashValue(buildStablePromptPrefix(state, context));
  const payloadHash = hashValue({
    operation: compiledOperation,
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
}): PromptSnapshot => ({
  originalPrompt: normalizeText(input.originalPrompt),
  compiledPrompt: input.compiledPrompt,
  dispatchedPrompt: input.dispatchedPrompt,
  providerEffectivePrompt: input.providerEffectivePrompt ?? null,
  semanticLosses: (input.semanticLosses ?? []).map((entry) => ({ ...entry })),
  warnings: [...(input.warnings ?? [])],
});

export const withProviderEffectivePrompt = (
  prompt: PromptSnapshot,
  providerEffectivePrompt: string | null
): PromptSnapshot => ({
  ...prompt,
  providerEffectivePrompt:
    providerEffectivePrompt?.trim()
      ? providerEffectivePrompt.trim()
      : prompt.providerEffectivePrompt,
});

export const createPromptCompilationContext = (
  state: ConversationCreativeState,
  rewriteModel: string,
  operation: ImagePromptCompilerOperationId,
  retryMode: "exact" | "recompile"
): PromptCompilationContext => ({
  compilerVersion: PROMPT_COMPILER_VERSION,
  capabilityVersion: PROMPT_COMPILER_CAPABILITY_VERSION,
  stateBaseRevision: state.revision,
  rewriteModel,
  operation,
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
