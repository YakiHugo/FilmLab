import type { FastifyReply, FastifyRequest } from "fastify";
import { createId } from "../../../shared/createId";

export const REQUEST_ID_HEADER = "x-request-id";
const MAX_REQUEST_TRACE_ID_LENGTH = 128;
const TRUSTED_REQUEST_TRACE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

const normalizeHeaderValue = (value: string | string[] | undefined) => {
  const normalized =
    typeof value === "string"
      ? value.trim()
      : Array.isArray(value)
        ? value[0]?.trim()
        : "";

  return normalized ? normalized : null;
};

export const createRequestTraceId = (
  headers: Record<string, string | string[] | undefined>,
  options?: { trustProxyRequestId?: boolean }
) => {
  if (options?.trustProxyRequestId) {
    const headerValue = normalizeHeaderValue(headers[REQUEST_ID_HEADER]);
    if (
      headerValue &&
      headerValue.length <= MAX_REQUEST_TRACE_ID_LENGTH &&
      TRUSTED_REQUEST_TRACE_ID_PATTERN.test(headerValue)
    ) {
      return headerValue;
    }
  }

  return createId("req");
};

export const getRequestTraceId = (request: FastifyRequest) => request.id;

export const attachTraceIdHeader = (reply: FastifyReply, traceId: string) => {
  reply.header(REQUEST_ID_HEADER, traceId);
};
