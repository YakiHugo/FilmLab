import type { Upload } from "lucide-react";

export type WorkspaceStep = "library" | "style" | "export";

export interface WorkspaceStepItem {
  id: WorkspaceStep;
  label: string;
  description: string;
  icon: typeof Upload;
}

export interface ExportTask {
  id: string;
  name: string;
  status: "等待" | "处理中" | "完成" | "失败";
}

export type ExportPreviewStatus = ExportTask["status"] | "未开始";

export interface ExportPreviewItem {
  assetId: string;
  name: string;
  thumbnailUrl?: string;
  status: ExportPreviewStatus;
  isActive: boolean;
}
