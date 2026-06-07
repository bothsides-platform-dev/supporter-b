import { parse } from 'tldts';

/**
 * 사업 운영 홈페이지(websiteUrl) 프론트 유효성 검사.
 *
 * 규칙:
 *  - 빈 값/공백 → 허용 (선택 필드)
 *  - 스킴 선택 — http(s):// 없이 도메인만 입력해도 허용 (저장 시 https:// 자동 추가)
 *  - http(s) 외 스킴(ftp:// 등) → 거부
 *  - userinfo(user:pass@) 거부 — 피싱 표시-목적지 불일치 방지
 *  - tldts Public Suffix List로 실제 TLD 존재 여부 검증 (garbage 문자열·무효 TLD 거부)
 */
export function isValidWebsiteUrl(value: string): boolean {
  const v = value.trim();
  if (v === '') return true;

  // http(s) 외 명시적 스킴은 거부
  if (/^[a-z][a-z0-9+\-.]*:\/\//i.test(v) && !/^https?:\/\//i.test(v)) return false;

  // URL 파싱을 위해 스킴이 없으면 임시로 https:// 추가
  const withScheme = /^https?:\/\//i.test(v) ? v : `https://${v}`;
  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    return false;
  }

  // userinfo가 있으면 거부 — 피싱 패턴 차단
  if (url.username !== '' || url.password !== '') return false;

  // tldts의 isIcann + domain 유무로 검증
  // isIcann: ICANN 등록 TLD, domain !== null: 단순 TLD 라벨 단독 입력 거부 (e.g. "abc" gTLD)
  const parsed = parse(url.hostname);
  return parsed.isIcann === true && parsed.domain !== null;
}

/** 스킴이 없으면 https://를 붙여 반환. 저장 직전에 호출한다. */
export function normalizeWebsiteUrl(value: string): string {
  if (!value.trim()) return value;
  if (/^https?:\/\//i.test(value)) return value;
  return `https://${value}`;
}

/** zod .refine() 에서 사용할 메시지 */
export const WEBSITE_URL_ERROR =
  '올바른 도메인 주소를 입력해 주세요 (예: example.com)';
