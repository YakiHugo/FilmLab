import Fastify, { type FastifyInstance } from "fastify";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createChatStateRepository } from "./chat/persistence/repository";
import { assertStartupConfig, getConfig } from "./config";
import { registerCors } from "./plugins/cors";
import { registerRateLimit } from "./plugins/rateLimit";
import { generatedImageRoute } from "./routes/generated-image";
import { modelCatalogRoute } from "./routes/model-catalog";
import { imageConversationRoute } from "./routes/image-conversation";
import { imageGenerateRoute } from "./routes/image-generate";

export const buildServer = async () => {
  const config = getConfig();
  assertStartupConfig(config);

  const app = Fastify({
    logger: {
      redact: {
        paths: ["req.headers.authorization"],
        censor: "[REDACTED]",
      },
    },
    bodyLimit: config.requestBodyLimitBytes,
  });

  const repository = createChatStateRepository(config.databaseUrl);
  app.decorate("chatStateRepository", repository);
  app.addHook("onClose", async () => {
    await repository.close();
  });

  await app.register(registerCors);
  await app.register(registerRateLimit);
  await app.register(generatedImageRoute);
  await app.register(imageConversationRoute);
  await app.register(imageGenerateRoute);
  await app.register(modelCatalogRoute);

  app.get("/health", async () => ({
    status: "ok",
  }));

  return app;
};

const registerGracefulShutdown = (app: FastifyInstance) => {
  const shutdown = async (signal: string) => {
    try {
      app.log.info({ signal }, "Shutting down server");
      await app.close();
      process.exit(0);
    } catch (error) {
      app.log.error(error);
      process.exit(1);
    }
  };

  process.once("SIGINT", () => {
    void shutdown("SIGINT");
  });
  process.once("SIGTERM", () => {
    void shutdown("SIGTERM");
  });
};

const start = async () => {
  const config = getConfig();
  const app = await buildServer();

  registerGracefulShutdown(app);

  try {
    await app.listen({
      host: config.host,
      port: config.port,
    });
  } catch (error) {
    app.log.error(error);
    process.exit(1);
  }
};

const isEntryPoint = (() => {
  const entryPath = process.argv[1];
  if (!entryPath) {
    return false;
  }

  return path.resolve(fileURLToPath(import.meta.url)) === path.resolve(entryPath);
})();

if (isEntryPoint) {
  void start();
}
