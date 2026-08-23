import { describe, expect, it } from 'vitest';

import { matchesQuery } from '../search';
import type { ContractArchiveEntry } from '@/lib/types/contract-archive';

function entry(o: Partial<ContractArchiveEntry> = {}): ContractArchiveEntry {
  return {
    id: 'a1',
    source: 'signing',
    status: 'ready',
    title: '결제대행 서비스 이용계약',
    counterpartyName: '토스페이먼츠',
    rfpCode: 'P-2607-0042',
    contractedAt: '2026-08-01T09:00:00.000Z',
    documentName: '완료본.pdf',
    hasAudit: true,
    dealHref: '/rfp/P-2607-0042',
    canDelete: false,
    createdAt: '2026-08-01T09:00:01.000Z',
    ...o,
  };
}

describe('matchesQuery', () => {
  it('빈 질의는 전부 통과시킨다', () => {
    expect(matchesQuery(entry(), '')).toBe(true);
    expect(matchesQuery(entry(), '   ')).toBe(true);
  });

  it('제목·상대방 부분 문자열로 찾는다', () => {
    expect(matchesQuery(entry(), '결제대행')).toBe(true);
    expect(matchesQuery(entry(), '토스')).toBe(true);
    expect(matchesQuery(entry(), '없는말')).toBe(false);
  });

  it('견적번호로도 찾는다 — 대소문자 무시', () => {
    expect(matchesQuery(entry(), 'p-2607')).toBe(true);
    expect(matchesQuery(entry(), 'P-2607-0042')).toBe(true);
  });

  // es-hangul 초성 검색 — 이 레포의 한글 텍스트 처리 단일 출처다.
  it('초성으로 찾는다', () => {
    expect(matchesQuery(entry(), 'ㅌㅅ')).toBe(true); // 토스
    expect(matchesQuery(entry(), 'ㄱㅈㄷㅎ')).toBe(true); // 결제대행
    expect(matchesQuery(entry(), 'ㅋㅋㅋ')).toBe(false);
  });

  it('상대방이 없어도 터지지 않는다', () => {
    expect(matchesQuery(entry({ counterpartyName: null, rfpCode: null }), '결제')).toBe(true);
    expect(matchesQuery(entry({ counterpartyName: null, rfpCode: null }), '토스')).toBe(false);
  });
});
