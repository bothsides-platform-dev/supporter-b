import { afterEach, expect, it, vi } from 'vitest';
import { collectPublicWebsite } from '../website';
afterEach(() => vi.useRealTimers());
it.each(['127.0.0.1', '10.0.0.1', '169.254.169.254', '100.64.0.1', '192.0.2.1', '198.51.100.1', '203.0.113.1', '::ffff:7f00:1', '::1', 'fe80::1', '2001:db8::1'])
  ('DNS의 사설·예약 주소 %s로 연결하지 않는다', async address => {
    const request = vi.fn();
    expect(await collectPublicWebsite('https://shop.example', {
      resolve: async () => [{ address, family: address.includes(':') ? 6 : 4 }], request,
    })).toEqual([]);
    expect(request).not.toHaveBeenCalled();
  });
it('리다이렉트를 재검사하고 최대 세 공개 페이지만 수집한다', async () => {
  const request = vi.fn(async (url: string | URL, _init?: RequestInit) => new Response(
    String(url).endsWith('/bad') ? '' : '<p>상품</p><a href="/one">1</a><a href="/two">2</a><a href="/three">3</a><a href="https://other.example/x">외부</a>',
    { headers: { 'content-type': 'text/html' } }));
  const pages = await collectPublicWebsite('https://shop.example', { resolve: async () => [{ address: '93.184.216.34', family: 4 }], request });
  expect(pages.map(p => p.url)).toEqual(['https://shop.example/', 'https://shop.example/one', 'https://shop.example/two']);
  expect(request.mock.calls.every(([, init]) => !!(init as { dispatcher?: unknown })?.dispatcher)).toBe(true);
  const redirect = vi.fn(async () => new Response(null, { status: 302, headers: { location: 'http://127.0.0.1/admin' } }));
  expect(await collectPublicWebsite('https://shop.example', { resolve: async () => [{ address: '93.184.216.34', family: 4 }], request: redirect })).toEqual([]);
  expect(redirect).toHaveBeenCalledTimes(1);
});
it('전체 6초 예산에 DNS 대기도 포함한다', async () => {
  vi.useFakeTimers();
  const pending = collectPublicWebsite('https://shop.example', { resolve: () => new Promise(() => {}), request: vi.fn() });
  await vi.advanceTimersByTimeAsync(6000);
  expect(await pending).toEqual([]);
});
it('본문 제한을 넘거나 HTML이 아니면 분석하지 않는다', async () => {
  const resolve = async () => [{ address: '93.184.216.34', family: 4 }];
  for (const response of [new Response('x'.repeat(262145), { headers: { 'content-type': 'text/html' } }), new Response('x', { headers: { 'content-type': 'application/pdf' } })]) {
    expect(await collectPublicWebsite('https://shop.example', { resolve, request: async () => response })).toEqual([]);
  }
});
