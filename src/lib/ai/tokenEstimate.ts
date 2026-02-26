/**
 * Lightweight token estimation for UI display purposes.
 *
 * Uses the ~4 chars/token heuristic for English text.
 * Not meant to be billing-accurate — just a rough gauge for the user.
 */

const CHARS_PER_TOKEN = 4;

/** Estimate token count from a plain text string. */
export const estimateTokens = (text: string): number =>
  Math.max(1, Math.ceil(text.length / CHARS_PER_TOKEN));

/** Estimate tokens for an array of chat messages (role + content). */
export const estimateMessagesTokens = (
  messages: Array<{ role: string; content: unknown }>
): number => {
  let total = 0;
  for (const msg of messages) {
    // ~4 tokens overhead per message (role, delimiters)
    total += 4;
    if (typeof msg.content === "string") {
      total += estimateTokens(msg.content);
    } else if (Array.isArray(msg.content)) {
      for (const part of msg.content) {
        if (part && typeof part === "object" && "text" in part && typeof part.text === "string") {
          total += estimateTokens(part.text);
        }
        // Images: rough fixed estimate (~85 tokens for a low-detail image)
        if (part && typeof part === "object" && "type" in part && part.type === "image") {
          total += 85;
        }
      }
    }
  }
  return total;
};
