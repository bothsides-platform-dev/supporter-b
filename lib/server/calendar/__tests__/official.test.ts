import { describe, expect, it, vi } from 'vitest';
import { fetchOfficialYear } from '../official';

const page = (body: string, total = 1, code = '00') =>
  `<response><header><resultCode>${code}</resultCode><resultMsg>NORMAL SERVICE.</resultMsg></header><body><items>${body}</items><numOfRows>100</numOfRows><pageNo>1</pageNo><totalCount>${total}</totalCount></body></response>`;
const item = (date: string) => `<item><dateKind>01</dateKind><dateName>임시공휴일</dateName><isHoliday>Y</isHoliday><locdate>${date}</locdate><seq>1</seq></item>`;

describe('KASI holiday API', () => {
  it('collects only official rest days and verifies all twelve months', async () => {
    const seen: string[] = [];
    const fetcher = async (url: string) => {
      seen.push(url);
      const month = new URL(url).searchParams.get('solMonth');
      return new Response(page(month === '05' ? item('20260505') : '', month === '05' ? 1 : 0));
    };
    const days = await fetchOfficialYear(2026, 'secret', fetcher);
    expect(days).toEqual([{ date: '2026-05-05', name: '임시공휴일' }]);
    expect(seen).toHaveLength(12);
    expect(seen[0]).toContain('getRestDeInfo');
  });

  it('rejects failed result codes and incomplete pagination', async () => {
    await expect(fetchOfficialYear(2026, 'secret', async () => new Response(page('', 0, '03')))).rejects.toThrow('HOLIDAY_API_INVALID');
    await expect(fetchOfficialYear(2026, 'secret', async () => new Response(page('', 101)))).rejects.toThrow('HOLIDAY_API_INVALID');
  });

  it('rejects a whole year with no holiday entries', async () => {
    await expect(fetchOfficialYear(2026, 'secret', async () => new Response(page('', 0)))).rejects.toThrow('HOLIDAY_API_INVALID');
  });

  it('accepts an empty month with self-closing items', async () => {
    const days = await fetchOfficialYear(2026, 'secret', async (url) => new Response(
      new URL(url).searchParams.get('solMonth') === '05'
        ? page(item('20260505'), 1)
        : '<response><header><resultCode>00</resultCode><resultMsg>NORMAL SERVICE.</resultMsg></header><body><items/><numOfRows>100</numOfRows><pageNo>1</pageNo><totalCount>0</totalCount></body></response>',
    ));
    expect(days).toEqual([{ date: '2026-05-05', name: '임시공휴일' }]);
  });

  it('sanitizes response read errors and caps oversized responses', async () => {
    await expect(fetchOfficialYear(2026, 'secret', async () => new Response('x'.repeat(200_001))))
      .rejects.toThrow('HOLIDAY_API_INVALID');
    await expect(fetchOfficialYear(2026, 'secret', async () => new Response(new ReadableStream({
      start(controller) { controller.error(new Error('secret=abc')); },
    })))).rejects.toThrow('HOLIDAY_API_UNAVAILABLE');
  });

  it('times out a stalled request without exposing the key', async () => {
    await expect(fetchOfficialYear(2026, 'secret', async () => new Promise(() => {}), 5))
      .rejects.toThrow('HOLIDAY_API_UNAVAILABLE');
  });

  it('rejects missing metadata, surplus items, duplicate items and invalid dates', async () => {
    const bad = [
      '<response><header><resultCode>00</resultCode><resultMsg>NORMAL SERVICE.</resultMsg></header><body><items></items><numOfRows>100</numOfRows><pageNo>1</pageNo></body></response>',
      page(item('20260505') + item('20260506'), 1),
      page(item('20260505') + item('20260505'), 2),
      page(item('20260231'), 1),
    ];
    for (const xml of bad) {
      await expect(fetchOfficialYear(2026, 'secret', async (url) => new Response(
        new URL(url).searchParams.get('solMonth') === (xml.includes('20260231') ? '02' : '05')
          ? xml
          : new URL(url).searchParams.get('solMonth') === '05' ? page(item('20260505'), 1) : page('', 0),
      ))).rejects.toThrow('HOLIDAY_API_INVALID');
    }
  });

  it('rejects malformed success envelopes instead of replacing last-good holidays', async () => {
    const malformed = [
      page(item('20260505')).replace('<resultMsg>NORMAL SERVICE.</resultMsg>', ''),
      page(item('20260505')).replace('<dateKind>01</dateKind>', ''),
      page(item('20260505')).replace('</item>', '</item><unexpected/>'),
    ];
    for (const xml of malformed) {
      await expect(fetchOfficialYear(2026, 'secret', async (url) => new Response(
        new URL(url).searchParams.get('solMonth') === '05' ? xml : page('', 0),
      ))).rejects.toThrow('HOLIDAY_API_INVALID');
    }
  });

  it('caps the whole year collection even when individual pages succeed', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    let calls = 0;
    try {
      await expect(fetchOfficialYear(2026, 'secret', async (url) => {
        calls++;
        vi.setSystemTime(new Date(Date.now() + 61_000));
        const month = new URL(url).searchParams.get('solMonth');
        return new Response(page(month === '05' ? item('20260505') : '', month === '05' ? 1 : 0));
      }, 10_000, 120_000)).rejects.toThrow('HOLIDAY_API_UNAVAILABLE');
      expect(calls).toBe(2);
    } finally {
      vi.useRealTimers();
    }
  });
});
