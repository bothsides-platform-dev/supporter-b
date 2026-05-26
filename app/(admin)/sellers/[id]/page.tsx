import { notFound } from 'next/navigation';
import { getSellerDetail } from '@/lib/server/queries/admin/sellers';
import { AdminStatusBadge } from '@/components/admin/AdminStatusBadge';
import Link from 'next/link';

export default async function SellerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const detail = await getSellerDetail(id);
  if (!detail) notFound();

  const { workspace, pgProfile, bids } = detail;

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center gap-3">
        <h1 className="text-headline-small font-semibold">{workspace.name}</h1>
        <AdminStatusBadge status={workspace.status} />
      </div>

      {pgProfile && (
        <section>
          <h2 className="text-title-small font-semibold mb-3">PG 프로필</h2>
          <div className="rounded border border-outline-variant divide-y divide-outline-variant">
            {pgProfile.bizNo && (
              <div className="px-4 py-3 flex gap-4">
                <span className="text-label-small text-on-surface-variant w-32 shrink-0">사업자번호</span>
                <span className="text-body-small font-mono">{pgProfile.bizNo}</span>
              </div>
            )}
            {pgProfile.serviceScope?.paymentMethods && pgProfile.serviceScope.paymentMethods.length > 0 && (
              <div className="px-4 py-3 flex gap-4">
                <span className="text-label-small text-on-surface-variant w-32 shrink-0">결제수단</span>
                <span className="text-body-small">{pgProfile.serviceScope.paymentMethods.join(', ')}</span>
              </div>
            )}
            {pgProfile.serviceScope?.volumeRange && (
              <div className="px-4 py-3 flex gap-4">
                <span className="text-label-small text-on-surface-variant w-32 shrink-0">거래량 규모</span>
                <span className="text-body-small">{pgProfile.serviceScope.volumeRange}</span>
              </div>
            )}
            {pgProfile.salesContact && (
              <div className="px-4 py-3 flex gap-4">
                <span className="text-label-small text-on-surface-variant w-32 shrink-0">영업 담당자</span>
                <span className="text-body-small">
                  {pgProfile.salesContact.name}
                  {pgProfile.salesContact.email && (
                    <span className="text-on-surface-variant ml-2">({pgProfile.salesContact.email})</span>
                  )}
                </span>
              </div>
            )}
            {pgProfile.slaDays != null && (
              <div className="px-4 py-3 flex gap-4">
                <span className="text-label-small text-on-surface-variant w-32 shrink-0">SLA (일)</span>
                <span className="text-body-small md-numeric">{pgProfile.slaDays}일</span>
              </div>
            )}
          </div>
        </section>
      )}

      <section>
        <h2 className="text-title-small font-semibold mb-3">최근 입찰 ({bids.length}건)</h2>
        <div className="rounded border border-outline-variant overflow-hidden">
          <table className="w-full text-body-small">
            <thead>
              <tr className="border-b border-outline-variant bg-surface-container-low">
                <th className="px-4 py-2 text-left text-label-small text-on-surface-variant font-medium">RFP ID</th>
                <th className="px-4 py-2 text-left text-label-small text-on-surface-variant font-medium">상태</th>
                <th className="px-4 py-2 text-left text-label-small text-on-surface-variant font-medium">제출일</th>
              </tr>
            </thead>
            <tbody>
              {bids.map((bid) => (
                <tr key={bid.id} className="border-b border-outline-variant last:border-0 hover:bg-surface-container-low">
                  <td className="px-4 py-3">
                    <Link href={`/admin/rfps/${bid.rfpId}`} className="text-primary hover:underline font-mono text-label-small">
                      {bid.rfpId.slice(0, 8)}…
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <AdminStatusBadge status={bid.status} />
                  </td>
                  <td className="px-4 py-3 font-mono text-label-small text-on-surface-variant">
                    {new Date(bid.submittedAt).toLocaleDateString('ko-KR')}
                  </td>
                </tr>
              ))}
              {bids.length === 0 && (
                <tr><td colSpan={3} className="px-4 py-6 text-center text-on-surface-variant">입찰 없음</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
