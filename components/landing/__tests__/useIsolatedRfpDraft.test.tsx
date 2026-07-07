import { describe, it, expect, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import { useRfpDraftStore } from '@/lib/stores/rfp-draft';
import { useIsolatedRfpDraft } from '../useIsolatedRfpDraft';

const KEY = 'support-b-rfp-draft';

function Harness() {
  useIsolatedRfpDraft();
  return null;
}

function persistedTitle(): string | undefined {
  const raw = localStorage.getItem(KEY);
  return raw ? JSON.parse(raw).state?.title : undefined;
}

describe('useIsolatedRfpDraft', () => {
  beforeEach(() => {
    localStorage.clear();
    useRfpDraftStore.setState({ title: '' });
  });

  it('마운트 시 store를 리셋하고, 데모 입력이 실제 draft(localStorage)를 오염시키지 않으며, 언마운트 시 복원한다', () => {
    // 방문자의 실제 draft가 이미 있다고 가정 (persist가 동기 기록).
    useRfpDraftStore.setState({ title: 'REAL_DRAFT' });
    expect(persistedTitle()).toBe('REAL_DRAFT');

    const { unmount } = render(<Harness />);

    // 마운트 직후 데모는 빈 상태에서 시작.
    expect(useRfpDraftStore.getState().title).toBe('');

    // 데모가 타이핑하는 상황: 메모리 store에는 반영되지만 localStorage는 오염되지 않음.
    useRfpDraftStore.getState().setField('title', 'DEMO_JUNK');
    expect(useRfpDraftStore.getState().title).toBe('DEMO_JUNK');
    expect(persistedTitle()).toBe('REAL_DRAFT');

    // 언마운트 시 실제 draft 복원.
    unmount();
    expect(useRfpDraftStore.getState().title).toBe('REAL_DRAFT');
  });
});
