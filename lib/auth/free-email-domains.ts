// 개인(무료) 이메일 도메인 목록 — 회원가입 시 회사 이메일 권장 안내에 사용.
// 판별 실패(형식 미완성 등)는 false — 경고는 확실할 때만 띄운다(fail-open 힌트).
const FREE_EMAIL_DOMAINS = new Set([
  'gmail.com',
  'googlemail.com',
  'naver.com',
  'hanmail.net',
  'daum.net',
  'kakao.com',
  'nate.com',
  'outlook.com',
  'hotmail.com',
  'live.com',
  'msn.com',
  'yahoo.com',
  'yahoo.co.kr',
  'ymail.com',
  'icloud.com',
  'me.com',
  'mac.com',
  'protonmail.com',
  'proton.me',
  'aol.com',
  'gmx.com',
]);

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isFreeEmailDomain(email: string): boolean {
  const normalized = email.trim().toLowerCase();
  if (!EMAIL_PATTERN.test(normalized)) return false;
  const domain = normalized.slice(normalized.lastIndexOf('@') + 1);
  return FREE_EMAIL_DOMAINS.has(domain);
}
