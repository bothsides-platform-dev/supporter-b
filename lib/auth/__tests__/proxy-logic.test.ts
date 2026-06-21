import { describe, expect, it } from 'vitest';
import { decideRoute, decideProxyRoute } from '../route-decision';

describe('decideRoute — Step 3 four cases', () => {
  it('case 1: unauth + (app)/* redirects to /login?next=<encoded>', () => {
    const result = decideRoute('/rfp/q-2605-0042', '?tab=bids', false);
    expect(result).toEqual({
      kind: 'redirect',
      to: `/login?next=${encodeURIComponent('/rfp/q-2605-0042?tab=bids')}`,
    });
  });

  it('case 1b: unauth + /home (no search) redirects to /login?next=/home', () => {
    const result = decideRoute('/home', '', false);
    expect(result).toEqual({
      kind: 'redirect',
      to: `/login?next=${encodeURIComponent('/home')}`,
    });
  });

  it('case 2: auth + /login redirects to /home', () => {
    expect(decideRoute('/login', '', true)).toEqual({
      kind: 'redirect',
      to: '/home',
    });
  });

  it('case 2: auth + /signup redirects to /home', () => {
    expect(decideRoute('/signup/email', '', true)).toEqual({
      kind: 'redirect',
      to: '/home',
    });
  });

  it('case 3: any + /invite/rfp/<token> passes through', () => {
    expect(decideRoute('/invite/rfp/abc123', '', false)).toEqual({ kind: 'next' });
    expect(decideRoute('/invite/rfp/abc123', '', true)).toEqual({ kind: 'next' });
  });

  it('case 4: any + /logout passes through (does not redirect to /home)', () => {
    expect(decideRoute('/logout', '', true)).toEqual({ kind: 'next' });
    expect(decideRoute('/logout', '', false)).toEqual({ kind: 'next' });
  });

  it('unauth + /rfp/new redirects to /login?next (게스트 작성 제거)', () => {
    expect(decideRoute('/rfp/new', '', false)).toEqual({
      kind: 'redirect',
      to: `/login?next=${encodeURIComponent('/rfp/new')}`,
    });
  });

  it('auth + /rfp/new passes through', () => {
    expect(decideRoute('/rfp/new', '', true)).toEqual({ kind: 'next' });
  });

  it('unauth + /login passes through (no redirect loop)', () => {
    expect(decideRoute('/login', '', false)).toEqual({ kind: 'next' });
  });

  it('auth + /home (an app route) passes through', () => {
    expect(decideRoute('/home', '', true)).toEqual({ kind: 'next' });
  });

  it('unauth + / passes through (landing page is public)', () => {
    expect(decideRoute('/', '', false)).toEqual({ kind: 'next' });
  });

  it('auth + / passes through (landing is accessible to all)', () => {
    expect(decideRoute('/', '', true)).toEqual({ kind: 'next' });
  });
});

describe('/auth/verify 패스스루 — 매직링크 버그 픽스', () => {
  it('auth + /auth/verify?token=... 는 /home 으로 리다이렉트되지 않고 pass-through', () => {
    // 근본원인: 인증된 사용자가 이메일 매직링크 클릭 시 미들웨어가 /home으로 튕겨
    // verifyEmailAction이 실행되지 않는 버그. /auth/verify 는 항상 통과해야 한다.
    expect(decideRoute('/auth/verify', '?token=abc123', true)).toEqual({ kind: 'next' });
    expect(decideRoute('/auth/verify', '?token=abc123', false)).toEqual({ kind: 'next' });
  });
});

describe('admin + gate 라우트 패스스루', () => {
  it('/admin/* 는 인증 여부와 무관하게 pass-through', () => {
    expect(decideRoute('/admin', '', false)).toEqual({ kind: 'next' });
    expect(decideRoute('/admin/review', '', true)).toEqual({ kind: 'next' });
    expect(decideRoute('/admin/login', '', false)).toEqual({ kind: 'next' });
  });

  it('/pending-approval 은 로그인된 사용자도 접근 가능 (home 리다이렉트 없음)', () => {
    expect(decideRoute('/pending-approval', '', true)).toEqual({ kind: 'next' });
    expect(decideRoute('/pending-approval', '', false)).toEqual({ kind: 'next' });
  });

  it('/suspended 는 로그인된 사용자도 접근 가능', () => {
    expect(decideRoute('/suspended', '', true)).toEqual({ kind: 'next' });
  });
});

describe('decideProxyRoute — loop-break escape precedes the auth bounce', () => {
  // 회로차단기가 트립해 __rl_break 플래그가 있고 /login 이면, authed 라도 /home 으로
  // 되튕기지 않고 escape(렌더)한다. 이 우선순위가 깨지면 루프가 재발하므로 고정한다.
  it('escapes on /login when the break flag is set, even for an authed session', () => {
    expect(decideProxyRoute('/login', '', true, '1')).toEqual({ kind: 'escape' });
  });

  it('without the break flag, /login authed still bounces to /home (unchanged)', () => {
    expect(decideProxyRoute('/login', '', true, undefined)).toEqual({
      kind: 'redirect',
      to: '/home',
    });
  });

  it('the break flag does NOT escape protected (app) routes — delegates to decideRoute', () => {
    // /home 은 보호 라우트라 플래그가 있어도 escape 하지 않는다 (fail-open 방지).
    expect(decideProxyRoute('/home', '', true, '1')).toEqual({ kind: 'next' });
    expect(decideProxyRoute('/rfp/x', '', false, '1')).toEqual({
      kind: 'redirect',
      to: `/login?next=${encodeURIComponent('/rfp/x')}`,
    });
  });
});
