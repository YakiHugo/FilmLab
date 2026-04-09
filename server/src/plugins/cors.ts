import cors from "@fastify/cors";
import type { FastifyPluginAsync } from "fastify";
import type { AppConfig } from "../config";

export const createCorsPlugin = (config: AppConfig): FastifyPluginAsync => async (app) => {
  await app.register(cors, {
    origin: config.corsOrigin,
    methods: ["GET", "POST", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  });
};
