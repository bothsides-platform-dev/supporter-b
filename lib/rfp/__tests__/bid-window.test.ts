import { describe, expect, it } from 'vitest';

import {
  isPgBidWindowOpen,
  isRfpBidWindowOpen,
  resolveBidSubmissionRound,
} from '../bid-window';

const NOW = Date.parse('2026-09-14T00:00:00.000Z');

describe('isRfpBidWindowOpen', () => {
  it('sent 상태이고 마감이 남았을 때만 신규 견적을 받는다', () => {
    expect(
      isRfpBidWindowOpen(
        { status: 'sent', deadline: '2026-09-14T00:00:01.000Z' },
        NOW,
      ),
    ).toBe(true);
    expect(
      isRfpBidWindowOpen(
        { status: 'closed', deadline: '2026-09-14T00:00:01.000Z' },
        NOW,
      ),
    ).toBe(false);
  });

  it('마감 시각과 같거나 이미 지났으면 닫힌다', () => {
    expect(
      isRfpBidWindowOpen(
        { status: 'sent', deadline: '2026-09-14T00:00:00.000Z' },
        NOW,
      ),
    ).toBe(false);
    expect(
      isRfpBidWindowOpen(
        { status: 'sent', deadline: '2026-09-13T23:59:59.999Z' },
        NOW,
      ),
    ).toBe(false);
  });
});

describe('isPgBidWindowOpen', () => {
  it('재요청이 없으면 원 요청 마감을 사용한다', () => {
    expect(
      isPgBidWindowOpen(
        { status: 'sent', deadline: '2026-09-14T00:00:01.000Z' },
        undefined,
        NOW,
      ),
    ).toBe(true);
  });

  it('재요청이 있으면 원 요청이 마감됐어도 재요청 마감까지 응답을 받는다', () => {
    expect(
      isPgBidWindowOpen(
        { status: 'sent', deadline: '2026-09-13T23:59:59.999Z' },
        '2026-09-14T00:00:01.000Z',
        NOW,
      ),
    ).toBe(true);
  });

  it('재요청 마감이 지나면 원 요청 마감이 남아도 응답을 닫는다', () => {
    expect(
      isPgBidWindowOpen(
        { status: 'sent', deadline: '2026-09-14T00:00:01.000Z' },
        '2026-09-14T00:00:00.000Z',
        NOW,
      ),
    ).toBe(false);
  });
});

describe('resolveBidSubmissionRound', () => {
  const rfp = { status: 'sent' as const, deadline: '2026-09-14T00:00:01.000Z' };

  it('첫 제출은 원 요청 마감 안에서 1라운드를 연다', () => {
    expect(resolveBidSubmissionRound({ rfp, maxRound: 0, nowMs: NOW })).toEqual({
      ok: true,
      round: 1,
    });
  });

  it('기존 견적이 있으면 유효한 재요청 마감 안에서 다음 라운드를 연다', () => {
    expect(
      resolveBidSubmissionRound({
        rfp,
        maxRound: 2,
        pendingRequoteDeadline: '2026-09-14T00:00:01.000Z',
        nowMs: NOW,
      }),
    ).toEqual({ ok: true, round: 3 });
  });

  it('기존 견적에 pending 재요청이 없으면 중복 제출로 거부한다', () => {
    expect(resolveBidSubmissionRound({ rfp, maxRound: 1, nowMs: NOW })).toEqual({
      ok: false,
      error: 'BID_ALREADY_SUBMITTED',
    });
  });

  it('첫 제출과 재요청 응답의 경계 시각을 각 오류로 구분한다', () => {
    expect(
      resolveBidSubmissionRound({
        rfp: { ...rfp, deadline: '2026-09-14T00:00:00.000Z' },
        maxRound: 0,
        nowMs: NOW,
      }),
    ).toEqual({ ok: false, error: 'RFP_NOT_OPEN' });
    expect(
      resolveBidSubmissionRound({
        rfp,
        maxRound: 1,
        pendingRequoteDeadline: '2026-09-14T00:00:00.000Z',
        nowMs: NOW,
      }),
    ).toEqual({ ok: false, error: 'REQUOTE_DEADLINE_PASSED' });
  });
});
