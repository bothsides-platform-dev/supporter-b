import { notFound } from 'next/navigation';
import Link from 'next/link';
import { getRfpDetail } from '@/lib/server/queries/admin/rfps';
import { AdminStatusBadge } from '@/components/admin/AdminStatusBadge';
import { extendRfpDeadlineAction } from '@/lib/server/actions/admin/extendRfpDeadlineAction';
import { hideQuoteAction } from '@/lib/server/actions/admin/hideQuoteAction';
import { sendReminderAction } from '@/lib/server/actions/admin/sendReminderAction';

export default async function RfpDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const detail = await getRfpDetail(id);
  if (!detail) notFound();

  const { rfp, bids } = detail;

  async function extendAction(formData: FormData) {
    'use server';
    const days = Number(formData.get('days') ?? 7);
    await extendRfpDeadlineAction(undefined, rfp.id, days);
  }

  async function reminderAction() {
    'use server';
    const allPgWsIds = bids.map((b) => b.pgWsId);
    await sendReminderAction(undefined, rfp.id, allPgWsIds);
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center gap-3">
        <Link
          href="/admin/rfps"
          className="text-on-surface-variant hover:text-on-surface text-body-small"
        >
          ← 목록
        </Link>
        <h1 className="text-headline-small font-semibold">{rfp.title}</h1>
        <AdminStatusBadge status={rfp.status} />
      </div>

      {/* RFP info */}
      <section className="rounded border border-outline-variant">
        <div className="border-b border-outline-variant px-4 py-2 bg-surface-container-low">
          <h2 className="text-title-small font-medium">RFP 정보</h2>
        </div>
        <div className="px-4 py-3 grid grid-cols-2 gap-3 text-body-small">
          <div>
            <span className="text-on-surface-variant">코드</span>
            <span className="ml-3 md-numeric">{rfp.code}</span>
          </div>
          <div>
            <span className="text-on-surface-variant">상태</span>
            <span className="ml-3">
              <AdminStatusBadge status={rfp.status} />
            </span>
          </div>
          <div>
            <span className="text-on-surface-variant">마감</span>
            <span className="ml-3 md-numeric">
              {new Date(rfp.deadline).toLocaleString('ko-KR')}
            </span>
          </div>
          {rfp.sentAt && (
            <div>
              <span className="text-on-surface-variant">발송일</span>
              <span className="ml-3 md-numeric">
                {new Date(rfp.sentAt).toLocaleString('ko-KR')}
              </span>
            </div>
          )}
        </div>
      </section>

      {/* Extend deadline */}
      <section className="rounded border border-outline-variant">
        <div className="border-b border-outline-variant px-4 py-2 bg-surface-container-low">
          <h2 className="text-title-small font-medium">마감 연장</h2>
        </div>
        <form action={extendAction} className="px-4 py-3 flex items-center gap-3">
          <label className="text-body-small text-on-surface-variant">연장 일수</label>
          <input
            name="days"
            type="number"
            min={1}
            max={30}
            defaultValue={7}
            className="w-20 rounded border border-outline px-2 py-1 text-body-small bg-surface md-numeric focus:outline-none focus:ring-1 focus:ring-primary"
          />
          <span className="text-body-small text-on-surface-variant">일</span>
          <button
            type="submit"
            className="rounded bg-primary px-4 py-1.5 text-label-medium text-on-primary hover:bg-primary/90"
          >
            연장
          </button>
        </form>
      </section>

      {/* Bid list */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-title-small font-semibold">견적 목록 ({bids.length}건)</h2>
          {bids.length > 0 && (
            <form action={reminderAction}>
              <button
                type="submit"
                className="rounded border border-outline px-3 py-1.5 text-label-small text-on-surface hover:bg-surface-container-low"
              >
                전체 리마인더 발송
              </button>
            </form>
          )}
        </div>
        <div className="rounded border border-outline-variant overflow-hidden">
          <table className="w-full text-body-small">
            <thead>
              <tr className="border-b border-outline-variant bg-surface-container-low">
                <th className="px-4 py-2 text-left text-label-small text-on-surface-variant font-medium">PG사</th>
                <th className="px-4 py-2 text-left text-label-small text-on-surface-variant font-medium">상태</th>
                <th className="px-4 py-2 text-left text-label-small text-on-surface-variant font-medium">제출일</th>
                <th className="px-4 py-2 text-left text-label-small text-on-surface-variant font-medium">처리</th>
              </tr>
            </thead>
            <tbody>
              {bids.map((bid) => {
                async function hideBidAction(formData: FormData) {
                  'use server';
                  const reason = String(formData.get('reason') ?? '').trim();
                  await hideQuoteAction(undefined, bid.id, reason);
                }

                return (
                  <tr
                    key={bid.id}
                    className="border-b border-outline-variant last:border-0 hover:bg-surface-container-low"
                  >
                    <td className="px-4 py-3">{bid.pgWsName}</td>
                    <td className="px-4 py-3">
                      <AdminStatusBadge status={bid.status} />
                    </td>
                    <td className="px-4 py-3 md-numeric text-label-small text-on-surface-variant">
                      {new Date(bid.submittedAt).toLocaleDateString('ko-KR')}
                    </td>
                    <td className="px-4 py-3">
                      {bid.status === 'submitted' && (
                        <form action={hideBidAction} className="flex items-center gap-2">
                          <input
                            name="reason"
                            type="text"
                            required
                            placeholder="철회 사유"
                            className="rounded border border-outline px-2 py-1 text-body-small bg-surface focus:outline-none focus:ring-1 focus:ring-primary w-40"
                          />
                          <button
                            type="submit"
                            className="rounded border border-error px-2 py-1 text-label-small text-error hover:bg-error-container"
                          >
                            철회
                          </button>
                        </form>
                      )}
                    </td>
                  </tr>
                );
              })}
              {bids.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-on-surface-variant">
                    견적이 없습니다.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
