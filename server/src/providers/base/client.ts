import { getConfig } from "../../config";
import { fetchWithTimeout } from "../../shared/fetchWithTimeout";
import type { ProviderRawResponse, ProviderRequestContext } from "./types";

export const createProviderRequestContext = (
  options?: { signal?: AbortSignal; timeoutMs?: number; traceId?: string }
): ProviderRequestContext => ({
  signal: options?.signal,
  timeoutMs: options?.timeoutMs ?? getConfig().providerRequestTimeoutMs,
  traceId: options?.traceId ?? "provider-request",
});

export const fetchProviderResponse = (
  input: RequestInfo | URL,
  init: RequestInit,
  timeoutMessage: string,
  context: ProviderRequestContext
) =>
  fetchWithTimeout(input, init, timeoutMessage, {
    signal: context.signal,
    timeoutMs: context.timeoutMs,
  });

export const toProviderRawResponse = (
  response: Response,
  payload: unknown
): ProviderRawResponse => ({
  status: response.status,
  payload,
  headers: response.headers,
});
