import { Pool } from "pg";
import { getConfig } from "../../config";
import { MemoryChatStateRepository } from "./memory";
import { PostgresChatStateRepository } from "./postgres";
import type { ChatStateRepository } from "./types";

export const createChatStateRepository = (
  database: Pool | string | undefined = getConfig().databaseUrl
): ChatStateRepository => {
  if (database instanceof Pool) {
    return new PostgresChatStateRepository(database);
  }

  const databaseUrl = database;
  if (!databaseUrl) {
    return new MemoryChatStateRepository();
  }

  const pool = new Pool({
    connectionString: databaseUrl,
  });
  return new PostgresChatStateRepository(pool);
};
