export type Role = 'admin' | 'member';

export type User = {
  id: string;
  name: string;
  email: string;
  avatarColor: 'lavender' | 'amber' | 'moss' | 'accent' | 'terra' | 'ink';
  role: Role;
  status: 'active' | 'paused';
  /** Email-verification flag — false until the user consumes a signup_email token. */
  emailVerified: boolean;
  groupId?: string;
  joinedAt: string;
  lastSeenAt?: string;
};
