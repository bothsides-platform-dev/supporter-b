import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { GuestQuoteStart } from '../GuestQuoteStart';
import { RfpQuestionFlow } from '../RfpQuestionFlow';
import { RfpStep2Content } from '../RfpStep2Content';
import { useRfpDraftStore } from '@/lib/stores/rfp-draft';
import { createGuestDraft, loadGuestDraft, saveGuestDraft } from '@/lib/guest-rfp/draft';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock('@/lib/guest-rfp/events', () => ({ sendGuestEvent: vi.fn() }));

beforeEach(() => {
  localStorage.clear();
  useRfpDraftStore.getState().reset();
});

function startAtSolution() {
  const draft = createGuestDraft();
  draft.data.websiteUrl = 'https://example.com';
  draft.data.contentQuestion = 'solution';
  saveGuestDraft(draft);
  return render(<GuestQuoteStart industryGroups={[]} />);
}

it('public choices show decorative local brand images and keep their accessible names', async () => {
  startAtSolution();
  await screen.findByRole('heading', { name: '홈페이지를 어떻게 만들었나요?' });
  for (const [name, file] of [
    ['카페24', 'cafe24.png'], ['아임웹', 'imweb.svg'],
    ['메이크샵', 'makeshop.png'], ['고도몰', 'godo.png'],
  ]) {
    const button = screen.getByRole('button', { name });
    const image = button.querySelector('img');
    expect(image).toHaveAttribute('src', `/images/solution-logos/${file}`);
    expect(image).toHaveAttribute('alt', '');
    expect(button).toHaveAttribute('aria-pressed', 'false');
    expect(within(button).getByText(name)).toBeVisible();
  }
  expect(screen.getByRole('button', { name: '자체 개발' }).querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
  expect(screen.getByRole('button', { name: '기타' }).querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
});

it('member and grouped demo/tutorial inputs retain text-only solution choices', () => {
  useRfpDraftStore.setState({ contentQuestion: 'solution' });
  const flow = render(<RfpQuestionFlow onBack={vi.fn()} onNext={vi.fn()} onQuestionChange={vi.fn()} />);
  expect(screen.getByRole('button', { name: '카페24' }).querySelector('img')).toBeNull();
  flow.unmount();
  render(<RfpStep2Content sampleMode onBack={vi.fn()} onNext={vi.fn()} />);
  expect(screen.getByRole('button', { name: '카페24' }).querySelector('img')).toBeNull();
});

it('public logo choices toggle, preserve other input through skip/back/remount and advance only with next', async () => {
  const view = startAtSolution();
  const cafe = await screen.findByRole('button', { name: '카페24' });
  expect(cafe.querySelector('img')).not.toBeNull();
  fireEvent.click(cafe);
  expect(cafe).toHaveAttribute('aria-pressed', 'true');
  expect(loadGuestDraft()?.data.contentQuestion).toBe('solution');
  fireEvent.click(cafe);
  expect(cafe).toHaveAttribute('aria-pressed', 'false');
  expect(loadGuestDraft()?.data.currentSolution).toBe('');
  fireEvent.click(screen.getByRole('button', { name: '기타' }));
  fireEvent.change(screen.getByRole('textbox', { name: '솔루션 이름' }), { target: { value: '우리 쇼핑몰' } });
  fireEvent.click(screen.getByRole('button', { name: '지금은 건너뛰어요' }));
  expect(loadGuestDraft()?.data.currentSolutionDetail).toBe('우리 쇼핑몰');
  fireEvent.click(screen.getByRole('button', { name: '이전' }));
  expect(screen.getByRole('textbox', { name: '솔루션 이름' })).toHaveValue('우리 쇼핑몰');
  view.unmount();
  render(<GuestQuoteStart industryGroups={[]} />);
  expect(await screen.findByRole('button', { name: '기타' })).toHaveAttribute('aria-pressed', 'true');
  expect(screen.getByRole('textbox', { name: '솔루션 이름' })).toHaveValue('우리 쇼핑몰');
  fireEvent.click(screen.getByRole('button', { name: '자체 개발' }));
  expect(screen.queryByRole('textbox', { name: '솔루션 이름' })).toBeNull();
  expect(loadGuestDraft()?.data.currentSolutionDetail).toBe('');
  fireEvent.click(screen.getByRole('button', { name: '다음' }));
  expect(loadGuestDraft()?.data.contentQuestion).toBe('industry');
  expect(useRfpDraftStore.getState().currentSolution).toBe('');
});
