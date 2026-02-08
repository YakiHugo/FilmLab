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
