export type SignupDraft = {
  step: 'email' | 'profile' | 'workspace';
  workspaceType?: 'buyer' | 'pg';
  email: string;
  emailVerified: boolean;
  name?: string;
  phone?: string;
  phoneVerificationId?: string;
  agreedAt?: string;
};

export type VerificationToken = {
  id: string;
  purpose: 'signup_email' | 'password_reset' | 'email_change' | 'invite';
  email: string;
  token: string;
  issuedAt: string;
  expiresAt: string;
  consumedAt?: string;
  meta?: Record<string, unknown>;
};

