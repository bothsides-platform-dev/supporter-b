import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { resolveBuyerBusiness } from './resolve';
const resolveBuyerAutoApproval = async (input: Parameters<typeof resolveBuyerBusiness>[0]) => (await resolveBuyerBusiness(input)).approval;

vi.unmock('@/lib/server/buyer-approval/new-business');
const bizNo = '2972202211';
const input = { type: 'buyer' as const, bizVerified: true, bizProfile: { bizNo, status: 'active' } };
const detail = { api: { success: true }, data: { success: 1, 사업자등록번호: bizNo, 상세정보확보: 'Y', 대표명: '테스트', 설립일: '2026-09-06' } };
const verified = { status_code: 'OK', data: [{ b_no: bizNo, valid: '01', request_param: { b_no: bizNo, start_dt: '20260906', p_nm: '테스트' }, status: { b_no: bizNo, b_stt_cd: '01' } }] };
let fetcher: ReturnType<typeof vi.fn>;
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] }); vi.setSystemTime(new Date('2026-10-25T00:00:00Z'));
  vi.stubEnv('APICK_API_KEY', 'test-apick'); vi.stubEnv('NTS_SERVICE_KEY', 'test-nts');
  fetcher = vi.fn(async (url: string, init: RequestInit) => {
    if (url.includes('apick')) return Response.json(detail);
    const requested = JSON.parse(init.body as string).businesses[0];
    return Response.json({ ...verified, data: [{ ...verified.data[0], request_param: requested }] });
  });
  vi.stubGlobal('fetch', fetcher);
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.useRealTimers(); });

it('approves a recent opening only after APICK lookup and NTS validation, retaining distinct evidence', async () => {
  expect(await resolveBuyerAutoApproval(input)).toEqual({ provider: 'apick', bizNo, checkedAt: '2026-10-25T00:00:00.000Z', outcome: 'new_business_confirmed', openingDate: '2026-09-06', verifiedBy: 'nts_validate' });
  const [, apick] = fetcher.mock.calls[0];
  expect(apick.headers).toMatchObject({ Authorization: 'Bearer test-apick' });
  expect((apick.body as FormData).get('biz_no')).toBe(bizNo);
  const [url, nts] = fetcher.mock.calls[1];
  expect(url).toBe('https://api.odcloud.kr/api/nts-businessman/v1/validate');
  expect(JSON.parse(nts.body as string)).toEqual({ businesses: [{ b_no: bizNo, start_dt: '20260906', p_nm: '테스트' }] });
});

it.each([
  ['2026-04-25', false], ['2026-04-26', true], ['2026-10-25', true], ['2026-10-26', false],
  ['2026-02-30', false], ['', false], ['20260426', true],
])('uses calendar months, valid dates and the Korean current date: %s', async (date, approved) => {
  fetcher.mockImplementationOnce(async () => Response.json({ ...detail, data: { ...detail.data, 설립일: date } }));
  expect(Boolean(await resolveBuyerAutoApproval(input))).toBe(approved);
});

it.each([
  { success: 0 }, { 상세정보확보: 'N' }, { 정보제한여부: 'Y' }, { 대표명: '' },
  { 사업자등록번호: '0000000000' }, { 설립일: null },
])('does not approve incomplete or mismatched APICK records %j', async patch => {
  fetcher.mockImplementationOnce(async () => Response.json({ ...detail, data: { ...detail.data, ...patch } }));
  expect(await resolveBuyerAutoApproval(input)).toBeUndefined();
  expect(fetcher).toHaveBeenCalledTimes(1);
});

it.each([
  { valid: '02' }, { b_no: '0000000000' }, { status: { b_no: bizNo, b_stt_cd: '02' } },
  { request_param: { b_no: bizNo, start_dt: '20200101', p_nm: '테스트' } },
])('requires matching NTS validation and active status %j', async patch => {
  fetcher.mockImplementationOnce(async () => Response.json(detail))
    .mockImplementationOnce(async () => Response.json({ ...verified, data: [{ ...verified.data[0], ...patch }] }));
  expect(await resolveBuyerAutoApproval(input)).toBeUndefined();
});

it.each(['APICK_API_KEY', 'NTS_SERVICE_KEY'])('keeps manual review without %s', async key => {
  vi.stubEnv(key, '');
  expect(await resolveBuyerAutoApproval(input)).toBeUndefined();
  expect(fetcher).toHaveBeenCalledTimes(key === 'APICK_API_KEY' ? 0 : 1);
});

it('never contacts BonaPay, including when its response would confirm sole', async () => {
  await resolveBuyerAutoApproval(input);
  expect(fetcher.mock.calls.map(([url]) => url)).toEqual(['https://apick.app/rest/biz_detail', 'https://api.odcloud.kr/api/nts-businessman/v1/validate']);
});

it.each(['apick', 'nts'])('bounds a stalled %s body and fails closed without retry', async stage => {
  fetcher.mockImplementation(async (url: string, init: RequestInit) => {
    if (stage === 'nts' && url.includes('apick')) return Response.json(detail);
    return { ok: true, json: () => new Promise((_, reject) => init.signal!.addEventListener('abort', () => reject(new Error('aborted')))) };
  });
  const result = resolveBuyerAutoApproval(input);
  await vi.advanceTimersByTimeAsync(5000);
  expect(await result).toBeUndefined();
  expect(fetcher).toHaveBeenCalledTimes(stage === 'apick' ? 1 : 2);
});

it.each([
  ['2026-08-31', '2027-02-27T15:00:00Z', false],
  ['2026-08-31', '2027-02-27T14:59:59Z', true],
])('clamps the six-month anniversary at month end in KST', async (opening, now, expected) => {
  vi.setSystemTime(new Date(now));
  fetcher.mockImplementationOnce(async () => Response.json({ ...detail, data: { ...detail.data, 설립일: opening } }));
  expect(Boolean(await resolveBuyerAutoApproval(input))).toBe(expected);
});
