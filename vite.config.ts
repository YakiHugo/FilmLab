import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "url";
import path from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          react: ["react", "react-dom"],
          router: ["@tanstack/react-router"],
          ai: ["ai", "@ai-sdk/react", "@ai-sdk/openai", "@ai-sdk/anthropic", "@ai-sdk/google"],
          markdown: ["react-markdown", "remark-gfm"],
          canvas: ["konva", "react-konva"],
          ui: [
            "lucide-react",
            "@radix-ui/react-label",
            "@radix-ui/react-select",
            "@radix-ui/react-slider",
            "@radix-ui/react-slot",
          ],
        },
      },
    },
  },
});
