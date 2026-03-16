import type {
  PersistedImageSession,
  PromptObservabilitySummaryResponse,
  TurnPromptArtifactsResponse,
} from "../../../shared/chatImageTypes";
import { resolveApiUrl } from "@/lib/api/resolveApiUrl";
import { getClientAuthToken } from "@/lib/authToken";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const toAuthorizedHeaders = () => ({
  Authorization: `Bearer ${getClientAuthToken()}`,
});

const parseConversationResponse = async (response: Response): Promise<PersistedImageSession> => {
  if (!response.ok) {
    let message = "Image conversation request failed.";
    try {
      const payload = (await response.json()) as { error?: string };
      if (typeof payload.error === "string" && payload.error.trim()) {
        message = payload.error;
      }
    } catch {
      // Keep fallback.
    }
    throw new Error(message);
  }

  const json = (await response.json()) as unknown;
  if (!isRecord(json)) {
    throw new Error("Invalid image conversation response.");
  }

  return json as unknown as PersistedImageSession;
};

const parsePromptArtifactsResponse = async (
  response: Response
): Promise<TurnPromptArtifactsResponse> => {
  if (!response.ok) {
    let message = "Image conversation request failed.";
    try {
      const payload = (await response.json()) as { error?: string };
      if (typeof payload.error === "string" && payload.error.trim()) {
        message = payload.error;
      }
    } catch {
      // Keep fallback.
    }
    throw new Error(message);
  }

  const json = (await response.json()) as unknown;
  if (!isRecord(json)) {
    throw new Error("Invalid prompt artifact response.");
  }

  return json as unknown as TurnPromptArtifactsResponse;
};

const parsePromptObservabilityResponse = async (
  response: Response
): Promise<PromptObservabilitySummaryResponse> => {
  if (!response.ok) {
    let message = "Image conversation request failed.";
    try {
      const payload = (await response.json()) as { error?: string };
      if (typeof payload.error === "string" && payload.error.trim()) {
        message = payload.error;
      }
    } catch {
      // Keep fallback.
    }
    throw new Error(message);
  }

  const json = (await response.json()) as unknown;
  if (!isRecord(json)) {
    throw new Error("Invalid prompt observability response.");
  }

  return json as unknown as PromptObservabilitySummaryResponse;
};

export const fetchImageConversation = async (
  conversationId?: string,
  options?: { signal?: AbortSignal }
): Promise<PersistedImageSession> => {
  const url = conversationId
    ? `${resolveApiUrl("/api/image-conversation")}?conversationId=${encodeURIComponent(conversationId)}`
    : resolveApiUrl("/api/image-conversation");

  return parseConversationResponse(
    await fetch(url, {
      headers: toAuthorizedHeaders(),
      signal: options?.signal,
    })
  );
};

export const clearImageConversation = async (): Promise<PersistedImageSession> =>
  parseConversationResponse(
    await fetch(resolveApiUrl("/api/image-conversation"), {
      method: "DELETE",
      headers: toAuthorizedHeaders(),
    })
  );

export const deleteImageConversationTurn = async (
  turnId: string
): Promise<PersistedImageSession> =>
  parseConversationResponse(
    await fetch(resolveApiUrl(`/api/image-conversation/turns/${encodeURIComponent(turnId)}`), {
      method: "DELETE",
      headers: toAuthorizedHeaders(),
    })
  );

export const acceptImageConversationTurn = async (
  turnId: string,
  assetId: string
): Promise<PersistedImageSession> =>
  parseConversationResponse(
    await fetch(
      resolveApiUrl(`/api/image-conversation/turns/${encodeURIComponent(turnId)}/accept`),
      {
        method: "POST",
        headers: {
          ...toAuthorizedHeaders(),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ assetId }),
      }
    )
  );

export const fetchImagePromptArtifacts = async (
  turnId: string,
  options?: { signal?: AbortSignal }
): Promise<TurnPromptArtifactsResponse> =>
  parsePromptArtifactsResponse(
    await fetch(
      resolveApiUrl(`/api/image-conversation/turns/${encodeURIComponent(turnId)}/prompt-artifacts`),
      {
        headers: toAuthorizedHeaders(),
        signal: options?.signal,
      }
    )
  );

export const fetchImagePromptObservability = async (
  conversationId?: string,
  options?: { signal?: AbortSignal }
): Promise<PromptObservabilitySummaryResponse> => {
  const url = conversationId
    ? `${resolveApiUrl("/api/image-conversation/observability")}?conversationId=${encodeURIComponent(conversationId)}`
    : resolveApiUrl("/api/image-conversation/observability");

  return parsePromptObservabilityResponse(
    await fetch(url, {
      headers: toAuthorizedHeaders(),
      signal: options?.signal,
    })
  );
};
