import { redirect } from 'next/navigation';
import { Label } from '@/components/primitives/Label';
import { PageEnter } from '@/components/primitives/PageEnter';
import { auth } from '@/auth';
import { JoinWorkspaceForm } from '@/components/workspace/JoinWorkspaceForm';

export const dynamic = 'force-dynamic';

export default async function JoinWorkspacePage() {
  const session = await auth();
  if (!session?.user?.id) redirect('/login?next=/workspace/join');

  return (
    <PageEnter className="px-4 py-6 md:px-8 md:py-8 space-y-8">
      <div>
        <Label size="md" muted={false} as="span" className="block mb-2">
          WORKSPACE · JOIN
        </Label>
        <h1 className="text-[26px] font-[700] tracking-[-0.02em] text-[var(--md-sys-color-on-surface)]">
          워크스페이스 합류
        </h1>
        <p className="mt-2 text-[13px] text-[var(--md-sys-color-on-surface-variant)] max-w-[420px]">
          관리자에게 받은 초대 링크 또는 토큰을 입력하면 해당 워크스페이스에
          합류하고 바로 전환됩니다.
        </p>
      </div>
      <JoinWorkspaceForm />
    </PageEnter>
  );
}
