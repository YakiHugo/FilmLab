import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.string().optional(),
  HOST: z.string().trim().min(1).default("0.0.0.0"),
  PORT: z.coerce.number().int().min(1).max(65_535).default(3001),
  CORS_ORIGIN: z.string().trim().min(1).default("http://localhost:5173"),
  REQUEST_BODY_LIMIT_MB: z.coerce.number().min(1).max(50).default(12),
  PROVIDER_REQUEST_TIMEOUT_MS: z.coerce.number().int().min(1_000).max(300_000).default(120_000),
  IMAGE_GENERATE_RATE_LIMIT_MAX: z.coerce.number().int().min(1).max(1_000).optional(),
  IMAGE_GENERATE_RATE_LIMIT_WINDOW_MS: z.coerce.number().int().min(1_000).max(3_600_000).optional(),
  GENERATED_IMAGE_GET_RATE_LIMIT_MAX: z.coerce.number().int().min(1).max(10_000).optional(),
  GENERATED_IMAGE_GET_RATE_LIMIT_WINDOW_MS: z.coerce.number().int().min(1_000).max(3_600_000).optional(),
  RATE_LIMIT_MAX: z.coerce.number().int().min(1).max(1_000).default(20),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().min(1_000).max(3_600_000).default(60_000),
  GENERATED_IMAGE_STORE_MAX_ITEMS: z.coerce.number().int().min(1).max(10_000).default(128),
  GENERATED_IMAGE_STORE_MAX_MB: z.coerce.number().min(1).max(512).default(64),
  GENERATED_IMAGE_DOWNLOAD_MAX_MB: z.coerce.number().min(1).max(512).default(32),
  REFERENCE_IMAGE_DOWNLOAD_MAX_MB: z.coerce.number().min(1).max(128).default(8),
  OPENAI_API_KEY: z.string().trim().min(1).optional(),
  STABILITY_API_KEY: z.string().trim().min(1).optional(),
  FLUX_API_KEY: z.string().trim().min(1).optional(),
  FAL_KEY: z.string().trim().min(1).optional(),
  FLUX_API_BASE_URL: z.string().trim().url().default("https://fal.run"),
  IDEOGRAM_API_KEY: z.string().trim().min(1).optional(),
});

export interface AppConfig {
  nodeEnv: string;
  host: string;
  port: number;
  corsOrigin: string | string[];
  requestBodyLimitBytes: number;
  providerRequestTimeoutMs: number;
  rateLimitMax: number;
  rateLimitTimeWindowMs: number;
  imageGenerateRateLimitMax: number;
  imageGenerateRateLimitTimeWindowMs: number;
  generatedImageGetRateLimitMax: number;
  generatedImageGetRateLimitTimeWindowMs: number;
  generatedImageStoreMaxItems: number;
  generatedImageStoreMaxBytes: number;
  generatedImageDownloadMaxBytes: number;
  referenceImageDownloadMaxBytes: number;
  openAiApiKey?: string;
  stabilityApiKey?: string;
  fluxApiKey?: string;
  fluxApiBaseUrl: string;
  ideogramApiKey?: string;
}

let cachedConfig: AppConfig | null = null;

const toCorsOrigin = (value: string) => {
  const origins = value
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
  return origins.length > 1 ? origins : origins[0] ?? "http://localhost:5173";
};

export const getConfig = (): AppConfig => {
  if (cachedConfig) {
    return cachedConfig;
  }

  const env = envSchema.parse(process.env);
  cachedConfig = {
    nodeEnv: env.NODE_ENV ?? "development",
    host: env.HOST,
    port: env.PORT,
    corsOrigin: toCorsOrigin(env.CORS_ORIGIN),
    requestBodyLimitBytes: Math.round(env.REQUEST_BODY_LIMIT_MB * 1024 * 1024),
    providerRequestTimeoutMs: env.PROVIDER_REQUEST_TIMEOUT_MS,
    rateLimitMax: env.RATE_LIMIT_MAX,
    rateLimitTimeWindowMs: env.RATE_LIMIT_WINDOW_MS,
    imageGenerateRateLimitMax: env.IMAGE_GENERATE_RATE_LIMIT_MAX ?? env.RATE_LIMIT_MAX,
    imageGenerateRateLimitTimeWindowMs:
      env.IMAGE_GENERATE_RATE_LIMIT_WINDOW_MS ?? env.RATE_LIMIT_WINDOW_MS,
    generatedImageGetRateLimitMax:
      env.GENERATED_IMAGE_GET_RATE_LIMIT_MAX ?? Math.max(env.RATE_LIMIT_MAX * 6, 60),
    generatedImageGetRateLimitTimeWindowMs:
      env.GENERATED_IMAGE_GET_RATE_LIMIT_WINDOW_MS ?? env.RATE_LIMIT_WINDOW_MS,
    generatedImageStoreMaxItems: env.GENERATED_IMAGE_STORE_MAX_ITEMS,
    generatedImageStoreMaxBytes: Math.round(env.GENERATED_IMAGE_STORE_MAX_MB * 1024 * 1024),
    generatedImageDownloadMaxBytes: Math.round(
      env.GENERATED_IMAGE_DOWNLOAD_MAX_MB * 1024 * 1024
    ),
    referenceImageDownloadMaxBytes: Math.round(
      env.REFERENCE_IMAGE_DOWNLOAD_MAX_MB * 1024 * 1024
    ),
    openAiApiKey: env.OPENAI_API_KEY,
    stabilityApiKey: env.STABILITY_API_KEY,
    fluxApiKey: env.FLUX_API_KEY ?? env.FAL_KEY,
    fluxApiBaseUrl: env.FLUX_API_BASE_URL.replace(/\/+$/, ""),
    ideogramApiKey: env.IDEOGRAM_API_KEY,
  };

  return cachedConfig;
};
