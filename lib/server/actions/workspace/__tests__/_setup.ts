// Shared test harness for workspace actions.
// Provides a single setup/teardown pair that wires PGlite + WorkspaceService
// so actions use the in-memory DB instead of real Postgres.
import { createPgliteDb, type PgliteDB } from '@/lib/db/client-pglite';
import {
  __resetForTest,
  __useDrizzleWithDbForTest,
  getOutboxRepo,
} from '@/lib/server/repositories/factory';
import { __setActionDbForTest } from '@/lib/server/actions/auth/_shared';
import {
  WorkspaceService,
  __setWorkspaceServiceForTest,
  __resetWorkspaceServiceForTest,
} from '@/lib/server/services/workspace';

export async function setupWorkspaceActionEnv(): Promise<PgliteDB> {
  __resetForTest();
  const db = await createPgliteDb();
  await __useDrizzleWithDbForTest(db);
  __setActionDbForTest(db);

  const outboxRepo = await getOutboxRepo();
  __setWorkspaceServiceForTest(new WorkspaceService(db, outboxRepo));

  return db;
}

export function teardownWorkspaceActionEnv(): void {
  __setActionDbForTest(undefined);
  __resetWorkspaceServiceForTest();
  __resetForTest();
}
