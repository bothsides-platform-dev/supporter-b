import { notFound } from 'next/navigation';
import Link from 'next/link';
import { getApplicationDetail } from '@/lib/server/queries/admin/review';
import { approveWorkspaceAction } from '@/lib/server/actions/admin/approveWorkspaceAction';
import { rejectWorkspaceAction } from '@/lib/server/actions/admin/rejectWorkspaceAction';
import { requestMoreInfoAction } from '@/lib/server/actions/admin/requestMoreInfoAction';

export default async function ReviewDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const detail = await getApplicationDetail(id);

  if (!detail) notFound();

  const { application, workspace, pgProfile } = detail;

  async function approveAction() {
    'use server';
    await approveWorkspaceAction(undefined, workspace.id);
  }

  async function rejectAction(formData: FormData) {
    'use server';
    const reason = String(formData.get('reason') ?? '').trim();
    await rejectWorkspaceAction(undefined, workspace.id, reason);
  }

  async function moreInfoAction(formData: FormData) {
    'use server';
    const reason = String(formData.get('reason') ?? '').trim();
    await requestMoreInfoAction(undefined, workspace.id, reason);
  }

  return (
    <div className="space-y-6 p-6 max-w-3xl">
      <div className="flex items-center gap-3">
        <Link href="/admin/review" className="text-on-surface-variant hover:text-on-surface text-body-small">
          ← 목록
        </Link>
        <h1 className="text-headline-small font-semibold">{workspace.name}</h1>
        <span className="text-label-small rounded bg-surface-container px-2 py-0.5">
          {application.orgType === 'buyer' ? '구매사' : 'PG사'}
        </span>
      </div>

      {/* Application Info */}
      <section className="rounded border border-outline-variant">
        <div className="border-b border-outline-variant px-4 py-2 bg-surface-container-low">
          <h2 className="text-title-small font-medium">신청 정보</h2>
        </div>
        <div className="px-4 py-3 grid grid-cols-2 gap-3 text-body-small">
          <div>
            <span className="text-on-surface-variant">신청일</span>
            <span className="ml-3 md-numeric">{new Date(application.submittedAt).toLocaleString('ko-KR')}</span>
          </div>
          <div>
            <span className="text-on-surface-variant">상태</span>
            <span className="ml-3">{application.status}</span>
          </div>
          <div>
            <span className="text-on-surface-variant">워크스페이스 상태</span>
            <span className="ml-3">{workspace.status}</span>
          </div>
        </div>
      </section>

      {/* PG Profile (판매사 only) */}
      {application.orgType === 'pg' && pgProfile && (
        <section className="rounded border border-outline-variant">
          <div className="border-b border-outline-variant px-4 py-2 bg-surface-container-low">
            <h2 className="text-title-small font-medium">PG 프로필</h2>
          </div>
          <div className="px-4 py-3 grid grid-cols-2 gap-3 text-body-small">
            {pgProfile.bizNo && (
              <div>
                <span className="text-on-surface-variant">사업자번호</span>
                <span className="ml-3 md-numeric">{pgProfile.bizNo}</span>
              </div>
            )}
            {pgProfile.slaDays != null && (
              <div>
                <span className="text-on-surface-variant">SLA (일)</span>
                <span className="ml-3 md-numeric">{pgProfile.slaDays}</span>
              </div>
            )}
            {pgProfile.serviceScope?.paymentMethods && (
              <div className="col-span-2">
                <span className="text-on-surface-variant">결제 수단</span>
                <span className="ml-3">{pgProfile.serviceScope.paymentMethods.join(', ')}</span>
              </div>
            )}
            {pgProfile.serviceScope?.industries && (
              <div className="col-span-2">
                <span className="text-on-surface-variant">업종</span>
                <span className="ml-3">{pgProfile.serviceScope.industries.join(', ')}</span>
              </div>
            )}
            {pgProfile.salesContact && (
              <div className="col-span-2">
                <span className="text-on-surface-variant">영업 담당</span>
                <span className="ml-3">
                  {pgProfile.salesContact.name} · {pgProfile.salesContact.email} · {pgProfile.salesContact.phone}
                </span>
              </div>
            )}
          </div>
        </section>
      )}

      {/* Actions */}
      {application.status === 'submitted' && (
        <section className="space-y-4">
          <h2 className="text-title-small font-medium">심사 처리</h2>

          {/* Approve */}
          <form action={approveAction}>
            <button
              type="submit"
              className="rounded bg-primary px-4 py-2 text-label-large text-on-primary hover:bg-primary/90"
            >
              승인
            </button>
          </form>

          {/* Reject */}
          <form action={rejectAction} className="space-y-2">
            <label className="block text-body-small text-on-surface-variant">반려 사유</label>
            <textarea
              name="reason"
              rows={3}
              required
              placeholder="반려 사유를 입력하세요"
              className="w-full rounded border border-outline px-3 py-2 text-body-small bg-surface resize-none focus:outline-none focus:ring-1 focus:ring-primary"
            />
            <button
              type="submit"
              className="rounded border border-error px-4 py-2 text-label-large text-error hover:bg-error-container"
            >
              반려
            </button>
          </form>

          {/* Request More Info */}
          <form action={moreInfoAction} className="space-y-2">
            <label className="block text-body-small text-on-surface-variant">보완 요청 사유</label>
            <textarea
              name="reason"
              rows={3}
              required
              placeholder="요청 사유를 입력하세요"
              className="w-full rounded border border-outline px-3 py-2 text-body-small bg-surface resize-none focus:outline-none focus:ring-1 focus:ring-primary"
            />
            <button
              type="submit"
              className="rounded border border-outline px-4 py-2 text-label-large text-on-surface hover:bg-surface-container-low"
            >
              보완 요청
            </button>
          </form>
        </section>
      )}
    </div>
  );
}
