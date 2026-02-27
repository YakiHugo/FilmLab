import type { UIMessage } from "ai";

export type ChatScope = "hub" | "editor";

export interface ChatConversation {
  id: string;
  title: string;
  scope: ChatScope;
  messages: UIMessage[];
  model: string;
  provider: string;
  createdAt: string;
  updatedAt: string;
}
