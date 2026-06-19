import {
  signupCompleteAction,
  signupViaWorkspaceInviteAction,
} from '@/lib/server/actions/auth';
import { joinCanonicalPgWorkspaceAction } from '@/lib/server/actions/auth/joinCanonicalPgWorkspaceAction';
import { loginAction } from '@/lib/server/actions/auth/loginAction';
import { clearSignupDraft, readSignupDraft } from '@/lib/auth/signup-storage';
import { safeInternalNext } from '@/lib/auth/safe-next';

export type FinalizeResult =
  | { ok: true; redirectTo: string }
  | { ok: false; error: string; redirectTo?: string };

/**
 * 가입 마무리 — 담당자 정보(step 3) 제출 시 호출.
 *
 * 새 흐름: 이메일 인증 *전에* 미인증 유저를 만든다. sessionStorage draft 전체로
 * 적절한 액션을 호출하고(buyer/pg/초대), 자동 로그인 후 draft 를 비운다. 이후 (app)
 * 가드가 pending 워크스페이스를 /pending-approval 로 보내고, 거기서 이메일 인증을
 * 서버 플래그 전환으로 처리한다(탭/기기 독립).
 */
export async function finalizeSignup(): Promise<FinalizeResult> {
  const d = readSignupDraft();
  if (!d.email || !d.password || !d.name || !d.phone || !d.phoneVerificationId) {
    return { ok: false, error: 'SESSION_EXPIRED' };
  }

  let r;
  if (d.selectedPgWorkspaceId) {
    // 주요 PG사 선택 경로 — canonical 워크스페이스에 member로 즉시 합류.
    r = await joinCanonicalPgWorkspaceAction({
      email: d.email,
      name: d.name,
      password: d.password,
      phone: d.phone,
      phoneVerificationId: d.phoneVerificationId,
      selectedPgWorkspaceId: d.selectedPgWorkspaceId,
    });
  } else if (d.wsInviteToken) {
    // 초대 경로 — 기존(승인된) 워크스페이스에 member 합류.
    r = await signupViaWorkspaceInviteAction({
      email: d.email,
      name: d.name,
      password: d.password,
      phone: d.phone,
      phoneVerificationId: d.phoneVerificationId,
      wsInviteToken: d.wsInviteToken,
    });
  } else if (d.workspaceType === 'pg') {
    if (!d.wsName || !d.bizNo) return { ok: false, error: 'SESSION_EXPIRED' };
    r = await signupCompleteAction({
      email: d.email,
      name: d.name,
      password: d.password,
      phone: d.phone,
      phoneVerificationId: d.phoneVerificationId,
      wsKind: 'pg',
      wsName: d.wsName,
      pgProfile: { bizNo: d.bizNo },
    });
  } else {
    if (!d.wsName || !d.bizProfile) return { ok: false, error: 'SESSION_EXPIRED' };
    r = await signupCompleteAction({
      email: d.email,
      name: d.name,
      password: d.password,
      phone: d.phone,
      phoneVerificationId: d.phoneVerificationId,
      wsKind: 'buyer',
      wsName: d.wsName,
      bizProfile: d.bizProfile,
    });
  }

  if (!r.ok) {
    // 초대 경로에서 이미 가입된 이메일(미인증 기존계정 포함) → 막다른 길 대신
    // 로그인 후 같은 초대 링크로 복귀해 수락한다(#8). 로그인이 미인증 유저를
    // 허용하므로 성립.
    if (r.error === 'EMAIL_TAKEN' && d.wsInviteToken) {
      return {
        ok: false,
        error: 'EMAIL_TAKEN',
        redirectTo: `/login?next=${encodeURIComponent(`/invite/workspace/${d.wsInviteToken}`)}`,
      };
    }
    return { ok: false, error: r.error };
  }

  // 자동 로그인은 loginAction(서버사이드 signIn)으로 처리한다. 클라이언트
  // signIn(next-auth/react)은 GET /csrf + POST /callback 풀 HTTP 왕복이라, AUTH_URL 이
  // 단일 호스트로 고정된 프로덕션에서 partner.supporter-b.com 가입 시 origin/CSRF
  // 검증에 막혀 CredentialsSignin 으로 실패했다(buyer 호스트만 성공). loginAction 은
  // 인프로세스 signIn 이라 HTTP/CSRF 왕복이 없고 쿠키를 .supporter-b.com 도메인으로
  // 세팅해 두 호스트 모두 동작한다. 또한 loginAction 의 레이트리밋(F1/F3)을 그대로
  // 재사용한다 — 별도 미보호 자격증명 엔드포인트를 새로 만들지 않는다.
  const signInResult = await loginAction({
    email: r.email,
    password: r.password,
  });
  clearSignupDraft();

  if (!signInResult.ok) {
    console.error('[signup] auto-login failed — error:', signInResult.error);
    return { ok: false, error: 'SIGNIN_FAILED' };
  }
  // draft의 next가 안전한 내부 경로면 서버 기본 redirectTo를 오버라이드한다.
  // (초대 경로는 위에서 조기 반환되므로 여기선 일반 가입만 해당)
  const override = safeInternalNext(d.next);
  return { ok: true, redirectTo: override ?? r.redirectTo };
}
