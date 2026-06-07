// components/rfp/__tests__/RfpStep2Content.test.tsx
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RfpStep2Content } from '../RfpStep2Content';
import { useRfpDraftStore } from '@/lib/stores/rfp-draft';
import { WEBSITE_URL_ERROR } from '@/lib/validation/website-url';

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
    currentSettlementCycle: '',
    deliveryServicePeriod: '',
    currentSolution: '',
    currentSolutionDetail: '',
    memo: '',
    rfpFiles: [],
  });
}

describe('RfpStep2Content', () => {
  beforeEach(resetStore);

  it('제목이 비어있어도 다음 버튼은 비활성화되지 않는다 (순서 무관 입력)', () => {
    render(<RfpStep2Content onBack={vi.fn()} onNext={vi.fn()} />);
    expect(screen.getByRole('button', { name: '다음' })).not.toBeDisabled();
  });

  it('제목이 비어있어도 다음 버튼 클릭 시 onNext가 호출된다', async () => {
    const user = userEvent.setup();
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

  it('현재 정산주기 입력 필드가 렌더된다', () => {
    render(<RfpStep2Content onBack={vi.fn()} onNext={vi.fn()} />);
    expect(screen.getByPlaceholderText('D+1')).toBeInTheDocument();
  });

  it('현재 정산주기 입력 시 store에 반영된다', async () => {
    const user = userEvent.setup();
    render(<RfpStep2Content onBack={vi.fn()} onNext={vi.fn()} />);
    await user.type(screen.getByPlaceholderText('D+1'), 'W+2');
    expect(useRfpDraftStore.getState().currentSettlementCycle).toBe('W+2');
  });

  it('배송 및 서비스 기간 입력 필드가 렌더된다', () => {
    render(<RfpStep2Content onBack={vi.fn()} onNext={vi.fn()} />);
    expect(screen.getByPlaceholderText('D+3')).toBeInTheDocument();
  });

  it('배송 및 서비스 기간 입력 시 store에 반영된다', async () => {
    const user = userEvent.setup();
    render(<RfpStep2Content onBack={vi.fn()} onNext={vi.fn()} />);
    await user.type(screen.getByPlaceholderText('D+3'), 'D+5');
    expect(useRfpDraftStore.getState().deliveryServicePeriod).toBe('D+5');
  });

  describe('홈페이지 도메인 유효성', () => {
    const homepagePlaceholder = 'https://supporter-b.com/';

    it('빈 값이면 에러를 표시하지 않는다', () => {
      render(<RfpStep2Content onBack={vi.fn()} onNext={vi.fn()} />);
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
      expect(screen.getByPlaceholderText(homepagePlaceholder)).toHaveAttribute(
        'aria-invalid',
        'false',
      );
    });

    it('도메인 형식이 아닌 값을 입력하면 실시간 에러를 표시한다', async () => {
      const user = userEvent.setup();
      render(<RfpStep2Content onBack={vi.fn()} onNext={vi.fn()} />);
      await user.type(screen.getByPlaceholderText(homepagePlaceholder), 'abc');
      expect(screen.getByRole('alert')).toHaveTextContent(WEBSITE_URL_ERROR);
      expect(screen.getByPlaceholderText(homepagePlaceholder)).toHaveAttribute(
        'aria-invalid',
        'true',
      );
    });

    it('유효한 도메인을 입력하면 에러를 표시하지 않는다', async () => {
      const user = userEvent.setup();
      render(<RfpStep2Content onBack={vi.fn()} onNext={vi.fn()} />);
      await user.type(
        screen.getByPlaceholderText(homepagePlaceholder),
        'https://x.com',
      );
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
      expect(screen.getByPlaceholderText(homepagePlaceholder)).toHaveAttribute(
        'aria-invalid',
        'false',
      );
    });
  });
});
