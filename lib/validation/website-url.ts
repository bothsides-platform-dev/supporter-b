/**
 * 사업 운영 홈페이지(websiteUrl) 프론트 유효성 검사.
 *
 * 규칙:
 *  - 빈 값/공백 → 허용 (선택 필드)
 *  - http(s):// 스킴 필수
 *  - userinfo(user:pass@) 거부 — `https://trusted.com@evil.com` 처럼 표시 host와
 *    실제 host가 달라지는 피싱 패턴을 막는다 (홈페이지는 오픈 게시판에 링크로 노출됨)
 *  - 호스트네임이 점(.)+TLD 형태여야 도메인으로 인정 (localhost 등 단일 라벨 거부)
 */
export function isValidWebsiteUrl(value: string): boolean {
  const v = value.trim();
  if (v === '') return true; // optional — 빈 값 허용
  if (!/^https?:\/\//i.test(v)) return false; // http(s):// 필수

  let url: URL;
  try {
    url = new URL(v);
  } catch {
    return false;
  }

  // userinfo가 있으면 거부 — new URL()이 `a.com@evil.com`의 host를 evil.com으로
  // 파싱하므로, 표시 문자열과 실제 목적지가 어긋나는 링크가 만들어진다.
  if (url.username !== '' || url.password !== '') return false;

  // 호스트네임이 점+TLD 형태여야 도메인으로 인정
  return /^[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(url.hostname);
}

/** zod .refine() 에서 사용할 메시지 */
export const WEBSITE_URL_ERROR =
  '홈페이지 주소는 http:// 또는 https:// 로 시작하는 도메인이어야 해요';
