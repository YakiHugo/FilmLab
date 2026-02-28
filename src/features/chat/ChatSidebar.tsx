import { Button } from "@/components/ui/button";
import type { ChatConversation } from "@/types";

interface ChatSidebarProps {
  conversations: ChatConversation[];
  activeConversationId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
}

export function ChatSidebar({
  conversations,
  activeConversationId,
  onSelect,
  onNew,
  onDelete,
}: ChatSidebarProps) {
  return (
    <aside className="flex h-[calc(100dvh-96px)] w-full flex-col rounded-2xl border border-white/10 bg-black/35">
      <div className="border-b border-white/10 p-3">
        <Button onClick={onNew} className="w-full rounded-xl bg-sky-400 text-black hover:bg-sky-300">
          New Chat
        </Button>
      </div>
      <div className="min-h-0 flex-1 space-y-1 overflow-y-auto p-2">
        {conversations.map((conversation) => (
          <div
            key={conversation.id}
            className={[
              "group rounded-xl border px-3 py-2 text-left text-xs transition",
              conversation.id === activeConversationId
                ? "border-sky-400/40 bg-sky-400/10 text-zinc-100"
                : "border-white/5 bg-white/[0.02] text-zinc-300 hover:border-white/15",
            ].join(" ")}
          >
            <button type="button" className="w-full text-left" onClick={() => onSelect(conversation.id)}>
              <p className="truncate font-medium">{conversation.title}</p>
              <p className="mt-1 text-[11px] text-zinc-500">{new Date(conversation.updatedAt).toLocaleString()}</p>
            </button>
            <button
              type="button"
              className="mt-2 text-[11px] text-zinc-500 opacity-0 transition group-hover:opacity-100 hover:text-rose-300"
              onClick={() => {
                void onDelete(conversation.id);
              }}
            >
              Delete
            </button>
          </div>
        ))}
      </div>
    </aside>
  );
}
