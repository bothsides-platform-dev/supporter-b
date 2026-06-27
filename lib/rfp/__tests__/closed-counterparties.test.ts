import { describe, it, expect } from 'vitest';

import {
  buyerClosedCounterpartyIds,
  isConversationClosedAfterAward,
} from '../closed-counterparties';
import type { RFP } from '@/lib/types/rfp';
import type { Bid } from '@/lib/types/bid';

// 최소 형태만 — 함수가 읽는 필드(status·awardedBidId / id·pgWsId)만 채운다.
function rfp(partial: Partial<RFP>): RFP {
  return { status: 'sent', ...partial } as RFP;
}
function bid(id: string, pgWsId: string): Bid {
  return { id, pgWsId } as Bid;
}

describe('buyerClosedCounterpartyIds', () => {
  it('선정 전(status!=="awarded")이면 빈 배열', () => {
    const bids = [bid('b1', 'pgA'), bid('b2', 'pgB')];
    expect(buyerClosedCounterpartyIds(rfp({ status: 'sent' }), bids)).toEqual([]);
  });

  it('awarded 라도 awardedBidId 가 없으면 빈 배열', () => {
    const bids = [bid('b1', 'pgA'), bid('b2', 'pgB')];
    expect(
      buyerClosedCounterpartyIds(rfp({ status: 'awarded', awardedBidId: undefined }), bids),
    ).toEqual([]);
  });

  it('선정 후 승자를 제외한 입찰 PG 만 반환', () => {
    const bids = [bid('b1', 'pgA'), bid('b2', 'pgB'), bid('b3', 'pgC')];
    const result = buyerClosedCounterpartyIds(
      rfp({ status: 'awarded', awardedBidId: 'b2' }),
      bids,
    );
    expect(result.sort()).toEqual(['pgA', 'pgC']);
  });

  it('같은 PG 멀티라운드(중복 pgWsId)는 한 번만 반환', () => {
    const bids = [
      bid('b1', 'pgA'),
      bid('b2', 'pgA'), // pgA 재요청 2라운드
      bid('b3', 'pgB'),
    ];
    const result = buyerClosedCounterpartyIds(
      rfp({ status: 'awarded', awardedBidId: 'b3' }),
      bids,
    );
    expect(result).toEqual(['pgA']);
  });

  it('awardedBidId 가 bids 에 없으면(데이터 불일치) 빈 배열 — 닫지 않음', () => {
    const bids = [bid('b1', 'pgA'), bid('b2', 'pgB')];
    expect(
      buyerClosedCounterpartyIds(rfp({ status: 'awarded', awardedBidId: 'missing' }), bids),
    ).toEqual([]);
  });

  it('승자 PG 가 여러 라운드 입찰해도 승자는 절대 닫지 않음', () => {
    const bids = [
      bid('b1', 'pgA'), // 승자 1라운드
      bid('b2', 'pgA'), // 승자 2라운드(awarded)
      bid('b3', 'pgB'),
    ];
    const result = buyerClosedCounterpartyIds(
      rfp({ status: 'awarded', awardedBidId: 'b2' }),
      bids,
    );
    expect(result).toEqual(['pgB']);
  });
});

describe('isConversationClosedAfterAward', () => {
  it('선정 전(status!=="awarded")이면 닫지 않음', () => {
    expect(
      isConversationClosedAfterAward({
        rfpStatus: 'sent',
        awardedBidId: null,
        winnerPgWsId: 'pgWinner',
        pgSideWsId: 'pgLoser',
      }),
    ).toBe(false);
  });

  it('awarded 라도 awardedBidId 가 없으면 닫지 않음', () => {
    expect(
      isConversationClosedAfterAward({
        rfpStatus: 'awarded',
        awardedBidId: null,
        winnerPgWsId: 'pgWinner',
        pgSideWsId: 'pgLoser',
      }),
    ).toBe(false);
  });

  it('승자 bid 를 못 찾으면(winnerPgWsId null) 닫지 않음 — 데이터 불일치 fail-open', () => {
    expect(
      isConversationClosedAfterAward({
        rfpStatus: 'awarded',
        awardedBidId: 'b1',
        winnerPgWsId: null,
        pgSideWsId: 'pgLoser',
      }),
    ).toBe(false);
  });

  it('선정 후 이 대화의 PG 측이 승자가 아니면 닫음', () => {
    expect(
      isConversationClosedAfterAward({
        rfpStatus: 'awarded',
        awardedBidId: 'b1',
        winnerPgWsId: 'pgWinner',
        pgSideWsId: 'pgLoser',
      }),
    ).toBe(true);
  });

  it('선정 후 이 대화의 PG 측이 승자면 닫지 않음', () => {
    expect(
      isConversationClosedAfterAward({
        rfpStatus: 'awarded',
        awardedBidId: 'b1',
        winnerPgWsId: 'pgWinner',
        pgSideWsId: 'pgWinner',
      }),
    ).toBe(false);
  });
});
