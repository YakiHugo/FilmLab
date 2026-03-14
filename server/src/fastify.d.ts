import "fastify";
import type { ChatStateRepository } from "./chat/persistence/types";

declare module "fastify" {
  interface FastifyInstance {
    chatStateRepository: ChatStateRepository;
  }
}
