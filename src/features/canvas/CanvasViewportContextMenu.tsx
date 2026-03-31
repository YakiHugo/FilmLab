import { useMemo, type MouseEvent, type ReactNode } from "react";
import {
  CANVAS_CONTEXT_MENU_SECTION_ORDER,
  type CanvasContextActionId,
  type CanvasContextActionState,
} from "./canvasContextActions";
import { resolveCanvasShortcutPlatform, resolveCanvasShortcutTokens } from "./canvasShortcuts";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";

interface CanvasViewportContextMenuProps {
  actionStates: CanvasContextActionState[];
  children: ReactNode;
  onAction: (actionId: CanvasContextActionId) => Promise<void>;
  onPrepareOpen: (event: MouseEvent<HTMLDivElement>) => void;
}

export function CanvasViewportContextMenu({
  actionStates,
  children,
  onAction,
  onPrepareOpen,
}: CanvasViewportContextMenuProps) {
  const platform = useMemo(
    () =>
      resolveCanvasShortcutPlatform(typeof navigator === "undefined" ? null : navigator.platform),
    []
  );
  const menuSections = useMemo(
    () =>
      CANVAS_CONTEXT_MENU_SECTION_ORDER.map((section) =>
        actionStates.filter((actionState) => actionState.menuSection === section)
      ).filter((sectionActions) => sectionActions.length > 0),
    [actionStates]
  );

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div className="absolute inset-0" onContextMenuCapture={onPrepareOpen}>
          {children}
        </div>
      </ContextMenuTrigger>

      <ContextMenuContent collisionPadding={12} className="w-[200px]">
        {menuSections.map((sectionActions, sectionIndex) => (
          <div key={sectionActions[0]!.menuSection ?? `section-${sectionIndex}`}>
            {sectionIndex > 0 ? <ContextMenuSeparator /> : null}
            {sectionActions.map((actionState) => {
              const visibleShortcut = actionState.shortcuts[0] ?? null;
              const shortcutTokens = visibleShortcut
                ? resolveCanvasShortcutTokens(visibleShortcut, platform)
                : [];

              return (
                <ContextMenuItem
                  key={actionState.id}
                  destructive={actionState.destructive}
                  disabled={!actionState.enabled}
                  onSelect={() => {
                    void onAction(actionState.id);
                  }}
                >
                  <span>{actionState.label}</span>
                  {shortcutTokens.length > 0 ? (
                    <ContextMenuShortcut>
                      <span>
                        {shortcutTokens.map((token) => (
                          <kbd key={`${actionState.id}:${token}`}>{token}</kbd>
                        ))}
                      </span>
                    </ContextMenuShortcut>
                  ) : null}
                </ContextMenuItem>
              );
            })}
          </div>
        ))}
      </ContextMenuContent>
    </ContextMenu>
  );
}
