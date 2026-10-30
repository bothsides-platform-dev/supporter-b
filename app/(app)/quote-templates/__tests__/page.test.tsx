// @vitest-environment node
import { expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  notFound: () => { throw new Error('NEXT_HTTP_ERROR_FALLBACK;404'); },
  redirect: () => { throw new Error('REDIRECT'); },
}));
vi.mock('@/auth', () => ({ auth: async () => null }));

import QuoteTemplatesPage from '../page';

it('기존 견적 템플릿 주소는 로그인 조회 대신 404로 닫는다', async () => {
  await expect(async () => QuoteTemplatesPage()).rejects.toThrow('NEXT_HTTP_ERROR_FALLBACK;404');
});
