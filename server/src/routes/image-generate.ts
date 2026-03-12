import type { FastifyPluginAsync } from "fastify";
import { ZodError } from "zod";
import type { PersistedImageGenerationRequestSnapshot } from "../../../shared/chatImageTypes";
import { requireAuthenticatedUser } from "../auth/user";
import { getChatStateRepository } from "../chat/persistence/repository";
import { getConfig } from "../config";
import { getDefaultDeploymentForModel } from "../gateway/router/registry";
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

const createId = (prefix: string) => {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
};

const cloneSnapshot = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

const toPersistedRequestSnapshot = (
  payload: unknown
): PersistedImageGenerationRequestSnapshot => {
  const snapshot = cloneSnapshot(payload) as Record<string, unknown> & {
    referenceImages?: Array<Record<string, unknown>>;
  };

  if (!Array.isArray(snapshot.referenceImages)) {
    return snapshot as PersistedImageGenerationRequestSnapshot;
  }

  return {
    ...snapshot,
    referenceImages: snapshot.referenceImages.map((referenceImage, index) => ({
      ...referenceImage,
      id:
        typeof referenceImage.id === "string" && referenceImage.id.trim()
          ? referenceImage.id
          : createId(`ref-${index}`),
    })),
  } as PersistedImageGenerationRequestSnapshot;
};

export const imageGenerateRoute: FastifyPluginAsync = async (app) => {
  const config = getConfig();
  const repository = getChatStateRepository();

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
      const userId = requireAuthenticatedUser(request);
      if (!userId) {
        return reply.code(401).send({ error: "Unauthorized." });
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
      let persistedGeneration:
        | {
            conversationId: string;
            turnId: string;
            jobId: string;
            attemptId: string;
          }
        | null = null;

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
        const defaultDeployment = getDefaultDeploymentForModel(payload.modelId);
        if (!defaultDeployment) {
          return reply.code(500).send({ error: `Missing deployment for modelId: ${payload.modelId}.` });
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

        const conversation = payload.conversationId
          ? await repository.getConversationById(userId, payload.conversationId)
          : await repository.getOrCreateActiveConversation(userId);
        if (!conversation) {
          return reply.code(404).send({ error: "Conversation not found." });
        }

        if (payload.retryOfTurnId) {
          const retryTurnExists = await repository.turnExists(
            userId,
            conversation.id,
            payload.retryOfTurnId
          );
          if (!retryTurnExists) {
            return reply.code(400).send({
              error: "retryOfTurnId does not belong to the selected conversation.",
            });
          }
        }

        const createdAt = new Date().toISOString();
        const turnId = payload.clientTurnId ?? createId("chat-turn");
        const jobId = payload.clientJobId ?? createId("chat-job");
        const attemptId = createId("chat-attempt");
        persistedGeneration = {
          conversationId: conversation.id,
          turnId,
          jobId,
          attemptId,
        };

        await repository.createGeneration({
          conversationId: conversation.id,
          turn: {
            id: turnId,
            prompt: payload.prompt,
            createdAt,
            retryOfTurnId: payload.retryOfTurnId ?? null,
            modelId: payload.modelId,
            logicalModel: frontendModel.logicalModel,
            deploymentId: defaultDeployment.id,
            runtimeProvider: defaultDeployment.provider,
            providerModel: defaultDeployment.providerModel,
            configSnapshot: toPersistedRequestSnapshot(payload),
            status: "loading",
            error: null,
            warnings: [],
            jobId,
            results: [],
          },
          job: {
            id: jobId,
            turnId,
            modelId: payload.modelId,
            logicalModel: frontendModel.logicalModel,
            deploymentId: defaultDeployment.id,
            runtimeProvider: defaultDeployment.provider,
            providerModel: defaultDeployment.providerModel,
            compiledPrompt: payload.prompt,
            requestSnapshot: toPersistedRequestSnapshot(payload),
            status: "running",
            error: null,
            createdAt,
            completedAt: null,
          },
          attempt: {
            id: attemptId,
            jobId,
            attemptNo: 1,
            status: "running",
            error: null,
            providerRequestId: null,
            providerTaskId: null,
            createdAt,
            completedAt: null,
            updatedAt: createdAt,
          },
        });

        const generated = await imageRuntimeRouter.generate(payload, {
          signal: requestController.signal,
        });
        const capabilityWarnings = getImageGenerationCapabilityWarnings(payload);
        const mergedWarnings = [...capabilityWarnings, ...(generated.warnings ?? [])];

        const normalizedResults = await Promise.all(
          generated.images.map(async (image, index) => {
            const normalized = await toGeneratedImageUrl(image);
            if (!normalized) {
              return null;
            }
            return {
              resultId: createId("chat-result"),
              imageId: normalized.imageId,
              imageUrl: normalized.imageUrl,
              mimeType: normalized.mimeType,
              revisedPrompt: image.revisedPrompt ?? null,
              index,
            };
          })
        );
        const normalizedImages = normalizedResults.reduce<
          Array<{
            resultId: string;
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
            resultId: image.resultId,
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

        const completedAt = new Date().toISOString();
        await repository.completeGenerationSuccess({
          conversationId: conversation.id,
          turnId,
          jobId,
          attemptId,
          logicalModel: generated.logicalModel,
          deploymentId: generated.deploymentId,
          runtimeProvider: generated.runtimeProvider,
          providerModel: generated.providerModel,
          providerRequestId: generated.providerRequestId,
          providerTaskId: generated.providerTaskId,
          warnings: mergedWarnings,
          results: normalizedImages.map((image, index) => ({
            id: image.resultId,
            imageUrl: image.imageUrl,
            imageId: image.imageId,
            runtimeProvider: image.provider,
            providerModel: image.model,
            mimeType: image.mimeType,
            revisedPrompt: image.revisedPrompt,
            index,
            assetId: null,
            saved: false,
          })),
          completedAt,
        });

        return reply.code(200).send({
          conversationId: conversation.id,
          turnId,
          jobId,
          modelId: generated.modelId,
          logicalModel: generated.logicalModel,
          deploymentId: generated.deploymentId,
          runtimeProvider: generated.runtimeProvider,
          providerModel: generated.providerModel,
          createdAt: completedAt,
          imageId: firstImageId,
          imageUrl: firstImageUrl,
          images: normalizedImages,
          ...(mergedWarnings.length > 0 ? { warnings: mergedWarnings } : {}),
        });
      } catch (error) {
        if (persistedGeneration) {
          try {
            await repository.completeGenerationFailure({
              conversationId: persistedGeneration.conversationId,
              turnId: persistedGeneration.turnId,
              jobId: persistedGeneration.jobId,
              attemptId: persistedGeneration.attemptId,
              error: error instanceof Error ? error.message : "Image generation failed.",
              completedAt: new Date().toISOString(),
            });
          } catch (persistenceError) {
            app.log.error(persistenceError);
          }
        }

        if (error instanceof ProviderError) {
          return reply.code(error.statusCode).send({
            error: error.message,
            ...(persistedGeneration
              ? {
                  conversationId: persistedGeneration.conversationId,
                  turnId: persistedGeneration.turnId,
                  jobId: persistedGeneration.jobId,
                }
              : {}),
          });
        }
        app.log.error(error);
        return reply.code(500).send({
          error: "Image generation failed.",
          ...(persistedGeneration
            ? {
                conversationId: persistedGeneration.conversationId,
                turnId: persistedGeneration.turnId,
                jobId: persistedGeneration.jobId,
              }
            : {}),
        });
      } finally {
        request.raw.removeListener("aborted", abortRequest);
        reply.raw.removeListener("close", handleResponseClose);
      }
    }
  );
};
