import { afterEach, expect, it, vi } from 'vitest';
import { checkEmailVerificationStatus } from '../email-verification-status-client';
afterEach(() => vi.unstubAllGlobals());
it('상태 확인은 쿠키를 갱신하는 페이지 액션 대신 캐시 없는 API를 사용한다', async () => {
  const fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ verified: true, next: '/rfp-create?resume=guest' }) });
  vi.stubGlobal('fetch', fetcher);
  expect(await checkEmailVerificationStatus('me@example.com')).toEqual({ verified: true, next: '/rfp-create?resume=guest' });
  expect(fetcher).toHaveBeenCalledWith('/api/auth/email-verification', {
    method: 'POST', cache: 'no-store', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'me@example.com' }),
  });
});
