import { flushGenericOutbox } from '@/lib/server/outbox/dispatch';
import { expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { agreementFixture } from "./_agreement-fixture";
import { getSigningContractRepo } from "@/lib/server/repositories/factory";
import { signingContracts } from "@/lib/db/schema";

it("기존 계약은 pg_buyer이고 신규 계약의 platform_buyer 구분은 읽기에도 보존된다", async () => {
  const f = await agreementFixture();
  const rows = await f.db.execute(
    sql`select kind from signing_contracts where id = ${f.contract.id}`,
  );
  expect(rows.rows[0]).toMatchObject({ kind: "pg_buyer" });
  await f.db.execute(
    sql`update signing_contracts set kind = 'platform_buyer' where id = ${f.contract.id}`,
  );
  expect(
    (await (await getSigningContractRepo()).findById(f.contract.id))?.contract
      .kind,
  ).toBe("platform_buyer");
  await expect(
    f.db.execute(
      sql`update signing_contracts set kind = 'unknown' where id = ${f.contract.id}`,
    ),
  ).rejects.toThrow();
  expect(
    (
      await f.db
        .select()
        .from(signingContracts)
        .where(eq(signingContracts.id, f.contract.id))
    )[0],
  ).toBeDefined();
});

it("선정 트랜잭션은 구매사 작성 대기 계약을 한 번만 생성한다", async () => {
  const f = await agreementFixture();
  const { rfps } = await import("@/lib/db/schema");
  await f.db.delete(signingContracts);
  await f.db
    .update(rfps)
    .set({ status: "sent", awardedBidId: null })
    .where(eq(rfps.id, f.rfp.id));
  const { getRfpService } = await import("../rfp");
  const service = await getRfpService();
  expect(await service.award(f.rfp.id, f.bid.id, f.buyerActor)).toMatchObject({
    ok: true,
  });
  const rows = await f.db.select().from(signingContracts);
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({
    kind: "platform_buyer",
    status: "awaiting_pg_template",
    providerRef: null,
  });
  await service.award(f.rfp.id, f.bid.id, f.buyerActor);
  expect(await f.db.select().from(signingContracts)).toHaveLength(1);
});

it("사용자 조회는 새 구매사 계약만 반환하고 PG·기존 계약은 숨긴다", async () => {
  const f = await agreementFixture();
  const { getContractSigningService } = await import("../contract-signing");
  const service = await getContractSigningService();
  expect((await service.getForActor(f.rfp.id, f.buyerActor)).ok).toBe(false);
  await f.db.update(signingContracts).set({ kind: "platform_buyer" });
  expect((await service.getForActor(f.rfp.id, f.actor)).ok).toBe(false);
  expect(await service.getForActor(f.rfp.id, f.buyerActor)).toMatchObject({
    ok: true,
    contract: { kind: "platform_buyer" },
  });
});

it("딜룸 로더는 PG에 계약·계약 템플릿을 보내지 않는다", async () => {
  const f = await agreementFixture();
  await f.db.update(signingContracts).set({ kind: "platform_buyer" });
  const { loadPgRfpDetail } = await import("@/lib/server/rfp-detail-loader");
  const result = await loadPgRfpDetail({
    code: f.rfp.code,
    workspaceId: f.actor.workspaceId,
  });
  expect(result).toMatchObject({
    signing: null,
    signingTemplates: [],
    linkedSigningTemplate: null,
  });
});

it("PG의 과거 계약 알림과 재촉 이메일은 다시 노출하거나 발송하지 않는다", async () => {
  const f = await agreementFixture();
  const { getNotificationRepo, getOutboxRepo } =
    await import("@/lib/server/repositories/factory");
  const { randomUUID } = await import("node:crypto");
  const repo = await getNotificationRepo();
  for (const type of ["signing.sent", "rfp.awarded"])
    await repo.save({
      id: randomUUID(),
      userId: f.actor.userId,
      workspaceId: f.actor.workspaceId,
      type,
      title: type,
      body: "test",
      channel: "inapp",
      status: "pending",
      linkUrl: `/inbox/${f.rfp.code}`,
      createdAt: new Date().toISOString(),
    });
  expect(
    (await repo.findRecentForUser(f.actor.userId, f.actor.workspaceId, 50)).map(
      (n) => n.type,
    ),
  ).toEqual(["rfp.awarded"]);
  const outbox = await getOutboxRepo();
  await outbox.enqueue({
    event: "signing.awaiting_template",
    to: "pg@example.com",
    subject: "old",
    html: "old",
  });
  const sent: unknown[] = [];
  await flushGenericOutbox(outbox, async (entries) => {
    sent.push(...entries);
    return entries.map(() => ({ ok: true }));
  }, 50);
  expect(sent).toHaveLength(0);
});
