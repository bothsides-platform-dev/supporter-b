'use client';

import { useEffect, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useDemoNavigate } from '@/lib/nav/demo-nav-context';
import type { PgContractState } from '@/lib/signing/pg-contract-action';
import { pgDealRoomLink } from '@/lib/rfp/pg-deal-room-link';
import { pgRequestState } from '@/lib/rfp/pg-request-state';
import { Chip } from '@/components/primitives/Chip';
import { Skeleton } from '@/components/ui/skeleton';
import { formatDateTime } from '@/lib/utils/format';
import { useListNavigation } from '@/lib/hooks/useListNavigation';
import { useDealRoomNav } from '@/lib/stores/deal-room-nav';
import type { PgReview } from '@/lib/rfp/pg-matching';
import type { RfpStatus } from '@/lib/types/rfp';
import { PAYMENT_METHOD_LABELS, type MerchantTier, type CustomPaymentMethod, type PaymentMethod } from '@/lib/types/bid';
import type { PgKanbanStage } from '@/lib/server/pg-kanban';
import { CONTRACT_TYPE_LABELS, CONTRACT_TYPE_COLOR } from '@/lib/types/rfp';

export type InboxRow = {
  invitationId: string;
  buyerName?: string;
  industryName?: string;
  requiredPaymentMethods?: PaymentMethod[];
  customPaymentMethods?: CustomPaymentMethod[];
  reviewStatus?: PgReview['status'];
  rfpStatus?: RfpStatus;
  contractState?: PgContractState;
  /** Bid-aware PG kanban stage (classifyPgInvitation) — 필터·칩·행동의 단일 기준. */
  stage: PgKanbanStage;
  /** 제출된 bid id (있으면 "보낸 견적" 링크 노출). received 단계는 비어 있음. */
  bidId?: string;
  rfpId: string;
  rfpTitle: string;
  rfpDeadline: string;
  grade: string;
  /** Raw merchant-grade enum for the grade filter (label lives in `grade`). */
  gradeRaw?: MerchantTier;
  /** 계약 유형. null이면 미표시. */
  contractType?: 'new' | 'renewal' | null;
  /** 이 PG에 대해 pending 재요청이 있으면 true — 재요청 Chip 표시 트리거. */
  hasPendingRequote?: boolean;
  /** 실제 접수 기간이 열려 있는지. 데모 호출자를 위해 생략은 true로 본다. */
  bidWindowOpen?: boolean;
};

export function InboxList({ rows, onOpenRfp }: {
  rows: InboxRow[];
  onOpenRfp?: (rfpId: string, tab?: 'write') => void;
}) {
  const router = useRouter();
  const demoNavigate = useDemoNavigate();
  const rowRefs = useRef<Array<HTMLLIElement | null>>([]);
  const setNavOrder = useDealRoomNav(s => s.setOrder);
  useEffect(() => { setNavOrder('/inbox', rows.map(r => r.rfpId)); }, [rows, setNavOrder]);
  function open(rfpId: string, tab?: 'write') {
    if (onOpenRfp) {
      if (tab) onOpenRfp(rfpId, tab);
      else onOpenRfp(rfpId);
    } else if (demoNavigate) demoNavigate(pgDealRoomLink(rfpId, tab));
    else router.push(pgDealRoomLink(rfpId, tab));
  }
  const { active } = useListNavigation(rows.length, {
    onEnter: i => open(rows[i].rfpId),
    onEdit: i => open(rows[i].rfpId, 'write'),
  });
  useEffect(() => { rowRefs.current[active]?.scrollIntoView({ block: 'nearest' }); }, [active]);

  return (
    <ul aria-label="받은 견적 요청" className="flex flex-col gap-3 p-4 sm:p-6">
      {rows.map((row, i) => {
        const state = pgRequestState(row);
        const tab = state.tab === 'write' ? 'write' : undefined;
        return (
          <li key={row.invitationId} ref={el => { rowRefs.current[i] = el; }} data-active={active === i}
            className="min-w-0 rounded-[6px] border border-[var(--md-sys-color-outline-variant)] p-4 transition-colors data-[active=true]:bg-[var(--md-sys-color-surface-container-low)]">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <span className="min-w-0 break-words text-[14px] font-semibold">{row.buyerName || '구매사 정보 미제공'}</span>
              <span className="md-numeric text-[12px] text-[var(--md-sys-color-on-surface-variant)]">{row.rfpId}</span>
              <Chip label={state.label} color={state.color} />
            </div>
            <button type="button" onClick={() => open(row.rfpId)} className="text-left text-[16px] font-semibold break-words hover:text-[var(--md-sys-color-primary)] focus-visible:outline-2 focus-visible:outline-[var(--md-sys-color-primary)]">
              {row.rfpTitle}
            </button>
            <div className="mt-3 flex flex-wrap items-center gap-2 text-[14px] text-[var(--md-sys-color-on-surface-variant)]">
              <span>{row.industryName || '업종 미제공'}</span>
              {row.contractType && <Chip label={CONTRACT_TYPE_LABELS[row.contractType]} color={CONTRACT_TYPE_COLOR[row.contractType]} />}
              <span>가맹점 등급 {row.grade === '—' ? '미정' : row.grade}</span>
            </div>
            <div aria-label="요청 결제수단" className="mt-3 flex flex-wrap gap-1.5">
              {(row.requiredPaymentMethods ?? []).map(method => <Chip key={method} label={PAYMENT_METHOD_LABELS[method]} color="surface" />)}
              {(row.customPaymentMethods ?? []).map(method => <Chip key={method.id} label={method.label} color="surface" className="h-auto min-h-6 max-w-full break-words py-1 [&>span]:min-w-0" />)}
              {!row.requiredPaymentMethods?.length && !row.customPaymentMethods?.length && <span className="text-[13px] text-[var(--md-sys-color-on-surface-variant)]">결제수단 미제공</span>}
            </div>
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-[var(--md-sys-color-outline-variant)] pt-3">
              <p className="text-[13px] text-[var(--md-sys-color-on-surface-variant)]">
                응답 마감 <time dateTime={row.rfpDeadline} className="md-numeric">{formatDateTime(row.rfpDeadline)} KST</time>
              </p>
              <Link href={pgDealRoomLink(row.rfpId, tab)} onClick={e => { if (onOpenRfp || demoNavigate) { e.preventDefault(); open(row.rfpId, tab); } }}
                className={`inline-flex min-h-11 items-center justify-center rounded-[6px] px-4 py-2 text-[14px] font-medium transition-colors sm:min-h-8 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--md-sys-color-primary)] ${state.needsResponse ? 'bg-[var(--md-sys-color-primary)] text-[var(--md-sys-color-on-primary)] hover:bg-[var(--md-sys-color-primary)]/90' : 'text-[var(--md-sys-color-primary)] hover:bg-[var(--md-sys-color-surface-container)]'}`}>
                {state.actionLabel}
              </Link>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

export function InboxListSkeleton() {
  return <div className="space-y-3 p-6">{Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-48 rounded-[6px]" />)}</div>;
}
InboxList.Skeleton = InboxListSkeleton;
