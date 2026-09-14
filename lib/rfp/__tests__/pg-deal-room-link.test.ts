import { describe, it, expect } from 'vitest';

import {
  PG_DEAL_ROOM_TAB_QUERY_KEY,
  parsePgDealRoomTab,
  pgDealRoomLink,
} from '../pg-deal-room-link';

describe('pgDealRoomLink', () => {
  it('탭을 지정하지 않으면 딜룸 경로만 만든다(기본 탭 = 요청 조건)', () => {
    expect(pgDealRoomLink('P-2609-0001')).toBe('/inbox/P-2609-0001');
  });

  it('계약·견적 작성 탭은 쿼리로 싣는다', () => {
    expect(pgDealRoomLink('P-2609-0001', 'contract')).toBe('/inbox/P-2609-0001?tab=contract');
    expect(pgDealRoomLink('P-2609-0001', 'write')).toBe('/inbox/P-2609-0001?tab=write');
  });

  // 만드는 쪽과 읽는 쪽이 같은 키·같은 값을 써야 딥링크가 산다.
  it('만든 링크를 읽는 쪽이 그대로 되읽는다', () => {
    for (const tab of ['contract', 'write'] as const) {
      const url = new URL(pgDealRoomLink('P-2609-0001', tab), 'http://x');
      expect(url.pathname).toBe('/inbox/P-2609-0001');
      expect(parsePgDealRoomTab(url.searchParams.get(PG_DEAL_ROOM_TAB_QUERY_KEY) ?? undefined)).toBe(tab);
    }
  });
});

describe('parsePgDealRoomTab', () => {
  it('딥링크 대상 탭만 받아들인다', () => {
    expect(parsePgDealRoomTab('contract')).toBe('contract');
    expect(parsePgDealRoomTab('write')).toBe('write');
  });

  it('모르는 값·기본 탭·없음은 undefined 로 버린다', () => {
    expect(parsePgDealRoomTab(undefined)).toBeUndefined();
    expect(parsePgDealRoomTab('')).toBeUndefined();
    expect(parsePgDealRoomTab('request')).toBeUndefined();
    expect(parsePgDealRoomTab('attach')).toBeUndefined();
    expect(parsePgDealRoomTab('CONTRACT')).toBeUndefined();
    expect(parsePgDealRoomTab('javascript:alert(1)')).toBeUndefined();
  });

  // 쿼리 키가 반복되면 Next 는 배열을 준다 — 첫 값만 본다.
  it('배열이면 첫 값만 본다', () => {
    expect(parsePgDealRoomTab(['contract', 'write'])).toBe('contract');
    expect(parsePgDealRoomTab(['bogus', 'contract'])).toBeUndefined();
    expect(parsePgDealRoomTab([])).toBeUndefined();
  });
});
