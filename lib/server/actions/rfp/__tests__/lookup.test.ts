import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  __setNtsClientForTest,
  NtsError,
  type NtsClient,
} from '@/lib/integrations/nts';
import { MockNtsClient } from '@/lib/integrations/nts.mock';
import { setupRfpActionEnv, teardownRfpActionEnv } from './_setup';

const { captureActionError } = vi.hoisted(() => ({ captureActionError: vi.fn() }));
vi.mock('@/lib/observability/capture', () => ({ captureActionError }));

import { lookupBizNoAction } from '../lookupBizNoAction';

describe('lookupBizNoAction', () => {
  beforeEach(async () => {
    await setupRfpActionEnv();
    captureActionError.mockReset();
  });
  afterEach(() => {
    teardownRfpActionEnv();
  });

  it('returns NTS lookup result for a known bizNo', async () => {
    const r = await lookupBizNoAction('1234567890');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.valid).toBe(true);
    expect(r.taxType).toBe('general');
    expect(r.status).toBe('active');
  });

  it('returns valid:false for an unknown bizNo (mock)', async () => {
    const r = await lookupBizNoAction('0000000000');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.valid).toBe(false);
  });

  it('rejects malformed bizNo input', async () => {
    const r = await lookupBizNoAction('123');
    expect(r.ok).toBe(false);
  });

  it('returns NTS_NO_KEY when client is configured without key', async () => {
    const throwing: NtsClient = {
      lookup: () => Promise.reject(new NtsError('NTS_NO_KEY')),
    };
    __setNtsClientForTest(throwing);
    const r = await lookupBizNoAction('1234567890');
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toBe('NTS_NO_KEY');
    // 키 미설정은 운영 장애 — Sentry로 관측되어야 한다.
    expect(captureActionError).toHaveBeenCalledWith(
      'lookupBizNoAction',
      expect.objectContaining({ code: 'NTS_NO_KEY' }),
    );
  });

  it('returns NTS_INVALID_KEY when upstream rejects auth', async () => {
    const throwing: NtsClient = {
      lookup: () => Promise.reject(new NtsError('NTS_INVALID_KEY')),
    };
    __setNtsClientForTest(throwing);
    const r = await lookupBizNoAction('1234567890');
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toBe('NTS_INVALID_KEY');
    // 키 만료/오설정도 운영 장애 — Sentry로 관측되어야 한다.
    expect(captureActionError).toHaveBeenCalledWith(
      'lookupBizNoAction',
      expect.objectContaining({ code: 'NTS_INVALID_KEY' }),
    );
  });

  it('returns NTS_UPSTREAM_DOWN on supplier outage', async () => {
    __setNtsClientForTest({
      lookup: () => Promise.reject(new NtsError('NTS_UPSTREAM_DOWN', 'HTTP 503')),
    });
    const r = await lookupBizNoAction('1234567890');
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toBe('NTS_UPSTREAM_DOWN');
  });

  // NTS_NETWORK 는 전송 실패가 UPSTREAM_DOWN 으로 옮겨간 뒤 "401/403/429 를 뺀 4xx",
  // 즉 **우리 요청이 계약을 위반했다** 는 뜻만 남았다. 조용히 넘기면 저하 모드가
  // 우리 버그를 영구히 가려 준다 — 반드시 보고 대상이다.
  it('captures NTS_NETWORK (our-bug bucket) — 4xx means our request is wrong', async () => {
    const err = new NtsError('NTS_NETWORK', 'HTTP 400');
    __setNtsClientForTest({ lookup: () => Promise.reject(err) });
    const r = await lookupBizNoAction('1234567890');
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toBe('NTS_NETWORK');
    expect(captureActionError).toHaveBeenCalledWith('lookupBizNoAction', err);
  });

  it('captures unexpected (non-NtsError) failures and returns NTS_NETWORK', async () => {
    const boom = new Error('unexpected parse failure');
    __setNtsClientForTest({ lookup: () => Promise.reject(boom) });
    const r = await lookupBizNoAction('1234567890');
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toBe('NTS_NETWORK');
    expect(captureActionError).toHaveBeenCalledWith('lookupBizNoAction', boom);
  });

  // 상위 장애를 요청마다 보고하면 free plan 5k/mo 를 태운다 — 그건 회로 차단기가
  // 전이 시 1회만 보고하는 것으로 대신한다. 이 가드가 없으면 누군가 나중에
  // UPSTREAM_DOWN 을 캡처 목록에 넣어도 아무도 모른다(며칠짜리 장애 = 예산 소진).
  it.each(['NTS_UPSTREAM_DOWN', 'NTS_RATE_LIMIT', 'NTS_LOCAL_THROTTLED'] as const)(
    'does not capture transient %s failures',
    async (code) => {
      __setNtsClientForTest({
        lookup: () => Promise.reject(new NtsError(code)),
      });
      const r = await lookupBizNoAction('1234567890');
      expect(r.ok).toBe(false);
      expect(captureActionError).not.toHaveBeenCalled();
    },
  );

  it('reuses MockNtsClient default after test override', async () => {
    __setNtsClientForTest(new MockNtsClient());
    const r = await lookupBizNoAction('3456789012');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.taxType).toBe('simple');
  });
});
