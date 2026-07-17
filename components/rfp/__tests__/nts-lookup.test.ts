import { beforeEach, describe, expect, it, vi } from 'vitest';

const lookupBizNoAction = vi.fn();
vi.mock('@/lib/server/actions/rfp', () => ({
  lookupBizNoAction: (bizNo: string) => lookupBizNoAction(bizNo),
}));

import { ntsLookup } from '../nts-lookup';

describe('ntsLookup (BizLookupField 공용 어댑터)', () => {
  beforeEach(() => {
    lookupBizNoAction.mockReset();
  });

  it('maps NTS_RATE_LIMIT to the too-many-requests message', async () => {
    lookupBizNoAction.mockResolvedValue({ ok: false, error: 'NTS_RATE_LIMIT' });
    await expect(ntsLookup('123-45-67890')).resolves.toEqual({
      valid: false,
      error: '요청이 너무 많아요. 잠시 후 다시 시도해주세요.',
    });
  });

  it.each(['NTS_NO_KEY', 'NTS_INVALID_KEY', 'NTS_NETWORK'])(
    'maps %s to the generic lookup-error message',
    async (error) => {
      lookupBizNoAction.mockResolvedValue({ ok: false, error });
      await expect(ntsLookup('123-45-67890')).resolves.toEqual({
        valid: false,
        error: '사업자번호 조회 중 오류가 발생했어요. 잠시 후 다시 시도해주세요.',
      });
    },
  );

  // 미등록 번호 — error 없이 valid:false 만 반환해 BizLookupField 의 기본
  // '사업자번호를 찾지 못했어요.' 안내를 쓰게 한다.
  it('maps ok+valid:false (unregistered) to a plain not-found response', async () => {
    lookupBizNoAction.mockResolvedValue({ ok: true, valid: false });
    await expect(ntsLookup('000-00-00000')).resolves.toEqual({ valid: false });
  });

  // 비영리법인·고유번호 단체 등은 taxType 이 매핑되지 않는다 — 지원 불가 안내.
  it('maps a valid lookup without a supported taxType to the unsupported-type message', async () => {
    lookupBizNoAction.mockResolvedValue({
      ok: true,
      valid: true,
      status: 'active',
      taxType: undefined,
    });
    await expect(ntsLookup('123-45-67890')).resolves.toEqual({
      valid: false,
      error: '지원되지 않는 사업자 유형이에요. 고객센터로 문의해 주세요.',
    });
  });

  it('passes through a valid lookup with taxType and status', async () => {
    lookupBizNoAction.mockResolvedValue({
      ok: true,
      valid: true,
      taxType: 'simple',
      status: 'suspended',
    });
    await expect(ntsLookup('123-45-67890')).resolves.toEqual({
      valid: true,
      taxType: 'simple',
      status: 'suspended',
    });
  });

  it('forwards the formatted bizNo to the action unchanged', async () => {
    lookupBizNoAction.mockResolvedValue({ ok: true, valid: false });
    await ntsLookup('123-45-67890');
    expect(lookupBizNoAction).toHaveBeenCalledWith('123-45-67890');
  });
});
