// SessionStorage hand-off for the signup flow. Server actions can't read
// sessionStorage; the client owns the state machine across these hops:
//   /signup → /auth/verify?email=… → /signup/profile → /signup/workspace
// The Zustand store (lib/stores/signup-draft) is the in-memory mirror but
// gets wiped on reload. sessionStorage is the durable carrier across redirects
// — including the email-link round-trip when the user opens the verify URL
// from the same browser session.
//
// Keys live under one root so cleanup is a single removeItem(). password is
// stored briefly between profile submit and signupCompleteAction; the auto-
// signIn step clears it.
const KEY = 'signupDraft';

export type SignupBizProfile = {
  bizNo: string;
  taxType: 'general' | 'simple' | 'exempt';
  status: 'active' | 'suspended' | 'closed';
};

export type SignupClientDraft = {
  workspaceType?: 'buyer' | 'pg';
  email?: string;
  emailVerified?: boolean;
  inviteToken?: string;
  wsInviteToken?: string;
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
