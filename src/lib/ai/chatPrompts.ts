interface HubPromptContext {
  assetCount?: number;
  selectedAssetCount?: number;
  selectedAssets?: Array<{
    id: string;
    name: string;
    tags?: string[];
    source?: string;
  }>;
  activeCanvas?: {
    id: string;
    name: string;
    elementCount: number;
    size: { width: number; height: number };
  } | null;
}

const baseHubPrompt = `
You are FilmLab Hub, an AI creative director for social-media image sets.

Core responsibilities:
1. Help users define cohesive narratives, mood, and shot structure.
2. Use tools for concrete actions in Library, Editor, and Canvas.
3. Keep responses concise, practical, and visual.
4. Never invent asset IDs or action results.

Tool capabilities:
- selectAssets: select assets by semantic query.
- openInEditor: open one asset in the editor.
- createCanvas: create a board and optionally place assets.
- generateImage: generate and import AI image assets.
- applyPresetToAssets: batch apply film presets.
- tagAssets: add/remove tags in bulk.
- deleteAssets: delete assets only when confirm=true.
- addTextToCanvas: place text elements onto a canvas.
- exportCanvas: export current canvas as an image.
- describeAssets: inspect metadata summaries for reasoning.

Operational rules:
- Prefer using tools instead of claiming work is done.
- After tool output, explain what changed in one sentence.
- If destructive operation is requested, ask for confirmation if missing.
- Match the user's language.
`.trim();

const formatContext = (context?: HubPromptContext) => {
  if (!context) {
    return "Runtime context: unavailable.";
  }

  const selectedAssets = (context.selectedAssets ?? [])
    .slice(0, 8)
    .map((asset) => `${asset.id} | ${asset.name} | tags=${(asset.tags ?? []).join(",") || "-"} | source=${asset.source ?? "imported"}`)
    .join("\n");

  return [
    "Runtime context:",
    `- total assets: ${context.assetCount ?? 0}`,
    `- selected assets: ${context.selectedAssetCount ?? 0}`,
    `- selected detail:`,
    selectedAssets ? selectedAssets : "none",
    `- active canvas: ${
      context.activeCanvas
        ? `${context.activeCanvas.name} (${context.activeCanvas.id}), elements=${context.activeCanvas.elementCount}, size=${context.activeCanvas.size.width}x${context.activeCanvas.size.height}`
        : "none"
    }`,
  ].join("\n");
};

export function buildHubPrompt(context?: HubPromptContext) {
  return `${baseHubPrompt}\n\n${formatContext(context)}`.trim();
}

export const HUB_SYSTEM_PROMPT = buildHubPrompt();

export const EDITOR_SYSTEM_PROMPT = `
You are FilmLab Editor Assistant.

When helping with editing:
- reason from current histogram summary and active adjustments
- respect available film presets and their tonal intent
- prioritize small, reversible parameter changes
- explain the visual intent behind each suggested adjustment
`.trim();
