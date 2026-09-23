import { randomUUID } from "node:crypto";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { createPgliteDb, type PgliteDB } from "@/lib/db/client-pglite";
import {
  seedRfp,
  seedBuyerWorkspace,
} from "@/lib/server/repositories/drizzle/__tests__/_seed";
import { markInvitationOpenedAction } from "@/lib/server/actions/invitation/markInvitationOpenedAction";
import { getInvitationRepo } from "@/lib/server/repositories/factory";
import { users, workspaces, workspaceMembers } from "@/lib/db/schema";
import {
  __resetForTest,
  __useDrizzleWithDbForTest,
} from "@/lib/server/repositories/factory";
const authMock = vi.hoisted(() => vi.fn());
vi.mock("@/auth", () => ({ auth: authMock }));
import {
  requireSession,
  requireBuyerSession,
  requirePgSession,
} from "../session";
import { requireActiveWorkspace } from "@/lib/server/actions/_session";

describe("workspace status at server business boundaries", () => {
  let db: PgliteDB;
  const userId = randomUUID();
  const workspaceId = randomUUID();
  const suspendWorkspace = () =>
    db
      .update(workspaces)
      .set({ status: "suspended" })
      .where(eq(workspaces.id, workspaceId));
  beforeEach(async () => {
    db = await createPgliteDb();
    await __useDrizzleWithDbForTest(db);
    await db
      .insert(users)
      .values({
        id: userId,
        name: "Member",
        email: "member@example.com",
        passwordHash: "unused",
        emailVerified: true,
      });
    await db
      .insert(workspaces)
      .values({
        id: workspaceId,
        name: "Workspace",
        type: "buyer",
        status: "active",
      });
    await db
      .insert(workspaceMembers)
      .values({
        userId,
        workspaceId,
        role: "admin",
        approvalStatus: "approved",
      });
    authMock.mockResolvedValue({
      user: {
        id: userId,
        email: "member@example.com",
        sessionVersion: 1,
        workspaceId,
        workspaceType: "buyer",
        role: "admin",
      },
    });
  });
  afterEach(() => {
    __resetForTest();
    vi.unstubAllEnvs();
  });
  it.each(["pending", "suspended"] as const)(
    "blocks %s workspaces in buyer and shared actions",
    async (status) => {
      await db
        .update(workspaces)
        .set({ status })
        .where(eq(workspaces.id, workspaceId));
      await expect(requireBuyerSession()).rejects.toThrow("WORKSPACE_INACTIVE");
      expect((await requireActiveWorkspace()).ok).toBe(false);
    },
  );
  it("blocks a suspended PG even when its membership is approved", async () => {
    await db
      .update(workspaces)
      .set({ status: "suspended", type: "pg" })
      .where(eq(workspaces.id, workspaceId));
    const session = await authMock();
    session.user.workspaceType = "pg";
    await expect(requirePgSession()).rejects.toThrow("WORKSPACE_INACTIVE");
  });
  it("allows active workspaces and rechecks status on the next request", async () => {
    await expect(requireBuyerSession()).resolves.toBeTruthy();
    await suspendWorkspace();
    await expect(requireBuyerSession()).rejects.toThrow("WORKSPACE_INACTIVE");
  });
  it("fails closed when the selected workspace is missing", async () => {
    const session = await authMock();
    session.user.workspaceId = randomUUID();
    await expect(requireBuyerSession()).rejects.toThrow("WORKSPACE_INACTIVE");
  });
  it("keeps account recovery and workspace switching accessible", async () => {
    await suspendWorkspace();
    await expect(
      requireSession({ allowInactiveWorkspace: true }),
    ).resolves.toBeTruthy();
  });
  it.each([
    ["notifications", "GET"],
    ["notifications/stream", "GET"],
    ["centrifugo/connection-token", "POST"],
    ["files/presign", "POST"],
    ["files/[id]/complete", "POST"],
    ["files/[id]", "GET"],
    ["files/[id]", "DELETE"],
    ["contract-archives/presign", "POST"],
    ["contract-archives/[id]/complete", "POST"],
    ["contract-archives/[id]/download", "GET"],
    ["workspace/[id]/avatar", "POST"],
    ["workspace/[id]/avatar", "DELETE"],
    ["workspaces/search", "GET"],
    ["signing/templates/preview", "POST"],
    ["signing/templates/[templateId]/document", "GET"],
    ["signing/[contractId]/document", "GET"],
  ])(
    "rejects suspended workspaces at %s %s before performing work",
    async (route, method) => {
      await suspendWorkspace();
      if (route.startsWith("signing/")) {
        const session = await authMock();
        session.user.workspaceType = "pg";
        await db
          .update(workspaces)
          .set({ type: "pg" })
          .where(eq(workspaces.id, workspaceId));
      }
      vi.stubEnv("CENTRIFUGO_TOKEN_HMAC_SECRET", "local-test-secret");
      const handlers = await import(
        /* @vite-ignore */ `../../../app/api/${route}/route.ts`
      );
      const controller = new AbortController();
      const request = new NextRequest("http://localhost/api/test?type=pg", {
        method,
        signal: controller.signal,
      });
      const response = await handlers[method](request, {
        params: Promise.resolve({
          id: workspaceId,
          templateId: randomUUID(),
          contractId: randomUUID(),
        }),
      });
      controller.abort();
      await response.body?.cancel();
      expect(response.status).toBe(403);
    },
  );

  it("does not mark an invitation opened for a suspended PG", async () => {
    const buyer = await seedBuyerWorkspace(db);
    const rfp = await seedRfp(db, { buyerWsId: buyer.id, createdBy: userId });
    const repo = await getInvitationRepo();
    await repo.save(
      {
        id: randomUUID(),
        rfpId: rfp.id,
        pgWsId: workspaceId,
        uniqueToken: "",
        status: "sent",
        sentAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 86400000).toISOString(),
      },
      "local-test-invite",
    );
    await db
      .update(workspaces)
      .set({ type: "pg", status: "suspended" })
      .where(eq(workspaces.id, workspaceId));
    (await authMock()).user.workspaceType = "pg";
    await markInvitationOpenedAction({ rfpId: rfp.id });
    expect((await repo.findByRfp(rfp.id))[0].status).toBe("sent");
  });
});
