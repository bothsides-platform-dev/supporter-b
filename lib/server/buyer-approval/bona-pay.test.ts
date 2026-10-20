import { afterEach, expect, it, vi } from 'vitest';
import { lookupBonaPayGrade } from './bona-pay';

const data = { RESULT_CODE: '0000', BIZ_REG_NO: '1248100998', IS_DEFAULT_LEVEL: 'N', CORP_LEVEL: '영세', FROMDT: '20260701' };
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

it.each([
  [{}, 'sole_confirmed', '2026-07-01'],
  [{ IS_DEFAULT_LEVEL: 'Y', FROMDT: '', CORP_LEVEL: '일반' }, 'no_information', null],
  [{ CORP_LEVEL: '중소1' }, 'non_sole', '2026-07-01'],
  [{ CORP_LEVEL: '일반' }, 'non_sole', '2026-07-01'],
  [{ CORP_LEVEL: '다른 등급' }, 'lookup_failed', null],
  [{ CORP_LEVEL: ['일반'] }, 'lookup_failed', null],
  [{ BIZ_REG_NO: '1111111111' }, 'lookup_failed', null],
  [{ FROMDT: '2026-0701' }, 'lookup_failed', null],
  [{ FROMDT: '2026-02-29' }, 'lookup_failed', null],
])('classifies provider responses without treating defaults as confirmed (%j)', async (patch, outcome, effectiveDate) => {
  vi.stubGlobal('fetch', vi.fn(async () => Response.json({ ...data, ...patch })));
  expect(await lookupBonaPayGrade('1248100998')).toMatchObject({ outcome, effectiveDate });
});

it.each([
  new Response('rate limited', { status: 429 }),
  new Response('<html>proxy error</html>'),
  Response.json(null),
  Response.json([]),
])('treats HTTP/JSON failures as lookup failure', async (response) => {
  const fetcher = vi.fn(async () => response);
  vi.stubGlobal('fetch', fetcher);
  expect((await lookupBonaPayGrade('1248100998')).outcome).toBe('lookup_failed');
  expect(fetcher).toHaveBeenCalledOnce();
});

it.each(['headers', 'body'])('aborts stalled %s after 3 seconds without retry', async (stage) => {
  vi.useFakeTimers();
  const fetcher = vi.fn((_url: string, init: RequestInit) => {
    const stalled = () => new Promise<never>((_resolve, reject) => {
      init.signal!.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
    });
    return stage === 'headers' ? stalled() : Promise.resolve({ ok: true, json: stalled });
  });
  vi.stubGlobal('fetch', fetcher);
  const result = lookupBonaPayGrade('1248100998');
  await vi.advanceTimersByTimeAsync(3000);
  expect((await result).outcome).toBe('lookup_failed');
  expect(fetcher).toHaveBeenCalledOnce();
  expect(fetcher.mock.calls[0][1].signal?.aborted).toBe(true);
});
