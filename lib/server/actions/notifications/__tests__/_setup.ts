import { createPgliteDb, type PgliteDB } from '@/lib/db/client-pglite';
import {
  __resetForTest,
  __useDrizzleWithDbForTest,
  getNotificationRepo,
  getOutboxRepo,
  getUserRepo,
} from '@/lib/server/repositories/factory';
import { __setActionDbForTest } from '@/lib/server/actions/auth/_shared';
import { NotificationService, __resetNotificationServiceForTest, __setNotificationServiceForTest } from '@/lib/server/services/notification';

export async function setupNotifActionEnv(): Promise<PgliteDB> {
  __resetForTest();
  const db = await createPgliteDb();
  await __useDrizzleWithDbForTest(db);
  __setActionDbForTest(db);
  const [notifRepo, outboxRepo, userRepo] = await Promise.all([
    getNotificationRepo(),
    getOutboxRepo(),
    getUserRepo(),
  ]);
  __setNotificationServiceForTest(new NotificationService(db, notifRepo, outboxRepo, userRepo));
  return db;
}

export function teardownNotifActionEnv(): void {
  __resetNotificationServiceForTest();
  __setActionDbForTest(undefined);
  __resetForTest();
}
