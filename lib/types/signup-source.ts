// 가입 유입 경로(first-touch attribution) 버전드 JSONB 문서.
// lib/types/onboarding.ts 와 동일 철학: 읽기는 관대(어떤 _v 든 정규화), 쓰기는 정규(항상 현재
// 버전 emit). 클라이언트 first-touch 캡처(lib/attribution/first-touch.ts)가 만들어 서버로
// 전달하는 self-reported 데이터이므로, 서버 재검증 시에도 이 함수로 clamp/필터링한다.

export const SIGNUP_SOURCE_VERSION = 1 as const;

// 개별 문자열 필드 길이 상한 — self-reported 데이터 방어.
const MAX_FIELD_LENGTH = 512;

const SIGNUP_SOURCE_STRING_KEYS = [
  'utmSource',
  'utmMedium',
  'utmCampaign',
  'utmTerm',
  'utmContent',
  'referrer',
  'landingPath',
  'capturedAt',
] as const;
type SignupSourceStringKey = (typeof SIGNUP_SOURCE_STRING_KEYS)[number];

// v1 모양. 모든 키 optional → 키 추가는 non-breaking.
export type SignupSourceV1 = {
  _v: 1;
} & Partial<Record<SignupSourceStringKey, string>>;

// 현재 정규형(현재는 v1 단일). 미래: SignupSourceV1 | SignupSourceV2 …
export type SignupSource = SignupSourceV1;

/**
 * 관대한 읽기 + 정규 쓰기. raw 가 어떤 역대 버전/가비지든 현재 정규형으로 올린다.
 * 알려진 키(SIGNUP_SOURCE_STRING_KEYS)만 보존하고, 문자열이 아니거나 상한을 넘는 값은
 * clamp/제거한다.
 */
export function migrateSignupSource(raw: unknown): SignupSource {
  const o = (raw ?? {}) as Record<string, unknown>;
  const out: SignupSource = { _v: SIGNUP_SOURCE_VERSION };
  for (const key of SIGNUP_SOURCE_STRING_KEYS) {
    const v = o[key];
    if (typeof v === 'string' && v.length > 0) {
      out[key] = v.length > MAX_FIELD_LENGTH ? v.slice(0, MAX_FIELD_LENGTH) : v;
    }
  }
  return out;
}
