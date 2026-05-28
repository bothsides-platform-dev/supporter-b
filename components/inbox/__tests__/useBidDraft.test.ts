import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useBidDraft } from '../useBidDraft';

const RFP_ID = 'rfp-abc';
const KEY = `bid-draft:${RFP_ID}`;

const SAMPLE_DRAFT = {
  cycleUnit: 'D' as const,
  cycleNum: '1',
  settleLimit: '10000000',
  guaranteeInsurance: '500000',
  bankPct: '0.50',
  cardPct: '1.25',
  memo: '메모',
};

beforeEach(() => {
  localStorage.clear();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useBidDraft', () => {
  it('드래프트 없으면 draft가 null을 반환한다', () => {
    const { result } = renderHook(() => useBidDraft(RFP_ID));
    expect(result.current.draft).toBeNull();
  });

  it('localStorage에 드래프트가 있으면 파싱된 값을 반환한다', () => {
    localStorage.setItem(KEY, JSON.stringify(SAMPLE_DRAFT));
    const { result } = renderHook(() => useBidDraft(RFP_ID));
    expect(result.current.draft).toEqual(SAMPLE_DRAFT);
  });

  it('saveDraft 호출 후 debounce가 지나면 localStorage에 저장된다', async () => {
    const { result } = renderHook(() => useBidDraft(RFP_ID));

    act(() => {
      result.current.saveDraft(SAMPLE_DRAFT);
    });

    expect(localStorage.getItem(KEY)).toBeNull();

    act(() => {
      vi.advanceTimersByTime(500);
    });

    expect(JSON.parse(localStorage.getItem(KEY)!)).toEqual(SAMPLE_DRAFT);
  });

  it('clearDraft 호출 시 localStorage 항목이 제거된다', () => {
    localStorage.setItem(KEY, JSON.stringify(SAMPLE_DRAFT));
    const { result } = renderHook(() => useBidDraft(RFP_ID));

    act(() => {
      result.current.clearDraft();
    });

    expect(localStorage.getItem(KEY)).toBeNull();
  });

  it('JSON.parse 실패 시 draft가 null이고 항목이 삭제된다', () => {
    localStorage.setItem(KEY, 'invalid-json{{{');
    const { result } = renderHook(() => useBidDraft(RFP_ID));
    expect(result.current.draft).toBeNull();
    expect(localStorage.getItem(KEY)).toBeNull();
  });
});
