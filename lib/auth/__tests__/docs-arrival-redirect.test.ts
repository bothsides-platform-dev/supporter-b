import { expect, it } from 'vitest';
import { decideRoute } from '../route-decision';
import { docsRequestHeaders } from '@/lib/attribution/docs-redirect';
const search = '?sb_via=docs&sb_docs_path=%2Fglossary%2Fpg&sb_docs_placement=header_cta&sb_docs_source=naver&sb_docs_medium=paid&utm_source=naver&utm_medium=paid&email=private';
it('an authenticated docs visitor keeps the assist and UTM through the signup redirect', () => {
  const decision = decideRoute('/signup/buyer', search, true);
  expect(decision.kind).toBe('redirect');
  if (decision.kind !== 'redirect') return;
  const target = new URL(decision.to, 'https://support-b.com');
  expect(target.pathname).toBe('/home');
  expect(target.searchParams.get('sb_via')).toBe('docs');
  expect(target.searchParams.get('sb_docs_path')).toBe('/glossary/pg');
  expect(target.searchParams.get('utm_source')).toBe('naver');
  expect(target.searchParams.has('email')).toBe(false);
});
it('captures on the login screen without replaying docs parameters in the post-login destination', () => {
  const decision = decideRoute('/rfp-create', search, false);
  if (decision.kind !== 'redirect') throw Error('expected redirect');
  const target = new URL(decision.to, 'https://support-b.com');
  expect(target.searchParams.get('sb_via')).toBe('docs');
  expect(target.searchParams.get('next')).not.toContain('sb_via');
  expect(target.searchParams.get('next')).toContain('utm_source=naver');
});
it('rebuilds the internal redirect header from the URL and excludes arbitrary query values', () => {
  const incoming = new Headers({ 'x-sb-docs-query': 'forged', host: 'support-b.com' });
  expect(docsRequestHeaders(incoming, '').has('x-sb-docs-query')).toBe(false);
  const headers = docsRequestHeaders(incoming, search);
  expect(headers.get('x-sb-docs-query')).toContain('sb_docs_source=naver');
  expect(headers.get('x-sb-docs-query')).not.toContain('private');
  expect(headers.get('host')).toBe('support-b.com');
});
