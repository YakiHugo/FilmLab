import Fastify, { type FastifyInstance } from "fastify";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Pool } from "pg";
import { createAssetRepository } from "./assets/repository";
import { AssetService } from "./assets/service";
import { createAssetStorage } from "./assets/storage";
import { createChatStateRepository } from "./chat/persistence/repository";
import { assertStartupConfig, getConfig } from "./config";
import { createCorsPlugin } from "./plugins/cors";
import { registerRateLimit } from "./plugins/rateLimit";
import { createAuthPlugin } from "./plugins/auth";
import { assetRoute } from "./routes/assets";
import { createModelCatalogRoute } from "./routes/model-catalog";
import { imageConversationRoute } from "./routes/image-conversation";
import { createImageGenerateRoute } from "./routes/image-generate";
import { attachTraceIdHeader, createRequestTraceId } from "./shared/requestTrace";

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
    genReqId: (request) =>
      createRequestTraceId(request.headers, {
        trustProxyRequestId: config.trustProxyRequestId,
      }),
  });

  const pool = config.databaseUrl
    ? new Pool({
        connectionString: config.databaseUrl,
      })
    : null;

  if (pool) {
    const { runner } = await import("node-pg-migrate");
    const __dirname = path.dirname(fileURLToPath(import.meta.url));
    await runner({
      databaseUrl: config.databaseUrl!,
      dir: path.resolve(__dirname, "..", "migrations"),
      migrationsTable: "pgmigrations",
      direction: "up",
      log: (msg: string) => app.log.info(msg),
    });
  }

  const repository = createChatStateRepository(pool ?? config.databaseUrl);
  const assetService = new AssetService(
    createAssetRepository(pool, config.supabaseStorageBucket ?? "assets"),
    createAssetStorage(config),
    config
  );
  app.decorate("chatStateRepository", repository);
  app.decorate("assetService", assetService);
  app.addHook("onClose", async () => {
    await repository.close();
    await assetService.close();
  });
  app.addHook("onRequest", async (request, reply) => {
    attachTraceIdHeader(reply, request.id);
  });

  await app.register(createCorsPlugin(config));
  await app.register(registerRateLimit);
  await app.register(createAuthPlugin(config));

  await app.register(assetRoute);
  await app.register(imageConversationRoute);
  await app.register(createImageGenerateRoute(config));
  await app.register(createModelCatalogRoute(config));

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
