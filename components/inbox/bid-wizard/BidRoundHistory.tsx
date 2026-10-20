'use client';

import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import type { Bid } from '@/lib/types/bid';
import type { RFP } from '@/lib/types/rfp';
import { buildSubmittedSummaryRows } from '@/components/inbox/buildSubmittedSummaryRows';
import { LocalTime } from '@/components/primitives/LocalTime';
import { Chip } from '@/components/primitives/Chip';
import { Select } from '@/components/primitives/Select';
import { NEW_TAB_NOTICE } from '@/lib/a11y/link-notice';
import { compareBidRounds, selectBidRounds } from './bid-round-comparison';
import styles from './BidRoundHistory.module.css';

type Props = { rfp: RFP; bids: Bid[]; authorNames: Record<string, string>; pgName?: string };

export function BidRoundHistory({ rfp, bids, authorNames, pgName }: Props) {
  const [selection, setSelection] = useState<{ beforeId?: string; afterId?: string }>({});
  const [showAll, setShowAll] = useState(false);
  const { rounds, before, after } = selectBidRounds(bids, selection);
  if (!after) return null;
  const latestId = rounds.at(-1)!.id;
  const comparison = before ? compareBidRounds(rfp, before, after) : undefined;
  const rows = comparison?.rows.filter(row => showAll || row.changed) ?? [];

  function select(beforeId: string, afterId: string) {
    const next = selectBidRounds(bids, { beforeId, afterId });
    setSelection({ beforeId: next.before?.id, afterId: next.after?.id });
  }

  return (
    <section aria-label="견적 수정 이력" className={styles.history}>
      <header className={styles.heading}>
        <div>
          <h3 className="text-[length:var(--md-typescale-title-medium-size)] font-semibold">견적 수정 이력</h3>
          {pgName && <p className={styles.company}>{pgName}</p>}
        </div>
        <span className={styles.total}>총 <span className="md-numeric">{rounds.length}</span>회차</span>
      </header>
      {before && comparison ? <>
        <div className={styles.selectors}>
          <label className={styles.selector}>
            <span>비교 기준</span>
            <Select ariaLabel="비교 기준" value={before.id}
              options={rounds.filter(bid => bid.round < after.round).map(bid => ({ value: bid.id, label: `${bid.round}회차` }))}
              onChange={id => select(id, after.id)} />
          </label>
          <label className={styles.selector}>
            <span>확인할 견적</span>
            <Select ariaLabel="확인할 견적" value={after.id}
              options={rounds.slice(1).map(bid => ({ value: bid.id, label: `${bid.round}회차${bid.id === latestId ? ' · 최신' : ''}` }))}
              onChange={id => select(before.id, id)} />
          </label>
        </div>
        <div className={styles.toolbar}>
          <p role="status" className="text-[length:var(--md-typescale-body-large-size)] font-semibold">
            {comparison.changedCount > 0
              ? <><span className="md-numeric">{comparison.changedCount}</span>개 항목이 달라졌어요</>
              : '조건이 같아요'}
          </p>
          <div role="group" aria-label="비교 항목 보기" className={styles.viewControls}>
            <button type="button" aria-pressed={!showAll} onClick={() => setShowAll(false)}>
              변경 항목 <span className="md-numeric">{comparison.changedCount}</span>
            </button>
            <button type="button" aria-pressed={showAll} onClick={() => setShowAll(true)}>전체 항목</button>
          </div>
        </div>
        <table className={styles.table} role="table">
          <caption className="sr-only">{before.round}회차와 {after.round}회차 견적 조건 비교</caption>
          <thead role="rowgroup">
            <tr role="row">
              <th scope="col" role="columnheader" className={styles.desktopHeading}>항목</th>
              <th scope="col" role="columnheader"><RoundMeta bid={before} authorNames={authorNames} /></th>
              <th scope="col" role="columnheader" className={styles.afterHeading}><RoundMeta bid={after} authorNames={authorNames} latest={after.id === latestId} /></th>
              <th scope="col" role="columnheader" className={styles.desktopHeading}>변화</th>
            </tr>
          </thead>
          {(['terms', 'fees'] as const).map(group => {
            const groupRows = rows.filter(row => row.group === group);
            if (!groupRows.length) return null;
            return <tbody key={group} role="rowgroup">
              <tr role="row" className={styles.group}><th role="rowheader" scope="rowgroup" colSpan={4}>{group === 'terms' ? '정산·가입 조건' : '결제 수수료'}</th></tr>
              {groupRows.map(row => <tr role="row" key={row.id} className={styles.condition} data-changed={row.changed}>
                <th role="rowheader" scope="row">{row.label}</th>
                <td role="cell" className={styles.before}>
                  <span aria-hidden="true" className={styles.mobileLabel}>이전</span>
                  <span className="md-numeric">{row.before}</span>
                </td>
                <td role="cell" className={styles.after}>
                  <span aria-hidden="true" className={styles.mobileLabel}>이후</span>
                  <span className="md-numeric">{row.after}</span>
                </td>
                <td role="cell" className={styles.delta}>
                  {['변경', '추가', '삭제'].includes(row.delta)
                    ? <Chip label={row.delta} color="primary" />
                    : <span className={row.changed ? 'md-numeric' : undefined}>{row.delta}</span>}
                </td>
              </tr>)}
            </tbody>;
          })}
        </table>
        {!showAll && <p className={styles.hint}>같은 조건은 전체 항목에서 확인할 수 있어요.</p>}
        <RoundDocuments key={`${before.id}:${after.id}`} bids={[before, after]}
          memoChanged={comparison.memoChanged} attachmentsChanged={comparison.attachmentsChanged}
          initiallyOpen={comparison.changedCount === 0 && (comparison.memoChanged || comparison.attachmentsChanged)} />
      </> : <article className={styles.single}>
        <RoundMeta bid={after} authorNames={authorNames} latest />
        <dl>
          {buildSubmittedSummaryRows(rfp, after).slice(4).map(([label, value], index) => (
            <div key={index}><dt>{label}</dt><dd className="md-numeric">{value}</dd></div>
          ))}
        </dl>
        <Documents bid={after} />
      </article>}
    </section>
  );
}

function RoundMeta({ bid, authorNames, latest = false }: { bid: Bid; authorNames: Props['authorNames']; latest?: boolean }) {
  return <div className={styles.roundMeta}>
    <div className={styles.roundTitle}><strong><span className="md-numeric">{bid.round}</span>회차</strong>{latest && <Chip label="최신" color="primary" />}</div>
    <span>{authorNames[bid.id] ?? '담당자'}</span>
    {bid.submittedAt && <time dateTime={bid.submittedAt} className="md-numeric"><LocalTime iso={bid.submittedAt} format="yyyy.MM.dd HH:mm" /></time>}
  </div>;
}

function RoundDocuments({ bids, memoChanged, attachmentsChanged, initiallyOpen }: {
  bids: Bid[]; memoChanged: boolean; attachmentsChanged: boolean; initiallyOpen: boolean;
}) {
  const [open, setOpen] = useState(initiallyOpen);
  return <details className={styles.documents} open={open} onToggle={event => setOpen(event.currentTarget.open)}>
    <summary>
      <ChevronDown aria-hidden="true" size={16} />
      <strong>메모·첨부</strong>
      <span className={styles.documentStatus}>
        {memoChanged && <Chip label="메모 변경" color="primary" />}
        {attachmentsChanged && <Chip label="첨부 변경" color="primary" />}
        {!memoChanged && !attachmentsChanged && '변경 없음'}
      </span>
    </summary>
    <div className={styles.documentRounds}>
      {bids.map(bid => <article key={bid.id} aria-label={`${bid.round}회차 메모·첨부`}>
        <h4><span className="md-numeric">{bid.round}</span>회차</h4>
        <Documents bid={bid} />
      </article>)}
    </div>
  </details>;
}

function Documents({ bid }: { bid: Bid }) {
  return <div className={styles.documentContent}>
    <p className={styles.documentLabel}>메모</p>
    <p className={styles.memo}>{bid.memo || '—'}</p>
    <p className={styles.documentLabel}>첨부</p>
    {bid.proposalPdfs.length ? <ul>
      {bid.proposalPdfs.map(file => <li key={file.id}>
        <a href={file.url} target="_blank" rel="noreferrer">{file.name}<span className="sr-only">{NEW_TAB_NOTICE}</span></a>
      </li>)}
    </ul> : <p>—</p>}
  </div>;
}
