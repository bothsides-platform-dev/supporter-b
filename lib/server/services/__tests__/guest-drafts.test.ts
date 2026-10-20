import { InMemoryStorage } from "@/lib/server/storage/memory";
import { __setStorageForTest } from "@/lib/server/storage";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import {
  setupServerTestEnv,
  teardownServerTestEnv,
} from "@/lib/server/__tests__/_harness";
import { getGuestDraftService } from "../guest-drafts";
import { getAuthService } from "../auth";
import {
  phoneOtps,
  users,
  guestRfpDrafts,
  guestRfpFiles,
  attachments,
  workspaces,
} from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { TEST_SIGNUP_CONSENT } from "@/lib/auth/__tests__/signup-consent-fixture";
let db: Awaited<ReturnType<typeof setupServerTestEnv>>;
let service: Awaited<ReturnType<typeof getGuestDraftService>>;
beforeEach(async () => {
  db = await setupServerTestEnv();
  service = await getGuestDraftService();
});
afterEach(teardownServerTestEnv);
it("requires the secret to read or replace a public draft, even with its UUID", async () => {
  const id = randomUUID();
  const created = await service.savePublic(
    { id, revision: 0, answers: { title: "내 견적" }, files: [] },
    "secret",
  );
  expect(created.revision).toBe(1);
  await expect(
    service.savePublic(
      { id, revision: 1, answers: { title: "공격" }, files: [] },
      "wrong",
    ),
  ).rejects.toThrow("GUEST_DRAFT_UNAVAILABLE");
  expect(
    (
      await service.savePublic(
        { id, revision: 1, answers: { title: "수정" }, files: [] },
        "secret",
      )
    ).revision,
  ).toBe(2);
});
it("rejects stale revisions instead of overwriting a newer tab", async () => {
  const id = randomUUID();
  await service.savePublic(
    { id, revision: 0, answers: { title: "처음" }, files: [] },
    "secret",
  );
  await service.savePublic(
    { id, revision: 1, answers: { title: "최신" }, files: [] },
    "secret",
  );
  await expect(
    service.savePublic(
      { id, revision: 1, answers: { title: "낡음" }, files: [] },
      "secret",
    ),
  ).rejects.toThrow("GUEST_DRAFT_CHANGED");
});
it("expires unclaimed drafts after the last save, and cannot revive them with an old revision", async () => {
  const id = randomUUID();
  const old = new Date(Date.now() - 86400001);
  await service.savePublic(
    { id, revision: 0, answers: {}, files: [] },
    "secret",
    old,
  );
  await expect(
    service.savePublic({ id, revision: 1, answers: {}, files: [] }, "secret"),
  ).rejects.toThrow("GUEST_DRAFT_UNAVAILABLE");
});
it("keeps failed uploads reserved and enforces the file cap under concurrent requests", async () => {
  const id = randomUUID();
  await service.savePublic(
    { id, revision: 0, answers: {}, files: [] },
    "secret",
  );
  const results = await Promise.allSettled(
    Array.from({ length: 7 }, () =>
      service.reservePublicFile(id, "secret", {
        clientId: randomUUID(),
        name: "a.pdf",
        size: 5,
        mime: "application/pdf",
      }),
    ),
  );
  expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(5);
});
it("reuses a pending file id after a lost response, without consuming another slot", async () => {
  const id = randomUUID();
  await service.savePublic(
    { id, revision: 0, answers: {}, files: [] },
    "secret",
  );
  const file = {
    clientId: randomUUID(),
    name: "a.pdf",
    size: 5,
    mime: "application/pdf" as const,
  };
  const first = await service.reservePublicFile(id, "secret", file);
  expect((await service.reservePublicFile(id, "secret", file)).id).toBe(
    first.id,
  );
});

async function signup(
  guestDraft: { id: string; secret: string },
  email = "guest@example.com",
) {
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
  return (await getAuthService()).completeSignup({
    email,
    name: "구매사",
    plainPassword: "Password123!",
    phone: "01012345678",
    phoneVerificationId: otp.id,
    wsKind: "buyer",
    wsName: "구매회사",
    consent: TEST_SIGNUP_CONSENT,
    guestDraft,
  });
}
it("binds signup atomically and keeps exact-proof replay on the login recovery path", async () => {
  const id = randomUUID();
  await service.savePublic(
    { id, revision: 0, answers: { title: "내 견적" }, files: [] },
    "secret",
  );
  const result = await signup({ id, secret: "secret" });
  expect(result.ok).toBe(true);
  const [draft] = await db.select().from(guestRfpDrafts);
  expect(draft.userId).toBeTruthy();
  expect(draft.workspaceId).toBeTruthy();
  expect(draft.applicationId).toBeTruthy();
  expect(draft.expiresAt).toBeNull();
  expect(await signup({ id, secret: "secret" })).toEqual({
    ok: false,
    error: "EMAIL_TAKEN",
  });
  expect(await db.select().from(users)).toHaveLength(1);
});
it("rolls back account and workspace creation when draft ownership proof fails", async () => {
  const id = randomUUID();
  await service.savePublic(
    { id, revision: 0, answers: {}, files: [] },
    "secret",
  );
  expect(await signup({ id, secret: "wrong" })).toEqual({
    ok: false,
    error: "GUEST_DRAFT_UNAVAILABLE",
  });
  expect(await db.select().from(users)).toHaveLength(0);
  expect(await db.select().from(workspaces)).toHaveLength(0);
});
it("requires ready files at signup and retains the anonymous draft on failure", async () => {
  const id = randomUUID(),
    clientId = randomUUID();
  await service.savePublic(
    { id, revision: 0, answers: {}, files: [clientId] },
    "secret",
  );
  await service.reservePublicFile(id, "secret", {
    clientId,
    name: "a.pdf",
    size: 5,
    mime: "application/pdf",
  });
  expect(await signup({ id, secret: "secret" })).toEqual({
    ok: false,
    error: "GUEST_FILES_NOT_READY",
  });
  expect(await db.select().from(users)).toHaveLength(0);
  expect((await db.select().from(guestRfpDrafts))[0].userId).toBeNull();
});
vi.mock("@/lib/auth/signup-documents", async () => {
  const { TEST_SIGNUP_DOCUMENTS } =
    await import("@/lib/auth/__tests__/signup-consent-fixture");
  return { getSignupConsentDocuments: () => TEST_SIGNUP_DOCUMENTS };
});

it("validates uploaded bytes and hands ready files over once without another upload", async () => {
  const storage = new InMemoryStorage();
  __setStorageForTest(storage);
  const id = randomUUID(),
    clientId = randomUUID();
  const bytes = Buffer.from("%PDF-1.7");
  await service.savePublic(
    { id, revision: 0, answers: { title: "복원" }, files: [clientId] },
    "secret",
  );
  const file = await service.reservePublicFile(id, "secret", {
    clientId,
    name: "a.pdf",
    size: bytes.length,
    mime: "application/pdf",
  });
  await storage.save(`pending/${file.id}`, bytes, "application/pdf");
  expect(await service.completePublicFile(id, "secret", file.id)).toMatchObject(
    { ok: true },
  );
  expect(await signup({ id, secret: "secret" })).toMatchObject({ ok: true });
  const [draft] = await db.select().from(guestRfpDrafts);
  const actor = { userId: draft.userId!, workspaceId: draft.workspaceId! };
  expect(await service.listOwned(actor)).toEqual([]);
  await db
    .update(users)
    .set({ emailVerified: true })
    .where(eq(users.id, actor.userId));
  await db
    .update(workspaces)
    .set({ status: "active" })
    .where(eq(workspaces.id, actor.workspaceId));
  // More than 24h pending approval does not expire a bound draft.
  await db
    .update(guestRfpDrafts)
    .set({ updatedAt: new Date(Date.now() - 172800000) });
  expect(await service.listOwned(actor)).toHaveLength(1);
  expect(await service.listOwned({ ...actor, userId: randomUUID() })).toEqual(
    [],
  );
  const first = await service.resumeOwned(id, actor);
  const second = await service.resumeOwned(id, actor);
  expect(first.files).toEqual([
    { id: file.id, name: "a.pdf", size: bytes.length },
  ]);
  expect(second.files).toEqual(first.files);
  expect(await db.select().from(attachments)).toHaveLength(1);
  expect(
    (await db.select().from(guestRfpDrafts))[0].resumeConsumedAt,
  ).not.toBeNull();
  expect(JSON.stringify(first)).not.toContain("secretHash");
});
it("refuses MIME lies and never marks them ready", async () => {
  const storage = new InMemoryStorage();
  __setStorageForTest(storage);
  const id = randomUUID(),
    clientId = randomUUID();
  await service.savePublic(
    { id, revision: 0, answers: {}, files: [clientId] },
    "secret",
  );
  const file = await service.reservePublicFile(id, "secret", {
    clientId,
    name: "a.pdf",
    size: 8,
    mime: "application/pdf",
  });
  await storage.save(
    `pending/${file.id}`,
    Buffer.from("notapdf!"),
    "application/pdf",
  );
  expect(await service.completePublicFile(id, "secret", file.id)).toMatchObject(
    { ok: false, reason: "mime-mismatch" },
  );
  expect(
    (await db.select().from(guestRfpFiles)).every(
      (file) => file.status !== "ready",
    ),
  ).toBe(true);
});

async function approvedDraft() {
  const id = randomUUID();
  await service.savePublic(
    { id, revision: 0, answers: { title: "처음" }, files: [] },
    "secret",
  );
  await signup({ id, secret: "secret" });
  const [row] = await db
    .select()
    .from(guestRfpDrafts)
    .where(eq(guestRfpDrafts.id, id));
  const actor = { userId: row.userId!, workspaceId: row.workspaceId! };
  await db
    .update(users)
    .set({ emailVerified: true })
    .where(eq(users.id, actor.userId));
  await db
    .update(workspaces)
    .set({ status: "active" })
    .where(eq(workspaces.id, actor.workspaceId));
  await service.resumeOwned(id, actor);
  return { id, actor };
}
it("saves member edits with revision checks and rejects another workspace", async () => {
  const { id, actor } = await approvedDraft();
  expect(
    await service.saveOwned(
      { id, revision: 1, answers: { title: "최신" }, files: [] },
      actor,
    ),
  ).toMatchObject({ revision: 2 });
  await expect(
    service.saveOwned(
      { id, revision: 1, answers: { title: "낡음" }, files: [] },
      actor,
    ),
  ).rejects.toThrow("GUEST_DRAFT_CHANGED");
  await expect(
    service.saveOwned(
      { id, revision: 2, answers: {}, files: [] },
      { ...actor, workspaceId: randomUUID() },
    ),
  ).rejects.toThrow("GUEST_DRAFT_UNAVAILABLE");
  expect((await service.listOwned(actor))[0].answers.title).toBe("최신");
});
it("rejects stale deletion and preserves retry records when object deletion fails", async () => {
  const storage = new InMemoryStorage();
  __setStorageForTest(storage);
  const id = randomUUID(),
    clientId = randomUUID();
  await service.savePublic(
    { id, revision: 0, answers: {}, files: [clientId] },
    "secret",
    new Date(Date.now() - 172800000),
  );
  // Seed a previously uploaded object before expiry.
  const [file] = await db
    .insert(guestRfpFiles)
    .values({
      id: randomUUID(),
      clientId,
      draftId: id,
      name: "a.pdf",
      size: 8,
      mime: "application/pdf",
      status: "ready",
    })
    .returning();
  await storage.save(file.id, Buffer.from("%PDF-1.7"), file.mime);
  const deletion = vi
    .spyOn(storage, "delete")
    .mockRejectedValue(new Error("offline"));
  await service.sweep();
  expect((await db.select().from(guestRfpFiles))[0].status).toBe("deleting");
  deletion.mockRestore();
  await service.sweep();
  expect(await db.select().from(guestRfpFiles)).toHaveLength(0);
  const bound = await approvedDraft();
  await service.saveOwned(
    { id: bound.id, revision: 1, answers: { title: "수정" }, files: [] },
    bound.actor,
  );
  await expect(service.deleteOwned(bound.id, 1, bound.actor)).rejects.toThrow(
    "GUEST_DRAFT_CHANGED",
  );
  expect(await service.listOwned(bound.actor)).toHaveLength(1);
  await service.deleteOwned(bound.id, 2, bound.actor);
  expect(await service.listOwned(bound.actor)).toEqual([]);
});

it("does not delete a ready object when a late completion loses a race to signup", async () => {
  const storage = new InMemoryStorage();
  __setStorageForTest(storage);
  const id = randomUUID(),
    clientId = randomUUID();
  await service.savePublic(
    { id, revision: 0, answers: {}, files: [clientId] },
    "secret",
  );
  const file = await service.reservePublicFile(id, "secret", {
    clientId,
    name: "a.pdf",
    size: 8,
    mime: "application/pdf",
  });
  await storage.save(`pending/${file.id}`, Buffer.from("%PDF-1.7"), file.mime);
  const promote = storage.promote.bind(storage);
  vi.spyOn(storage, "promote").mockImplementation(async (...args) => {
    await promote(...args);
    // Another completion commits ready, then signup binds the parent before our commit.
    await db
      .update(guestRfpFiles)
      .set({ status: "ready" })
      .where(eq(guestRfpFiles.id, file.id));
    expect(await signup({ id, secret: "secret" })).toMatchObject({ ok: true });
  });
  expect(await service.completePublicFile(id, "secret", file.id)).toMatchObject(
    { ok: true },
  );
  expect(await storage.head(file.id)).toMatchObject({ size: 8 });
});

it("deletes files added after restoration when the draft is explicitly deleted", async () => {
  const { id, actor } = await approvedDraft();
  const [file] = await db
    .insert(attachments)
    .values({
      name: "added.pdf",
      size: 8,
      mimeType: "application/pdf",
      uploadedBy: actor.userId,
      status: "ready",
    })
    .returning();
  await service.saveOwned(
    { id, revision: 1, answers: {}, files: [file.id] },
    actor,
  );
  await service.deleteOwned(id, 2, actor);
  expect(
    await db.select().from(attachments).where(eq(attachments.id, file.id)),
  ).toHaveLength(0);
  expect((await db.select().from(guestRfpFiles))[0]).toMatchObject({
    id: file.id,
    status: "deleting",
  });
});
it("allows account deletion with a bound draft and clears its retained answers", async () => {
  const { actor } = await approvedDraft();
  expect(
    await (
      await getAuthService()
    ).deleteAccount({ userId: actor.userId, plainPassword: "Password123!" }),
  ).toEqual({ ok: true });
  expect((await db.select().from(guestRfpDrafts))[0]).toMatchObject({
    answers: { version: 1, data: {} },
    userId: null,
    workspaceId: null,
    applicationId: null,
  });
});

it("consumes automatic return when choosing a different draft without handing off files", async () => {
  const { id, actor } = await approvedDraft();
  await db
    .update(guestRfpDrafts)
    .set({ resumeConsumedAt: null, autoResumeConsumedAt: null })
    .where(eq(guestRfpDrafts.id, id));
  await service.dismissAutomaticResume(actor);
  expect((await service.listOwned(actor))[0].resumePending).toBe(false);
  expect(
    (await db.select().from(guestRfpDrafts))[0].resumeConsumedAt,
  ).toBeNull();
  expect((await service.resumeOwned(id, actor)).id).toBe(id);
});

it("allows undoing an attachment removal after autosave without deleting its bytes", async () => {
  const { id, actor } = await approvedDraft();
  const [file] = await db
    .insert(attachments)
    .values({
      name: "undo.pdf",
      size: 8,
      mimeType: "application/pdf",
      uploadedBy: actor.userId,
      status: "ready",
    })
    .returning();
  await service.saveOwned(
    { id, revision: 1, answers: {}, files: [file.id] },
    actor,
  );
  await service.saveOwned({ id, revision: 2, answers: {}, files: [] }, actor);
  expect(
    await service.saveOwned(
      { id, revision: 3, answers: {}, files: [file.id] },
      actor,
    ),
  ).toMatchObject({ revision: 4 });
  expect((await service.resumeOwned(id, actor)).files).toHaveLength(1);
});


it('limits anonymous draft reservations atomically per browser proof', async () => {
  const results = await Promise.allSettled(Array.from({ length: 8 }, () =>
    service.savePublic({ id: randomUUID(), revision: 0, answers: {}, files: [] }, 'same-proof')));
  expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(5);
  expect(results.filter(r => r.status === 'rejected')).toHaveLength(3);
});

it('bounds global anonymous drafts even when callers rotate proofs', async () => {
  await db.insert(guestRfpDrafts).values(Array.from({ length: 1000 }, (_, i) => ({
    id: randomUUID(), secretHash: `proof-${i}`, answers: { version: 1 as const, data: {} },
  })));
  await expect(service.savePublic({ id: randomUUID(), revision: 0, answers: {}, files: [] }, 'new-proof'))
    .rejects.toThrow('GUEST_DRAFT_LIMIT');
});

it('keeps retired file bytes in the reservation budget until storage deletion succeeds', async () => {
  const id = randomUUID();
  await service.savePublic({ id, revision: 0, answers: {}, files: [] }, 'secret');
  await db.insert(guestRfpFiles).values(Array.from({ length: 5 }, () => ({
    id: randomUUID(), draftId: id, clientId: randomUUID(), name: 'a.pdf', size: 10,
    mime: 'application/pdf', status: 'deleting' as const,
  })));
  await expect(service.reservePublicFile(id, 'secret', { clientId: randomUUID(), name: 'b.pdf', size: 10, mime: 'application/pdf' }))
    .rejects.toThrow('GUEST_FILE_LIMIT');
});

it('reclaims old empty anonymous tombstones but preserves live drafts', async () => {
  const old = randomUUID();
  const live = randomUUID();
  await db.insert(guestRfpDrafts).values([
    { id: old, secretHash: 'old', answers: { version: 1, data: {} }, deletedAt: new Date(Date.now() - 8 * 86400000) },
    { id: live, secretHash: 'live', answers: { version: 1, data: {} } },
  ]);
  await service.sweep();
  expect((await db.select().from(guestRfpDrafts)).map(r => r.id)).toEqual([live]);
});


it('rejects new public file bytes when the durable global reservation budget is full', async () => {
  const id = randomUUID();
  await service.savePublic({ id, revision: 0, answers: {}, files: [] }, 'secret');
  const occupied = randomUUID();
  await db.insert(guestRfpDrafts).values({ id: occupied, secretHash: 'other', answers: { version: 1, data: {} } });
  await db.insert(guestRfpFiles).values(Array.from({ length: 52 }, () => ({
    id: randomUUID(), draftId: occupied, clientId: randomUUID(), name: 'a.pdf', size: 20 * 1024 * 1024, mime: 'application/pdf',
  })));
  await expect(service.reservePublicFile(id, 'secret', { clientId: randomUUID(), name: 'b.pdf', size: 10, mime: 'application/pdf' }))
    .rejects.toThrow('GUEST_FILE_LIMIT');
});
