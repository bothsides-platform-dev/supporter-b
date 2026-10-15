import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { users } from '@/lib/db/schema';
import {
  setupActionEnv,
  teardownActionEnv,
} from '@/lib/server/actions/auth/__tests__/_setup';
import { seedUser } from '@/lib/server/repositories/drizzle/__tests__/_seed';
import type { PgliteDB } from '@/lib/db/client-pglite';
const session = vi.hoisted(() => ({ id: '' }));
vi.mock('@/lib/auth/session', () => ({
  requireSession: async () => {
    if (!session.id) throw new Error('unauth');
    return { user: { id: session.id } };
  },
}));
let db: PgliteDB;
beforeEach(async () => {
  db = await setupActionEnv();
  session.id = '';
});
afterEach(teardownActionEnv);
it('defaults on and persists only the session user preference', async () => {
  const { updateBusinessAlimtalkAction } =
    await import('../updateBusinessAlimtalkAction');
  const me = await seedUser(db);
  const other = await seedUser(db);
  session.id = me.id;
  expect(
    (await db.select().from(users).where(eq(users.id, me.id)))[0]
      .businessAlimtalkEnabled,
  ).toBe(true);
  expect(await updateBusinessAlimtalkAction({ enabled: false })).toEqual({
    ok: true,
  });
  expect(
    (await db.select().from(users).where(eq(users.id, me.id)))[0]
      .businessAlimtalkEnabled,
  ).toBe(false);
  expect(
    (await db.select().from(users).where(eq(users.id, other.id)))[0]
      .businessAlimtalkEnabled,
  ).toBe(true);
  expect(
    await updateBusinessAlimtalkAction({
      enabled: true,
      userId: other.id,
    } as never),
  ).toEqual({ ok: false, error: 'INVALID_INPUT' });
  session.id = '';
  expect(await updateBusinessAlimtalkAction({ enabled: true })).toEqual({
    ok: false,
    error: 'UNAUTHENTICATED',
  });
});
