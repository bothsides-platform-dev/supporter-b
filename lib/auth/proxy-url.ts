/**
 * proxy.ts 의 redirect/rewrite 절대 URL 구성 — **실제 Host 헤더 우선**.
 *
 * next-auth 의 `auth()` 래퍼는 `AUTH_URL` 이 설정돼 있으면 `req.url` 의 origin 을
 * AUTH_URL origin 으로 통째로 치환한다(reqWithEnvURL). 그 `req.url` 을 베이스로
 * URL 을 만들면 partner 호스트 요청이 buyer origin 으로 새어 나가(cross-origin
 * rewrite/redirect), 호스트 이탈·외부 프록시 홉이 생긴다. 항상 요청의 Host 헤더로
 * origin 을 복원하고, Host 가 없을 때만 req.url 로 폴백한다.
 */
export function proxyDecisionUrl(
  to: string,
  host: string | null,
  protocol: string,
  reqUrl: string,
): URL {
  return new URL(to, host ? `${protocol}//${host}` : reqUrl);
}
