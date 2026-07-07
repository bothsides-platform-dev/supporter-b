import { describe, expect, it } from 'vitest';

import { proxyDecisionUrl } from '../proxy-url';

// next-auth 의 auth() 래퍼(reqWithEnvURL)는 AUTH_URL 이 설정돼 있으면 req.url 의
// origin 을 AUTH_URL origin 으로 통째로 치환한다. 그래서 redirect/rewrite 절대 URL 을
// req.url 기준으로 만들면 요청이 들어온 실제 호스트(partner 등)를 잃는다.
// 이 헬퍼는 실제 Host 헤더를 우선해 same-origin URL 을 복원한다.
describe('proxyDecisionUrl', () => {
  it('AUTH_URL 로 오염된 req.url 대신 실제 Host 헤더 기준으로 URL 을 만든다', () => {
    const url = proxyDecisionUrl(
      '/pg-landing',
      'partner.support-b.com',
      'https:',
      'https://supporter-b.com/', // reqWithEnvURL 이 치환해 둔 req.url
    );
    expect(url.toString()).toBe('https://partner.support-b.com/pg-landing');
  });

  it('redirect 대상의 쿼리스트링을 보존한다', () => {
    const url = proxyDecisionUrl(
      '/login?next=%2Finbox',
      'partner.support-b.com',
      'https:',
      'https://supporter-b.com/inbox',
    );
    expect(url.toString()).toBe(
      'https://partner.support-b.com/login?next=%2Finbox',
    );
  });

  it('Host 헤더가 없으면 req.url 로 폴백한다', () => {
    const url = proxyDecisionUrl('/home', null, 'https:', 'https://support-b.com/login');
    expect(url.toString()).toBe('https://support-b.com/home');
  });

  it('로컬 dev(http, 포트 포함 host)도 그대로 동작한다', () => {
    const url = proxyDecisionUrl(
      '/login?next=%2Frfp',
      'localhost:3000',
      'http:',
      'http://localhost:3000/rfp',
    );
    expect(url.toString()).toBe('http://localhost:3000/login?next=%2Frfp');
  });
});
