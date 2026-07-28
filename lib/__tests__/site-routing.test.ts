import { describe, it, expect, afterEach } from 'vitest';
import {
  appOrigins,
  hostServes,
  resolveHostRedirect,
  workspaceSwitchTarget,
  signupTargetForHost,
  opsLoginRedirectTarget,
  shouldNoindexHost,
  type AppOrigins,
} from '../site-routing';

const PROD: AppOrigins = {
  buyer: 'https://support-b.com',
  pg: 'https://partner.support-b.com',
};
const LOCAL: AppOrigins = { buyer: 'http://localhost:3000', pg: 'http://localhost:3000' };

describe('hostServes', () => {
  it('maps the buyer host and partner host to their workspace types', () => {
    expect(hostServes('support-b.com', PROD)).toBe('buyer');
    expect(hostServes('partner.support-b.com', PROD)).toBe('pg');
  });
  it('ignores the port and is case-insensitive', () => {
    expect(hostServes('Partner.Support-B.com:443', PROD)).toBe('pg');
  });
  it('returns null for an unknown host (IP, preview domain)', () => {
    expect(hostServes('52.78.126.178', PROD)).toBeNull();
    expect(hostServes(null, PROD)).toBeNull();
  });
  it('disables routing when both origins share a host (local/dev)', () => {
    expect(hostServes('localhost', LOCAL)).toBeNull();
  });
  it('returns null (fails safe) when an origin is malformed instead of throwing', () => {
    const BAD = { buyer: 'support-b.com', pg: 'partner.support-b.com' } as AppOrigins; // no scheme
    expect(() => hostServes('partner.support-b.com', BAD)).not.toThrow();
    expect(hostServes('partner.support-b.com', BAD)).toBeNull();
  });
});

describe('resolveHostRedirect', () => {
  it('returns null when the host already serves the active type', () => {
    expect(resolveHostRedirect('buyer', 'support-b.com', PROD)).toBeNull();
    expect(resolveHostRedirect('pg', 'partner.support-b.com', PROD)).toBeNull();
  });
  it('redirects a pg session on the buyer host to the partner origin', () => {
    expect(resolveHostRedirect('pg', 'support-b.com', PROD)).toBe(
      'https://partner.support-b.com/home',
    );
  });
  it('redirects a buyer session on the partner host to the buyer origin', () => {
    expect(resolveHostRedirect('buyer', 'partner.support-b.com', PROD)).toBe(
      'https://support-b.com/home',
    );
  });
  it('never redirects on an unknown host or in local/dev (no loop risk)', () => {
    expect(resolveHostRedirect('pg', '52.78.126.178', PROD)).toBeNull();
    expect(resolveHostRedirect('pg', 'localhost', LOCAL)).toBeNull();
  });
});

describe('workspaceSwitchTarget', () => {
  it('stays relative when switching to a type the current host serves', () => {
    expect(workspaceSwitchTarget('buyer', 'support-b.com', PROD)).toBe('/home');
  });
  it('returns the absolute other-origin url on a cross-host switch', () => {
    expect(workspaceSwitchTarget('pg', 'support-b.com', PROD)).toBe(
      'https://partner.support-b.com/home',
    );
  });
  it('stays relative in local/dev (single host)', () => {
    expect(workspaceSwitchTarget('pg', 'localhost', LOCAL)).toBe('/home');
  });
  it('appends a given path on a cross-host switch', () => {
    expect(workspaceSwitchTarget('pg', 'support-b.com', PROD, '/inbox/abc')).toBe(
      'https://partner.support-b.com/inbox/abc',
    );
  });
  it('returns the given relative path on a same-host switch', () => {
    expect(workspaceSwitchTarget('buyer', 'support-b.com', PROD, '/rfp')).toBe('/rfp');
  });
  it('defaults the path to /home when omitted', () => {
    expect(workspaceSwitchTarget('pg', 'support-b.com', PROD)).toBe(
      'https://partner.support-b.com/home',
    );
  });
});

describe('signupTargetForHost', () => {
  it('routes the partner host to the pg signup flow', () => {
    expect(signupTargetForHost('partner.support-b.com', PROD)).toBe('/signup/pg');
  });
  it('routes the buyer host to the buyer signup flow', () => {
    expect(signupTargetForHost('support-b.com', PROD)).toBe('/signup/buyer');
  });
  it('falls back to the buyer flow for an unknown host or null (mirrors the landing)', () => {
    expect(signupTargetForHost('52.78.126.178', PROD)).toBe('/signup/buyer');
    expect(signupTargetForHost(null, PROD)).toBe('/signup/buyer');
  });
  it('falls back to the buyer flow in single-host local/dev', () => {
    expect(signupTargetForHost('localhost', LOCAL)).toBe('/signup/buyer');
  });
});

describe('opsLoginRedirectTarget', () => {
  // OAuth PKCE 쿠키는 host-only인데 콜백은 buyer 호스트로 고정 —
  // partner에서 시작한 마스터 로그인은 반드시 buyer 호스트로 넘겨 시작해야 한다.
  it('redirects the partner host to the buyer origin /login/ops (PKCE cookie must live on the callback host)', () => {
    expect(opsLoginRedirectTarget('partner.support-b.com', PROD)).toBe(
      'https://support-b.com/login/ops',
    );
  });
  it('stays (null) on the buyer host', () => {
    expect(opsLoginRedirectTarget('support-b.com', PROD)).toBeNull();
  });
  it('stays on an unknown host or null host (no loop risk)', () => {
    expect(opsLoginRedirectTarget('52.78.126.178', PROD)).toBeNull();
    expect(opsLoginRedirectTarget(null, PROD)).toBeNull();
  });
  it('stays in single-host local/dev (routing disabled)', () => {
    expect(opsLoginRedirectTarget('localhost', LOCAL)).toBeNull();
  });
});

describe('shouldNoindexHost', () => {
  it('is true on the partner host — not meant to be search-indexed', () => {
    expect(shouldNoindexHost('partner.support-b.com', PROD)).toBe(true);
  });
  it('is false on the buyer host', () => {
    expect(shouldNoindexHost('support-b.com', PROD)).toBe(false);
  });
  it('is false for an unknown host or in single-host local/dev', () => {
    expect(shouldNoindexHost('52.78.126.178', PROD)).toBe(false);
    expect(shouldNoindexHost('localhost', LOCAL)).toBe(false);
  });
});

// 부분 설정 회귀 가드 — appOrigins 의 폴백은 NEXT_PUBLIC_BASE_URL 우선이다. per-type
// 오리진을 **하나만** 설정한 환경에서는 buyer/pg 가 같은 값으로 붕괴할 수 있고, 그러면
// hostServes 가 전부 null 을 돌려주면서 보안 성격의 두 가드가 조용히 무력화된다:
// partner 호스트의 noindex 와, 마스터 로그인을 buyer 호스트에서 시작시키는 PKCE 핀.
// prod 는 두 오리진을 모두 설정해 이 경로를 타지 않지만(.env.production.example),
// 스테이징·프리뷰는 탄다. 동작을 바꾸지 않고 회귀만 못박는다.
describe('부분 설정에서도 호스트 가드가 살아있다', () => {
  const env = { ...process.env };
  afterEach(() => {
    process.env = { ...env };
  });

  const setEnv = (v: Record<string, string | undefined>) => {
    for (const k of [
      'NEXT_PUBLIC_BUYER_ORIGIN',
      'NEXT_PUBLIC_PARTNER_ORIGIN',
      'NEXT_PUBLIC_BASE_URL',
      'AUTH_URL',
    ]) {
      delete process.env[k];
    }
    for (const [k, val] of Object.entries(v)) {
      if (val !== undefined) process.env[k] = val;
    }
  };

  it('per-type 오리진이 둘 다 있으면 partner 가드가 동작한다 (기준선)', () => {
    setEnv({
      NEXT_PUBLIC_BUYER_ORIGIN: 'https://support-b.com',
      NEXT_PUBLIC_PARTNER_ORIGIN: 'https://partner.support-b.com',
      AUTH_URL: 'https://support-b.com',
      NEXT_PUBLIC_BASE_URL: 'https://partner.support-b.com',
    });
    const o = appOrigins();
    expect(shouldNoindexHost('partner.support-b.com', o)).toBe(true);
    expect(opsLoginRedirectTarget('partner.support-b.com', o)).toBe(
      'https://support-b.com/login/ops',
    );
  });

  // fail-closed — per-type 오리진을 하나만 설정한 상태는 유효한 배포가 아니다. 예전엔
  // 나머지 하나가 폴백으로 채워지며 "두 오리진이 같다 = 단일 호스트 dev" 로 위장했고,
  // 그 결과 partner noindex(+ robots.ts 의 buyer 폴백)와 ops PKCE 핀이 한꺼번에 조용히
  // 꺼졌다. 이제는 조용히 지나가는 대신 던진다 — 잘못 설정된 배포가 즉시 드러나야 한다.
  it('per-type 오리진을 하나만 설정하면 조용히 붕괴하지 않고 던진다', () => {
    setEnv({
      NEXT_PUBLIC_PARTNER_ORIGIN: 'https://partner.support-b.com',
      NEXT_PUBLIC_BASE_URL: 'https://partner.support-b.com',
      AUTH_URL: 'https://support-b.com',
    });
    expect(() => appOrigins()).toThrow(/NEXT_PUBLIC_BUYER_ORIGIN/);
  });

  it('buyer 만 설정한 반대 방향도 던진다', () => {
    setEnv({ NEXT_PUBLIC_BUYER_ORIGIN: 'https://support-b.com' });
    expect(() => appOrigins()).toThrow(/NEXT_PUBLIC_PARTNER_ORIGIN/);
  });

  it('둘 다 없으면 단일 호스트 dev 로 그대로 통과한다 (라우팅 off 가 정상)', () => {
    setEnv({ AUTH_URL: 'http://localhost:3000' });
    const o = appOrigins();
    expect(o.buyer).toBe(o.pg);
    expect(hostServes('localhost', o)).toBeNull();
  });

  it('per-type 오리진이 둘 다 있으면 무관한 폴백 env 가 있어도 가드가 유지된다', () => {
    setEnv({
      NEXT_PUBLIC_BUYER_ORIGIN: 'https://support-b.com',
      NEXT_PUBLIC_PARTNER_ORIGIN: 'https://partner.support-b.com',
      // 폴백은 per-type 이 다 있으면 쓰이지 않는다 — 엉뚱한 값이어도 무해해야 한다.
      NEXT_PUBLIC_BASE_URL: 'https://elsewhere.example.com',
      AUTH_URL: 'https://another.example.com',
    });
    const o = appOrigins();
    expect(o.buyer).toBe('https://support-b.com');
    expect(o.pg).toBe('https://partner.support-b.com');
    expect(shouldNoindexHost('partner.support-b.com', o)).toBe(true);
    expect(opsLoginRedirectTarget('partner.support-b.com', o)).toBe(
      'https://support-b.com/login/ops',
    );
  });
});
