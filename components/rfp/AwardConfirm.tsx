'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Label } from '@/components/primitives/Label';
import { Chip } from '@/components/primitives/Chip';
import { Button } from '@/components/primitives/Button';
import { awardRfpAction } from '@/lib/server/actions/rfp';
import { STATUTORY_CARD_FEE } from '@/lib/types/bid';
import {
  formatKRW,
  formatPct,
  formatDate,
} from '@/lib/format';
import type { Bid } from '@/lib/types/bid';
import { GRADE_LABELS, type MerchantGrade } from '@/lib/types/biz-profile';

const SETTLE_LABEL: Record<string, string> = {
  'D+0': 'D+0 (당일)',
  'D+1': 'D+1 (익일)',
  'D+2': 'D+2 (2영업일)',
  weekly: '주 1회',
  monthly: '월 1회',
};

type Props = {
  rfpId: string;
  rfpDeadline: string;
  rfpAllowedCount: number;
  bizProfile: {
    bizNo?: string;
    grade?: MerchantGrade;
  };
  buyerWorkspaceName: string;
  selected: Bid;
  others: Bid[];
  pgWsNameById: Record<string, string>;
  alreadyAwarded: boolean;
};

export function AwardConfirm(props: Props) {
  const {
    rfpId,
    rfpDeadline,
    rfpAllowedCount,
    bizProfile,
    buyerWorkspaceName,
    selected,
    others,
    pgWsNameById,
    alreadyAwarded,
  } = props;
  const router = useRouter();
  const [confirmed, setConfirmed] = useState(alreadyAwarded);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const grade = bizProfile.grade;
  const cardFee = grade && grade !== 'general' ? STATUTORY_CARD_FEE[grade] : null;

  const pgName = (wsId: string) => pgWsNameById[wsId] ?? wsId;

  const handleAward = async () => {
    if (submitting || confirmed) return;
    setSubmitting(true);
    setError('');
    const r = await awardRfpAction({ rfpId, awardedBidId: selected.id });
    setSubmitting(false);
    if (!r.ok) {
      setError(r.error);
      return;
    }
    setConfirmed(true);
  };

  if (confirmed) {
    return (
      <div className="px-8 py-8 space-y-10">
        <div>
          <p className="font-mono text-[11px] tracking-[0.16em] uppercase text-[var(--md-sys-color-tertiary)] mb-3">
            ✓ 수주 확정
          </p>
          <h1 className="text-[26px] font-[700] tracking-[-0.02em] text-[var(--md-sys-color-on-surface)]">
            {pgName(selected.pgWsId)} 와의 계약이 확정되었습니다
          </h1>
          <p className="mt-2 text-[13px] text-[var(--md-sys-color-on-surface-variant)]">
            선정된 PG와 미선정 PG 모두에게 결과 알림이 발송됩니다.
          </p>
        </div>

        <section>
          <div className="flex items-center gap-3 mb-3">
            <Label size="md" muted={false}>발송 알림</Label>
            <div className="flex-1 h-px bg-[var(--md-sys-color-outline-variant)]" />
          </div>
          <div className="divide-y divide-[var(--md-sys-color-outline-variant)] border-t border-[var(--md-sys-color-outline-variant)]">
            <div className="py-3 flex items-center gap-4">
              <Chip label="선정" color="tertiary" />
              <span className="text-[13px] text-[var(--md-sys-color-on-surface)]">
                {pgName(selected.pgWsId)}
              </span>
              <span className="ml-auto font-mono text-[11px] tabular-nums text-[var(--md-sys-color-on-surface-variant)]">
                계약 진행 안내
              </span>
            </div>
            {others.map((b) => (
              <div key={b.id} className="py-3 flex items-center gap-4">
                <Chip label="미선정" color="surface" />
                <span className="text-[13px] text-[var(--md-sys-color-on-surface)]">
                  {pgName(b.pgWsId)}
                </span>
                <span className="ml-auto font-mono text-[11px] tabular-nums text-[var(--md-sys-color-on-surface-variant)]">
                  결과 안내
                </span>
              </div>
            ))}
            {others.length === 0 && (
              <div className="py-3 font-mono text-[11px] tracking-[0.1em] uppercase text-[var(--md-sys-color-outline)]">
                — 다른 응답 제안 없음 —
              </div>
            )}
          </div>
        </section>

        <div className="space-y-3">
          <Button onClick={() => router.push('/rfp')} fullWidth>
            RFP 목록으로 →
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="px-8 py-8 space-y-10">
      {/* Header */}
      <div>
        <span className="font-mono text-[11px] tabular-nums text-[var(--md-sys-color-on-surface-variant)]">
          {rfpId} · 수주 처리
        </span>
        <h1 className="mt-1 text-[26px] font-[700] tracking-[-0.02em] text-[var(--md-sys-color-on-surface)]">
          {pgName(selected.pgWsId)} 제안을 선택하시겠습니까?
        </h1>
        <p className="mt-2 text-[13px] text-[var(--md-sys-color-on-surface-variant)]">
          확정 시 선정 PG와 미선정 PG 모두에게 결과가 통지되며, RFP가 마감
          처리됩니다.
        </p>
      </div>

      {/* Selected bid */}
      <section>
        <div className="flex items-center gap-3 mb-3">
          <Label size="md" muted={false}>선택 제안</Label>
          <div className="flex-1 h-px bg-[var(--md-sys-color-outline-variant)]" />
        </div>
        <div className="divide-y divide-[var(--md-sys-color-outline-variant)] border-t border-[var(--md-sys-color-outline-variant)]">
          {[
            ['PG사', pgName(selected.pgWsId)],
            [
              '정산 주기',
              SETTLE_LABEL[selected.settleCycle] ?? selected.settleCycle,
            ],
            ['보증금', formatKRW(selected.deposit)],
            ['셋업비', formatKRW(selected.setupFee)],
            ['월최저수수료', formatKRW(selected.monthlyMin)],
            ...(cardFee !== null
              ? ([['카드 (법정)', formatPct(cardFee)]] as [string, string][])
              : []),
            ['계좌이체', formatPct(selected.bankTransferFeePct)],
            ['간편결제', formatPct(selected.easyPayFeePct)],
          ].map(([label, value]) => (
            <div key={label} className="py-2.5 flex items-baseline justify-between">
              <span className="font-mono text-[11px] tracking-[0.1em] uppercase text-[var(--md-sys-color-on-surface-variant)]">
                {label}
              </span>
              <span className="font-mono text-[13px] tabular-nums text-[var(--md-sys-color-on-surface)]">
                {value}
              </span>
            </div>
          ))}
        </div>
        {selected.memo && (
          <div className="mt-4 p-4 bg-[var(--md-sys-color-surface-container-high)] border-l-2 border-[var(--md-sys-color-outline)]">
            <p className="font-mono text-[10px] tracking-[0.16em] uppercase text-[var(--md-sys-color-on-surface-variant)] mb-2">
              PG 메모
            </p>
            <p className="text-[13px] text-[var(--md-sys-color-on-surface-variant)] leading-relaxed whitespace-pre-wrap">
              {selected.memo}
            </p>
          </div>
        )}
      </section>

      {/* Buyer / RFP context */}
      <section>
        <div className="flex items-center gap-3 mb-3">
          <Label size="md" muted={false}>계약 조건</Label>
          <div className="flex-1 h-px bg-[var(--md-sys-color-outline-variant)]" />
        </div>
        <div className="divide-y divide-[var(--md-sys-color-outline-variant)] border-t border-[var(--md-sys-color-outline-variant)]">
          {[
            ['구매사', buyerWorkspaceName],
            ['사업자번호', bizProfile.bizNo ?? '미입력'],
            ['등급', grade ? GRADE_LABELS[grade] : '—'],
            ['마감', formatDate(rfpDeadline)],
            ['초대 PG', `${rfpAllowedCount}개사`],
            ['응답 제안', `${others.length + 1}건`],
          ].map(([label, value]) => (
            <div key={label} className="py-2.5 flex items-baseline justify-between">
              <span className="font-mono text-[11px] tracking-[0.1em] uppercase text-[var(--md-sys-color-on-surface-variant)]">
                {label}
              </span>
              <span className="text-[13px] text-[var(--md-sys-color-on-surface)]">{value}</span>
            </div>
          ))}
        </div>
      </section>

      {error && (
        <p
          role="alert"
          className="font-mono text-[10px] tracking-[0.12em] uppercase text-[var(--md-sys-color-error)]"
        >
          처리 실패 — {error}
        </p>
      )}

      {/* Confirm action */}
      <section className="border-t border-[var(--md-sys-color-outline-variant)] pt-6 space-y-4">
        <div className="bg-[var(--md-sys-color-surface-container-high)] border border-[var(--md-sys-color-outline-variant)] p-4">
          <p className="font-mono text-[10px] tracking-[0.16em] uppercase text-[var(--md-sys-color-on-surface-variant)] mb-2">
            확정 후 처리
          </p>
          <ul className="space-y-1.5 text-[12px] text-[var(--md-sys-color-on-surface-variant)]">
            <li>
              · RFP 상태가 <span className="font-mono">awarded</span>로 전환됩니다
            </li>
            <li>· 미선정 PG {others.length}곳에 결과가 통지됩니다</li>
            <li>· 이후 제안 수정·철회는 불가합니다</li>
          </ul>
        </div>
        <div className="flex gap-3">
          <Link href={`/rfp/${rfpId}`} className="flex-1">
            <Button variant="outlined" fullWidth>
              ← 비교로 돌아가기
            </Button>
          </Link>
          <Button
            onClick={handleAward}
            disabled={submitting}
            className="flex-1"
          >
            {submitting ? '처리 중…' : '수주 확정'}
          </Button>
        </div>
      </section>
    </div>
  );
}
