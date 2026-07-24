import { defineConfig, mergeConfig } from "vitest/config";
import { playwright } from "@vitest/browser-playwright";
import viteConfig from "./vite.config";

const swiftShaderArgs = [
  "--enable-unsafe-webgpu",
  "--use-webgpu-adapter=swiftshader",
  "--enable-unsafe-swiftshader",
];

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      projects: [
        {
          extends: true,
          test: {
            name: "unit",
            include: [
              "src/**/*.{test,spec}.{ts,tsx}",
              "server/src/**/*.{test,spec}.{ts,tsx}",
              "shared/**/*.{test,spec}.{ts,tsx}",
            ],
            exclude: ["dist/**", "node_modules/**", "**/*.browser.{test,spec}.{ts,tsx}"],
          },
        },
        {
          extends: true,
          test: {
            name: "browser",
            include: [
              "src/**/*.browser.{test,spec}.{ts,tsx}",
              "server/src/**/*.browser.{test,spec}.{ts,tsx}",
              "shared/**/*.browser.{test,spec}.{ts,tsx}",
            ],
            browser: {
              enabled: true,
              provider: playwright({
                launchOptions: { args: swiftShaderArgs },
              }),
              headless: true,
              instances: [{ browser: "chromium" }],
              commands: {
                goldenFileExists: async (_ctx, relativePath: string) => {
                  const { existsSync } = await import("node:fs");
                  const { resolve } = await import("node:path");
                  return existsSync(resolve("test-assets/baselines/golden", relativePath));
                },
                saveGoldenFile: async (_ctx, relativePath: string, base64Png: string) => {
                  const { mkdirSync, writeFileSync } = await import("node:fs");
                  const { dirname, resolve } = await import("node:path");
                  const target = resolve("test-assets/baselines/golden", relativePath);
                  mkdirSync(dirname(target), { recursive: true });
                  writeFileSync(target, Buffer.from(base64Png, "base64"));
                },
                readTestAsset: async (_ctx, relativePath: string) => {
                  const { readFile } = await import("node:fs/promises");
                  const { resolve } = await import("node:path");
                  const buffer = await readFile(resolve("test-assets", relativePath));
                  return buffer.toString("base64");
                },
              },
            },
          },
        },
      ],
    },
  })
);
