import cors from "@fastify/cors";
import type { FastifyPluginAsync } from "fastify";
import { IMAGE_PROVIDER_IDS } from "../../../shared/imageGeneration";
import { getConfig } from "../config";

export const registerCors: FastifyPluginAsync = async (app) => {
  const config = getConfig();
  await app.register(cors, {
    origin: config.corsOrigin,
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      ...IMAGE_PROVIDER_IDS.map((providerId) => `X-Provider-Key-${providerId}`),
    ],
  });
};
