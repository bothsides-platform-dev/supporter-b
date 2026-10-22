import { expect, it, vi, beforeEach } from "vitest";
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/server/actions/_session", () => ({
  requireBuyerActor: vi.fn(),
}));
vi.mock("@/lib/server/services/platform-agreement", () => ({
  getPlatformAgreementService: vi.fn(),
}));
import { requireBuyerActor } from "@/lib/server/actions/_session";
import { getPlatformAgreementService } from "@/lib/server/services/platform-agreement";
import {
  loadPlatformAgreementAction,
  savePlatformAgreementAction,
  sendPlatformAgreementAction,
} from "../platformAgreementActions";
beforeEach(() => vi.clearAllMocks());
it("PG는 읽기·저장·발송을 직접 호출해도 서비스에 도달하지 않는다", async () => {
  vi.mocked(requireBuyerActor).mockResolvedValue({
    ok: false,
    error: "FORBIDDEN_BUYER",
  });
  const id = "aaaaaaaa-0000-4000-8000-000000000001";
  expect((await loadPlatformAgreementAction({ contractId: id })).ok).toBe(
    false,
  );
  expect(
    (
      await savePlatformAgreementAction({
        contractId: id,
        revision: 0,
        parties: {
          buyer: { company: "", bizNo: "", address: "", representative: "" },
        },
      })
    ).ok,
  ).toBe(false);
  expect(
    (await sendPlatformAgreementAction({ contractId: id, stamp: "stamp" })).ok,
  ).toBe(false);
  expect(getPlatformAgreementService).not.toHaveBeenCalled();
});
it("구매사 저장에는 플랫폼 정보와 수수료를 주입할 수 없다", async () => {
  vi.mocked(requireBuyerActor).mockResolvedValue({
    ok: true,
    userId: "u",
    workspaceId: "b",
    email: "b@test.com",
  });
  expect(
    await savePlatformAgreementAction({
      contractId: "aaaaaaaa-0000-4000-8000-000000000001",
      revision: 0,
      parties: {
        buyer: { company: "", bizNo: "", address: "", representative: "" },
        platform: {},
      },
    } as never),
  ).toMatchObject({ ok: false, error: "INVALID_INPUT" });
  expect(getPlatformAgreementService).not.toHaveBeenCalled();
});
