import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  NtsError,
  __setNtsClientForTest,
  type NtsLookupResult,
} from '@/lib/integrations/nts';
import { resolveBizProfileForWrite } from '../_resolveBizProfile';

function stubLookup(impl: () => Promise<NtsLookupResult>) {
  const lookup = vi.fn(impl);
  __setNtsClientForTest({ lookup });
  return lookup;
}

describe('resolveBizProfileForWrite', () => {
  beforeEach(() => {
    __setNtsClientForTest(undefined);
  });

  afterEach(() => {
    __setNtsClientForTest(undefined);
  });

  it('정상 조회는 서버가 조회한 값으로 검증된 프로필을 만든다', async () => {
    stubLookup(async () => ({ valid: true, taxType: 'simple', status: 'active' }));

    await expect(
      resolveBizProfileForWrite({ bizNo: '1234567890' }),
    ).resolves.toEqual({
      ok: true,
      verified: true,
      bizProfile: {
        bizNo: '1234567890',
        taxType: 'simple',
        status: 'active',
        grade: undefined,
        gradeSource: 'unset',
      },
    });
  });

  // ── 검증 우회 차단 ──────────────────────────────────────────────────────
  // 클라이언트가 보낸 taxType/status 는 **어떤 경우에도 쓰이지 않는다**. 예전에는
  // 그대로 신뢰했기 때문에, 저하 모드를 도입하면서 필드를 생략하는 것만으로
  // 검증을 끌 수 있는 구멍이 생길 뻔했다. 서버가 항상 직접 조회한다.
  it('클라이언트가 보낸 taxType/status 를 신뢰하지 않고 서버 조회로 덮어쓴다', async () => {
    const lookup = stubLookup(async () => ({
      valid: true,
      taxType: 'exempt',
      status: 'active',
    }));

    const r = await resolveBizProfileForWrite({
      bizNo: '1234567890',
      taxType: 'general',
      status: 'active',
    });

    expect(lookup).toHaveBeenCalledWith('1234567890');
    expect(r).toMatchObject({ ok: true, bizProfile: { taxType: 'exempt' } });
  });

  it('상위가 정상인데 폐업이면 taxType 을 생략해 보내도 거부한다', async () => {
    stubLookup(async () => ({ valid: true, taxType: 'general', status: 'closed' }));

    await expect(resolveBizProfileForWrite({ bizNo: '1234567890' })).resolves.toEqual({
      ok: false,
      error: 'BIZ_STATUS_NOT_ACTIVE',
    });
  });

  it('미등록 번호는 거부한다', async () => {
    stubLookup(async () => ({ valid: false }));

    await expect(resolveBizProfileForWrite({ bizNo: '0000000000' })).resolves.toEqual({
      ok: false,
      error: 'BIZ_NOT_FOUND',
    });
  });

  it('taxType 이 매핑되지 않는 사업자 유형은 거부한다', async () => {
    stubLookup(async () => ({ valid: true, status: 'active' }));

    await expect(resolveBizProfileForWrite({ bizNo: '1234567890' })).resolves.toEqual({
      ok: false,
      error: 'BIZ_UNSUPPORTED_TYPE',
    });
  });

  // ── 저하 경로 ───────────────────────────────────────────────────────────
  it.each(['NTS_UPSTREAM_DOWN', 'NTS_NETWORK', 'NTS_NO_KEY', 'NTS_INVALID_KEY'] as const)(
    '%s 일 때만 미검증(verified:false) 프로필로 통과시킨다',
    async (code) => {
      stubLookup(async () => {
        throw new NtsError(code);
      });

      await expect(
        resolveBizProfileForWrite({ bizNo: '1234567890' }),
      ).resolves.toEqual({
        ok: true,
        verified: false,
        bizProfile: {
          bizNo: '1234567890',
          taxType: undefined,
          status: undefined,
          grade: undefined,
          gradeSource: 'unset',
        },
      });
    },
  );

  // 레이트리밋을 저하로 통과시키면 "버킷을 일부러 고갈시켜 검증을 우회"하는
  // 경로가 열린다 — in-process 버킷은 남용 방어선이므로 반드시 실패로 남긴다.
  it('NTS_RATE_LIMIT 은 저하로 통과시키지 않는다', async () => {
    stubLookup(async () => {
      throw new NtsError('NTS_RATE_LIMIT');
    });

    await expect(resolveBizProfileForWrite({ bizNo: '1234567890' })).resolves.toEqual({
      ok: false,
      error: 'BIZ_LOOKUP_RATE_LIMITED',
    });
  });

  it('grade·gradeSource 는 NTS 파생값이 아니므로 입력을 그대로 보존한다', async () => {
    stubLookup(async () => ({ valid: true, taxType: 'general', status: 'active' }));

    await expect(
      resolveBizProfileForWrite({
        bizNo: '1234567890',
        grade: 'sole',
        gradeSource: 'user_confirmed',
      }),
    ).resolves.toMatchObject({
      ok: true,
      bizProfile: { grade: 'sole', gradeSource: 'user_confirmed' },
    });
  });

  it('하이픈이 섞인 사업자번호도 숫자만 남겨 저장한다', async () => {
    stubLookup(async () => ({ valid: true, taxType: 'general', status: 'active' }));

    await expect(
      resolveBizProfileForWrite({ bizNo: '123-45-67890' }),
    ).resolves.toMatchObject({ ok: true, bizProfile: { bizNo: '1234567890' } });
  });
});
