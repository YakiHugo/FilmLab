import { z } from "zod";

export const selectAssetsToolSchema = z.object({
  query: z.string().min(1).describe("Natural-language condition for matching assets."),
  limit: z.number().int().min(1).max(50).default(12),
});

export const openInEditorToolSchema = z.object({
  assetId: z.string().min(1).describe("Asset ID to open in editor."),
});

export const createCanvasToolSchema = z.object({
  name: z.string().min(1).default("Untitled board"),
  assetIds: z.array(z.string()).max(20).default([]),
});

export const generateImageToolSchema = z.object({
  prompt: z.string().min(1),
  style: z.string().optional(),
});
