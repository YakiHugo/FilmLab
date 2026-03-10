import Fastify from "fastify";
import { getConfig } from "./config";
import { registerCors } from "./plugins/cors";
import { registerRateLimit } from "./plugins/rateLimit";
import { generatedImageRoute } from "./routes/generated-image";
import { modelCatalogRoute } from "./routes/model-catalog";
import { imageGenerateRoute } from "./routes/image-generate";

export const buildServer = () => {
  const config = getConfig();
  return Fastify({
    logger: {
      redact: {
        paths: ["req.headers.authorization"],
        censor: "[REDACTED]",
      },
    },
    bodyLimit: config.requestBodyLimitBytes,
  });
};

const registerGracefulShutdown = (app: ReturnType<typeof buildServer>) => {
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
  const app = buildServer();

  await app.register(registerCors);
  await app.register(registerRateLimit);
  await app.register(generatedImageRoute);
  await app.register(imageGenerateRoute);
  await app.register(modelCatalogRoute);

  app.get("/health", async () => ({
    status: "ok",
  }));

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

void start();
