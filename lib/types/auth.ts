import type { Role } from './user';

export type AuthSession = {
  userId: string;
  email: string;
  workspaceId: string;
  workspaceType: 'buyer' | 'pg';
  role: Role;
  issuedAt: string;
  expiresAt: string;
  rememberMe: boolean;
};

export type Credentials = { email: string; password: string };

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

export type Invitation = {
  id: string;
  workspaceId: string;
  inviterId: string;
  email: string;
  role: Role;
  groupId?: string;
  token: string;
  issuedAt: string;
  expiresAt: string;
  acceptedAt?: string;
  revokedAt?: string;
};

export type LoginAttempt = {
  email: string;
  ip: string;
  userAgent: string;
  at: string;
  success: boolean;
};
