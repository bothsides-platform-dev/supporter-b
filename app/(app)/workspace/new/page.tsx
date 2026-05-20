import { redirect } from 'next/navigation';
import { Label } from '@/components/primitives/Label';
import { PageEnter } from '@/components/primitives/PageEnter';
import { auth } from '@/auth';
import { CreateWorkspaceForm } from '@/components/workspace/CreateWorkspaceForm';

export const dynamic = 'force-dynamic';

export default async function NewWorkspacePage() {
  const session = await auth();
  if (!session?.user?.id) redirect('/login?next=/workspace/new');

  return (
    <PageEnter className="px-4 py-6 md:px-8 md:py-8 space-y-8">
      <div>
        <Label size="md" muted={false} as="span" className="block mb-2">
          WORKSPACE · NEW
        </Label>
        <h1 className="text-[26px] font-[700] tracking-[-0.02em] text-[var(--md-sys-color-on-surface)]">
          새 워크스페이스 만들기
        </h1>
        <p className="mt-2 text-[13px] text-[var(--md-sys-color-on-surface-variant)] max-w-[420px]">
          구매사 또는 PG 워크스페이스를 새로 만들고 바로 전환합니다. 사업자번호·등급은
          생성 후 설정에서 입력할 수 있습니다.
        </p>
      </div>
      <CreateWorkspaceForm />
    </PageEnter>
  );
}
