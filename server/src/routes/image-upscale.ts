import type { FastifyPluginAsync } from "fastify";
import { ZodError } from "zod";
import { getConfig } from "../config";
import { imageRuntimeRouter } from "../gateway/router/router";
import {
  getLegacyProviderAliasForModel,
  getRuntimeProviderIdForModel,
} from "../gateway/router/registry";
import { ProviderError } from "../providers/base/errors";
import { getGeneratedImage, storeGeneratedImage } from "../shared/generatedImageStore";
import { imageUpscaleRequestSchema } from "../shared/imageUpscaleSchema";

export const imageUpscaleRoute: FastifyPluginAsync = async (app) => {
  const config = getConfig();

  app.post(
    "/api/image-upscale",
    {
      config: {
        rateLimit: {
          max: config.imageUpscaleRateLimitMax,
          timeWindow: config.imageUpscaleRateLimitTimeWindowMs,
        },
      },
    },
    async (request, reply) => {
      const requestController = new AbortController();
      const requestSocket = request.raw.socket;
      const abortRequest = () => {
        requestController.abort();
      };
      const handleRequestClose = () => {
        if (!reply.sent) {
          abortRequest();
        }
      };
      const handleResponseClose = () => {
        if (!reply.raw.writableEnded) {
          abortRequest();
        }
      };
      requestSocket?.once("close", handleRequestClose);
      reply.raw.once("close", handleResponseClose);

      let payload;

      try {
        payload = imageUpscaleRequestSchema.parse(request.body);
      } catch (error) {
        const message =
          error instanceof ZodError
            ? "Invalid request payload."
            : "Request body could not be parsed.";
        return reply.code(400).send({ error: message });
      }

      const sourceImage = getGeneratedImage(payload.imageId);
      if (!sourceImage) {
        return reply.code(404).send({
          error: "Generated image not found or expired.",
        });
      }

      try {
        const legacyProvider = getLegacyProviderAliasForModel(payload.model) ?? "seedream";
        const upscaled = await imageRuntimeRouter.upscale(
          payload,
          {
            imageBuffer: sourceImage.buffer,
            mimeType: sourceImage.mimeType,
          },
          {
            signal: requestController.signal,
          }
        );

        if (!upscaled?.binaryData || !upscaled.mimeType) {
          throw new ProviderError("Provider did not return an upscaled image.");
        }

        const imageId = storeGeneratedImage(upscaled.binaryData, upscaled.mimeType);

        return reply.code(200).send({
          provider: legacyProvider,
          runtimeProvider: getRuntimeProviderIdForModel(payload.model) ?? payload.provider,
          modelFamily: legacyProvider,
          model: payload.model,
          imageId,
          imageUrl: `/api/generated-images/${imageId}`,
          mimeType: upscaled.mimeType,
        });
      } catch (error) {
        if (error instanceof ProviderError) {
          return reply.code(error.statusCode).send({
            error: error.message,
            provider: getLegacyProviderAliasForModel(payload.model) ?? payload.provider,
          });
        }
        app.log.error(error);
        return reply.code(500).send({
          error: "Image upscale failed.",
          provider: getLegacyProviderAliasForModel(payload.model) ?? payload.provider,
        });
      } finally {
        requestSocket?.removeListener("close", handleRequestClose);
        reply.raw.removeListener("close", handleResponseClose);
      }
    }
  );
};
