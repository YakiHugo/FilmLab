import { describe, it, expect } from "vitest";
import { estimateTokens, estimateMessagesTokens } from "./tokenEstimate";

describe("estimateTokens", () => {
  it("returns 1 for empty string", () => {
    expect(estimateTokens("")).toBe(1);
  });

  it("estimates short text", () => {
    // "hello" = 5 chars → ceil(5/4) = 2
    expect(estimateTokens("hello")).toBe(2);
  });

  it("estimates longer text", () => {
    const text = "The quick brown fox jumps over the lazy dog"; // 43 chars
    expect(estimateTokens(text)).toBe(Math.ceil(43 / 4));
  });
});

describe("estimateMessagesTokens", () => {
  it("counts overhead per message", () => {
    const result = estimateMessagesTokens([
      { role: "user", content: "" },
    ]);
    // 4 overhead + 1 (min for empty string)
    expect(result).toBe(5);
  });

  it("handles string content", () => {
    const result = estimateMessagesTokens([
      { role: "user", content: "hello world" }, // 11 chars → ceil(11/4)=3
    ]);
    expect(result).toBe(4 + 3);
  });

  it("handles multipart content with text and image", () => {
    const result = estimateMessagesTokens([
      {
        role: "user",
        content: [
          { type: "text", text: "describe this" }, // 13 chars → ceil(13/4)=4
          { type: "image", image: "data:..." },     // 85 tokens
        ],
      },
    ]);
    expect(result).toBe(4 + 4 + 85);
  });

  it("sums across multiple messages", () => {
    const result = estimateMessagesTokens([
      { role: "system", content: "You are helpful." }, // 4 + ceil(16/4)=4 = 8
      { role: "user", content: "Hi" },                 // 4 + ceil(2/4)=1 = 5
    ]);
    expect(result).toBe(8 + 5);
  });
});
