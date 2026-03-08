import Fastify from "fastify";
import { getConfig } from "./config";
import { registerCors } from "./plugins/cors";
import { registerRateLimit } from "./plugins/rateLimit";
import { generatedImageRoute } from "./routes/generated-image";
import { imageGenerateRoute } from "./routes/image-generate";
import { imageUpscaleRoute } from "./routes/image-upscale";
import { recommendFilmRoute } from "./routes/recommend-film";

export const buildServer = () => {
  const config = getConfig();
  return Fastify({
    logger: {
      redact: {
        paths: [
          "req.headers.authorization",
          "req.headers.x-provider-key-openai",
          "req.headers.x-provider-key-stability",
          "req.headers.x-provider-key-flux",
          "req.headers.x-provider-key-ideogram",
        ],
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
  await app.register(imageUpscaleRoute);
  await app.register(recommendFilmRoute);

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
