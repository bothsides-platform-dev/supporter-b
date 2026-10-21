import '@/lib/server/signing/__tests__/_platform-seal-fixture';
import { beforeEach, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { signingContracts, pgAgreementRates, users } from "@/lib/db/schema";
import { agreementFixture } from "./_agreement-fixture";
import { getPlatformAgreementService } from "../platform-agreement";
import { getSigningContractRepo } from "@/lib/server/repositories/factory";
import {
  __setSnowSignClientForTest,
  type SnowSignClient,
} from "@/lib/server/signing/snowsign-client";

vi.mock("@/lib/server/signing/upload-bytes", () => ({
  uploadPdfBytes: vi.fn(async () => {}),
}));
vi.mock("@/lib/server/notifications/operator-signing", () => ({
  notifySigningOperator: vi.fn(),
}));
const client = {
  createUploadSession: vi.fn(async () => ({
    uploadId: "u1",
    uploadUrl: "https://example.com",
    expiresAt: new Date().toISOString(),
  })),
  createContract: vi.fn(async () => ({ contractId: "platform1" })),
  sendContract: vi.fn(async () => ({ contractId: "platform1" })),
  getContract: vi.fn(),
  cancel: vi.fn(),
} as unknown as SnowSignClient;
beforeEach(() => {
  vi.clearAllMocks();
  __setSnowSignClientForTest(client);
});
async function setup() {
  const f = await agreementFixture();
  await f.db
    .update(signingContracts)
    .set({ kind: "platform_buyer" })
    .where(eq(signingContracts.id, f.contract.id));
  return { ...f, service: await getPlatformAgreementService() };
}
it("PG와 기존 계약은 차단하고 구매사는 초안을 저장·복원한다", async () => {
  const f = await setup();
  expect(await f.service.load(f.contract.id, f.actor)).toMatchObject({
    ok: false,
    error: "FORBIDDEN",
  });
  expect(
    await f.service.save(f.contract.id, f.buyerActor, 0, {
      buyer: f.parties.buyer,
    }),
  ).toMatchObject({ ok: true, revision: 1 });
  expect(
    await f.service.save(f.contract.id, f.buyerActor, 0, {
      buyer: f.parties.buyer,
    }),
  ).toMatchObject({ ok: false, error: "AGREEMENT_CHANGED" });
  expect(await f.service.load(f.contract.id, f.buyerActor)).toMatchObject({
    ok: true,
    revision: 1,
    parties: { buyer: f.parties.buyer, platform: { company: "주식회사 노온" } },
  });
  await f.db.update(signingContracts).set({ kind: "pg_buyer" });
  expect(await f.service.load(f.contract.id, f.buyerActor)).toMatchObject({
    ok: false,
    error: "FORBIDDEN",
  });
});
it("구매사 한 명만 본인인증으로 발송하며 중복 요청은 계약을 추가하지 않는다", async () => {
  const f = await setup();
  await f.service.save(f.contract.id, f.buyerActor, 0, {
    buyer: f.parties.buyer,
  });
  const view = await f.service.load(f.contract.id, f.buyerActor);
  if (!view.ok) throw new Error("load");
  expect(
    await f.service.send(f.contract.id, f.buyerActor, "old"),
  ).toMatchObject({ ok: false, error: "AGREEMENT_CHANGED" });
  expect(client.createContract).not.toHaveBeenCalled();
  expect(
    await f.service.send(f.contract.id, f.buyerActor, view.stamp!),
  ).toMatchObject({ ok: true });
  expect(
    vi.mocked(client.createContract).mock.calls[0][0].participants,
  ).toEqual([
    expect.objectContaining({
      role: "구매사",
      auth: { phone: "010-1111-2222" },
    }),
  ]);
  expect(
    (await (await getSigningContractRepo()).findById(f.contract.id))
      ?.participants,
  ).toHaveLength(1);
  await f.service.send(f.contract.id, f.buyerActor, view.stamp!);
  expect(client.createContract).toHaveBeenCalledTimes(1);
});
it("응답 유실은 고정한 문서와 구매사 단독 본인인증을 확인하여 복구한다", async () => {
  const f = await setup();
  await f.service.save(f.contract.id, f.buyerActor, 0, {
    buyer: f.parties.buyer,
  });
  const view = await f.service.load(f.contract.id, f.buyerActor);
  if (!view.ok) throw new Error("load");
  vi.mocked(client.sendContract).mockRejectedValueOnce(
    new Error("response lost"),
  );
  expect(
    (await f.service.send(f.contract.id, f.buyerActor, view.stamp!)).ok,
  ).toBe(false);
  vi.mocked(client.getContract).mockResolvedValueOnce({
    contractId: "platform1",
    status: "pending",
    participants: [
      {
        ...view.signer,
        status: "pending",
        securityMethod: "identity_verification",
      },
    ],
  });
  expect(
    await f.service.send(f.contract.id, f.buyerActor, view.stamp!),
  ).toMatchObject({ ok: true });
  expect(client.createContract).toHaveBeenCalledTimes(1);
  expect(await f.service.load(f.contract.id, f.buyerActor)).toMatchObject({
    ok: true,
    editable: false,
    snapshot: { kind: "platform_buyer" },
  });
});

it("완료본은 구매사에 한 번만 보관하고 기존 계약·PG 보관본은 공개하지 않는다", async () => {
  const f = await setup();
  await f.service.save(f.contract.id, f.buyerActor, 0, {
    buyer: f.parties.buyer,
  });
  const view = await f.service.load(f.contract.id, f.buyerActor);
  if (!view.ok) throw new Error("load");
  expect(
    (await f.service.send(f.contract.id, f.buyerActor, view.stamp!)).ok,
  ).toBe(true);
  await f.db
    .update(signingContracts)
    .set({ status: "completed", completedAt: new Date() });
  const { getContractArchiveService } = await import("../contract-archive");
  const archive = await getContractArchiveService();
  expect(await archive.createPendingForContract(f.contract.id)).toMatchObject({
    ok: true,
  });
  await archive.createPendingForContract(f.contract.id);
  const { contractArchives } = await import("@/lib/db/schema");
  const rows = await f.db.select().from(contractArchives);
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({
    workspaceId: f.buyerActor.workspaceId,
    kind: "platform_buyer",
    counterpartyName: "주식회사 노온",
  });
  await f.db
    .insert(contractArchives)
    .values({
      workspaceId: f.buyerActor.workspaceId,
      source: "upload",
      title: "이전 계약",
      status: "ready",
    });
  expect(await archive.listForWorkspace(f.buyerActor)).toMatchObject({
    ok: true,
    rows: [expect.objectContaining({ counterpartyName: "주식회사 노온" })],
  });
  expect(await archive.listForWorkspace(f.actor)).toMatchObject({ ok: false });
});

it("웹훅 재조회도 구매사 단독 인증을 요구하고 완료·알림을 중복 생성하지 않는다", async () => {
  const f = await setup();
  await f.service.save(f.contract.id, f.buyerActor, 0, {
    buyer: f.parties.buyer,
  });
  const view = await f.service.load(f.contract.id, f.buyerActor);
  if (!view.ok) throw new Error("load");
  await f.service.send(f.contract.id, f.buyerActor, view.stamp!);
  const { getContractSigningService } = await import("../contract-signing");
  const signing = await getContractSigningService();
  vi.mocked(client.getContract).mockResolvedValueOnce({
    contractId: "platform1",
    status: "completed",
    participants: [
      { ...view.signer, status: "signed", securityMethod: "email" },
    ],
  });
  expect(await signing.reconcileStatus(f.contract.id)).toMatchObject({
    ok: false,
    error: "SIGNER_POLICY_NOT_ENFORCED",
  });
  expect(
    (await (await getSigningContractRepo()).findById(f.contract.id))?.contract
      .status,
  ).toBe("sent");
  vi.mocked(client.getContract).mockResolvedValue({
    contractId: "platform1",
    status: "completed",
    participants: [
      {
        ...view.signer,
        status: "signed",
        securityMethod: "identity_verification",
      },
    ],
  });
  await signing.reconcileStatus(f.contract.id);
  await signing.reconcileStatus(f.contract.id);
  const { contractArchives, notifications } = await import("@/lib/db/schema");
  expect(await f.db.select().from(contractArchives)).toHaveLength(1);
  const notices = await f.db.select().from(notifications);
  expect(
    notices.filter((n) => n.workspaceId === f.actor.workspaceId),
  ).toHaveLength(0);
  expect(notices.filter((n) => n.type === "signing.completed")).toHaveLength(1);
});

it("동시 저장과 중복 클릭도 하나의 판본·발송만 만든다", async () => {
  const f = await setup();
  const writes = await Promise.all([
    f.service.save(f.contract.id, f.buyerActor, 0, { buyer: f.parties.buyer }),
    f.service.save(f.contract.id, f.buyerActor, 0, { buyer: f.parties.buyer }),
  ]);
  expect(writes.filter((r) => r.ok)).toHaveLength(1);
  const view = await f.service.load(f.contract.id, f.buyerActor);
  if (!view.ok) throw new Error("load");
  const sends = await Promise.all([
    f.service.send(f.contract.id, f.buyerActor, view.stamp!),
    f.service.send(f.contract.id, f.buyerActor, view.stamp!),
  ]);
  expect(sends.filter((r) => r.ok)).toHaveLength(1);
  expect(client.createContract).toHaveBeenCalledTimes(1);
});
it("구매사의 새 완료 계약만 완료본·감사증명 다운로드를 허용한다", async () => {
  const f = await setup();
  await f.service.save(f.contract.id, f.buyerActor, 0, {
    buyer: f.parties.buyer,
  });
  const view = await f.service.load(f.contract.id, f.buyerActor);
  if (!view.ok) throw new Error("load");
  await f.service.send(f.contract.id, f.buyerActor, view.stamp!);
  const { getContractSigningService } = await import("../contract-signing");
  const service = await getContractSigningService();
  client.downloadUrl = vi.fn(async () => ({
    downloadUrl: "https://example.com/document.pdf",
  }));
  client.auditCertificateUrl = vi.fn(async () => ({
    downloadUrl: "https://example.com/audit.pdf",
  }));
  expect(
    await service.getDownloadUrl(f.contract.id, "document", f.buyerActor),
  ).toMatchObject({ ok: false, error: "NOT_COMPLETED" });
  await f.db.update(signingContracts).set({ status: "completed" });
  expect(
    await service.getDownloadUrl(f.contract.id, "document", f.actor),
  ).toMatchObject({ ok: false, error: "FORBIDDEN" });
  expect(
    await service.getDownloadUrl(f.contract.id, "document", f.buyerActor),
  ).toMatchObject({ ok: true, url: "https://example.com/document.pdf" });
  expect(
    await service.getDownloadUrl(f.contract.id, "audit", f.buyerActor),
  ).toMatchObject({ ok: true, url: "https://example.com/audit.pdf" });
  const read = await service.getForActor(f.rfp.id, f.buyerActor);
  expect(read.ok && read.contract.providerRef).toBeUndefined();
});

// Value: protects=reviewed rates, parties and signer match the immutable sent snapshot;
// fails_when=stamp ignores mutable inputs or sent reads rebuild the document;
// why_new=legacy agreement tests do not exercise PlatformAgreementService;
// seam=none; no_claim=live provider document acceptance.
it("요율·회사·담당자 변경은 미리보기를 무효화하고 발송 후 문서는 고정한다", async () => {
  const f = await setup();
  await f.service.save(f.contract.id, f.buyerActor, 0, { buyer: f.parties.buyer });
  const load = async () => {
    const view = await f.service.load(f.contract.id, f.buyerActor);
    if (!view.ok) throw new Error(view.error);
    return view;
  };
  let view = await load();
  await f.db.update(pgAgreementRates).set({ version: 2, rates: [{ key: 'bank_transfer', rate: 0.025 }] });
  expect(await f.service.send(f.contract.id, f.buyerActor, view.stamp!)).toMatchObject({ ok: false, error: 'AGREEMENT_CHANGED' });
  view = await load();
  await f.service.save(f.contract.id, f.buyerActor, view.revision, { buyer: { ...f.parties.buyer, company: '변경 구매사' } });
  expect(await f.service.send(f.contract.id, f.buyerActor, view.stamp!)).toMatchObject({ ok: false, error: 'AGREEMENT_CHANGED' });
  view = await load();
  await f.db.update(users).set({ email: 'changed-buyer@example.com' }).where(eq(users.id, f.buyerActor.userId));
  expect(await f.service.send(f.contract.id, f.buyerActor, view.stamp!)).toMatchObject({ ok: false, error: 'AGREEMENT_CHANGED' });
  expect(client.createContract).not.toHaveBeenCalled();
  view = await load();
  expect(await f.service.send(f.contract.id, f.buyerActor, view.stamp!)).toMatchObject({ ok: true });
  await f.db.update(pgAgreementRates).set({ version: 3, rates: [{ key: 'bank_transfer', rate: 0.03 }] });
  await f.db.update(users).set({ email: 'later-buyer@example.com' }).where(eq(users.id, f.buyerActor.userId));
  expect(await f.service.save(f.contract.id, f.buyerActor, view.revision, { buyer: f.parties.buyer })).toMatchObject({ ok: false });
  expect((await load()).snapshot).toEqual(view.snapshot);
});

// Value: protects=an expired sender cannot bind or dispatch a superseded PDF;
// fails_when=expired edits fail to invalidate the lease or bind ignores ownership;
// why_new=fast concurrent sends never reach the late provider response branch;
// seam=none; no_claim=distributed clock skew or provider cancellation availability.
it("리스 만료 후 편집한 문서에 이전 create 응답을 연결하거나 발송하지 않는다", async () => {
  const f = await setup();
  await f.service.save(f.contract.id, f.buyerActor, 0, { buyer: f.parties.buyer });
  const view = await f.service.load(f.contract.id, f.buyerActor);
  if (!view.ok) throw new Error(view.error);
  let release!: (value: { contractId: string }) => void;
  let entered!: () => void;
  const started = new Promise<void>((resolve) => { entered = resolve; });
  vi.mocked(client.createContract).mockImplementationOnce(() => {
    entered();
    return new Promise((resolve) => { release = resolve; });
  });
  const sending = f.service.send(f.contract.id, f.buyerActor, view.stamp!);
  await started;
  try {
    await f.db.update(signingContracts).set({ claimedForSendAt: new Date(Date.now() - 10 * 60_000) }).where(eq(signingContracts.id, f.contract.id));
    expect(await f.service.save(f.contract.id, f.buyerActor, view.revision, { buyer: { ...f.parties.buyer, company: '새 판본' } })).toMatchObject({ ok: true });
  } finally { release({ contractId: 'late-contract' }); }
  expect(await sending).toMatchObject({ ok: false, error: 'CONTRACT_BUSY' });
  expect(client.sendContract).not.toHaveBeenCalled();
  expect(client.cancel).toHaveBeenCalledWith('late-contract', expect.any(String));
  const row = await (await getSigningContractRepo()).findById(f.contract.id);
  expect(row?.contract.providerRef).toBeUndefined();
  expect(await f.service.load(f.contract.id, f.buyerActor)).toMatchObject({ ok: true, editable: true, parties: { buyer: { company: '새 판본' } } });
});

// Value: protects=uncertain sends retain their handle and reject invalid recovery;
// fails_when=lookup failure drops the ref or weak/terminal evidence is rebound;
// why_new=the existing recovery case only supplies a valid pending contract;
// seam=none; no_claim=real provider timeout, draft or cancellation semantics.
it("복구 조회 실패·약한 인증·종결 상태는 참조를 보존하고 초안만 정리한다", async () => {
  const f = await setup();
  await f.service.save(f.contract.id, f.buyerActor, 0, { buyer: f.parties.buyer });
  const view = await f.service.load(f.contract.id, f.buyerActor);
  if (!view.ok) throw new Error(view.error);
  vi.mocked(client.sendContract).mockRejectedValueOnce(new Error('lost response'));
  await f.service.send(f.contract.id, f.buyerActor, view.stamp!);
  for (const scenario of ['lookup-failed', 'weak', 'terminal'] as const) {
    if (scenario === 'lookup-failed') vi.mocked(client.getContract).mockRejectedValueOnce(new Error('offline'));
    else vi.mocked(client.getContract).mockResolvedValueOnce({ contractId: 'platform1', status: scenario === 'terminal' ? 'expired' : 'pending', participants: [{ ...view.signer, status: 'pending', securityMethod: 'email' }] });
    expect(await f.service.send(f.contract.id, f.buyerActor, view.stamp!), scenario).toMatchObject({ ok: false });
    expect((await (await getSigningContractRepo()).findById(f.contract.id))?.contract.providerRef, scenario).toBe('platform1');
  }
  expect(client.createContract).toHaveBeenCalledTimes(1);
  expect(client.sendContract).toHaveBeenCalledTimes(1);
  expect(client.cancel).not.toHaveBeenCalled();
  vi.mocked(client.getContract).mockResolvedValueOnce({ contractId: 'platform1', status: 'draft', participants: [] });
  expect(await f.service.send(f.contract.id, f.buyerActor, view.stamp!)).toMatchObject({ ok: false, error: 'AGREEMENT_CHANGED' });
  expect((await (await getSigningContractRepo()).findById(f.contract.id))?.contract.providerRef).toBeUndefined();
  expect(client.cancel).toHaveBeenCalledWith('platform1', expect.any(String));
  expect(client.createContract).toHaveBeenCalledTimes(1);
});
