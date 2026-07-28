import { lookupBizNoAction } from '@/lib/server/actions/rfp';
import type { LookupResponse } from './BizLookupField';

/**
 * 인프라 오류 = 사용자 잘못이 아님 → 오류를 띄우고 가입을 막는 대신 미검증으로
 * 통과시킨다(저하 모드). 워크스페이스는 어차피 `pending` 으로 생성되므로 관리자
 * 승인이 최종 방어선이고, 장애 사실은 Sentry·심사메일로 운영자에게만 간다.
 *
 * `NTS_NO_KEY`/`NTS_INVALID_KEY`(우리 설정 오류)까지 포함하는 이유: 사용자 관점에서
 * 공급사 장애와 구분이 불가능하고, 우리 실수로 가입 퍼널을 막는 것이 최악이다.
 * 이 둘은 `lookupBizNoAction` 이 매 요청 Sentry 로 보고하므로 운영자는 즉시 안다.
 *
 * `NTS_RATE_LIMIT` 은 **의도적으로 제외** — in-process 버킷(10 req/s)은 남용
 * 방어선이라, 저하로 통과시키면 버킷을 일부러 고갈시켜 검증을 우회하는 길이 열린다.
 */
const DEGRADED_CODES = new Set([
  'NTS_NO_KEY',
  'NTS_INVALID_KEY',
  'NTS_NETWORK',
  'NTS_UPSTREAM_DOWN',
]);

const GENERIC_ERROR = '사업자번호 조회 중 오류가 발생했어요. 잠시 후 다시 시도해주세요.';

async function lookup(bizNo: string, allowDegraded: boolean): Promise<LookupResponse> {
  const r = await lookupBizNoAction(bizNo);
  if (!r.ok) {
    if (r.error === 'NTS_RATE_LIMIT') {
      return { valid: false, error: '요청이 너무 많아요. 잠시 후 다시 시도해주세요.' };
    }
    if (allowDegraded && DEGRADED_CODES.has(r.error)) {
      return { valid: false, degraded: true };
    }
    return { valid: false, error: GENERIC_ERROR };
  }
  if (!r.valid) return { valid: false };
  if (!r.taxType || !r.status) {
    return {
      valid: false,
      error: '지원되지 않는 사업자 유형이에요. 고객센터로 문의해 주세요.',
    };
  }
  return { valid: true, taxType: r.taxType, status: r.status };
}

/**
 * BizLookupField 공용 조회 어댑터 — **가입 흐름**(구매사 가입·PG 가입)이 공유한다.
 *
 * 매핑 규칙:
 *   - 레이트리밋           → '요청이 너무 많아요…' (재시도 유도)
 *   - 인프라 오류          → degraded — 오류 없이 미검증 통과 (위 주석 참조)
 *   - 그 외 액션 실패      → '조회 중 오류가 발생했어요…' (예: INVALID_INPUT)
 *   - 미등록(valid:false)  → error 없이 반환 — 필드 기본 '찾지 못했어요' 안내
 *   - taxType 매핑 불가    → '지원되지 않는 사업자 유형' (비영리·고유번호 단체 등;
 *                            저장 액션의 z.enum 이 거부하므로 여기서 선차단)
 */
export function ntsLookup(bizNo: string): Promise<LookupResponse> {
  return lookup(bizNo, true);
}

/**
 * 저하를 허용하지 않는 변형 — **설정 화면의 사업자번호 변경** 전용.
 *
 * 저하 모드가 성립하는 근거는 "워크스페이스가 `pending` 이라 관리자 승인이 최종
 * 방어선"이라는 것이다. 설정에서의 변경은 이미 승인을 통과한 워크스페이스에서
 * 일어나므로 그 방어선이 없다 — 여기서 미검증 통과를 허용하면 승인 게이트를
 * 우회해 임의의 사업자번호로 바꿔치기할 수 있다.
 */
export function ntsLookupStrict(bizNo: string): Promise<LookupResponse> {
  return lookup(bizNo, false);
}
