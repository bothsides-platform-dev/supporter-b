// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { GuestSession } from '../useGuestDraft';
import { createGuestDraft } from '@/lib/guest-rfp/draft';
import { newQuoteContext } from '@/lib/guest-rfp/quote-context';
import { GuestQuoteController } from '@/lib/guest-rfp/quote-controller';

beforeEach(() => { localStorage.clear(); sessionStorage.clear(); });
afterEach(() => vi.unstubAllEnvs());

function controller(confirmed: string[], stage: 'questions' | 'complete' = 'complete') {
  const draft = createGuestDraft();
  Object.assign(draft.data, { websiteUrl: 'https://example.com', contractType: 'new' });
  draft.completed = stage === 'complete';
  draft.quoteContext = { ...newQuoteContext(), stage, bizNo: '1248100998', confirmedWebsite: 'https://example.com', confirmed };
  const session = new GuestSession(draft, () => {});
  return { session, quote: new GuestQuoteController(session, undefined, true) };
}

it('접수가 열리면 홈페이지부터 받고 사업자번호는 건너뛸 수 없다', () => {
  const quote = new GuestQuoteController(new GuestSession(createGuestDraft(), () => {}), undefined, true);
  expect(quote.snapshot().stage).toBe('website');
  quote.update({ stage: 'business' });
  quote.manual('business');
  expect(quote.snapshot().stage).toBe('business');
});

it('접수가 열리기 전에 완성한 초안도 사업자번호부터 이어 쓴다', () => {
  const { quote } = controller([]);
  quote.resumeRequiredInputs();
  expect(quote.snapshot().stage).toBe('business');
});

it('배정이 꺼져 있으면 화면에 없는 예상 거래액 질문으로 되돌리지 않는다', () => {
  vi.stubEnv('NEXT_PUBLIC_PG_ASSIGNMENT_ENABLED', '');
  const { session, quote } = controller(['business-number']);
  quote.resumeRequiredInputs();
  expect(quote.snapshot().stage).toBe('complete');
  expect(session.draft.completed).toBe(true);
});

it('배정이 켜져 있으면 빠진 예상 거래액은 계속 다시 묻는다', () => {
  vi.stubEnv('NEXT_PUBLIC_PG_ASSIGNMENT_ENABLED', 'true');
  const { session, quote } = controller(['business-number']);
  quote.resumeRequiredInputs();
  expect(quote.snapshot().stage).toBe('questions');
  expect(session.store.getState().contentQuestion).toBe('expected-volume');
});
