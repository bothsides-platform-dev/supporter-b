import { beforeEach, describe, expect, it, vi } from 'vitest';

const lookupBizNoAction = vi.fn();
vi.mock('@/lib/server/actions/rfp', () => ({
  lookupBizNoAction: (bizNo: string) => lookupBizNoAction(bizNo),
}));

import { ntsLookup, ntsLookupStrict } from '../nts-lookup';

describe('ntsLookup (BizLookupField 공용 어댑터)', () => {
  beforeEach(() => {
    lookupBizNoAction.mockReset();
  });

  // 레이트리밋은 저하 대상이 **아니다**. 우리 in-process 버킷(10 req/s)은 남용
  // 방어선인데, 이걸 저하로 통과시키면 "버킷을 일부러 고갈시켜 사업자번호 검증을
  // 우회하는" 경로가 생긴다. 사용자 잘못이 아닌 인프라 오류 중 유일한 예외.
  it('maps NTS_LOCAL_THROTTLED to the too-many-requests message (not degraded)', async () => {
    lookupBizNoAction.mockResolvedValue({ ok: false, error: 'NTS_LOCAL_THROTTLED' });
    await expect(ntsLookup('123-45-67890')).resolves.toEqual({
      valid: false,
      error: '요청이 너무 많아요. 잠시 후 다시 시도해주세요.',
    });
  });

  // 인프라 오류는 사용자 잘못이 아니다 — 오류를 보여주고 가입을 막는 대신
  // degraded 로 통과시킨다. 워크스페이스는 어차피 pending 이라 관리자 승인이
  // 최종 방어선이고, 장애 사실은 Sentry·심사메일로 운영자에게만 간다.
  //
  // NO_KEY/INVALID_KEY 도 포함하는 이유: 사용자 관점에서 공급사 장애와 구분이
  // 불가능하고, 우리 설정 실수로 가입 퍼널을 막는 것이 최악이기 때문. 이 둘은
  // lookupBizNoAction 이 매 요청 Sentry 로 보고하므로 운영자는 즉시 인지한다.
  it.each(['NTS_NO_KEY', 'NTS_INVALID_KEY', 'NTS_NETWORK', 'NTS_UPSTREAM_DOWN', 'NTS_RATE_LIMIT'])(
    'maps %s to a degraded (error-free) response',
    async (error) => {
      lookupBizNoAction.mockResolvedValue({ ok: false, error });
      await expect(ntsLookup('123-45-67890')).resolves.toEqual({
        valid: false,
        degraded: true,
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

// 저하 모드가 성립하는 근거는 "워크스페이스가 pending 이라 관리자 승인이 최종
// 방어선"이라는 것이다. 설정의 사업자번호 *변경*은 이미 승인을 통과한 워크스페이스에서
// 일어나므로 그 방어선이 없다 — 여기서 미검증 통과를 허용하면 승인 게이트를 우회해
// 임의의 사업자번호로 바꿔치기할 수 있다.
describe('ntsLookupStrict (설정 화면 — 저하 불허)', () => {
  beforeEach(() => {
    lookupBizNoAction.mockReset();
  });

  it.each(['NTS_NO_KEY', 'NTS_INVALID_KEY', 'NTS_NETWORK', 'NTS_UPSTREAM_DOWN'])(
    'maps %s to the generic lookup-error message instead of degrading',
    async (error) => {
      lookupBizNoAction.mockResolvedValue({ ok: false, error });
      await expect(ntsLookupStrict('123-45-67890')).resolves.toEqual({
        valid: false,
        error: '사업자번호 조회 중 오류가 발생했어요. 잠시 후 다시 시도해주세요.',
      });
    },
  );

  it('정상 조회는 ntsLookup 과 동일하게 통과시킨다', async () => {
    lookupBizNoAction.mockResolvedValue({
      ok: true,
      valid: true,
      taxType: 'general',
      status: 'active',
    });
    await expect(ntsLookupStrict('123-45-67890')).resolves.toEqual({
      valid: true,
      taxType: 'general',
      status: 'active',
    });
  });

  it('레이트리밋 문구는 그대로 유지한다', async () => {
    lookupBizNoAction.mockResolvedValue({ ok: false, error: 'NTS_LOCAL_THROTTLED' });
    await expect(ntsLookupStrict('123-45-67890')).resolves.toEqual({
      valid: false,
      error: '요청이 너무 많아요. 잠시 후 다시 시도해주세요.',
    });
  });
});
