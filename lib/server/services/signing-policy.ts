import type { AuditLogRepo, BidRepo } from '@/lib/server/repositories/types';
import { logger } from '@/lib/observability/logger';
import { PROVIDER_ENFORCED_SECURITY_METHOD } from '@/lib/signing/security-method';
import { SIGNING_ROLE_LABELS } from '@/lib/signing/template-fields';
import { type SnowSignContractDetail } from '@/lib/server/signing/snowsign-client';
import type { RFP } from '@/lib/types/rfp';
import type { SigningContractStatus, SigningParticipantStatus } from '@/lib/types/signing';
import type { Actor } from './types';

export const TERMINAL = new Set<SigningContractStatus>([
  'completed',
  'declined',
  'expired',
  'canceled',
]);

// 임베드가 실제로 **발송까지** 끝낸 계약인지 판정한다. 초안(`draft`)은 아무에게도
// 나가지 않았으므로 딜룸을 '발송됨'으로 전진시키면 안 된다.
// 실측(docs/SNOWSIGN_SANDBOX.md Q2) 상 발송 직후 status 는 `pending` 이다.
// 종결 상태는 **일부러 뺐다.** 임베드를 막 끝낸 계약이 completed·cancelled 일 수는
// 없다. 그런 걸 붙이면 딜룸이 '전자서명이 시작됐어요'를 알린 직후 '서명 완료'가 되고,
// 이 딜의 누구도 서명하지 않은 문서의 다운로드 링크가 구매사에게 열린다.
// (종결 상태 매핑은 `mapProviderContractStatus` 가 따로 소유한다 — reconcile 경로.)
export const DISPATCHED_PROVIDER_STATUSES = new Set(['pending', 'sent', 'in_progress']);

/**
 * 이 계약이 **이 딜의 것인지** 판정한다 — 복구의 보안 경계.
 *
 * 구매사 담당자 이메일 하나로는 안 된다. 그건 "이 딜"이 아니라 "이 구매사"를 가리켜서,
 * 한 담당자가 견적을 여럿 낸 평범한 상황에 대기 중인 딜이 다른 딜의 계약을 집어온다
 * (지난 시도에서 이걸로 경쟁 PG 의 취소권과 완료본이 넘어갈 뻔했다).
 *
 * PG 쪽은 `bid.submittedBy` 가 아니라 **워크스페이스 승인 멤버 전체**로 본다 —
 * 견적을 낸 사람과 계약을 보낸 사람이 다를 수 있고, 좁게 잡으면 정작 필요할 때
 * 후보가 0건이 돼 조용히 실패한다. 딜 스코핑(경쟁사 배제)은 그대로 유지된다.
 *
 * 나중에 `participantMismatch` 를 경고에서 차단으로 승격할 때 여기 한 곳만 고치면 된다.
 */
export function participantsMatchDeal(
  participants: ReadonlyArray<{ email: string }>,
  buyerEmail: string,
  pgEmails: ReadonlySet<string>,
): boolean {
  const emails = participants.map((p) => p.email.toLowerCase());
  return emails.includes(buyerEmail) && emails.some((e) => pgEmails.has(e));
}

export function isDispatchedProviderStatus(s: string): boolean {
  return DISPATCHED_PROVIDER_STATUSES.has(s.trim().toLowerCase());
}

/**
 * 이 **초안 자신의** 참여자 정책이 본인인증으로 강제돼 있는가.
 *
 * 발송 전 정책 검사(`getTemplate` 의 `signers[].security_method`)는 **템플릿**을 본다 —
 * 이미 만들어진 초안의 참여자 정책은 생성 시점에 고정되고 그 검사에 보이지 않는다.
 * 그래서 초안을 재사용하려면 초안에게 직접 물어야 한다. 물어보지 않으면, 본인인증
 * 도입 전에 phone 없이 만들어진 초안이 그대로 발송되면서 우리 참여자 행에는
 * `easy_cert` 가 적히는 거짓말이 된다(정확히 발송 게이트가 막으려던 그것).
 *
 * fail-closed 다 — 참여자가 없거나 모자라거나 값이 비면 "강제 아님"으로 읽는다.
 * 템플릿 경로는 **항상 정확히 두 역할**(`SIGNING_ROLE_LABELS`)로 계약을 만들므로
 * 길이 조건이 값싼 안전벨트가 된다. 틀린 쪽으로 틀려도 손해는 초안 하나를 다시
 * 만드는 것뿐이고(발송 전이라 메일도 쿼터도 안 썼다), 반대로 틀리면 강제가 꺼진
 * 계약이 나간다.
 */
export function isDraftAuthEnforced(d: SnowSignContractDetail): boolean {
  return (
    d.participants.length >= SIGNING_ROLE_LABELS.length &&
    d.participants.every((p) => p.securityMethod === PROVIDER_ENFORCED_SECURITY_METHOD)
  );
}

// 알려진 non-terminal(무시해도 되는) provider status — 미지값 경고에서 제외.
export const KNOWN_NOOP_PROVIDER_STATUSES = new Set(['draft', 'pending', 'sent']);

export function mapProviderContractStatus(s: string): SigningContractStatus | undefined {
  // 대소문자·공백 변형('COMPLETED', ' Completed ')도 인식한다. synonym 추정은 하지
  // 않는다(계약 완료는 금융 행위 — 임의 매핑 위험). 정규화만 한다.
  switch (s.trim().toLowerCase()) {
    case 'in_progress':
      return 'in_progress';
    case 'completed':
      return 'completed';
    case 'rejected':
    case 'declined':
      return 'declined';
    case 'expired':
      return 'expired';
    case 'cancelled':
    case 'canceled':
      return 'canceled';
    default:
      return undefined; // draft/pending/sent 등 — 변화 없음
  }
}

// 참여자 상태 단조 순위(역행 방지). rejected 는 signed 와 동급의 종결 상태.
export const PARTICIPANT_RANK: Record<SigningParticipantStatus, number> = {
  pending: 0,
  viewed: 1,
  signed: 2,
  rejected: 2,
};

export const FINAL_PARTICIPANT_STATUSES = new Set<SigningParticipantStatus>(['signed', 'rejected']);
export async function resolveSigningParty(
  bidRepo: BidRepo,
  rfp: RFP,
  actor: Actor,
): Promise<'buyer' | 'pg' | null> {
  if (rfp.buyerWsId === actor.workspaceId) return 'buyer';
  if (rfp.awardedBidId) {
    const bid = await bidRepo.findById(rfp.awardedBidId);
    if (bid?.pgWsId === actor.workspaceId) return 'pg';
  }
  return null;
}
export async function auditSigningBestEffort(
  auditRepo: AuditLogRepo,
  entry: Parameters<AuditLogRepo['insert']>[0],
  logKey: string,
): Promise<void> {
  try {
    await auditRepo.insert(entry);
  } catch (e) {
    logger.warn(logKey, { err: String(e) });
  }
}
