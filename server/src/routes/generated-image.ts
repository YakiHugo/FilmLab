import type { FastifyPluginAsync } from "fastify";
import { getConfig } from "../config";

export const generatedImageRoute: FastifyPluginAsync = async (app) => {
  const config = getConfig();

  app.get(
    "/api/generated-images/:imageId",
    {
      config: {
        rateLimit: {
          max: config.generatedImageGetRateLimitMax,
          timeWindow: config.generatedImageGetRateLimitTimeWindowMs,
        },
      },
    },
    async (request, reply) => {
      const params = request.params as { imageId?: string };
      const imageId = params.imageId?.trim();
      const token =
        typeof request.query === "object" &&
        request.query !== null &&
        "token" in request.query &&
        typeof (request.query as Record<string, unknown>).token === "string"
          ? ((request.query as Record<string, unknown>).token as string).trim()
          : "";
      if (!imageId) {
        return reply.code(400).send({ error: "Image id is required." });
      }
      if (!token) {
        return reply.code(404).send({ error: "Generated image not found." });
      }

      const entry = await app.chatStateRepository.getGeneratedImageByCapability(imageId, token);
      if (!entry) {
        return reply.code(404).send({ error: "Generated image not found." });
      }

      reply.header("Content-Type", entry.mimeType);
      reply.header("Cache-Control", "private, no-store");
      reply.header("X-Content-Type-Options", "nosniff");
      return reply.send(entry.buffer);
    }
  );
};
