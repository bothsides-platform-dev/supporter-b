'use server';

// inbox/[rfpId] RSC 진입 시 호출 — 본인 워크스페이스의 accepted invitation 을
// opened 로 전이(열람 기록/read-receipt 목적). 칸반 단계에는 영향 없음
// (검토중 단계 제거 후 sent/opened 모두 신규(received) 로 분류됨).
// 이미 opened 이상이면 no-op (멤버 다수가 들러도 멱등).
import { auth } from '@/auth';
import { getInvitationRepo } from '../../repositories/factory';

export async function markInvitationOpenedAction(input: {
  rfpId: string;
}): Promise<void> {
  const session = await auth();
  if (!session?.user?.id || !session.user.workspaceId) return;

  const invRepo = await getInvitationRepo();
  const all = await invRepo.findByRfp(input.rfpId);
  const mine = all.find(
    (i) =>
      i.pgWsId === session.user!.workspaceId &&
      (i.status === 'sent' || i.status === 'accepted'),
  );
  if (!mine) return;

  await invRepo.markOpened(mine.id, new Date());
}
