// components/rfp/__tests__/RfpStep4Review.test.tsx
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RfpStep4Review } from '../RfpStep4Review';
import { useRfpDraftStore } from '@/lib/stores/rfp-draft';

function renderComponent({
  onBack = vi.fn(),
  onSubmit = vi.fn().mockResolvedValue(undefined),
  submitting = false,
  serverError = '',
  showFieldErrors = false,
}: {
  onBack?: () => void;
  onSubmit?: () => Promise<void>;
  submitting?: boolean;
  serverError?: string;
  showFieldErrors?: boolean;
} = {}) {
  return render(
    <RfpStep4Review
      onBack={onBack}
      onSubmit={onSubmit}
      submitting={submitting}
      serverError={serverError}
      showFieldErrors={showFieldErrors}
    />,
  );
}

function resetStore() {
  useRfpDraftStore.setState({
    title: '테스트 제안건',
    deadline: '',
    allowedPgWorkspaceIds: [
      { id: 'pg-1', displayName: '나이스페이먼츠' },
      { id: 'pg-2', displayName: 'KG이니시스' },
    ],
    websiteUrl: 'https://example.com',
    annualPgVolume: '10억',
    currentSolution: 'cafe24',
    currentSettlementCycle: '',
    deliveryServicePeriod: '',
    boardVisible: true,
    memo: '',
    rfpFiles: [],
  });
}

describe('RfpStep4Review', () => {
  beforeEach(resetStore);

  it('마감일이 없어도 발송 버튼은 비활성화되지 않는다 (미충족 안내는 클릭 시 토스트로)', () => {
    renderComponent();
    expect(screen.getByRole('button', { name: /보내기/ })).not.toBeDisabled();
  });

  it('마감일이 없어도 발송 버튼 클릭 시 onSubmit이 호출된다', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    renderComponent({ onSubmit });
    await user.click(screen.getByRole('button', { name: /보내기/ }));
    expect(onSubmit).toHaveBeenCalledOnce();
  });

  it('제안 제목이 요약에 표시된다', () => {
    renderComponent();
    expect(screen.getByText('테스트 제안건')).toBeInTheDocument();
  });

  it('선택된 PG 수가 발송 버튼 텍스트에 표시된다', () => {
    useRfpDraftStore.setState({ deadline: '2026-06-30T23:59:59Z' });
    renderComponent();
    expect(screen.getByRole('button', { name: '2개 PG사에 보내기' })).toBeInTheDocument();
  });

  it('serverError가 있으면 에러 메시지를 표시한다', () => {
    renderComponent({ serverError: 'INVALID_INPUT' });
    expect(screen.getByRole('alert')).toHaveTextContent('입력 값을 확인해주세요.');
  });

  it('발송 버튼 클릭 시 onSubmit이 호출된다', async () => {
    useRfpDraftStore.setState({ deadline: '2026-06-30T23:59:59Z' });
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    renderComponent({ onSubmit });
    await user.click(screen.getByRole('button', { name: '2개 PG사에 보내기' }));
    expect(onSubmit).toHaveBeenCalledOnce();
  });

  it('submitting=true면 버튼이 비활성화되고 "발송 중…"을 표시한다', () => {
    useRfpDraftStore.setState({ deadline: '2026-06-30T23:59:59Z' });
    renderComponent({ submitting: true });
    expect(screen.getByRole('button', { name: '보내는 중…' })).toBeDisabled();
  });

  it('메모(상세 요청사항)를 입력했으면 본문이 표시된다', () => {
    useRfpDraftStore.setState({ memo: '정산주기 D+1 이내 희망합니다.' });
    renderComponent();
    expect(screen.getByText('상세 요청사항')).toBeInTheDocument();
    expect(
      screen.getByText('정산주기 D+1 이내 희망합니다.'),
    ).toBeInTheDocument();
  });

  it('메모가 비어 있으면 상세 요청사항 섹션을 표시하지 않는다', () => {
    useRfpDraftStore.setState({ memo: '' });
    renderComponent();
    expect(screen.queryByText('상세 요청사항')).not.toBeInTheDocument();
  });

  it('공백뿐인 메모는 상세 요청사항 섹션을 표시하지 않는다 (발송 시 trim되어 빠지므로)', () => {
    useRfpDraftStore.setState({ memo: '   \n  ' });
    renderComponent();
    expect(screen.queryByText('상세 요청사항')).not.toBeInTheDocument();
  });

  it('첨부파일이 있으면 파일명과 크기가 표시된다', () => {
    useRfpDraftStore.setState({
      rfpFiles: [
        { id: 'f1', name: '견적요청서.pdf', size: 2_500_000 },
        { id: 'f2', name: '상품목록.xlsx', size: 5_000 },
      ],
    });
    renderComponent();
    expect(screen.getByText('견적요청서.pdf')).toBeInTheDocument();
    expect(screen.getByText('2.5 MB')).toBeInTheDocument();
    expect(screen.getByText('상품목록.xlsx')).toBeInTheDocument();
    expect(screen.getByText('5 KB')).toBeInTheDocument();
  });

  it('첨부파일이 없으면 첨부파일 섹션을 표시하지 않는다', () => {
    useRfpDraftStore.setState({ rfpFiles: [] });
    renderComponent();
    expect(screen.queryByText(/첨부파일/)).not.toBeInTheDocument();
  });

  it('currentSettlementCycle이 있으면 정산주기 행을 표시한다', () => {
    useRfpDraftStore.setState({ currentSettlementCycle: 'D+2' });
    renderComponent();
    expect(screen.getByText('정산주기')).toBeInTheDocument();
    expect(screen.getByText('D+2')).toBeInTheDocument();
  });

  it('currentSettlementCycle이 없으면 정산주기 행을 표시하지 않는다', () => {
    useRfpDraftStore.setState({ currentSettlementCycle: '' });
    renderComponent();
    expect(screen.queryByText('정산주기')).not.toBeInTheDocument();
  });

  it('deliveryServicePeriod가 있으면 배송 및 서비스 기간 행을 표시한다', () => {
    useRfpDraftStore.setState({ deliveryServicePeriod: '3~5일' });
    renderComponent();
    expect(screen.getByText('배송 및 서비스 기간')).toBeInTheDocument();
    expect(screen.getByText('3~5일')).toBeInTheDocument();
  });

  it('deliveryServicePeriod가 없으면 배송 및 서비스 기간 행을 표시하지 않는다', () => {
    useRfpDraftStore.setState({ deliveryServicePeriod: '' });
    renderComponent();
    expect(screen.queryByText('배송 및 서비스 기간')).not.toBeInTheDocument();
  });

  it('오픈 게시판 노출 체크박스가 기본 노출(체크) 상태로 표시된다', () => {
    renderComponent();
    expect(
      screen.getByRole('checkbox', { name: /오픈 게시판/ }),
    ).toBeChecked();
  });

  it('체크 해제 시 store의 boardVisible이 false가 된다', async () => {
    const user = userEvent.setup();
    renderComponent();
    await user.click(screen.getByRole('checkbox', { name: /오픈 게시판/ }));
    expect(useRfpDraftStore.getState().boardVisible).toBe(false);
  });

  it('boardVisible이 false면 체크박스가 해제 상태로 표시된다', () => {
    useRfpDraftStore.setState({ boardVisible: false });
    renderComponent();
    expect(
      screen.getByRole('checkbox', { name: /오픈 게시판/ }),
    ).not.toBeChecked();
  });

  describe('마감일 인라인 에러 (attempted)', () => {
    it('발송 버튼 클릭 전에는 마감일 미설정이어도 에러 메시지가 표시되지 않는다', () => {
      // deadline: '' (resetStore 기본값)
      renderComponent();
      expect(screen.queryByText('마감일을 선택해주세요')).not.toBeInTheDocument();
    });

    it('발송 버튼 클릭 후 마감일 미설정 시 에러 메시지가 표시된다', async () => {
      const user = userEvent.setup();
      renderComponent();
      await user.click(screen.getByRole('button', { name: /보내기/ }));
      expect(screen.getByText('마감일을 선택해주세요')).toBeInTheDocument();
    });

    it('showFieldErrors=true 이면 발송 클릭 없이도 마감일 미설정 에러가 표시된다', () => {
      renderComponent({ showFieldErrors: true });
      expect(screen.getByText('마감일을 선택해주세요')).toBeInTheDocument();
    });
  });
});
