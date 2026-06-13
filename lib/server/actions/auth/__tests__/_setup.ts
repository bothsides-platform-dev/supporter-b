// Test harness wiring for auth-action tests.
// - Creates a fresh pglite db per test.
// - Routes the factory's repo bundle through Drizzle (not in-memory) so
//   user/biz/outbox/verification-token reach a real schema.
// - Routes the action db hook (used by signupCompleteAction's tx,
//   passwordResetAction's UPDATE, emailChangeConfirmAction's UPDATE) at
//   the same handle.
// - Injects AuthService with the same PGlite DB so refactored actions don't
//   hit the real Postgres singleton.
import { createPgliteDb, type PgliteDB } from '@/lib/db/client-pglite';
import {
  __resetForTest,
  __useDrizzleWithDbForTest,
  getUserRepo,
  getVerificationTokenRepo,
  getOutboxRepo,
  getAuditLogRepo,
} from '@/lib/server/repositories/factory';
import { __setActionDbForTest } from '@/lib/server/actions/auth/_shared';
import {
  AuthService,
  __resetAuthServiceForTest,
  __setAuthServiceForTest,
} from '@/lib/server/services/auth';

export async function setupActionEnv(): Promise<PgliteDB> {
  __resetForTest();
  const db = await createPgliteDb();
  await __useDrizzleWithDbForTest(db);
  __setActionDbForTest(db);
  const userRepo = await getUserRepo();
  const verificationTokenRepo = await getVerificationTokenRepo();
  const outboxRepo = await getOutboxRepo();
  const auditRepo = await getAuditLogRepo();
  __setAuthServiceForTest(new AuthService(db, userRepo, verificationTokenRepo, outboxRepo, auditRepo));
  return db;
}

export function teardownActionEnv(): void {
  __setActionDbForTest(undefined);
  __resetAuthServiceForTest();
  __resetForTest();
}
