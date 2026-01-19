import type { Preset } from "@/types";

export const presets: Preset[] = [
  { id: "portrait-01", name: "柔和人像", tags: ["人像"], intensity: 60, description: "肤色保留，轻微柔化高光" },
  { id: "portrait-02", name: "低饱和人像", tags: ["人像"], intensity: 55, description: "适合阴天与逆光" },
  { id: "portrait-03", name: "复古暖色", tags: ["人像"], intensity: 65, description: "偏暖，轻颗粒" },
  { id: "landscape-01", name: "清透风景", tags: ["风景"], intensity: 70, description: "提亮阴影，增强通透感" },
  { id: "landscape-02", name: "青绿调", tags: ["风景"], intensity: 60, description: "冷调风景，保留天空层次" },
  { id: "landscape-03", name: "暖调日落", tags: ["风景"], intensity: 75, description: "增加金色氛围" },
  { id: "night-01", name: "霓虹夜色", tags: ["夜景"], intensity: 70, description: "压高光，增强霓虹" },
  { id: "night-02", name: "暗部细节", tags: ["夜景"], intensity: 55, description: "抬暗部，降低噪点风险" },
  { id: "night-03", name: "蓝调城市", tags: ["夜景"], intensity: 65, description: "冷色夜景风格" },
  { id: "bw-01", name: "经典黑白", tags: ["黑白"], intensity: 60, description: "中等对比" },
  { id: "bw-02", name: "高反差黑白", tags: ["黑白"], intensity: 70, description: "强调结构" },
  { id: "bw-03", name: "柔调黑白", tags: ["黑白"], intensity: 50, description: "柔和细节" },
];
