export type AiErrorCode =
  | "RateLimit"
  | "AuthFailure"
  | "ModelError"
  | "InvalidResponse"
  | "NetworkError"
  | "Aborted"
  | "ConfigMissing"
  | "UNKNOWN";

export class AiError extends Error {
  readonly code: AiErrorCode;
  readonly statusCode: number | undefined;
  readonly retryable: boolean;

  constructor(
    message: string,
    code: AiErrorCode,
    options?: { statusCode?: number; retryable?: boolean; cause?: unknown }
  ) {
    super(message, options?.cause ? { cause: options.cause } : undefined);
    this.name = "AiError";
    this.code = code;
    this.statusCode = options?.statusCode;
    this.retryable = options?.retryable ?? false;
  }

  static fromHttpStatus(status: number, body?: string): AiError {
    if (status === 429) {
      return new AiError(body || "Rate limit exceeded.", "RateLimit", {
        statusCode: status,
        retryable: true,
      });
    }
    if (status === 401 || status === 403) {
      return new AiError(body || "Authentication failed.", "AuthFailure", {
        statusCode: status,
        retryable: false,
      });
    }
    if (status >= 500) {
      return new AiError(body || "Server error.", "ModelError", {
        statusCode: status,
        retryable: true,
      });
    }
    return new AiError(body || `Request failed with status ${status}.`, "ModelError", {
      statusCode: status,
      retryable: false,
    });
  }

  static aborted(): AiError {
    return new AiError("The operation was aborted.", "Aborted", { retryable: false });
  }

  toJSON() {
    return {
      error: this.message,
      code: this.code,
    };
  }
}

export const isAiError = (error: unknown): error is AiError =>
  error instanceof AiError;
