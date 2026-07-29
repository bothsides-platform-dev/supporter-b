'use server';

import { z } from 'zod';
import { getNtsClient, NtsError, type NtsLookupResult } from '@/lib/integrations/nts';
import { captureActionError } from '@/lib/observability/capture';
import type { RfpActionResult } from './_shared';

const Input = z.string().min(8).max(20);

export type LookupBizNoResult = RfpActionResult<NtsLookupResult>;

/**
 * NTS 사업자번호 조회. 인증 불필요 — 국세청 공공 API 읽기 전용 호출이므로
 * 가입 흐름(비인증 공개 라우트)에서도 호출 가능. 남용 방지는 in-process
 * leaky-bucket(10 req/s)으로 충분하다.
 *
 * 반환:
 *   - ok: true  + valid:true + taxType + status        (정상 조회)
 *   - ok: true  + valid:false                          (등록 안 됨)
 *   - ok: false + error: 'NTS_*'                       (키 누락/만료/네트워크)
 */
export async function lookupBizNoAction(
  bizNo: string,
): Promise<LookupBizNoResult> {
  const parsed = Input.safeParse(bizNo);
  if (!parsed.success) return { ok: false, error: 'INVALID_INPUT' };

  try {
    // 비인증 대화형 조회 — 쓰기 예약분 아래로는 토큰을 소비하지 않는다.
    const result = await getNtsClient().lookup(parsed.data, { pool: 'interactive' });
    return { ok: true, ...result };
  } catch (e) {
    if (e instanceof NtsError) {
      // 보고 대상은 "우리 잘못" 뿐이다:
      //   - NO_KEY/INVALID_KEY : 조회 전면 차단으로 이어지는 운영 장애(설정 오류).
      //   - NETWORK            : 전송 실패가 UPSTREAM_DOWN 으로 옮겨간 뒤로는
      //                          401/403/429 를 뺀 4xx, 즉 우리 요청의 계약 위반만
      //                          남았다. 조용히 넘기면 저하 모드가 우리 버그를
      //                          영구히 가려 준다.
      // 반대로 UPSTREAM_DOWN/RATE_LIMIT 은 요청마다 보고하면 free plan 5k/mo 를
      // 태우므로 미보고한다 — 상위 장애 알림은 회로 차단기가 전이 시 1회만 낸다.
      if (
        e.code === 'NTS_NO_KEY' ||
        e.code === 'NTS_INVALID_KEY' ||
        e.code === 'NTS_NETWORK'
      ) {
        captureActionError('lookupBizNoAction', e);
      }
      return { ok: false, error: e.code };
    }
    // Unexpected (e.g. a parse/contract failure inside the client) — report it.
    captureActionError('lookupBizNoAction', e);
    return { ok: false, error: 'NTS_NETWORK' };
  }
}
