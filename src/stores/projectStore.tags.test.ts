import { describe, expect, it } from "vitest";
import { MAX_TAGS_PER_ASSET, mergeTags, normalizeTags, removeTags } from "./project/tagging";

describe("project tag rules", () => {
  it("normalizes and deduplicates tags case-insensitively", () => {
    const tags = normalizeTags(["  Portrait ", "portrait", "Night  Shot", "night shot"]);
    expect(tags).toEqual(["Portrait", "Night Shot"]);
  });

  it("limits tags to max per asset", () => {
    const source = Array.from({ length: MAX_TAGS_PER_ASSET + 5 }, (_, index) => `tag-${index}`);
    const tags = normalizeTags(source);
    expect(tags).toHaveLength(MAX_TAGS_PER_ASSET);
    expect(tags[0]).toBe("tag-0");
    expect(tags[MAX_TAGS_PER_ASSET - 1]).toBe(`tag-${MAX_TAGS_PER_ASSET - 1}`);
  });

  it("merges tags with dedupe and cap", () => {
    const current = ["Portrait", "Travel"];
    const incoming = ["travel", "Film", "Street"];
    const merged = mergeTags(current, incoming);
    expect(merged).toEqual(["Portrait", "Travel", "Film", "Street"]);
  });

  it("removes tags case-insensitively", () => {
    const current = ["Portrait", "Travel", "Street"];
    const next = removeTags(current, ["travel", "unknown"]);
    expect(next).toEqual(["Portrait", "Street"]);
  });
});

