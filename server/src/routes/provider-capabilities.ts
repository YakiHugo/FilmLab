import type { FastifyPluginAsync } from "fastify";
import { getProviderCapabilities } from "../capabilities/registry";

export const providerCapabilitiesRoute: FastifyPluginAsync = async (app) => {
  app.get("/api/internal/provider-capabilities", async (_request, reply) => {
    return reply.code(200).send(getProviderCapabilities());
  });
};
