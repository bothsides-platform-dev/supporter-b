/**
 * @vitest-environment node
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";

import { attachments } from "@/lib/db/schema";
import { createPgliteDb, type PgliteDB } from "@/lib/db/client-pglite";
import {
  __resetForTest,
  __useDrizzleWithDbForTest,
} from "@/lib/server/repositories/factory";
import { seedUser } from "@/lib/server/repositories/drizzle/__tests__/_seed";
import {
  __resetStorageForTest,
  __setStorageForTest,
} from "@/lib/server/storage";
import { InMemoryStorage } from "@/lib/server/storage/memory";

const sessionRef: { value: unknown | null } = { value: null };
vi.mock("@/auth", () => ({ auth: () => Promise.resolve(sessionRef.value) }));

const getDbSessionVersionMock = vi.hoisted(() => vi.fn());
const getDbEmailVerifiedMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/auth/session-version-db", () => ({
  getDbSessionVersion: (...a: unknown[]) => getDbSessionVersionMock(...a),
  getDbEmailVerified: (...a: unknown[]) => getDbEmailVerifiedMock(...a),
}));

let db: PgliteDB;
let storage: InMemoryStorage;

beforeEach(async () => {
  __resetForTest();
  __resetStorageForTest();
  db = await createPgliteDb();
  await __useDrizzleWithDbForTest(db);
  storage = new InMemoryStorage();
  __setStorageForTest(storage);
  sessionRef.value = null;
  getDbSessionVersionMock.mockReset();
  getDbSessionVersionMock.mockResolvedValue(1);
  getDbEmailVerifiedMock.mockReset();
  getDbEmailVerifiedMock.mockResolvedValue(true);
});

afterEach(() => {
  __setStorageForTest(undefined);
  __resetStorageForTest();
  __resetForTest();
});

async function callDelete(id: string) {
  const { DELETE } = await import("../[id]/route");
  return DELETE(
    new Request(`http://localhost/api/files/${id}`, { method: "DELETE" }),
    {
      params: Promise.resolve({ id }),
    },
  );
}

async function seedDraft(userId: string) {
  const id = randomUUID();
  await db.insert(attachments).values({
    id,
    name: "draft.pdf",
    size: 12,
    mimeType: "application/pdf",
    uploadedBy: userId,
  });
  await storage.save(id, Buffer.from("%PDF draft"), "application/pdf");
  return id;
}

describe("DELETE /api/files/[id]", () => {
  it("인증되지 않은 요청은 401이다", async () => {
    expect((await callDelete(randomUUID())).status).toBe(401);
  });

  it("폐기된 세션은 401이고 이메일 미인증 세션은 403이다", async () => {
    const user = await seedUser(db, { email: "blocked@x.com" });
    sessionRef.value = {
      user: { id: user.id, email: user.email, sessionVersion: 1 },
    };

    getDbSessionVersionMock.mockResolvedValueOnce(2);
    expect((await callDelete(randomUUID())).status).toBe(401);

    getDbEmailVerifiedMock.mockResolvedValueOnce(false);
    expect((await callDelete(randomUUID())).status).toBe(403);
  });

  it("업로더의 ready 미연결 파일을 DB와 스토리지에서 삭제한다", async () => {
    const user = await seedUser(db, { email: "owner@x.com" });
    const id = await seedDraft(user.id);
    sessionRef.value = {
      user: { id: user.id, email: user.email, sessionVersion: 1 },
    };

    const response = await callDelete(id);

    expect(response.status).toBe(204);
    expect(await db.select().from(attachments)).toEqual([]);
    await expect(storage.head(id)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("타인의 파일이나 이미 없는 파일은 노출 없이 멱등 성공하고 스토리지를 지우지 않는다", async () => {
    const owner = await seedUser(db, { email: "owner@x.com" });
    const stranger = await seedUser(db, { email: "stranger@x.com" });
    const id = await seedDraft(owner.id);
    sessionRef.value = {
      user: { id: stranger.id, email: stranger.email, sessionVersion: 1 },
    };

    expect((await callDelete(id)).status).toBe(204);
    expect((await callDelete(randomUUID())).status).toBe(204);
    expect(await storage.head(id)).toMatchObject({ size: 10 });
  });

  it("잘못된 첨부 ID도 DB 오류 없이 멱등 성공한다", async () => {
    const user = await seedUser(db, { email: "owner@x.com" });
    sessionRef.value = {
      user: { id: user.id, email: user.email, sessionVersion: 1 },
    };

    expect((await callDelete("not-a-uuid")).status).toBe(204);
  });

  it("스토리지 삭제가 실패해도 접근 차단된 DB 행은 되살리지 않고 204를 반환한다", async () => {
    const user = await seedUser(db, { email: "owner@x.com" });
    const id = await seedDraft(user.id);
    sessionRef.value = {
      user: { id: user.id, email: user.email, sessionVersion: 1 },
    };
    vi.spyOn(storage, "delete").mockRejectedValueOnce(new Error("R2 down"));

    expect((await callDelete(id)).status).toBe(204);
    expect(await db.select().from(attachments)).toEqual([]);
  });
});
