import { headers } from 'next/headers';
import { requireAdminSession } from '@/lib/auth/admin-session';
import { AdminShell } from '@/components/admin/AdminShell';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const headersList = await headers();
  const pathname = headersList.get('x-pathname') ?? '';

  if (pathname.startsWith('/admin/login')) {
    return <>{children}</>;
  }

  await requireAdminSession();
  return <AdminShell>{children}</AdminShell>;
}
