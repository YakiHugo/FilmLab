import type { FastifyBaseLogger } from "fastify";
import type { ConversationCreativeState, PromptVersionRecord } from "../../../domain/prompt";
import type {
  PersistedConversationCreativeState,
  PersistedImageGenerationRequestSnapshot,
  PersistedPromptSnapshot,
  PersistedRunRecord,
  PersistedRunTargetSnapshot,
} from "../../persistence/models";
import {
  applyTurnDelta,
  buildPromptIR,
  compilePromptForTarget,
  createPromptCompilationContext,
  createPromptHashes,
  toPromptSnapshot,
} from "../../../gateway/prompt/compiler";
import { rewriteTurn } from "../../../gateway/prompt/rewrite";
import type { ResolvedRouteTarget } from "../../../gateway/router/types";
import {
  imageGenerationRequestSchema,
  type ParsedImageGenerationRequest,
  validateImageGenerationRequestAgainstModel,
} from "../../../shared/imageGenerationSchema";
import {
  resolveExactRetryNegativePrompt,
  resolveImagePromptCompilerOperation,
  type ImagePromptCompilerOperationId,
} from "../../../../../shared/imageGeneration";
import type { AppConfig } from "../../../config";
import type { getFrontendImageModelById } from "../../../models/frontendRegistry";
import { buildPromptVersionRecord } from "./buildPromptVersionRecord";
import {
  createResolvedTargetSnapshot,
  createRewriteTargetSnapshot,
  createRunTargetSnapshot,
  findMatchingExactTarget,
  uniqueWarnings,
} from "./helpers";
import { ImageGenerationCommandError } from "./errors";

type FrontendImageModel = NonNullable<ReturnType<typeof getFrontendImageModelById>>;
type CompiledTargetResult = ReturnType<typeof compilePromptForTarget>;

export type PromptResolution = {
  routeTargets: ResolvedRouteTarget[];
  selectedTarget: ResolvedRouteTarget;
  requestedTargetSnapshot: PersistedRunTargetSnapshot;
  exactRetryPrompt: PersistedPromptSnapshot | null;
  nextPromptState: PersistedConversationCreativeState | null;
  promptIR: ReturnType<typeof buildPromptIR> | null;
  rewriteWarning: string | null;
  rewriteTarget: PersistedRunTargetSnapshot;
  rewritePromptSnapshot: PersistedPromptSnapshot | null;
  rewritePromptVersion: PromptVersionRecord | null;
  compilePromptVersions: PromptVersionRecord[];
  compiledTargetCache: Map<string, CompiledTargetResult>;
  initialPromptSnapshot: PersistedPromptSnapshot;
};

export type ResolveInitialPromptsInput = {
  effectiveRetryMode: "exact" | "recompile";
  effectivePayload: ParsedImageGenerationRequest;
  exactRetrySourceRun: PersistedRunRecord | null;
  conversation: { id: string; promptState: ConversationCreativeState };
  routeTargets: ResolvedRouteTarget[];
  frontendModel: FrontendImageModel;
  rewriteModel: string;
  promptContext: ReturnType<typeof createPromptCompilationContext>;
  persistedRequestSnapshot: PersistedImageGenerationRequestSnapshot;
  signal: AbortSignal;
  logger: FastifyBaseLogger;
  ids: { rewriteRunId: string; imageRunId: string; turnId: string; traceId: string };
  createdAt: string;
};

export type DispatchAttemptInput = {
  target: ResolvedRouteTarget;
  effectiveRetryMode: "exact" | "recompile";
  exactRetryPrompt: PersistedPromptSnapshot | null;
  effectivePayload: ParsedImageGenerationRequest;
  promptIR: ReturnType<typeof buildPromptIR> | null;
  nextPromptState: PersistedConversationCreativeState | null;
  promptContext: ReturnType<typeof createPromptCompilationContext>;
  rewriteWarning: string | null;
  persistedRequestSnapshot: PersistedImageGenerationRequestSnapshot;
  conversationPromptState: PersistedConversationCreativeState;
  compilePromptVersionCount: number;
  compiledTargetCache: Map<string, CompiledTargetResult>;
  attemptNumber: number;
  ids: { imageRunId: string; turnId: string; traceId: string };
};

export type DispatchAttemptResult = {
  compiledPrompt: string;
  dispatchedPrompt: string;
  negativePrompt: string | undefined;
  finalPromptSnapshot: PersistedPromptSnapshot;
  finalWarnings: string[];
  promptVersion: PromptVersionRecord;
};

export type FinalDispatchPromptVersionInput = {
  persistedRequestSnapshot: PersistedImageGenerationRequestSnapshot;
  effectivePayload: ParsedImageGenerationRequest;
  effectiveRetryMode: "exact" | "recompile";
  conversationPromptState: PersistedConversationCreativeState;
  nextPromptState: PersistedConversationCreativeState | null;
  promptIR: ReturnType<typeof buildPromptIR> | null;
  promptContext: ReturnType<typeof createPromptCompilationContext>;
  compilePromptVersionCount: number;
  attemptNumber: number;
  finalWarnings: string[];
  finalNegativePrompt: string | undefined;
  completedPrompt: PersistedPromptSnapshot;
  generated: {
    runtimeProvider: string;
    providerModel: string;
  };
  ids: { imageRunId: string; turnId: string; traceId: string };
  createdAt: string;
};

export class PromptCompileCoordinator {
  constructor(private readonly deps: { config: AppConfig }) {}

  createContext(
    conversationPromptState: PersistedConversationCreativeState,
    rewriteModel: string,
    effectiveRetryMode: "exact" | "recompile",
    operation: ImagePromptCompilerOperationId
  ) {
    return createPromptCompilationContext(
      conversationPromptState,
      rewriteModel,
      operation,
      effectiveRetryMode
    );
  }

  resolveRequestedOperation(operation: ParsedImageGenerationRequest["operation"]) {
    return resolveImagePromptCompilerOperation(operation);
  }

  validateCompatibility(
    payload: ParsedImageGenerationRequest,
    frontendModel: FrontendImageModel,
    effectiveRetryMode: "exact" | "recompile"
  ) {
    if (effectiveRetryMode === "exact") {
      return;
    }
    const compatibilityProbe = imageGenerationRequestSchema.superRefine((nextPayload, ctx) => {
      validateImageGenerationRequestAgainstModel(nextPayload, frontendModel, ctx);
    });
    const validationResult = compatibilityProbe.safeParse(payload);
    if (!validationResult.success) {
      const firstIssue = validationResult.error.issues[0];
      throw new ImageGenerationCommandError({
        statusCode: 400,
        message: firstIssue?.message ?? "Request is incompatible with selected model.",
      });
    }
  }

  async resolveInitialPrompts(input: ResolveInitialPromptsInput): Promise<PromptResolution> {
    if (input.effectiveRetryMode === "exact" && input.exactRetrySourceRun) {
      return this.resolveExactRetryPrompts(input);
    }
    return this.resolveNewPrompts(input);
  }

  compileForDispatchAttempt(input: DispatchAttemptInput): DispatchAttemptResult {
    if (input.effectiveRetryMode === "exact" && input.exactRetryPrompt) {
      return this.compileExactRetryAttempt(input);
    }
    return this.compileRecompileAttempt(input);
  }

  buildFinalDispatchPromptVersion(input: FinalDispatchPromptVersionInput): PromptVersionRecord {
    const isExact = input.effectiveRetryMode === "exact";
    const committedStateBefore = isExact ? null : input.conversationPromptState.committed;
    const candidateStateAfter = isExact
      ? null
      : input.nextPromptState?.candidate ?? input.conversationPromptState.candidate;
    const promptIR = isExact ? null : input.promptIR;
    const targetKey = `${input.generated.runtimeProvider}:${input.generated.providerModel}`;
    return buildPromptVersionRecord({
      runId: input.ids.imageRunId,
      turnId: input.ids.turnId,
      traceId: input.ids.traceId,
      version: input.compilePromptVersionCount + input.attemptNumber + 1,
      stage: "dispatch",
      targetKey,
      attempt: input.attemptNumber,
      compilerVersion: input.promptContext.compilerVersion,
      capabilityVersion: input.promptContext.capabilityVersion,
      originalPrompt: input.effectivePayload.prompt,
      promptIntent: input.persistedRequestSnapshot.promptIntent ?? null,
      committedStateBefore,
      candidateStateAfter,
      promptIR,
      compiledPrompt: input.completedPrompt.compiledPrompt,
      dispatchedPrompt: input.completedPrompt.dispatchedPrompt,
      providerEffectivePrompt: input.completedPrompt.providerEffectivePrompt,
      semanticLosses: input.completedPrompt.semanticLosses,
      warnings: input.finalWarnings,
      hashes: createPromptHashes({
        committedStateBefore,
        candidateStateAfter,
        promptIR,
        prefix: input.completedPrompt.compiledPrompt,
        payload: {
          prompt: input.completedPrompt.dispatchedPrompt,
          negativePrompt: input.finalNegativePrompt,
          providerEffectivePrompt: input.completedPrompt.providerEffectivePrompt,
          targetKey,
          attempt: input.attemptNumber,
        },
      }),
      createdAt: input.createdAt,
    });
  }

  private resolveExactRetryPrompts(input: ResolveInitialPromptsInput): PromptResolution {
    const { exactRetrySourceRun, routeTargets, effectivePayload } = input;
    const retryRun = exactRetrySourceRun as PersistedRunRecord;
    if (!retryRun.prompt) {
      throw new ImageGenerationCommandError({
        statusCode: 400,
        message: "Exact retry is unavailable because no prior prompt snapshot was found.",
      });
    }

    const exactTarget = findMatchingExactTarget(routeTargets, retryRun);
    if (!exactTarget) {
      throw new ImageGenerationCommandError({
        statusCode: 400,
        message: "Exact retry target is no longer available. Use recompile retry instead.",
      });
    }

    const exactRetryPrompt: PersistedPromptSnapshot = {
      ...retryRun.prompt,
      providerEffectivePrompt: null,
    };
    const rewriteWarning = "Exact retry reused prior compiler artifacts.";

    return {
      routeTargets: [exactTarget],
      selectedTarget: exactTarget,
      requestedTargetSnapshot: createResolvedTargetSnapshot(exactTarget, true),
      exactRetryPrompt,
      nextPromptState: null,
      promptIR: null,
      rewriteWarning,
      rewriteTarget: createRewriteTargetSnapshot("exact-retry", true),
      rewritePromptSnapshot: toPromptSnapshot({
        originalPrompt: effectivePayload.prompt,
        compiledPrompt: exactRetryPrompt.compiledPrompt,
        dispatchedPrompt: exactRetryPrompt.dispatchedPrompt,
        semanticLosses: exactRetryPrompt.semanticLosses,
        warnings: uniqueWarnings([rewriteWarning]),
      }),
      rewritePromptVersion: null,
      compilePromptVersions: [],
      compiledTargetCache: new Map<string, CompiledTargetResult>(),
      initialPromptSnapshot: exactRetryPrompt,
    };
  }

  private async resolveNewPrompts(input: ResolveInitialPromptsInput): Promise<PromptResolution> {
    const {
      effectivePayload,
      conversation,
      routeTargets,
      frontendModel,
      promptContext,
      persistedRequestSnapshot,
      signal,
      ids,
      createdAt,
    } = input;

    const rewriteResult = await rewriteTurn(
      effectivePayload,
      conversation.promptState,
      this.deps.config,
      { signal }
    );
    const rewriteWarning = rewriteResult.warning;
    const rewriteTarget = createRewriteTargetSnapshot(input.rewriteModel, rewriteResult.degraded);
    const nextPromptState = applyTurnDelta(
      conversation.promptState,
      rewriteResult.turnDelta,
      ids.turnId
    );
    const promptIR = buildPromptIR(effectivePayload, nextPromptState);
    const selectedTarget = routeTargets[0] as ResolvedRouteTarget;
    const requestedTargetSnapshot = createRunTargetSnapshot({
      modelId: effectivePayload.modelId,
      logicalModel: frontendModel.logicalModel,
      deploymentId: selectedTarget.deployment.id,
      runtimeProvider:
        effectivePayload.requestedTarget?.provider ?? selectedTarget.provider.id,
      providerModel: selectedTarget.deployment.providerModel,
      pinned: Boolean(
        effectivePayload.requestedTarget?.deploymentId ||
          effectivePayload.requestedTarget?.provider
      ),
    });
    const rewritePromptSnapshot = toPromptSnapshot({
      originalPrompt: effectivePayload.prompt,
      compiledPrompt: rewriteResult.turnDelta.prompt,
      dispatchedPrompt: null,
      warnings: uniqueWarnings([rewriteWarning]),
    });
    const rewritePromptVersion = buildPromptVersionRecord({
      runId: ids.rewriteRunId,
      turnId: ids.turnId,
      traceId: ids.traceId,
      version: 1,
      stage: "rewrite",
      compilerVersion: promptContext.compilerVersion,
      capabilityVersion: promptContext.capabilityVersion,
      originalPrompt: effectivePayload.prompt,
      promptIntent: persistedRequestSnapshot.promptIntent ?? null,
      turnDelta: rewriteResult.turnDelta,
      committedStateBefore: conversation.promptState.committed,
      candidateStateAfter: nextPromptState.candidate,
      compiledPrompt: rewriteResult.turnDelta.prompt,
      warnings: uniqueWarnings([rewriteWarning]),
      hashes: createPromptHashes({
        committedStateBefore: conversation.promptState.committed,
        candidateStateAfter: nextPromptState.candidate,
        promptIR: null,
        prefix: null,
        payload: rewriteResult.turnDelta,
      }),
      createdAt,
    });
    const compiledTargetCache = new Map<string, CompiledTargetResult>();
    const compilePromptVersions = routeTargets.map((target, index) => {
      const compiled = compilePromptForTarget(
        effectivePayload,
        promptIR,
        nextPromptState,
        target,
        promptContext
      );
      compiledTargetCache.set(compiled.targetKey, compiled);
      return buildPromptVersionRecord({
        runId: ids.imageRunId,
        turnId: ids.turnId,
        traceId: ids.traceId,
        version: index + 1,
        stage: "compile",
        targetKey: compiled.targetKey,
        compilerVersion: promptContext.compilerVersion,
        capabilityVersion: promptContext.capabilityVersion,
        originalPrompt: effectivePayload.prompt,
        promptIntent: persistedRequestSnapshot.promptIntent ?? null,
        committedStateBefore: conversation.promptState.committed,
        candidateStateAfter: nextPromptState.candidate ?? null,
        promptIR,
        compiledPrompt: compiled.compiledPrompt,
        dispatchedPrompt: compiled.dispatchedPrompt,
        semanticLosses: compiled.semanticLosses,
        warnings: compiled.warnings,
        hashes: {
          ...createPromptHashes({
            committedStateBefore: conversation.promptState.committed,
            candidateStateAfter: nextPromptState.candidate ?? null,
            promptIR,
            prefix: compiled.compiledPrompt,
            payload: {
              prompt: compiled.dispatchedPrompt,
              negativePrompt: compiled.negativePrompt,
              targetKey: compiled.targetKey,
            },
          }),
          prefixHash: compiled.prefixHash,
          payloadHash: compiled.payloadHash,
        },
        createdAt,
      });
    });
    const selectedCompile = compilePromptVersions[0] as PromptVersionRecord;
    const initialPromptSnapshot = toPromptSnapshot({
      originalPrompt: effectivePayload.prompt,
      compiledPrompt: selectedCompile.compiledPrompt ?? effectivePayload.prompt,
      dispatchedPrompt: selectedCompile.dispatchedPrompt,
      semanticLosses: selectedCompile.semanticLosses,
      warnings: uniqueWarnings([rewriteWarning, ...selectedCompile.warnings]),
    });

    return {
      routeTargets,
      selectedTarget,
      requestedTargetSnapshot,
      exactRetryPrompt: null,
      nextPromptState,
      promptIR,
      rewriteWarning,
      rewriteTarget,
      rewritePromptSnapshot,
      rewritePromptVersion,
      compilePromptVersions,
      compiledTargetCache,
      initialPromptSnapshot,
    };
  }

  private compileExactRetryAttempt(input: DispatchAttemptInput): DispatchAttemptResult {
    const {
      target,
      exactRetryPrompt,
      effectivePayload,
      promptContext,
      persistedRequestSnapshot,
      rewriteWarning,
      compilePromptVersionCount,
      attemptNumber,
      ids,
    } = input;
    const retryPrompt = exactRetryPrompt as PersistedPromptSnapshot;
    const exactRetryNegativePrompt = resolveExactRetryNegativePrompt({
      negativePrompt: effectivePayload.negativePrompt,
      semanticLosses: retryPrompt.semanticLosses,
    });
    const dispatchedPrompt = retryPrompt.dispatchedPrompt ?? retryPrompt.compiledPrompt;
    const targetKey = `${target.provider.id}:${target.deployment.providerModel}`;
    const promptVersion = buildPromptVersionRecord({
      runId: ids.imageRunId,
      turnId: ids.turnId,
      traceId: ids.traceId,
      version: compilePromptVersionCount + attemptNumber,
      stage: "dispatch",
      targetKey,
      attempt: attemptNumber,
      compilerVersion: promptContext.compilerVersion,
      capabilityVersion: promptContext.capabilityVersion,
      originalPrompt: effectivePayload.prompt,
      promptIntent: persistedRequestSnapshot.promptIntent ?? null,
      committedStateBefore: null,
      candidateStateAfter: null,
      compiledPrompt: retryPrompt.compiledPrompt,
      dispatchedPrompt,
      semanticLosses: retryPrompt.semanticLosses,
      warnings: uniqueWarnings([rewriteWarning, ...retryPrompt.warnings]),
      hashes: createPromptHashes({
        committedStateBefore: null,
        candidateStateAfter: null,
        promptIR: null,
        prefix: retryPrompt.compiledPrompt,
        payload: {
          prompt: dispatchedPrompt,
          negativePrompt: exactRetryNegativePrompt,
          targetKey,
        },
      }),
      createdAt: new Date().toISOString(),
    });

    const finalPromptSnapshot = toPromptSnapshot({
      originalPrompt: effectivePayload.prompt,
      compiledPrompt: retryPrompt.compiledPrompt,
      dispatchedPrompt,
      semanticLosses: retryPrompt.semanticLosses,
      warnings: uniqueWarnings([rewriteWarning, ...retryPrompt.warnings]),
    });

    return {
      compiledPrompt: retryPrompt.compiledPrompt,
      dispatchedPrompt,
      negativePrompt: exactRetryNegativePrompt,
      finalPromptSnapshot,
      finalWarnings: [...finalPromptSnapshot.warnings],
      promptVersion,
    };
  }

  private compileRecompileAttempt(input: DispatchAttemptInput): DispatchAttemptResult {
    const {
      target,
      effectivePayload,
      promptIR,
      nextPromptState,
      promptContext,
      rewriteWarning,
      persistedRequestSnapshot,
      conversationPromptState,
      compiledTargetCache,
      compilePromptVersionCount,
      attemptNumber,
      ids,
    } = input;
    const targetKey = `${target.provider.id}:${target.deployment.providerModel}`;
    const compiled =
      compiledTargetCache.get(targetKey) ??
      compilePromptForTarget(
        effectivePayload,
        promptIR as NonNullable<typeof promptIR>,
        nextPromptState as PersistedConversationCreativeState,
        target,
        promptContext
      );

    const promptVersion = buildPromptVersionRecord({
      runId: ids.imageRunId,
      turnId: ids.turnId,
      traceId: ids.traceId,
      version: compilePromptVersionCount + attemptNumber,
      stage: "dispatch",
      targetKey: compiled.targetKey,
      attempt: attemptNumber,
      compilerVersion: promptContext.compilerVersion,
      capabilityVersion: promptContext.capabilityVersion,
      originalPrompt: effectivePayload.prompt,
      promptIntent: persistedRequestSnapshot.promptIntent ?? null,
      committedStateBefore: conversationPromptState.committed,
      candidateStateAfter: nextPromptState?.candidate ?? null,
      promptIR,
      compiledPrompt: compiled.compiledPrompt,
      dispatchedPrompt: compiled.dispatchedPrompt,
      semanticLosses: compiled.semanticLosses,
      warnings: uniqueWarnings([rewriteWarning, ...compiled.warnings]),
      hashes: {
        ...createPromptHashes({
          committedStateBefore: conversationPromptState.committed,
          candidateStateAfter: nextPromptState?.candidate ?? null,
          promptIR,
          prefix: compiled.compiledPrompt,
          payload: {
            prompt: compiled.dispatchedPrompt,
            negativePrompt: compiled.negativePrompt,
            targetKey: compiled.targetKey,
          },
        }),
        prefixHash: compiled.prefixHash,
        payloadHash: compiled.payloadHash,
      },
      createdAt: new Date().toISOString(),
    });

    const finalPromptSnapshot = toPromptSnapshot({
      originalPrompt: effectivePayload.prompt,
      compiledPrompt: compiled.compiledPrompt,
      dispatchedPrompt: compiled.dispatchedPrompt,
      semanticLosses: compiled.semanticLosses,
      warnings: uniqueWarnings([rewriteWarning, ...compiled.warnings]),
    });

    return {
      compiledPrompt: compiled.compiledPrompt,
      dispatchedPrompt: compiled.dispatchedPrompt,
      negativePrompt: compiled.negativePrompt ?? undefined,
      finalPromptSnapshot,
      finalWarnings: [...finalPromptSnapshot.warnings],
      promptVersion,
    };
  }
}
