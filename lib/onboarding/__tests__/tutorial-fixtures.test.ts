import { describe, it, expect } from 'vitest';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { TUTORIAL_PG_LOGO_SRC } from '../tutorial-pg-logos';
import { getWizardValidity } from '@/components/rfp/wizard-validation';
import {
  getBidWizardValidity,
  deriveAnyFeeFilled,
} from '@/components/inbox/bid-wizard/bid-wizard-validation';
import {
  tutorialBidDraftSeed,
  tutorialBuyerRfp,
  tutorialBids,
  tutorialPgNames,
  TUTORIAL_PG_IDS,
  tutorialBuyerName,
  tutorialRfpDraftSeed,
  tutorialBizProfile,
  tutorialPgList,
} from '../tutorial-fixtures';
import { validateBusinessDeadline } from '@/lib/rfp/business-deadline';
import { sampleBusinessCalendar } from '@/lib/rfp/sample-calendar';

describe('tutorial-fixtures (buyer 튜토리얼 가상 데이터)', () => {
  it('4개 견적이 모두 tutorialBuyerRfp.id를 참조한다', () => {
    expect(tutorialBids).toHaveLength(4);
    for (const bid of tutorialBids) {
      expect(bid.rfpId).toBe(tutorialBuyerRfp.id);
    }
  });

  it('4사의 pgWsId가 서로 다르고 tutorialPgNames/tutorialPgList와 일치한다', () => {
    const pgWsIds = tutorialBids.map((b) => b.pgWsId);
    expect(new Set(pgWsIds).size).toBe(4);
    for (const id of pgWsIds) {
      expect(tutorialPgNames[id]).toBeTruthy();
      expect(tutorialPgList.some((pg) => pg.id === id)).toBe(true);
    }
  });

  it('견적 4사가 카드 수수료·정산주기·보증보험에서 의도적으로 차별화되어 있다', () => {
    const cardRates = tutorialBids.map((b) => b.paymentFees.card);
    const cycles = tutorialBids.map((b) => b.settleCycle);
    expect(new Set(cardRates.map((r) => JSON.stringify(r))).size).toBe(4);
    expect(new Set(cycles).size).toBeGreaterThan(1);
  });

  it('tutorialRfpDraftSeed는 모든 위저드 스텝이 입력 없이 완료 상태다 (클릭만으로 진행)', () => {
    const validity = getWizardValidity(tutorialRfpDraftSeed);
    const incomplete = validity.filter((s) => !s.complete);
    expect(incomplete).toEqual([]);
  });

  it('tutorialRfpDraftSeed 마감은 샘플 달력 기준 유효한 영업일 마감이다', () => {
    const now = new Date();
    const calendar = sampleBusinessCalendar(now);
    expect(validateBusinessDeadline(now, new Date(tutorialRfpDraftSeed.deadline), { ...calendar, holidays: new Set(calendar.holidays) })).toBeNull();
  });

  it('tutorialRfpDraftSeed 제목이 RFP 픽스처 제목과 일치한다 (pg 튜토리얼과 동일 세계관)', () => {
    expect(tutorialRfpDraftSeed.title).toBe(tutorialBuyerRfp.title);
  });

  it('tutorialBuyerName/tutorialBizProfile가 정의돼 있다', () => {
    expect(tutorialBuyerName).toBeTruthy();
    expect(tutorialBizProfile).toBeDefined();
  });

  it('tutorialBidDraftSeed는 입력 없이 모든 견적 스텝이 완료 상태다 (pg 튜토리얼 클릭 전용)', () => {
    // BidWizard와 같은 파생 헬퍼를 공유해 드리프트 없이 검증한다.
    const anyFeeFilled = deriveAnyFeeFilled(
      tutorialBidDraftSeed.fees,
      tutorialBuyerRfp.requiredPaymentMethods,
      tutorialBuyerRfp.customPaymentMethods,
    );
    const validity = getBidWizardValidity({
      cycleNum: tutorialBidDraftSeed.cycleNum,
      settleLimit: tutorialBidDraftSeed.settleLimit,
      anyFeeFilled,
    });
    expect(validity.filter((s) => !s.complete)).toEqual([]);
  });

  it('tutorialBidDraftSeed는 tutorialBids[0](토스페이먼츠) 조건을 미러링한다', () => {
    expect(tutorialBidDraftSeed.cycleUnit).toBe('D');
    expect(tutorialBidDraftSeed.cycleNum).toBe('2');
    expect(tutorialBidDraftSeed.settleLimit).toBe(String(tutorialBids[0].settleLimit));
    expect(tutorialBidDraftSeed.guaranteeInsurance).toBe(String(tutorialBids[0].guaranteeInsurance));
    // tiered: decimal(0.005) → percent 문자열('0.5'); flat: 원 정수 그대로.
    expect(tutorialBidDraftSeed.fees['card:sole']).toBe('0.5');
    expect(tutorialBidDraftSeed.fees['virtual_account']).toBe('300');
    expect(tutorialBidDraftSeed.memo).toBe(tutorialBids[0].memo);
  });
});

describe('tutorial PG 표시명', () => {
  it('실제 연동 PG 4사 이름을 쓴다', () => {
    expect(TUTORIAL_PG_IDS.map((id) => tutorialPgNames[id])).toEqual([
      '토스페이먼츠',
      '헥토파이낸셜',
      '키움페이먼츠',
      '이니시스',
    ]);
  });
});

describe('tutorial PG 로고', () => {
  // Value: protects=모든 튜토리얼 PG가 실제 존재하는 로고 파일을 가리킴; fails_when=PG 추가·자산 이름 변경 시 매핑 누락; why_new=기존 테스트는 이름만 검증; seam=none
  it('각 TUTORIAL_PG_IDS 는 public 에 실존하는 로고를 가진다', () => {
    for (const id of TUTORIAL_PG_IDS) {
      const src = TUTORIAL_PG_LOGO_SRC[id];
      expect(src, id).toBeTruthy();
      expect(existsSync(join(process.cwd(), 'public', src!)), src).toBe(true);
    }
  });
});
