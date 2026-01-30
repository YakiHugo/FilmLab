import type { LucideIcon } from "lucide-react";
import { Download, Image, LayoutGrid, Sparkles } from "lucide-react";

export interface NavItem {
  id: string;
  to: string;
  label: string;
  shortLabel: string;
  description: string;
  icon: LucideIcon;
}

export const navItems: NavItem[] = [
  {
    id: "overview",
    to: "/",
    label: "概览",
    shortLabel: "概览",
    description: "项目节奏与工作流",
    icon: Sparkles,
  },
  {
    id: "library",
    to: "/library",
    label: "素材库",
    shortLabel: "素材",
    description: "导入、筛选与管理",
    icon: Image,
  },
  {
    id: "batch",
    to: "/batch",
    label: "批处理",
    shortLabel: "批量",
    description: "分组统一与强度控制",
    icon: LayoutGrid,
  },
  {
    id: "export",
    to: "/export",
    label: "导出",
    shortLabel: "导出",
    description: "交付与导出队列",
    icon: Download,
  },
];
