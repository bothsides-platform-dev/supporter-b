// rfp-status — 견적 상태/요청 칩의 단일 출처. 정식 페이지 + @modal 인터셉트 + 목록표가
// 공유한다. 라벨·색이 드리프트하지 않도록 값을 잠근다.

import { describe, expect, it } from 'vitest';

import { RFP_STATUS_CHIP, rfpStatusChip, pgRequestChip } from '../rfp-status';

describe('RFP_STATUS_CHIP', () => {
  it('5개 RfpStatus 를 모두 매핑한다 (라벨/색)', () => {
    expect(RFP_STATUS_CHIP).toEqual({
      draft: { label: '임시저장', color: 'surface' },
      sent: { label: '요청 보냄', color: 'warning' },
      closed: { label: '미선정', color: 'surface' },
      awarded: { label: '선정완료', color: 'tertiary' },
      cancelled: { label: '취소', color: 'error' },
    });
  });
});

describe('rfpStatusChip', () => {
  it('알려진 상태는 라벨/색을 돌려준다', () => {
    expect(rfpStatusChip('sent')).toEqual({ label: '요청 보냄', color: 'warning' });
    expect(rfpStatusChip('awarded')).toEqual({ label: '선정완료', color: 'tertiary' });
  });

  it('알 수 없는 상태는 undefined 다 (호출처가 칩을 렌더하지 않도록)', () => {
    expect(rfpStatusChip('bogus')).toBeUndefined();
  });
});

describe('pgRequestChip', () => {
  it('재요청 대기는 재요청 칩', () => {
    expect(pgRequestChip({ pendingRequote: true, hasBid: false })).toEqual({
      label: '재요청',
      color: 'warning',
    });
  });

  it('견적 제출 완료는 견적 보냄 칩', () => {
    expect(pgRequestChip({ pendingRequote: false, hasBid: true })).toEqual({
      label: '견적 보냄',
      color: 'tertiary',
    });
  });

  it('미응답은 신규 칩', () => {
    expect(pgRequestChip({ pendingRequote: false, hasBid: false })).toEqual({
      label: '신규',
      color: 'warning',
    });
  });

  it('재요청이 견적 제출보다 우선한다', () => {
    expect(pgRequestChip({ pendingRequote: true, hasBid: true })).toEqual({
      label: '재요청',
      color: 'warning',
    });
  });

  it('선정됐고 본인 선정이면 선정됨 칩', () => {
    expect(pgRequestChip({ pendingRequote: false, hasBid: true, awarded: true, awardedToMe: true })).toEqual({
      label: '선정됨',
      color: 'tertiary',
    });
  });

  it('선정됐고 타사 선정이면 선정 마감 칩(중립)', () => {
    expect(pgRequestChip({ pendingRequote: false, hasBid: true, awarded: true, awardedToMe: false })).toEqual({
      label: '선정 마감',
      color: 'surface',
    });
  });

  it('선정 상태는 재요청/제출보다 우선한다', () => {
    expect(pgRequestChip({ pendingRequote: true, hasBid: true, awarded: true, awardedToMe: true })).toEqual({
      label: '선정됨',
      color: 'tertiary',
    });
  });
});
