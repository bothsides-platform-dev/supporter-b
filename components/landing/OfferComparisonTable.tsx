import { Chip, type ChipColor } from '@/components/primitives/Chip';

// 정적 예시 비교표 — 기존 'LiveBidSimulation'(스크롤 구동·토스트)을 대체한다.
// 실제 견적이 아닌 표현용 예시값. 다수 PG사의 조건을 한 화면에서 비교하는 현실적인
// B2B 뷰를 보여주되, AI 챗/결과 느낌을 배제한다.

type Status = { label: string; color: ChipColor };

type Offer = {
  pg: string;
  fee: string;
  settlement: string;
  guarantee: string;
  joinFee: string;
  approval: Status;
  negotiable: Status;
  recommended?: boolean;
};

const COLUMNS = [
  'PG사',
  '수수료',
  '정산주기',
  '보증보험',
  '가입비',
  '승인 상태',
  '협의 가능 여부',
] as const;

const OFFERS: Offer[] = [
  {
    pg: 'PG A',
    fee: '1.85%',
    settlement: 'D+1',
    guarantee: '면제',
    joinFee: '면제',
    approval: { label: '승인 가능', color: 'tertiary' },
    negotiable: { label: '가능', color: 'tertiary' },
    recommended: true,
  },
  {
    pg: 'PG B',
    fee: '1.95%',
    settlement: 'D+1',
    guarantee: '1천만원',
    joinFee: '면제',
    approval: { label: '검토중', color: 'warning' },
    negotiable: { label: '가능', color: 'tertiary' },
  },
  {
    pg: 'PG C',
    fee: '2.10%',
    settlement: 'D+2',
    guarantee: '면제',
    joinFee: '10만원',
    approval: { label: '승인 가능', color: 'tertiary' },
    negotiable: { label: '제한', color: 'surface' },
  },
];

const headCls =
  'px-[var(--s-4)] py-[var(--s-3)] text-left font-mono text-[var(--text-2xs)] tracking-[0.12em] uppercase text-[var(--md-sys-color-on-surface-variant)] whitespace-nowrap';
const cellCls =
  'px-[var(--s-4)] py-[var(--s-4)] align-middle border-t border-[var(--md-sys-color-outline-variant)] whitespace-nowrap';
const numCls = 'md-numeric text-[var(--text-base)] text-[var(--md-sys-color-on-surface)]';

export function OfferComparisonTable() {
  return (
    <div className="flex flex-col gap-[var(--s-3)]">
      <div className="overflow-x-auto rounded-md border border-[var(--md-sys-color-outline-variant)]">
        <table className="w-full min-w-[680px] border-collapse text-left">
          <thead className="bg-[var(--md-sys-color-surface-container-low)]">
            <tr>
              {COLUMNS.map((col) => (
                <th key={col} scope="col" className={headCls}>
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {OFFERS.map((o) => (
              <tr
                key={o.pg}
                className={
                  o.recommended
                    ? 'relative bg-[var(--md-sys-color-tertiary-container)]/30'
                    : undefined
                }
              >
                <td className={cellCls}>
                  <div className="flex items-center gap-2">
                    {o.recommended && (
                      <span
                        aria-hidden
                        className="inline-block h-3.5 w-0.5 rounded-full bg-[var(--md-sys-color-tertiary)]"
                      />
                    )}
                    <span className="text-[var(--text-base)] font-medium text-[var(--md-sys-color-on-surface)]">
                      {o.pg}
                    </span>
                    {o.recommended && <Chip label="추천" color="tertiary" />}
                  </div>
                </td>
                <td className={`${cellCls} ${numCls}`}>{o.fee}</td>
                <td className={`${cellCls} ${numCls}`}>{o.settlement}</td>
                <td className={`${cellCls} text-[var(--text-sm)] text-[var(--md-sys-color-on-surface-variant)]`}>
                  {o.guarantee}
                </td>
                <td className={`${cellCls} text-[var(--text-sm)] text-[var(--md-sys-color-on-surface-variant)]`}>
                  {o.joinFee}
                </td>
                <td className={cellCls}>
                  <Chip label={o.approval.label} color={o.approval.color} />
                </td>
                <td className={cellCls}>
                  <Chip label={o.negotiable.label} color={o.negotiable.color} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="font-mono text-[var(--text-2xs)] tracking-[0.04em] text-[var(--md-sys-color-on-surface-variant)]">
        * 표시 값은 이해를 돕기 위한 예시이며, 실제 견적은 PG사·조건에 따라 달라집니다.
      </p>
    </div>
  );
}
