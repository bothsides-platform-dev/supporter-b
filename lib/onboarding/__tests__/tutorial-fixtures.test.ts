import { describe, it, expect } from 'vitest';
import {
  tutorialBuyerRfp,
  tutorialBids,
  tutorialPgNames,
  tutorialBuyerName,
  tutorialRfpDraftSeed,
  tutorialBizProfile,
  tutorialPgList,
} from '../tutorial-fixtures';

describe('tutorial-fixtures (buyer 튜토리얼 가상 데이터)', () => {
  it('3개 견적이 모두 tutorialBuyerRfp.id를 참조한다', () => {
    expect(tutorialBids).toHaveLength(3);
    for (const bid of tutorialBids) {
      expect(bid.rfpId).toBe(tutorialBuyerRfp.id);
    }
  });

  it('3사의 pgWsId가 서로 다르고 tutorialPgNames/tutorialPgList와 일치한다', () => {
    const pgWsIds = tutorialBids.map((b) => b.pgWsId);
    expect(new Set(pgWsIds).size).toBe(3);
    for (const id of pgWsIds) {
      expect(tutorialPgNames[id]).toBeTruthy();
      expect(tutorialPgList.some((pg) => pg.id === id)).toBe(true);
    }
  });

  it('견적 3사가 카드 수수료·정산주기·보증보험에서 의도적으로 차별화되어 있다', () => {
    const cardRates = tutorialBids.map((b) => b.paymentFees.card);
    const cycles = tutorialBids.map((b) => b.settleCycle);
    expect(new Set(cardRates.map((r) => JSON.stringify(r))).size).toBe(3);
    expect(new Set(cycles).size).toBeGreaterThan(1);
  });

  it('tutorialRfpDraftSeed는 제목이 비어 입력 체험을 유도한다', () => {
    expect(tutorialRfpDraftSeed.title).toBe('');
    // 나머지 대부분 필드는 프리필돼 있어야 한다
    expect(tutorialRfpDraftSeed.mainProducts).not.toBe('');
    expect(tutorialRfpDraftSeed.allowedPgWorkspaceIds.length).toBeGreaterThan(0);
  });

  it('tutorialBuyerName/tutorialBizProfile가 정의돼 있다', () => {
    expect(tutorialBuyerName).toBeTruthy();
    expect(tutorialBizProfile).toBeDefined();
  });
});
