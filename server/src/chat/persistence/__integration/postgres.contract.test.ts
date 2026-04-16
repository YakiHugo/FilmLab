import { PostgresChatStateRepository } from "../postgres";
import { createPgMemHarness, type PgMemHarness } from "./pgMemHarness";
import { describeRepositoryContract } from "./repositoryContract";

const harnesses = new WeakMap<PostgresChatStateRepository, PgMemHarness>();

describeRepositoryContract("PostgresChatStateRepository (pg-mem)", {
  make: () => {
    const harness = createPgMemHarness();
    const repository = new PostgresChatStateRepository(harness.pool);
    harnesses.set(repository, harness);
    return repository;
  },
  teardown: async (repository) => {
    const harness = harnesses.get(repository as PostgresChatStateRepository);
    if (harness) {
      await harness.close();
      harnesses.delete(repository as PostgresChatStateRepository);
    }
  },
});
