import { auth } from '@/auth';
import { redirect } from 'next/navigation';

export default async function SuspendedPage() {
  const session = await auth();
  if (!session?.user?.id) redirect('/login');

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-4">
      <div className="w-full max-w-md space-y-3 text-center">
        <h1 className="text-title-large">계정 이용 정지</h1>
        <p className="text-body-medium text-on-surface-variant">
          계정 이용이 일시 제한되었습니다.
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
