export type PersistedGenerationContext = {
  conversationId: string;
  turnId: string;
  jobId: string;
  runId: string;
  attemptId: string;
};

export class ImageGenerationCommandError extends Error {
  readonly statusCode: number;
  readonly persistedGeneration: PersistedGenerationContext | null;

  constructor(input: {
    statusCode: number;
    message: string;
    persistedGeneration?: PersistedGenerationContext | null;
    cause?: unknown;
  }) {
    super(input.message);
    this.name = "ImageGenerationCommandError";
    this.statusCode = input.statusCode;
    this.persistedGeneration = input.persistedGeneration ?? null;
    if (input.cause !== undefined) {
      (this as Error & { cause?: unknown }).cause = input.cause;
    }
  }
}
