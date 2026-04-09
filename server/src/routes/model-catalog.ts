import type { FastifyPluginAsync } from "fastify";
import type { AppConfig } from "../config";
import { createImageModelCatalogRegistry } from "../capabilities/registry";

export const createModelCatalogRoute = (config: AppConfig): FastifyPluginAsync => async (app) => {
  const registry = createImageModelCatalogRegistry(config);

  app.get("/api/models/catalog", async (request, reply) => {
    const capability =
      typeof request.query === "object" &&
      request.query !== null &&
      "capability" in request.query &&
      typeof (request.query as Record<string, unknown>).capability === "string"
        ? (request.query as Record<string, string>).capability
        : "image.generate";

    if (capability !== "image.generate") {
      return reply.code(400).send({
        error: `Unsupported capability: ${capability}.`,
      });
    }

    return reply.code(200).send(registry.getCatalog());
  });
};
