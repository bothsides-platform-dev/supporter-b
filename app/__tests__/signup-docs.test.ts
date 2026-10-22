import { expect, it, vi } from 'vitest';
const redirect = vi.hoisted(() => vi.fn((to: string) => { throw Error(to); }));
vi.mock('next/headers', () => ({ headers: async () => new Headers({ host: 'support-b.com' }) }));
vi.mock('next/navigation', () => ({ redirect }));
import SignupPage from '../(public)/signup/page';
it('the role redirect preserves docs metadata, UTMs and the validated next destination', async () => {
  await expect(SignupPage({ searchParams: Promise.resolve({ sb_via: 'docs', sb_docs_path: '/glossary/pg', sb_docs_placement: 'article_body', utm_source: 'naver', next: '/quote-start', email: 'private' }) })).rejects.toThrow();
  const target = new URL(redirect.mock.calls.at(-1)![0], 'https://support-b.com');
  expect(target.pathname).toBe('/signup/buyer');
  expect(target.searchParams.get('sb_docs_path')).toBe('/glossary/pg');
  expect(target.searchParams.get('utm_source')).toBe('naver');
  expect(target.searchParams.get('next')).toBe('/quote-start');
  expect(target.searchParams.has('email')).toBe(false);
});
