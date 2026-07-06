// components/rfp/__tests__/RfpStep4Review.test.tsx
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RfpStep4Review } from '../RfpStep4Review';
import { useRfpDraftStore } from '@/lib/stores/rfp-draft';
vi.mock('@/lib/features/open-board', () => ({ OPEN_BOARD_ENABLED: true }));

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
      { id: 'pg-1', displayName: '나이스페이먼츠', logoUpdatedAt: '2026-01-01T00:00:00.000Z' },
      { id: 'pg-2', displayName: 'KG이니시스', logoUpdatedAt: null },
    ],
    websiteUrl: 'https://example.com',
    annualPgVolume: '10억',
    currentSolution: 'cafe24',
    currentSettlementCycle: '',
    deliveryServicePeriod: '',
    boardVisible: true,
    currentFeeRate: '',
    currentFeeVisibleToPg: true,
    contractType: null,
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

  it('초대 PG 목록에 워크스페이스 로고 이미지가 함께 표시된다', () => {
    const { container } = renderComponent();
    expect(
      container.querySelector('img[src*="/api/workspace/pg-1/avatar"]'),
    ).not.toBeNull();
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

  it('메모가 비어 있으면 상세 요청사항 섹션을 미입력으로 표시한다', () => {
    useRfpDraftStore.setState({ memo: '' });
    renderComponent();
    expect(screen.getByText('상세 요청사항')).toBeInTheDocument();
    expect(screen.getAllByText('미입력').length).toBeGreaterThan(0);
  });

  it('공백뿐인 메모는 trim 후 미입력으로 표시한다 (발송 시 trim되어 빠지므로)', () => {
    useRfpDraftStore.setState({ memo: '   \n  ' });
    renderComponent();
    expect(screen.getByText('상세 요청사항')).toBeInTheDocument();
    expect(screen.getAllByText('미입력').length).toBeGreaterThan(0);
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

  it('첨부파일이 없으면 첨부파일 섹션에 없음 안내를 표시한다', () => {
    useRfpDraftStore.setState({ rfpFiles: [] });
    renderComponent();
    expect(screen.getByText('첨부파일 (0개)')).toBeInTheDocument();
    expect(screen.getByText('첨부파일이 없어요')).toBeInTheDocument();
  });

  it('currentSettlementCycle이 있으면 정산주기 행을 표시한다', () => {
    useRfpDraftStore.setState({ currentSettlementCycle: 'D+2' });
    renderComponent();
    expect(screen.getByText('정산주기')).toBeInTheDocument();
    expect(screen.getByText('D+2')).toBeInTheDocument();
  });

  it('currentSettlementCycle이 없으면 정산주기 행을 미입력으로 표시한다', () => {
    useRfpDraftStore.setState({ currentSettlementCycle: '' });
    renderComponent();
    expect(screen.getByText('정산주기')).toBeInTheDocument();
    expect(screen.getAllByText('미입력').length).toBeGreaterThan(0);
  });

  it('deliveryServicePeriod가 있으면 배송 및 서비스 기간 행을 표시한다', () => {
    useRfpDraftStore.setState({ deliveryServicePeriod: '3~5일' });
    renderComponent();
    expect(screen.getByText('배송 및 서비스 기간')).toBeInTheDocument();
    expect(screen.getByText('3~5일')).toBeInTheDocument();
  });

  it('deliveryServicePeriod가 없으면 배송 및 서비스 기간 행을 미입력으로 표시한다', () => {
    useRfpDraftStore.setState({ deliveryServicePeriod: '' });
    renderComponent();
    expect(screen.getByText('배송 및 서비스 기간')).toBeInTheDocument();
    expect(screen.getAllByText('미입력').length).toBeGreaterThan(0);
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

  it('현재 카드 수수료를 PG 비공개로 설정하면 요약에 비공개 표시가 나온다', () => {
    useRfpDraftStore.setState({ currentFeeRate: '3.4%', currentFeeVisibleToPg: false });
    renderComponent();
    expect(screen.getByText(/PG 비공개/)).toBeInTheDocument();
  });

  it('현재 카드 수수료가 PG 공개면 비공개 표시가 없다', () => {
    useRfpDraftStore.setState({ currentFeeRate: '3.4%', currentFeeVisibleToPg: true });
    renderComponent();
    expect(screen.queryByText(/PG 비공개/)).not.toBeInTheDocument();
  });

  it('숫자만 저장된 신규 값을 요약에서 표기형식(%·한국어 금액)으로 보여준다', () => {
    useRfpDraftStore.setState({
      currentFeeRate: '3.4',
      currentSettlementLimit: '100000000',
      currentGuaranteeInsurance: '30000000',
    });
    renderComponent();
    expect(screen.getByText('3.4%')).toBeInTheDocument();
    expect(screen.getByText('1억원')).toBeInTheDocument();
    expect(screen.getByText('3,000만원')).toBeInTheDocument();
  });

  it('현재 솔루션이 없으면 현재 솔루션 행을 미입력으로 표시한다', () => {
    useRfpDraftStore.setState({ currentSolution: '' });
    renderComponent();
    expect(screen.getByText('현재 솔루션')).toBeInTheDocument();
    expect(screen.getAllByText('미입력').length).toBeGreaterThan(0);
  });

  it('견적 유형(contractType)이 신규면 신규 계약을 표시한다', () => {
    useRfpDraftStore.setState({ contractType: 'new' });
    renderComponent();
    expect(screen.getByText('견적 유형')).toBeInTheDocument();
    expect(screen.getByText('신규 계약')).toBeInTheDocument();
  });

  it('견적 유형(contractType)이 갱신이면 갱신 계약을 표시한다', () => {
    useRfpDraftStore.setState({ contractType: 'renewal' });
    renderComponent();
    expect(screen.getByText('견적 유형')).toBeInTheDocument();
    expect(screen.getByText('갱신 계약')).toBeInTheDocument();
  });

  it('견적 유형(contractType)이 없으면 견적 유형 행을 미입력으로 표시한다', () => {
    useRfpDraftStore.setState({ contractType: null });
    renderComponent();
    expect(screen.getByText('견적 유형')).toBeInTheDocument();
    expect(screen.getAllByText('미입력').length).toBeGreaterThan(0);
  });

  it('입력하지 않은 항목(상호명 등)은 요약에서 미입력으로 노출된다', () => {
    // workspaceName / bizProfile 미전달 → 상호명·사업자번호 행은 미입력으로 표시
    renderComponent();
    expect(screen.getByText('상호명')).toBeInTheDocument();
    expect(screen.getByText('사업자번호')).toBeInTheDocument();
    expect(screen.getAllByText('미입력').length).toBeGreaterThan(0);
  });

  describe('신규 계약: 존재할 수 없는 PG 이력 행 숨김', () => {
    const HIDDEN_ROWS = ['연간 거래액', '카드 수수료', '월 정산한도', '보증보험', '정산주기'];

    it("contractType='new' 이면 5개 PG 이력 요약 행이 표시되지 않는다", () => {
      // 갱신에서 입력하다 신규로 전환한 stale 값이 남아 있어도 요약에 새면 안 된다
      useRfpDraftStore.setState({
        contractType: 'new',
        annualPgVolume: '10억',
        currentFeeRate: '3.4',
        currentSettlementLimit: '100000000',
        currentGuaranteeInsurance: '30000000',
        currentSettlementCycle: 'D+2',
      });
      renderComponent();
      for (const label of HIDDEN_ROWS) {
        expect(screen.queryByText(label)).not.toBeInTheDocument();
      }
      // stale 값도 요약에 노출되지 않는다 (서버가 strip 하므로)
      expect(screen.queryByText('3.4%')).not.toBeInTheDocument();
    });

    it("contractType='renewal' 이면 5개 PG 이력 요약 행이 표시된다", () => {
      useRfpDraftStore.setState({ contractType: 'renewal' });
      renderComponent();
      for (const label of HIDDEN_ROWS) {
        expect(screen.getByText(label)).toBeInTheDocument();
      }
    });

    it('배송 및 서비스 기간·현재 솔루션 행은 신규 계약에서도 유지된다', () => {
      useRfpDraftStore.setState({ contractType: 'new' });
      renderComponent();
      expect(screen.getByText('배송 및 서비스 기간')).toBeInTheDocument();
      expect(screen.getByText('현재 솔루션')).toBeInTheDocument();
    });
  });

  describe('마감일 필수 마커', () => {
    it('마감일 비어있으면 RequiredMark가 "필수"를 표시한다', () => {
      // deadline: '' (resetStore 기본값)
      renderComponent({ showFieldErrors: true });
      const chips = screen.getAllByText('필수');
      expect(chips.length).toBeGreaterThan(0);
    });

    it('마감일이 있으면 RequiredMark가 "입력 완료"를 표시한다', () => {
      useRfpDraftStore.setState({ deadline: '2026-06-30T23:59:59Z' });
      renderComponent({ showFieldErrors: true });
      expect(screen.getByText('입력 완료')).toBeInTheDocument();
    });
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
