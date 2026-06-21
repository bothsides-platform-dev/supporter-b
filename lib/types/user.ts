export type Role = 'admin' | 'member';

export type User = {
  id: string;
  name: string;
  email: string;
  avatarColor: 'lavender' | 'amber' | 'moss' | 'accent' | 'terra' | 'ink';
  /** 프로필 사진 버전 — ISO 문자열이면 사진 있음(=캐시 버스트 키), null이면 이니셜. */
  avatarUpdatedAt: string | null;
  role: Role;
  status: 'active' | 'paused';
  /** Email-verification flag — false until the user consumes a signup_email token. */
  emailVerified: boolean;
  groupId?: string;
  joinedAt: string;
  lastSeenAt?: string;
};
