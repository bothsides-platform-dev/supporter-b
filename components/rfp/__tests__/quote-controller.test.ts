// @vitest-environment jsdom
import { beforeEach, expect, it, vi } from 'vitest';
import { GuestSession } from '../useGuestDraft';
import { createGuestDraft, loadGuestDraft } from '@/lib/guest-rfp/draft';
import { GuestQuoteController } from '@/lib/guest-rfp/quote-controller';
const partial = { status: 'partial' as const, suggestions: [
  { field: 'mainProducts' as const, value: '추천 상품', source: 'rules' as const, sourceUrl: 'https://example.com/', evidence: '추천 상품' },
], needsConfirmation: ['mainProducts'] };
beforeEach(() => { localStorage.clear(); sessionStorage.clear(); });
it('입력 중인 사업자번호와 회사 정보도 새로고침 후 유지한다', () => {
  const { quote } = setup();
  quote.edit('companyName', '입력한 회사');
  quote.business('12345');
  const restored = new GuestQuoteController(new GuestSession(loadGuestDraft()!, () => {}));
  expect(restored.snapshot()).toMatchObject({ bizNo: '12345', companyName: '입력한 회사', stage: 'business' });
});
function setup() {
  const session = new GuestSession(createGuestDraft(), () => {});
  session.save();
  const send = vi.fn(async () => partial);
  const quote = new GuestQuoteController(session, { analyze: send, save: async () => ({ revision: 1 }) });
  return { session, quote, send };
}
it('제안은 확인 전에는 답변이 아니며 사용자가 수정한 값을 항상 유지한다', async () => {
  const { session, quote } = setup();
  quote.website('https://example.com/');
  await quote.analyze('website');
  expect(session.store.getState().mainProducts).toBe('');
  quote.edit('mainProducts', '직접 입력');
  quote.confirm();
  expect(session.store.getState().mainProducts).toBe('직접 입력');
  expect(quote.snapshot().confirmed).toContain('products');
});
it('분석 중 직접 작성하거나 URL을 바꾸면 늦은 응답을 적용하지 않는다', async () => {
  const { session, quote, send } = setup();
  let finish!: (value: typeof partial) => void;
  send.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  quote.website('https://example.com/');
  const pending = quote.analyze('website');
  await vi.waitFor(() => expect(send).toHaveBeenCalledOnce());
  quote.manual('website');
  quote.website('https://new.example.com/');
  finish(partial);
  await pending;
  expect(quote.snapshot().websiteResult).toBeUndefined();
  expect(session.store.getState().mainProducts).toBe('');
});
it('입력 변경은 파생 제안만 무효화하고 사용자 답변과 회사 정보는 보존한다', async () => {
  const { session, quote } = setup();
  quote.edit('companyName', '노온');
  quote.website('https://example.com/');
  await quote.analyze('website');
  quote.confirm();
  expect(session.store.getState().mainProducts).toBe('추천 상품');
  quote.edit('mainProducts', '내 상품');
  quote.website('https://new.example.com/');
  expect(session.store.getState().mainProducts).toBe('내 상품');
  expect(quote.snapshot().companyName).toBe('노온');
  expect(quote.snapshot().confirmed).not.toContain('products');
});
it('중복 클릭은 분석을 한 번만 시작하고 반환 revision을 가입 저장에 이어 쓴다', async () => {
  const { session, quote, send } = setup();
  quote.website('https://example.com/');
  await Promise.all([quote.analyze('website'), quote.analyze('website')]);
  expect(send).toHaveBeenCalledTimes(1);
  expect(session.draft.serverRevision).toBe(1);
  const restored = new GuestSession(loadGuestDraft()!, () => {});
  const next = new GuestQuoteController(restored, { analyze: send, save: async () => ({ revision: 2 }) });
  expect(next.snapshot().websiteResult).toMatchObject(partial);
  expect(send).toHaveBeenCalledTimes(1);
});
it('제목은 회사명·상품·계약 유형으로 만들고 직접 수정한 제목은 유지한다', () => {
  const { session, quote } = setup();
  quote.edit('companyName', '노온');
  session.store.setState({ mainProducts: '티셔츠', contractType: 'new' });
  quote.syncTitle();
  expect(session.store.getState().title).toBe('노온 티셔츠 신규 PG 견적');
  session.store.setState({ title: '내 제목', contractType: 'renewal' });
  quote.syncTitle();
  expect(session.store.getState().title).toBe('내 제목');
});
