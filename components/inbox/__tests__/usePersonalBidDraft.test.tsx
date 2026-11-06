import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook } from '@testing-library/react';
import { usePersonalBidDraft, personalDraftKey, leaveBidDraft } from '../usePersonalBidDraft';
import { EMPTY_BID_DRAFT } from '@/lib/quote/bid-draft';
import type { BidDraft } from '@/lib/quote/bid-draft';
import type { SavedBidDraft } from '@/lib/quote/draft-schema';

const api = vi.hoisted(() => ({
  save: vi.fn(),
  load: vi.fn(),
  remove: vi.fn(),
}));
vi.mock('@/lib/server/actions/bid-drafts', () => ({
  saveBidDraftAction: (...a: unknown[]) => api.save(...a),
  loadBidDraftAction: (...a: unknown[]) => api.load(...a),
  deleteBidDraftAction: (...a: unknown[]) => api.remove(...a),
}));
const scope = {
  userId: 'user-a',
  workspaceId: 'pg-a',
  rfpId: 'rfp-a',
  roundKey: 'initial',
};
const saved = (revision: number, memo: string): SavedBidDraft => ({
  id: 'draft-a',
  revision,
  updatedAt: '2026-11-01T00:00:00Z',
  content: { ...EMPTY_BID_DRAFT, memo },
  submittedBidId: null,
});
beforeEach(() => {
  vi.useFakeTimers();
  localStorage.clear();
  vi.resetAllMocks();
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('개인 초안 복구와 동시 저장', () => {
  it('800ms 입력 중단 뒤 저장하며 실패해도 로컬 입력과 이탈 보호를 유지한다', async () => {
    api.save.mockRejectedValue(new Error('offline'));
    const { result } = renderHook(() => usePersonalBidDraft(scope, null));
    act(() => result.current.saveDraft({ ...EMPTY_BID_DRAFT, memo: '오프라인 입력' }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(799);
    });
    expect(api.save).not.toHaveBeenCalled();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(result.current.status).toBe('이 브라우저에만 보관했어요');
    expect(JSON.parse(localStorage.getItem(personalDraftKey(scope))!).content.memo).toBe(
      '오프라인 입력',
    );
    const proceed = vi.fn();
    act(() => leaveBidDraft(proceed));
    expect(proceed).not.toHaveBeenCalled();
    expect(result.current.leave).toBeTruthy();
    act(() => result.current.cancelLeave());
    expect(proceed).not.toHaveBeenCalled();
    const unload = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(unload);
    expect(unload.defaultPrevented).toBe(true);
  });
  it('서버와 로컬이 모두 실패하면 저장 실패를 표시하고 자동 이동하지 않는다', async () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota');
    });
    api.save.mockResolvedValue({ ok: false, error: 'DRAFT_SAVE_FAILED' });
    const { result } = renderHook(() => usePersonalBidDraft(scope, null));
    act(() =>
      result.current.saveDraft({
        ...EMPTY_BID_DRAFT,
        memo: '잃으면 안 되는 입력',
      }),
    );
    await act(async () => {
      await result.current.flush();
    });
    expect(result.current.status).toBe('저장하지 못했어요');
    const proceed = vi.fn();
    act(() => leaveBidDraft(proceed));
    expect(proceed).not.toHaveBeenCalled();
  });
  it('저장 중 새 입력과 수동 저장이 겹쳐도 다음 revision으로 한 번만 저장한다', async () => {
    let finish!: (value: { ok: true; draft: SavedBidDraft }) => void;
    api.save
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            finish = resolve;
          }),
      )
      .mockImplementation(async (_scope: unknown, content: BidDraft, revision: number) => ({
        ok: true,
        draft: { ...saved(revision + 1, content.memo), content },
      }));
    const { result } = renderHook(() => usePersonalBidDraft(scope, null));
    act(() => result.current.saveDraft({ ...EMPTY_BID_DRAFT, memo: '첫 입력' }));
    let first!: Promise<SavedBidDraft | null>;
    act(() => {
      first = result.current.flush();
    });
    act(() => result.current.saveDraft({ ...EMPTY_BID_DRAFT, memo: '최신 입력' }));
    await act(async () => {
      const second = result.current.flush();
      const third = result.current.flush();
      finish({ ok: true, draft: saved(1, '첫 입력') });
      await Promise.all([first, second, third]);
    });
    expect(api.save).toHaveBeenCalledTimes(2);
    expect(api.save.mock.calls.map((a) => a[2])).toEqual([0, 1]);
    expect(api.save.mock.calls[1][1].memo).toBe('최신 입력');
    expect(result.current.status).toBe('계정에 저장했어요');
  });
  it('충돌 시 입력을 유지하고 선택한 서버 판본이 다시 바뀌면 덮어쓰지 않는다', async () => {
    api.save.mockResolvedValue({ ok: false, error: 'DRAFT_CONFLICT' });
    api.load.mockResolvedValue({
      ok: true,
      draft: saved(2, '다른 탭'),
      readOnly: false,
    });
    const { result } = renderHook(() => usePersonalBidDraft(scope, saved(1, '원본')));
    act(() => result.current.saveDraft({ ...EMPTY_BID_DRAFT, memo: '내 입력' }));
    await act(async () => {
      await result.current.flush();
    });
    expect(result.current.conflict?.content.memo).toBe('다른 탭');
    expect(JSON.parse(localStorage.getItem(personalDraftKey(scope))!).content.memo).toBe('내 입력');
    api.load.mockResolvedValue({
      ok: true,
      draft: saved(3, '또 다른 탭'),
      readOnly: false,
    });
    await act(async () => {
      await result.current.resolveConflict(false);
    });
    expect(api.save).toHaveBeenCalledTimes(1);
    expect(result.current.conflict?.revision).toBe(3);
    api.save.mockResolvedValue({ ok: true, draft: saved(4, '내 입력') });
    await act(async () => {
      await result.current.resolveConflict(false);
    });
    expect(api.save.mock.calls[1][2]).toBe(3);
  });
  it('제출 성공 후에는 복구본을 지우고 늦게 실행된 저장과 이탈 경고를 막는다', async () => {
    const { result } = renderHook(() => usePersonalBidDraft(scope, saved(1, '초안')));
    act(() => {
      result.current.saveDraft({ ...EMPTY_BID_DRAFT, memo: '최종본' });
      result.current.markSubmitted();
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(localStorage.getItem(personalDraftKey(scope))).toBeNull();
    expect(api.save).not.toHaveBeenCalled();
    const proceed = vi.fn();
    act(() => leaveBidDraft(proceed));
    expect(proceed).toHaveBeenCalledOnce();
  });
});
