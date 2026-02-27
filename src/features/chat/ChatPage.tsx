import { ChatInput } from "./ChatInput";
import { ChatSidebar } from "./ChatSidebar";
import { ChatThread } from "./ChatThread";
import { ImageGenerationCard } from "./ImageGenerationCard";
import { useChatSession } from "./hooks/useChatSession";
import { useImageGeneration } from "./hooks/useImageGeneration";

export function ChatPage() {
  const {
    messages,
    isLoading,
    conversations,
    activeConversationId,
    setActiveConversationId,
    sendUserMessage,
    newConversation,
    removeConversation,
    toolResults,
  } = useChatSession();
  const imageGeneration = useImageGeneration();

  return (
    <div className="grid h-[calc(100dvh-96px)] gap-4 lg:grid-cols-[280px_minmax(0,1fr)_280px]">
      <div className="hidden lg:block">
        <ChatSidebar
          conversations={conversations}
          activeConversationId={activeConversationId}
          onSelect={setActiveConversationId}
          onNew={() => {
            void newConversation();
          }}
          onDelete={(id) => {
            void removeConversation(id);
          }}
        />
      </div>

      <section className="flex min-h-0 flex-col rounded-2xl border border-white/10 bg-black/30">
        <ChatThread messages={messages} toolResults={toolResults} />
        <ChatInput isLoading={isLoading} onSend={sendUserMessage} />
      </section>

      <aside className="hidden rounded-2xl border border-white/10 bg-black/35 p-3 lg:block">
        <ImageGenerationCard
          status={imageGeneration.status}
          imageUrl={imageGeneration.imageUrl}
          error={imageGeneration.error}
        />
      </aside>
    </div>
  );
}
