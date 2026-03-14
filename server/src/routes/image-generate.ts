import type { FastifyPluginAsync } from "fastify";
import { ZodError } from "zod";
import type {
  PersistedAssetEdgeType,
  PersistedImageGenerationRequestSnapshot,
  PersistedRunOperation,
  PersistedRunTargetSnapshot,
} from "../../../shared/chatImageTypes";
import { requireAuthenticatedUser } from "../auth/user";
import { getChatStateRepository } from "../chat/persistence/repository";
import { getConfig } from "../config";
import { compileImagePrompt, withExecutedPrompt } from "../gateway/prompt/compiler";
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
const formatNormalizationWarning = (count: number) =>
  `${count} generated image${count === 1 ? "" : "s"} could not be processed and ${
    count === 1 ? "was" : "were"
  } omitted.`;

const createRunTargetSnapshot = (input: PersistedRunTargetSnapshot): PersistedRunTargetSnapshot => ({
  modelId: input.modelId,
  logicalModel: input.logicalModel,
  deploymentId: input.deploymentId,
  runtimeProvider: input.runtimeProvider,
  providerModel: input.providerModel,
  pinned: input.pinned,
});

const resolveEdgeType = (role: "reference" | "edit" | "variation"): PersistedAssetEdgeType => {
  switch (role) {
    case "edit":
      return "edited_from_asset";
    case "variation":
      return "variant_of";
    default:
      return "referenced_in_turn";
  }
};

const resolveRequestedOperation = (
  assetRefs: Array<{ role: "reference" | "edit" | "variation" }> | undefined
): PersistedRunOperation => {
  if (!Array.isArray(assetRefs) || assetRefs.length === 0) {
    return "image.generate";
  }
  if (assetRefs.some((assetRef) => assetRef.role === "edit")) {
    return "image.edit";
  }
  if (assetRefs.some((assetRef) => assetRef.role === "variation")) {
    return "image.variation";
  }
  return "image.generate";
};

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
            runId: string;
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

        if (payload.threadId && payload.conversationId && payload.threadId !== payload.conversationId) {
          return reply.code(400).send({
            error: "threadId and conversationId must match when both are provided.",
          });
        }

        const requestedConversationId = payload.threadId ?? payload.conversationId;
        const conversation = requestedConversationId
          ? await repository.getConversationById(userId, requestedConversationId)
          : await repository.getOrCreateActiveConversation(userId);
        if (!conversation) {
          return reply.code(404).send({ error: "Conversation not found." });
        }

        const requestedOperation = resolveRequestedOperation(payload.assetRefs);
        if (requestedOperation !== "image.generate") {
          return reply.code(400).send({
            error: `${requestedOperation} is not available yet.`,
          });
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
        const runId = createId("chat-run");
        const attemptId = createId("chat-attempt");
        const compiledPrompt = compileImagePrompt(payload);
        const routedRequest = {
          ...payload,
          threadId: payload.threadId ?? payload.conversationId ?? conversation.id,
          conversationId: payload.conversationId ?? conversation.id,
          prompt: compiledPrompt.compiledPrompt,
        };
        const routeTargets = imageRuntimeRouter.getRouteTargets(routedRequest);
        const selectedTarget = routeTargets[0];
        persistedGeneration = {
          conversationId: conversation.id,
          turnId,
          jobId,
          runId,
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
            runIds: [runId],
            referencedAssetIds: payload.assetRefs?.map((assetRef) => assetRef.assetId) ?? [],
            primaryAssetIds: [],
            results: [],
          },
          job: {
            id: jobId,
            turnId,
            runId,
            modelId: payload.modelId,
            logicalModel: frontendModel.logicalModel,
            deploymentId: defaultDeployment.id,
            runtimeProvider: defaultDeployment.provider,
            providerModel: defaultDeployment.providerModel,
            compiledPrompt: compiledPrompt.compiledPrompt,
            requestSnapshot: toPersistedRequestSnapshot(payload),
            status: "running",
            error: null,
            createdAt,
            completedAt: null,
          },
          run: {
            id: runId,
            turnId,
            jobId,
            operation: requestedOperation,
            status: "processing",
            requestedTarget: createRunTargetSnapshot({
              modelId: payload.modelId,
              logicalModel: frontendModel.logicalModel,
              deploymentId: defaultDeployment.id,
              runtimeProvider: payload.requestedTarget?.provider ?? defaultDeployment.provider,
              providerModel: defaultDeployment.providerModel,
              pinned: Boolean(payload.requestedTarget?.deploymentId || payload.requestedTarget?.provider),
            }),
            selectedTarget: selectedTarget
              ? createRunTargetSnapshot({
                  modelId: selectedTarget.frontendModel.id,
                  logicalModel: selectedTarget.frontendModel.logicalModel,
                  deploymentId: selectedTarget.deployment.id,
                  runtimeProvider: selectedTarget.provider.id,
                  providerModel: selectedTarget.deployment.providerModel,
                  pinned: Boolean(
                    payload.requestedTarget?.deploymentId || payload.requestedTarget?.provider
                  ),
                })
              : null,
            executedTarget: null,
            prompt: compiledPrompt,
            error: null,
            warnings: [],
            assetIds: [],
            referencedAssetIds: payload.assetRefs?.map((assetRef) => assetRef.assetId) ?? [],
            createdAt,
            completedAt: null,
            telemetry: {
              providerRequestId: null,
              providerTaskId: null,
              latencyMs: null,
            },
          },
          attempt: {
            id: attemptId,
            jobId,
            runId,
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

        const startedAt = Date.now();
        const generated = await imageRuntimeRouter.generate(routedRequest, {
          signal: requestController.signal,
        });
        const normalizedSettledResults = await Promise.allSettled(
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
        const normalizedResults: Array<{
          resultId: string;
          imageId: string;
          imageUrl: string;
          mimeType?: string;
          revisedPrompt: string | null;
          index: number;
        } | null> = [];
        let normalizationFailureCount = 0;
        let firstNormalizationError: unknown = null;

        normalizedSettledResults.forEach((result, index) => {
          if (result.status === "fulfilled") {
            normalizedResults.push(result.value);
            return;
          }

          normalizationFailureCount += 1;
          firstNormalizationError ??= result.reason;
          app.log.warn(
            {
              err: result.reason,
              imageIndex: index,
              conversationId: persistedGeneration?.conversationId ?? null,
            },
            "Generated image result could not be normalized."
          );
        });
        const normalizedImages = normalizedResults.reduce<
          Array<{
            resultId: string;
            assetId: string;
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
            assetId: createId("thread-asset"),
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
          if (firstNormalizationError) {
            throw firstNormalizationError;
          }
          throw new ProviderError("Provider did not return any image.");
        }

        const capabilityWarnings = getImageGenerationCapabilityWarnings(payload);
        const mergedWarnings = [...capabilityWarnings, ...(generated.warnings ?? [])];
        if (normalizationFailureCount > 0) {
          mergedWarnings.push(formatNormalizationWarning(normalizationFailureCount));
        }

        const completedAt = new Date().toISOString();
        const assets = normalizedImages.map((image, index) => ({
          id: image.assetId,
          turnId,
          runId,
          assetType: "image" as const,
          label: `Generated image ${index + 1}`,
          metadata: {
            imageId: image.imageId,
            imageUrl: image.imageUrl,
            mimeType: image.mimeType ?? null,
            runtimeProvider: image.provider,
            providerModel: image.model,
            index,
            revisedPrompt: image.revisedPrompt ?? null,
          },
          locators: [
            {
              id: createId("thread-locator"),
              assetId: image.assetId,
              locatorType: "generated_image_store" as const,
              locatorValue: image.imageUrl,
              mimeType: image.mimeType,
              expiresAt: null,
            },
          ],
          createdAt: completedAt,
        }));
        const assetEdges = (payload.assetRefs ?? []).flatMap((assetRef) =>
          assets.map((asset) => ({
            id: createId("thread-edge"),
            sourceAssetId: assetRef.assetId,
            targetAssetId: asset.id,
            edgeType: resolveEdgeType(assetRef.role),
            turnId,
            runId,
            createdAt: completedAt,
          }))
        );
        const executedTarget = createRunTargetSnapshot({
          modelId: generated.modelId,
          logicalModel: generated.logicalModel,
          deploymentId: generated.deploymentId,
          runtimeProvider: generated.runtimeProvider,
          providerModel: generated.providerModel,
          pinned: Boolean(payload.requestedTarget?.deploymentId || payload.requestedTarget?.provider),
        });
        const completedPrompt = withExecutedPrompt(
          compiledPrompt,
          normalizedImages[0]?.revisedPrompt ?? null
        );
        await repository.completeGenerationSuccess({
          conversationId: conversation.id,
          turnId,
          jobId,
          runId,
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
            threadAssetId: image.assetId,
            runtimeProvider: image.provider,
            providerModel: image.model,
            mimeType: image.mimeType,
            revisedPrompt: image.revisedPrompt,
            index,
            assetId: null,
            saved: false,
          })),
          assets,
          assetEdges,
          run: {
            status: "completed",
            prompt: completedPrompt,
            assetIds: assets.map((asset) => asset.id),
            referencedAssetIds: payload.assetRefs?.map((assetRef) => assetRef.assetId) ?? [],
            telemetry: {
              providerRequestId: generated.providerRequestId ?? null,
              providerTaskId: generated.providerTaskId ?? null,
              latencyMs: Date.now() - startedAt,
            },
            executedTarget,
          },
          completedAt,
        });

        return reply.code(200).send({
          conversationId: conversation.id,
          threadId: conversation.id,
          turnId,
          jobId,
          runId,
          modelId: generated.modelId,
          logicalModel: generated.logicalModel,
          deploymentId: generated.deploymentId,
          runtimeProvider: generated.runtimeProvider,
          providerModel: generated.providerModel,
          createdAt: completedAt,
          imageId: firstImageId,
          imageUrl: firstImageUrl,
          images: normalizedImages.map((image) => ({
            resultId: image.resultId,
            assetId: image.assetId,
            imageId: image.imageId,
            imageUrl: image.imageUrl,
            provider: image.provider,
            model: image.model,
            mimeType: image.mimeType,
            revisedPrompt: image.revisedPrompt,
          })),
          runs: [
            {
              id: runId,
              turnId,
              jobId,
              operation: requestedOperation,
              status: "completed",
              requestedTarget: createRunTargetSnapshot({
                modelId: payload.modelId,
                logicalModel: frontendModel.logicalModel,
                deploymentId: defaultDeployment.id,
                runtimeProvider: payload.requestedTarget?.provider ?? defaultDeployment.provider,
                providerModel: defaultDeployment.providerModel,
                pinned: Boolean(payload.requestedTarget?.deploymentId || payload.requestedTarget?.provider),
              }),
              selectedTarget: selectedTarget
                ? createRunTargetSnapshot({
                    modelId: selectedTarget.frontendModel.id,
                    logicalModel: selectedTarget.frontendModel.logicalModel,
                    deploymentId: selectedTarget.deployment.id,
                    runtimeProvider: selectedTarget.provider.id,
                    providerModel: selectedTarget.deployment.providerModel,
                    pinned: Boolean(
                      payload.requestedTarget?.deploymentId || payload.requestedTarget?.provider
                    ),
                  })
                : null,
              executedTarget,
              prompt: completedPrompt,
              error: null,
              warnings: mergedWarnings,
              assetIds: assets.map((asset) => asset.id),
              referencedAssetIds: payload.assetRefs?.map((assetRef) => assetRef.assetId) ?? [],
              createdAt,
              completedAt,
              telemetry: {
                providerRequestId: generated.providerRequestId ?? null,
                providerTaskId: generated.providerTaskId ?? null,
                latencyMs: Date.now() - startedAt,
              },
            },
          ],
          assets,
          primaryAssetIds: assets.map((asset) => asset.id),
          ...(mergedWarnings.length > 0 ? { warnings: mergedWarnings } : {}),
        });
      } catch (error) {
        const failureMessage = requestController.signal.aborted
          ? "Image generation was canceled."
          : error instanceof Error
            ? error.message
            : "Image generation failed.";

        if (persistedGeneration) {
          try {
            await repository.completeGenerationFailure({
              conversationId: persistedGeneration.conversationId,
              turnId: persistedGeneration.turnId,
              jobId: persistedGeneration.jobId,
              runId: persistedGeneration.runId,
              attemptId: persistedGeneration.attemptId,
              error: failureMessage,
              completedAt: new Date().toISOString(),
            });
          } catch (persistenceError) {
            app.log.error(persistenceError);
          }
        }

        if (requestController.signal.aborted || reply.raw.destroyed) {
          return reply;
        }

        if (error instanceof ProviderError) {
          return reply.code(error.statusCode).send({
            error: error.message,
            ...(persistedGeneration
              ? {
                  conversationId: persistedGeneration.conversationId,
                  threadId: persistedGeneration.conversationId,
                  turnId: persistedGeneration.turnId,
                  jobId: persistedGeneration.jobId,
                  runId: persistedGeneration.runId,
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
                threadId: persistedGeneration.conversationId,
                turnId: persistedGeneration.turnId,
                jobId: persistedGeneration.jobId,
                runId: persistedGeneration.runId,
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
