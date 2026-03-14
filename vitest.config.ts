import { defineConfig, mergeConfig } from "vitest/config";
import viteConfig from "./vite.config";

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      include: [
        "src/**/*.{test,spec}.{ts,tsx}",
        "server/src/**/*.{test,spec}.{ts,tsx}",
        "shared/**/*.{test,spec}.{ts,tsx}",
      ],
      exclude: ["dist/**", "node_modules/**"],
    },
  })
);
