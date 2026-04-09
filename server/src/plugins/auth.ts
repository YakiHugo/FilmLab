import fp from "fastify-plugin";
import type { AuthConfig } from "../config";
import { getUserIdFromAuthorizationHeader } from "../auth/user";

const AUTH_EXEMPT_ROUTES = new Set([
  "GET /api/models/catalog",
  "GET /api/assets/:assetId/:kind",
]);

export const createAuthPlugin = (config: AuthConfig) => fp(async (app) => {
  app.addHook("preHandler", async (request, reply) => {
    if (!request.url.startsWith("/api/")) return;
    const routeKey = `${request.method} ${request.routeOptions.url}`;
    if (AUTH_EXEMPT_ROUTES.has(routeKey)) return;

    const userId = await getUserIdFromAuthorizationHeader(request.headers.authorization, config);
    if (!userId) {
      return reply.code(401).send({ error: "Unauthorized." });
    }
    request.userId = userId;
  });
});
