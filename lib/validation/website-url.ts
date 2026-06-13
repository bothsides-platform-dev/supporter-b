import { parse } from 'tldts';

/**
 * 사업 운영 홈페이지(websiteUrl) 서버/액션 유효성 검사.
 * tldts PSL로 실제 ICANN TLD 존재 여부까지 확인한다.
 * 클라이언트 컴포넌트에서는 isValidWebsiteUrlLight를 사용해 tldts를 클라이언트 번들에서 제외한다.
 *
 * 규칙:
 *  - 빈 값/공백 → 허용 (선택 필드)
 *  - 스킴 선택 — http(s):// 없이 도메인만 입력해도 허용 (저장 시 https:// 자동 추가)
 *  - http(s) 외 스킴(ftp:// 등) → 거부
 *  - 프로토콜 상대 URL(//) → 거부
 *  - userinfo(user:pass@) 거부 — 피싱 표시-목적지 불일치 방지
 *  - tldts Public Suffix List로 실제 TLD 존재 여부 검증 (garbage 문자열·무효 TLD 거부)
 */
export function isValidWebsiteUrl(value: string): boolean {
  const v = value.trim();
  if (v === '') return true;
  if (v.startsWith('//')) return false;
  if (/^[a-z][a-z0-9+\-.]*:\/\//i.test(v) && !/^https?:\/\//i.test(v)) return false;

  const withScheme = /^https?:\/\//i.test(v) ? v : `https://${v}`;
  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    return false;
  }

  if (url.username !== '' || url.password !== '') return false;

  const parsed = parse(url.hostname);
  return parsed.isIcann === true && parsed.domain !== null;
}

/**
 * 클라이언트 컴포넌트용 경량 검사 — tldts 없이 구조적 유효성만 확인.
 * onChange/render 피드백 전용. 서버 액션은 isValidWebsiteUrl로 최종 검증한다.
 */
export function isValidWebsiteUrlLight(value: string): boolean {
  const v = value.trim();
  if (v === '') return true;
  if (v.startsWith('//')) return false;
  if (/^[a-z][a-z0-9+\-.]*:\/\//i.test(v) && !/^https?:\/\//i.test(v)) return false;

  const withScheme = /^https?:\/\//i.test(v) ? v : `https://${v}`;
  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    return false;
  }

  if (url.username !== '' || url.password !== '') return false;

  // 경량 체크: 호스트네임에 점이 있고 모든 라벨이 비어 있지 않아야 함
  const { hostname } = url;
  if (!hostname.includes('.')) return false;
  return hostname.split('.').every((label) => label.length > 0);
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
