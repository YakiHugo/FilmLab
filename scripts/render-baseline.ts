import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");
const IMAGES_DIR = path.join(ROOT, "test-assets", "images");
const OUTPUT_PATH = path.join(ROOT, "docs", "render_baseline.md");

const formatBytes = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
};

const imageFiles = fs
  .readdirSync(IMAGES_DIR, { withFileTypes: true })
  .filter((entry) => entry.isFile())
  .map((entry) => entry.name)
  .filter((name) => /\.(jpe?g|png|webp)$/i.test(name))
  .sort((a, b) => a.localeCompare(b, "en"));

const rows = imageFiles.map((name) => {
  const fullPath = path.join(IMAGES_DIR, name);
  const stat = fs.statSync(fullPath);
  return {
    name,
    sizeBytes: stat.size,
    sizeHuman: formatBytes(stat.size),
  };
});

const now = new Date().toISOString();
const totalBytes = rows.reduce((sum, row) => sum + row.sizeBytes, 0);

const markdownLines = [
  "# Render Baseline",
  "",
  `Generated: ${now}`,
  "",
  "## Asset Manifest",
  "",
  "| File | Size |",
  "| --- | ---: |",
  ...rows.map((row) => `| \`${row.name}\` | ${row.sizeHuman} |`),
  `| **Total (${rows.length} files)** | **${formatBytes(totalBytes)}** |`,
  "",
  "## Benchmark Procedure",
  "",
  "1. Run `pnpm dev`, open the app, and load assets from `test-assets/images/`.",
  "2. Enable timing logs in DevTools:",
  "   - `localStorage.setItem(\"filmlab:renderTiming\", \"1\")`",
  "   - optional: `localStorage.setItem(\"filmlab:renderTimingVerbose\", \"1\")`",
  "3. Reload and perform fixed interaction scripts:",
  "   - 10s exposure drag, 10s WB drag, 10s clarity drag.",
  "   - repeat for preview and export scenarios.",
  "4. Capture console timing logs and compute P50/P95 by mode.",
  "",
  "## Notes",
  "",
  "- Runtime flags can be forced via `filmlab:feature:*` keys for rollback tests.",
  "- Export concurrency baseline can be pinned via `filmlab:exportConcurrency`.",
  "",
];

fs.writeFileSync(OUTPUT_PATH, `${markdownLines.join("\n")}\n`, "utf8");
console.log(`[FilmLab] Wrote baseline manifest: ${path.relative(ROOT, OUTPUT_PATH)}`);
