export type PresetTag = "人像" | "风景" | "夜景" | "黑白";

export interface Preset {
  id: string;
  name: string;
  tags: PresetTag[];
  intensity: number;
  description: string;
}

export interface Asset {
  id: string;
  name: string;
  type: string;
  size: number;
  createdAt: string;
  objectUrl: string;
  presetId?: string;
  intensity?: number;
  group?: string;
  blob?: Blob;
}

export interface Project {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}
