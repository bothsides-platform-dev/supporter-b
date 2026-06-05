'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Label } from '@/components/primitives/Label';
import { Chip } from '@/components/primitives/Chip';
import { InfoTip } from '@/components/ui/info-tip';
import { Button } from '@/components/primitives/Button';
import { awardRfpAction } from '@/lib/server/actions/rfp';
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

// 선택한 견적 행 라벨 → 용어집 키 (라벨 표기와 키가 다른 것 매핑)
const ROW_INFO_TERM: Record<string, string> = {
  '정산 주기': '정산주기',
  정산한도: '정산한도',
  '월 보증보험': '보증보험',
};

type Props = {
  rfpId: string; // uuid — awardRfpAction용
  rfpCode: string; // P-YYMM-NNNN — 표시/링크용
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
    rfpCode,
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
            ✓ 최종 선택 완료
          </p>
          <h1 className="text-[26px] font-[700] tracking-[-0.02em] text-[var(--md-sys-color-on-surface)]">
            {pgName(selected.pgWsId)} 와의 계약이 확정됐어요
          </h1>
          <p className="mt-2 text-[13px] text-[var(--md-sys-color-on-surface-variant)]">
            선정한 PG와 미선정 PG 모두에게 결과 알림을 보냈어요.
          </p>
        </div>

        <section>
          <div className="flex items-center gap-3 mb-3">
            <Label size="md" muted={false}>보낸 알림</Label>
            <div className="flex-1 h-px bg-[var(--md-sys-color-outline-variant)]" />
          </div>
          <div className="divide-y divide-[var(--md-sys-color-outline-variant)] border-t border-[var(--md-sys-color-outline-variant)]">
            <div className="py-3 flex items-center gap-4">
              <Chip label="선정됨" color="tertiary" />
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
                — 다른 견적 없음 —
              </div>
            )}
          </div>
        </section>

        <div className="space-y-3">
          <Button onClick={() => router.push('/rfp')} fullWidth>
            견적 요청 목록으로 →
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
          {rfpCode} · 최종 선택
        </span>
        <h1 className="mt-1 text-[26px] font-[700] tracking-[-0.02em] text-[var(--md-sys-color-on-surface)]">
          {pgName(selected.pgWsId)}의 견적을 선택할까요?
        </h1>
        <p className="mt-2 text-[13px] text-[var(--md-sys-color-on-surface-variant)]">
          확정하면 선정 PG와 미선정 PG 모두에게 결과를 알리고, 견적 요청이
          마감돼요.
        </p>
      </div>

      {/* Selected bid */}
      <section>
        <div className="flex items-center gap-3 mb-3">
          <Label size="md" muted={false}>선택한 견적</Label>
          <div className="flex-1 h-px bg-[var(--md-sys-color-outline-variant)]" />
        </div>
        <div className="divide-y divide-[var(--md-sys-color-outline-variant)] border-t border-[var(--md-sys-color-outline-variant)]">
          {[
            ['PG사', pgName(selected.pgWsId)],
            [
              '정산 주기',
              SETTLE_LABEL[selected.settleCycle] ?? selected.settleCycle,
            ],
            ['정산한도', formatKRW(selected.settleLimit)],
            ['월 보증보험', formatKRW(selected.guaranteeInsurance)],
            ...(selected.paymentFees.card !== undefined
              ? ([['카드', formatPct(selected.paymentFees.card)]] as [string, string][])
              : []),
            ...(selected.paymentFees.bank_transfer !== undefined
              ? ([['계좌이체', formatPct(selected.paymentFees.bank_transfer)]] as [string, string][])
              : []),
          ].map(([label, value]) => (
            <div key={label} className="py-2.5 flex items-baseline justify-between">
              <span className="inline-flex items-center gap-1 font-mono text-[11px] tracking-[0.1em] uppercase text-[var(--md-sys-color-on-surface-variant)]">
                {label}
                {ROW_INFO_TERM[label] && <InfoTip term={ROW_INFO_TERM[label]} />}
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
            ['받은 견적', `${others.length + 1}건`],
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
              · 견적 요청 상태가 <span className="font-mono">awarded</span>로 바뀌어요
            </li>
            <li>· 미선정 PG {others.length}곳에 결과를 알려요</li>
            <li>· 이후 견적 수정·철회는 할 수 없어요</li>
          </ul>
        </div>
        <div className="flex gap-3">
          <Link href={`/rfp/${rfpCode}`} className="flex-1">
            <Button variant="outlined" fullWidth>
              ← 비교로 돌아가기
            </Button>
          </Link>
          <Button
            onClick={handleAward}
            disabled={submitting}
            className="flex-1"
          >
            {submitting ? '처리 중…' : '선정할게요'}
          </Button>
        </div>
      </section>
    </div>
  );
}
