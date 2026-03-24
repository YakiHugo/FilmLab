import { getConfig } from "../../config";
import { createId } from "../../../../shared/createId";
import { REQUEST_ID_HEADER } from "../../shared/requestTrace";
import { fetchWithTimeout } from "../../shared/fetchWithTimeout";
import type { ProviderRawResponse, ProviderRequestContext } from "./types";

export const createProviderRequestContext = (
  options?: { signal?: AbortSignal; timeoutMs?: number; traceId?: string }
): ProviderRequestContext => ({
  signal: options?.signal,
  timeoutMs: options?.timeoutMs ?? getConfig().providerRequestTimeoutMs,
  traceId: options?.traceId ?? createId("provider-request"),
});

export const fetchProviderResponse = (
  input: RequestInfo | URL,
  init: RequestInit,
  timeoutMessage: string,
  context: ProviderRequestContext
) =>
  fetchWithTimeout(
    input,
    {
      ...init,
      headers: (() => {
        const headers = new Headers(init.headers);
        headers.set(REQUEST_ID_HEADER, context.traceId);
        return headers;
      })(),
    },
    timeoutMessage,
    {
      signal: context.signal,
      timeoutMs: context.timeoutMs,
    }
  );

export const toProviderRawResponse = (
  response: Response,
  payload: unknown
): ProviderRawResponse => ({
  status: response.status,
  payload,
  headers: response.headers,
});
