import { z } from 'zod';

const candidateSchema = z.object({
  pgWorkspaceId: z.string().uuid(),
  reason: z.string().trim().min(1).max(300),
  feeMin: z.number().min(0).max(100).nullable(),
  feeMax: z.number().min(0).max(100).nullable(),
  feeNote: z.string().trim().max(300),
}).strict().refine(c => (c.feeMin === null && c.feeMax === null) ||
  (c.feeMin !== null && c.feeMax !== null && c.feeMin <= c.feeMax && c.feeNote.length > 0),
  '요율 범위와 적용 조건을 확인해주세요');

export const matchingPolicySchema = z.object({
  risk: z.enum(['unconfigured', 'white', 'gray', 'black']),
  candidates: z.array(candidateSchema).max(50),
}).strict().refine(p => new Set(p.candidates.map(c => c.pgWorkspaceId)).size === p.candidates.length, 'PG사는 한 번만 등록해요');
export type MatchingPolicy = z.infer<typeof matchingPolicySchema>;
export type MatchingCandidate = MatchingPolicy['candidates'][number];
export type Recommendation = { risk: MatchingPolicy['risk']; industryName: string; candidates: (MatchingCandidate & { name: string })[] };
export type PgReview = { id: string; pgWorkspaceId: string; status: 'requested' | 'reviewing' | 'quoted' | 'rejected' | 'withdrawn'; reason: string; createdAt: string; updatedAt: string; candidate: MatchingCandidate & { name: string } };
export type BuyerMatching = { industryName: string; reviews: PgReview[]; recommendation: Recommendation };

export function eligibleMatchingCandidates(policy: MatchingPolicy, activePgIds: string[], previousPgIds: string[]): MatchingCandidate[] {
  if (policy.risk !== 'white' && policy.risk !== 'gray') return [];
  const active = new Set(activePgIds);
  const previous = new Set(previousPgIds);
  return policy.candidates.filter(c => active.has(c.pgWorkspaceId) && !previous.has(c.pgWorkspaceId));
}

export const MATCHING_ERRORS: Record<string, string> = {
  MATCHING_REQUIRED: '업종을 선택하고 추천 PG사를 확인해주세요.',
  MATCHING_UNAVAILABLE: '추천 기준이 바뀌었어요. 추천 결과를 다시 확인해주세요.',
  MATCHING_BUSY: '이미 진행 중인 상담이 있어요. 새로고침해 주세요.',
  MATCHING_REVIEW_CLOSED: '이 상담은 검토를 마쳤어요. 새로고침해 주세요.',
  MATCHING_ONLY: '추천받은 PG사에 한 곳씩 상담을 요청할 수 있어요.',
  INVALID_INPUT: '입력한 내용을 확인해주세요.',
  RFP_NOT_OPEN: '진행 중인 요청에서만 검토할 수 있어요.',
  NETWORK_ERROR: '연결이 잠시 끊겼어요. 다시 시도해주세요.',
};
