import { describe, it, expect } from 'vitest';

import { pgDealRoomShowsBidWizard } from '../pg-bid-wizard-visibility';

const S = pgDealRoomShowsBidWizard;

describe('pgDealRoomShowsBidWizard — 로더 프리페치와 화면 렌더의 공통 조건', () => {
  it('아직 안 낸 진행 중 견적이면 보인다', () => {
    expect(S({ hasPendingRequote: false, isAwarded: false, hasMyBid: false })).toBe(true);
  });

  it('이미 냈으면 안 보인다 (제출 요약으로 대체)', () => {
    expect(S({ hasPendingRequote: false, isAwarded: false, hasMyBid: true })).toBe(false);
  });

  it('선정이 끝났으면 안 보인다 — 낙찰이든 탈락이든', () => {
    expect(S({ hasPendingRequote: false, isAwarded: true, hasMyBid: true })).toBe(false);
    expect(S({ hasPendingRequote: false, isAwarded: true, hasMyBid: false })).toBe(false);
  });

  // 재요청은 **가장 먼저** 판정된다 — 이미 낸 견적이 있어도 다시 쓰라는 뜻이고,
  // 화면의 if/else 사슬도 이 분기를 맨 앞에 둔다. 순서를 뒤집으면 재요청받은 PG 가
  // 위저드를 못 보고 갇힌다.
  it('재요청이 있으면 이미 냈어도 보인다 (다른 조건보다 우선)', () => {
    expect(S({ hasPendingRequote: true, isAwarded: false, hasMyBid: true })).toBe(true);
    expect(S({ hasPendingRequote: true, isAwarded: true, hasMyBid: true })).toBe(true);
  });
});
