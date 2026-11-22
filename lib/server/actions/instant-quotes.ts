'use server';
import { flushAfterCommit } from '@/lib/server/outbox/post-commit';
import { cookies } from 'next/headers';
import { requireSession } from '@/lib/auth/session';
import { GUEST_DRAFT_COOKIE } from '@/lib/server/guest-rfp/draft-request';
import {
  buyerUpdate,
  confirmInstant,
  InstantError,
  previewInstant,
} from '@/lib/server/services/instant-quotes';
import { z } from 'zod';

async function actor() {
  const s = await requireSession({ allowInactiveWorkspace: true });
  if (s.user.workspaceType !== 'buyer' || !s.user.workspaceId)
    throw new InstantError('구매사 계정으로 로그인해주세요.');
  return { userId: s.user.id, workspaceId: s.user.workspaceId };
}
async function result<T>(fn: () => Promise<T>) {
  try {
    return { ok: true as const, value: await fn() };
  } catch (e) {
    return {
      ok: false as const,
      error:
        e instanceof InstantError
          ? e.message
          : e instanceof z.ZodError
            ? '입력한 사업 정보와 필수 답변을 확인해주세요.'
            : '요청을 처리하지 못했어요. 로그인과 이메일 인증을 확인하고 다시 시도해주세요.',
    };
  }
}
export async function previewInstantAction(data: unknown) {
  return result(async () =>
    previewInstant(
      data,
      (await cookies()).get(GUEST_DRAFT_COOKIE)?.value,
      await actor().catch(() => undefined),
    ),
  );
}
export async function confirmInstantAction(data: unknown) {
  return result(async () => {
    const saved = await confirmInstant(
      data,
      await actor(),
      (await cookies()).get(GUEST_DRAFT_COOKIE)?.value,
    );
    flushAfterCommit();
    return saved;
  });
}
export async function updateInstantAction(
  id: string,
  act: string,
  reported = '',
) {
  return result(async () =>
    buyerUpdate(
      z.uuid().parse(id),
      await actor(),
      z
        .enum(['visit', 'applied', 'enrolled', 'match', 'differ', 'agreement'])
        .parse(act),
      z.string().max(1500).parse(reported),
    ),
  );
}
