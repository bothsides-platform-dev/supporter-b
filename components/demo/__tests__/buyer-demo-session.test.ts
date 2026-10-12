// @vitest-environment node
import { describe, it, expect } from "vitest";
import { createBuyerDemoSession } from "@/lib/demo/buyer-demo-session";
import { tutorialRfpDraftSeed } from "@/lib/onboarding/tutorial-fixtures";

describe("실제 화면을 구동하는 구매사 데모 데이터", () => {
  it("수수료 인하 요청은 실제 비교 요율과 회차에 반영한다", async () => {
    const demo = createBuyerDemoSession();
    demo.submit(tutorialRfpDraftSeed);
    demo.sendMessage("견적 문의", []);
    await demo.requote({
      rfpId: "demo-rfp-1",
      pgWsIds: ["demo-pg-7"],
      message: "카드 수수료를 0.1%p 낮춰주세요",
      newDeadline: "2099-01-01",
    });
    expect(demo.getSnapshot().deal?.bids[0].paymentFees.card).toMatchObject({
      general: 0.021,
    });
  });
  it("작성한 요청과 대화, 수정 회차, 선정, 계약 보관이 같은 거래를 유지한다", async () => {
    const demo = createBuyerDemoSession();
    expect(demo.getSnapshot().deal).toBeNull();
    demo.submit({
      ...tutorialRfpDraftSeed,
      title: "우리 회사 PG 요청",
      mainProducts: "원두 구독",
    });
    expect(demo.getSnapshot().deal?.rfp.mainProducts).toBe("원두 구독");
    const messages = demo.sendMessage(
      "정산주기를 D+3으로 변경할 수 있나요?",
      [],
    );
    expect(messages.at(-2)?.body).toContain("D+3");
    expect(messages.at(-1)?.sender).toBe("other");
    expect(demo.getSnapshot().deal?.bids).toHaveLength(1);
    await demo.requote({
      rfpId: "demo-rfp-1",
      pgWsIds: ["demo-pg-7"],
      message: "D+3으로 부탁해요",
      newDeadline: "2099-01-01T09:00:00Z",
    });
    const deal = demo.getSnapshot().deal!;
    expect(deal.bids[0].round).toBe(2);
    expect(deal.bids[0].settleCycle).toBe("D+3");
    expect(deal.bidHistoryByPg?.["demo-pg-7"]).toHaveLength(2);
    await demo.award({ rfpId: deal.rfp.id, awardedBidId: deal.bids[0].id });
    expect(demo.getSnapshot().deal?.rfp.status).toBe("awarded");
    demo.completeSigning("김구매");
    expect(demo.getSnapshot().deal?.signing?.contract.status).toBe("completed");
    expect(demo.getSnapshot().archives[0].dealHref).toBe("/rfp/P-2606-0042");
    expect(demo.getSnapshot().deal?.signing?.participants[0].name).toBe(
      "김구매",
    );
  });
  it("신규 계약에는 기존 계약 조건을 남기지 않는다", () => {
    const demo = createBuyerDemoSession();
    demo.submit({ ...tutorialRfpDraftSeed, contractType: "new" });
    expect(demo.getSnapshot().deal?.rfp.currentFeeRate).toBeUndefined();
    expect(demo.getSnapshot().deal?.rfp.annualPgVolume).toBeUndefined();
  });
  it("선정 전 서명과 종료 후 수정 요청은 상태를 바꾸지 않는다", async () => {
    const demo = createBuyerDemoSession();
    demo.completeSigning("누군가");
    expect(demo.getSnapshot().archives).toEqual([]);
    demo.submit(tutorialRfpDraftSeed);
    demo.close("cancelled");
    expect(
      (
        await demo.requote({
          rfpId: "demo-rfp-1",
          pgWsIds: ["demo-pg-7"],
          message: "변경",
          newDeadline: "2099-01-01",
        })
      ).ok,
    ).toBe(false);
    expect(demo.getSnapshot().deal?.rfp.status).toBe("cancelled");
  });
});

it("핵심 체험은 준비된 견적을 수정 없이 선정할 수 있다", async () => {
  const demo = createBuyerDemoSession("quick");
  const deal = demo.getSnapshot().deal!;
  expect(deal?.bids).toHaveLength(1);
  expect(demo.getSnapshot().messages.length).toBeGreaterThan(0);
  expect(
    await demo.award({ rfpId: deal.rfp.id, awardedBidId: deal.bids[0].id }),
  ).toEqual({ ok: true });
  demo.completeSigning("김체험");
  expect(demo.getSnapshot().archives).toHaveLength(1);
});
it("핵심 체험도 수정 후에는 최신 회차만 선정할 수 있다", async () => {
  const demo = createBuyerDemoSession("quick");
  const deal = demo.getSnapshot().deal!;
  expect(deal?.bids).toHaveLength(1);
  await demo.requote({
    rfpId: deal.rfp.id,
    pgWsIds: ["demo-pg-7"],
    message: "D+3으로 부탁해요",
    newDeadline: "2099-01-01",
  });
  expect(
    (await demo.award({ rfpId: deal.rfp.id, awardedBidId: deal.bids[0].id }))
      .ok,
  ).toBe(false);
  const latest = demo.getSnapshot().deal!.bids[0];
  expect(latest.round).toBe(2);
  expect(
    (await demo.award({ rfpId: deal.rfp.id, awardedBidId: latest.id })).ok,
  ).toBe(true);
});
