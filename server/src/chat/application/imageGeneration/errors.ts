import type { ImageGenStage } from "../../../../../shared/imageGeneration";

export type PersistedGenerationContext = {
  conversationId: string;
  turnId: string;
  jobId: string;
  runId: string;
  attemptId: string;
};

const CAUSE_SUMMARY_MAX_LENGTH = 200;

export const summarizeCause = (cause: unknown): string | undefined => {
  if (cause === undefined || cause === null) {
    return undefined;
  }
  const name = cause instanceof Error && cause.name ? cause.name : "Error";
  const message =
    cause instanceof Error
      ? cause.message
      : typeof cause === "string"
        ? cause
        : (() => {
            try {
              return JSON.stringify(cause);
            } catch {
              return String(cause);
            }
          })();
  const combined = `${name}: ${message}`.replace(/\s+/g, " ").trim();
  if (combined.length <= CAUSE_SUMMARY_MAX_LENGTH) {
    return combined;
  }
  return `${combined.slice(0, CAUSE_SUMMARY_MAX_LENGTH - 1)}…`;
};

export class ImageGenerationCommandError extends Error {
  readonly statusCode: number;
  readonly stage: ImageGenStage;
  readonly persistedGeneration: PersistedGenerationContext | null;
  readonly providerErrorCode: string | undefined;
  readonly causeSummary: string | undefined;

  constructor(input: {
    statusCode: number;
    message: string;
    stage: ImageGenStage;
    persistedGeneration?: PersistedGenerationContext | null;
    providerErrorCode?: string;
    causeSummary?: string;
    cause?: unknown;
  }) {
    super(input.message);
    this.name = "ImageGenerationCommandError";
    this.statusCode = input.statusCode;
    this.stage = input.stage;
    this.persistedGeneration = input.persistedGeneration ?? null;
    this.providerErrorCode = input.providerErrorCode;
    this.causeSummary = input.causeSummary ?? summarizeCause(input.cause);
    if (input.cause !== undefined) {
      (this as Error & { cause?: unknown }).cause = input.cause;
    }
  }
}
