import { Link, useNavigate } from "@tanstack/react-router";
import { CirclePlus, Images, PanelsTopLeft, PencilLine, Trash2, Wand2 } from "lucide-react";
import { shallow } from "zustand/shallow";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useCanvasStore } from "@/stores/canvasStore";
import { getStudioCanvasPreset } from "./studioPresets";
import {
  canvasDockActionChipClassName,
  canvasDockBadgeClassName,
  canvasDockBodyTextClassName,
  canvasDockEmptyStateClassName,
  canvasDockFieldClassName,
  canvasDockFieldLabelClassName,
  canvasDockHeadingClassName,
  canvasDockIconBadgeClassName,
  canvasDockInteractiveListItemClassName,
  canvasDockListItemClassName,
  canvasDockMetricCardClassName,
  canvasDockOverlineClassName,
  canvasDockPanelContentClassName,
  canvasDockSelectedListItemClassName,
  canvasDockSectionClassName,
} from "./editDockTheme";

const formatUpdatedAt = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Just now";
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
    const created = await createWorkbench(`Workbench ${String(nextIndex).padStart(2, "0")}`, {
      activate: false,
    });
    if (!created) {
      return;
    }
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
    const deleted = await deleteWorkbench(activeWorkbenchId, { nextActiveWorkbenchId: null });
    if (!deleted) {
      return;
    }
  };

  return (
    <div className={canvasDockPanelContentClassName}>
      <section className={canvasDockSectionClassName}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className={canvasDockOverlineClassName}>Workbench Overview</p>
            <h3 className={canvasDockHeadingClassName}>Organize creation around the active board.</h3>
            <p className={cn(canvasDockBodyTextClassName, "mt-2")}>
              The library feeds source material in, edit controls stay attached to placed elements,
              and AI results can land directly on the current workbench.
            </p>
          </div>
          <div className={canvasDockIconBadgeClassName}>
            <PanelsTopLeft className="h-4 w-4 text-[color:var(--canvas-edit-text-soft)]" />
          </div>
        </div>

        <div className="mt-4 flex items-center gap-2">
          <span className={canvasDockBadgeClassName}>
            {workbenchCount || 1} workbench{workbenchCount === 1 ? "" : "es"}
          </span>
          <span className={canvasDockBadgeClassName}>
            {activeWorkbenchMeta.id
              ? getStudioCanvasPreset(activeWorkbenchMeta.presetId).shortLabel
              : "4:5"}
          </span>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
          <div className={canvasDockMetricCardClassName}>
            <p className={canvasDockFieldLabelClassName}>Count</p>
            <p className="mt-2 text-lg font-semibold text-[color:var(--canvas-edit-text)]">
              {workbenchCount || 1}
            </p>
          </div>
          <div className={canvasDockMetricCardClassName}>
            <p className={canvasDockFieldLabelClassName}>Ratio</p>
            <p className="mt-2 text-lg font-semibold text-[color:var(--canvas-edit-text)]">
              {activeWorkbenchMeta.id
                ? getStudioCanvasPreset(activeWorkbenchMeta.presetId).shortLabel
                : "4:5"}
            </p>
          </div>
        </div>
      </section>

      <section className={canvasDockSectionClassName}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className={canvasDockOverlineClassName}>Current Workbench</p>
            <h3 className={canvasDockHeadingClassName}>Name and delivery context.</h3>
          </div>
          <div className={canvasDockIconBadgeClassName}>
            <PencilLine className="h-4 w-4 text-[color:var(--canvas-edit-text-soft)]" />
          </div>
        </div>

        {activeWorkbenchMeta.id ? (
          <div className="mt-4 space-y-4">
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
                  name: event.target.value || "Untitled Workbench",
                });
              }}
              className={canvasDockFieldClassName}
            />

            <div className="grid grid-cols-2 gap-2 text-xs text-[color:var(--canvas-edit-pill-text)]">
              <div className={canvasDockMetricCardClassName}>
                <p className={canvasDockFieldLabelClassName}>Canvas</p>
                <p className="mt-2 font-medium text-[color:var(--canvas-edit-text)]">
                  {activeWorkbenchMeta.width} x {activeWorkbenchMeta.height}
                </p>
              </div>
              <div className={canvasDockMetricCardClassName}>
                <p className={canvasDockFieldLabelClassName}>Updated</p>
                <p className="mt-2 font-medium text-[color:var(--canvas-edit-text)]">
                  {formatUpdatedAt(activeWorkbenchMeta.updatedAt)}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <Button size="sm" variant="secondary" className={canvasDockActionChipClassName} asChild>
                <Link to="/library">
                  <Images className="mr-2 h-4 w-4" />
                  Open Library
                </Link>
              </Button>
              <Button size="sm" variant="secondary" className={canvasDockActionChipClassName} asChild>
                <Link to="/assist">
                  <Wand2 className="mr-2 h-4 w-4" />
                  Open AI Tools
                </Link>
              </Button>
            </div>
          </div>
        ) : (
          <div className={cn(canvasDockEmptyStateClassName, "mt-4 px-4 py-4 text-sm")}>
            <p className="font-medium text-[color:var(--canvas-edit-text)]">No active workbench.</p>
            <p className="mt-2 leading-6 text-[color:var(--canvas-edit-text-muted)]">
              Create one first, then use it as the shared context for library inserts, edits, and
              export planning.
            </p>
          </div>
        )}
      </section>

      <section className={cn(canvasDockSectionClassName, "min-h-0 flex flex-1 flex-col")}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className={canvasDockOverlineClassName}>Workbench List</p>
            <h3 className={canvasDockHeadingClassName}>Switch the active editing context.</h3>
          </div>
          <div className={canvasDockIconBadgeClassName}>
            <PanelsTopLeft className="h-4 w-4 text-[color:var(--canvas-edit-text-soft)]" />
          </div>
        </div>

        <div className="mt-4 min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
          {workbenches.map((workbench, index) => {
            const preset = getStudioCanvasPreset(workbench.presetId);
            const active = workbench.id === activeWorkbenchId;
            return (
              <button
                key={workbench.id}
                type="button"
                onClick={() => handleSelectWorkbench(workbench.id)}
                className={cn(
                  canvasDockListItemClassName,
                  canvasDockInteractiveListItemClassName,
                  "w-full px-3 py-3 text-left",
                  active
                    ? canvasDockSelectedListItemClassName
                    : "text-[color:var(--canvas-edit-text-muted)]"
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-[color:var(--canvas-edit-text)]">
                      {workbench.name || `Workbench ${String(index + 1).padStart(2, "0")}`}
                    </p>
                    <p className="mt-1 text-xs text-[color:var(--canvas-edit-text-muted)]">
                      {preset.shortLabel} - {workbench.elements.length} element
                      {workbench.elements.length === 1 ? "" : "s"}
                    </p>
                  </div>
                  <span className={canvasDockBadgeClassName}>
                    {String(index + 1).padStart(2, "0")}
                  </span>
                </div>
              </button>
            );
          })}

          {workbenches.length === 0 ? (
            <div className={cn(canvasDockEmptyStateClassName, "px-4 py-4 text-sm")}>
              <p className="font-medium text-[color:var(--canvas-edit-text)]">No workbenches yet.</p>
              <p className="mt-2 leading-6 text-[color:var(--canvas-edit-text-muted)]">
                Create a vertical board first, then expand into alternates and sequences.
              </p>
            </div>
          ) : null}
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2">
          <Button size="sm" className={canvasDockActionChipClassName} onClick={() => void handleCreateWorkbench()}>
            <CirclePlus className="mr-2 h-4 w-4" />
            New Workbench
          </Button>
          <Button
            size="sm"
            variant="secondary"
            className={cn(canvasDockActionChipClassName, "text-rose-200 hover:text-rose-100")}
            disabled={!activeWorkbenchMeta.id || workbenches.length <= 1}
            onClick={() => void handleDeleteWorkbench()}
          >
            <Trash2 className="mr-2 h-4 w-4" />
            Delete Current
          </Button>
        </div>
      </section>
    </div>
  );
}
