import { getConfig } from "../config";
import type {
  ImageProviderAdapter,
  ProviderNormalizedResult,
  ProviderRawResponse,
  ProviderRequestContext,
} from "./types";

interface ProviderProtocolParams<TRequest, TBuildRequest, TExecuteResponse, TFinalRaw> {
  request: TRequest;
  apiKey: string;
  context: ProviderRequestContext;
  buildRequest: TBuildRequest;
  executeResponse: TExecuteResponse;
  rawResponse: TFinalRaw;
}

export interface ProviderProtocol<TRequest, TBuildRequest, TExecuteResponse, TFinalRaw> {
  buildRequest: (
    request: TRequest,
    apiKey: string,
    context: ProviderRequestContext
  ) => TBuildRequest | Promise<TBuildRequest>;
  execute: (
    buildRequest: TBuildRequest,
    context: ProviderRequestContext
  ) => Promise<TExecuteResponse>;
  poll?: (
    executeResponse: TExecuteResponse,
    context: ProviderRequestContext
  ) => Promise<TFinalRaw>;
  normalizeResult: (
    params: ProviderProtocolParams<TRequest, TBuildRequest, TExecuteResponse, TFinalRaw>
  ) => ProviderNormalizedResult;
}

const createProviderRequestContext = (
  options?: { signal?: AbortSignal; timeoutMs?: number; traceId?: string }
): ProviderRequestContext => ({
  signal: options?.signal,
  timeoutMs: options?.timeoutMs ?? getConfig().providerRequestTimeoutMs,
  traceId: options?.traceId ?? "provider-request",
});

export const createProviderAdapter = <
  TRequest,
  TBuildRequest,
  TExecuteResponse,
  TFinalRaw = TExecuteResponse,
>(
  protocol: ProviderProtocol<TRequest, TBuildRequest, TExecuteResponse, TFinalRaw>
): ImageProviderAdapter => ({
  async generate(request, apiKey, options) {
    const context = createProviderRequestContext(options);
    const buildRequest = await protocol.buildRequest(request as TRequest, apiKey, context);
    const executeResponse = await protocol.execute(buildRequest, context);
    const rawResponse = protocol.poll
      ? await protocol.poll(executeResponse, context)
      : (executeResponse as TFinalRaw);

    return protocol.normalizeResult({
      request: request as TRequest,
      apiKey,
      context,
      buildRequest,
      executeResponse,
      rawResponse,
    });
  },
});

export const toProviderRawResponse = (
  response: Response,
  payload: unknown
): ProviderRawResponse => ({
  status: response.status,
  payload,
  headers: response.headers,
});
