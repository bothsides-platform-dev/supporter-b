import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { createStore } from 'zustand/vanilla';
import { useRfpDraftStore, type RfpDraftStore } from '@/lib/stores/rfp-draft';
import { RfpDraftProvider } from '@/lib/stores/rfp-draft-context';
import { RfpQuestionFlow } from '../RfpQuestionFlow';
vi.mock('@/lib/server/actions/rfp', () => ({}));
beforeEach(() => useRfpDraftStore.getState().reset());
it('public answers and next validation read only the provided draft', () => {
  const store = createStore<RfpDraftStore>((set) => ({
    ...useRfpDraftStore.getInitialState(),
    setField: (key, value) => set({ [key]: value }),
    reset: () => {},
  }));
  const answered = vi.fn();
  render(
    <RfpDraftProvider value={store}>
      <RfpQuestionFlow
        onBack={() => {}}
        onNext={() => {}}
        onQuestionChange={() => {}}
        onAnswered={answered}
      />
    </RfpDraftProvider>,
  );
  fireEvent.change(screen.getByLabelText('사업 운영 홈페이지'), {
    target: { value: 'example.com' },
  });
  fireEvent.click(screen.getByRole('button', { name: '다음' }));
  expect(store.getState().websiteUrl).toBe('https://example.com');
  expect(store.getState().contentQuestion).toBe('solution');
  expect(useRfpDraftStore.getState().websiteUrl).toBe('');
  expect(useRfpDraftStore.getState().contentQuestion).toBe('website');
  expect(answered).toHaveBeenCalledWith('website');
});

import { GuestSession } from '../useGuestDraft';
import { createGuestDraft } from '@/lib/guest-rfp/draft';
it('reset keeps the public store methods isolated from the member draft', () => {
  const session = new GuestSession(createGuestDraft(), () => {});
  session.store.getState().reset();
  session.store.getState().setField('title', '새 공개 초안');
  expect(session.store.getState().title).toBe('새 공개 초안');
  expect(useRfpDraftStore.getState().title).toBe('');
});
