// components/rfp/__tests__/RfpStep4Review.test.tsx
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RfpStep4Review } from '../RfpStep4Review';
import { useRfpDraftStore } from '@/lib/stores/rfp-draft';
vi.mock('@/lib/features/open-board', () => ({ OPEN_BOARD_ENABLED: true }));
const getCalendar = vi.hoisted(() => vi.fn());
vi.mock('@/lib/server/actions/rfp/getBusinessCalendarAction', () => ({ getBusinessCalendarAction: getCalendar }));

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
      pgList={[
        { id: 'pg-1', name: '나이스페이먼츠', displayName: '나이스페이먼츠', logoUpdatedAt: '2026-01-01T00:00:00.000Z' },
        { id: 'pg-2', name: 'KG이니시스', displayName: 'KG이니시스', logoUpdatedAt: null },
      ]}
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
    deadlineChoice: { mode: 'period', days: 5 },
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
  beforeEach(() => { resetStore(); getCalendar.mockReset().mockResolvedValue({ enabled: true, coveredFrom: '2026-01-01', coveredThrough: '2027-12-31', holidays: [], version: 'test' }); });

  it('랜딩과 튜토리얼 샘플은 서버 달력 액션을 호출하지 않는다', () => {
    render(<RfpStep4Review sampleMode pgList={[]} onBack={vi.fn()} onSubmit={vi.fn().mockResolvedValue(undefined)} submitting={false} serverError="" />);
    expect(getCalendar).not.toHaveBeenCalled();
  });

  it('마감 기간을 고르고 오후 6시 마감을 초안에 저장한다', async () => {
    const user = userEvent.setup();
    renderComponent();
    await user.click(await screen.findByRole('button', { name: '3영업일' }));
    expect(useRfpDraftStore.getState().deadline).toMatch(/T09:00:00.000Z$/);
    expect(useRfpDraftStore.getState().deadlineChoice).toEqual({ mode: 'period', days: 3 });
    expect(screen.getByText(/오후 6시/)).toBeInTheDocument();
  });

  it('저장된 직접 선택 날짜가 최소 3영업일보다 이르면 발송을 막는다', async () => {
    useRfpDraftStore.setState({ deadline: '2020-01-01T09:00:00.000Z', deadlineChoice: { mode: 'date' } });
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    renderComponent({ onSubmit });
    await screen.findByRole('group', { name: '영업일 기간' });
    await userEvent.setup().click(screen.getByRole('button', { name: /보내기/ }));
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('최종 확인에서 PG를 직접 고르고 보낼 수 있다', async () => {
    const user = userEvent.setup();
    useRfpDraftStore.setState({ allowedPgWorkspaceIds: [] });
    render(
      <RfpStep4Review
        pgList={[{ id: 'pg-1', name: '나이스페이먼츠', displayName: '나이스페이먼츠', logoUpdatedAt: null }]}
        onBack={vi.fn()}
        onSubmit={vi.fn().mockResolvedValue(undefined)}
        submitting={false}
        serverError=""
      />,
    );
    await user.click(screen.getByRole('button', { name: '나이스페이먼츠' }));
    expect(useRfpDraftStore.getState().allowedPgWorkspaceIds.map((pg) => pg.id)).toEqual(['pg-1']);
    expect(screen.getByRole('button', { name: '1개 PG사에 보내기' })).toBeInTheDocument();
  });

  it('마감일이 없어도 발송 버튼은 비활성화되지 않는다 (미충족 안내는 클릭 시 토스트로)', () => {
    renderComponent();
    expect(screen.getByRole('button', { name: /보내기/ })).not.toBeDisabled();
  });

  it('달력에서 기본 마감일을 확인한 뒤 발송 버튼 클릭 시 onSubmit이 호출된다', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    renderComponent({ onSubmit });
    await waitFor(() => expect(useRfpDraftStore.getState().deadline).toMatch(/T09:00:00.000Z$/));
    await waitFor(() => expect(screen.getByRole('button', { name: /날짜 선택/ })).toBeInTheDocument());
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

  it('지난 마감일이 남아 있으면 발송 버튼을 눌러도 제출하지 않는다', async () => {
    useRfpDraftStore.setState({ deadline: '2026-06-30T23:59:59Z' });
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    renderComponent({ onSubmit });
    await user.click(screen.getByRole('button', { name: '2개 PG사에 보내기' }));
    expect(onSubmit).not.toHaveBeenCalled();
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

  it('자체 개발 솔루션 상세를 상세 화면과 같은 형식으로 표시한다', () => {
    useRfpDraftStore.setState({
      currentSolution: 'self',
      currentSolutionDetail: '델비 독립몰',
    });
    renderComponent();
    expect(screen.getByText('자체 개발 (델비 독립몰)')).toBeInTheDocument();
  });

  it('기본·커스텀 결제수단을 상세 화면과 같은 구분자로 표시한다', () => {
    useRfpDraftStore.setState({
      requiredPaymentMethods: ['card', 'bank_transfer'],
      customPaymentMethods: [{ label: '포인트결제' }],
    });
    renderComponent();
    expect(screen.getByText('카드 · 계좌이체 · 포인트결제')).toBeInTheDocument();
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

    it('기본 5영업일을 받은 뒤 발송하면 마감일 미설정 오류가 없다', async () => {
      const user = userEvent.setup();
      renderComponent();
      await screen.findByRole('group', { name: '영업일 기간' });
      await user.click(screen.getByRole('button', { name: /보내기/ }));
      expect(screen.queryByText('마감일을 선택해주세요')).not.toBeInTheDocument();
    });

    it('showFieldErrors=true 이면 발송 클릭 없이도 마감일 미설정 에러가 표시된다', () => {
      renderComponent({ showFieldErrors: true });
      expect(screen.getByText('마감일을 선택해주세요')).toBeInTheDocument();
    });
  });
});

it('보내기 전 판매 정보와 선택 질문의 미입력을 확인할 수 있다', () => {
  resetStore();
  useRfpDraftStore.setState({ productInfo: { cashConvertible: false, maximumPrice: 'under_100k', salesMethods: ['none'] } });
  renderComponent();
  expect(screen.getByText('환금성 상품')).toBeInTheDocument();
  expect(screen.getByText('10만원 미만')).toBeInTheDocument();
  expect(screen.getByText('해당 없음')).toBeInTheDocument();
  expect(screen.getByText('입점 판매자').parentElement).toHaveTextContent('미입력');
});
