'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useDemoNavigate } from '@/lib/nav/demo-nav-context';
import type { PgContractState } from '@/lib/signing/pg-contract-action';
import { pgDealRoomLink } from '@/lib/rfp/pg-deal-room-link';
import { pgRequestState } from '@/lib/rfp/pg-request-state';
import { Chip } from '@/components/primitives/Chip';
import { Skeleton } from '@/components/ui/skeleton';
import { formatDateTime, formatKRW } from '@/lib/utils/format';
import { useDealRoomNav } from '@/lib/stores/deal-room-nav';
import type { PgReview } from '@/lib/rfp/pg-matching';
import type { RfpStatus } from '@/lib/types/rfp';
import {
  PAYMENT_METHOD_LABELS,
  type MerchantTier,
  type CustomPaymentMethod,
  type PaymentMethod,
} from '@/lib/types/bid';
import type { PgKanbanStage } from '@/lib/server/pg-kanban';

export type InboxRow = {
  invitationId: string;
  buyerName?: string;
  annualPgVolume?: string;
  receivedAt?: string;
  hasDraft?: boolean;
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

export function InboxList({
  rows,
  onOpenRfp,
  selected,
  compact = false,
}: {
  rows: InboxRow[];
  onOpenRfp?: (rfpId: string, tab?: 'write') => void;
  selected?: string;
  compact?: boolean;
}) {
  const router = useRouter();
  const demoNavigate = useDemoNavigate();
  const setNavOrder = useDealRoomNav((s) => s.setOrder);
  useEffect(() => {
    if (!onOpenRfp)
      setNavOrder(
        '/inbox',
        rows.map((r) => r.rfpId),
      );
  }, [rows, setNavOrder, onOpenRfp]);
  function open(id: string, tab?: 'write') {
    if (onOpenRfp) onOpenRfp(id, tab);
    else if (demoNavigate) demoNavigate(pgDealRoomLink(id, tab));
    else router.push(pgDealRoomLink(id, tab));
  }
  return (
    <div className="overflow-x-auto">
      <table
        aria-label="받은 견적 요청"
        className={`w-full table-fixed border-collapse text-[14px] ${compact ? 'min-w-[360px]' : 'min-w-[900px]'}`}
      >
        <thead className="sticky top-0 z-10 bg-[var(--md-sys-color-surface)] text-left text-[var(--md-sys-color-on-surface-variant)]">
          <tr>
            <th scope="col" className={`px-4 py-3 font-medium ${compact ? 'w-[46%]' : 'w-[25%]'}`}>
              구매사·요청
            </th>
            {!compact && (
              <>
                <th scope="col" className="w-[17%] px-3 font-medium">
                  사업·규모
                </th>
                <th scope="col" className="w-[15%] px-3 font-medium">
                  결제 요구사항
                </th>
              </>
            )}
            <th scope="col" className={`${compact ? 'w-[27%]' : 'w-[20%]'} px-3 font-medium`}>
              진행·다음 할 일
            </th>
            <th scope="col" className="px-3 font-medium">
              응답 마감
            </th>
            {!compact && (
              <th scope="col" className="w-[110px] px-3 font-medium">
                행동
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const state = pgRequestState(row);
            const methods = [
              ...(row.requiredPaymentMethods ?? []).map((m) => PAYMENT_METHOD_LABELS[m]),
              ...(row.customPaymentMethods ?? []).map((m) => m.label),
            ];
            return (
              <tr
                key={row.invitationId}
                aria-selected={selected === row.rfpId}
                className={`border-t border-[var(--md-sys-color-outline-variant)] align-top ${selected === row.rfpId ? 'bg-[var(--md-sys-color-primary-container)]' : 'hover:bg-[var(--md-sys-color-surface-container-low)]'}`}
              >
                <td className="px-4 py-4">
                  <p className="mb-1 truncate font-semibold" title={row.buyerName}>
                    {row.buyerName || '구매사 정보 미제공'}
                  </p>
                  <button
                    type="button"
                    data-inbox-row={row.rfpId}
                    aria-expanded={selected === row.rfpId}
                    onClick={() => open(row.rfpId)}
                    className="min-h-9 w-full break-words text-left text-[var(--md-sys-color-primary)] underline-offset-4 hover:underline focus-visible:outline-2"
                  >
                    {row.rfpTitle}
                  </button>
                  <p className="md-numeric mt-1 text-[13px] text-[var(--md-sys-color-on-surface-variant)]">
                    {row.rfpId}
                    {row.hasDraft && <span className="ml-2 font-sans">내 초안</span>}
                    {selected === row.rfpId && <span className="sr-only">선택됨</span>}
                  </p>
                </td>
                {!compact && (
                  <>
                    <td className="px-3 py-4">
                      <p className="break-words">{row.industryName || '업종 미제공'}</p>
                      <p className="mt-2 text-[13px] text-[var(--md-sys-color-on-surface-variant)]">
                        전년도 연간 PG 거래액
                      </p>
                      <p className="md-numeric">
                        {row.contractType === 'new'
                          ? '해당 없음'
                          : row.annualPgVolume
                            ? /^\d+$/.test(row.annualPgVolume)
                              ? formatKRW(Number(row.annualPgVolume))
                              : row.annualPgVolume
                            : '미제공'}
                      </p>
                      <p className="mt-1 text-[13px]">
                        {row.grade === '—' ? '등급 미정' : row.grade}
                      </p>
                    </td>
                    <td className="px-3 py-4" aria-label="요청 결제수단">
                      <p className="break-words">{methods.slice(0, 2).join(' · ') || '미제공'}</p>
                      {methods.length > 2 && (
                        <p className="mt-1 text-[13px]" title={methods.slice(2).join(' · ')}>
                          외 {methods.length - 2}개
                        </p>
                      )}
                    </td>
                  </>
                )}
                <td className="px-3 py-4">
                  <Chip label={state.label} color={state.color} />
                  <p className="mt-2 text-[13px]">
                    {state.nextActor && `${state.nextActor} · `}
                    {state.nextAction}
                  </p>
                </td>
                <td className="px-3 py-4">
                  <time dateTime={row.rfpDeadline} className="md-numeric block text-[13px]">
                    {formatDateTime(row.rfpDeadline)} KST
                  </time>
                </td>
                {!compact && (
                  <td className="px-3 py-4">
                    <button
                      type="button"
                      onClick={() => open(row.rfpId, state.tab === 'write' ? 'write' : undefined)}
                      className="min-h-9 whitespace-nowrap rounded-[6px] border border-[var(--md-sys-color-outline)] px-2 text-[var(--md-sys-color-primary)] focus-visible:outline-2"
                    >
                      {state.actionLabel}
                    </button>
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
export function InboxListSkeleton() {
  return (
    <div className="space-y-1 p-4">
      {Array.from({ length: 8 }, (_, i) => (
        <Skeleton key={i} className="h-20 rounded-[6px]" />
      ))}
    </div>
  );
}
InboxList.Skeleton = InboxListSkeleton;
