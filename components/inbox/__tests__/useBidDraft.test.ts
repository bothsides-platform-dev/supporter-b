import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useBidDraft } from '../useBidDraft';

const RFP_ID = 'rfp-abc';
const KEY = `bid-draft:${RFP_ID}`;

const SAMPLE_DRAFT = {
  __v: 3 as const,
  cycleUnit: 'D' as const,
  cycleNum: '1',
  settleLimit: '10000000',
  guaranteeInsurance: '500000',
  fees: { bank_transfer: '0.50', card: '1.25' },
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

  it('구버전 __v=2 draft는 폐기한다', () => {
    localStorage.setItem(
      'bid-draft:rfp-x',
      JSON.stringify({ __v: 2, cycleUnit: 'D', cycleNum: '1', settleLimit: '0', guaranteeInsurance: '0', fees: { card: '1.2' }, memo: '' }),
    );
    const { result } = renderHook(() => useBidDraft('rfp-x'));
    expect(result.current.draft).toBeNull();
    expect(localStorage.getItem('bid-draft:rfp-x')).toBeNull();
  });

  it('__v=3 복합 키 draft를 복원한다', () => {
    localStorage.setItem(
      'bid-draft:rfp-y',
      JSON.stringify({ __v: 3, cycleUnit: 'D', cycleNum: '1', settleLimit: '0', guaranteeInsurance: '0', fees: { 'card:sole': '0.5', virtual_account: '0.3' }, memo: '' }),
    );
    const { result } = renderHook(() => useBidDraft('rfp-y'));
    expect(result.current.draft?.fees['card:sole']).toBe('0.5');
    expect(result.current.draft?.fees.virtual_account).toBe('0.3');
  });

  it('구버전(bankPct/cardPct) 드래프트는 무시하고 항목을 삭제한다', () => {
    localStorage.setItem(
      KEY,
      JSON.stringify({
        cycleUnit: 'D',
        cycleNum: '1',
        settleLimit: '0',
        guaranteeInsurance: '0',
        bankPct: '0.50',
        cardPct: '',
        memo: '',
      }),
    );
    const { result } = renderHook(() => useBidDraft(RFP_ID));
    expect(result.current.draft).toBeNull();
    expect(localStorage.getItem(KEY)).toBeNull();
  });

  describe('savedAt — 자동저장 피드백 신호', () => {
    it('초기에는 savedAt이 null이다', () => {
      const { result } = renderHook(() => useBidDraft(RFP_ID));
      expect(result.current.savedAt).toBeNull();
    });

    it('saveDraft 호출 후 디바운스(500ms) 뒤에 savedAt이 Date로 설정된다', () => {
      const { result } = renderHook(() => useBidDraft(RFP_ID));

      act(() => {
        result.current.saveDraft(SAMPLE_DRAFT);
      });
      // 디바운스 전: 아직 null
      expect(result.current.savedAt).toBeNull();

      act(() => {
        vi.advanceTimersByTime(500);
      });
      // 디바운스 후: Date 인스턴스
      expect(result.current.savedAt).toBeInstanceOf(Date);
    });

    it('연속 저장 시 savedAt이 새 Date 인스턴스로 갱신된다', () => {
      const { result } = renderHook(() => useBidDraft(RFP_ID));

      act(() => {
        result.current.saveDraft(SAMPLE_DRAFT);
        vi.advanceTimersByTime(500);
      });
      const first = result.current.savedAt;
      expect(first).toBeInstanceOf(Date);

      act(() => {
        result.current.saveDraft({ ...SAMPLE_DRAFT, memo: 'updated' });
        vi.advanceTimersByTime(500);
      });
      expect(result.current.savedAt).not.toBe(first);
    });
  });
});
