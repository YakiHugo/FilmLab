import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ChevronLeft, Copy, Redo2, RefreshCcw, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useEditorState } from "../useEditorState";

interface EditorTopBarProps {
  returnStep: "library" | "style" | "export";
}

interface TopBarMessage {
  type: "success" | "error";
  text: string;
}

export function EditorTopBar({ returnStep }: EditorTopBarProps) {
  const {
    selectedAsset,
    presetLabel,
    showOriginal,
    copiedAdjustments,
    canUndo,
    canRedo,
    toggleOriginal,
    handleCopy,
    handlePaste,
    handleUndo,
    handleRedo,
    handleResetAll,
  } = useEditorState();

  const [message, setMessage] = useState<TopBarMessage | null>(null);
  const canPaste = Boolean(copiedAdjustments);

  useEffect(() => {
    if (!message) {
      return undefined;
    }
    const timer = window.setTimeout(() => {
      setMessage(null);
    }, 2200);
    return () => window.clearTimeout(timer);
  }, [message]);

  return (
    <header className="shrink-0 border-b border-white/10 bg-slate-950/85 px-3 py-2 backdrop-blur-sm lg:px-4 lg:py-2.5">
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2.5">
            <Button size="sm" variant="secondary" asChild className="gap-1.5">
              <Link to="/" search={{ step: returnStep }}>
                <ChevronLeft className="h-4 w-4" />
                返回工作台
              </Link>
            </Button>
            <div className="min-w-0">
              <p className="line-clamp-1 text-sm font-medium text-slate-100">
                {selectedAsset?.name ?? "未选择素材"}
              </p>
              <p className="line-clamp-1 text-xs text-slate-400">
                当前预设：{presetLabel ?? "未指定"}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                const undone = handleUndo();
                setMessage(
                  undone
                    ? { type: "success", text: "已撤销上一步。" }
                    : { type: "error", text: "没有可撤销的操作。" }
                );
              }}
              disabled={!selectedAsset || !canUndo}
              aria-label="撤销（Ctrl/Cmd + Z）"
              title="撤销（Ctrl/Cmd + Z）"
              className="gap-1.5"
            >
              <Undo2 className="h-4 w-4" />
              撤销
            </Button>

            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                const redone = handleRedo();
                setMessage(
                  redone
                    ? { type: "success", text: "已重做上一步。" }
                    : { type: "error", text: "没有可重做的操作。" }
                );
              }}
              disabled={!selectedAsset || !canRedo}
              aria-label="重做（Ctrl/Cmd + Shift + Z）"
              title="重做（Ctrl/Cmd + Shift + Z）"
              className="gap-1.5"
            >
              <Redo2 className="h-4 w-4" />
              重做
            </Button>

            <Button
              size="sm"
              variant={showOriginal ? "default" : "secondary"}
              onClick={toggleOriginal}
              disabled={!selectedAsset}
            >
              {showOriginal ? "查看调后" : "对比原图"}
            </Button>

            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                const copied = handleCopy();
                setMessage(
                  copied
                    ? { type: "success", text: "已复制当前设置。" }
                    : { type: "error", text: "复制失败，请先选择素材。" }
                );
              }}
              disabled={!selectedAsset}
              className="gap-1.5"
            >
              <Copy className="h-4 w-4" />
              复制设置
            </Button>

            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                if (!window.confirm("粘贴将覆盖当前照片参数，确认继续吗？")) {
                  return;
                }
                const pasted = handlePaste();
                setMessage(
                  pasted
                    ? { type: "success", text: "已粘贴到当前素材。" }
                    : { type: "error", text: "粘贴失败，剪贴板为空或未选择素材。" }
                );
              }}
              disabled={!selectedAsset || !canPaste}
            >
              粘贴设置
            </Button>

            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                if (!window.confirm("确认重置当前照片的全部参数吗？")) {
                  return;
                }
                const reset = handleResetAll();
                setMessage(
                  reset
                    ? { type: "success", text: "已重置当前照片参数。" }
                    : { type: "error", text: "重置失败，请先选择素材。" }
                );
              }}
              disabled={!selectedAsset}
              className="gap-1.5"
            >
              <RefreshCcw className="h-4 w-4" />
              重置
            </Button>
          </div>
        </div>

        {message && (
          <p
            role="status"
            aria-live="polite"
            className={cn(
              "rounded-lg border px-3 py-1.5 text-xs",
              message.type === "success"
                ? "border-emerald-300/30 bg-emerald-300/10 text-emerald-200"
                : "border-rose-300/30 bg-rose-300/10 text-rose-200"
            )}
          >
            {message.text}
          </p>
        )}
      </div>
    </header>
  );
}
