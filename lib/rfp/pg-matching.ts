// Storage contract shared by admin-supporter-b and bidit. Rates are percentages (1.2 = 1.2%).
import { z } from 'zod';
import { MERCHANT_TIERS } from '@/lib/types/bid';

export const matchingFeesSchema = z.record(z.enum(MERCHANT_TIERS), z.number().min(0).max(100).nullable());
export const emptyMatchingFees = () => Object.fromEntries(MERCHANT_TIERS.map(tier => [tier, null])) as z.infer<typeof matchingFeesSchema>;
const identity = {
  pgWorkspaceId: z.string().uuid(),
  reason: z.string().trim().min(1).max(300),
  feeNote: z.string().trim().max(300),
};
const candidateSchema = z.object({ ...identity, feesByTier: matchingFeesSchema }).strict()
  .refine(c => Object.values(c.feesByTier).every(fee => fee === null) || c.feeNote.length > 0,
    '요율과 적용 조건을 확인해주세요');
const legacyCandidateSchema = z.object({
  ...identity,
  feeMin: z.number().min(0).max(100).nullable(),
  feeMax: z.number().min(0).max(100).nullable(),
}).strict();
const policyFields = { risk: z.enum(['unconfigured', 'white', 'gray', 'black']) };
const uniqueCandidates = (p: { candidates: { pgWorkspaceId: string }[] }) => new Set(p.candidates.map(c => c.pgWorkspaceId)).size === p.candidates.length;
// Writes accept only the new contract. Legacy data is normalized only on reads.
export const matchingPolicySchema = z.object({ ...policyFields, candidates: z.array(candidateSchema).max(50) })
  .strict().refine(uniqueCandidates, 'PG사는 한 번만 등록해요');
export const storedMatchingPolicySchema = z.object({
  ...policyFields,
  candidates: z.array(z.union([candidateSchema, legacyCandidateSchema.transform(c => ({
    pgWorkspaceId: c.pgWorkspaceId, reason: c.reason, feeNote: c.feeNote, feesByTier: emptyMatchingFees(),
  }))])).max(50),
}).strict().refine(uniqueCandidates, 'PG사는 한 번만 등록해요');
export type MatchingPolicy = z.infer<typeof matchingPolicySchema>;
export type StoredMatchingPolicy = z.input<typeof storedMatchingPolicySchema>;

export type MatchingCandidate = MatchingPolicy['candidates'][number];
export type SelectedMatchingCandidate = Pick<MatchingCandidate, 'pgWorkspaceId' | 'reason' | 'feeNote'> & {
  name: string;
  merchantTier: (typeof MERCHANT_TIERS)[number] | null;
  feeRate: number | null;
};
// Historical reviews retain their original range snapshot; never reinterpret it as a tier fee.
export type HistoricalMatchingCandidate = z.infer<typeof legacyCandidateSchema> & { name: string; merchantTier?: never; feeRate?: never };
export type Recommendation = { risk: MatchingPolicy['risk']; industryName: string; source?: 'default'; candidates: SelectedMatchingCandidate[] };
export type PgReview = { id: string; pgWorkspaceId: string; status: 'requested' | 'reviewing' | 'quoted' | 'rejected' | 'withdrawn' | 'buyer_ended'; reason: string; createdAt: string; updatedAt: string; candidate: SelectedMatchingCandidate | HistoricalMatchingCandidate };
export type BuyerMatching = { industryName: string; reviews: PgReview[]; recommendation: Recommendation };

export function eligibleMatchingCandidates(policy: MatchingPolicy, activePgIds: string[], previousPgIds: string[]): MatchingCandidate[] {
  if (policy.risk !== 'white' && policy.risk !== 'gray') return [];
  const active = new Set(activePgIds);
  const previous = new Set(previousPgIds);
  return policy.candidates.filter(c => active.has(c.pgWorkspaceId) && !previous.has(c.pgWorkspaceId));
}

export const MATCHING_ERRORS: Record<string, string> = {
  MATCHING_REQUIRED: '업종을 선택하고 추천 PG사를 확인해주세요.',
  MATCHING_REQUEST_CHANGED: '이전에 다른 내용으로 접수한 상담이 있어요. 견적 요청 목록에서 먼저 확인해주세요.',
  MATCHING_UNAVAILABLE: '추천 기준이 바뀌었어요. 추천 결과를 다시 확인해주세요.',
  MATCHING_BUSY: '이미 진행 중인 상담이 있어요. 새로고침해 주세요.',
  MATCHING_REVIEW_CLOSED: '이 상담은 검토를 마쳤어요. 새로고침해 주세요.',
  MATCHING_ONLY: '추천받은 PG사에 한 곳씩 상담을 요청할 수 있어요.',
  INVALID_INPUT: '입력한 내용을 확인해주세요.',
  RFP_NOT_OPEN: '진행 중인 요청에서만 검토할 수 있어요.',
  REVIEW_DEADLINE_PASSED: '견적 접수 기간이 끝나 검토를 시작할 수 없어요.',
  NETWORK_ERROR: '연결이 잠시 끊겼어요. 다시 시도해주세요.',
};
