import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RfpQuestionFlow } from '../RfpQuestionFlow';
import { RfpCreateWizard } from '../RfpCreateWizard';
import { useRfpDraftStore } from '@/lib/stores/rfp-draft';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock('@/lib/server/actions/rfp', () => ({ createRfpAction: vi.fn(), verifyDraftFilesAction: vi.fn() }));
vi.mock('../RfpAttachmentDropzone', () => ({ RfpAttachmentDropzone: () => <div>첨부 파일</div> }));

describe('실제 견적 질문 흐름', () => {
  beforeEach(() => { useRfpDraftStore.getState().reset(); });
  it('현재 질문만 표시하며 다음 클릭 시 그 질문만 검증하고 이전 답을 보존한다', async () => {
    const user = userEvent.setup();
    render(<RfpCreateWizard pgList={[]} step={2} />);
    expect(screen.getByRole('heading', { name: '어떤 홈페이지에서 판매하나요?' })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: '사업 운영 홈페이지' })).toBeInTheDocument();
    expect(screen.queryByPlaceholderText('의류')).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '다음' }));
    expect(screen.getByRole('alert')).toHaveTextContent('홈페이지');
    await user.type(screen.getByRole('textbox'), 'example.com');
    await user.click(screen.getByRole('button', { name: '다음' }));
    expect(screen.getByRole('heading', { name: '홈페이지를 어떻게 만들었나요?' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '이전' }));
    expect(screen.getByRole('textbox')).toHaveValue('https://example.com');
  });
  it('질문이 바뀌면 모바일에서도 질문 제목이 보이도록 스크롤한다', async () => {
    const scrollIntoView = vi.fn();
    HTMLElement.prototype.scrollIntoView = scrollIntoView;
    useRfpDraftStore.setState({ websiteUrl: 'https://example.com' });
    const user = userEvent.setup();
    render(<RfpCreateWizard pgList={[]} step={2} />);
    scrollIntoView.mockClear();
    await user.click(screen.getByRole('button', { name: '다음' }));
    expect(screen.getByRole('heading', { name: '홈페이지를 어떻게 만들었나요?' })).toBeInTheDocument();
    expect(scrollIntoView).toHaveBeenCalledWith({ block: 'start' });
  });
});

describe('판매 정보 질문과 조건 분기', () => {
  beforeEach(() => useRfpDraftStore.getState().reset());
  const renderFlow = () => render(<RfpQuestionFlow onBack={vi.fn()} onNext={vi.fn()} onQuestionChange={vi.fn()} />);
  it('선택 질문을 건너뛰면 이전 답을 제거하고 필수 환금성 질문은 아니요로도 진행한다', async () => {
    useRfpDraftStore.setState({ contentQuestion: 'sellers', productInfo: { hasMarketplaceSellers: true } });
    const user = userEvent.setup(); renderFlow();
    await user.click(screen.getByRole('button', { name: '건너뛰기' }));
    expect(useRfpDraftStore.getState().productInfo.hasMarketplaceSellers).toBeUndefined();
    await user.click(screen.getByRole('button', { name: '다음' }));
    expect(screen.getByRole('alert')).toBeInTheDocument();
    await user.click(screen.getByRole('radio', { name: '아니요' }));
    await user.click(screen.getByRole('button', { name: '다음' }));
    expect(screen.getByRole('heading')).toHaveTextContent('가장 비싼 상품');
    expect(useRfpDraftStore.getState().productInfo.cashConvertible).toBe(false);
  });
  it('판매 방식은 해당 없음과 다른 방식을 함께 저장하지 않는다', async () => {
    useRfpDraftStore.setState({ contentQuestion: 'sales' });
    const user = userEvent.setup(); renderFlow();
    await user.click(screen.getByRole('checkbox', { name: '해당 없음' }));
    await user.click(screen.getByRole('checkbox', { name: '구독형 판매' }));
    expect(useRfpDraftStore.getState().productInfo.salesMethods).toEqual(['subscription']);
    await user.click(screen.getByRole('checkbox', { name: '해당 없음' }));
    expect(useRfpDraftStore.getState().productInfo.salesMethods).toEqual(['none']);
  });
  it('신규 계약은 과거 거래액 질문을 생략하고 갱신은 필수 거래액 질문을 연다', async () => {
    useRfpDraftStore.setState({ contentQuestion: 'payment', contractType: 'new', requiredPaymentMethods: ['card'] });
    const user = userEvent.setup(); const view = renderFlow();
    await user.click(screen.getByRole('button', { name: '다음' }));
    expect(screen.getByRole('heading')).toHaveTextContent('제목');
    view.unmount();
    useRfpDraftStore.setState({ contentQuestion: 'payment', contractType: 'renewal' });
    renderFlow();
    await user.click(screen.getByRole('button', { name: '다음' }));
    expect(screen.getByRole('heading')).toHaveTextContent('전년도 PG 거래액');
    await user.click(screen.getByRole('button', { name: '다음' }));
    expect(screen.getByRole('alert')).toHaveTextContent('거래액');
  });
});
