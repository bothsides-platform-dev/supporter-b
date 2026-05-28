// components/rfp/__tests__/RfpStep2Content.test.tsx
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RfpStep2Content } from '../RfpStep2Content';
import { useRfpDraftStore } from '@/lib/stores/rfp-draft';

// RfpAttachmentDropzone은 fetch 없이 테스트하기 위해 mock
vi.mock('../RfpAttachmentDropzone', () => ({
  RfpAttachmentDropzone: () => <div data-testid="dropzone" />,
}));

function resetStore() {
  useRfpDraftStore.setState({
    title: '',
    websiteUrl: '',
    mainProducts: '',
    annualPgVolume: '',
    currentFeeRate: '',
    currentSettlementLimit: '',
    currentGuaranteeInsurance: '',
    currentSolution: '',
    currentSolutionDetail: '',
    memo: '',
    rfpFiles: [],
  });
}

describe('RfpStep2Content', () => {
  beforeEach(resetStore);

  it('제목이 비어있으면 다음 버튼이 비활성화된다', () => {
    render(<RfpStep2Content onBack={vi.fn()} onNext={vi.fn()} />);
    expect(screen.getByRole('button', { name: '다음' })).toBeDisabled();
  });

  it('제목 입력 후 다음 버튼이 활성화된다', async () => {
    const user = userEvent.setup();
    render(<RfpStep2Content onBack={vi.fn()} onNext={vi.fn()} />);
    await user.type(screen.getByPlaceholderText(/서포트쇼핑몰/), '테스트 제목');
    expect(screen.getByRole('button', { name: '다음' })).not.toBeDisabled();
  });

  it('다음 버튼 클릭 시 onNext가 호출된다', async () => {
    const user = userEvent.setup();
    useRfpDraftStore.setState({ title: '테스트' });
    const onNext = vi.fn();
    render(<RfpStep2Content onBack={vi.fn()} onNext={onNext} />);
    await user.click(screen.getByRole('button', { name: '다음' }));
    expect(onNext).toHaveBeenCalledOnce();
  });

  it('이전 버튼 클릭 시 onBack이 호출된다', async () => {
    const user = userEvent.setup();
    const onBack = vi.fn();
    render(<RfpStep2Content onBack={onBack} onNext={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: '이전' }));
    expect(onBack).toHaveBeenCalledOnce();
  });

  it('솔루션 버튼 클릭 시 store에 반영된다', async () => {
    const user = userEvent.setup();
    render(<RfpStep2Content onBack={vi.fn()} onNext={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: '카페24' }));
    expect(useRfpDraftStore.getState().currentSolution).toBe('cafe24');
  });

  it('기타 솔루션 선택 시 상세 입력 필드가 표시된다', async () => {
    const user = userEvent.setup();
    render(<RfpStep2Content onBack={vi.fn()} onNext={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: '기타' }));
    expect(screen.getByPlaceholderText('솔루션 이름')).toBeInTheDocument();
  });
});
