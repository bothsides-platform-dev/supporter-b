import type { SigningContractStatus } from '@/lib/types/signing';
import { LONG_TERM_AGREEMENTS_ENABLED } from '@/lib/features/long-term-agreements';

export type PgContractState = {
  status: SigningContractStatus;
  revision: number;
  hasProviderRef: boolean;
  hasPrepared: boolean;
};
export type PgContractSummary = PgContractState & {
  rfpId: string;
  rfpCode: string;
  rfpTitle: string;
  buyerName: string;
};
/** 화면 이동만 안내한다. 실제 편집·발송 가능 여부는 계약 탭이 다시 검증한다. */
export function pgContractAction(
  state: PgContractState,
  agreementsEnabled = LONG_TERM_AGREEMENTS_ENABLED,
) {
  if (state.status === 'awaiting_pg_template') {
    if (!agreementsEnabled || (state.hasProviderRef && !state.hasPrepared))
      return { label: '계약 상태 확인하기', needsAction: true };
    if (state.hasProviderRef)
      return { label: '발송 결과 확인하기', needsAction: true };
    return {
      label: state.revision > 0 ? '이어서 작성하기' : '합의서 작성하기',
      needsAction: true,
    };
  }
  if (state.status === 'sent' || state.status === 'in_progress')
    return { label: '서명 현황 보기', needsAction: false };
  if (state.status === 'completed')
    return { label: '완료 문서 보기', needsAction: false };
  return { label: '계약 상태 확인하기', needsAction: false };
}
