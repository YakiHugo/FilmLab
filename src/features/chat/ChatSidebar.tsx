import { ChevronLeft, ChevronRight, MessageSquarePlus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ChatConversation } from "@/types";

interface ChatSidebarProps {
  conversations: ChatConversation[];
  activeConversationId: string | null;
  collapsed: boolean;
  onToggle: () => void;
  onSelect: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
}

export function ChatSidebar({
  conversations,
  activeConversationId,
  collapsed,
  onToggle,
  onSelect,
  onNew,
  onDelete,
}: ChatSidebarProps) {
  return (
    <aside
      className={[
        "flex h-[calc(100dvh-96px)] flex-col rounded-2xl border border-white/10 bg-[#0d1016]/85 backdrop-blur transition-[width] duration-300",
        collapsed ? "w-[84px]" : "w-[300px]",
      ].join(" ")}
    >
      <div className="flex items-center gap-2 border-b border-white/10 p-2.5">
        <button
          type="button"
          className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 text-zinc-300 transition hover:border-white/25 hover:bg-white/5 hover:text-white"
          onClick={onToggle}
          aria-label={collapsed ? "Expand history panel" : "Collapse history panel"}
        >
          {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
        </button>

        {collapsed ? (
          <button
            type="button"
            className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-amber-300/40 bg-amber-300/10 text-amber-100 transition hover:bg-amber-300/20"
            onClick={onNew}
            aria-label="New chat"
          >
            <MessageSquarePlus className="h-4 w-4" />
          </button>
        ) : (
          <Button
            onClick={onNew}
            className="h-9 flex-1 rounded-xl bg-amber-400 text-black hover:bg-amber-300"
          >
            <MessageSquarePlus className="mr-1.5 h-4 w-4" />
            新建会话
          </Button>
        )}
      </div>

      <div className="min-h-0 flex-1 space-y-1 overflow-y-auto p-2">
        {conversations.map((conversation, index) =>
          collapsed ? (
            <button
              key={conversation.id}
              type="button"
              onClick={() => onSelect(conversation.id)}
              title={conversation.title}
              className={[
                "flex h-10 w-full items-center justify-center rounded-xl border text-xs font-medium transition",
                conversation.id === activeConversationId
                  ? "border-amber-300/60 bg-amber-300/15 text-amber-100"
                  : "border-white/10 text-zinc-400 hover:border-white/25 hover:text-zinc-200",
              ].join(" ")}
            >
              {index + 1}
            </button>
          ) : (
            <article
              key={conversation.id}
              className={[
                "group rounded-xl border px-3 py-2 text-left text-xs transition",
                conversation.id === activeConversationId
                  ? "border-amber-400/40 bg-amber-400/10 text-zinc-100"
                  : "border-white/5 bg-white/[0.02] text-zinc-300 hover:border-white/15",
              ].join(" ")}
            >
              <button
                type="button"
                className="w-full text-left"
                onClick={() => onSelect(conversation.id)}
              >
                <p className="truncate font-medium">{conversation.title}</p>
                <p className="mt-1 text-[11px] text-zinc-500">
                  {new Date(conversation.updatedAt).toLocaleString()}
                </p>
              </button>
              <button
                type="button"
                className="mt-2 inline-flex items-center gap-1 text-[11px] text-zinc-500 opacity-0 transition group-hover:opacity-100 hover:text-rose-300"
                onClick={() => {
                  void onDelete(conversation.id);
                }}
              >
                <Trash2 className="h-3 w-3" />
                删除
              </button>
            </article>
          )
        )}
      </div>
    </aside>
  );
}
