import { describe, expect, it } from 'vitest';
import { pgContractAction } from '../pg-contract-action';

const pending = { status: 'awaiting_pg_template' as const, hasProviderRef: false, hasPrepared: false, revision: 0 };
describe('PG 계약 다음 행동', () => {
  it.each([
    [pending, '합의서 작성하기', true],
    [{ ...pending, revision: 2 }, '이어서 작성하기', true],
    [{ ...pending, hasProviderRef: true, hasPrepared: true }, '발송 결과 확인하기', true],
    [{ ...pending, hasProviderRef: true }, '계약 상태 확인하기', true],
    [{ ...pending, status: 'sent' as const }, '서명 현황 보기', false],
    [{ ...pending, status: 'in_progress' as const }, '서명 현황 보기', false],
    [{ ...pending, status: 'completed' as const }, '완료 문서 보기', false],
    [{ ...pending, status: 'canceled' as const }, '계약 상태 확인하기', false],
    [{ ...pending, status: 'declined' as const }, '계약 상태 확인하기', false],
    [{ ...pending, status: 'expired' as const }, '계약 상태 확인하기', false],
  ])('%j → %s', (state, label, needsAction) => {
    expect(pgContractAction(state, true)).toMatchObject({ label, needsAction });
  });
  it('합의서 플래그가 꺼져 있으면 편집을 약속하지 않는다', () => {
    expect(pgContractAction(pending, false).label).toBe('계약 상태 확인하기');
  });
});
