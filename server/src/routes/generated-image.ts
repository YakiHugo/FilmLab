import type { FastifyPluginAsync } from "fastify";
import { getConfig } from "../config";
import { getGeneratedImage } from "../shared/generatedImageStore";

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
      if (!imageId) {
        return reply.code(400).send({ error: "Image id is required." });
      }

      const entry = getGeneratedImage(imageId);
      if (!entry) {
        return reply.code(404).send({ error: "Generated image not found or expired." });
      }

      reply.header("Content-Type", entry.mimeType);
      reply.header("Cache-Control", "private, max-age=900");
      reply.header("X-Content-Type-Options", "nosniff");
      return reply.send(entry.buffer);
    }
  );
};
