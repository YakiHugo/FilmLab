import type { FastifyPluginAsync, FastifyReply } from "fastify";
import { ZodError } from "zod";
import { requireAuthenticatedUser } from "../auth/user";
import { ImageGenerationCommandError, ImageGenerationService, type PersistedGenerationContext } from "../chat/application/imageGenerationService";
import { getConfig } from "../config";
import { attachTraceIdHeader, getRequestTraceId } from "../shared/requestTrace";
import { imageGenerationRequestSchema } from "../shared/imageGenerationSchema";

const toPersistedGenerationResponse = (
  persistedGeneration: PersistedGenerationContext | null
) =>
  persistedGeneration
    ? {
        conversationId: persistedGeneration.conversationId,
        threadId: persistedGeneration.conversationId,
        turnId: persistedGeneration.turnId,
        jobId: persistedGeneration.jobId,
        runId: persistedGeneration.runId,
      }
    : {};

const sendTraceableError = (
  reply: FastifyReply,
  input: {
    statusCode: number;
    error: string;
    traceId: string;
    persistedGeneration?: PersistedGenerationContext | null;
  }
) => {
  attachTraceIdHeader(reply, input.traceId);
  return reply.code(input.statusCode).send({
    error: input.error,
    traceId: input.traceId,
    ...toPersistedGenerationResponse(input.persistedGeneration ?? null),
  });
};

export const imageGenerateRoute: FastifyPluginAsync = async (app) => {
  const config = getConfig();
  const service = new ImageGenerationService({
    repository: app.chatStateRepository,
    assetService: app.assetService,
    config,
  });

  app.post(
    "/api/image-generate",
    {
      config: {
        rateLimit: {
          max: config.imageGenerateRateLimitMax,
          timeWindow: config.imageGenerateRateLimitTimeWindowMs,
        },
      },
    },
    async (request, reply) => {
      const traceId = getRequestTraceId(request);
      attachTraceIdHeader(reply, traceId);
      const userId = requireAuthenticatedUser(request);
      if (!userId) {
        return sendTraceableError(reply, {
          statusCode: 401,
          error: "Unauthorized.",
          traceId,
        });
      }

      const requestController = new AbortController();
      const abortRequest = () => {
        requestController.abort();
      };
      const handleResponseClose = () => {
        if (!reply.raw.writableEnded) {
          abortRequest();
        }
      };
      request.raw.once("aborted", abortRequest);
      reply.raw.once("close", handleResponseClose);

      let payload;
      try {
        payload = imageGenerationRequestSchema.parse(request.body);
      } catch (error) {
        const message =
          error instanceof ZodError
            ? "Invalid request payload."
            : "Request body could not be parsed.";
        return sendTraceableError(reply, {
          statusCode: 400,
          error: message,
          traceId,
        });
      }

      try {
        const response = await service.execute({
          userId,
          payload,
          traceId,
          signal: requestController.signal,
          logger: request.log,
        });
        return reply.code(200).send(response);
      } catch (error) {
        if (requestController.signal.aborted || reply.raw.destroyed) {
          return reply;
        }

        if (error instanceof ImageGenerationCommandError) {
          return sendTraceableError(reply, {
            statusCode: error.statusCode,
            error: error.message,
            traceId,
            persistedGeneration: error.persistedGeneration,
          });
        }

        request.log.error({ err: error }, "Image generation route failed unexpectedly.");
        return sendTraceableError(reply, {
          statusCode: 500,
          error: "Image generation failed.",
          traceId,
        });
      } finally {
        request.raw.removeListener("aborted", abortRequest);
        reply.raw.removeListener("close", handleResponseClose);
      }
    }
  );
};
