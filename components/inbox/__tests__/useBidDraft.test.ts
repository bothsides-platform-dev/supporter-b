import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useBidDraft, EMPTY_BID_DRAFT, isPristineDraft } from '../useBidDraft';

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
      JSON.stringify({ __v: 3, cycleUnit: 'D', cycleNum: '1', settleLimit: '0', guaranteeInsurance: '0', fees: { 'card:sole': '0.5', virtual_account: '300' }, memo: '' }),
    );
    const { result } = renderHook(() => useBidDraft('rfp-y'));
    expect(result.current.draft?.fees['card:sole']).toBe('0.5');
    expect(result.current.draft?.fees.virtual_account).toBe('300');
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

  describe('언마운트 — 대기 중인 디바운스 타이머 정리', () => {
    // 회귀: 타이머가 언마운트 후 살아남으면 테스트 환경 teardown 뒤에 발화해
    // "localStorage is not defined" unhandled error를 낸다 (BidWizard.test.tsx 플레이크).
    it('언마운트 시 대기 타이머를 취소하고 드래프트를 즉시 저장(flush)한다', () => {
      const { result, unmount } = renderHook(() => useBidDraft(RFP_ID));

      act(() => {
        result.current.saveDraft(SAMPLE_DRAFT);
      });
      expect(localStorage.getItem(KEY)).toBeNull();

      unmount();

      // 디바운스를 기다리지 않고 동기적으로 저장돼 있어야 한다
      expect(JSON.parse(localStorage.getItem(KEY)!)).toEqual(SAMPLE_DRAFT);

      // 언마운트 뒤 남은 타이머가 localStorage를 다시 건드리면 안 된다
      // (환경 teardown 후 발화하면 ReferenceError가 나는 바로 그 경로)
      const setItem = vi.spyOn(Storage.prototype, 'setItem');
      vi.runAllTimers();
      expect(setItem).not.toHaveBeenCalled();
      setItem.mockRestore();
    });

    it('clearDraft 후 언마운트하면 아무것도 저장하지 않는다', () => {
      const { result, unmount } = renderHook(() => useBidDraft(RFP_ID));

      act(() => {
        result.current.saveDraft(SAMPLE_DRAFT);
        result.current.clearDraft();
      });

      unmount();

      const setItem = vi.spyOn(Storage.prototype, 'setItem');
      vi.runAllTimers();
      expect(setItem).not.toHaveBeenCalled();
      setItem.mockRestore();

      expect(localStorage.getItem(KEY)).toBeNull();
    });

    it('저장이 이미 완료된 뒤 언마운트하면 중복 저장 없이 그대로 둔다', () => {
      const { result, unmount } = renderHook(() => useBidDraft(RFP_ID));

      act(() => {
        result.current.saveDraft(SAMPLE_DRAFT);
        vi.advanceTimersByTime(500);
      });
      expect(JSON.parse(localStorage.getItem(KEY)!)).toEqual(SAMPLE_DRAFT);

      unmount();

      const setItem = vi.spyOn(Storage.prototype, 'setItem');
      vi.runAllTimers();
      expect(setItem).not.toHaveBeenCalled();
      setItem.mockRestore();

      expect(JSON.parse(localStorage.getItem(KEY)!)).toEqual(SAMPLE_DRAFT);
    });
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

describe('isPristineDraft / EMPTY_BID_DRAFT', () => {
  it('EMPTY_BID_DRAFT는 자기 자신에 대해 pristine', () => {
    expect(isPristineDraft(EMPTY_BID_DRAFT, EMPTY_BID_DRAFT)).toBe(true);
  });

  it('fee가 채워지면 pristine 아님', () => {
    expect(isPristineDraft({ ...EMPTY_BID_DRAFT, fees: { card: '1.0' } }, EMPTY_BID_DRAFT)).toBe(false);
  });

  it('빈 문자열 fee 값은 무시한다(pristine 유지)', () => {
    expect(isPristineDraft({ ...EMPTY_BID_DRAFT, fees: { card: '' } }, EMPTY_BID_DRAFT)).toBe(true);
  });

  it("settleLimit '0'과 ''는 동일하게 취급한다", () => {
    expect(isPristineDraft({ ...EMPTY_BID_DRAFT, settleLimit: '' }, EMPTY_BID_DRAFT)).toBe(true);
  });

  it("guaranteeInsurance '0'과 ''는 동일하게 취급한다", () => {
    expect(isPristineDraft({ ...EMPTY_BID_DRAFT, guaranteeInsurance: '' }, EMPTY_BID_DRAFT)).toBe(true);
  });

  it('memo가 바뀌면 pristine 아님', () => {
    expect(isPristineDraft({ ...EMPTY_BID_DRAFT, memo: 'x' }, EMPTY_BID_DRAFT)).toBe(false);
  });

  it('fees 키 순서가 달라도 내용이 같으면 pristine', () => {
    const base = { ...EMPTY_BID_DRAFT, fees: { a: '1', b: '2' } };
    const other = { ...EMPTY_BID_DRAFT, fees: { b: '2', a: '1' } };
    expect(isPristineDraft(other, base)).toBe(true);
  });

  it('baseline(재요청 prefill)과 동일하면 pristine, 편집되면 아님', () => {
    const baseline = { ...EMPTY_BID_DRAFT, cycleUnit: 'M' as const, cycleNum: '2', fees: { card: '0.5' } };
    expect(isPristineDraft({ ...baseline }, baseline)).toBe(true);
    expect(isPristineDraft({ ...baseline, fees: { card: '0.9' } }, baseline)).toBe(false);
  });
});
