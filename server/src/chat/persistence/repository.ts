import { Pool } from "pg";
import { getConfig } from "../../config";
import { MemoryChatStateRepository } from "./memory";
import { PostgresChatStateRepository } from "./postgres";
import type { ChatStateRepository } from "./types";

let cachedRepository: ChatStateRepository | null = null;
let cachedPool: Pool | null = null;

export const createChatStateRepository = (
  databaseUrl = getConfig().databaseUrl
): ChatStateRepository => {
  if (!databaseUrl) {
    return new MemoryChatStateRepository();
  }

  const pool = new Pool({
    connectionString: databaseUrl,
  });
  return new PostgresChatStateRepository(pool);
};

export const getChatStateRepository = (): ChatStateRepository => {
  if (cachedRepository) {
    return cachedRepository;
  }

  const databaseUrl = getConfig().databaseUrl;
  if (!databaseUrl) {
    cachedRepository = new MemoryChatStateRepository();
    return cachedRepository;
  }

  cachedPool = new Pool({
    connectionString: databaseUrl,
  });
  cachedRepository = new PostgresChatStateRepository(cachedPool);
  return cachedRepository;
};

export const resetChatStateRepositoryForTests = async () => {
  cachedRepository = null;
  if (cachedPool) {
    await cachedPool.end();
    cachedPool = null;
  }
};
