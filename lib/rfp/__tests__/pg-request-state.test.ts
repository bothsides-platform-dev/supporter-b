import { describe, expect, it } from 'vitest';
import { pgRequestState } from '../pg-request-state';

const now = Date.parse('2026-10-30T00:00:00Z');
const base = { stage: 'received' as const, rfpStatus: 'sent' as const, rfpDeadline: '2026-11-02T09:00:00Z' };

describe('PG 요청의 상태와 다음 행동', () => {
  it.each([
    [{}, '신규', true, '견적 작성'],
    [{ reviewStatus: 'reviewing' }, '검토 중', true, '견적 작성'],
    [{ stage: 'submitted' }, '견적 보냄', false, '보낸 견적'],
    [{ stage: 'submitted', hasPendingRequote: true }, '수정 요청', true, '견적 수정'],
    [{ reviewStatus: 'rejected' }, '상담 거절', false, '요청 보기'],
    [{ reviewStatus: 'withdrawn' }, '견적 철회', false, '요청 보기'],
    [{ reviewStatus: 'buyer_ended' }, '상담 종료', false, '요청 보기'],
    [{ rfpStatus: 'cancelled', stage: 'lost' }, '취소', false, '견적 결과'],
    [{ rfpStatus: 'closed', stage: 'lost' }, '마감', false, '견적 결과'],
    [{ rfpStatus: 'awarded', stage: 'won' }, '선정됨', false, '견적 결과'],
    [{ rfpStatus: 'awarded', stage: 'lost' }, '미선정', false, '견적 결과'],
    [{ hasPendingRequote: true, rfpDeadline: '2026-10-30T00:00:00Z' }, '마감', false, '견적 결과'],
  ] as const)('%j → %s', (overrides, label, needsResponse, actionLabel) => {
    expect(pgRequestState({ ...base, ...overrides }, now)).toMatchObject({ label, needsResponse, actionLabel });
  });
});
