import type { ChatToolResult } from "./types";

interface ChatToolResultCardProps {
  result: ChatToolResult;
}

export function ChatToolResultCard({ result }: ChatToolResultCardProps) {
  return (
    <div
      className={[
        "rounded-xl border p-3 text-xs",
        result.ok
          ? "border-emerald-300/20 bg-emerald-300/10 text-emerald-100"
          : "border-rose-300/25 bg-rose-300/10 text-rose-100",
      ].join(" ")}
    >
      <p className="font-medium">
        Tool: {result.toolName} ({result.ok ? "success" : "failed"})
      </p>
      {result.error && <p className="mt-1 text-[11px]">{result.error}</p>}
      <pre className="mt-2 overflow-x-auto rounded-lg bg-black/35 p-2 text-[11px]">
        {JSON.stringify(result.args, null, 2)}
      </pre>
    </div>
  );
}
