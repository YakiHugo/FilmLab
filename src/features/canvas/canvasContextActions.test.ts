import { describe, expect, it } from "vitest";
import { resolveCanvasContextActionStates } from "./canvasContextActions";
import { resolveCanvasShortcutPlatform, resolveCanvasShortcutTokens } from "./canvasShortcuts";

describe("canvasContextActions", () => {
  it("keeps the user-visible menu labels and shortcuts aligned with the action table", () => {
    const actionStates = resolveCanvasContextActionStates({
      canBringForward: true,
      canBringToFront: true,
      canCopy: true,
      canDelete: true,
      canDownloadImage: true,
      canDuplicate: true,
      canExport: true,
      canGroup: false,
      canPaste: true,
      canRedo: false,
      canSelectAll: true,
      canSendBackward: true,
      canSendToBack: true,
      canShare: true,
      canUndo: false,
      canUngroup: false,
    });
    const platform = resolveCanvasShortcutPlatform("Win32");

    expect(
      actionStates
        .filter((actionState) => actionState.menuSection !== null)
        .map((actionState) => ({
          id: actionState.id,
          label: actionState.label,
          shortcut: actionState.shortcuts[0]
            ? resolveCanvasShortcutTokens(actionState.shortcuts[0], platform).join(" ")
            : null,
        }))
    ).toEqual([
      { id: "duplicate-selection", label: "创建所选副本", shortcut: "Ctrl d" },
      { id: "copy-selection", label: "复制", shortcut: "Ctrl c" },
      { id: "paste-selection", label: "粘贴", shortcut: "Ctrl v" },
      { id: "download-image", label: "下载图片", shortcut: "e" },
      { id: "export-workbench", label: "导出", shortcut: "Shift e" },
      { id: "share-selection", label: "分享", shortcut: "Shift l" },
      { id: "tidy-up", label: "整理", shortcut: null },
      { id: "bring-to-front", label: "置于顶层", shortcut: "]" },
      { id: "bring-forward", label: "上移一层", shortcut: "Ctrl ]" },
      { id: "send-backward", label: "下移一层", shortcut: "Ctrl [" },
      { id: "send-to-back", label: "置于底层", shortcut: "[" },
      { id: "delete-selection", label: "删除所选内容", shortcut: "Delete" },
    ]);
  });

  it("marks placeholders and disabled menu items correctly", () => {
    const actionStates = resolveCanvasContextActionStates({
      canBringForward: false,
      canBringToFront: false,
      canCopy: false,
      canDelete: false,
      canDownloadImage: false,
      canDuplicate: false,
      canExport: true,
      canGroup: false,
      canPaste: false,
      canRedo: false,
      canSelectAll: true,
      canSendBackward: false,
      canSendToBack: false,
      canShare: true,
      canUndo: false,
      canUngroup: false,
    });

    expect(actionStates.find((actionState) => actionState.id === "export-workbench")).toMatchObject(
      {
        enabled: true,
        placeholder: false,
      }
    );
    expect(actionStates.find((actionState) => actionState.id === "share-selection")).toMatchObject({
      enabled: true,
      placeholder: true,
    });
    expect(actionStates.find((actionState) => actionState.id === "tidy-up")).toMatchObject({
      enabled: false,
      placeholder: true,
    });
  });

  it("enables selection-driven actions only when their guards pass", () => {
    const actionStates = resolveCanvasContextActionStates({
      canBringForward: true,
      canBringToFront: true,
      canCopy: true,
      canDelete: true,
      canDownloadImage: true,
      canDuplicate: true,
      canExport: true,
      canGroup: true,
      canPaste: true,
      canRedo: true,
      canSelectAll: true,
      canSendBackward: true,
      canSendToBack: true,
      canShare: true,
      canUndo: true,
      canUngroup: true,
    });

    expect(actionStates.find((actionState) => actionState.id === "download-image")?.enabled).toBe(
      true
    );
    expect(actionStates.find((actionState) => actionState.id === "bring-forward")?.enabled).toBe(
      true
    );
    expect(actionStates.find((actionState) => actionState.id === "delete-selection")).toMatchObject(
      {
        destructive: true,
        enabled: true,
      }
    );
    expect(actionStates.find((actionState) => actionState.id === "undo")?.enabled).toBe(true);
    expect(actionStates.find((actionState) => actionState.id === "redo")?.enabled).toBe(true);
  });
});
