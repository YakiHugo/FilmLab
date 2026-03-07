import type { FastifyPluginAsync } from "fastify";
import { ZodError } from "zod";
import { getConfig } from "../config";
import { getProviderAdapter, getUserProviderKey, resolveApiKey } from "../providers/registry";
import { ProviderError } from "../providers/types";
import { storeGeneratedImage } from "../shared/generatedImageStore";
import { imageGenerationRequestSchema } from "../shared/imageGenerationSchema";

export const imageGenerateRoute: FastifyPluginAsync = async (app) => {
  const config = getConfig();

  app.post(
    "/api/image-generate",
    {
      config: {
        rateLimit: {
          max: config.rateLimitMax,
          timeWindow: config.rateLimitTimeWindowMs,
        },
      },
    },
    async (request, reply) => {
      const toGeneratedImageUrl = (image: {
        binaryData?: Buffer;
        imageUrl?: string;
        mimeType?: string;
      }) => {
        if (image.imageUrl) {
          return image.imageUrl;
        }
        if (!image.binaryData || !image.mimeType) {
          return null;
        }

        const imageId = storeGeneratedImage(image.binaryData, image.mimeType);
        return `/api/generated-images/${imageId}`;
      };

      let payload;

      try {
        payload = imageGenerationRequestSchema.parse(request.body);
      } catch (error) {
        const message =
          error instanceof ZodError
            ? "Invalid request payload."
            : "Request body could not be parsed.";
        return reply.code(400).send({ error: message });
      }

      const adapter = getProviderAdapter(payload.provider);
      if (!adapter) {
        return reply.code(400).send({
          error: `Unsupported provider: ${payload.provider}`,
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

      try {
        const generated = await adapter.generate(payload, apiKey);
        const normalizedImages = generated.images.reduce<
          Array<{
            imageUrl: string;
            provider: typeof generated.provider;
            model: string;
            mimeType?: string;
            revisedPrompt: string | null;
          }>
        >((accumulator, image) => {
          const imageUrl = toGeneratedImageUrl(image);
          if (!imageUrl) {
            return accumulator;
          }

          accumulator.push({
            imageUrl,
            provider: generated.provider,
            model: generated.model,
            mimeType: image.mimeType,
            revisedPrompt: image.revisedPrompt ?? null,
          });
          return accumulator;
        }, []);
        const firstImageUrl = normalizedImages[0]?.imageUrl;

        if (!firstImageUrl) {
          throw new ProviderError("Provider did not return any image.");
        }

        return reply.code(200).send({
          provider: generated.provider,
          model: generated.model,
          createdAt: new Date().toISOString(),
          imageUrl: firstImageUrl,
          images: normalizedImages,
        });
      } catch (error) {
        if (error instanceof ProviderError) {
          return reply.code(error.statusCode).send({
            error: error.message,
            provider: payload.provider,
          });
        }

        app.log.error(error);
        return reply.code(500).send({
          error: "Image generation failed.",
          provider: payload.provider,
        });
      }
    }
  );
};
