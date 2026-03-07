import rateLimit from "@fastify/rate-limit";
import type { FastifyPluginAsync } from "fastify";

export const registerRateLimit: FastifyPluginAsync = async (app) => {
  await app.register(rateLimit, {
    global: false,
  });
};
