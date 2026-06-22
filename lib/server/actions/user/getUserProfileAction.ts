'use server';

// 아바타 클릭 신원 카드용 — 세션의 활성 워크스페이스를 actor 로 삼아 ACL 로더에 위임한다.
// 데이터 경계(이메일 비열거)는 loadUserProfileForViewer 가 책임지고, 액션은 입력 검증과
// 세션 해소만 한다(얇은 진입점).
import { z } from 'zod';

import { requireSession } from '@/lib/auth/session';
import {
  loadUserProfileForViewer,
  type UserProfileForViewer,
} from '@/lib/server/user-profile-loader';

const Input = z.string().uuid();

export type GetUserProfileResult =
  | { ok: true; profile: UserProfileForViewer }
  | { ok: false; error: string };

export async function getUserProfileAction(userId: string): Promise<GetUserProfileResult> {
  const parsed = Input.safeParse(userId);
  if (!parsed.success) return { ok: false, error: 'INVALID_INPUT' };

  let session;
  try {
    session = await requireSession();
  } catch {
    return { ok: false, error: 'UNAUTHENTICATED' };
  }
  const { id, workspaceId, workspaceType } = session.user;
  if (!workspaceId || !workspaceType) return { ok: false, error: 'NO_WORKSPACE' };

  const res = await loadUserProfileForViewer(
    { userId: id, workspaceId, workspaceType },
    parsed.data,
  );
  if (!res.ok) return { ok: false, error: 'NOT_AVAILABLE' };
  return { ok: true, profile: res.profile };
}
