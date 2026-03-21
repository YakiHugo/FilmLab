import { Link, useNavigate } from "@tanstack/react-router";
import { CirclePlus, Images, PanelsTopLeft, PencilLine, Trash2, Wand2 } from "lucide-react";
import { shallow } from "zustand/shallow";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useCanvasStore } from "@/stores/canvasStore";
import { getStudioCanvasPreset } from "./studioPresets";

const formatUpdatedAt = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "刚刚";
  }
  return new Intl.DateTimeFormat("zh-CN", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
};

export function CanvasWorkbenchPanel() {
  const navigate = useNavigate();
  const workbenches = useCanvasStore((state) => state.workbenches);
  const activeWorkbenchId = useCanvasStore((state) => state.activeWorkbenchId);
  const activeWorkbenchMeta = useCanvasStore(
    (state) => {
      const workbench = state.workbenches.find((entry) => entry.id === state.activeWorkbenchId);
      return {
        id: workbench?.id ?? null,
        name: workbench?.name ?? "",
        presetId: workbench?.presetId ?? "custom",
        width: workbench?.width ?? 0,
        height: workbench?.height ?? 0,
        updatedAt: workbench?.updatedAt ?? "",
      };
    },
    shallow
  );
  const createWorkbench = useCanvasStore((state) => state.createWorkbench);
  const deleteWorkbench = useCanvasStore((state) => state.deleteWorkbench);
  const upsertWorkbench = useCanvasStore((state) => state.upsertWorkbench);

  const workbenchCount = workbenches.length;

  const handleCreateWorkbench = async () => {
    const nextIndex = workbenches.length + 1;
    const created = await createWorkbench(`\u5de5\u4f5c\u53f0 ${String(nextIndex).padStart(2, "0")}`, {
      activate: false,
    });
    await navigate({
      to: "/canvas/$workbenchId",
      params: { workbenchId: created.id },
    });
  };

  const handleSelectWorkbench = (workbenchId: string) => {
    if (workbenchId === activeWorkbenchId) {
      return;
    }

    void navigate({
      to: "/canvas/$workbenchId",
      params: { workbenchId },
    });
  };

  const handleDeleteWorkbench = async () => {
    if (!activeWorkbenchId) {
      return;
    }
    await deleteWorkbench(activeWorkbenchId, { nextActiveWorkbenchId: null });
  };

  return (
    <div className="flex min-h-0 flex-col gap-3 p-4">
      <section className="rounded-[24px] border border-white/10 bg-white/[0.035] p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-2">
            <p className="text-[11px] uppercase tracking-[0.28em] text-stone-500">
              {`\u5de5\u4f5c\u53f0\u753b\u5e03`}
            </p>
            <div className="space-y-1">
              <h2 className="font-['Syne'] text-2xl text-stone-100">
                {`\u56f4\u7ed5\u5f53\u524d\u5de5\u4f5c\u53f0\u7ec4\u7ec7\u521b\u4f5c\u3002`}
              </h2>
              <p className="text-sm leading-6 text-stone-400">
                {`\u7d20\u6750\u5e93\u63d0\u4f9b\u539f\u59cb\u7d20\u6750\uff0c\u56fe\u50cf\u8c03\u6574\u6302\u5728\u5df2\u653e\u7f6e\u5143\u7d20\u4e0a\uff0cAI \u7ed3\u679c\u4e5f\u76f4\u63a5\u843d\u5230\u5f53\u524d\u5de5\u4f5c\u53f0\u3002`}
              </p>
            </div>
          </div>
          <span className="rounded-full border border-amber-300/20 bg-amber-200/10 px-2.5 py-1 text-[10px] uppercase tracking-[0.24em] text-amber-100/80">
            V1
          </span>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
          <div className="rounded-2xl border border-white/10 bg-black/25 px-3 py-3">
            <p className="text-[10px] uppercase tracking-[0.22em] text-stone-500">
              {`\u5de5\u4f5c\u53f0\u6570\u91cf`}
            </p>
            <p className="mt-2 text-lg font-semibold text-stone-100">{workbenchCount || 1}</p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-black/25 px-3 py-3">
            <p className="text-[10px] uppercase tracking-[0.22em] text-stone-500">
              {`\u5f53\u524d\u6bd4\u4f8b`}
            </p>
            <p className="mt-2 text-lg font-semibold text-stone-100">
              {activeWorkbenchMeta.id
                ? getStudioCanvasPreset(activeWorkbenchMeta.presetId).shortLabel
                : "4:5"}
            </p>
          </div>
        </div>
      </section>

      <section className="rounded-[24px] border border-white/10 bg-black/25 p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[11px] uppercase tracking-[0.28em] text-zinc-500">
              {`\u5f53\u524d\u5de5\u4f5c\u53f0`}
            </p>
            <h3 className="mt-1 font-['Syne'] text-lg text-zinc-100">
              {`\u540d\u79f0\u4e0e\u4ea4\u4ed8\u4fe1\u606f`}
            </h3>
          </div>
          <PencilLine className="h-4 w-4 text-zinc-500" />
        </div>

        {activeWorkbenchMeta.id ? (
          <div className="mt-4 space-y-3">
            <Input
              value={activeWorkbenchMeta.name}
              onChange={(event) => {
                const currentWorkbench = useCanvasStore
                  .getState()
                  .workbenches.find((entry) => entry.id === activeWorkbenchMeta.id);
                if (!currentWorkbench) {
                  return;
                }

                void upsertWorkbench({
                  ...currentWorkbench,
                  name: event.target.value || "\u672a\u547d\u540d\u5de5\u4f5c\u53f0",
                });
              }}
              className="h-10 rounded-2xl border-white/10 bg-black/35 text-sm text-zinc-100"
            />

            <div className="grid grid-cols-2 gap-2 text-xs text-stone-300">
              <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-3 py-3">
                <p className="text-[10px] uppercase tracking-[0.22em] text-zinc-500">
                  {`\u753b\u5e03\u5c3a\u5bf8`}
                </p>
                <p className="mt-2 font-medium text-zinc-100">
                  {activeWorkbenchMeta.width} x {activeWorkbenchMeta.height}
                </p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-3 py-3">
                <p className="text-[10px] uppercase tracking-[0.22em] text-zinc-500">
                  {`\u6700\u8fd1\u66f4\u65b0`}
                </p>
                <p className="mt-2 font-medium text-zinc-100">
                  {formatUpdatedAt(activeWorkbenchMeta.updatedAt)}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <Button size="sm" variant="secondary" className="rounded-2xl" asChild>
                <Link to="/library">
                  <Images className="mr-2 h-4 w-4" />
                  {`\u6253\u5f00\u7d20\u6750\u5e93`}
                </Link>
              </Button>
              <Button size="sm" variant="secondary" className="rounded-2xl" asChild>
                <Link to="/assist">
                  <Wand2 className="mr-2 h-4 w-4" />
                  {`\u6253\u5f00 AI \u5de5\u5177`}
                </Link>
              </Button>
            </div>
          </div>
        ) : (
          <p className="mt-4 text-sm text-zinc-500">
            {`\u5148\u521b\u5efa\u4e00\u4e2a\u5de5\u4f5c\u53f0\uff0c\u518d\u5f00\u59cb\u7ec4\u7ec7\u753b\u5e03\u5185\u5bb9\u3002`}
          </p>
        )}
      </section>

      <section className="flex min-h-0 flex-1 flex-col rounded-[24px] border border-white/10 bg-black/25 p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[11px] uppercase tracking-[0.28em] text-zinc-500">
              {`\u5de5\u4f5c\u53f0\u5217\u8868`}
            </p>
            <h3 className="mt-1 font-['Syne'] text-lg text-zinc-100">
              {`\u5207\u6362\u5f53\u524d\u7f16\u8f91\u4e0a\u4e0b\u6587\u3002`}
            </h3>
          </div>
          <PanelsTopLeft className="h-4 w-4 text-zinc-500" />
        </div>

        <div className="mt-4 flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto pr-1">
          {workbenches.map((workbench, index) => {
            const preset = getStudioCanvasPreset(workbench.presetId);
            const active = workbench.id === activeWorkbenchId;
            return (
              <button
                key={workbench.id}
                type="button"
                onClick={() => handleSelectWorkbench(workbench.id)}
                className={cn(
                  "rounded-[22px] border px-3 py-3 text-left transition",
                  active
                    ? "border-amber-300/30 bg-amber-200/10"
                    : "border-white/10 bg-white/[0.03] hover:bg-white/[0.06]"
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-zinc-100">
                      {workbench.name || `\u5de5\u4f5c\u53f0 ${String(index + 1).padStart(2, "0")}`}
                    </p>
                    <p className="mt-1 text-xs text-zinc-500">
                      {preset.shortLabel} · {workbench.elements.length} {`\u4e2a\u5143\u7d20`}
                    </p>
                  </div>
                  <span className="rounded-full border border-white/10 px-2 py-1 text-[10px] tracking-[0.24em] text-zinc-400">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                </div>
              </button>
            );
          })}

          {workbenches.length === 0 ? (
            <div className="rounded-[22px] border border-dashed border-white/10 bg-white/[0.02] px-3 py-4 text-sm text-zinc-500">
              {`\u8fd8\u6ca1\u6709\u5de5\u4f5c\u53f0\u3002\u5148\u65b0\u5efa\u4e00\u4e2a\u7ad6\u7248\u5de5\u4f5c\u53f0\uff0c\u518d\u5f00\u59cb\u6269\u5c55\u5185\u5bb9\u3002`}
            </div>
          ) : null}
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2">
          <Button size="sm" className="rounded-2xl" onClick={() => void handleCreateWorkbench()}>
            <CirclePlus className="mr-2 h-4 w-4" />
            {`\u65b0\u5efa\u5de5\u4f5c\u53f0`}
          </Button>
          <Button
            size="sm"
            variant="secondary"
            className="rounded-2xl text-rose-200 hover:text-rose-100"
            disabled={!activeWorkbenchMeta.id || workbenches.length <= 1}
            onClick={() => void handleDeleteWorkbench()}
          >
            <Trash2 className="mr-2 h-4 w-4" />
            {`\u5220\u9664\u5f53\u524d\u5de5\u4f5c\u53f0`}
          </Button>
        </div>
      </section>
    </div>
  );
}
