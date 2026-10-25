import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import {
  setupServerTestEnv,
  teardownServerTestEnv,
} from "@/lib/server/__tests__/_harness";
import {
  seedBuyerWorkspace,
  seedUser,
  seedPgWorkspace,
  seedMembership,
} from "@/lib/server/repositories/drizzle/__tests__/_seed";
import { seedMatchingPolicy } from "@/lib/server/repositories/drizzle/__tests__/_matching-seed";
import { getGuestDraftService } from "../guest-drafts";
import * as requests from "../guest-requests";
import { seedBusinessCalendar } from "@/lib/server/__tests__/_business-calendar";
import { users, rfps, notifications } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
vi.mock("@/lib/auth/signup-documents", async () => {
  const { TEST_SIGNUP_DOCUMENTS } =
    await import("@/lib/auth/__tests__/signup-consent-fixture");
  return { getSignupConsentDocuments: () => TEST_SIGNUP_DOCUMENTS };
});
vi.mock("@/lib/server/outbox/post-commit", () => ({
  flushAfterCommit: vi.fn(),
}));
vi.mock("@/lib/server/notifications/dispatch", async (original) => ({
  ...(await original<object>()),
  emitAfterCommit: vi.fn(),
}));
let db: Awaited<ReturnType<typeof setupServerTestEnv>>;
let actor: { userId: string; workspaceId: string };
let id: string;
let pgId: string;
beforeEach(async () => {
  vi.stubEnv("GUEST_RFP_AUTO_SEND_ENABLED", "true");
  db = await setupServerTestEnv();
  await seedBusinessCalendar();
  const user = await seedUser(db);
  const ws = await seedBuyerWorkspace(db);
  await seedMembership(db, ws.id, user.id, "admin");
  actor = { userId: user.id, workspaceId: ws.id };
  pgId = (await seedPgWorkspace(db, "Alpha Payments")).id;
  const pgUser = await seedUser(db);
  await seedMembership(db, pgId, pgUser.id, "admin", { approvalStatus: "approved" });
  const policy = await seedMatchingPolicy(db, [pgId]);
  id = randomUUID();
  await (
    await getGuestDraftService()
  ).savePublic(
    {
      id,
      revision: 0,
      files: [],
      answers: {
        title: "판매 견적",
        industryGroupId: policy.industryGroupId,
        industryMode: "registered",
        websiteUrl: "https://example.com",
        mainProducts: "의류",
        contractType: "new",
        deliveryServicePeriod: "D+3",
        requiredPaymentMethods: ["card"],
        productInfo: {
          cashConvertible: false,
          maximumPrice: "under_100k",
          salesMethods: ["none"],
        },
      },
    },
    "secret",
  );
});
afterEach(() => {
  vi.unstubAllEnvs();
  teardownServerTestEnv();
});
it("publishes only candidate identifiers, names and order to the draft proof holder", async () => {
  const service = await requests.getGuestRequestService();
  await expect(service.recommend(id, "wrong")).rejects.toThrow(
    "GUEST_DRAFT_UNAVAILABLE",
  );
  expect(await service.recommend(id, "secret")).toEqual({
    summary: {
      title: "판매 견적",
      websiteUrl: "https://example.com",
      mainProducts: "의류",
    },
    available: true,
    candidates: [{ id: pgId, name: "Alpha Payments", order: 0 }],
  });
});
it("freezes confirmed answers until cancellation and refuses a different PG", async () => {
  const service = await requests.getGuestRequestService();
  await expect(
    service.reserve({ id, revision: 1, pgId: randomUUID(), days: 5 }, "secret"),
  ).rejects.toThrow("MATCHING_UNAVAILABLE");
  await service.reserve({ id, revision: 1, pgId, days: 5 }, "secret");
  await expect(
    (await getGuestDraftService()).savePublic(
      { id, revision: 1, answers: { title: "변경" }, files: [] },
      "secret",
    ),
  ).rejects.toThrow("GUEST_REQUEST_FROZEN");
  await service.cancel(id, { secret: "secret" });
  await expect(
    (await getGuestDraftService()).savePublic(
      { id, revision: 1, answers: { title: "변경" }, files: [] },
      "secret",
    ),
  ).resolves.toMatchObject({ revision: 2 });
});
it("waits for verification, then commits one RFP and one buyer notification across retries", async () => {
  const service = await requests.getGuestRequestService();
  await service.reserve({ id, revision: 1, pgId, days: 5 }, "secret");
  await db
    .update(users)
    .set({ emailVerified: false })
    .where(eq(users.id, actor.userId));
  await service.bind(id, "secret", actor);
  await service.dispatch(id);
  expect(await db.select().from(rfps)).toHaveLength(0);
  await expect(service.status(id, { secret: "secret" })).rejects.toThrow(
    "GUEST_DRAFT_UNAVAILABLE",
  );
  await db
    .update(users)
    .set({ emailVerified: true })
    .where(eq(users.id, actor.userId));
  await service.dispatch(id);
  await service.dispatch(id);
  expect(await db.select().from(rfps)).toHaveLength(1);
  expect(
    (await db.select().from(notifications)).filter(
      (n) => n.type === "rfp.auto_sent",
    ),
  ).toHaveLength(1);
  expect(await service.status(id, { actor })).toMatchObject({
    status: "submitted",
    pgName: "Alpha Payments",
    effectSeen: false,
  });
  expect(await service.claimEffect(id, actor)).toBe(true);
  expect(await service.claimEffect(id, actor)).toBe(false);
});
it("expires after thirty days without sending or deleting the answers", async () => {
  const service = await requests.getGuestRequestService();
  await service.reserve({ id, revision: 1, pgId, days: 3 }, "secret");
  await service.bind(id, "secret", actor);
  await service.dispatch(id, new Date(Date.now() + 30 * 86400000 + 1000));
  expect(await service.status(id, { actor })).toMatchObject({
    status: "expired",
  });
  expect(await db.select().from(rfps)).toHaveLength(0);
  await service.cancel(id, { actor });
  expect(await service.status(id, { actor })).toMatchObject({ status: "canceled" });
});
it("keeps canceled requests unsent and preserves answers", async () => {
  const service = await requests.getGuestRequestService();
  await service.reserve({ id, revision: 1, pgId, days: 5 }, "secret");
  await service.bind(id, "secret", actor);
  await service.cancel(id, { actor });
  await service.dispatch(id);
  expect(await service.status(id, { actor })).toMatchObject({
    status: "canceled",
  });
  expect(await db.select().from(rfps)).toHaveLength(0);
});
it("pauses dispatch while retaining the confirmed reservation", async () => {
  const service = await requests.getGuestRequestService();
  await service.reserve({ id, revision: 1, pgId, days: 5 }, "secret");
  await service.bind(id, "secret", actor);
  await db
    .update(users)
    .set({ emailVerified: true })
    .where(eq(users.id, actor.userId));
  vi.stubEnv("GUEST_RFP_AUTO_SEND_ENABLED", "false");
  await service.dispatch(id);
  expect(await service.status(id, { actor })).toMatchObject({
    status: "waiting",
  });
  expect(await db.select().from(rfps)).toHaveLength(0);
});
it("requires the owning membership for binding and status, including other workspaces of the same user", async () => {
  const service = await requests.getGuestRequestService();
  await service.reserve({ id, revision: 1, pgId, days: 5 }, "secret");
  const other = {
    userId: actor.userId,
    workspaceId: (await seedBuyerWorkspace(db)).id,
  };
  await expect(service.bind(id, "secret", other)).rejects.toThrow(
    "GUEST_DRAFT_UNAVAILABLE",
  );
  await service.bind(id, "secret", actor);
  await expect(service.status(id, { actor: other })).rejects.toThrow(
    "GUEST_DRAFT_UNAVAILABLE",
  );
});
it("allows an owner to explicitly reconfirm an expired request with a fresh thirty day window", async () => {
  const service = await requests.getGuestRequestService();
  await service.reserve({ id, revision: 1, pgId, days: 5 }, "secret");
  await service.bind(id, "secret", actor);
  await service.dispatch(id, new Date(Date.now() + 31 * 86400000));
  await service.reserve({ id, revision: 1, pgId, days: 10 }, { actor });
  expect(await service.status(id, { actor })).toMatchObject({
    status: "waiting",
    days: 10,
  });
});
it("enqueues the buyer completion email only once", async () => {
  const service = await requests.getGuestRequestService();
  await service.reserve({ id, revision: 1, pgId, days: 5 }, "secret");
  await service.bind(id, "secret", actor);
  await db
    .update(users)
    .set({ emailVerified: true })
    .where(eq(users.id, actor.userId));
  await service.dispatch(id);
  await service.dispatch(id);
  const { outboxEntries } = await import("@/lib/db/schema");
  expect(
    (await db.select().from(outboxEntries)).filter(
      (row) => row.event === "rfp.sent",
    ),
  ).toHaveLength(1);
});
it("retains waiting requests through a calendar outage and moves an unavailable chosen PG to needs_action", async () => {
  const { businessCalendarYears, workspaces } = await import("@/lib/db/schema");
  const service = await requests.getGuestRequestService();
  await service.reserve({ id, revision: 1, pgId, days: 5 }, "secret");
  await service.bind(id, "secret", actor);
  await db
    .update(users)
    .set({ emailVerified: true })
    .where(eq(users.id, actor.userId));
  await db.delete(businessCalendarYears);
  await service.dispatch(id);
  expect(await service.status(id, { actor })).toMatchObject({
    status: "waiting",
  });
  await seedBusinessCalendar();
  await db
    .update(workspaces)
    .set({ status: "suspended" })
    .where(eq(workspaces.id, pgId));
  await service.dispatch(id);
  expect(await service.status(id, { actor })).toMatchObject({
    status: "needs_action",
  });
  expect(await db.select().from(rfps)).toHaveLength(0);
});
it("retiring an unverified account cancels its reservation", async () => {
  const service = await requests.getGuestRequestService();
  await service.reserve({ id, revision: 1, pgId, days: 5 }, "secret");
  await service.bind(id, "secret", actor);
  await db.transaction((tx) =>
    getGuestDraftService().then((drafts) =>
      drafts.retireUser(actor.userId, tx),
    ),
  );
  const { guestRfpRequests } = await import("@/lib/db/schema");
  expect((await db.select().from(guestRfpRequests))[0].status).toBe("canceled");
  await service.dispatch(id);
  expect(await db.select().from(rfps)).toHaveLength(0);
});
it("rotates attempted waiting requests behind untouched requests", async () => {
  const service = await requests.getGuestRequestService();
  await service.reserve({ id, revision: 1, pgId, days: 5 }, "secret");
  await service.bind(id, "secret", actor);
  const { guestRfpDrafts, guestRfpRequests } = await import("@/lib/db/schema");
  const secondId = randomUUID();
  const [draft] = await db.select().from(guestRfpDrafts);
  const [request] = await db.select().from(guestRfpRequests);
  await db
    .insert(guestRfpDrafts)
    .values({ ...draft, id: secondId, requestKey: randomUUID() });
  await db
    .insert(guestRfpRequests)
    .values({
      ...request,
      draftId: secondId,
      confirmedAt: new Date(request.confirmedAt.getTime() + 1),
    });
  await service.dispatch(id);
  const { getGuestRequestRepo } =
    await import("@/lib/server/repositories/factory");
  expect((await (await getGuestRequestRepo()).pending(1))[0].id).toBe(secondId);
});
it("recovers waiting requests on another device only for their owning user", async () => {
  const service = await requests.getGuestRequestService();
  await service.reserve({ id, revision: 1, pgId, days: 5 }, "secret");
  await service.bind(id, "secret", actor);
  const { getGuestRequestRepo } =
    await import("@/lib/server/repositories/factory");
  const repo = await getGuestRequestRepo();
  expect(await repo.recover(actor.userId)).toMatchObject([
    { id, revision: 1, workspaceId: actor.workspaceId },
  ]);
  expect(await repo.recover(randomUUID())).toEqual([]);
});
it("does not let the manual resume flow take over a confirmed reservation", async () => {
  const service = await requests.getGuestRequestService();
  await service.reserve({ id, revision: 1, pgId, days: 5 }, "secret");
  await service.bind(id, "secret", actor);
  await db
    .update(users)
    .set({ emailVerified: true })
    .where(eq(users.id, actor.userId));
  await expect(
    (await getGuestDraftService()).resumeOwned(id, actor),
  ).rejects.toThrow("GUEST_REQUEST_FROZEN");
});

it("waits for administrator approval after verification, then sends once under concurrent dispatch", async () => {
  const { workspaces } = await import("@/lib/db/schema");
  const service = await requests.getGuestRequestService();
  await service.reserve({ id, revision: 1, pgId, days: 5 }, "secret");
  await service.bind(id, "secret", actor);
  await db
    .update(users)
    .set({ emailVerified: true })
    .where(eq(users.id, actor.userId));
  await db
    .update(workspaces)
    .set({ status: "pending" })
    .where(eq(workspaces.id, actor.workspaceId));
  await service.dispatch(id);
  expect(await db.select().from(rfps)).toHaveLength(0);
  await db
    .update(workspaces)
    .set({ status: "active" })
    .where(eq(workspaces.id, actor.workspaceId));
  await Promise.all([service.dispatch(id), service.dispatch(id)]);
  expect(await db.select().from(rfps)).toHaveLength(1);
  expect(
    (await db.select().from(notifications)).filter(
      (n) => n.type === "rfp.auto_sent",
    ),
  ).toHaveLength(1);
  expect(
    (
      await Promise.all([
        service.claimEffect(id, actor),
        service.claimEffect(id, actor),
      ])
    ).filter(Boolean),
  ).toHaveLength(1);
});
it("serializes cancellation with dispatch without leaving a canceled sent request", async () => {
  const service = await requests.getGuestRequestService();
  await service.reserve({ id, revision: 1, pgId, days: 5 }, "secret");
  await service.bind(id, "secret", actor);
  await db
    .update(users)
    .set({ emailVerified: true })
    .where(eq(users.id, actor.userId));
  await Promise.all([service.cancel(id, { actor }), service.dispatch(id)]);
  const status = await service.status(id, { actor });
  expect(["canceled", "submitted"]).toContain(status?.status);
  expect(await db.select().from(rfps)).toHaveLength(
    status?.status === "submitted" ? 1 : 0,
  );
});
it("rolls back the RFP when completion notification storage fails, then retries exactly once", async () => {
  const { getNotificationRepo } =
    await import("@/lib/server/repositories/factory");
  const service = await requests.getGuestRequestService();
  await service.reserve({ id, revision: 1, pgId, days: 5 }, "secret");
  await service.bind(id, "secret", actor);
  await db
    .update(users)
    .set({ emailVerified: true })
    .where(eq(users.id, actor.userId));
  const failure = vi
    .spyOn(await getNotificationRepo(), "saveMany")
    .mockRejectedValueOnce(new Error("database unavailable"));
  await expect(service.dispatch(id)).rejects.toThrow("database unavailable");
  failure.mockRestore();
  expect(await service.status(id, { actor })).toMatchObject({
    status: "waiting",
  });
  expect(await db.select().from(rfps)).toHaveLength(0);
  await service.dispatch(id);
  expect(await db.select().from(rfps)).toHaveLength(1);
});

it("binds the reservation with signup, without another draft selection or confirmation", async () => {
  const { phoneOtps, guestRfpDrafts, guestRfpRequests } =
    await import("@/lib/db/schema");
  const { getAuthService } = await import("../auth");
  const { TEST_SIGNUP_CONSENT } =
    await import("@/lib/auth/__tests__/signup-consent-fixture");
  const service = await requests.getGuestRequestService();
  await service.reserve({ id, revision: 1, pgId, days: 5 }, "secret");
  const [otp] = await db
    .insert(phoneOtps)
    .values({
      phone: "01012345678",
      purpose: "signup",
      userId: null,
      codeHash: "test",
      verifiedAt: new Date(),
      proofExpiresAt: new Date(Date.now() + 300000),
      expiresAt: new Date(Date.now() + 300000),
    })
    .returning();
  const result = await (
    await getAuthService()
  ).completeSignup({
    email: "automatic@example.com",
    name: "구매사",
    plainPassword: "Password123!",
    phone: "01012345678",
    phoneVerificationId: otp.id,
    wsKind: "buyer",
    wsName: "신규회사",
    consent: TEST_SIGNUP_CONSENT,
    guestDraft: { id, secret: "secret" },
  });
  expect(result, JSON.stringify(result)).toMatchObject({ ok: true });
  const [draft] = await db.select().from(guestRfpDrafts);
  const [request] = await db.select().from(guestRfpRequests);
  expect(draft).toMatchObject({
    userId: expect.any(String),
    workspaceId: expect.any(String),
    applicationId: expect.any(String),
    autoResumeConsumedAt: expect.any(Date),
  });
  expect(request).toMatchObject({
    status: "waiting",
    expiresAt: expect.any(Date),
  });
  // gstack-timing-ok: consent must remain valid for 30 days after account binding, not a performance threshold.
  expect(request.expiresAt!.getTime() - Date.now()).toBeGreaterThan(
    29 * 86400000,
  );
  expect(await db.select().from(rfps)).toHaveLength(0);
});

it('hands ready originals to the created RFP without another upload', async () => {
  const { guestRfpDrafts, guestRfpFiles, attachments } = await import('@/lib/db/schema');
  const clientId = randomUUID();
  const fileId = randomUUID();
  await db.update(guestRfpDrafts).set({ fileIds: [clientId] }).where(eq(guestRfpDrafts.id, id));
  await db.insert(guestRfpFiles).values({ id: fileId, clientId, draftId: id, name: '사업소개.pdf', size: 8, mime: 'application/pdf', status: 'ready' });
  const service = await requests.getGuestRequestService();
  await service.reserve({ id, revision: 1, pgId, days: 5 }, 'secret');
  await service.bind(id, 'secret', actor);
  await db.update(users).set({ emailVerified: true }).where(eq(users.id, actor.userId));
  await service.dispatch(id);
  const [rfp] = await db.select().from(rfps);
  expect((await db.select().from(attachments))).toMatchObject([{ id: fileId, rfpId: rfp.id, uploadedBy: actor.userId, status: 'ready' }]);
  expect((await db.select().from(guestRfpFiles))[0].attachmentId).toBe(fileId);
});

it('refuses a late cancellation instead of presenting a sent request as canceled', async () => {
  const service = await requests.getGuestRequestService();
  await service.reserve({ id, revision: 1, pgId, days: 5 }, 'secret');
  await service.bind(id, 'secret', actor);
  await db.update(users).set({ emailVerified: true }).where(eq(users.id, actor.userId));
  await service.dispatch(id);
  await expect(service.cancel(id, { actor })).rejects.toThrow('GUEST_REQUEST_ALREADY_SENT');
  expect(await service.status(id, { actor })).toMatchObject({ status: 'submitted' });
});

it('normalizes a scheme-less website just like the member request action', async () => {
  const { guestRfpDrafts } = await import('@/lib/db/schema');
  const [draft] = await db.select().from(guestRfpDrafts);
  await db.update(guestRfpDrafts).set({ answers: { ...draft.answers, data: { ...draft.answers.data, websiteUrl: 'shop.example.com' } } }).where(eq(guestRfpDrafts.id, id));
  const service = await requests.getGuestRequestService();
  await service.reserve({ id, revision: 1, pgId, days: 5 }, 'secret');
  await service.bind(id, 'secret', actor);
  await db.update(users).set({ emailVerified: true }).where(eq(users.id, actor.userId));
  await service.dispatch(id);
  expect((await db.select().from(rfps))[0].websiteUrl).toBe('https://shop.example.com');
});
