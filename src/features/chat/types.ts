export interface ChatToolResult {
  toolName: string;
  ok: boolean;
  args: Record<string, unknown>;
  error?: string;
}
