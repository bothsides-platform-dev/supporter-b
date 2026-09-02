// Test harness for notification actions.
// One injection point: `__useDrizzleWithDbForTest(db)` installs the PGlite
// repo bundle, and NotificationService builds itself from `get*Repo()`, so
// nothing here re-wires it by hand.
import { createPgliteDb, type PgliteDB } from '@/lib/db/client-pglite';
import {
  __resetForTest,
  __useDrizzleWithDbForTest,
} from '@/lib/server/repositories/factory';
import { __setActionDbForTest } from '@/lib/server/actions/auth/_shared';
import { __resetNotificationServiceForTest } from '@/lib/server/services/notification';

export async function setupNotifActionEnv(): Promise<PgliteDB> {
  __resetForTest();
  __resetNotificationServiceForTest();
  const db = await createPgliteDb();
  await __useDrizzleWithDbForTest(db);
  __setActionDbForTest(db);
  return db;
}

export function teardownNotifActionEnv(): void {
  __resetNotificationServiceForTest();
  __setActionDbForTest(undefined);
  __resetForTest();
}
