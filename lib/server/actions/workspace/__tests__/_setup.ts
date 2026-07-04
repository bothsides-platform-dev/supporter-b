// Shared test harness for workspace actions.
// Provides a single setup/teardown pair that wires PGlite + WorkspaceService
// so actions use the in-memory DB instead of real Postgres.
import { createPgliteDb, type PgliteDB } from '@/lib/db/client-pglite';
import {
  __resetForTest,
  __useDrizzleWithDbForTest,
  getOutboxRepo,
  getAuditLogRepo,
  getWorkspaceRepo,
  getUserRepo,
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

  const [outboxRepo, auditRepo, workspaceRepo, userRepo] = await Promise.all([
    getOutboxRepo(), getAuditLogRepo(), getWorkspaceRepo(), getUserRepo(),
  ]);
  __setWorkspaceServiceForTest(new WorkspaceService(db, outboxRepo, auditRepo, workspaceRepo, userRepo));

  return db;
}

export function teardownWorkspaceActionEnv(): void {
  __setActionDbForTest(undefined);
  __resetWorkspaceServiceForTest();
  __resetForTest();
}
