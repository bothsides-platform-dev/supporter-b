import { listAllRfps } from '@/lib/server/queries/admin/rfps';
import Link from 'next/link';
import { AdminStatusBadge } from '@/components/admin/AdminStatusBadge';

export default async function RfpsPage() {
  const rfpList = await listAllRfps();

  return (
    <div className="space-y-4">
      <h1 className="text-headline-small font-semibold">RFP 전체 목록</h1>
      <div className="rounded border border-outline-variant overflow-hidden">
        <table className="w-full text-body-small">
          <thead>
            <tr className="border-b border-outline-variant bg-surface-container-low">
              <th className="px-4 py-2 text-left text-label-small text-on-surface-variant font-medium">코드</th>
              <th className="px-4 py-2 text-left text-label-small text-on-surface-variant font-medium">제목</th>
              <th className="px-4 py-2 text-left text-label-small text-on-surface-variant font-medium">구매사</th>
              <th className="px-4 py-2 text-left text-label-small text-on-surface-variant font-medium">상태</th>
              <th className="px-4 py-2 text-left text-label-small text-on-surface-variant font-medium">마감</th>
            </tr>
          </thead>
          <tbody>
            {rfpList.map((rfp) => (
              <tr key={rfp.id} className="border-b border-outline-variant last:border-0 hover:bg-surface-container-low">
                <td className="px-4 py-3 md-numeric text-label-small text-on-surface-variant">{rfp.code}</td>
                <td className="px-4 py-3">
                  <Link href={`/admin/rfps/${rfp.id}`} className="text-primary hover:underline">
                    {rfp.title}
                  </Link>
                </td>
                <td className="px-4 py-3">
                  <Link href={`/admin/buyers/${rfp.buyerWsId}`} className="text-on-surface hover:underline">
                    {rfp.buyerName}
                  </Link>
                </td>
                <td className="px-4 py-3">
                  <AdminStatusBadge status={rfp.status} />
                </td>
                <td className="px-4 py-3 md-numeric text-label-small text-on-surface-variant">
                  {new Date(rfp.deadline).toLocaleDateString('ko-KR')}
                </td>
              </tr>
            ))}
            {rfpList.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-on-surface-variant">
                  등록된 RFP가 없습니다.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
