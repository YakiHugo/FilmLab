import type { CanvasShortcutSpec } from "./canvasShortcuts";

export type CanvasContextActionId =
  | "copy-selection"
  | "delete-selection"
  | "download-image"
  | "duplicate-selection"
  | "export-workbench"
  | "group-selection"
  | "paste-selection"
  | "redo"
  | "select-all"
  | "send-backward"
  | "send-to-back"
  | "share-selection"
  | "tidy-up"
  | "undo"
  | "ungroup-selection"
  | "bring-forward"
  | "bring-to-front";

export type CanvasContextMenuSection = "clipboard" | "export" | "cleanup" | "order" | "danger";

export interface CanvasContextActionState {
  destructive: boolean;
  enabled: boolean;
  id: CanvasContextActionId;
  label: string;
  menuSection: CanvasContextMenuSection | null;
  placeholder: boolean;
  shortcuts: CanvasShortcutSpec[];
}

export interface CanvasContextActionAvailabilitySnapshot {
  canBringForward: boolean;
  canBringToFront: boolean;
  canCopy: boolean;
  canDelete: boolean;
  canDownloadImage: boolean;
  canDuplicate: boolean;
  canExport: boolean;
  canGroup: boolean;
  canPaste: boolean;
  canRedo: boolean;
  canSelectAll: boolean;
  canSendBackward: boolean;
  canSendToBack: boolean;
  canShare: boolean;
  canUndo: boolean;
  canUngroup: boolean;
}

const CANVAS_CONTEXT_ACTIONS: readonly Omit<CanvasContextActionState, "enabled">[] = [
  {
    destructive: false,
    id: "duplicate-selection",
    label: "创建所选副本",
    menuSection: "clipboard",
    placeholder: false,
    shortcuts: [{ displayKey: "d", key: "d", primary: true }],
  },
  {
    destructive: false,
    id: "copy-selection",
    label: "复制",
    menuSection: "clipboard",
    placeholder: false,
    shortcuts: [{ displayKey: "c", key: "c", primary: true }],
  },
  {
    destructive: false,
    id: "paste-selection",
    label: "粘贴",
    menuSection: "clipboard",
    placeholder: false,
    shortcuts: [{ displayKey: "v", key: "v", primary: true }],
  },
  {
    destructive: false,
    id: "download-image",
    label: "下载图片",
    menuSection: "export",
    placeholder: false,
    shortcuts: [{ displayKey: "e", key: "e" }],
  },
  {
    destructive: false,
    id: "export-workbench",
    label: "导出",
    menuSection: "export",
    placeholder: false,
    shortcuts: [{ displayKey: "e", key: "e", shift: true }],
  },
  {
    destructive: false,
    id: "share-selection",
    label: "分享",
    menuSection: "export",
    placeholder: true,
    shortcuts: [{ displayKey: "l", key: "l", shift: true }],
  },
  {
    destructive: false,
    id: "tidy-up",
    label: "整理",
    menuSection: "cleanup",
    placeholder: true,
    shortcuts: [],
  },
  {
    destructive: false,
    id: "bring-to-front",
    label: "置于顶层",
    menuSection: "order",
    placeholder: false,
    shortcuts: [{ code: "BracketRight", displayKey: "]" }],
  },
  {
    destructive: false,
    id: "bring-forward",
    label: "上移一层",
    menuSection: "order",
    placeholder: false,
    shortcuts: [{ code: "BracketRight", displayKey: "]", primary: true }],
  },
  {
    destructive: false,
    id: "send-backward",
    label: "下移一层",
    menuSection: "order",
    placeholder: false,
    shortcuts: [{ code: "BracketLeft", displayKey: "[", primary: true }],
  },
  {
    destructive: false,
    id: "send-to-back",
    label: "置于底层",
    menuSection: "order",
    placeholder: false,
    shortcuts: [{ code: "BracketLeft", displayKey: "[" }],
  },
  {
    destructive: true,
    id: "delete-selection",
    label: "删除所选内容",
    menuSection: "danger",
    placeholder: false,
    shortcuts: [
      { displayKey: "Delete", key: "Delete" },
      { displayKey: "Backspace", key: "Backspace" },
    ],
  },
  {
    destructive: false,
    id: "select-all",
    label: "Select all",
    menuSection: null,
    placeholder: false,
    shortcuts: [{ displayKey: "a", key: "a", primary: true }],
  },
  {
    destructive: false,
    id: "undo",
    label: "Undo",
    menuSection: null,
    placeholder: false,
    shortcuts: [{ displayKey: "z", key: "z", primary: true }],
  },
  {
    destructive: false,
    id: "redo",
    label: "Redo",
    menuSection: null,
    placeholder: false,
    shortcuts: [
      { displayKey: "y", key: "y", primary: true },
      { displayKey: "z", key: "z", primary: true, shift: true },
    ],
  },
  {
    destructive: false,
    id: "group-selection",
    label: "Group selection",
    menuSection: null,
    placeholder: false,
    shortcuts: [{ displayKey: "g", key: "g", primary: true }],
  },
  {
    destructive: false,
    id: "ungroup-selection",
    label: "Ungroup selection",
    menuSection: null,
    placeholder: false,
    shortcuts: [{ displayKey: "g", key: "g", primary: true, shift: true }],
  },
] as const;

const resolveCanvasActionEnabled = (
  id: CanvasContextActionId,
  snapshot: CanvasContextActionAvailabilitySnapshot
) => {
  switch (id) {
    case "duplicate-selection":
      return snapshot.canDuplicate;
    case "copy-selection":
      return snapshot.canCopy;
    case "paste-selection":
      return snapshot.canPaste;
    case "download-image":
      return snapshot.canDownloadImage;
    case "export-workbench":
      return snapshot.canExport;
    case "share-selection":
      return snapshot.canShare;
    case "tidy-up":
      return false;
    case "bring-to-front":
      return snapshot.canBringToFront;
    case "bring-forward":
      return snapshot.canBringForward;
    case "send-backward":
      return snapshot.canSendBackward;
    case "send-to-back":
      return snapshot.canSendToBack;
    case "delete-selection":
      return snapshot.canDelete;
    case "select-all":
      return snapshot.canSelectAll;
    case "undo":
      return snapshot.canUndo;
    case "redo":
      return snapshot.canRedo;
    case "group-selection":
      return snapshot.canGroup;
    case "ungroup-selection":
      return snapshot.canUngroup;
    default:
      return false;
  }
};

export const CANVAS_CONTEXT_MENU_SECTION_ORDER: readonly CanvasContextMenuSection[] = [
  "clipboard",
  "export",
  "cleanup",
  "order",
  "danger",
];

export const resolveCanvasContextActionStates = (
  snapshot: CanvasContextActionAvailabilitySnapshot
) =>
  CANVAS_CONTEXT_ACTIONS.map((action) => ({
    ...action,
    enabled: resolveCanvasActionEnabled(action.id, snapshot),
  }));
