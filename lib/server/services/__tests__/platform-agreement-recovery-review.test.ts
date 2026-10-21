import '@/lib/server/signing/__tests__/_platform-seal-fixture';
import { expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { signingContracts } from "@/lib/db/schema";
import { agreementFixture } from "./_agreement-fixture";
import { getPlatformAgreementService } from "../platform-agreement";
import { getSigningContractRepo } from "@/lib/server/repositories/factory";
import { __setSnowSignClientForTest, type SnowSignClient } from "@/lib/server/signing/snowsign-client";
vi.mock("@/lib/server/signing/upload-bytes", () => ({ uploadPdfBytes: vi.fn(async () => {}) }));
vi.mock("@/lib/server/notifications/operator-signing", () => ({ notifySigningOperator: vi.fn() }));
// Value: protects=an accepted external send remains recoverable after lease expiry;
// fails_when=draft cleanup clears the handle before cancellation is confirmed;
// seam=deferred provider completion; no_claim=provider timing frequency.
it("recovery must preserve a send handle when draft cancellation is uncertain", async () => {
  let entered!: () => void;
  let finishSend!: (value: { contractId: string }) => void;
  const started = new Promise<void>((resolve) => { entered = resolve; });
  const client = {
    createUploadSession: vi.fn(async () => ({ uploadId: "u-review", uploadUrl: "https://example.com", expiresAt: new Date().toISOString() })),
    createContract: vi.fn(async () => ({ contractId: "race-contract" })),
    sendContract: vi.fn(() => { entered(); return new Promise((resolve) => { finishSend = resolve; }); }),
    getContract: vi.fn(async () => ({ contractId: "race-contract", status: "draft", participants: [] })),
    cancel: vi.fn(async () => { finishSend({ contractId: "race-contract" }); throw new Error("cancel response lost"); }),
  } as unknown as SnowSignClient;
  __setSnowSignClientForTest(client);
  const f = await agreementFixture();
  await f.db.update(signingContracts).set({ kind: "platform_buyer" }).where(eq(signingContracts.id, f.contract.id));
  const service = await getPlatformAgreementService();
  await service.save(f.contract.id, f.buyerActor, 0, { buyer: f.parties.buyer });
  const view = await service.load(f.contract.id, f.buyerActor);
  if (!view.ok) throw new Error(view.error);
  const original = service.send(f.contract.id, f.buyerActor, view.stamp!);
  await started;
  await f.db.update(signingContracts).set({ claimedForSendAt: new Date(Date.now() - 10 * 60_000) }).where(eq(signingContracts.id, f.contract.id));
  const recovery = await service.send(f.contract.id, f.buyerActor, view.stamp!);
  expect(recovery.ok).toBe(false);
  expect((await original).ok).toBe(false);
  expect(client.sendContract).toHaveBeenCalledTimes(1);
  expect((await (await getSigningContractRepo()).findById(f.contract.id))?.contract.providerRef).toBe("race-contract");
  // A cancellation whose response was lost can be positively observed on retry.
  vi.mocked(client.getContract).mockResolvedValueOnce({ contractId: "race-contract", status: "cancelled", participants: [] });
  expect(await service.send(f.contract.id, f.buyerActor, "recover")).toMatchObject({ ok: false, error: "AGREEMENT_CHANGED" });
  expect(await service.load(f.contract.id, f.buyerActor)).toMatchObject({ ok: true, editable: true });
  expect(client.createContract).toHaveBeenCalledTimes(1);
});
