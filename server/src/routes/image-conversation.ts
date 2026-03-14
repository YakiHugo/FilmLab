import type { FastifyPluginAsync } from "fastify";
import { requireAuthenticatedUser } from "../auth/user";
import { ChatConversationNotFoundError } from "../chat/persistence/types";

export const imageConversationRoute: FastifyPluginAsync = async (app) => {
  app.get("/api/image-conversation", async (request, reply) => {
    const userId = requireAuthenticatedUser(request);
    if (!userId) {
      return reply.code(401).send({ error: "Unauthorized." });
    }

    const conversationId =
      typeof request.query === "object" &&
      request.query !== null &&
      "conversationId" in request.query &&
      typeof (request.query as Record<string, unknown>).conversationId === "string"
        ? ((request.query as Record<string, unknown>).conversationId as string)
        : undefined;

    try {
      return reply
        .code(200)
        .send(await app.chatStateRepository.getConversationSnapshot(userId, conversationId));
    } catch (error) {
      app.log.error(error);
      if (error instanceof ChatConversationNotFoundError) {
        return reply.code(404).send({ error: "Conversation not found." });
      }
      return reply.code(500).send({ error: "Conversation could not be loaded." });
    }
  });

  app.delete("/api/image-conversation", async (request, reply) => {
    const userId = requireAuthenticatedUser(request);
    if (!userId) {
      return reply.code(401).send({ error: "Unauthorized." });
    }

    try {
      return reply.code(200).send(await app.chatStateRepository.clearActiveConversation(userId));
    } catch (error) {
      app.log.error(error);
      return reply.code(500).send({ error: "Conversation could not be cleared." });
    }
  });

  app.delete("/api/image-conversation/turns/:turnId", async (request, reply) => {
    const userId = requireAuthenticatedUser(request);
    if (!userId) {
      return reply.code(401).send({ error: "Unauthorized." });
    }

    const { turnId } = request.params as { turnId: string };

    try {
      const snapshot = await app.chatStateRepository.deleteTurn(userId, turnId);
      if (!snapshot) {
        return reply.code(404).send({ error: "Turn not found." });
      }

      return reply.code(200).send(snapshot);
    } catch (error) {
      app.log.error(error);
      return reply.code(500).send({ error: "Turn could not be deleted." });
    }
  });
};
