import "fastify";
import type { AssetService } from "./assets/service";
import type { ImageGenerationService } from "./chat/application/imageGenerationService";
import type { ChatStateRepository } from "./chat/persistence/types";

declare module "fastify" {
  interface FastifyRequest {
    userId: string | undefined;
  }
  interface FastifyInstance {
    assetService: AssetService;
    chatStateRepository: ChatStateRepository;
    imageGenerationService: ImageGenerationService;
  }
}
