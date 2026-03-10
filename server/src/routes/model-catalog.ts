import type { FastifyPluginAsync } from "fastify";
import { getImageModelCatalog } from "../capabilities/registry";

export const modelCatalogRoute: FastifyPluginAsync = async (app) => {
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

    return reply.code(200).send(getImageModelCatalog());
  });
};
