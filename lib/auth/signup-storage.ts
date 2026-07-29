// SessionStorage hand-off for the signup flow. Server actions can't read
// sessionStorage; the client owns the state machine across these hops:
//   /signup/pg → /signup/pg/workspace → /signup/pg/profile → /signup/pg/verify
// (워크스페이스 초대 경로는 /workspace 단계를 건너뜀: step 1 → profile → verify)
// The Zustand store (lib/stores/signup-draft) is the in-memory mirror but
// gets wiped on reload. sessionStorage is the durable carrier across redirects
// — including the email-link round-trip when the user opens the verify URL
// from the same browser session.
//
// Keys live under one root so cleanup is a single removeItem(). password is
// stored briefly between profile submit and signupCompleteAction /
// signupViaWorkspaceInviteAction; the auto-signIn step clears it.
const KEY = 'signupDraft';

export type SignupBizProfile = {
  bizNo: string;
  // 국세청 장애로 검증을 건너뛴 경우 비어 있다. 어차피 서버가 재판정하므로
  // (resolveBizProfileForWrite) 이 draft 값은 참고용이다.
  taxType?: 'general' | 'simple' | 'exempt';
  status?: 'active' | 'suspended' | 'closed';
};

export type SignupClientDraft = {
  workspaceType?: 'buyer' | 'pg';
  email?: string;
  emailVerified?: boolean;
  inviteToken?: string;
  wsInviteToken?: string;
  /** 워크스페이스 초대 시 초대한 워크스페이스 이름 — step 1 맥락 안내용 */
  inviteWorkspaceName?: string;
  name?: string;
  phone?: string;
  phoneVerificationId?: string;
  password?: string;
  agreedAt?: string;
  wsName?: string;
  /** Buyer: NTS 조회로 채워진 사업자 정보 (step 2 → step 4) */
  bizProfile?: SignupBizProfile;
  /** PG: 직접 입력한 사업자번호 (step 2 → step 4) */
  bizNo?: string;
  /** PG 가입 시 선택한 canonical PG 워크스페이스 id — 선택 경로에서 설정, /profile 제출 시 소비 */
  selectedPgWorkspaceId?: string;
  /** 가입 완료 후 복귀할 내부 경로 (CTA → /login?next= → /signup?next= 경유로 주입됨) */
  next?: string;
};

export function readSignupDraft(): SignupClientDraft {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.sessionStorage.getItem(KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as SignupClientDraft;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export function writeSignupDraft(next: SignupClientDraft): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // Quota or privacy mode — fall through.
  }
}

export function clearSignupDraft(): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}

/** sessionStorage가 접근 가능한지 확인. 사파리 비공개 모드 등에서 false. */
export function isSignupStorageAvailable(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const probe = '__ss_probe__';
    window.sessionStorage.setItem(probe, '1');
    window.sessionStorage.removeItem(probe);
    return true;
  } catch {
    return false;
  }
}
