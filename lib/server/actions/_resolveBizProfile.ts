import { getNtsClient, NtsError } from '@/lib/integrations/nts';
import { captureActionError } from '@/lib/observability/capture';
import type { MerchantTier } from '@/lib/types/bid';

export type BizGradeSource = 'user_confirmed' | 'user_overridden' | 'unset';

export type IncomingBizProfile = {
  bizNo: string;
  /**
   * 클라이언트가 조회 결과로 채워 보내는 값 — **읽지 않는다**. 스키마에 남아 있는
   * 이유는 하위 호환(기존 클라이언트가 계속 보냄)뿐이다. 아래 재판정 참조.
   */
  taxType?: 'general' | 'simple' | 'exempt';
  status?: 'active' | 'suspended' | 'closed';
  /** NTS 파생값이 아니다 — 입력을 그대로 보존한다. */
  grade?: MerchantTier;
  gradeSource?: BizGradeSource;
};

export type ResolvedBizProfile =
  | {
      ok: true;
      /** 국세청 조회로 확인됐는가. false = 상위 장애로 미검증 통과. */
      verified: boolean;
      bizProfile: {
        bizNo: string;
        taxType?: 'general' | 'simple' | 'exempt';
        status?: 'active' | 'suspended' | 'closed';
        grade?: MerchantTier;
        gradeSource: BizGradeSource;
      };
    }
  | {
      ok: false;
      error:
        | 'BIZ_NOT_FOUND'
        | 'BIZ_STATUS_NOT_ACTIVE'
        | 'BIZ_UNSUPPORTED_TYPE'
        | 'BIZ_LOOKUP_RATE_LIMITED';
    };

/**
 * 사업자 프로필을 **서버가 직접 판정**해서 쓰기 가능한 형태로 만든다.
 *
 * 국세청 장애 시 가입을 막지 않으려면 미검증 프로필을 받아들여야 하는데, 그 판정을
 * 클라이언트에게 맡기면 "taxType 을 빼고 보내기"만으로 사업자번호 검증을 통째로
 * 끌 수 있게 된다. 그래서 **클라이언트가 보낸 taxType/status 는 어떤 경우에도
 * 쓰지 않고** 서버가 매번 직접 조회한다 — 생략 우회뿐 아니라 값 위조도 함께 막힌다.
 * (예전에는 클라이언트 값을 그대로 신뢰했으므로, 이 함수는 그 구멍도 같이 닫는다.)
 *
 * 판정:
 *   - 조회 성공 + 계속사업자 + taxType 매핑 → verified 프로필
 *   - 폐업/휴업·미등록·미지원 유형          → 거부 (장애와 무관한 사용자 오류)
 *   - 인프라 오류(상위 장애·설정 오류)      → **미검증 프로필로 통과**
 *   - 레이트리밋                            → 거부. 저하로 통과시키면 버킷을 일부러
 *     고갈시켜 검증을 우회하는 경로가 열린다(in-process 버킷은 남용 방어선).
 *
 * 미검증으로 통과한 워크스페이스는 `pending` 으로 남아 관리자 승인이 최종 방어선이
 * 되고, 심사 메일·risk flag 가 그 사실을 운영자에게 알린다.
 *
 * 비용은 쓰기 1건당 조회 1회다. 가입·워크스페이스 생성은 드물고, 회로 차단기가
 * 열려 있으면 네트워크 왕복 없이 즉시 반환하므로 장애 중 지연도 없다.
 */
export async function resolveBizProfileForWrite(
  input: IncomingBizProfile,
): Promise<ResolvedBizProfile> {
  const bizNo = input.bizNo.replace(/\D/g, '');
  const gradeSource: BizGradeSource = input.gradeSource ?? 'unset';

  let looked;
  try {
    // 쓰기 경로는 예약 토큰까지 쓴다 — 비인증 대화형 조회가 버킷을 말려도
    // 가입/워크스페이스 생성이 막히지 않아야 한다(nts.ts WRITE_RESERVED_TOKENS).
    looked = await getNtsClient().lookup(bizNo, { pool: 'write' });
  } catch (e) {
    // 우리 버킷 고갈만 거부한다. 공급사 429 는 상위 장애라 아래 저하 경로로 간다 —
    // 둘을 한 코드로 묶으면 공급사 쿼터가 마르는 순간 가입이 통째로 막힌다.
    if (e instanceof NtsError && e.code === 'NTS_LOCAL_THROTTLED') {
      return { ok: false, error: 'BIZ_LOOKUP_RATE_LIMITED' };
    }
    // 상위 장애(UPSTREAM_DOWN)를 뺀 모든 저하는 **우리 잘못**이다: 키 누락·만료,
    // 4xx(요청 계약 위반), 그리고 NtsError 조차 아닌 예외(클라이언트 버그, odcloud
    // 응답 스키마 변경). 이 경로는 `lookupBizNoAction` 을 지나지 않으므로 여기서
    // 보고하지 않으면 **검증이 통째로 꺼진 채 아무도 모른다** — 저하 모드가 우리
    // 버그를 영구히 가려 주는 최악의 형태.
    const supplierOutage =
      e instanceof NtsError &&
      (e.code === 'NTS_UPSTREAM_DOWN' || e.code === 'NTS_RATE_LIMIT');
    if (!supplierOutage) {
      captureActionError('resolveBizProfileForWrite', e, null, { bizNo });
    }
    // 인프라 오류 — 저하 모드로 통과시킨다.
    return {
      ok: true,
      verified: false,
      bizProfile: {
        bizNo,
        taxType: undefined,
        status: undefined,
        grade: input.grade,
        gradeSource,
      },
    };
  }

  if (!looked.valid) return { ok: false, error: 'BIZ_NOT_FOUND' };
  if (looked.status !== 'active') return { ok: false, error: 'BIZ_STATUS_NOT_ACTIVE' };
  if (!looked.taxType) return { ok: false, error: 'BIZ_UNSUPPORTED_TYPE' };

  return {
    ok: true,
    verified: true,
    bizProfile: {
      bizNo,
      taxType: looked.taxType,
      status: looked.status,
      grade: input.grade,
      gradeSource,
    },
  };
}
