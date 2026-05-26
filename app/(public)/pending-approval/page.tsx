import { auth } from '@/auth';
import { redirect } from 'next/navigation';

export default async function PendingApprovalPage() {
  const session = await auth();
  if (!session?.user?.id) redirect('/login');

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-4">
      <div className="w-full max-w-md space-y-3 text-center">
        <h1 className="text-title-large">입점 심사 중</h1>
        <p className="text-body-medium text-on-surface-variant">
          계정이 검토 중입니다. 승인 완료 후 이메일로 안내드립니다.
        </p>
        <p className="text-body-small text-on-surface-variant">
          문의:{' '}
          <a href="mailto:support@bidit.store" className="underline">
            support@bidit.store
          </a>
        </p>
      </div>
    </div>
  );
}
