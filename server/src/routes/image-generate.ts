import type { FastifyPluginAsync } from "fastify";
import { ZodError } from "zod";
import { recordProviderCallResult } from "../capabilities/registry";
import { getConfig } from "../config";
import { getProviderAdapter, getUserProviderKey, resolveApiKey } from "../providers/registry";
import { ProviderError } from "../providers/types";
import { downloadGeneratedImage } from "../shared/downloadGeneratedImage";
import { storeGeneratedImage } from "../shared/generatedImageStore";
import { getImageGenerationCapabilityWarnings } from "../shared/imageGenerationCapabilityWarnings";
import { imageGenerationRequestSchema } from "../shared/imageGenerationSchema";

export const imageGenerateRoute: FastifyPluginAsync = async (app) => {
  const config = getConfig();

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

      const toGeneratedImageUrl = async (image: {
        binaryData?: Buffer;
        imageUrl?: string;
        mimeType?: string;
      }) => {
        if (image.imageUrl) {
          const downloaded = await downloadGeneratedImage(image.imageUrl, {
            signal: requestController.signal,
          });
          const imageId = storeGeneratedImage(downloaded.buffer, downloaded.mimeType);
          return {
            imageId,
            imageUrl: `/api/generated-images/${imageId}`,
            mimeType: downloaded.mimeType,
          };
        }
        if (!image.binaryData || !image.mimeType) {
          return null;
        }

        const imageId = storeGeneratedImage(image.binaryData, image.mimeType);
        return {
          imageId,
          imageUrl: `/api/generated-images/${imageId}`,
          mimeType: image.mimeType,
        };
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

      const callStartedAt = Date.now();

      try {
        const generated = await adapter.generate(payload, apiKey, {
          signal: requestController.signal,
        });
        const capabilityWarnings = getImageGenerationCapabilityWarnings(payload);
        const mergedWarnings = [...capabilityWarnings, ...(generated.warnings ?? [])];

        const normalizedResults = await Promise.all(
          generated.images.map(async (image) => {
            const normalized = await toGeneratedImageUrl(image);
            if (!normalized) {
              return null;
            }
            return {
              imageId: normalized.imageId,
              imageUrl: normalized.imageUrl,
              mimeType: normalized.mimeType,
              revisedPrompt: image.revisedPrompt ?? null,
            };
          })
        );
        const normalizedImages = normalizedResults.reduce<
          Array<{
            imageUrl: string;
            imageId: string;
            provider: typeof generated.provider;
            model: string;
            mimeType?: string;
            revisedPrompt: string | null;
          }>
        >((accumulator, image) => {
          if (!image) {
            return accumulator;
          }

          accumulator.push({
            imageId: image.imageId,
            imageUrl: image.imageUrl,
            provider: generated.provider,
            model: generated.model,
            mimeType: image.mimeType,
            revisedPrompt: image.revisedPrompt,
          });
          return accumulator;
        }, []);
        const firstImageUrl = normalizedImages[0]?.imageUrl;
        const firstImageId = normalizedImages[0]?.imageId;

        if (!firstImageUrl) {
          throw new ProviderError("Provider did not return any image.");
        }

        recordProviderCallResult({
          provider: payload.provider,
          model: payload.model,
          operation: "generate",
          success: true,
          latencyMs: Date.now() - callStartedAt,
        });

        return reply.code(200).send({
          provider: generated.provider,
          model: generated.model,
          createdAt: new Date().toISOString(),
          imageId: firstImageId,
          imageUrl: firstImageUrl,
          images: normalizedImages,
          ...(mergedWarnings.length > 0 ? { warnings: mergedWarnings } : {}),
        });
      } catch (error) {
        if (error instanceof ProviderError) {
          recordProviderCallResult({
            provider: payload.provider,
            model: payload.model,
            operation: "generate",
            success: false,
            latencyMs: Date.now() - callStartedAt,
            errorType: "provider_error",
          });
          return reply.code(error.statusCode).send({
            error: error.message,
            provider: payload.provider,
          });
        }

        recordProviderCallResult({
          provider: payload.provider,
          model: payload.model,
          operation: "generate",
          success: false,
          latencyMs: Date.now() - callStartedAt,
          errorType: "internal_error",
        });
        app.log.error(error);
        return reply.code(500).send({
          error: "Image generation failed.",
          provider: payload.provider,
        });
      } finally {
        request.raw.removeListener("aborted", abortRequest);
        reply.raw.removeListener("close", handleResponseClose);
      }
    }
  );
};
