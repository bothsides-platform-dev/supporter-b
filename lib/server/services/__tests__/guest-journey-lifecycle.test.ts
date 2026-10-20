import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import {
  setupServerTestEnv,
  teardownServerTestEnv,
} from "@/lib/server/__tests__/_harness";
import { getGuestDraftService, guestSecretHash } from "../guest-drafts";
import {
  guestJourneys,
  guestJourneyEvents,
  users,
  workspaces,
  verificationApplications,
} from "@/lib/db/schema";
import { DrizzleGuestJourneyRepository } from "@/lib/server/repositories/drizzle/guest-journey";
let db: Awaited<ReturnType<typeof setupServerTestEnv>>;
beforeEach(async () => {
  db = await setupServerTestEnv();
  vi.stubEnv("GUEST_RFP_SLACK_THREADS_ENABLED", "true");
});
afterEach(() => {
  vi.unstubAllEnvs();
  teardownServerTestEnv();
});
it("binds a signup result, records final success, and removes journey records on account retirement", async () => {
  const [user] = await db
    .insert(users)
    .values({
      email: "journey@example.test",
      name: "test",
      passwordHash: "test",
    })
    .returning();
  const [workspace] = await db
    .insert(workspaces)
    .values({ type: "buyer", name: "test" })
    .returning();
  const [application] = await db
    .insert(verificationApplications)
    .values({ workspaceId: workspace.id, orgType: "buyer" })
    .returning();
  const owner = {
    userId: user.id,
    workspaceId: workspace.id,
    applicationId: application.id,
  };
  const id = randomUUID(),
    service = await getGuestDraftService();
  await service.savePublic(
    { id, revision: 0, answers: {}, files: [] },
    "proof",
  );
  await new DrizzleGuestJourneyRepository(db).start(
    id,
    guestSecretHash("proof"),
    0,
    new Date(),
  );
  await db.transaction((tx) =>
    service.bindSignup({ id, secret: "proof" }, owner, tx),
  );
  expect((await db.select().from(guestJourneys))[0].userId).toBe(user.id);
  expect(
    (await db.select().from(guestJourneyEvents)).map((e) => e.payload.name),
  ).toEqual(["sign_up"]);
  vi.stubEnv("GUEST_RFP_SLACK_THREADS_ENABLED", "false");
  const { withGuestJourney } = await import("../guest-journey");
  await db.transaction(tx => withGuestJourney(tx, repo => repo.submitted(id, owner, new Date())));
  expect((await db.select().from(guestJourneys))[0].retiredAt).not.toBeNull();
  expect((await db.select().from(guestJourneyEvents)).filter(e => e.id === "server:request")).toHaveLength(1);
  await db.transaction((tx) => service.retireUser(user.id, tx));
  expect(await db.select().from(guestJourneys)).toHaveLength(0);
});

it("does not send a second channel notification for a threaded draft through the legacy path", async () => {
  const { recordGuestEvent } = await import("../guest-rfp");
  const { guestRfpEvents } = await import("@/lib/db/schema");
  const id = randomUUID();
  await new DrizzleGuestJourneyRepository(db).start(
    id,
    guestSecretHash("proof"),
    0,
    new Date(),
  );
  vi.stubEnv("SLACK_WEBHOOK_URL", "");
  await recordGuestEvent({ draftId: id, event: "started", attachmentCount: 0 });
  expect(await db.select().from(guestRfpEvents)).toHaveLength(0);
});

it("rolls back partial telemetry after a SQL failure while committing the surrounding business transaction", async () => {
  const { withGuestJourney } = await import("../guest-journey");
  const id = randomUUID();
  const email = "telemetry-failure@example.test";
  await db.transaction(async (tx) => {
    const [user] = await tx.insert(users).values({
      email, name: "business", passwordHash: "test",
    }).returning();
    await withGuestJourney(tx, async (repo) => {
      await repo.start(id, "proof", 0, new Date());
      // Real FK violation after a successful telemetry write, not a JS rejection.
      await repo.bindSignup(id, "proof", {
        userId: user.id, workspaceId: randomUUID(),
      }, new Date());
    });
    await tx.insert(workspaces).values({ type: "buyer", name: "business committed" });
  });
  expect((await db.select().from(users)).map((row) => row.email)).toEqual([email]);
  expect((await db.select().from(workspaces)).map((row) => row.name)).toEqual(["business committed"]);
  expect(await db.select().from(guestJourneys)).toHaveLength(0);
  expect(await db.select().from(guestJourneyEvents)).toHaveLength(0);
});
