import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import {
  setupServerTestEnv,
  teardownServerTestEnv,
} from "@/lib/server/__tests__/_harness";
const jar = vi.hoisted(() => new Map<string, string>());
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (key: string) => (jar.has(key) ? { value: jar.get(key) } : undefined),
    set: (key: string, value: string) => jar.set(key, value),
  }),
}));
import { POST } from "../route";
beforeEach(async () => {
  jar.clear();
  await setupServerTestEnv();
});
afterEach(teardownServerTestEnv);
function request(body: unknown, origin = "http://localhost:3000") {
  return new Request("http://localhost:3000/api/guest-rfp/drafts", {
    method: "POST",
    headers: {
      origin,
      host: "localhost:3000",
      "content-type": "application/json",
      "x-forwarded-for": randomUUID(),
    },
    body: JSON.stringify(body),
  });
}
it("requires same origin and cookie proof, and rejects hidden state", async () => {
  expect(
    (await POST(request({ op: "session" }, "https://evil.example"))).status,
  ).toBe(403);
  expect(
    (
      await POST(
        request({
          op: "save",
          id: randomUUID(),
          revision: 0,
          answers: {},
          files: [],
        }),
      )
    ).status,
  ).toBe(403);
  expect((await POST(request({ op: "session" }))).status).toBe(200);
  expect(
    (
      await POST(
        request({
          op: "save",
          id: randomUUID(),
          revision: 0,
          answers: { allowedPgWorkspaceIds: [] },
          files: [],
        }),
      )
    ).status,
  ).toBe(400);
});
it("saves with a server-issued secret but exposes no secret or hash in the JSON response", async () => {
  await POST(request({ op: "session" }));
  const id = randomUUID();
  const response = await POST(
    request({
      op: "save",
      id,
      revision: 0,
      answers: { title: "저장" },
      files: [],
    }),
  );
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ id, revision: 1 });
  jar.clear();
  await POST(request({ op: "session" }));
  expect(
    (
      await POST(
        request({ op: "save", id, revision: 1, answers: {}, files: [] }),
      )
    ).status,
  ).toBe(409);
});
it("bounds actual body bytes, not only the content-length header", async () => {
  const response = await POST(
    request({ op: "session", huge: "x".repeat(20000) }),
  );
  expect(response.status).toBe(413);
});
