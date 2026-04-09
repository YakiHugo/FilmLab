import type { FastifyPluginAsync } from "fastify";
import { ImageLabConversationService } from "../chat/application/conversationService";
import { ChatConversationNotFoundError } from "../chat/persistence/types";

export const imageConversationRoute: FastifyPluginAsync = async (app) => {
  const conversationService = new ImageLabConversationService(app.chatStateRepository);

  app.get("/api/image-conversation", async (request, reply) => {
    const userId = request.userId!;

    const conversationId =
      typeof request.query === "object" &&
      request.query !== null &&
      "conversationId" in request.query &&
      typeof (request.query as Record<string, unknown>).conversationId === "string"
        ? ((request.query as Record<string, unknown>).conversationId as string)
        : undefined;

    try {
      return reply.code(200).send(await conversationService.getConversation(userId, conversationId));
    } catch (error) {
      app.log.error(error);
      if (error instanceof ChatConversationNotFoundError) {
        return reply.code(404).send({ error: "Conversation not found." });
      }
      return reply.code(500).send({ error: "Conversation could not be loaded." });
    }
  });

  app.get("/api/image-conversation/turns/:turnId/prompt-artifacts", async (request, reply) => {
    const userId = request.userId!;

    const { turnId } = request.params as { turnId: string };

    try {
      const artifacts = await conversationService.getPromptArtifacts(userId, turnId);
      if (!artifacts) {
        return reply.code(404).send({ error: "Turn not found." });
      }

      return reply.code(200).send(artifacts);
    } catch (error) {
      app.log.error(error);
      return reply.code(500).send({ error: "Prompt artifacts could not be loaded." });
    }
  });

  app.get("/api/image-conversation/observability", async (request, reply) => {
    const userId = request.userId!;

    const conversationId =
      typeof request.query === "object" &&
      request.query !== null &&
      "conversationId" in request.query &&
      typeof (request.query as Record<string, unknown>).conversationId === "string"
        ? ((request.query as Record<string, unknown>).conversationId as string)
        : undefined;

    try {
      const summary = await conversationService.getObservability(userId, conversationId);
      if (!summary) {
        return reply.code(404).send({ error: "Conversation not found." });
      }

      return reply.code(200).send(summary);
    } catch (error) {
      app.log.error(error);
      return reply.code(500).send({ error: "Prompt observability could not be loaded." });
    }
  });

  app.delete("/api/image-conversation", async (request, reply) => {
    const userId = request.userId!;

    try {
      return reply.code(200).send(await conversationService.clearConversation(userId));
    } catch (error) {
      app.log.error(error);
      return reply.code(500).send({ error: "Conversation could not be cleared." });
    }
  });

  app.delete("/api/image-conversation/turns/:turnId", async (request, reply) => {
    const userId = request.userId!;

    const { turnId } = request.params as { turnId: string };

    try {
      const snapshot = await conversationService.deleteTurn(userId, turnId);
      if (!snapshot) {
        return reply.code(404).send({ error: "Turn not found." });
      }

      return reply.code(200).send(snapshot);
    } catch (error) {
      app.log.error(error);
      return reply.code(500).send({ error: "Turn could not be deleted." });
    }
  });

  app.post("/api/image-conversation/turns/:turnId/accept", async (request, reply) => {
    const userId = request.userId!;

    const { turnId } = request.params as { turnId: string };
    const assetId =
      typeof request.body === "object" &&
      request.body !== null &&
      "assetId" in request.body &&
      typeof (request.body as Record<string, unknown>).assetId === "string"
        ? ((request.body as Record<string, unknown>).assetId as string)
        : null;

    if (!assetId) {
      return reply.code(400).send({ error: "assetId is required." });
    }

    try {
      return reply.code(200).send(
        await conversationService.acceptTurn({
          userId,
          turnId,
          assetId,
          acceptedAt: new Date().toISOString(),
        })
      );
    } catch (error) {
      app.log.error(error);
      if (error instanceof ChatConversationNotFoundError) {
        return reply.code(404).send({ error: "Turn not found." });
      }
      return reply.code(500).send({ error: "Turn could not be accepted." });
    }
  });
};
