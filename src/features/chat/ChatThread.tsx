import type { UIMessage } from "ai";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ChatToolResultCard } from "./ChatToolResultCard";
import type { ChatToolResult } from "./types";

interface ChatThreadProps {
  messages: UIMessage[];
  toolResults: ChatToolResult[];
}

const getMessageText = (message: UIMessage) =>
  message.parts
    ?.filter((part): part is { type: "text"; text: string } => part.type === "text")
    .map((part) => part.text)
    .join("")
    .trim() || "";

export function ChatThread({ messages, toolResults }: ChatThreadProps) {
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-4">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
        {messages.length === 0 && (
          <div className="rounded-2xl border border-white/10 bg-black/35 p-6 text-sm text-zinc-300">
            Ask for a shot list, tone direction, or batch edit command. Example:
            <p className="mt-2 text-zinc-500">"Select the warm portraits from yesterday and open the hero frame in editor."</p>
          </div>
        )}

        {toolResults.slice(0, 3).map((result, index) => (
          <ChatToolResultCard key={`${result.toolName}-${index}`} result={result} />
        ))}

        {messages.map((message) => {
          const text = getMessageText(message);
          if (!text) {
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
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>
            </article>
          );
        })}
      </div>
    </div>
  );
}
