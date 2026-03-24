import { createClient } from "@supabase/supabase-js";
import type { AppConfig } from "../config";
import type { AssetStorage, AssetStorageObject } from "./types";

class MemoryAssetStorage implements AssetStorage {
  private readonly objects = new Map<string, AssetStorageObject>();

  async putObject(input: { path: string; buffer: Buffer; mimeType: string }) {
    this.objects.set(input.path, {
      buffer: Buffer.from(input.buffer),
      mimeType: input.mimeType,
    });
  }

  async getObject(path: string) {
    const stored = this.objects.get(path);
    return stored
      ? {
          buffer: Buffer.from(stored.buffer),
          mimeType: stored.mimeType,
        }
      : null;
  }

  async removeObjects(paths: string[]) {
    paths.forEach((path) => {
      this.objects.delete(path);
    });
  }

  async createSignedReadUrl(path: string) {
    return `memory://${encodeURIComponent(path)}`;
  }
}

class SupabaseAssetStorage implements AssetStorage {
  private readonly client;
  private readonly bucket: string;

  constructor(config: AppConfig) {
    if (!config.supabaseUrl || !config.supabaseServiceRoleKey) {
      throw new Error("Supabase storage config is incomplete.");
    }

    this.client = createClient(config.supabaseUrl, config.supabaseServiceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });
    this.bucket = config.supabaseStorageBucket ?? "assets";
  }

  async putObject(input: { path: string; buffer: Buffer; mimeType: string }) {
    const { error } = await this.client.storage.from(this.bucket).upload(input.path, input.buffer, {
      contentType: input.mimeType,
      upsert: true,
    });
    if (error) {
      throw new Error(`Supabase upload failed: ${error.message}`);
    }
  }

  async getObject(path: string) {
    const { data, error } = await this.client.storage.from(this.bucket).download(path);
    if (error) {
      if (error.message.toLowerCase().includes("not found")) {
        return null;
      }
      throw new Error(`Supabase download failed: ${error.message}`);
    }

    return {
      buffer: Buffer.from(await data.arrayBuffer()),
      mimeType: data.type || "application/octet-stream",
    };
  }

  async removeObjects(paths: string[]) {
    if (paths.length === 0) {
      return;
    }
    const { error } = await this.client.storage.from(this.bucket).remove(paths);
    if (error) {
      throw new Error(`Supabase delete failed: ${error.message}`);
    }
  }

  async createSignedReadUrl(path: string, expiresInSeconds: number) {
    const { data, error } = await this.client.storage
      .from(this.bucket)
      .createSignedUrl(path, expiresInSeconds);
    if (error || !data?.signedUrl) {
      throw new Error(`Supabase signed URL failed: ${error?.message ?? "unknown error"}`);
    }
    return data.signedUrl;
  }
}

export const createAssetStorage = (config: AppConfig): AssetStorage =>
  config.supabaseUrl && config.supabaseServiceRoleKey
    ? new SupabaseAssetStorage(config)
    : new MemoryAssetStorage();
