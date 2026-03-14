import cors from "@fastify/cors";
import type { FastifyPluginAsync } from "fastify";
import { getConfig } from "../config";

export const registerCors: FastifyPluginAsync = async (app) => {
  const config = getConfig();
  await app.register(cors, {
    origin: config.corsOrigin,
    methods: ["GET", "POST", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  });
};
