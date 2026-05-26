import { listPendingApplications } from '@/lib/server/queries/admin/review';
import Link from 'next/link';

export default async function ReviewListPage() {
  const apps = await listPendingApplications();

  return (
    <div className="space-y-4 p-6">
      <h1 className="text-headline-small font-semibold">입점 심사</h1>
      <div className="rounded border border-outline-variant overflow-hidden">
        <table className="w-full text-body-small">
          <thead>
            <tr className="border-b border-outline-variant bg-surface-container-low">
              <th className="px-4 py-2 text-left text-label-small text-on-surface-variant font-medium">유형</th>
              <th className="px-4 py-2 text-left text-label-small text-on-surface-variant font-medium">회사명</th>
              <th className="px-4 py-2 text-left text-label-small text-on-surface-variant font-medium">신청일</th>
              <th className="px-4 py-2 text-left text-label-small text-on-surface-variant font-medium">상태</th>
            </tr>
          </thead>
          <tbody>
            {apps.map((app) => (
              <tr
                key={app.applicationId}
                className="border-b border-outline-variant last:border-0 hover:bg-surface-container-low"
              >
                <td className="px-4 py-3">
                  <span className="text-label-small rounded bg-surface-container px-2 py-0.5">
                    {app.orgType === 'buyer' ? '구매사' : 'PG사'}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <Link
                    href={`/admin/review/${app.applicationId}`}
                    className="text-primary hover:underline"
                  >
                    {app.workspaceName}
                  </Link>
                </td>
                <td className="px-4 py-3 md-numeric text-on-surface-variant">
                  {new Date(app.submittedAt).toLocaleString('ko-KR')}
                </td>
                <td className="px-4 py-3">
                  <span className="text-label-small rounded bg-surface-container px-2 py-0.5">
                    {app.status}
                  </span>
                </td>
              </tr>
            ))}
            {apps.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-on-surface-variant">
                  대기 중인 신청이 없습니다.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
