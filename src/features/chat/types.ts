export interface ChatToolResult {
  toolName: string;
  success: boolean;
  args?: Record<string, unknown>;
  data?: Record<string, unknown>;
  error?: string;
  toolCallId?: string;
  source?: "client-dispatch" | "message-inline";
}
