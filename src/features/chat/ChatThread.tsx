import type { UIMessage } from "ai";
import { useEffect, useMemo, useRef } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Button } from "@/components/ui/button";
import { ChatToolResultCard } from "./ChatToolResultCard";
import type { ChatToolResult } from "./types";

interface ChatThreadProps {
  messages: UIMessage[];
  status: string;
  error: Error | undefined;
  onRetry: () => void;
  toolResults: ChatToolResult[];
}

const getMessageText = (message: UIMessage) =>
  message.parts
    ?.filter((part): part is { type: "text"; text: string } => part.type === "text")
    .map((part) => part.text)
    .join("")
    .trim() || "";

const toInlineToolResult = (part: Record<string, unknown>): ChatToolResult | null => {
  const type = typeof part.type === "string" ? part.type : "";
  if (!type || (!type.startsWith("tool-") && type !== "dynamic-tool")) {
    return null;
  }

  const toolName =
    type === "dynamic-tool"
      ? typeof part.toolName === "string"
        ? part.toolName
        : "dynamic-tool"
      : type.slice(5);

  const state = typeof part.state === "string" ? part.state : "";
  const success = state === "output-available";
  const input = part.input && typeof part.input === "object" ? (part.input as Record<string, unknown>) : undefined;
  const output = part.output && typeof part.output === "object" ? (part.output as Record<string, unknown>) : undefined;
  const error = typeof part.errorText === "string" ? part.errorText : undefined;
  const toolCallId = typeof part.toolCallId === "string" ? part.toolCallId : undefined;

  return {
    toolName,
    success,
    args: input,
    data: output,
    error,
    toolCallId,
    source: "message-inline",
  };
};

export function ChatThread({ messages, status, error, onRetry, toolResults }: ChatThreadProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  const fallbackRecentResults = useMemo(() => toolResults.slice(0, 3), [toolResults]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length, status]);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-4">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
        {messages.length === 0 && (
          <div className="rounded-2xl border border-white/10 bg-black/35 p-6 text-sm text-zinc-300">
            Ask for a shot list, tone direction, or batch edit command. Example:
            <p className="mt-2 text-zinc-500">"Select the warm portraits from yesterday and open the hero frame in editor."</p>
          </div>
        )}

        {messages.map((message) => {
          const text = getMessageText(message);
          const inlineToolResults = (message.parts ?? [])
            .map((part) => toInlineToolResult(part as Record<string, unknown>))
            .filter((part): part is ChatToolResult => Boolean(part))
            .slice(-4);

          if (!text && inlineToolResults.length === 0) {
            return null;
          }

          const isUser = message.role === "user";
          return (
            <article
              key={message.id}
              className={[
                "max-w-[92%] rounded-2xl border p-3 text-sm leading-6",
                isUser
                  ? "ml-auto border-sky-400/30 bg-sky-400/10 text-zinc-100"
                  : "border-white/10 bg-black/40 text-zinc-200",
              ].join(" ")}
            >
              {text && <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>}
              {inlineToolResults.length > 0 && (
                <div className="mt-3 space-y-2">
                  {inlineToolResults.map((result, index) => (
                    <ChatToolResultCard
                      key={`${message.id}-${result.toolCallId ?? result.toolName}-${index}`}
                      result={result}
                    />
                  ))}
                </div>
              )}
            </article>
          );
        })}

        {fallbackRecentResults.length > 0 && messages.length === 0 && (
          <div className="space-y-2">
            {fallbackRecentResults.map((result, index) => (
              <ChatToolResultCard key={`${result.toolName}-${index}`} result={result} />
            ))}
          </div>
        )}

        {(status === "streaming" || status === "submitted") && (
          <div className="inline-flex w-fit items-center gap-2 rounded-full border border-white/10 bg-black/40 px-3 py-1.5 text-[11px] text-zinc-400">
            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-sky-300 [animation-delay:-0.2s]" />
            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-sky-300 [animation-delay:-0.1s]" />
            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-sky-300" />
            Thinking
          </div>
        )}

        {error && (
          <div className="rounded-xl border border-rose-300/30 bg-rose-400/10 p-3 text-xs text-rose-100">
            <p className="font-medium">Generation failed</p>
            <p className="mt-1 text-rose-100/80">{error.message}</p>
            <Button
              size="sm"
              variant="secondary"
              className="mt-2 h-8 rounded-lg border border-rose-200/20 bg-rose-200/10 text-rose-100 hover:bg-rose-200/20"
              onClick={onRetry}
            >
              Retry
            </Button>
          </div>
        )}

        <div ref={bottomRef} />
      </div>
    </div>
  );
}
