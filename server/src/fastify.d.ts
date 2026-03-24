import "fastify";
import type { AssetService } from "./assets/service";
import type { ChatStateRepository } from "./chat/persistence/types";

declare module "fastify" {
  interface FastifyInstance {
    assetService: AssetService;
    chatStateRepository: ChatStateRepository;
  }
}
