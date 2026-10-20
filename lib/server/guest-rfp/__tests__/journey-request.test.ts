import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import {
  setupServerTestEnv,
  teardownServerTestEnv,
} from "@/lib/server/__tests__/_harness";
import {
  guestJourneys,
  users,
  workspaces,
  workspaceMembers,
} from "@/lib/db/schema";
import { handleJourneyRequest } from "../journey-request";
const state = vi.hoisted(() => ({
  secret: undefined as string | undefined,
  session: null as {
    user: {
      id: string;
      workspaceId: string;
      workspaceType: string;
      isMaster?: boolean;
    };
  } | null,
  revoked: false,
  setCookie: vi.fn(),
}));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: () => (state.secret ? { value: state.secret } : undefined),
    set: (...args: unknown[]) => state.setCookie(...args),
  }),
}));
vi.mock("@/auth", () => ({ auth: async () => state.session }));
vi.mock("@/lib/auth/session", () => ({
  isSessionRevoked: async () => state.revoked,
}));
let db: Awaited<ReturnType<typeof setupServerTestEnv>>;
beforeEach(async () => {
  db = await setupServerTestEnv();
  state.secret = undefined;
  state.session = null;
  state.revoked = false;
  state.setCookie.mockClear();
  vi.stubEnv("GUEST_RFP_SLACK_THREADS_ENABLED", "true");
  vi.stubEnv("SLACK_GUEST_CHANNEL_ID", "");
});
afterEach(() => {
  vi.unstubAllEnvs();
  teardownServerTestEnv();
});
it("issues proof before creating a journey so a lost Set-Cookie response cannot strand its root", async () => {
  const input = {
    op: "start" as const,
    draftId: randomUUID(),
    attachmentCount: 0,
  };
  expect(await (await handleJourneyRequest(input)).json()).toEqual({
    enabled: true,
    ready: false,
  });
  expect(await db.select().from(guestJourneys)).toHaveLength(0);
  expect(state.setCookie.mock.calls[0][2]).toMatchObject({
    httpOnly: true,
    sameSite: "strict",
  });
  state.secret = state.setCookie.mock.calls[0][1];
  expect(await (await handleJourneyRequest(input)).json()).toEqual({
    enabled: true,
  });
  expect(await db.select().from(guestJourneys)).toHaveLength(1);
});
it("requires active verified buyer membership to adopt, then rejects revoked and wrong workspace sessions", async () => {
  state.secret = "proof";
  const id = randomUUID();
  await handleJourneyRequest({ op: "start", draftId: id, attachmentCount: 0 });
  const [user] = await db
    .insert(users)
    .values({
      email: "journey@example.test",
      name: "test",
      passwordHash: "test",
      emailVerified: true,
    })
    .returning();
  const [workspace] = await db
    .insert(workspaces)
    .values({ name: "test", type: "buyer", status: "active" })
    .returning();
  const actor = { userId: user.id, workspaceId: workspace.id };
  state.session = {
    user: { id: user.id, workspaceId: workspace.id, workspaceType: "buyer" },
  };
  const bind = { op: "bind" as const, draftId: id, expected: actor };
  expect((await handleJourneyRequest(bind)).status).toBe(403);
  await db.insert(workspaceMembers).values({ ...actor, role: "admin" });
  expect((await handleJourneyRequest(bind)).status).toBe(200);
  state.secret = undefined;
  const event = {
    op: "events" as const,
    draftId: id,
    expected: actor,
    events: [],
  };
  expect((await handleJourneyRequest(event)).status).toBe(200);
  state.revoked = true;
  expect((await handleJourneyRequest(event)).status).toBe(403);
  state.revoked = false;
  state.session.user.workspaceId = randomUUID();
  expect((await handleJourneyRequest(event)).status).toBe(403);
});
