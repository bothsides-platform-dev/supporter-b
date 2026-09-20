import { describe, expect, it } from 'vitest';
import { matchingPolicySchema, eligibleMatchingCandidates } from '../pg-matching';

const first = '10000000-0000-4000-8000-000000000001';
const second = '10000000-0000-4000-8000-000000000002';
const candidate = (pgWorkspaceId: string) => ({ pgWorkspaceId, reason: '온라인 판매 검토', feeMin: 0.8, feeMax: 0.9, feeNote: '부가세 별도' });

describe('관리자 PG 추천 기준', () => {
  it('차단·미설정 업종은 후보가 등록되어 있어도 추천하지 않는다', () => {
    for (const risk of ['black', 'unconfigured'] as const) {
      expect(eligibleMatchingCandidates({ risk, candidates: [candidate(first)] }, [first], [])).toEqual([]);
    }
  });
  it('운영자가 정한 순서로 활성 후보를 반환하고 이전 요청 PG를 제외한다', () => {
    const policy = { risk: 'gray' as const, candidates: [candidate(second), candidate(first)] };
    expect(eligibleMatchingCandidates(policy, [first, second], []).map(c => c.pgWorkspaceId)).toEqual([second, first]);
    expect(eligibleMatchingCandidates(policy, [first, second], [second]).map(c => c.pgWorkspaceId)).toEqual([first]);
    expect(eligibleMatchingCandidates(policy, [first], []).map(c => c.pgWorkspaceId)).toEqual([first]);
  });
  it('잘못된 요율 범위와 중복 PG를 저장하지 않는다', () => {
    expect(matchingPolicySchema.safeParse({ risk: 'white', candidates: [{ ...candidate(first), feeMin: 1, feeMax: 0.8 }] }).success).toBe(false);
    expect(matchingPolicySchema.safeParse({ risk: 'white', candidates: [candidate(first), candidate(first)] }).success).toBe(false);
    expect(matchingPolicySchema.safeParse({ risk: 'white', candidates: [{ ...candidate(first), feeNote: '' }] }).success).toBe(false);
  });
  it('요율 미확정은 숫자를 만들어내지 않고 null로 보존한다', () => {
    const policy = matchingPolicySchema.parse({ risk: 'gray', candidates: [{ ...candidate(first), feeMin: null, feeMax: null, feeNote: '' }] });
    expect(policy.candidates[0].feeMin).toBeNull();
  });
});
