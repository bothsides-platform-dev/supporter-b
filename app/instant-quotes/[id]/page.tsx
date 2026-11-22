import Link from 'next/link';
import { notFound } from 'next/navigation';
import { z } from 'zod';
import { instantViewer } from '@/lib/server/instant-viewer';
import { loadInstant, instantDb } from '@/lib/server/services/instant-quotes';
import {
  instantSigning,
  issuedMail,
} from '@/lib/server/repositories/drizzle/instant-inbox';
import { InstantTerms } from '@/components/rfp/InstantTerms';
import { InstantBuyerActions } from '@/components/rfp/InstantBuyerActions';
import { InstantSelection } from '@/components/rfp/InstantSelection';
import { PlatformAgreementPanel } from '@/components/deal-room/signing/PlatformAgreementPanel';
import { MERCHANT_TIER_LABELS } from '@/lib/types/bid';
const date = (d: Date) => d.toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' });
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const v = await instantViewer().catch(() => null);
  if (!v) notFound();
  const db = await instantDb(),
    row = await loadInstant(db, id);
  if (
    !row ||
    (v.pg
      ? row.a.pgId !== v.actor.workspaceId
      : row.r.buyerId !== v.actor.workspaceId ||
        row.r.creator !== v.actor.userId)
  )
    notFound();
  const { a, r } = row,
    signing =
      !v.pg && v.active && a.selectedAt
        ? await instantSigning(db, id)
        : undefined;
  const mail = await issuedMail(db, id);
  const enrolled = !!a.buyerEnrolledAt || a.decision === 'approved';
  return (
    <main className="mx-auto max-w-3xl space-y-6 px-5 py-10">
      <Link href="/instant-quotes">신청 목록</Link>
      <h1 className="text-2xl font-semibold">{a.terms.pgName} 가입 견적</h1>
      <p className="break-all">{a.code}</p>
      <p>가입 신청 기한 {date(a.validUntil)}</p>
      {v.pg && (
        <p>
          {a.applicant.company} · {r.input.products}
        </p>
      )}
      <dl className="space-y-2">
        <div className="flex justify-between">
          <dt>PG 안내 메일 발송</dt>
          <dd>
            {mail?.sentAt
              ? date(mail.sentAt)
              : mail?.status === 'failed'
                ? '발송 실패'
                : '발송 대기'}
          </dd>
        </div>
        {[
          ['메일 수신 확인', a.ackAt],
          ['PG 외부 접수 확인', a.appliedAt],
          ['구매사 신청 완료 회신', a.buyerAppliedAt],
          ['구매사 가입 완료 회신', a.buyerEnrolledAt],
        ].map(([label, value]) => (
          <div key={String(label)} className="flex justify-between">
            <dt>{String(label)}</dt>
            <dd>{value instanceof Date ? date(value) : '확인 전'}</dd>
          </div>
        ))}
      </dl>
      <p>
        {a.decision === 'declined'
          ? 'PG가 가입을 거절했어요.'
          : a.tier
            ? 'PG 확인 등급 · ' + MERCHANT_TIER_LABELS[a.tier]
            : 'PG 심사 결과를 기다리고 있어요.'}
      </p>
      <InstantTerms terms={a.terms} input={r.input} tier={a.tier} confirmed />
      {!v.pg &&
        !a.closedAt &&
        (a.decision === 'declined' ? (
          row.canRetry ? (
            <InstantSelection
              draftKey={r.requestKey}
              input={r.input}
              previous={id}
              loggedIn
              initialScreen={a.screening}
            />
          ) : (
            <p>재신청 기한이 지났어요.</p>
          )
        ) : (
          <InstantBuyerActions
            id={id}
            state={{
              canVisit: row.canVisit,
              applied: !!(a.appliedAt || a.buyerAppliedAt),
              enrolled,
              tier: !!a.tier,
              selected: !!a.selectedAt,
              approved: v.active,
              checked: !!a.checkedAt,
            }}
          />
        ))}
      {!v.pg && a.checkedAt && (
        <p>
          {a.differs ? '정정 요청 · ' + a.reported : '견적대로 적용됐어요.'}{' '}
          {a.resolvedAt && '처리 결과 · ' + a.resolution}
        </p>
      )}
      {signing && <PlatformAgreementPanel signing={{ contract: signing }} />}
    </main>
  );
}
