import { describe, it, expect } from 'vitest';
import type { BoardCard, BoardColumn } from '@/lib/types/column';
import { computeValidDropTargets } from '../computeValidDropTargets';

function col(over: Partial<BoardColumn> & { id: string; title: string }): BoardColumn {
  return {
    workspaceId: 'ws',
    kind: 'pipeline',
    position: 'a1',
    color: null,
    lifecycleKey: null,
    ...over,
  };
}

const activeCol = col({ id: 'c-active', title: '진행중', lifecycleKey: 'active' });
const awardedCol = col({ id: 'c-awarded', title: '선정 완료', lifecycleKey: 'awarded' });
const closedCol = col({ id: 'c-closed', title: '마감', lifecycleKey: 'closed' });
const customCol = col({ id: 'c-hold', title: '보류' });
const columns = [activeCol, awardedCol, closedCol, customCol];

function rfpCard(stage: string, columnId: string): BoardCard {
  return {
    cardType: 'rfp',
    cardId: 'r1',
    columnId,
    payload: { rfpId: 'P-2605-0001', title: 'T', stage },
  };
}

describe('computeValidDropTargets', () => {
  it('active 카드: awarded(이동)·closed(취소)·커스텀(배치) 모두 유효', () => {
    const set = computeValidDropTargets({
      card: rfpCard('active', 'c-active'),
      columns,
      cardType: 'rfp',
      currentColumnId: 'c-active',
    });
    expect(set.has('c-awarded')).toBe(true);
    expect(set.has('c-closed')).toBe(true);
    expect(set.has('c-hold')).toBe(true);
  });

  it('원래 컬럼은 dim 대상이 아니다 (set 에 포함)', () => {
    const set = computeValidDropTargets({
      card: rfpCard('active', 'c-active'),
      columns,
      cardType: 'rfp',
      currentColumnId: 'c-active',
    });
    expect(set.has('c-active')).toBe(true);
  });

  it('awarded 카드: closed 로의 전이는 무효, 커스텀 배치만 유효', () => {
    const set = computeValidDropTargets({
      card: rfpCard('awarded', 'c-awarded'),
      columns,
      cardType: 'rfp',
      currentColumnId: 'c-awarded',
    });
    expect(set.has('c-closed')).toBe(false);
    expect(set.has('c-active')).toBe(false);
    expect(set.has('c-hold')).toBe(true);
  });

  it('pg received 카드: submitted 컬럼은 무효(드래그 제출 금지)', () => {
    const pgColumns = [
      col({ id: 'p-received', title: '신규', lifecycleKey: 'received' }),
      col({ id: 'p-submitted', title: '견적 보냄', lifecycleKey: 'submitted' }),
    ];
    const set = computeValidDropTargets({
      card: {
        cardType: 'invitation',
        cardId: 'i1',
        columnId: 'p-received',
        payload: { rfpId: 'P-2605-0002', title: 'T', stage: 'received' },
      },
      columns: pgColumns,
      cardType: 'invitation',
      currentColumnId: 'p-received',
    });
    expect(set.has('p-submitted')).toBe(false);
  });
});
