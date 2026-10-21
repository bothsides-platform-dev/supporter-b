import { expect, it, vi } from "vitest";
vi.mock("@/lib/server/actions/_session", () => ({
  requirePgActor: vi.fn(async () => ({
    ok: true,
    userId: "pg",
    workspaceId: "pg",
  })),
  requireActiveWorkspace: vi.fn(async () => ({
    ok: true,
    userId: "pg",
    workspaceId: "pg",
  })),
}));
import {
  getAgreementAction,
  saveAgreementAction,
  sendAgreementAction,
} from "../agreementActions";
import { listSigningTemplatesAction } from "../listSigningTemplatesAction";
import { issueSigningSendEmbedSessionAction } from "../issueSigningSendEmbedSessionAction";
import { POST } from "@/app/api/signing/templates/preview/route";
it("종료한 PG 계약 API는 인증된 PG의 직접 요청도 차단한다", async () => {
  for (const action of [
    getAgreementAction,
    saveAgreementAction,
    sendAgreementAction,
    listSigningTemplatesAction,
    issueSigningSendEmbedSessionAction,
  ]) {
    expect(await action({} as never)).toMatchObject({
      ok: false,
      error: "CONTRACT_FEATURE_REMOVED",
    });
  }
  expect(
    (await POST(new Request("http://localhost", { method: "POST" }))).status,
  ).toBe(404);
});

it("직접 계약서 업로드 API를 제거한다", async () => {
  const { POST: presign } =
    await import("@/app/api/contract-archives/presign/route");
  const { POST: complete } =
    await import("@/app/api/contract-archives/[id]/complete/route");
  const request = new Request("http://localhost", { method: "POST" });
  expect((await presign(request)).status).toBe(404);
  expect(
    (await complete(request, { params: Promise.resolve({ id: "old" }) }))
      .status,
  ).toBe(404);
});

it("종료한 모든 계약 액션은 서비스 실행 전에 거부한다", async () => {
  const modules = import.meta.glob("../*Action.ts");
  for (const [name, load] of Object.entries(modules)) {
    if (name.endsWith("/getSigningStatusAction.ts")) continue;
    const exported = (await load()) as Record<
      string,
      (input: never) => Promise<{ ok: boolean; error?: string }>
    >;
    for (const action of Object.values(exported))
      expect(await action({} as never), name).toMatchObject({
        ok: false,
        error: "CONTRACT_FEATURE_REMOVED",
      });
  }
});
