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
  provider: z.enum(["openai", "stability"]).default("openai"),
  model: z.string().default("gpt-image-1"),
  size: z.string().default("1024x1024"),
});

export const applyPresetToAssetsToolSchema = z.object({
  presetId: z.string().min(1).describe("Preset ID to apply."),
  assetIds: z.array(z.string()).default([]),
  intensity: z.number().min(0).max(200).optional(),
});

export const tagAssetsToolSchema = z.object({
  action: z.enum(["add", "remove"]).default("add"),
  tags: z.array(z.string().min(1)).min(1),
  assetIds: z.array(z.string()).default([]),
});

export const deleteAssetsToolSchema = z.object({
  assetIds: z.array(z.string()).default([]),
  confirm: z.boolean().default(false),
});

export const addTextToCanvasToolSchema = z.object({
  content: z.string().min(1),
  documentId: z.string().optional(),
  x: z.number().optional(),
  y: z.number().optional(),
  fontSize: z.number().optional(),
  fontFamily: z.string().optional(),
  color: z.string().optional(),
});

export const exportCanvasToolSchema = z.object({
  format: z.enum(["png", "jpeg"]).default("png"),
  width: z.number().optional(),
  height: z.number().optional(),
  quality: z.number().min(0.1).max(1).optional(),
  pixelRatio: z.number().min(1).max(4).optional(),
  download: z.boolean().default(true),
});

export const describeAssetsToolSchema = z.object({
  assetIds: z.array(z.string()).default([]),
});
