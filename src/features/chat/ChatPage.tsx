import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AVAILABLE_MODELS } from "@/lib/ai/provider";
import { ChatInput } from "./ChatInput";
import { ChatSidebar } from "./ChatSidebar";
import { ChatThread } from "./ChatThread";
import { ImageGenerationCard } from "./ImageGenerationCard";
import { useChatSession } from "./hooks/useChatSession";
import { useImageGeneration } from "./hooks/useImageGeneration";

export function ChatPage() {
  const {
    messages,
    status,
    isLoading,
    error,
    stop,
    retryLast,
    conversations,
    activeConversationId,
    setActiveConversationId,
    sendUserMessage,
    newConversation,
    removeConversation,
    selectedModel,
    setSelectedModel,
    toolResults,
  } = useChatSession();
  const imageGeneration = useImageGeneration();

  return (
    <div className="grid h-[calc(100dvh-96px)] gap-4 lg:grid-cols-[280px_minmax(0,1fr)_300px]">
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
        <div className="flex items-center justify-between border-b border-white/10 px-3 py-2">
          <p className="text-xs uppercase tracking-[0.2em] text-zinc-500">Hub Chat</p>
          <Select
            value={`${selectedModel.provider}:${selectedModel.id}`}
            onValueChange={(value) => {
              setSelectedModel(value);
            }}
          >
            <SelectTrigger className="h-8 w-[220px] rounded-lg text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {AVAILABLE_MODELS.map((model) => (
                <SelectItem key={`${model.provider}:${model.id}`} value={`${model.provider}:${model.id}`}>
                  {model.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <ChatThread
          messages={messages}
          status={status}
          error={error}
          onRetry={retryLast}
          toolResults={toolResults}
        />

        <ChatInput
          isLoading={isLoading}
          onSend={sendUserMessage}
          onStop={stop}
        />
      </section>

      <aside className="hidden rounded-2xl border border-white/10 bg-black/35 p-3 lg:block">
        <ImageGenerationCard
          prompt={imageGeneration.prompt}
          provider={imageGeneration.provider}
          model={imageGeneration.model}
          size={imageGeneration.size}
          status={imageGeneration.status}
          imageUrl={imageGeneration.imageUrl}
          error={imageGeneration.error}
          onPromptChange={imageGeneration.setPrompt}
          onProviderChange={imageGeneration.setProvider}
          onModelChange={imageGeneration.setModel}
          onSizeChange={imageGeneration.setSize}
          onGenerate={() => {
            void imageGeneration.generate();
          }}
          onAddToCanvas={() => {
            void imageGeneration.addToCanvas();
          }}
        />
      </aside>
    </div>
  );
}
