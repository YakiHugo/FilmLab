import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { z } from "zod";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const serverDir = path.resolve(__dirname, "..");
const workspaceDir = path.resolve(serverDir, "..");

const loadEnvFile = (envPath: string) => {
  dotenv.config({
    path: envPath,
    quiet: true,
  });
};

// Load broader defaults first, then allow server-scoped files to override them.
loadEnvFile(path.join(workspaceDir, ".env"));
loadEnvFile(path.join(workspaceDir, ".env.local"));
loadEnvFile(path.join(serverDir, ".env"));
loadEnvFile(path.join(serverDir, ".env.local"));

const emptyStringToUndefined = (value: unknown) => {
  if (typeof value !== "string") {
    return value;
  }

  const normalized = value.trim();
  return normalized ? normalized : undefined;
};

const optionalTrimmedString = () =>
  z.preprocess(emptyStringToUndefined, z.string().trim().min(1).optional());

const optionalUrlString = () =>
  z.preprocess(emptyStringToUndefined, z.string().trim().url().optional());

const optionalBooleanString = () =>
  z.preprocess((value) => {
    if (typeof value !== "string") {
      return value;
    }

    const normalized = value.trim().toLowerCase();
    if (!normalized) {
      return undefined;
    }
    if (normalized === "true") {
      return true;
    }
    if (normalized === "false") {
      return false;
    }
    return value;
  }, z.boolean().optional());

const envSchema = z.object({
  NODE_ENV: z.string().optional(),
  HOST: z.string().trim().min(1).default("0.0.0.0"),
  PORT: z.coerce.number().int().min(1).max(65_535).default(3001),
  CORS_ORIGIN: z.string().trim().min(1).default("http://localhost:5173"),
  REQUEST_BODY_LIMIT_MB: z.coerce.number().min(1).max(50).default(12),
  PROVIDER_REQUEST_TIMEOUT_MS: z.coerce.number().int().min(1_000).max(300_000).default(120_000),
  IMAGE_GENERATE_RATE_LIMIT_MAX: z.coerce.number().int().min(1).max(1_000).optional(),
  IMAGE_GENERATE_RATE_LIMIT_WINDOW_MS: z.coerce.number().int().min(1_000).max(3_600_000).optional(),
  IMAGE_UPSCALE_RATE_LIMIT_MAX: z.coerce.number().int().min(1).max(1_000).optional(),
  IMAGE_UPSCALE_RATE_LIMIT_WINDOW_MS: z.coerce.number().int().min(1_000).max(3_600_000).optional(),
  GENERATED_IMAGE_GET_RATE_LIMIT_MAX: z.coerce.number().int().min(1).max(10_000).optional(),
  GENERATED_IMAGE_GET_RATE_LIMIT_WINDOW_MS: z.coerce
    .number()
    .int()
    .min(1_000)
    .max(3_600_000)
    .optional(),
  RATE_LIMIT_MAX: z.coerce.number().int().min(1).max(1_000).default(20),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().min(1_000).max(3_600_000).default(60_000),
  GENERATED_IMAGE_STORE_MAX_ITEMS: z.coerce.number().int().min(1).max(10_000).default(128),
  GENERATED_IMAGE_STORE_MAX_MB: z.coerce.number().min(1).max(512).default(64),
  GENERATED_IMAGE_DOWNLOAD_MAX_MB: z.coerce.number().min(1).max(512).default(32),
  REFERENCE_IMAGE_DOWNLOAD_MAX_MB: z.coerce.number().min(1).max(128).default(8),
  ARK_API_KEY: optionalTrimmedString(),
  ARK_API_BASE_URL: optionalUrlString().default("https://ark.cn-beijing.volces.com"),
  DASHSCOPE_API_KEY: optionalTrimmedString(),
  DASHSCOPE_API_BASE_URL: optionalUrlString().default("https://dashscope.aliyuncs.com"),
  KLING_ACCESS_KEY: optionalTrimmedString(),
  KLING_SECRET_KEY: optionalTrimmedString(),
  KLING_API_BASE_URL: optionalUrlString().default("https://api-beijing.klingai.com"),
  DATABASE_URL: optionalTrimmedString(),
  AUTH_JWT_SECRET: optionalTrimmedString(),
  AUTH_JWT_ISSUER: optionalTrimmedString(),
  AUTH_JWT_AUDIENCE: optionalTrimmedString(),
  ALLOW_UNSIGNED_DEV_AUTH: optionalBooleanString(),
  DEV_AUTH_ALLOWED_USER_IDS: optionalTrimmedString(),
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
  imageUpscaleRateLimitMax: number;
  imageUpscaleRateLimitTimeWindowMs: number;
  generatedImageGetRateLimitMax: number;
  generatedImageGetRateLimitTimeWindowMs: number;
  generatedImageStoreMaxItems: number;
  generatedImageStoreMaxBytes: number;
  generatedImageDownloadMaxBytes: number;
  referenceImageDownloadMaxBytes: number;
  arkApiKey?: string;
  arkApiBaseUrl: string;
  dashscopeApiKey?: string;
  dashscopeApiBaseUrl: string;
  klingAccessKey?: string;
  klingSecretKey?: string;
  klingApiBaseUrl: string;
  databaseUrl?: string;
  authJwtSecret?: string;
  authJwtIssuer?: string;
  authJwtAudience?: string;
  allowUnsignedDevAuth: boolean;
  devAuthAllowedUserIds: string[];
}

let cachedConfig: AppConfig | null = null;

const toCorsOrigin = (value: string) => {
  const origins = value
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
  return origins.length > 1 ? origins : (origins[0] ?? "http://localhost:5173");
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
    imageUpscaleRateLimitMax:
      env.IMAGE_UPSCALE_RATE_LIMIT_MAX ?? env.IMAGE_GENERATE_RATE_LIMIT_MAX ?? env.RATE_LIMIT_MAX,
    imageUpscaleRateLimitTimeWindowMs:
      env.IMAGE_UPSCALE_RATE_LIMIT_WINDOW_MS ??
      env.IMAGE_GENERATE_RATE_LIMIT_WINDOW_MS ??
      env.RATE_LIMIT_WINDOW_MS,
    generatedImageGetRateLimitMax:
      env.GENERATED_IMAGE_GET_RATE_LIMIT_MAX ?? Math.max(env.RATE_LIMIT_MAX * 6, 60),
    generatedImageGetRateLimitTimeWindowMs:
      env.GENERATED_IMAGE_GET_RATE_LIMIT_WINDOW_MS ?? env.RATE_LIMIT_WINDOW_MS,
    generatedImageStoreMaxItems: env.GENERATED_IMAGE_STORE_MAX_ITEMS,
    generatedImageStoreMaxBytes: Math.round(env.GENERATED_IMAGE_STORE_MAX_MB * 1024 * 1024),
    generatedImageDownloadMaxBytes: Math.round(env.GENERATED_IMAGE_DOWNLOAD_MAX_MB * 1024 * 1024),
    referenceImageDownloadMaxBytes: Math.round(env.REFERENCE_IMAGE_DOWNLOAD_MAX_MB * 1024 * 1024),
    arkApiKey: env.ARK_API_KEY,
    arkApiBaseUrl: env.ARK_API_BASE_URL.replace(/\/+$/, ""),
    dashscopeApiKey: env.DASHSCOPE_API_KEY,
    dashscopeApiBaseUrl: env.DASHSCOPE_API_BASE_URL.replace(/\/+$/, ""),
    klingAccessKey: env.KLING_ACCESS_KEY,
    klingSecretKey: env.KLING_SECRET_KEY,
    klingApiBaseUrl: env.KLING_API_BASE_URL.replace(/\/+$/, ""),
    databaseUrl: env.DATABASE_URL,
    authJwtSecret: env.AUTH_JWT_SECRET,
    authJwtIssuer: env.AUTH_JWT_ISSUER,
    authJwtAudience: env.AUTH_JWT_AUDIENCE,
    allowUnsignedDevAuth:
      env.ALLOW_UNSIGNED_DEV_AUTH ?? ((env.NODE_ENV ?? "development") !== "production"),
    devAuthAllowedUserIds: (env.DEV_AUTH_ALLOWED_USER_IDS ?? "local-user")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean),
  };

  return cachedConfig;
};
