import Link from 'next/link';
import { Button } from '@/components/primitives/Button';
import { ContractStatusChip } from './ContractStatusChip';
import type { ContractDocSummary } from '@/lib/server/rfp-detail-loader';

export type ContractDealCardProps = {
  kind: 'buyer' | 'pg';
  /** rfp-detail-loader 가 채워주는 최신 전자계약 문서 요약. 없으면 아직 미발송. */
  summary: ContractDocSummary | null | undefined;
  rfpCode: string;
};

const cardClass =
  'space-y-2 rounded-[var(--md-sys-shape-small)] border border-[var(--md-sys-color-outline-variant)] p-4';

/** 딜룸 미니 카드 — 전자계약 상태를 요약하고 상세/작성 화면으로 안내한다. */
export function ContractDealCard({ kind, summary, rfpCode }: ContractDealCardProps) {
  if (!summary) {
    // buyer 쪽은 PG 가 계약서를 보내기 전까지 카드 자체를 노출하지 않는다.
    if (kind === 'buyer') return null;
    return (
      <div className={cardClass}>
        <p className="text-[13px] text-[var(--md-sys-color-on-surface-variant)]">
          선정된 견적으로 전자계약서를 보내고 서명을 받아보세요.
        </p>
        <Link href={`/contracts/new?rfp=${rfpCode}`} className="block w-fit">
          <Button size="sm">계약서 보내기</Button>
        </Link>
      </div>
    );
  }

  const linkLabel = kind === 'buyer' && summary.mySignPending ? '계약서 확인·서명' : '계약서 보기';

  return (
    <div className={cardClass}>
      <div className="flex items-center gap-2">
        <span className="md-numeric text-[13px] text-[var(--md-sys-color-on-surface)]">
          {summary.code}
        </span>
        <ContractStatusChip status={summary.status} mySignPending={summary.mySignPending} />
      </div>
      <Link href={`/contracts/${summary.id}`} className="block w-fit">
        <Button size="sm" variant="outlined">
          {linkLabel}
        </Button>
      </Link>
    </div>
  );
}
