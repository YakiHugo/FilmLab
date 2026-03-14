import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "url";
import path from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const manualChunkGroups = [
  ["react", ["react", "react-dom"]],
  ["router", ["@tanstack/react-router"]],
  ["ai", ["ai", "@ai-sdk/react", "@ai-sdk/openai", "@ai-sdk/anthropic", "@ai-sdk/google"]],
  ["markdown", ["react-markdown", "remark-gfm"]],
  ["canvas", ["konva", "react-konva"]],
  [
    "ui",
    [
      "lucide-react",
      "@radix-ui/react-label",
      "@radix-ui/react-select",
      "@radix-ui/react-slider",
      "@radix-ui/react-slot",
    ],
  ],
] as const;

const dependencyChunkMap = manualChunkGroups.flatMap(([chunkName, dependencies]) =>
  dependencies.map((dependency) => [dependency, chunkName] as const)
);

function resolveManualChunk(id: string) {
  if (!id.includes("node_modules")) {
    return undefined;
  }

  const normalizedId = id.replace(/\\/g, "/");

  for (const [dependency, chunkName] of dependencyChunkMap) {
    if (normalizedId.includes(`/node_modules/${dependency}/`)) {
      return chunkName;
    }
  }

  return undefined;
}

export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    entries: ["index.html"],
  },
  server: {
    proxy: {
      "/api": {
        target: "http://localhost:3001",
        changeOrigin: true,
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: resolveManualChunk,
      },
    },
  },
});
