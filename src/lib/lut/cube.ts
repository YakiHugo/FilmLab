import { hashString } from "@/lib/film/utils";
import type { LutAsset } from "@/types";
import type { ParsedCubeLut } from "./types";

const isCommentLine = (line: string) => line.startsWith("#");

const parseVector = (parts: string[], keyword: string) => {
  if (parts.length !== 4) {
    throw new Error(`${keyword} must have exactly 3 numeric values.`);
  }
  const values = parts.slice(1).map((value) => Number(value));
  if (values.some((value) => Number.isNaN(value))) {
    throw new Error(`${keyword} contains invalid numeric values.`);
  }
  return values as [number, number, number];
};

export const parseCubeLut = (rawText: string): ParsedCubeLut => {
  const lines = rawText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !isCommentLine(line));

  let title: string | undefined;
  let size: number | undefined;
  let domainMin: [number, number, number] = [0, 0, 0];
  let domainMax: [number, number, number] = [1, 1, 1];
  const samples: number[] = [];

  lines.forEach((line) => {
    const parts = line.split(/\s+/);
    const keyword = parts[0]?.toUpperCase();
    if (!keyword) {
      return;
    }

    if (keyword === "TITLE") {
      title = line.replace(/^TITLE\s+/i, "").replace(/^"|"$/g, "");
      return;
    }
    if (keyword === "LUT_3D_SIZE") {
      if (parts.length !== 2) {
        throw new Error("LUT_3D_SIZE must contain one numeric value.");
      }
      const parsedSize = Number(parts[1]);
      if (!Number.isInteger(parsedSize) || parsedSize < 2 || parsedSize > 128) {
        throw new Error("LUT_3D_SIZE must be an integer between 2 and 128.");
      }
      size = parsedSize;
      return;
    }
    if (keyword === "DOMAIN_MIN") {
      domainMin = parseVector(parts, keyword);
      return;
    }
    if (keyword === "DOMAIN_MAX") {
      domainMax = parseVector(parts, keyword);
      return;
    }

    const values = parts.map((value) => Number(value));
    if (values.length !== 3 || values.some((value) => Number.isNaN(value))) {
      throw new Error(`Invalid LUT sample row: "${line}"`);
    }
    samples.push(values[0], values[1], values[2]);
  });

  if (!size) {
    throw new Error("Missing LUT_3D_SIZE in .cube file.");
  }

  const expectedSamples = size * size * size * 3;
  if (samples.length !== expectedSamples) {
    throw new Error(
      `Invalid sample count: expected ${expectedSamples / 3}, received ${samples.length / 3}.`
    );
  }

  return {
    title,
    size,
    domainMin,
    domainMax,
    data: new Float32Array(samples),
  };
};

export const parseCubeLutFile = async (file: File): Promise<LutAsset> => {
  const rawText = await file.text();
  const parsed = parseCubeLut(rawText);
  const seed = hashString(`${file.name}:${file.size}:${parsed.size}:${parsed.title ?? ""}`);
  return {
    id: `lut-${seed.toString(16)}`,
    name: parsed.title || file.name.replace(/\.cube$/i, ""),
    format: "cube",
    size: parsed.size,
    data: parsed.data,
    source: "imported",
    createdAt: new Date().toISOString(),
  };
};

