import { beforeEach, expect, it, vi } from 'vitest';
const check = vi.hoisted(() => vi.fn());
vi.mock('@/lib/server/actions/auth/checkMyEmailVerifiedAction', () => ({ checkMyEmailVerifiedAction: check }));
import { POST } from '../route';
beforeEach(() => check.mockReset());
it('상태만 반환하고 응답에 인증 쿠키나 캐시를 남기지 않는다', async () => {
  check.mockResolvedValue({ verified: true, next: '/rfp-create?resume=guest' });
  const response = await POST(new Request('http://localhost/api/auth/email-verification', { method: 'POST', body: JSON.stringify({ email: 'me@example.com' }) }));
  expect(await response.json()).toEqual({ verified: true, next: '/rfp-create?resume=guest' });
  expect(response.headers.get('set-cookie')).toBeNull();
  expect(response.headers.get('cache-control')).toBe('private, no-store');
  expect(check).toHaveBeenCalledWith('me@example.com');
});
it('잘못된 요청은 인증 조회 전에 거부한다', async () => {
  const response = await POST(new Request('http://localhost/api/auth/email-verification', { method: 'POST', body: JSON.stringify({ email: 123 }) }));
  expect(response.status).toBe(400);
  expect(check).not.toHaveBeenCalled();
});
