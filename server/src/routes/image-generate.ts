import type { FastifyPluginAsync } from "fastify";
import { ZodError } from "zod";
import { getConfig } from "../config";
import { imageRuntimeRouter } from "../gateway/router/router";
import { ProviderError } from "../providers/base/errors";
import { getFrontendImageModelById } from "../models/frontendRegistry";
import { downloadGeneratedImage } from "../shared/downloadGeneratedImage";
import { storeGeneratedImage } from "../shared/generatedImageStore";
import { getImageGenerationCapabilityWarnings } from "../shared/imageGenerationCapabilityWarnings";
import {
  imageGenerationRequestSchema,
  validateImageGenerationRequestAgainstModel,
} from "../shared/imageGenerationSchema";

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

      try {
        const frontendModel = getFrontendImageModelById(payload.modelId);
        if (!frontendModel) {
          return reply.code(400).send({ error: `Unsupported modelId: ${payload.modelId}.` });
        }

        const compatibility = imageGenerationRequestSchema.safeParse(payload);
        if (!compatibility.success) {
          return reply.code(400).send({ error: "Invalid request payload." });
        }

        const compatibilityProbe = imageGenerationRequestSchema.superRefine((nextPayload, ctx) => {
          validateImageGenerationRequestAgainstModel(nextPayload, frontendModel, ctx);
        });
        const validationResult = compatibilityProbe.safeParse(payload);
        if (!validationResult.success) {
          const firstIssue = validationResult.error.issues[0];
          return reply.code(400).send({
            error: firstIssue?.message ?? "Request is incompatible with selected model.",
          });
        }

        const generated = await imageRuntimeRouter.generate(payload, {
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
            provider: string;
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
            provider: generated.runtimeProvider,
            model: generated.providerModel,
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

        return reply.code(200).send({
          modelId: generated.modelId,
          logicalModel: generated.logicalModel,
          deploymentId: generated.deploymentId,
          runtimeProvider: generated.runtimeProvider,
          providerModel: generated.providerModel,
          createdAt: new Date().toISOString(),
          imageId: firstImageId,
          imageUrl: firstImageUrl,
          images: normalizedImages,
          ...(mergedWarnings.length > 0 ? { warnings: mergedWarnings } : {}),
        });
        } catch (error) {
        if (error instanceof ProviderError) {
          return reply.code(error.statusCode).send({
            error: error.message,
          });
        }
        app.log.error(error);
        return reply.code(500).send({
          error: "Image generation failed.",
        });
      } finally {
        request.raw.removeListener("aborted", abortRequest);
        reply.raw.removeListener("close", handleResponseClose);
      }
    }
  );
};
