import type { FastifyPluginAsync } from "fastify";
import { ZodError } from "zod";
import { getConfig } from "../config";
import { getProviderAdapter, getUserProviderKey, resolveApiKey } from "../providers/registry";
import { ProviderError } from "../providers/types";
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

      const adapter = getProviderAdapter(payload.provider);
      if (!adapter?.upscale) {
        return reply.code(400).send({
          error: `Upscale is not supported for provider: ${payload.provider}`,
        });
      }

      const userKey = getUserProviderKey(
        request.headers as Record<string, string | string[] | undefined>,
        payload.provider
      );
      const apiKey = resolveApiKey(payload.provider, userKey);

      if (!apiKey) {
        return reply.code(401).send({
          error: "API key required",
          provider: payload.provider,
        });
      }

      const sourceImage = getGeneratedImage(payload.imageId);
      if (!sourceImage) {
        return reply.code(404).send({
          error: "Generated image not found or expired.",
        });
      }

      try {
        const upscaled = await adapter.upscale(
          {
            model: payload.model,
            imageBuffer: sourceImage.buffer,
            mimeType: sourceImage.mimeType,
            scale: payload.scale,
          },
          apiKey,
          {
            signal: requestController.signal,
          }
        );

        if (!upscaled.binaryData || !upscaled.mimeType) {
          throw new ProviderError("Provider did not return an upscaled image.");
        }

        const imageId = storeGeneratedImage(upscaled.binaryData, upscaled.mimeType);

        return reply.code(200).send({
          provider: payload.provider,
          model: payload.model,
          imageId,
          imageUrl: `/api/generated-images/${imageId}`,
          mimeType: upscaled.mimeType,
        });
      } catch (error) {
        if (error instanceof ProviderError) {
          return reply.code(error.statusCode).send({
            error: error.message,
            errorCode: error.code,
            provider: payload.provider,
          });
        }

        app.log.error(error);
        return reply.code(500).send({
          error: "Image upscale failed.",
          provider: payload.provider,
        });
      } finally {
        requestSocket?.removeListener("close", handleRequestClose);
        reply.raw.removeListener("close", handleResponseClose);
      }
    }
  );
};
