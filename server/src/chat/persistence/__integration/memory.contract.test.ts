import { MemoryChatStateRepository } from "../memory";
import { describeRepositoryContract } from "./repositoryContract";

describeRepositoryContract("MemoryChatStateRepository", {
  make: () => new MemoryChatStateRepository(),
});
