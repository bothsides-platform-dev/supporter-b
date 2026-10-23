import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { createPgliteDb, type PgliteDB } from '@/lib/db/client-pglite';
import * as factory from '@/lib/server/repositories/factory';
import { users, workspaceMembers, alimtalkOutbox } from '@/lib/db/schema';
import {
  seedUser,
  seedBuyerWorkspace,
  seedPgWorkspace,
} from '@/lib/server/repositories/drizzle/__tests__/_seed';
import { notify, type NotifyInput } from '../notify';
let db: PgliteDB;
let input: NotifyInput;
beforeEach(async () => {
  factory.__resetForTest();
  db = await createPgliteDb();
  await factory.__useDrizzleWithDbForTest(db);
  vi.stubEnv('BUSINESS_ALIMTALK_ENABLED', 'true');
  const u = await seedUser(db, { email: 'talk@test.com' });
  const w = await seedBuyerWorkspace(db);
  await db
    .update(users)
    .set({ phone: '01012345678', emailVerified: true })
    .where(eq(users.id, u.id));
  await db
    .insert(workspaceMembers)
    .values({ userId: u.id, workspaceId: w.id, approvalStatus: 'approved' });
  input = {
    recipients: [{ userId: u.id, workspaceId: w.id, email: u.email }],
    channels: ['alimtalk'],
    type: 'bid.submitted',
    title: '견적',
    body: '',
    alimtalk: {
      template: 'bidSubmitted',
      eventKey: 'bid:1',
      rfpCode: 'P-1',
      linkUrl: 'https://support-b.com/rfp/P-1',
    },
  };
});
afterEach(() => {
  factory.__resetForTest();
  vi.unstubAllEnvs();
});
it('enqueues explicit channel once per event and recipient inside the business transaction', async () => {
  await db.transaction((tx) => notify(tx, input));
  await db.transaction((tx) => notify(tx, input));
  expect(typeof factory.getAlimtalkRepo).toBe('function');

  expect(await db.select().from(alimtalkOutbox)).toMatchObject([
    { status: 'pending', phone: '01012345678', template: 'bidSubmitted' },
  ]);
  await expect(
    db.transaction(async (tx) => {
      await notify(tx, {
        ...input,
        alimtalk: { ...input.alimtalk!, eventKey: 'bid:2' },
      });
      throw new Error('rollback');
    }),
  ).rejects.toThrow('rollback');
  expect(await db.select().from(alimtalkOutbox)).toHaveLength(1);
});

it('claims once across concurrent workers and records provider acceptance', async () => {
  await db.transaction((tx) => notify(tx, input));
  const repo = await factory.getAlimtalkRepo();
  expect(typeof repo.claim).toBe('function');
  const batches = await Promise.all([repo.claim(), repo.claim()]);
  expect(batches.flat()).toHaveLength(1);
  expect((await db.select().from(alimtalkOutbox))[0]).toMatchObject({
    status: 'sending',
    attempts: 1,
  });
  await repo.finish(batches.flat()[0].id, {
    status: 'accepted',
    messageId: 'provider-1',
  });
  expect((await db.select().from(alimtalkOutbox))[0]).toMatchObject({
    status: 'accepted',
    messageId: 'provider-1',
  });
  expect(await repo.claim()).toHaveLength(0);
});
it.each([
  'opt-out',
  'phone-change',
  'membership',
  'workspace',
  'account',
] as const)('rechecks %s after enqueue', async (change) => {
  await db.transaction((tx) => notify(tx, input));
  const r = input.recipients[0];
  if (change === 'opt-out')
    await db
      .update(users)
      .set({ businessAlimtalkEnabled: false })
      .where(eq(users.id, r.userId));
  if (change === 'phone-change')
    await db
      .update(users)
      .set({ phone: '01099999999' })
      .where(eq(users.id, r.userId));
  if (change === 'account')
    await db
      .update(users)
      .set({ status: 'suspended' })
      .where(eq(users.id, r.userId));
  if (change === 'membership')
    await db
      .delete(workspaceMembers)
      .where(eq(workspaceMembers.userId, r.userId));
  if (change === 'workspace') {
    const { workspaces } = await import('@/lib/db/schema');
    await db
      .update(workspaces)
      .set({ status: 'suspended' })
      .where(eq(workspaces.id, r.workspaceId!));
  }
  const repo = await factory.getAlimtalkRepo();
  expect(typeof repo.claim).toBe('function');
  const [row] = await repo.claim();
  expect(await repo.canSend(row)).toBe(false);
});
it('never reclaims a crashed send; expired in-flight rows become unknown', async () => {
  await db.transaction((tx) => notify(tx, input));
  const repo = await factory.getAlimtalkRepo();
  expect(typeof repo.claim).toBe('function');
  await repo.claim();
  await db
    .update(alimtalkOutbox)
    .set({ claimedAt: new Date(Date.now() - 600_000) });
  expect(await repo.claim()).toHaveLength(0);
  expect((await db.select().from(alimtalkOutbox))[0].status).toBe('unknown');
});

it('flushes only eligible recipients using template variables and persists acceptance', async () => {
  const { flushAlimtalk } = await import('@/lib/server/alimtalk/flush');
  await db.transaction((tx) => notify(tx, input));
  for (const [k, v] of Object.entries({
    SOLAPI_API_KEY: 'key',
    SOLAPI_SECRET_KEY: 'secret',
    SOLAPI_SENDER: '0212345678',
    SOLAPI_KAKAO_PF_ID: 'channel',
    SOLAPI_TEMPLATE_BID_SUBMITTED: 'bid-template',
  }))
    vi.stubEnv(k, v);
  const fetcher = vi
    .fn()
    .mockResolvedValue(
      new Response(
        JSON.stringify({
          groupInfo: { count: { registeredSuccess: 1 } },
          messageList: [{ messageId: 'm', statusCode: '2000' }],
        }),
      ),
    );
  vi.stubGlobal('fetch', fetcher);
  await flushAlimtalk();
  expect((await db.select().from(alimtalkOutbox))[0]).toMatchObject({
    status: 'accepted',
    messageId: 'm',
  });
  expect(
    JSON.parse(fetcher.mock.calls[0][1].body).messages[0].kakaoOptions,
  ).toMatchObject({
    templateId: 'bid-template',
    variables: {
      '#{견적번호}': 'P-1',
      '#{링크}': 'https://support-b.com/rfp/P-1',
    },
  });
  vi.unstubAllGlobals();
});
it('retries explicit rate-limit rejection at most five times; unknown acceptance is never retried', async () => {
  const { flushAlimtalk } = await import('@/lib/server/alimtalk/flush');
  await db.transaction((tx) => notify(tx, input));
  for (const [k, v] of Object.entries({
    SOLAPI_API_KEY: 'key',
    SOLAPI_SECRET_KEY: 'secret',
    SOLAPI_SENDER: '0212345678',
    SOLAPI_KAKAO_PF_ID: 'channel',
    SOLAPI_TEMPLATE_BID_SUBMITTED: 'bid-template',
  }))
    vi.stubEnv(k, v);
  const fetcher = vi
    .fn()
    .mockImplementation(() =>
      Promise.resolve(new Response('{}', { status: 429 })),
    );
  vi.stubGlobal('fetch', fetcher);
  for (let i = 0; i < 6; i++) {
    await flushAlimtalk();
    await db.update(alimtalkOutbox).set({ scheduledAt: new Date(0) });
  }
  expect(fetcher).toHaveBeenCalledTimes(5);
  expect((await db.select().from(alimtalkOutbox))[0]).toMatchObject({
    status: 'failed',
    attempts: 5,
  });
  await db.transaction((tx) =>
    notify(tx, {
      ...input,
      alimtalk: { ...input.alimtalk!, eventKey: 'bid:unknown' },
    }),
  );
  fetcher.mockRejectedValue(new Error('timeout'));
  await flushAlimtalk();
  await flushAlimtalk();
  expect(fetcher).toHaveBeenCalledTimes(6);
  expect(
    (await db.select().from(alimtalkOutbox)).some(
      (r) => r.status === 'unknown',
    ),
  ).toBe(true);
  vi.unstubAllGlobals();
});

it('does not send an expired claim that another worker already marked unknown', async () => {
  await db.transaction((tx) => notify(tx, input));
  const repo = await factory.getAlimtalkRepo();
  const [row] = await repo.claim();
  await db
    .update(alimtalkOutbox)
    .set({ status: 'unknown' })
    .where(eq(alimtalkOutbox.id, row.id));
  expect(await repo.canSend(row)).toBe(false);
});
it('does not backfill a missing number, opt-out, or disabled business channel', async () => {
  const r = input.recipients[0];
  const repo = await factory.getAlimtalkRepo();
  await db.update(users).set({ phone: null }).where(eq(users.id, r.userId));
  await db.transaction((tx) => notify(tx, input));
  await db
    .update(users)
    .set({ phone: '01012345678', businessAlimtalkEnabled: false })
    .where(eq(users.id, r.userId));
  await db.transaction((tx) => notify(tx, input));
  await repo.setPreference(r.userId, true);
  vi.stubEnv('BUSINESS_ALIMTALK_ENABLED', 'false');
  await db.transaction((tx) => notify(tx, input));
  expect(await db.select().from(alimtalkOutbox)).toHaveLength(0);
});
it('worker skips an opted-out recipient without contacting SOLAPI', async () => {
  const { flushAlimtalk } = await import('@/lib/server/alimtalk/flush');
  await db.transaction((tx) => notify(tx, input));
  await (
    await factory.getAlimtalkRepo()
  ).setPreference(input.recipients[0].userId, false);
  const fetcher = vi.fn();
  vi.stubGlobal('fetch', fetcher);
  await flushAlimtalk();
  expect(fetcher).not.toHaveBeenCalled();
  expect((await db.select().from(alimtalkOutbox))[0].status).toBe('skipped');
  vi.unstubAllGlobals();
});

it('keeps PG workspace members out of business alimtalk for now', async () => {
  const pgUser = await seedUser(db, { email: 'pg-talk@test.com' });
  const pgWs = await seedPgWorkspace(db, 'PG');
  await db
    .update(users)
    .set({ phone: '01087654321', emailVerified: true })
    .where(eq(users.id, pgUser.id));
  await db.insert(workspaceMembers).values({
    userId: pgUser.id,
    workspaceId: pgWs.id,
    approvalStatus: 'approved',
  });
  const pgRecipient = {
    userId: pgUser.id,
    workspaceId: pgWs.id,
    email: pgUser.email,
  };
  await db.transaction((tx) =>
    notify(tx, {
      ...input,
      recipients: [...input.recipients, pgRecipient],
    }),
  );
  expect(await db.select().from(alimtalkOutbox)).toMatchObject([
    { userId: input.recipients[0].userId },
  ]);

  // A PG row queued before this gate must not be sent either.
  await db.insert(alimtalkOutbox).values({
    userId: pgUser.id,
    workspaceId: pgWs.id,
    phone: '01087654321',
    template: 'awarded',
    rfpCode: 'P-1',
    linkUrl: 'https://partner.support-b.com/inbox/P-1',
    dedupeKey: 'legacy-pg',
  });
  const repo = await factory.getAlimtalkRepo();
  const rows = await repo.claim();
  const pgRow = rows.find((r) => r.userId === pgUser.id)!;
  expect(await repo.canSend(pgRow)).toBe(false);
});
it('flushes a chat message with the PG name and link variables', async () => {
  const { flushAlimtalk } = await import('@/lib/server/alimtalk/flush');
  await db.transaction((tx) =>
    notify(tx, {
      ...input,
      type: 'chat.message',
      alimtalk: {
        template: 'chatMessage',
        eventKey: 'chat:c1:2026-10-21',
        rfpCode: null,
        senderName: 'OO페이',
        linkUrl: 'https://support-b.com/messages?c=c1',
      },
    }),
  );
  for (const [k, v] of Object.entries({
    SOLAPI_API_KEY: 'key',
    SOLAPI_SECRET_KEY: 'secret',
    SOLAPI_SENDER: '0212345678',
    SOLAPI_KAKAO_PF_ID: 'channel',
    SOLAPI_TEMPLATE_CHAT_MESSAGE: 'chat-template',
  }))
    vi.stubEnv(k, v);
  const fetcher = vi.fn().mockResolvedValue(
    new Response(
      JSON.stringify({
        groupInfo: { count: { registeredSuccess: 1 } },
        messageList: [{ messageId: 'm', statusCode: '2000' }],
      }),
    ),
  );
  vi.stubGlobal('fetch', fetcher);
  await flushAlimtalk();
  expect(
    JSON.parse(fetcher.mock.calls[0][1].body).messages[0].kakaoOptions,
  ).toMatchObject({
    templateId: 'chat-template',
    variables: {
      '#{PG사}': 'OO페이',
      '#{링크}': 'https://support-b.com/messages?c=c1',
    },
  });
  vi.unstubAllGlobals();
});
