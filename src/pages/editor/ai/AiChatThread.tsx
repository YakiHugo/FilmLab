import { memo, useEffect, useRef } from "react";
import type { UIMessage } from "ai";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Bot, User } from "lucide-react";
import type { AiPendingResult } from "./useAiEditSession";
import { AiResultCard } from "./AiResultCard";

interface AiChatThreadProps {
  messages: UIMessage[];
  isLoading: boolean;
  pendingResult: AiPendingResult | null;
  isPreviewActive: boolean;
  onApply: () => void;
  onPreview: () => void;
  onRevert: () => void;
  onDismiss: () => void;
}

export const AiChatThread = memo(function AiChatThread({
  messages,
  isLoading,
  pendingResult,
  isPreviewActive,
  onApply,
  onPreview,
  onRevert,
  onDismiss,
}: AiChatThreadProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages, pendingResult]);

  if (messages.length === 0 && !isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center p-4">
        <div className="text-center text-xs text-slate-500">
          <Bot className="mx-auto mb-2 h-8 w-8 text-slate-600" />
          <p>选择一个风格标签，或描述你想要的效果</p>
          <p className="mt-1">也可以添加参考图进行追色</p>
        </div>
      </div>
    );
  }

  return (
    <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto p-2">
      {messages.map((msg) => (
        <MessageBubble key={msg.id} message={msg} />
      ))}

      {isLoading && messages.length > 0 && (
        <div className="flex items-center gap-2 px-2 py-1">
          <div className="flex gap-1">
            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-blue-400 [animation-delay:0ms]" />
            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-blue-400 [animation-delay:150ms]" />
            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-blue-400 [animation-delay:300ms]" />
          </div>
        </div>
      )}

      {pendingResult && (
        <AiResultCard
          result={pendingResult}
          isPreviewActive={isPreviewActive}
          onApply={onApply}
          onPreview={onPreview}
          onRevert={onRevert}
          onDismiss={onDismiss}
        />
      )}
    </div>
  );
});

const MessageBubble = memo(function MessageBubble({ message }: { message: UIMessage }) {
  const isUser = message.role === "user";

  // Extract text content from parts
  const textContent = message.parts
    ?.filter((p): p is { type: "text"; text: string } => p.type === "text")
    .map((p) => p.text)
    .join("") ?? "";

  // Skip empty assistant messages (tool-only)
  if (!isUser && !textContent) {
    return null;
  }

  return (
    <div className={`flex gap-2 ${isUser ? "flex-row-reverse" : ""}`}>
      <div
        className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${
          isUser ? "bg-slate-700" : "bg-blue-600/30"
        }`}
      >
        {isUser ? (
          <User className="h-3.5 w-3.5 text-slate-300" />
        ) : (
          <Bot className="h-3.5 w-3.5 text-blue-300" />
        )}
      </div>
      <div
        className={`max-w-[85%] rounded-xl px-3 py-2 text-sm ${
          isUser
            ? "bg-blue-600/20 text-slate-200"
            : "bg-white/5 text-slate-300"
        }`}
      >
        {isUser ? (
          <p className="whitespace-pre-wrap">{textContent}</p>
        ) : (
          <div className="ai-markdown prose prose-invert prose-sm max-w-none prose-p:my-1 prose-ul:my-1 prose-li:my-0.5">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {textContent}
            </ReactMarkdown>
          </div>
        )}
      </div>
    </div>
  );
});
