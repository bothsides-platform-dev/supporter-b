import { describe, it, expect } from 'vitest';

import { pgDealRoomShowsBidWizard } from '../pg-bid-wizard-visibility';

const S = pgDealRoomShowsBidWizard;

describe('pgDealRoomShowsBidWizard — 로더 프리페치와 화면 렌더의 공통 조건', () => {
  it('견적 접수 기간이 닫혔으면 아직 안 냈어도 보이지 않는다', () => {
    expect(S({
      hasPendingRequote: false,
      bidWindowOpen: false,
      hasMyBid: false,
    })).toBe(false);
  });

  it('아직 안 낸 진행 중 견적이면 보인다', () => {
    expect(S({ hasPendingRequote: false, bidWindowOpen: true, hasMyBid: false })).toBe(true);
  });

  it('이미 냈으면 안 보인다 (제출 요약으로 대체)', () => {
    expect(S({ hasPendingRequote: false, bidWindowOpen: true, hasMyBid: true })).toBe(false);
  });

  it('접수가 끝났으면 안 보인다 — 제출 여부와 무관하다', () => {
    expect(S({ hasPendingRequote: false, bidWindowOpen: false, hasMyBid: true })).toBe(false);
    expect(S({ hasPendingRequote: false, bidWindowOpen: false, hasMyBid: false })).toBe(false);
  });

  it('접수 중인 재요청은 이미 낸 견적보다 우선해 보인다', () => {
    expect(S({ hasPendingRequote: true, bidWindowOpen: true, hasMyBid: true })).toBe(true);
  });

  it('재요청이 pending이어도 접수 기간이 끝났으면 보이지 않는다', () => {
    expect(S({ hasPendingRequote: true, bidWindowOpen: false, hasMyBid: true })).toBe(false);
  });
});
