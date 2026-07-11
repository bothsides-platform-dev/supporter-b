import { lookupBizNoAction } from '@/lib/server/actions/rfp';

// BizLookupField.onLookup 이 기대하는 응답 형태 (BizLookupField.tsx 의
// LookupResponse 와 구조 동일).
export type NtsLookupResponse =
  | {
      valid: true;
      taxType: 'general' | 'simple' | 'exempt';
      status: 'active' | 'suspended' | 'closed';
    }
  | { valid: false; error?: string };

/**
 * BizLookupField 공용 조회 어댑터 — 구매사 가입·PG 가입·설정 3개 폼이 공유.
 *
 * 매핑 규칙:
 *   - 레이트리밋           → '요청이 너무 많아요…' (재시도 유도)
 *   - 그 외 액션 실패      → '조회 중 오류가 발생했어요…' (시스템 오류)
 *   - 미등록(valid:false)  → error 없이 반환 — 필드 기본 '찾지 못했어요' 안내
 *   - taxType 매핑 불가    → '지원되지 않는 사업자 유형' (비영리·고유번호 단체 등;
 *                            저장 액션의 z.enum 이 거부하므로 여기서 선차단)
 */
export async function ntsLookup(bizNo: string): Promise<NtsLookupResponse> {
  const r = await lookupBizNoAction(bizNo);
  if (!r.ok) {
    return {
      valid: false,
      error:
        r.error === 'NTS_RATE_LIMIT'
          ? '요청이 너무 많아요. 잠시 후 다시 시도해주세요.'
          : '사업자번호 조회 중 오류가 발생했어요. 잠시 후 다시 시도해주세요.',
    };
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
