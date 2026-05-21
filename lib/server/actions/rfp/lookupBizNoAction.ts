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
    const result = await getNtsClient().lookup(parsed.data);
    return { ok: true, ...result };
  } catch (e) {
    if (e instanceof NtsError) {
      // Expected upstream outcomes (no key, invalid key, network) — categorized,
      // not reported.
      return { ok: false, error: e.code };
    }
    // Unexpected (e.g. a parse/contract failure inside the client) — report it.
    captureActionError('lookupBizNoAction', e);
    return { ok: false, error: 'NTS_NETWORK' };
  }
}
