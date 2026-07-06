// First-touch 가입 유입 경로 캡처. 사이트 어느 페이지든 최초 진입 시(components/shell/
// FirstTouchCapture.tsx 가 마운트 시점에 호출) UTM 파라미터 + 외부 referrer + 진입 경로를
// 1회(write-once) localStorage 에 저장한다. 이후 가입 완료 시(lib/auth/finalizeSignup.ts)
// readFirstTouch() 로 읽어 signupCompleteAction payload 에 실어 서버로 보낸다.
//
// localStorage(세션 간 유지) 사용 — 홈을 먼저 보고 나중에(다른 탭/재방문) 가입해도
// 최초 유입처가 보존되어야 하므로 sessionStorage(lib/auth/signup-storage.ts, 가입 플로우
// 자체 상태용) 와는 다른 저장소를 쓴다.
import { migrateSignupSource, SIGNUP_SOURCE_VERSION, type SignupSource } from '@/lib/types/signup-source';

const STORAGE_KEY = 'bidit.firstTouch';

type SignupSourceUtmKey = Exclude<keyof SignupSource, '_v'>;

const UTM_PARAM_KEYS: Array<[param: string, key: SignupSourceUtmKey]> = [
  ['utm_source', 'utmSource'],
  ['utm_medium', 'utmMedium'],
  ['utm_campaign', 'utmCampaign'],
  ['utm_term', 'utmTerm'],
  ['utm_content', 'utmContent'],
];

/** 최초 방문 시 1회만 유입 정보를 캡처한다. 이미 저장돼 있으면 아무 것도 하지 않는다. */
export function captureFirstTouch(): void {
  if (typeof window === 'undefined') return;
  try {
    if (window.localStorage.getItem(STORAGE_KEY)) return;

    const source: SignupSource = { _v: SIGNUP_SOURCE_VERSION };

    const params = new URLSearchParams(window.location.search);
    for (const [param, key] of UTM_PARAM_KEYS) {
      const v = params.get(param);
      if (v) source[key] = v;
    }

    const referrer = document.referrer;
    if (referrer) {
      try {
        const referrerHost = new URL(referrer).hostname;
        if (referrerHost !== window.location.hostname) {
          source.referrer = referrer;
        }
      } catch {
        // referrer 파싱 실패 — 무시(기록하지 않음).
      }
    }

    source.landingPath = `${window.location.pathname}${window.location.search}`;
    source.capturedAt = new Date().toISOString();

    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(source));
  } catch {
    // localStorage 접근 불가(사파리 비공개 모드, 쿼터 초과 등) — 조용히 무시.
  }
}

/** 캡처된 first-touch 유입 정보를 읽는다. 없으면 null. */
export function readFirstTouch(): SignupSource | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return migrateSignupSource(JSON.parse(raw));
  } catch {
    return null;
  }
}
