import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { GuestSession } from '../useGuestDraft';
import { createGuestDraft } from '@/lib/guest-rfp/draft';
import { GuestQuoteController } from '@/lib/guest-rfp/quote-controller';
import { GuestQuoteIntake } from '../GuestQuoteIntake';
beforeEach(() => localStorage.clear());
it('직접 입력을 선택해도 번호 건너뛰기·홈페이지 입력·확인 후 기존 질문으로 진행한다', () => {
  const session = new GuestSession(createGuestDraft(), () => {}); session.save();
  const quote = new GuestQuoteController(session);
  render(<GuestQuoteIntake quote={quote} industryGroups={[]} />);
  expect(screen.getByRole('heading', { name: '사업자등록번호를 알려주세요' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '지금은 건너뛸게요' }));
  fireEvent.change(screen.getByLabelText('사업 운영 홈페이지'), { target: { value: 'example.com' } });
  fireEvent.click(screen.getByRole('button', { name: '직접 입력할게요' }));
  fireEvent.change(screen.getByLabelText('회사명'), { target: { value: '노온' } });
  fireEvent.click(screen.getByRole('button', { name: '확인한 내용으로 계속할게요' }));
  expect(quote.snapshot()).toMatchObject({ stage: 'questions', companyName: '노온', confirmed: ['website'] });
  expect(session.store.getState().websiteUrl).toBe('https://example.com');
});

it('플래그 없이 사업자와 홈페이지를 분석하고 실패해도 확인 화면으로 진행한다', async () => {
  const session = new GuestSession(createGuestDraft(), () => {}); session.save();
  const analyze = vi.fn(async () => ({ status: 'manual' as const, suggestions: [], needsConfirmation: [] }));
  const quote = new GuestQuoteController(session, { analyze, save: async () => ({ revision: 1 }) });
  render(<GuestQuoteIntake quote={quote} industryGroups={[]} />);
  fireEvent.change(screen.getByLabelText('사업자등록번호'), { target: { value: '6528703871' } });
  fireEvent.click(screen.getByRole('button', { name: '다음' }));
  fireEvent.change(await screen.findByLabelText('사업 운영 홈페이지'), { target: { value: 'example.com' } });
  fireEvent.click(screen.getByRole('button', { name: '다음' }));
  await screen.findByLabelText('회사명');
  await waitFor(() => expect(analyze).toHaveBeenCalledTimes(2));
  expect(quote.snapshot().stage).toBe('review');
});

it('사업자 분석 중에는 중단 버튼 하나만 제공하고 즉시 직접 작성으로 이동한다', async () => {
  const session = new GuestSession(createGuestDraft(), () => {}); session.save();
  const analyze = vi.fn(() => new Promise<never>(() => {}));
  const quote = new GuestQuoteController(session, { analyze, save: async () => ({ revision: 1 }) });
  render(<GuestQuoteIntake quote={quote} industryGroups={[]} />);
  fireEvent.change(screen.getByLabelText('사업자등록번호'), { target: { value: '6528703871' } });
  fireEvent.click(screen.getByRole('button', { name: '다음' }));
  await waitFor(() => expect(analyze).toHaveBeenCalledTimes(1));
  expect(screen.getByRole('button', { name: '직접 입력할게요' })).toBeEnabled();
  expect(screen.queryByRole('button', { name: '지금은 건너뛸게요' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '직접 입력할게요' }));
  expect(await screen.findByLabelText('사업 운영 홈페이지')).toBeVisible();
  expect(quote.snapshot().analysisState).toBe('manual');
});
